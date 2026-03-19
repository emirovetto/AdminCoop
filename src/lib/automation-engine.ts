import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditDetail = Record<string, unknown> | null | undefined;

async function logAuditEvent(input: {
  actorId?: number | null;
  modulo: string;
  accion: string;
  entidadTipo: string;
  entidadId?: number | null;
  descripcion: string;
  detalle?: AuditDetail;
}) {
  await prisma.auditoria.create({
    data: {
      actorId: input.actorId ?? null,
      modulo: input.modulo,
      accion: input.accion,
      entidadTipo: input.entidadTipo,
      entidadId: input.entidadId ?? null,
      descripcion: input.descripcion,
      detalleJson: input.detalle ? JSON.stringify(input.detalle) : null,
    },
  });
}

async function getSystemUserId() {
  const user = await prisma.usuario.findFirst({
    where: {
      activo: true,
      rol: {
        in: ["ADMIN", "CAJA"],
      },
    },
    orderBy: [{ rol: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  if (!user) {
    throw new Error("No hay usuario interno disponible para registrar pagos automáticos.");
  }

  return user.id;
}

async function getNextReceiptNumber(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `REC-${year}${month}`;
  const samePeriodReceipts = await prisma.pago.count({
    where: {
      numeroRecibo: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}-${String(samePeriodReceipts + 1).padStart(4, "0")}`;
}

function getInvoiceStatusByBalance(
  total: Prisma.Decimal,
  credited: Prisma.Decimal,
  fechaVencimiento: Date,
  referenceDate = new Date(),
) {
  if (credited.greaterThanOrEqualTo(total)) {
    return "PAGADA";
  }

  return fechaVencimiento < referenceDate ? "VENCIDA" : "PENDIENTE";
}

async function getAutomationRule() {
  const rule = await prisma.reglaAutomatizacion.findUnique({
    where: { codigo: "COBRANZA_BASE" },
  });

  if (!rule) {
    throw new Error("No existe la regla base de automatización.");
  }

  return rule;
}

function evaluateCutAutomation(input: {
  facturasVencidas: Array<{ fechaVencimiento: Date; total: Prisma.Decimal | number }>;
  promesaVigente: boolean;
  acuerdoVigente: boolean;
  deudaVencida: Prisma.Decimal;
  rule: {
    activa?: boolean;
    minFacturasVencidasParaCorte: number;
    diasGraciaCorte: number;
    montoMinimoCorte: Prisma.Decimal | number;
    bloquearConPromesaVigente: boolean;
    bloquearConAcuerdoVigente: boolean;
  };
}) {
  if (input.rule.activa === false) {
    return { allowed: true, reasons: [] as string[] };
  }

  const reasons: string[] = [];
  const now = new Date();
  const oldestDue = input.facturasVencidas
    .slice()
    .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())[0];
  const minAmount = new Prisma.Decimal(input.rule.montoMinimoCorte.toString());

  if (input.facturasVencidas.length < input.rule.minFacturasVencidasParaCorte) {
    reasons.push("No alcanza la cantidad mínima de facturas vencidas.");
  }

  if (input.deudaVencida.lessThan(minAmount)) {
    reasons.push("La deuda vencida no alcanza el mínimo configurado.");
  }

  if (input.rule.bloquearConPromesaVigente && input.promesaVigente) {
    reasons.push("Existe una promesa vigente.");
  }

  if (input.rule.bloquearConAcuerdoVigente && input.acuerdoVigente) {
    reasons.push("Existe un acuerdo vigente.");
  }

  if (oldestDue) {
    const graceBoundary = new Date(oldestDue.fechaVencimiento);
    graceBoundary.setDate(graceBoundary.getDate() + input.rule.diasGraciaCorte);
    if (graceBoundary > now) {
      reasons.push("Aún no venció la gracia de corte.");
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

async function registerPaymentInAccount(input: {
  abonadoId: number;
  usuarioId: number;
  medioPago: string;
  importe: Prisma.Decimal;
  fecha: Date;
  descripcion: string;
  pagoExternoId?: number | null;
}) {
  const numeroRecibo = await getNextReceiptNumber(input.fecha);

  return prisma.$transaction(async (tx) => {
    const latestMovement = await tx.cuentaCorriente.findFirst({
      where: { abonadoId: input.abonadoId },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      select: { saldo: true },
    });

    const saldoActual = latestMovement
      ? new Prisma.Decimal(latestMovement.saldo.toString())
      : new Prisma.Decimal(0);

    const facturasAbiertas = await tx.factura.findMany({
      where: { abonadoId: input.abonadoId, estado: { in: ["PENDIENTE", "VENCIDA"] } },
      include: {
        movimientos: {
          where: { tipo: "CREDITO", anuladoAt: null },
          select: { importe: true },
        },
      },
      orderBy: [{ fechaVencimiento: "asc" }, { fechaEmision: "asc" }, { id: "asc" }],
    });

    const pago = await tx.pago.create({
      data: {
        abonadoId: input.abonadoId,
        numeroRecibo,
        usuarioId: input.usuarioId,
        medioPago: input.medioPago,
        importe: input.importe,
        fecha: input.fecha,
        estado: "REGISTRADO",
        pagoExternoId: input.pagoExternoId ?? null,
      },
    });

    let saldoCorriente = saldoActual;
    let remaining = input.importe;

    for (const factura of facturasAbiertas) {
      if (remaining.lessThanOrEqualTo(new Prisma.Decimal(0))) {
        break;
      }

      const creditoAplicado = factura.movimientos.reduce(
        (sum, movimiento) => sum.add(new Prisma.Decimal(movimiento.importe.toString())),
        new Prisma.Decimal(0),
      );
      const totalFactura = new Prisma.Decimal(factura.total.toString());
      const saldoFactura = totalFactura.sub(creditoAplicado);

      if (saldoFactura.lessThanOrEqualTo(new Prisma.Decimal(0))) {
        continue;
      }

      const importeAplicado = remaining.lessThan(saldoFactura) ? remaining : saldoFactura;
      saldoCorriente = saldoCorriente.sub(importeAplicado);

      await tx.cuentaCorriente.create({
        data: {
          abonadoId: input.abonadoId,
          facturaId: factura.id,
          pagoId: pago.id,
          tipo: "CREDITO",
          importe: importeAplicado,
          saldo: saldoCorriente,
          fecha: input.fecha,
          descripcion: `${numeroRecibo} - ${input.descripcion} - aplicado a ${factura.numero}`,
        },
      });

      const creditedAfterPayment = creditoAplicado.add(importeAplicado);
      await tx.factura.update({
        where: { id: factura.id },
        data: {
          estado: getInvoiceStatusByBalance(
            totalFactura,
            creditedAfterPayment,
            factura.fechaVencimiento,
            new Date(),
          ),
        },
      });

      remaining = remaining.sub(importeAplicado);
    }

    if (remaining.greaterThan(new Prisma.Decimal(0))) {
      saldoCorriente = saldoCorriente.sub(remaining);

      await tx.cuentaCorriente.create({
        data: {
          abonadoId: input.abonadoId,
          facturaId: null,
          pagoId: pago.id,
          tipo: "CREDITO",
          importe: remaining,
          saldo: saldoCorriente,
          fecha: input.fecha,
          descripcion: `${numeroRecibo} - ${input.descripcion} - saldo a favor`,
        },
      });
    }

    return { pagoId: pago.id, numeroRecibo };
  });
}

async function createReconnectionOrdersForAbonado(input: {
  abonadoId: number;
  actorId?: number | null;
  motivo: string;
}) {
  return prisma.$transaction(async (tx) => {
    const suspendedServices = await tx.servicio.findMany({
      where: {
        abonadoId: input.abonadoId,
        estado: "SUSPENDIDO",
        ordenesTrabajo: {
          none: {
            tipo: "RECONEXION",
            estado: { in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"] },
          },
        },
      },
      include: {
        servicioCatalogo: {
          select: { nombre: true },
        },
      },
    });

    const created = [];
    for (const servicio of suspendedServices) {
      const orden = await tx.ordenTrabajo.create({
        data: {
          abonadoId: input.abonadoId,
          servicioId: servicio.id,
          tipo: "RECONEXION",
          estado: "PENDIENTE",
          motivo: input.motivo,
          detalle: `${servicio.servicioCatalogo?.nombre ?? servicio.plan}${servicio.numeroContrato ? ` / Contrato ${servicio.numeroContrato}` : ""}`,
          cargoFacturable: false,
        },
      });
      created.push(orden);
    }

    if (created.length > 0) {
      await logAuditEvent({
        actorId: input.actorId ?? null,
        modulo: "AUTOMATIZACIONES",
        accion: "CREATE_RECONNECTION_ORDERS",
        entidadTipo: "ORDEN_TRABAJO",
        descripcion: `Se generaron ${created.length} ordenes de reconexion.`,
        detalle: {
          abonadoId: input.abonadoId,
          ordenes: created.map((item) => item.id),
        },
      });
    }

    return created;
  });
}

export function getAutomationApiToken() {
  return process.env.AUTOMATION_API_TOKEN || process.env.AUTH_SECRET || "dev-secret-change-me";
}

export function verifyAutomationToken(token: string | null | undefined) {
  return Boolean(token) && token === getAutomationApiToken();
}

export async function finalizeExternalPayment(input: {
  pagoExternoId: number;
  estado: string;
  referenciaExterna?: string | null;
  notasInternas?: string | null;
  actorId?: number | null;
}) {
  const current = await prisma.pagoExterno.findUnique({
    where: { id: input.pagoExternoId },
    include: {
      pasarela: true,
      pago: true,
      abonado: true,
    },
  });

  if (!current) {
    throw new Error("Pago externo no encontrado.");
  }

  const actorId = input.actorId ?? (await getSystemUserId());
  let numeroRecibo: string | null = null;
  let reconnectionOrders = 0;
  const regla = await getAutomationRule();

  await prisma.pagoExterno.update({
    where: { id: input.pagoExternoId },
    data: {
      estado: input.estado,
      referenciaExterna: input.referenciaExterna,
      notasInternas: input.notasInternas,
      confirmadoAt: input.estado === "ACREDITADO" ? new Date() : null,
      conciliadoAt: input.estado === "ACREDITADO" ? new Date() : null,
    },
  });

  if (input.estado === "ACREDITADO" && !current.pago) {
    const registered = await registerPaymentInAccount({
      abonadoId: current.abonadoId,
      usuarioId: actorId,
      medioPago: `PASARELA_${current.pasarela.codigo}`,
      importe: new Prisma.Decimal(current.importe.toString()),
      fecha: new Date(),
      descripcion: `Pago online acreditado ${current.referenciaInterna}`,
      pagoExternoId: current.id,
    });
    numeroRecibo = registered.numeroRecibo;

    const facturasAbiertas = await prisma.factura.count({
      where: {
        abonadoId: current.abonadoId,
        estado: { in: ["PENDIENTE", "VENCIDA"] },
      },
    });

    const canReconnect =
      regla.activa &&
      current.pasarela.permiteReconexionAutomatica &&
      regla.generarOrdenReconexionAutomatica &&
      (regla.reactivarConPagoConfirmado ||
        (regla.reactivarConSaldoCero && facturasAbiertas === 0));

    if (canReconnect) {
      const created = await createReconnectionOrdersForAbonado({
        abonadoId: current.abonadoId,
        actorId,
        motivo: `Reconexion automatica por pago acreditado ${current.referenciaInterna}`,
      });
      reconnectionOrders = created.length;
    }
  }

  await logAuditEvent({
    actorId,
    modulo: "PASARELAS",
    accion: "CONFIRM_PAYMENT",
    entidadTipo: "PAGO_EXTERNO",
    entidadId: input.pagoExternoId,
    descripcion: `Actualizacion de pago online a ${input.estado}.`,
    detalle: {
      referenciaExterna: input.referenciaExterna,
      numeroRecibo,
      reconnectionOrders,
    },
  });

  return {
    numeroRecibo,
    reconnectionOrders,
    abonadoId: current.abonadoId,
  };
}

export async function runAutomationCycle(origen = "API", actorId?: number | null) {
  const regla = await getAutomationRule();
  const detail: Record<string, unknown> = {};
  let cortesGenerados = 0;
  let reconexionesGeneradas = 0;

  if (!regla.activa) {
    const ejecucion = await prisma.ejecucionAutomatizacion.create({
      data: {
        codigo: regla.codigo,
        origen,
        estado: "SKIPPED",
        resumen: "La regla base esta desactivada; no se ejecutaron automatizaciones.",
        detalleJson: JSON.stringify({ actorId: actorId ?? null }),
      },
    });

    return {
      ejecucionId: ejecucion.id,
      estado: "SKIPPED",
      cortesGenerados,
      reconexionesGeneradas,
    };
  }

  if (regla.generarOrdenCorteAutomatica) {
    const candidatosCorte = await prisma.abonado.findMany({
      where: {
        servicios: {
          some: {
            estado: "ACTIVO",
          },
        },
        facturas: {
          some: {
            estado: "VENCIDA",
          },
        },
      },
      include: {
        servicios: {
          where: { estado: "ACTIVO" },
          include: {
            servicioCatalogo: { select: { nombre: true } },
            ordenesTrabajo: {
              where: {
                tipo: "CORTE",
                estado: { in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"] },
              },
              select: { id: true },
            },
          },
        },
        facturas: {
          where: { estado: "VENCIDA" },
          select: {
            total: true,
            fechaVencimiento: true,
          },
        },
        gestionesCobranza: {
          where: { estado: "PROMESA_VIGENTE" },
          select: { id: true },
        },
        acuerdosPago: {
          where: { estado: "VIGENTE" },
          select: { id: true },
        },
      },
    });

    for (const abonado of candidatosCorte) {
      const serviciosObjetivo = abonado.servicios.filter((servicio) => servicio.ordenesTrabajo.length === 0);
      if (serviciosObjetivo.length === 0) {
        continue;
      }

      const deudaVencida = abonado.facturas.reduce(
        (sum, factura) => sum.add(new Prisma.Decimal(factura.total.toString())),
        new Prisma.Decimal(0),
      );
      const evaluacion = evaluateCutAutomation({
        facturasVencidas: abonado.facturas,
        promesaVigente: abonado.gestionesCobranza.length > 0,
        acuerdoVigente: abonado.acuerdosPago.length > 0,
        deudaVencida,
        rule: regla,
      });

      if (!evaluacion.allowed) {
        continue;
      }

      const ordenes = await prisma.$transaction(
        serviciosObjetivo.map((servicio) =>
          prisma.ordenTrabajo.create({
            data: {
              abonadoId: abonado.id,
              servicioId: servicio.id,
              tipo: "CORTE",
              estado: "PENDIENTE",
              motivo: "Corte automatico por mora desde motor de automatizaciones",
              detalle: `Deuda vencida ${deudaVencida.toString()} / ${servicio.servicioCatalogo?.nombre ?? servicio.plan}${servicio.numeroContrato ? ` / Contrato ${servicio.numeroContrato}` : ""}`,
              cargoFacturable: false,
            },
          }),
        ),
      );
      cortesGenerados += ordenes.length;
    }
  }

  if (regla.generarOrdenReconexionAutomatica) {
    const abonadosReconexion = await prisma.abonado.findMany({
      where: {
        servicios: {
          some: { estado: "SUSPENDIDO" },
        },
        pagosExternos: {
          some: { estado: "ACREDITADO" },
        },
      },
      select: {
        id: true,
        facturas: {
          where: { estado: { in: ["PENDIENTE", "VENCIDA"] } },
          select: { id: true },
        },
        pagosExternos: {
          where: { estado: "ACREDITADO" },
          take: 1,
          select: { id: true },
        },
      },
    });

    for (const abonado of abonadosReconexion) {
      const canReconnect =
        (regla.reactivarConSaldoCero && abonado.facturas.length === 0) ||
        (regla.reactivarConPagoConfirmado && abonado.pagosExternos.length > 0);

      if (!canReconnect) {
        continue;
      }

      const created = await createReconnectionOrdersForAbonado({
        abonadoId: abonado.id,
        actorId,
        motivo: "Reconexion automatica desde motor de automatizaciones",
      });
      reconexionesGeneradas += created.length;
    }
  }

  detail.regla = regla.codigo;
  detail.actorId = actorId ?? null;
  detail.cortesGenerados = cortesGenerados;
  detail.reconexionesGeneradas = reconexionesGeneradas;

  const ejecucion = await prisma.ejecucionAutomatizacion.create({
      data: {
        codigo: regla.codigo,
        origen,
      estado: "OK",
      resumen: `Ciclo ejecutado. Cortes ${cortesGenerados}, reconexiones ${reconexionesGeneradas}.`,
      cortesGenerados,
      reconexionesGeneradas,
      pagosConciliados: 0,
      detalleJson: JSON.stringify(detail),
    },
  });

  await logAuditEvent({
    actorId: actorId ?? null,
    modulo: "AUTOMATIZACIONES",
    accion: "RUN_CYCLE",
    entidadTipo: "EJECUCION_AUTOMATIZACION",
    entidadId: ejecucion.id,
    descripcion: "Ejecucion del ciclo de automatizaciones.",
    detalle: detail,
  });

  return {
    ejecucionId: ejecucion.id,
    estado: "OK",
    cortesGenerados,
    reconexionesGeneradas,
  };
}
