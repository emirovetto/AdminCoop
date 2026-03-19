import { Prisma } from "@prisma/client";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCIES,
  ARCA_DOCUMENT_TYPES,
  ARCA_ENVIRONMENTS,
  ARCA_INVOICE_TYPES,
  ARCA_RESULT_STATES,
  ARCA_WS_SERVICES,
  COLLECTION_CHANNELS,
  COLLECTION_OUTCOMES,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_PRIORITIES,
  COMMUNICATION_STATES,
  COMMUNICATION_TYPES,
  DEFAULT_SERVICE_CATALOG,
  EXTERNAL_PAYMENT_STATES,
  IVA_CONDITIONS,
  PAYMENT_GATEWAY_MODES,
  PAYMENT_GATEWAY_PROVIDERS,
  PAYMENT_METHODS,
  PORTAL_PUBLICATION_CATEGORIES,
  PORTAL_PUBLICATION_STATES,
  TICKET_PRIORITIES,
  WEBHOOK_EVENT_STATES,
  WORK_ORDER_STATES,
  WORK_ORDER_TYPES,
} from "@/lib/domain";
import { buildFacturaArcaPrecheck } from "@/lib/arca";
import { prisma } from "@/lib/prisma";
import { getCurrentBillingPeriodLabel, getMonthBounds } from "@/lib/utils";

function toNumber(value: { toNumber(): number } | number) {
  return typeof value === "number" ? value : value.toNumber();
}

function textSearch(query: string) {
  return query.trim();
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

async function syncInvoiceStatuses(referenceDate = new Date()) {
  const facturasAbiertas = await prisma.factura.findMany({
    where: {
      estado: {
        in: ["PENDIENTE", "VENCIDA"],
      },
    },
    include: {
      movimientos: {
        where: {
          tipo: "CREDITO",
          anuladoAt: null,
        },
        select: {
          importe: true,
        },
      },
    },
  });

  for (const factura of facturasAbiertas) {
    const creditoAplicado = factura.movimientos.reduce((sum, movimiento) => sum + toNumber(movimiento.importe), 0);
    const totalFactura = toNumber(factura.total);
    const nextStatus =
      creditoAplicado >= totalFactura
        ? "PAGADA"
        : factura.fechaVencimiento < referenceDate
          ? "VENCIDA"
          : "PENDIENTE";

    if (factura.estado !== nextStatus) {
      await prisma.factura.update({
        where: { id: factura.id },
        data: { estado: nextStatus },
      });
    }
  }
}

export type AbonadoFilters = {
  q?: string;
  estado?: string;
  localidad?: string;
  provincia?: string;
  condicionIva?: string;
  telefono?: string;
  email?: string;
  documento?: string;
  servicio?: string;
  servicioCatalogoId?: string;
  estadoServicio?: string;
  esSocio?: string;
  deuda?: string;
  reclamos?: string;
  ordenes?: string;
};

export type ReclamoFilters = {
  q?: string;
  estado?: string;
  prioridad?: string;
  tecnicoId?: string;
  abonadoId?: string;
  tipoServicio?: string;
  localidad?: string;
  cargoFacturable?: string;
  desde?: string;
  hasta?: string;
};

export type FacturacionFilters = {
  q?: string;
  estado?: string;
  medioPago?: string;
  abonadoId?: string;
  localidad?: string;
  condicionIva?: string;
  servicioCatalogoId?: string;
  desde?: string;
  hasta?: string;
};

export type CuentaCorrienteFilters = {
  q?: string;
  abonadoId?: string;
  tipo?: string;
  localidad?: string;
  condicionIva?: string;
  vigencia?: string;
  desde?: string;
  hasta?: string;
};

export type ComunicacionFilters = {
  q?: string;
  abonadoId?: string;
  canal?: string;
  tipo?: string;
  estado?: string;
  oficinaVirtual?: string;
  desde?: string;
  hasta?: string;
};

export type PortalFilters = {
  q?: string;
  abonadoId?: string;
  categoria?: string;
  estado?: string;
  destacado?: string;
  desde?: string;
  hasta?: string;
};

export type StockFilters = {
  q?: string;
  categoria?: string;
  bajoStock?: string;
};

export type CompraFilters = {
  q?: string;
  proveedor?: string;
  proveedorId?: string;
  materialId?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
};

export type ReportFilters = {
  desde?: string;
  hasta?: string;
  localidad?: string;
  provincia?: string;
  servicio?: string;
  condicionIva?: string;
  deuda?: string;
  estadoFactura?: string;
  estadoReclamo?: string;
  tecnicoId?: string;
  cargoFacturable?: string;
  proveedor?: string;
};

export type AuditoriaFilters = {
  q?: string;
  modulo?: string;
  actorId?: string;
  desde?: string;
  hasta?: string;
};

export type CajaFilters = {
  fecha?: string;
};

export type ProveedorFilters = {
  q?: string;
  condicionIva?: string;
  activo?: string;
  localidad?: string;
};

export type OrdenTrabajoFilters = {
  q?: string;
  estado?: string;
  tipo?: string;
  tecnicoId?: string;
  abonadoId?: string;
  desde?: string;
  hasta?: string;
};

export type SeguimientoCobranzaFilters = {
  q?: string;
  localidad?: string;
  operadorId?: string;
  horizonte?: string;
};

export type AlertaOperativaFilters = {
  q?: string;
  categoria?: string;
  severidad?: string;
  horizonte?: string;
};

export async function ensureBillingDefaults() {
  const [config, catalogCount] = await Promise.all([
    prisma.configuracionFacturacion.findFirst(),
    prisma.servicioCatalogo.count(),
  ]);

  if (!config) {
    await prisma.configuracionFacturacion.create({
      data: {
        razonSocial: "Cooperativa de Servicios",
        cuit: "30-00000000-0",
        condicionIvaEmisor: "RESPONSABLE_INSCRIPTO",
        puntoVenta: "0001",
        provincia: "Formosa",
        ambienteArca: "HOMOLOGACION",
        arcaHabilitado: false,
        tipoComprobanteDefault: "011",
        conceptoArcaDefault: "2",
        monedaCodigoDefault: "PES",
        arcaWsService: "wsfe",
      },
    });
  }

  if (catalogCount === 0) {
    await prisma.servicioCatalogo.createMany({
      data: DEFAULT_SERVICE_CATALOG.map((service) => ({
        codigo: service.codigo,
        nombre: service.nombre,
        categoria: service.categoria,
        precioBase: service.precioBase,
        periodicidad: service.periodicidad,
        alicuotaIva: service.alicuotaIva,
        condicionIva: "GRAVADO",
        conceptoFacturado: "SERVICIO",
      })),
      skipDuplicates: true,
    });
  }
}

async function ensureAutomationDefaults() {
  const defaultRule = await prisma.reglaAutomatizacion.findUnique({
    where: { codigo: "COBRANZA_BASE" },
    select: { id: true },
  });

  if (!defaultRule) {
    await prisma.reglaAutomatizacion.create({
      data: {
        codigo: "COBRANZA_BASE",
        nombre: "Corte y reconexion base",
        activa: true,
        requierePagoAcreditado: true,
        minFacturasVencidasParaCorte: 1,
        diasGraciaCorte: 3,
        montoMinimoCorte: new Prisma.Decimal(1),
        bloquearConPromesaVigente: true,
        bloquearConAcuerdoVigente: true,
        reactivarConSaldoCero: true,
        reactivarConPagoConfirmado: true,
        generarOrdenCorteAutomatica: false,
        generarOrdenReconexionAutomatica: false,
        observaciones:
          "Regla inicial para cortar por mora con validaciones y reactivar solo ante pago acreditado o saldo saneado.",
      },
    });
  }
}

export async function getDashboardData() {
  await ensureBillingDefaults();
  await syncInvoiceStatuses();
  const { start, end } = getMonthBounds();
  const [
    sociosActivos,
    abonadosActivos,
    serviciosActivos,
    reclamosAbiertos,
    facturasPendientes,
    creditos,
    facturasMes,
    facturasVencidas,
    importacionesRecientes,
    serviciosConfigurados,
    materialesActivos,
    comprasMes,
    promesasVencidas,
    cuotasAcuerdoVencidas,
    proximasGestiones,
  ] = await Promise.all([
    prisma.socio.count({ where: { estado: "ACTIVO" } }),
    prisma.abonado.count({ where: { estado: "ACTIVO" } }),
    prisma.servicio.count({ where: { estado: "ACTIVO" } }),
    prisma.reclamo.count({ where: { estado: { not: "RESUELTO" } } }),
    prisma.factura.findMany({
      where: { estado: { not: "PAGADA" } },
      select: { total: true },
    }),
    prisma.cuentaCorriente.findMany({
      where: { tipo: "CREDITO" },
      select: { importe: true },
    }),
    prisma.factura.count({
      where: {
        fechaEmision: {
          gte: start,
          lt: end,
        },
      },
    }),
    prisma.factura.count({
      where: {
        estado: "VENCIDA",
      },
    }),
    prisma.importacion.count(),
    prisma.servicioCatalogo.count({ where: { activo: true } }),
    prisma.material.count({ where: { activo: true } }),
    prisma.compra.count({
      where: {
        fecha: {
          gte: start,
          lt: end,
        },
      },
    }),
    prisma.gestionCobranza.count({
      where: {
        estado: "PROMESA_VIGENTE",
        compromisoPagoAt: {
          lt: new Date(),
        },
      },
    }),
    prisma.acuerdoPagoCuota.count({
      where: {
        estado: "PENDIENTE",
        fechaVencimiento: {
          lt: new Date(),
        },
        acuerdoPago: {
          estado: "VIGENTE",
        },
      },
    }),
    prisma.gestionCobranza.count({
      where: {
        estado: {
          in: ["REGISTRADA", "PROMESA_VIGENTE"],
        },
        proximaGestionAt: {
          gte: start,
          lt: end,
        },
      },
    }),
  ]);

  return {
    sociosActivos,
    abonadosActivos,
    serviciosActivos,
    serviciosConfigurados,
    materialesActivos,
    comprasDelMes: comprasMes,
    reclamosAbiertos,
    facturacionPendiente: facturasPendientes.reduce((sum, item) => sum + toNumber(item.total), 0),
    cobranzaDelMes: creditos.reduce((sum, item) => sum + toNumber(item.importe), 0),
    facturasDelMes: facturasMes,
    facturasVencidas,
    importacionesRecientes,
    promesasVencidas,
    cuotasAcuerdoVencidas,
    proximasGestiones,
    cicloActual: getCurrentBillingPeriodLabel(),
    tasks: [
      {
        title: "Reportes y filtros operativos",
        detail: "Ya se amplio la base de consultas; falta seguir profundizando tableros y salidas cruzadas.",
        kind: "operativo",
      },
      {
        title: "Contrato, stock y compras",
        detail: "El siguiente cierre apunta a dejar completo el circuito entre servicios, reclamos y materiales.",
        kind: "siguiente",
      },
      {
        title: "Experiencia visual final",
        detail: "Todavia falta una direccion estetica mas fuerte y una interfaz mas distintiva.",
        kind: "bloqueante",
      },
    ] as const,
  };
}

export async function getSeguimientoCobranzaData(filters: SeguimientoCobranzaFilters = {}) {
  const query = textSearch(filters.q ?? "");
  const today = new Date();
  const horizonDays = Number.parseInt(filters.horizonte ?? "7", 10);
  const horizonDate = new Date(today);
  horizonDate.setDate(horizonDate.getDate() + (Number.isNaN(horizonDays) ? 7 : horizonDays));

  const abonadoScope: Prisma.AbonadoWhereInput = {};
  if (filters.localidad) {
    abonadoScope.localidad = { contains: filters.localidad.trim() };
  }

  if (query) {
    abonadoScope.OR = [
      { numeroAbonado: { contains: query } },
      { nombre: { contains: query } },
      { apellido: { contains: query } },
      { razonSocial: { contains: query } },
      { telefono: { contains: query } },
      { email: { contains: query } },
    ];
  }

  const operatorId = filters.operadorId ? Number.parseInt(filters.operadorId, 10) : NaN;
  const operadorFilter = Number.isNaN(operatorId) ? undefined : operatorId;

  const baseAbonadoFilter = Object.keys(abonadoScope).length > 0 ? { abonado: { is: abonadoScope } } : {};

  const [promesasVencidas, promesasPorVencer, proximasGestiones, cuotasVencidas, cuotasPorVencer, operadores, candidatosCorteRaw] =
    await Promise.all([
      prisma.gestionCobranza.findMany({
        where: {
          ...baseAbonadoFilter,
          ...(operadorFilter ? { usuarioId: operadorFilter } : {}),
          estado: "PROMESA_VIGENTE",
          compromisoPagoAt: {
            lt: today,
          },
        },
        include: {
          abonado: true,
          usuario: true,
          factura: {
            select: {
              id: true,
              numero: true,
            },
          },
        },
        orderBy: { compromisoPagoAt: "asc" },
      }),
      prisma.gestionCobranza.findMany({
        where: {
          ...baseAbonadoFilter,
          ...(operadorFilter ? { usuarioId: operadorFilter } : {}),
          estado: "PROMESA_VIGENTE",
          compromisoPagoAt: {
            gte: today,
            lte: horizonDate,
          },
        },
        include: {
          abonado: true,
          usuario: true,
          factura: {
            select: {
              id: true,
              numero: true,
            },
          },
        },
        orderBy: { compromisoPagoAt: "asc" },
      }),
      prisma.gestionCobranza.findMany({
        where: {
          ...baseAbonadoFilter,
          ...(operadorFilter ? { usuarioId: operadorFilter } : {}),
          estado: {
            in: ["REGISTRADA", "PROMESA_VIGENTE"],
          },
          proximaGestionAt: {
            gte: today,
            lte: horizonDate,
          },
        },
        include: {
          abonado: true,
          usuario: true,
          factura: {
            select: {
              id: true,
              numero: true,
            },
          },
        },
        orderBy: { proximaGestionAt: "asc" },
      }),
      prisma.acuerdoPagoCuota.findMany({
        where: {
          estado: "PENDIENTE",
          fechaVencimiento: {
            lt: today,
          },
          acuerdoPago: {
            estado: "VIGENTE",
            ...(operadorFilter ? { usuarioId: operadorFilter } : {}),
            ...(Object.keys(abonadoScope).length > 0 ? { abonado: { is: abonadoScope } } : {}),
          },
        },
        include: {
          acuerdoPago: {
            include: {
              abonado: true,
              usuario: true,
            },
          },
        },
        orderBy: { fechaVencimiento: "asc" },
      }),
      prisma.acuerdoPagoCuota.findMany({
        where: {
          estado: "PENDIENTE",
          fechaVencimiento: {
            gte: today,
            lte: horizonDate,
          },
          acuerdoPago: {
            estado: "VIGENTE",
            ...(operadorFilter ? { usuarioId: operadorFilter } : {}),
            ...(Object.keys(abonadoScope).length > 0 ? { abonado: { is: abonadoScope } } : {}),
          },
        },
        include: {
          acuerdoPago: {
            include: {
              abonado: true,
              usuario: true,
            },
          },
        },
        orderBy: { fechaVencimiento: "asc" },
      }),
      prisma.usuario.findMany({
        where: {
          activo: true,
          rol: {
            in: ["ADMIN", "CAJA"],
          },
        },
        orderBy: { nombre: "asc" },
        select: {
          id: true,
          nombre: true,
        },
      }),
      prisma.abonado.findMany({
        where: {
          ...(Object.keys(abonadoScope).length > 0 ? abonadoScope : {}),
          estado: {
            in: ["ACTIVO", "SUSPENDIDO"],
          },
          facturas: {
            some: {
              estado: "VENCIDA",
            },
          },
          servicios: {
            some: {
              estado: "ACTIVO",
            },
          },
        },
        include: {
          facturas: {
            where: {
              estado: "VENCIDA",
            },
            orderBy: { fechaVencimiento: "asc" },
            select: {
              id: true,
              numero: true,
              fechaVencimiento: true,
              total: true,
            },
          },
          servicios: {
            where: {
              estado: "ACTIVO",
            },
            include: {
              servicioCatalogo: true,
              ordenesTrabajo: {
                where: {
                  tipo: "CORTE",
                  estado: {
                    in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"],
                  },
                },
                select: {
                  id: true,
                  estado: true,
                },
              },
            },
            orderBy: [{ tipo: "asc" }, { plan: "asc" }],
          },
          gestionesCobranza: {
            where: {
              estado: "PROMESA_VIGENTE",
            },
            orderBy: { compromisoPagoAt: "asc" },
            take: 5,
            select: {
              id: true,
              compromisoPagoAt: true,
              compromisoImporte: true,
            },
          },
        },
        orderBy: [{ localidad: "asc" }, { numeroAbonado: "asc" }],
        take: 120,
      }),
    ]);

  const candidatosCorte = candidatosCorteRaw
    .map((abonado) => {
      const serviciosActivosSinCorte = abonado.servicios.filter(
        (servicio) => servicio.ordenesTrabajo.length === 0,
      );

      if (serviciosActivosSinCorte.length === 0) {
        return null;
      }

      return {
        ...abonado,
        serviciosActivosSinCorte,
        deudaVencida: abonado.facturas.reduce((sum, factura) => sum + toNumber(factura.total), 0),
        promesaVigente: abonado.gestionesCobranza.find(
          (gestion) => !gestion.compromisoPagoAt || gestion.compromisoPagoAt >= today,
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    promesasVencidas,
    promesasPorVencer,
    proximasGestiones,
    cuotasVencidas,
    cuotasPorVencer,
    operadores,
    candidatosCorte,
    summary: {
      promesasVencidas: promesasVencidas.length,
      promesasPorVencer: promesasPorVencer.length,
      proximasGestiones: proximasGestiones.length,
      cuotasVencidas: cuotasVencidas.length,
      cuotasPorVencer: cuotasPorVencer.length,
      candidatosCorte: candidatosCorte.length,
      montoPromesasVencidas: promesasVencidas.reduce(
        (sum, item) => sum + toNumber(item.compromisoImporte ?? 0),
        0,
      ),
      montoCuotasVencidas: cuotasVencidas.reduce((sum, item) => sum + toNumber(item.importe), 0),
    },
  };
}

export async function getAlertasOperativasData(filters: AlertaOperativaFilters = {}) {
  await ensureBillingDefaults();
  await syncInvoiceStatuses();

  const query = textSearch(filters.q ?? "").toLowerCase();
  const categoria = filters.categoria?.trim().toUpperCase() || "";
  const severidad = filters.severidad?.trim().toUpperCase() || "";
  const today = new Date();
  const horizonDays = Number.parseInt(filters.horizonte ?? "7", 10);
  const horizonDate = new Date(today);
  horizonDate.setDate(horizonDate.getDate() + (Number.isNaN(horizonDays) ? 7 : horizonDays));

  const [
    config,
    promesasVencidas,
    cuotasVencidas,
    materiales,
    reclamos,
    ordenes,
    facturasArca,
    candidatosCorteRaw,
  ] = await Promise.all([
    prisma.configuracionFacturacion.findFirst(),
    prisma.gestionCobranza.findMany({
      where: {
        estado: "PROMESA_VIGENTE",
        compromisoPagoAt: {
          lt: today,
        },
      },
      include: {
        abonado: true,
        usuario: true,
        factura: {
          select: {
            id: true,
            numero: true,
          },
        },
      },
      orderBy: { compromisoPagoAt: "asc" },
      take: 100,
    }),
    prisma.acuerdoPagoCuota.findMany({
      where: {
        estado: "PENDIENTE",
        fechaVencimiento: {
          lt: today,
        },
        acuerdoPago: {
          estado: "VIGENTE",
        },
      },
      include: {
        acuerdoPago: {
          include: {
            abonado: true,
            usuario: true,
          },
        },
      },
      orderBy: { fechaVencimiento: "asc" },
      take: 100,
    }),
    prisma.material.findMany({
      where: {
        activo: true,
      },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    }),
    prisma.reclamo.findMany({
      where: {
        estado: {
          in: ["ABIERTO", "EN_PROCESO"],
        },
      },
      include: {
        abonado: true,
        tecnico: true,
      },
      orderBy: { fechaApertura: "asc" },
      take: 120,
    }),
    prisma.ordenTrabajo.findMany({
      where: {
        estado: {
          in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"],
        },
      },
      include: {
        abonado: true,
        tecnico: true,
        servicio: {
          include: {
            servicioCatalogo: true,
          },
        },
        reclamo: true,
      },
      orderBy: [{ fechaProgramada: "asc" }, { createdAt: "asc" }],
      take: 120,
    }),
    prisma.factura.findMany({
      where: {
        resultadoArca: {
          in: ["NO_ENVIADA", "PENDIENTE", "RECHAZADA"],
        },
      },
      include: {
        abonado: true,
        detalles: true,
      },
      orderBy: [{ fechaEmision: "desc" }],
      take: 120,
    }),
    prisma.abonado.findMany({
      where: {
        estado: {
          in: ["ACTIVO", "SUSPENDIDO"],
        },
        facturas: {
          some: {
            estado: "VENCIDA",
          },
        },
        servicios: {
          some: {
            estado: "ACTIVO",
          },
        },
      },
      include: {
        facturas: {
          where: {
            estado: "VENCIDA",
          },
          orderBy: { fechaVencimiento: "asc" },
          select: {
            id: true,
            numero: true,
            fechaVencimiento: true,
            total: true,
          },
        },
        servicios: {
          where: {
            estado: "ACTIVO",
          },
          include: {
            servicioCatalogo: true,
            ordenesTrabajo: {
              where: {
                tipo: "CORTE",
                estado: {
                  in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"],
                },
              },
              select: {
                id: true,
                estado: true,
              },
            },
          },
          orderBy: [{ tipo: "asc" }, { plan: "asc" }],
        },
        gestionesCobranza: {
          where: {
            estado: "PROMESA_VIGENTE",
          },
          orderBy: { compromisoPagoAt: "asc" },
          take: 5,
          select: {
            id: true,
            compromisoPagoAt: true,
            compromisoImporte: true,
          },
        },
      },
      orderBy: [{ localidad: "asc" }, { numeroAbonado: "asc" }],
      take: 120,
    }),
  ]);

  const stockCritico = materiales
    .filter((material) => Number(material.stockActual) <= Number(material.stockMinimo))
    .map((material) => ({
      categoria: "STOCK" as const,
      severidad: Number(material.stockActual) <= 0 ? "CRITICA" as const : "ALTA" as const,
      material,
    }));

  const reclamosCriticos = reclamos
    .filter((reclamo) => {
      const openedDays = Math.floor(
        (today.getTime() - reclamo.fechaApertura.getTime()) / (1000 * 60 * 60 * 24),
      );
      return reclamo.prioridad === "ALTA" || openedDays >= 3;
    })
    .map((reclamo) => ({
      categoria: "RECLAMOS" as const,
      severidad:
        reclamo.prioridad === "ALTA" ? ("CRITICA" as const) : ("ALTA" as const),
      reclamo,
    }));

  const ordenesDemoradas = ordenes
    .filter((orden) => {
      if (orden.fechaProgramada) {
        return orden.fechaProgramada < today;
      }

      const ageDays = Math.floor(
        (today.getTime() - orden.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      return ageDays >= 2;
    })
    .map((orden) => ({
      categoria: "ORDENES" as const,
      severidad:
        orden.tipo === "INSTALACION" || orden.tipo === "CORTE"
          ? ("CRITICA" as const)
          : ("ALTA" as const),
      orden,
    }));

  const alertasArca = facturasArca
    .map((factura) => {
      const precheck = buildFacturaArcaPrecheck(
        {
          subtotal: Number(factura.subtotal),
          total: Number(factura.total),
          tipoComprobanteArca: factura.tipoComprobanteArca,
          conceptoArca: factura.conceptoArca,
          tipoDocumentoReceptor: factura.tipoDocumentoReceptor,
          numeroDocumentoReceptor: factura.numeroDocumentoReceptor,
          monedaCodigo: factura.monedaCodigo,
          puntoVentaArca: factura.puntoVentaArca,
          detallesCount: factura.detalles.length,
        },
        config,
      );

      return {
        categoria: "ARCA" as const,
        severidad:
          factura.resultadoArca === "RECHAZADA" || precheck.status === "OBSERVADA"
            ? ("CRITICA" as const)
            : ("MEDIA" as const),
        factura,
        precheck,
      };
    })
    .filter((item) => item.precheck.status === "OBSERVADA" || item.factura.resultadoArca === "RECHAZADA");

  const cobranzaPromesas = promesasVencidas.map((gestion) => ({
    categoria: "COBRANZAS" as const,
    severidad: "CRITICA" as const,
    gestion,
  }));

  const cobranzaCuotas = cuotasVencidas.map((cuota) => ({
    categoria: "COBRANZAS" as const,
    severidad: "ALTA" as const,
    cuota,
  }));

  const cobranzaCortes = candidatosCorteRaw
    .map((abonado) => {
      const serviciosActivosSinCorte = abonado.servicios.filter(
        (servicio) => servicio.ordenesTrabajo.length === 0,
      );

      if (serviciosActivosSinCorte.length === 0) {
        return null;
      }

      const promesaVigente = abonado.gestionesCobranza.find(
        (gestion) => !gestion.compromisoPagoAt || gestion.compromisoPagoAt >= today,
      );

      return {
        categoria: "COBRANZAS" as const,
        severidad: promesaVigente ? ("ALTA" as const) : ("CRITICA" as const),
        corte: {
          ...abonado,
          serviciosActivosSinCorte,
          deudaVencida: abonado.facturas.reduce((sum, factura) => sum + toNumber(factura.total), 0),
          promesaVigente,
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const allAlerts = [
    ...cobranzaPromesas,
    ...cobranzaCuotas,
    ...cobranzaCortes,
    ...stockCritico,
    ...reclamosCriticos,
    ...ordenesDemoradas,
    ...alertasArca,
  ];

  const filteredAlerts = allAlerts.filter((item) => {
    if (categoria && item.categoria !== categoria) {
      return false;
    }

    if (severidad && item.severidad !== severidad) {
      return false;
    }

    if (!query) {
      return true;
    }

    if ("gestion" in item) {
      const text = [
        item.gestion.abonado.numeroAbonado,
        item.gestion.abonado.nombre,
        item.gestion.abonado.apellido,
        item.gestion.abonado.razonSocial,
        item.gestion.factura?.numero,
        item.gestion.usuario.nombre,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    }

    if ("cuota" in item) {
      const text = [
        item.cuota.acuerdoPago.numero,
        item.cuota.acuerdoPago.abonado.numeroAbonado,
        item.cuota.acuerdoPago.abonado.nombre,
        item.cuota.acuerdoPago.abonado.apellido,
        item.cuota.acuerdoPago.abonado.razonSocial,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    }

    if ("corte" in item) {
      const text = [
        item.corte.numeroAbonado,
        item.corte.nombre,
        item.corte.apellido,
        item.corte.razonSocial,
        item.corte.localidad,
        item.corte.serviciosActivosSinCorte
          .map((servicio) => servicio.servicioCatalogo?.nombre ?? servicio.plan)
          .join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    }

    if ("material" in item) {
      const text = [item.material.codigo, item.material.nombre, item.material.categoria]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    }

    if ("reclamo" in item) {
      const text = [
        item.reclamo.abonado.numeroAbonado,
        item.reclamo.abonado.nombre,
        item.reclamo.abonado.apellido,
        item.reclamo.abonado.razonSocial,
        item.reclamo.tipoServicio,
        item.reclamo.descripcion,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    }

    if ("orden" in item) {
      const text = [
        item.orden.abonado.numeroAbonado,
        item.orden.abonado.nombre,
        item.orden.abonado.apellido,
        item.orden.abonado.razonSocial,
        item.orden.tipo,
        item.orden.servicio?.plan,
        item.orden.servicio?.servicioCatalogo?.nombre,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    }

    if ("factura" in item) {
      const text = [
        item.factura.numero,
        item.factura.abonado.numeroAbonado,
        item.factura.abonado.nombre,
        item.factura.abonado.apellido,
        item.factura.abonado.razonSocial,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    }

    return true;
  });

  return {
    promesasVencidas: cobranzaPromesas.filter((item) => filteredAlerts.includes(item)),
    cuotasVencidas: cobranzaCuotas.filter((item) => filteredAlerts.includes(item)),
    cortesMora: cobranzaCortes.filter((item) => filteredAlerts.includes(item)),
    stockCritico: stockCritico.filter((item) => filteredAlerts.includes(item)),
    reclamosCriticos: reclamosCriticos.filter((item) => filteredAlerts.includes(item)),
    ordenesDemoradas: ordenesDemoradas.filter((item) => filteredAlerts.includes(item)),
    alertasArca: alertasArca.filter((item) => filteredAlerts.includes(item)),
    summary: {
      total: filteredAlerts.length,
      criticas: filteredAlerts.filter((item) => item.severidad === "CRITICA").length,
      altas: filteredAlerts.filter((item) => item.severidad === "ALTA").length,
      medias: filteredAlerts.filter((item) => item.severidad === "MEDIA").length,
      categorias: {
        cobranzas: cobranzaPromesas.filter((item) => filteredAlerts.includes(item)).length +
          cobranzaCuotas.filter((item) => filteredAlerts.includes(item)).length +
          cobranzaCortes.filter((item) => filteredAlerts.includes(item)).length,
        stock: stockCritico.filter((item) => filteredAlerts.includes(item)).length,
        reclamos: reclamosCriticos.filter((item) => filteredAlerts.includes(item)).length,
        ordenes: ordenesDemoradas.filter((item) => filteredAlerts.includes(item)).length,
        arca: alertasArca.filter((item) => filteredAlerts.includes(item)).length,
      },
      horizonte: horizonDate,
    },
  };
}

function buildDateRange(desde?: string, hasta?: string) {
  const dateFrom = desde ? new Date(desde) : undefined;
  const dateTo = hasta ? new Date(`${hasta}T23:59:59`) : undefined;

  if (!dateFrom && !dateTo) {
    return undefined;
  }

  return {
    ...(dateFrom ? { gte: dateFrom } : {}),
    ...(dateTo ? { lte: dateTo } : {}),
  };
}

export async function getSociosData(search = "") {
  const query = textSearch(search);

  return prisma.socio.findMany({
    where: query
      ? {
          OR: [
            { nombre: { contains: query } },
            { apellido: { contains: query } },
            { dni: { contains: query } },
            { email: { contains: query } },
            { telefono: { contains: query } },
          ],
        }
      : undefined,
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
  });
}

export function buildAbonadoWhere(filters: AbonadoFilters = {}): Prisma.AbonadoWhereInput {
  const query = textSearch(filters.q ?? "");
  const where: Prisma.AbonadoWhereInput = {};
  const andConditions: Prisma.AbonadoWhereInput[] = [];

  if (query) {
    where.OR = [
      { numeroAbonado: { contains: query } },
      { nombre: { contains: query } },
      { apellido: { contains: query } },
      { razonSocial: { contains: query } },
      { documento: { contains: query } },
      { cuit: { contains: query } },
      { domicilio: { contains: query } },
      { localidad: { contains: query } },
      { email: { contains: query } },
      { telefono: { contains: query } },
      {
        socio: {
          is: {
            apellido: { contains: query },
          },
        },
      },
      {
        servicios: {
          some: {
            OR: [{ plan: { contains: query } }, { tipo: { contains: query } }],
          },
        },
      },
    ];
  }

  if (filters.estado) {
    where.estado = filters.estado;
  }

  if (filters.localidad) {
    where.localidad = { contains: filters.localidad.trim() };
  }

  if (filters.provincia) {
    where.provincia = { contains: filters.provincia.trim() };
  }

  if (filters.condicionIva) {
    where.condicionIva = filters.condicionIva;
  }

  if (filters.telefono) {
    where.telefono = { contains: filters.telefono.trim() };
  }

  if (filters.email) {
    where.email = { contains: filters.email.trim() };
  }

  if (filters.documento) {
    andConditions.push({
      OR: [
        { documento: { contains: filters.documento.trim() } },
        { cuit: { contains: filters.documento.trim() } },
      ],
    });
  }

  if (filters.esSocio === "SI") {
    where.esSocio = true;
  }

  if (filters.esSocio === "NO") {
    where.esSocio = false;
  }

  if (filters.servicio) {
    andConditions.push({
      servicios: {
        some: {
          OR: [
            { tipo: filters.servicio },
            { plan: { contains: filters.servicio.trim() } },
            {
              servicioCatalogo: {
                is: {
                  nombre: { contains: filters.servicio.trim() },
                },
              },
            },
          ],
        },
      },
    });
  }

  if (filters.servicioCatalogoId) {
    const servicioCatalogoId = Number.parseInt(filters.servicioCatalogoId, 10);
    if (!Number.isNaN(servicioCatalogoId)) {
      andConditions.push({
        servicios: {
          some: {
            servicioCatalogoId,
          },
        },
      });
    }
  }

  if (filters.estadoServicio) {
    andConditions.push({
      servicios: {
        some: {
          estado: filters.estadoServicio,
        },
      },
    });
  }

  if (filters.deuda === "CON_DEUDA") {
    andConditions.push({
      facturas: {
        some: {
          estado: {
            in: ["PENDIENTE", "VENCIDA"],
          },
        },
      },
    });
  }

  if (filters.reclamos === "ABIERTOS") {
    andConditions.push({
      reclamos: {
        some: {
          estado: { not: "RESUELTO" },
        },
      },
    });
  }

  if (filters.reclamos === "SIN_RECLAMOS") {
    andConditions.push({
      NOT: {
        reclamos: {
          some: {},
        },
      },
    });
  }

  if (filters.ordenes === "ABIERTAS") {
    andConditions.push({
      ordenesTrabajo: {
        some: {
          estado: { in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"] },
        },
      },
    });
  }

  if (filters.ordenes === "SIN_ABIERTAS") {
    andConditions.push({
      NOT: {
        ordenesTrabajo: {
          some: {
            estado: { in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"] },
          },
        },
      },
    });
  }

  if (filters.deuda === "CON_VENCIDA") {
    andConditions.push({
      facturas: {
        some: {
          estado: "VENCIDA",
        },
      },
    });
  }

  if (filters.deuda === "AL_DIA") {
    andConditions.push({
      NOT: {
        facturas: {
          some: {
            estado: {
              in: ["PENDIENTE", "VENCIDA"],
            },
          },
        },
      },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export async function getAbonadosData(filters: AbonadoFilters = {}) {
  await ensureBillingDefaults();
  await syncInvoiceStatuses();
  return prisma.abonado.findMany({
    where: buildAbonadoWhere(filters),
    include: {
      socio: true,
      servicios: {
        include: {
          servicioCatalogo: true,
        },
        orderBy: [{ tipo: "asc" }, { plan: "asc" }],
      },
      reclamos: {
        orderBy: { fechaApertura: "desc" },
        take: 3,
      },
      facturas: {
        where: {
          estado: {
            in: ["PENDIENTE", "VENCIDA"],
          },
        },
        select: {
          id: true,
          estado: true,
          total: true,
        },
      },
    },
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { numeroAbonado: "asc" }],
  });
}

export function buildFacturacionFilters(filters: FacturacionFilters = {}) {
  const query = textSearch(filters.q ?? "");
  const dateFrom = filters.desde ? new Date(filters.desde) : undefined;
  const dateTo = filters.hasta ? new Date(`${filters.hasta}T23:59:59`) : undefined;

  const facturaWhere: Prisma.FacturaWhereInput = {};
  const pagoWhere: Prisma.PagoWhereInput = {};
  const cuentaWhere: Prisma.CuentaCorrienteWhereInput = {};
  const abonadoScope: Prisma.AbonadoWhereInput = {};

  if (query) {
    facturaWhere.OR = [
      { numero: { contains: query } },
      { abonado: { is: { numeroAbonado: { contains: query } } } },
      { abonado: { is: { nombre: { contains: query } } } },
      { abonado: { is: { apellido: { contains: query } } } },
      { abonado: { is: { razonSocial: { contains: query } } } },
    ];

    pagoWhere.OR = [
      { numeroRecibo: { contains: query } },
      { medioPago: { contains: query } },
      { abonado: { is: { numeroAbonado: { contains: query } } } },
      { abonado: { is: { nombre: { contains: query } } } },
      { abonado: { is: { apellido: { contains: query } } } },
    ];

    cuentaWhere.OR = [
      { descripcion: { contains: query } },
      { tipo: { contains: query } },
      { pago: { is: { numeroRecibo: { contains: query } } } },
      { abonado: { is: { numeroAbonado: { contains: query } } } },
    ];
  }

  if (filters.localidad) {
    abonadoScope.localidad = { contains: filters.localidad.trim() };
  }

  if (filters.condicionIva) {
    abonadoScope.condicionIva = filters.condicionIva;
  }

  if (Object.keys(abonadoScope).length > 0) {
    facturaWhere.abonado = { is: abonadoScope };
    pagoWhere.abonado = { is: abonadoScope };
    cuentaWhere.abonado = { is: abonadoScope };
  }

  if (filters.estado) {
    facturaWhere.estado = filters.estado;
  }

  if (filters.abonadoId) {
    const abonadoId = Number.parseInt(filters.abonadoId, 10);
    if (!Number.isNaN(abonadoId)) {
      facturaWhere.abonadoId = abonadoId;
      pagoWhere.abonadoId = abonadoId;
      cuentaWhere.abonadoId = abonadoId;
    }
  }

  if (filters.medioPago) {
    pagoWhere.medioPago = filters.medioPago;
  }

  if (filters.servicioCatalogoId) {
    const servicioCatalogoId = Number.parseInt(filters.servicioCatalogoId, 10);
    if (!Number.isNaN(servicioCatalogoId)) {
      facturaWhere.detalles = {
        some: {
          servicio: {
            is: {
              servicioCatalogoId,
            },
          },
        },
      };
    }
  }

  if (dateFrom || dateTo) {
    const range = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
    facturaWhere.fechaEmision = range;
    pagoWhere.fecha = range;
    cuentaWhere.fecha = range;
  }

  return { facturaWhere, pagoWhere, cuentaWhere };
}

export async function getFacturacionData(filters: FacturacionFilters = {}) {
  await ensureBillingDefaults();
  await syncInvoiceStatuses();
  const { start, end } = getMonthBounds();
  const { facturaWhere, pagoWhere, cuentaWhere } = buildFacturacionFilters(filters);
  const [
    facturas,
    pagos,
    movimientos,
    abonados,
    usuarios,
    facturasMes,
    facturasPendientes,
    configuracion,
    catalogoServicios,
    cargosTecnicosPendientes,
  ] = await Promise.all([
    prisma.factura.findMany({
      where: facturaWhere,
      include: {
        abonado: true,
        detalles: {
          orderBy: { id: "asc" },
        },
      },
      orderBy: [{ fechaEmision: "desc" }, { numero: "desc" }],
    }),
    prisma.pago.findMany({
      where: pagoWhere,
      include: {
        abonado: true,
        usuario: true,
        movimientos: {
          where: {
            anuladoAt: null,
          },
          select: {
            id: true,
          },
        },
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.cuentaCorriente.findMany({
      where: cuentaWhere,
      include: {
        abonado: true,
        pago: {
          select: {
            numeroRecibo: true,
            estado: true,
          },
        },
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.abonado.findMany({
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { numeroAbonado: "asc" }],
      select: {
        id: true,
        numeroAbonado: true,
        nombre: true,
        apellido: true,
        razonSocial: true,
        condicionIva: true,
      },
    }),
    prisma.usuario.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        rol: true,
      },
    }),
    prisma.factura.count({
      where: {
        fechaEmision: {
          gte: start,
          lt: end,
        },
      },
    }),
    prisma.factura.findMany({
      where: {
        estado: {
          in: ["PENDIENTE", "VENCIDA"],
        },
      },
      select: { total: true },
    }),
    prisma.configuracionFacturacion.findFirst(),
    prisma.servicioCatalogo.findMany({
      where: { activo: true },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    }),
    prisma.reclamoMaterial.count({
      where: {
        facturarProximaFactura: true,
        facturado: false,
      },
    }),
  ]);

  return {
    facturas,
    pagos,
    movimientos,
    abonados,
    usuarios,
    configuracion,
    catalogoServicios,
    summary: {
      cicloActual: getCurrentBillingPeriodLabel(),
      facturasDelMes: facturasMes,
      saldoPendiente: facturasPendientes.reduce((sum, item) => sum + toNumber(item.total), 0),
      pagosRegistrados: pagos.filter((pago) => pago.estado === "REGISTRADO").length,
      pagosAnulados: pagos.filter((pago) => pago.estado === "ANULADO").length,
      cargosTecnicosPendientes,
      facturasVencidas: facturas.filter((factura) => factura.estado === "VENCIDA").length,
    },
  };
}

export function buildCuentaCorrienteWhere(filters: CuentaCorrienteFilters = {}) {
  const query = textSearch(filters.q ?? "");
  const dateFrom = filters.desde ? new Date(filters.desde) : undefined;
  const dateTo = filters.hasta ? new Date(`${filters.hasta}T23:59:59`) : undefined;
  const where: Prisma.CuentaCorrienteWhereInput = {};
  const abonadoScope: Prisma.AbonadoWhereInput = {};
  const andConditions: Prisma.CuentaCorrienteWhereInput[] = [];

  if (query) {
    andConditions.push({
      OR: [
        { descripcion: { contains: query } },
        { tipo: { contains: query } },
        { factura: { is: { numero: { contains: query } } } },
        { pago: { is: { numeroRecibo: { contains: query } } } },
        { abonado: { is: { numeroAbonado: { contains: query } } } },
        { abonado: { is: { nombre: { contains: query } } } },
        { abonado: { is: { apellido: { contains: query } } } },
        { abonado: { is: { razonSocial: { contains: query } } } },
      ],
    });
  }

  if (filters.abonadoId) {
    const abonadoId = Number.parseInt(filters.abonadoId, 10);
    if (!Number.isNaN(abonadoId)) {
      where.abonadoId = abonadoId;
    }
  }

  if (filters.tipo) {
    where.tipo = filters.tipo;
  }

  if (filters.localidad) {
    abonadoScope.localidad = { contains: filters.localidad.trim() };
  }

  if (filters.condicionIva) {
    abonadoScope.condicionIva = filters.condicionIva;
  }

  if (Object.keys(abonadoScope).length > 0) {
    where.abonado = { is: abonadoScope };
  }

  if (filters.vigencia === "VIGENTE") {
    where.anuladoAt = null;
  }

  if (filters.vigencia === "ANULADO") {
    where.anuladoAt = { not: null };
  }

  if (dateFrom || dateTo) {
    where.fecha = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export async function getCuentaCorrienteData(filters: CuentaCorrienteFilters = {}) {
  await syncInvoiceStatuses();
  const [movimientos, abonados] = await Promise.all([
    prisma.cuentaCorriente.findMany({
      where: buildCuentaCorrienteWhere(filters),
      include: {
        abonado: true,
        factura: {
          select: {
            id: true,
            numero: true,
            estado: true,
          },
        },
        pago: {
          select: {
            id: true,
            numeroRecibo: true,
            estado: true,
          },
        },
      },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
    }),
    prisma.abonado.findMany({
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { razonSocial: "asc" }],
      select: {
        id: true,
        numeroAbonado: true,
        nombre: true,
        apellido: true,
        razonSocial: true,
        localidad: true,
        condicionIva: true,
      },
    }),
  ]);

  const movimientosVigentes = movimientos.filter((movimiento) => !movimiento.anuladoAt);
  const resumenAbonados = Array.from(
    movimientos.reduce(
      (map, movimiento) => {
        const key = movimiento.abonadoId;
        const existing = map.get(key) ?? {
          abonadoId: movimiento.abonadoId,
          numeroAbonado: movimiento.abonado.numeroAbonado,
          titular:
            movimiento.abonado.razonSocial ||
            [movimiento.abonado.apellido, movimiento.abonado.nombre].filter(Boolean).join(" ") ||
            movimiento.abonado.numeroAbonado,
          localidad: movimiento.abonado.localidad,
          condicionIva: movimiento.abonado.condicionIva,
          debitos: 0,
          creditos: 0,
          saldo: 0,
          movimientos: 0,
          anulados: 0,
        };

        const importe = toNumber(movimiento.importe);
        existing.movimientos += 1;

        if (movimiento.anuladoAt) {
          existing.anulados += 1;
        } else if (movimiento.tipo === "DEBITO") {
          existing.debitos += importe;
          existing.saldo += importe;
        } else {
          existing.creditos += importe;
          existing.saldo -= importe;
        }

        map.set(key, existing);
        return map;
      },
      new Map<
        number,
        {
          abonadoId: number;
          numeroAbonado: string;
          titular: string;
          localidad: string;
          condicionIva: string;
          debitos: number;
          creditos: number;
          saldo: number;
          movimientos: number;
          anulados: number;
        }
      >(),
    ).values(),
  ).sort((a, b) => b.saldo - a.saldo || b.movimientos - a.movimientos);

  return {
    movimientos,
    abonados,
    resumenAbonados,
    summary: {
      movimientosVisibles: movimientos.length,
      movimientosAnulados: movimientos.filter((movimiento) => movimiento.anuladoAt).length,
      debitos: movimientosVigentes
        .filter((movimiento) => movimiento.tipo === "DEBITO")
        .reduce((sum, movimiento) => sum + toNumber(movimiento.importe), 0),
      creditos: movimientosVigentes
        .filter((movimiento) => movimiento.tipo === "CREDITO")
        .reduce((sum, movimiento) => sum + toNumber(movimiento.importe), 0),
      saldoNeto: movimientosVigentes.reduce((sum, movimiento) => {
        const importe = toNumber(movimiento.importe);
        return sum + (movimiento.tipo === "DEBITO" ? importe : -importe);
      }, 0),
      abonadosConSaldo: resumenAbonados.filter((item) => item.saldo > 0).length,
    },
  };
}

export function buildComunicacionWhere(filters: ComunicacionFilters = {}): Prisma.ComunicacionAbonadoWhereInput {
  const query = textSearch(filters.q ?? "");
  const dateFrom = filters.desde ? new Date(`${filters.desde}T00:00:00`) : null;
  const dateTo = filters.hasta ? new Date(`${filters.hasta}T23:59:59`) : null;
  const where: Prisma.ComunicacionAbonadoWhereInput = {};

  if (query) {
    where.OR = [
      { asunto: { contains: query } },
      { mensaje: { contains: query } },
      {
        abonado: {
          is: {
            OR: [
              { numeroAbonado: { contains: query } },
              { nombre: { contains: query } },
              { apellido: { contains: query } },
              { razonSocial: { contains: query } },
              { email: { contains: query } },
              { telefono: { contains: query } },
            ],
          },
        },
      },
    ];
  }

  if (filters.abonadoId) {
    const abonadoId = Number.parseInt(filters.abonadoId, 10);
    if (!Number.isNaN(abonadoId)) {
      where.abonadoId = abonadoId;
    }
  }

  if (filters.canal) {
    where.canal = filters.canal;
  }

  if (filters.tipo) {
    where.tipo = filters.tipo;
  }

  if (filters.estado) {
    where.estado = filters.estado;
  }

  if (filters.oficinaVirtual === "SI") {
    where.visibleOficinaVirtual = true;
  }

  if (filters.oficinaVirtual === "NO") {
    where.visibleOficinaVirtual = false;
  }

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  return where;
}

export async function getComunicacionesData(filters: ComunicacionFilters = {}) {
  const [comunicaciones, abonados, usuarios, plantillas] = await Promise.all([
    prisma.comunicacionAbonado.findMany({
      where: buildComunicacionWhere(filters),
      include: {
        abonado: {
          select: {
            id: true,
            numeroAbonado: true,
            nombre: true,
            apellido: true,
            razonSocial: true,
            email: true,
            telefono: true,
            localidad: true,
          },
        },
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.abonado.findMany({
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { razonSocial: "asc" }],
      select: {
        id: true,
        numeroAbonado: true,
        nombre: true,
        apellido: true,
        razonSocial: true,
        email: true,
        telefono: true,
      },
    }),
    prisma.usuario.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    }),
    prisma.plantillaComunicacion.findMany({
      orderBy: [{ activa: "desc" }, { nombre: "asc" }],
    }),
  ]);

  return {
    comunicaciones,
    abonados,
    usuarios,
    plantillas,
    channels: COMMUNICATION_CHANNELS,
    types: COMMUNICATION_TYPES,
    states: COMMUNICATION_STATES,
    priorities: COMMUNICATION_PRIORITIES,
    summary: {
      total: comunicaciones.length,
      pendientes: comunicaciones.filter((item) => ["REGISTRADA", "PROGRAMADA"].includes(item.estado)).length,
      enviadas: comunicaciones.filter((item) => item.estado === "ENVIADA").length,
      errores: comunicaciones.filter((item) => item.estado === "ERROR").length,
      oficinaVirtual: comunicaciones.filter((item) => item.visibleOficinaVirtual).length,
    },
  };
}

export function buildPortalWhere(filters: PortalFilters = {}): Prisma.PublicacionPortalWhereInput {
  const query = textSearch(filters.q ?? "");
  const dateFrom = filters.desde ? new Date(filters.desde) : undefined;
  const dateTo = filters.hasta ? new Date(`${filters.hasta}T23:59:59`) : undefined;
  const where: Prisma.PublicacionPortalWhereInput = {};

  if (query) {
    where.OR = [
      { titulo: { contains: query } },
      { resumen: { contains: query } },
      { contenido: { contains: query } },
      { abonado: { is: { numeroAbonado: { contains: query } } } },
      { abonado: { is: { nombre: { contains: query } } } },
      { abonado: { is: { apellido: { contains: query } } } },
      { abonado: { is: { razonSocial: { contains: query } } } },
    ];
  }

  if (filters.abonadoId) {
    const abonadoId = Number.parseInt(filters.abonadoId, 10);
    if (!Number.isNaN(abonadoId)) {
      where.abonadoId = abonadoId;
    }
  }

  if (filters.categoria) {
    where.categoria = filters.categoria;
  }

  if (filters.estado) {
    where.estado = filters.estado;
  }

  if (filters.destacado === "SI") {
    where.destacado = true;
  }

  if (filters.destacado === "NO") {
    where.destacado = false;
  }

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  return where;
}

export async function getPortalData(filters: PortalFilters = {}) {
  const [publicaciones, abonados, usuarios] = await Promise.all([
    prisma.publicacionPortal.findMany({
      where: buildPortalWhere(filters),
      include: {
        abonado: {
          select: {
            id: true,
            numeroAbonado: true,
            nombre: true,
            apellido: true,
            razonSocial: true,
          },
        },
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
        interaccionesPortal: {
          select: {
            id: true,
            abonadoId: true,
            tipo: true,
            leidoAt: true,
            confirmadoAt: true,
          },
        },
      },
      orderBy: [{ destacado: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.abonado.findMany({
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { razonSocial: "asc" }],
      select: {
        id: true,
        numeroAbonado: true,
        nombre: true,
        apellido: true,
        razonSocial: true,
        portalActivo: true,
        portalUltimoAccesoAt: true,
      },
    }),
    prisma.usuario.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    }),
  ]);

  return {
    publicaciones,
    abonados,
    usuarios,
    categories: PORTAL_PUBLICATION_CATEGORIES,
    states: PORTAL_PUBLICATION_STATES,
    priorities: COMMUNICATION_PRIORITIES,
    summary: {
      total: publicaciones.length,
      publicadas: publicaciones.filter((item) => item.estado === "PUBLICADA").length,
      borradores: publicaciones.filter((item) => item.estado === "BORRADOR").length,
      destacadas: publicaciones.filter((item) => item.destacado).length,
      porAbonado: publicaciones.filter((item) => item.abonadoId !== null).length,
      lecturas: publicaciones.reduce(
        (sum, item) => sum + item.interaccionesPortal.filter((interaction) => interaction.tipo === "LECTURA").length,
        0,
      ),
      confirmaciones: publicaciones.reduce(
        (sum, item) =>
          sum + item.interaccionesPortal.filter((interaction) => interaction.tipo === "CONFIRMACION").length,
        0,
      ),
    },
  };
}

export async function getOficinaVirtualPreview(id: number) {
  await syncInvoiceStatuses();
  const now = new Date();
  const [abonado, publicacionesPortal] = await Promise.all([
    prisma.abonado.findUnique({
      where: { id },
      include: {
        servicios: {
          where: {
            estado: {
              in: ["ACTIVO", "PENDIENTE_INSTALACION", "SUSPENDIDO"],
            },
          },
          include: {
            servicioCatalogo: true,
          },
          orderBy: [{ estado: "asc" }, { tipo: "asc" }, { plan: "asc" }],
        },
        facturas: {
          where: {
            estado: {
              in: ["PENDIENTE", "VENCIDA"],
            },
          },
          include: {
            detalles: true,
          },
          orderBy: [{ fechaVencimiento: "asc" }, { fechaEmision: "desc" }],
        },
        pagos: {
          where: {
            estado: "REGISTRADO",
          },
          orderBy: { fecha: "desc" },
          take: 8,
        },
        ordenesTrabajo: {
          where: {
            estado: {
              in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"],
            },
          },
          include: {
            servicio: {
              select: {
                plan: true,
                tipo: true,
                numeroContrato: true,
                servicioCatalogo: {
                  select: {
                    nombre: true,
                  },
                },
              },
            },
            tecnico: {
              select: {
                nombre: true,
              },
            },
          },
          orderBy: [{ fechaProgramada: "asc" }, { createdAt: "desc" }],
          take: 8,
        },
        reclamos: {
          orderBy: { fechaApertura: "desc" },
          take: 8,
        },
        comunicaciones: {
          where: {
            visibleOficinaVirtual: true,
            estado: {
              in: ["REGISTRADA", "PROGRAMADA", "ENVIADA"],
            },
          },
          include: {
            usuario: {
              select: {
                nombre: true,
              },
            },
            interaccionesPortal: {
              where: { abonadoId: id },
              select: {
                id: true,
                tipo: true,
                leidoAt: true,
                confirmadoAt: true,
                createdAt: true,
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    }),
    prisma.publicacionPortal.findMany({
      where: {
        estado: "PUBLICADA",
        OR: [{ abonadoId: null }, { abonadoId: id }],
        AND: [
          {
            OR: [{ visibleDesde: null }, { visibleDesde: { lte: now } }],
          },
          {
            OR: [{ visibleHasta: null }, { visibleHasta: { gte: now } }],
          },
        ],
      },
      include: {
        usuario: {
          select: {
            nombre: true,
          },
        },
        interaccionesPortal: {
          where: { abonadoId: id },
          select: {
            id: true,
            tipo: true,
            leidoAt: true,
            confirmadoAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ destacado: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  if (!abonado) {
    return null;
  }

  return {
    ...abonado,
    publicacionesPortal,
  };
}

export async function getCuentaCorrienteProfile(id: number) {
  await syncInvoiceStatuses();

  const [abonado, usuariosCobranza] = await Promise.all([
    prisma.abonado.findUnique({
    where: { id },
    include: {
      socio: true,
      movimientos: {
        include: {
          factura: {
            select: {
              id: true,
              numero: true,
              estado: true,
              fechaVencimiento: true,
              total: true,
            },
          },
          pago: {
            select: {
              id: true,
              numeroRecibo: true,
              estado: true,
              medioPago: true,
              fecha: true,
              importe: true,
            },
          },
        },
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
      },
      facturas: {
        where: {
          estado: {
            in: ["PENDIENTE", "VENCIDA"],
          },
        },
        orderBy: [{ fechaVencimiento: "asc" }, { fechaEmision: "asc" }],
        select: {
          id: true,
          numero: true,
          fechaEmision: true,
          fechaVencimiento: true,
          total: true,
          estado: true,
        },
      },
      pagos: {
        where: {
          estado: "REGISTRADO",
        },
        orderBy: { fecha: "desc" },
        take: 10,
        include: {
          usuario: true,
        },
      },
      servicios: {
        where: {
          estado: {
            in: ["ACTIVO", "PENDIENTE_INSTALACION", "SUSPENDIDO"],
          },
        },
        include: {
          servicioCatalogo: true,
        },
        orderBy: [{ estado: "asc" }, { tipo: "asc" }, { plan: "asc" }],
      },
      gestionesCobranza: {
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
            },
          },
          factura: {
            select: {
              id: true,
              numero: true,
              estado: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      acuerdosPago: {
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
            },
          },
          factura: {
            select: {
              id: true,
              numero: true,
              estado: true,
            },
          },
          cuotas: {
            orderBy: { numeroCuota: "asc" },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
    }),
    prisma.usuario.findMany({
      where: {
        activo: true,
        rol: {
          in: ["ADMIN", "CAJA"],
        },
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
      },
    }),
  ]);

  if (!abonado) {
    return null;
  }

  const movimientosVigentes = abonado.movimientos.filter((movimiento) => !movimiento.anuladoAt);
  const saldoActual =
    movimientosVigentes.length > 0
      ? toNumber(movimientosVigentes[movimientosVigentes.length - 1]!.saldo)
      : 0;
  const debitos = movimientosVigentes
    .filter((movimiento) => movimiento.tipo === "DEBITO")
    .reduce((sum, movimiento) => sum + toNumber(movimiento.importe), 0);
  const creditos = movimientosVigentes
    .filter((movimiento) => movimiento.tipo === "CREDITO")
    .reduce((sum, movimiento) => sum + toNumber(movimiento.importe), 0);
  const vencido = abonado.facturas
    .filter((factura) => factura.estado === "VENCIDA")
    .reduce((sum, factura) => sum + toNumber(factura.total), 0);
  const promesasVigentes = abonado.gestionesCobranza.filter((gestion) => gestion.estado === "PROMESA_VIGENTE");
  const promesasVencidas = promesasVigentes.filter(
    (gestion) => gestion.compromisoPagoAt && gestion.compromisoPagoAt < new Date(),
  );
  const cuotasPendientes = abonado.acuerdosPago.flatMap((acuerdo) =>
    acuerdo.cuotas.filter((cuota) => cuota.estado === "PENDIENTE"),
  );
  const cuotasVencidas = cuotasPendientes.filter((cuota) => cuota.fechaVencimiento < new Date());
  const acuerdosVigentes = abonado.acuerdosPago.filter((acuerdo) => acuerdo.estado === "VIGENTE");

  return {
    abonado,
    usuariosCobranza,
    summary: {
      saldoActual,
      debitos,
      creditos,
      vencido,
      facturasAbiertas: abonado.facturas.length,
      movimientos: abonado.movimientos.length,
      movimientosAnulados: abonado.movimientos.filter((movimiento) => movimiento.anuladoAt).length,
      gestionesCobranza: abonado.gestionesCobranza.length,
      promesasVigentes: promesasVigentes.length,
      promesasVencidas: promesasVencidas.length,
      acuerdosPago: abonado.acuerdosPago.length,
      acuerdosVigentes: acuerdosVigentes.length,
      cuotasPendientes: cuotasPendientes.length,
      cuotasVencidas: cuotasVencidas.length,
    },
  };
}

export async function getPagoProfile(id: number) {
  return prisma.pago.findUnique({
    where: { id },
    include: {
      abonado: {
        include: {
          socio: true,
        },
      },
      usuario: true,
      movimientos: {
        where: {
          anuladoAt: null,
        },
        include: {
          factura: {
            select: {
              id: true,
              numero: true,
              fechaEmision: true,
              fechaVencimiento: true,
              total: true,
            },
          },
        },
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
      },
    },
  });
}

export async function getCajaData(filters: CajaFilters = {}) {
  const baseDate = filters.fecha ? new Date(`${filters.fecha}T00:00:00`) : new Date();
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1);

  const [cierres, pagos, usuarios] = await Promise.all([
    prisma.cajaCierre.findMany({
      include: {
        usuarioApertura: {
          select: {
            id: true,
            nombre: true,
          },
        },
        usuarioCierre: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: [{ fecha: "desc" }, { aperturaAt: "desc" }],
      take: 30,
    }),
    prisma.pago.findMany({
      where: {
        fecha: {
          gte: start,
          lt: end,
        },
      },
      include: {
        abonado: {
          select: {
            id: true,
            numeroAbonado: true,
            nombre: true,
            apellido: true,
            razonSocial: true,
          },
        },
        usuario: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: [{ fecha: "desc" }],
    }),
    prisma.usuario.findMany({
      where: {
        activo: true,
        rol: {
          in: ["ADMIN", "CAJA"],
        },
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        rol: true,
      },
    }),
  ]);

  const cierreActual =
    cierres.find((cierre) => cierre.fecha >= start && cierre.fecha < end && cierre.estado === "ABIERTA") ?? null;
  const pagosVigentes = pagos.filter((pago) => pago.estado === "REGISTRADO");
  const efectivoSistema = pagosVigentes
    .filter((pago) => pago.medioPago === "EFECTIVO")
    .reduce((sum, pago) => sum + toNumber(pago.importe), 0);
  const transferenciaSistema = pagosVigentes
    .filter((pago) => pago.medioPago === "TRANSFERENCIA")
    .reduce((sum, pago) => sum + toNumber(pago.importe), 0);
  const tarjetaSistema = pagosVigentes
    .filter((pago) => pago.medioPago === "TARJETA")
    .reduce((sum, pago) => sum + toNumber(pago.importe), 0);

  return {
    cierreActual,
    cierres,
    pagos,
    usuarios,
    summary: {
      fecha: start,
      ingresosSistema: pagosVigentes.reduce((sum, pago) => sum + toNumber(pago.importe), 0),
      pagosRegistrados: pagosVigentes.length,
      pagosAnulados: pagos.filter((pago) => pago.estado === "ANULADO").length,
      efectivoSistema,
      transferenciaSistema,
      tarjetaSistema,
    },
  };
}

export async function getFacturaProfile(id: number) {
  await syncInvoiceStatuses();

  return prisma.factura.findUnique({
    where: { id },
    include: {
      facturaOrigen: {
        select: {
          id: true,
          numero: true,
          tipoAjuste: true,
        },
      },
      abonado: {
        include: {
          socio: true,
          servicios: {
            where: { estado: "ACTIVO" },
            include: {
              servicioCatalogo: true,
            },
            orderBy: [{ tipo: "asc" }, { plan: "asc" }],
          },
        },
      },
      detalles: {
        include: {
          servicio: {
            include: {
              servicioCatalogo: true,
            },
          },
          reclamoMaterial: {
            include: {
              material: true,
              reclamo: {
                select: {
                  id: true,
                  tipoServicio: true,
                  estado: true,
                  fechaApertura: true,
                },
              },
            },
          },
        },
        orderBy: { id: "asc" },
      },
      movimientos: {
        include: {
          pago: {
            select: {
              numeroRecibo: true,
              estado: true,
            },
          },
        },
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
      },
      notasRelacionadas: {
        orderBy: [{ fechaEmision: "desc" }, { id: "desc" }],
      },
    },
  });
}

export function buildReclamoWhere(filters: ReclamoFilters = {}) {
  const query = textSearch(filters.q ?? "");
  const dateFrom = filters.desde ? new Date(filters.desde) : undefined;
  const dateTo = filters.hasta ? new Date(`${filters.hasta}T23:59:59`) : undefined;
  const where: Prisma.ReclamoWhereInput = {};
  const abonadoScope: Prisma.AbonadoWhereInput = {};

  if (query) {
    where.OR = [
      { descripcion: { contains: query } },
      { tipoServicio: { contains: query } },
      { diagnosticoCierre: { contains: query } },
      { resolucionCierre: { contains: query } },
      { abonado: { is: { numeroAbonado: { contains: query } } } },
      { abonado: { is: { nombre: { contains: query } } } },
      { abonado: { is: { apellido: { contains: query } } } },
      { tecnico: { is: { nombre: { contains: query } } } },
    ];
  }

  if (filters.estado) {
    where.estado = filters.estado;
  }

  if (filters.prioridad) {
    where.prioridad = filters.prioridad;
  }

  if (filters.tecnicoId) {
    const tecnicoId = Number.parseInt(filters.tecnicoId, 10);
    if (!Number.isNaN(tecnicoId)) {
      where.tecnicoId = tecnicoId;
    }
  }

  if (filters.abonadoId) {
    const abonadoId = Number.parseInt(filters.abonadoId, 10);
    if (!Number.isNaN(abonadoId)) {
      where.abonadoId = abonadoId;
    }
  }

  if (filters.tipoServicio) {
    where.tipoServicio = filters.tipoServicio;
  }

  if (filters.localidad) {
    abonadoScope.localidad = { contains: filters.localidad.trim() };
  }

  if (Object.keys(abonadoScope).length > 0) {
    where.abonado = {
      is: abonadoScope,
    };
  }

  if (filters.cargoFacturable === "PENDIENTE_FACTURACION") {
    where.materiales = {
      some: {
        facturarProximaFactura: true,
        facturado: false,
      },
    };
  }

  if (filters.cargoFacturable === "CON_MATERIALES") {
    where.materiales = {
      some: {},
    };
  }

  if (filters.cargoFacturable === "SIN_MATERIALES") {
    where.materiales = {
      none: {},
    };
  }

  if (dateFrom || dateTo) {
    where.fechaApertura = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  return where;
}

export async function getReclamosData(filters: ReclamoFilters = {}) {
  const [reclamos, abonados, tecnicos, materiales] = await Promise.all([
    prisma.reclamo.findMany({
      where: buildReclamoWhere(filters),
      include: {
        abonado: true,
        tecnico: true,
        materiales: {
          include: {
            material: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ fechaApertura: "desc" }, { prioridad: "desc" }],
    }),
    prisma.abonado.findMany({
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { numeroAbonado: "asc" }],
      select: {
        id: true,
        numeroAbonado: true,
        nombre: true,
        apellido: true,
        razonSocial: true,
        localidad: true,
      },
    }),
    prisma.usuario.findMany({
      where: {
        activo: true,
        rol: {
          in: ["ADMIN", "TECNICO"],
        },
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
      },
    }),
    prisma.material.findMany({
      where: { activo: true },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        codigo: true,
        stockActual: true,
        precioFacturable: true,
      },
    }),
  ]);

  return { reclamos, abonados, tecnicos, materiales };
}

export function buildOrdenTrabajoWhere(filters: OrdenTrabajoFilters = {}): Prisma.OrdenTrabajoWhereInput {
  const query = textSearch(filters.q ?? "");
  const dateRange = buildDateRange(filters.desde, filters.hasta);
  const where: Prisma.OrdenTrabajoWhereInput = {};

  if (query) {
    where.OR = [
      { tipo: { contains: query } },
      { estado: { contains: query } },
      { motivo: { contains: query } },
      { detalle: { contains: query } },
      { resolucion: { contains: query } },
      { abonado: { is: { numeroAbonado: { contains: query } } } },
      { abonado: { is: { nombre: { contains: query } } } },
      { abonado: { is: { apellido: { contains: query } } } },
      { abonado: { is: { razonSocial: { contains: query } } } },
      { tecnico: { is: { nombre: { contains: query } } } },
    ];
  }

  if (filters.estado) {
    where.estado = filters.estado;
  }

  if (filters.tipo) {
    where.tipo = filters.tipo;
  }

  if (filters.tecnicoId) {
    const tecnicoId = Number.parseInt(filters.tecnicoId, 10);
    if (!Number.isNaN(tecnicoId)) {
      where.tecnicoId = tecnicoId;
    }
  }

  if (filters.abonadoId) {
    const abonadoId = Number.parseInt(filters.abonadoId, 10);
    if (!Number.isNaN(abonadoId)) {
      where.abonadoId = abonadoId;
    }
  }

  if (dateRange) {
    where.fechaSolicitud = dateRange;
  }

  return where;
}

export async function getOrdenesTrabajoData(filters: OrdenTrabajoFilters = {}) {
  const where = buildOrdenTrabajoWhere(filters);
  const [ordenes, abonados, tecnicos, servicios, reclamos] = await Promise.all([
    prisma.ordenTrabajo.findMany({
      where,
      include: {
        abonado: true,
        servicio: {
          include: {
            servicioCatalogo: true,
          },
        },
        reclamo: true,
        tecnico: true,
      },
      orderBy: [{ fechaProgramada: "asc" }, { createdAt: "desc" }],
      take: 250,
    }),
    prisma.abonado.findMany({
      where: { estado: { in: ["ACTIVO", "SUSPENDIDO"] } },
      orderBy: [{ numeroAbonado: "asc" }],
      select: {
        id: true,
        numeroAbonado: true,
        nombre: true,
        apellido: true,
        razonSocial: true,
      },
    }),
    prisma.usuario.findMany({
      where: {
        activo: true,
        rol: {
          in: ["ADMIN", "TECNICO"],
        },
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
      },
    }),
    prisma.servicio.findMany({
      where: {
        estado: {
          in: ["PENDIENTE_INSTALACION", "ACTIVO", "SUSPENDIDO"],
        },
      },
      include: {
        abonado: {
          select: {
            id: true,
            numeroAbonado: true,
            nombre: true,
            apellido: true,
            razonSocial: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 250,
    }),
    prisma.reclamo.findMany({
      where: {
        estado: {
          in: ["ABIERTO", "EN_PROCESO"],
        },
      },
      include: {
        abonado: {
          select: {
            id: true,
            numeroAbonado: true,
            nombre: true,
            apellido: true,
            razonSocial: true,
          },
        },
      },
      orderBy: [{ fechaApertura: "desc" }],
      take: 250,
    }),
  ]);

  return {
    ordenes,
    abonados,
    tecnicos,
    servicios,
    reclamos,
    orderTypes: WORK_ORDER_TYPES,
    orderStates: WORK_ORDER_STATES,
    summary: {
      total: ordenes.length,
      pendientes: ordenes.filter((orden) => ["PENDIENTE", "ASIGNADA"].includes(orden.estado)).length,
      enCurso: ordenes.filter((orden) => orden.estado === "EN_CURSO").length,
      resueltas: ordenes.filter((orden) => orden.estado === "RESUELTA").length,
      instalaciones: ordenes.filter((orden) => orden.tipo === "INSTALACION").length,
    },
  };
}

export async function getSociosFormData() {
  return prisma.socio.count();
}

export async function getAbonadosFormData() {
  await ensureBillingDefaults();
  const [socios, catalogoServicios, tecnicos, operadoresCaja, communicationTemplates] = await Promise.all([
    prisma.socio.findMany({
      where: { estado: "ACTIVO" },
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        dni: true,
      },
    }),
    prisma.servicioCatalogo.findMany({
      where: { activo: true },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
        categoria: true,
        precioBase: true,
      },
    }),
    prisma.usuario.findMany({
      where: { activo: true, rol: "TECNICO" },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    }),
    prisma.usuario.findMany({
      where: {
        activo: true,
        rol: {
          in: ["ADMIN", "CAJA"],
        },
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    }),
    prisma.plantillaComunicacion.findMany({
      where: { activa: true },
      orderBy: [{ canal: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
        canal: true,
        tipo: true,
        asuntoTemplate: true,
        mensajeTemplate: true,
        prioridadDefault: true,
        visibleOficinaVirtualDefault: true,
        requiereSeguimientoDefault: true,
      },
    }),
  ]);

  return {
    socios,
    catalogoServicios,
    tecnicos,
    operadoresCaja,
    ivaConditions: IVA_CONDITIONS,
    paymentMethods: PAYMENT_METHODS,
    collectionChannels: COLLECTION_CHANNELS,
    collectionOutcomes: COLLECTION_OUTCOMES,
    communicationChannels: COMMUNICATION_CHANNELS,
    communicationTypes: COMMUNICATION_TYPES,
    communicationStates: COMMUNICATION_STATES,
    communicationPriorities: COMMUNICATION_PRIORITIES,
    communicationTemplates,
    ticketPriorities: TICKET_PRIORITIES,
  };
}

export function buildProveedorWhere(filters: ProveedorFilters = {}): Prisma.ProveedorWhereInput {
  const query = textSearch(filters.q ?? "");
  const where: Prisma.ProveedorWhereInput = {};

  if (query) {
    where.OR = [
      { razonSocial: { contains: query } },
      { nombreFantasia: { contains: query } },
      { cuit: { contains: query } },
      { email: { contains: query } },
      { telefono: { contains: query } },
      { localidad: { contains: query } },
      { provincia: { contains: query } },
    ];
  }

  if (filters.condicionIva) {
    where.condicionIva = filters.condicionIva;
  }

  if (filters.activo === "SI") {
    where.activo = true;
  }

  if (filters.activo === "NO") {
    where.activo = false;
  }

  if (filters.localidad) {
    where.localidad = { contains: filters.localidad.trim() };
  }

  return where;
}

export async function getProveedoresData(filters: ProveedorFilters = {}) {
  const proveedores = await prisma.proveedor.findMany({
    where: buildProveedorWhere(filters),
    include: {
      compras: {
        orderBy: { fecha: "desc" },
        take: 5,
        select: {
          id: true,
          fecha: true,
          total: true,
          comprobante: true,
        },
      },
    },
    orderBy: [{ activo: "desc" }, { razonSocial: "asc" }],
  });

  return {
    proveedores,
    summary: {
      total: proveedores.length,
      activos: proveedores.filter((proveedor) => proveedor.activo).length,
      comprasAsociadas: proveedores.reduce((sum, proveedor) => sum + proveedor.compras.length, 0),
    },
    ivaConditions: IVA_CONDITIONS,
  };
}

export async function getAbonadoProfile(id: number) {
  await syncInvoiceStatuses();
  return prisma.abonado.findUnique({
    where: { id },
    include: {
      socio: true,
      servicios: {
        include: {
          servicioCatalogo: true,
        },
        orderBy: [{ estado: "asc" }, { tipo: "asc" }, { plan: "asc" }],
      },
      facturas: {
        include: {
          detalles: true,
        },
        orderBy: { fechaEmision: "desc" },
      },
      movimientos: {
        orderBy: { fecha: "desc" },
      },
      pagos: {
        include: {
          usuario: true,
        },
        orderBy: { fecha: "desc" },
      },
      gestionesCobranza: {
        include: {
          usuario: true,
          factura: {
            select: {
              id: true,
              numero: true,
              total: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      acuerdosPago: {
        include: {
          usuario: true,
          factura: {
            select: {
              id: true,
              numero: true,
            },
          },
          cuotas: {
            orderBy: { numeroCuota: "asc" },
          },
        },
        orderBy: { fechaAcuerdo: "desc" },
      },
      comunicaciones: {
        include: {
          usuario: true,
        },
        orderBy: { createdAt: "desc" },
      },
      reclamos: {
        include: {
          tecnico: true,
          materiales: {
            include: {
              material: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { fechaApertura: "desc" },
      },
      ordenesTrabajo: {
        include: {
          tecnico: true,
          servicio: {
            include: {
              servicioCatalogo: true,
            },
          },
          reclamo: true,
        },
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });
}

export async function getConfiguracionFacturacionData() {
  await ensureBillingDefaults();
  await ensureAutomationDefaults();
  const [configuracion, servicios, materiales] = await Promise.all([
    prisma.configuracionFacturacion.findFirst(),
    prisma.servicioCatalogo.findMany({
      orderBy: [{ activo: "desc" }, { categoria: "asc" }, { nombre: "asc" }],
    }),
    prisma.material.findMany({
      orderBy: [{ activo: "desc" }, { categoria: "asc" }, { nombre: "asc" }],
    }),
  ]);

  return {
    configuracion,
    servicios,
    materiales,
    ivaConditions: IVA_CONDITIONS,
    arcaEnvironments: ARCA_ENVIRONMENTS,
    arcaInvoiceTypes: ARCA_INVOICE_TYPES,
    arcaConceptTypes: ARCA_CONCEPT_TYPES,
    arcaCurrencies: ARCA_CURRENCIES,
    arcaDocumentTypes: ARCA_DOCUMENT_TYPES,
    arcaResultStates: ARCA_RESULT_STATES,
    arcaWsServices: ARCA_WS_SERVICES,
  };
}

export async function getPasarelasData() {
  await ensureAutomationDefaults();

  const [pasarelas, pagosExternos, webhooks, regla, abonados, ejecuciones] = await Promise.all([
    prisma.pasarelaPago.findMany({
      orderBy: [{ activa: "desc" }, { orden: "asc" }, { nombre: "asc" }],
      include: {
        pagosExternos: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.pagoExterno.findMany({
      include: {
        abonado: {
          select: {
            id: true,
            numeroAbonado: true,
            nombre: true,
            apellido: true,
            razonSocial: true,
          },
        },
        factura: {
          select: {
            id: true,
            numero: true,
            total: true,
            estado: true,
          },
        },
        pasarela: {
          select: {
            id: true,
            nombre: true,
            codigo: true,
            proveedor: true,
          },
        },
        pago: {
          select: {
            id: true,
            numeroRecibo: true,
            estado: true,
            fecha: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    }),
    prisma.webhookPasarelaEvento.findMany({
      include: {
        pasarela: {
          select: {
            nombre: true,
            codigo: true,
          },
        },
        pagoExterno: {
          select: {
            abonadoId: true,
            referenciaInterna: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    }),
    prisma.reglaAutomatizacion.findUnique({
      where: { codigo: "COBRANZA_BASE" },
    }),
    prisma.abonado.findMany({
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { razonSocial: "asc" }],
      select: {
        id: true,
        numeroAbonado: true,
        nombre: true,
        apellido: true,
        razonSocial: true,
      },
    }),
    prisma.ejecucionAutomatizacion.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
  ]);

  return {
    pasarelas,
    pagosExternos,
    webhooks,
    regla,
    abonados,
    ejecuciones,
    providers: PAYMENT_GATEWAY_PROVIDERS,
    modes: PAYMENT_GATEWAY_MODES,
    externalPaymentStates: EXTERNAL_PAYMENT_STATES,
    webhookStates: WEBHOOK_EVENT_STATES,
    summary: {
      pasarelasActivas: pasarelas.filter((item) => item.activa).length,
      pagosPendientes: pagosExternos.filter((item) =>
        ["BORRADOR", "PENDIENTE", "EN_PROCESO"].includes(item.estado),
      ).length,
      pagosAcreditados: pagosExternos.filter((item) => item.estado === "ACREDITADO").length,
      webhooksConError: webhooks.filter((item) => item.estado === "ERROR").length,
    },
  };
}

export function buildStockWhere(filters: StockFilters = {}): Prisma.MaterialWhereInput {
  const query = textSearch(filters.q ?? "");
  const where: Prisma.MaterialWhereInput = {};

  if (query) {
    where.OR = [
      { codigo: { contains: query } },
      { nombre: { contains: query } },
      { categoria: { contains: query } },
      { observaciones: { contains: query } },
    ];
  }

  if (filters.categoria) {
    where.categoria = filters.categoria;
  }

  if (filters.bajoStock === "SI") {
    where.activo = true;
  }

  return where;
}

export async function getStockData(filters: StockFilters = {}) {
  const [materiales, movimientos] = await Promise.all([
    prisma.material.findMany({
      where: buildStockWhere(filters),
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    }),
    prisma.movimientoStock.findMany({
      include: {
        material: true,
        compra: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const materialesFiltrados =
    filters.bajoStock === "SI"
      ? materiales.filter((material) => Number(material.stockActual) <= Number(material.stockMinimo))
      : materiales;

  return {
    materiales: materialesFiltrados,
    movimientos,
    summary: {
      totalMateriales: materialesFiltrados.length,
      materialesBajoStock: materialesFiltrados.filter(
        (material) => Number(material.stockActual) <= Number(material.stockMinimo),
      ).length,
      valorizadoEstimado: materialesFiltrados.reduce(
        (sum, material) => sum + Number(material.stockActual) * Number(material.costoPromedio),
        0,
      ),
    },
  };
}

export function buildComprasWhere(filters: CompraFilters = {}) {
  const query = textSearch(filters.q ?? "");
  const dateFrom = filters.desde ? new Date(filters.desde) : undefined;
  const dateTo = filters.hasta ? new Date(`${filters.hasta}T23:59:59`) : undefined;
  const compraWhere: Prisma.CompraWhereInput = {};
  const andConditions: Prisma.CompraWhereInput[] = [];

  if (query) {
    andConditions.push({
      OR: [
      { proveedor: { contains: query } },
      { comprobante: { contains: query } },
      { observaciones: { contains: query } },
      {
        proveedorRef: {
          is: {
            OR: [
              { razonSocial: { contains: query } },
              { nombreFantasia: { contains: query } },
              { cuit: { contains: query } },
            ],
          },
        },
      },
      {
        detalles: {
          some: {
            OR: [
              { material: { is: { nombre: { contains: query } } } },
              { material: { is: { codigo: { contains: query } } } },
            ],
          },
        },
      },
      ],
    });
  }

  if (filters.proveedor) {
    andConditions.push({
      OR: [
        { proveedor: { contains: filters.proveedor.trim() } },
        {
          proveedorRef: {
            is: {
              OR: [
                { razonSocial: { contains: filters.proveedor.trim() } },
                { nombreFantasia: { contains: filters.proveedor.trim() } },
                { cuit: { contains: filters.proveedor.trim() } },
              ],
            },
          },
        },
      ],
    });
  }

  if (filters.proveedorId) {
    const proveedorId = Number.parseInt(filters.proveedorId, 10);
    if (!Number.isNaN(proveedorId)) {
      compraWhere.proveedorId = proveedorId;
    }
  }

  if (filters.estado) {
    compraWhere.estado = filters.estado;
  }

  if (filters.materialId) {
    const materialId = Number.parseInt(filters.materialId, 10);
    if (!Number.isNaN(materialId)) {
      compraWhere.detalles = {
        some: {
          materialId,
        },
      };
    }
  }

  if (dateFrom || dateTo) {
    compraWhere.fecha = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  if (andConditions.length > 0) {
    compraWhere.AND = andConditions;
  }

  return compraWhere;
}

export async function getComprasData(filters: CompraFilters = {}) {
  const [compras, materiales, proveedores] = await Promise.all([
    prisma.compra.findMany({
      where: buildComprasWhere(filters),
      include: {
        proveedorRef: true,
        detalles: {
          include: {
            material: true,
          },
        },
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.material.findMany({
      where: { activo: true },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
      },
    }),
    prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: [{ razonSocial: "asc" }],
      select: {
        id: true,
        razonSocial: true,
        nombreFantasia: true,
        cuit: true,
      },
    }),
  ]);

  const comprasRegistradas = compras.filter((compra) => compra.estado !== "ANULADA");
  const comprasAnuladas = compras.filter((compra) => compra.estado === "ANULADA");

  return {
    compras,
    materiales,
    proveedores,
    summary: {
      totalCompras: compras.length,
      totalInvertido: comprasRegistradas.reduce((sum, compra) => sum + Number(compra.total), 0),
      comprasAnuladas: comprasAnuladas.length,
      totalAnulado: comprasAnuladas.reduce((sum, compra) => sum + Number(compra.total), 0),
    },
  };
}

export async function getReportesData(filters: ReportFilters = {}) {
  await syncInvoiceStatuses();
  const dateRange = buildDateRange(filters.desde, filters.hasta);
  const abonadoWhere = buildAbonadoWhere({
    localidad: filters.localidad,
    provincia: filters.provincia,
    servicio: filters.servicio,
    condicionIva: filters.condicionIva,
    deuda: filters.deuda,
  });
  const hasAbonadoScope =
    Boolean(filters.localidad) ||
    Boolean(filters.provincia) ||
    Boolean(filters.servicio) ||
    Boolean(filters.condicionIva) ||
    Boolean(filters.deuda);
  const facturaWhere: Prisma.FacturaWhereInput = {
    ...(filters.estadoFactura ? { estado: filters.estadoFactura } : {}),
    ...(dateRange ? { fechaEmision: dateRange } : {}),
  };
  const reclamoWhere: Prisma.ReclamoWhereInput = {
    ...(filters.estadoReclamo ? { estado: filters.estadoReclamo } : {}),
    ...(dateRange ? { fechaApertura: dateRange } : {}),
  };
  const pagoWhere: Prisma.PagoWhereInput = dateRange ? { fecha: dateRange } : {};
  const compraWhere: Prisma.CompraWhereInput = {
    ...(dateRange ? { fecha: dateRange } : {}),
    estado: "REGISTRADA",
  };

  if (filters.proveedor) {
    compraWhere.OR = [
      { proveedor: { contains: filters.proveedor.trim() } },
      {
        proveedorRef: {
          is: {
            OR: [
              { razonSocial: { contains: filters.proveedor.trim() } },
              { nombreFantasia: { contains: filters.proveedor.trim() } },
              { cuit: { contains: filters.proveedor.trim() } },
            ],
          },
        },
      },
    ];
  }

  if (hasAbonadoScope) {
    facturaWhere.abonado = {
      is: abonadoWhere,
    };
    reclamoWhere.abonado = {
      is: abonadoWhere,
    };
    pagoWhere.abonado = {
      is: abonadoWhere,
    };
  }

  if (filters.tecnicoId) {
    const tecnicoId = Number.parseInt(filters.tecnicoId, 10);
    if (!Number.isNaN(tecnicoId)) {
      reclamoWhere.tecnicoId = tecnicoId;
    }
  }

  if (filters.cargoFacturable === "PENDIENTE_FACTURACION") {
    reclamoWhere.materiales = {
      some: {
        facturarProximaFactura: true,
        facturado: false,
      },
    };
  }

  if (filters.cargoFacturable === "CON_MATERIALES") {
    reclamoWhere.materiales = {
      some: {},
    };
  }

  if (filters.cargoFacturable === "SIN_MATERIALES") {
    reclamoWhere.materiales = {
      none: {},
    };
  }

  const [facturas, pagos, reclamos, materiales, compras, cargosTecnicosPendientes, abonados, tecnicos, gestionesCobranza, acuerdosPago] = await Promise.all([
    prisma.factura.findMany({
      where: facturaWhere,
      include: {
        abonado: true,
        detalles: {
          include: {
            servicio: {
              include: {
                servicioCatalogo: true,
              },
            },
          },
        },
      },
      orderBy: { fechaEmision: "desc" },
      take: 100,
    }),
    prisma.pago.findMany({
      where: pagoWhere,
      include: {
        abonado: true,
        usuario: true,
      },
      orderBy: { fecha: "desc" },
      take: 100,
    }),
    prisma.reclamo.findMany({
      where: reclamoWhere,
      include: {
        abonado: true,
        tecnico: true,
        materiales: {
          include: {
            material: true,
          },
        },
      },
      orderBy: { fechaApertura: "desc" },
      take: 100,
    }),
    prisma.material.findMany({
      where: { activo: true },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    }),
    prisma.compra.findMany({
      where: compraWhere,
      include: {
        proveedorRef: true,
        detalles: {
          include: {
            material: true,
          },
        },
      },
      orderBy: { fecha: "desc" },
      take: 100,
    }),
    prisma.reclamoMaterial.count({
      where: {
        facturarProximaFactura: true,
        facturado: false,
      },
    }),
    prisma.abonado.findMany({
      where: abonadoWhere,
      include: {
        servicios: {
          include: {
            servicioCatalogo: true,
          },
          where: { estado: "ACTIVO" },
        },
        facturas: {
          where: filters.estadoFactura
            ? { estado: filters.estadoFactura }
            : { estado: { in: ["PENDIENTE", "VENCIDA"] } },
          orderBy: { fechaEmision: "desc" },
          take: 5,
        },
        reclamos: {
          where: filters.estadoReclamo
            ? { estado: filters.estadoReclamo }
            : { estado: { not: "RESUELTO" } },
          orderBy: { fechaApertura: "desc" },
          take: 5,
        },
      },
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { razonSocial: "asc" }],
      take: 100,
    }),
    prisma.usuario.findMany({
      where: {
        activo: true,
        rol: {
          in: ["ADMIN", "TECNICO"],
        },
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
      },
    }),
    prisma.gestionCobranza.findMany({
      where: {
        ...(dateRange ? { createdAt: dateRange } : {}),
        ...(hasAbonadoScope ? { abonado: { is: abonadoWhere } } : {}),
      },
      include: {
        abonado: true,
        usuario: true,
        factura: {
          select: {
            numero: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.acuerdoPago.findMany({
      where: {
        ...(dateRange ? { fechaAcuerdo: dateRange } : {}),
        ...(hasAbonadoScope ? { abonado: { is: abonadoWhere } } : {}),
      },
      include: {
        abonado: true,
        usuario: true,
        factura: {
          select: {
            numero: true,
          },
        },
        cuotas: {
          orderBy: { numeroCuota: "asc" },
        },
      },
      orderBy: { fechaAcuerdo: "desc" },
      take: 100,
    }),
  ]);

  const evolutionStart = dateRange?.gte
    ? new Date(dateRange.gte)
    : new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1);
  const evolutionEnd = dateRange?.lte ? new Date(dateRange.lte) : new Date();
  const [facturasEvolucion, pagosEvolucion, comprasEvolucion] = await Promise.all([
    prisma.factura.findMany({
      where: {
        fechaEmision: {
          gte: evolutionStart,
          lte: evolutionEnd,
        },
      },
      select: {
        fechaEmision: true,
        total: true,
      },
      orderBy: { fechaEmision: "asc" },
    }),
    prisma.pago.findMany({
      where: {
        fecha: {
          gte: evolutionStart,
          lte: evolutionEnd,
        },
        estado: "REGISTRADO",
      },
      select: {
        fecha: true,
        importe: true,
      },
      orderBy: { fecha: "asc" },
    }),
    prisma.compra.findMany({
      where: {
        fecha: {
          gte: evolutionStart,
          lte: evolutionEnd,
        },
        estado: "REGISTRADA",
      },
      select: {
        fecha: true,
        total: true,
      },
      orderBy: { fecha: "asc" },
    }),
  ]);

  const stockCritico = materiales.filter(
    (material) => Number(material.stockActual) <= Number(material.stockMinimo),
  );
  const abonadosConDeuda = abonados.filter((abonado) => abonado.facturas.length > 0);
  const abonadosConVencida = abonados.filter((abonado) =>
    abonado.facturas.some((factura) => factura.estado === "VENCIDA"),
  );
  const ticketsConMateriales = reclamos.filter((reclamo) => reclamo.materiales.length > 0);
  const ticketsPendientesFacturacion = reclamos.filter((reclamo) =>
    reclamo.materiales.some((material) => material.facturarProximaFactura && !material.facturado),
  );
  const today = new Date();
  const promesasVigentes = gestionesCobranza.filter((gestion) => gestion.estado === "PROMESA_VIGENTE");
  const promesasVencidas = promesasVigentes.filter(
    (gestion) => gestion.compromisoPagoAt && gestion.compromisoPagoAt < today,
  );
  const cuotasAcuerdoPendientes = acuerdosPago.flatMap((acuerdo) =>
    acuerdo.cuotas.filter((cuota) => cuota.estado === "PENDIENTE"),
  );
  const cuotasAcuerdoVencidas = cuotasAcuerdoPendientes.filter(
    (cuota) => cuota.fechaVencimiento < today,
  );
  const moraPorAntiguedad = [
    { label: "1 a 30 dias", min: 1, max: 30 },
    { label: "31 a 60 dias", min: 31, max: 60 },
    { label: "61 a 90 dias", min: 61, max: 90 },
    { label: "90+ dias", min: 91, max: Number.POSITIVE_INFINITY },
  ].map((bucket) => {
    const facturasBucket = facturas.filter((factura) => {
      if (!["PENDIENTE", "VENCIDA"].includes(factura.estado)) {
        return false;
      }

      const days = Math.max(
        0,
        Math.floor((today.getTime() - factura.fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24)),
      );

      return days >= bucket.min && days <= bucket.max;
    });

    return {
      label: bucket.label,
      cantidad: facturasBucket.length,
      importe: facturasBucket.reduce((sum, factura) => sum + toNumber(factura.total), 0),
    };
  });

  const productividadTecnica = Array.from(
    reclamos.reduce((map, reclamo) => {
      const key = reclamo.tecnico?.nombre ?? "Sin asignar";
      const current = map.get(key) ?? {
        tecnico: key,
        total: 0,
        resueltos: 0,
        abiertos: 0,
        materiales: 0,
      };

      current.total += 1;
      current.resueltos += reclamo.estado === "RESUELTO" ? 1 : 0;
      current.abiertos += reclamo.estado === "RESUELTO" ? 0 : 1;
      current.materiales += reclamo.materiales.length;
      map.set(key, current);
      return map;
    }, new Map<string, { tecnico: string; total: number; resueltos: number; abiertos: number; materiales: number }>()),
  )
    .map(([, value]) => value)
    .sort((a, b) => b.resueltos - a.resueltos || b.total - a.total)
    .slice(0, 8);

  const serviciosRentables = Array.from(
    facturas.reduce((map, factura) => {
      for (const detalle of factura.detalles) {
        const key =
          detalle.servicio?.servicioCatalogo?.nombre ??
          detalle.servicio?.plan ??
          detalle.descripcion;
        const current = map.get(key) ?? {
          servicio: key,
          conceptos: 0,
          importe: 0,
        };

        current.conceptos += 1;
        current.importe += toNumber(detalle.totalLinea);
        map.set(key, current);
      }

      return map;
    }, new Map<string, { servicio: string; conceptos: number; importe: number }>()),
  )
    .map(([, value]) => value)
    .sort((a, b) => b.importe - a.importe)
    .slice(0, 8);

  const evolutionMap = new Map<
    string,
    { label: string; facturado: number; cobrado: number; compras: number }
  >();
  const cursor = new Date(evolutionStart.getFullYear(), evolutionStart.getMonth(), 1);
  const endCursor = new Date(evolutionEnd.getFullYear(), evolutionEnd.getMonth(), 1);

  while (cursor <= endCursor) {
    evolutionMap.set(getMonthKey(cursor), {
      label: getMonthLabel(cursor),
      facturado: 0,
      cobrado: 0,
      compras: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const factura of facturasEvolucion) {
    const key = getMonthKey(factura.fechaEmision);
    const item = evolutionMap.get(key);
    if (item) {
      item.facturado += toNumber(factura.total);
    }
  }

  for (const pago of pagosEvolucion) {
    const key = getMonthKey(pago.fecha);
    const item = evolutionMap.get(key);
    if (item) {
      item.cobrado += toNumber(pago.importe);
    }
  }

  for (const compra of comprasEvolucion) {
    const key = getMonthKey(compra.fecha);
    const item = evolutionMap.get(key);
    if (item) {
      item.compras += toNumber(compra.total);
    }
  }

  const evolucionMensual = Array.from(evolutionMap.values());

  return {
    facturas,
    pagos,
    reclamos,
    materiales,
    stockCritico,
    compras,
    gestionesCobranza,
    acuerdosPago,
    abonados,
    tecnicos,
    moraPorAntiguedad,
    productividadTecnica,
    serviciosRentables,
    evolucionMensual,
    summary: {
      facturadoPeriodo: facturas.reduce((sum, factura) => sum + toNumber(factura.total), 0),
      cobradoPeriodo: pagos.reduce((sum, pago) => sum + toNumber(pago.importe), 0),
      pendienteActual: facturas
        .filter((factura) => ["PENDIENTE", "VENCIDA"].includes(factura.estado))
        .reduce((sum, factura) => sum + toNumber(factura.total), 0),
      vencidoActual: facturas
        .filter((factura) => factura.estado === "VENCIDA")
        .reduce((sum, factura) => sum + toNumber(factura.total), 0),
      reclamosAbiertos: reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO").length,
      stockCritico: stockCritico.length,
      comprasPeriodo: compras.reduce((sum, compra) => sum + toNumber(compra.total), 0),
      cargosTecnicosPendientes,
      facturasVencidas: facturas.filter((factura) => factura.estado === "VENCIDA").length,
      abonadosConDeuda: abonadosConDeuda.length,
      abonadosConVencida: abonadosConVencida.length,
      ticketsConMateriales: ticketsConMateriales.length,
      ticketsPendientesFacturacion: ticketsPendientesFacturacion.length,
      moraMayor90: moraPorAntiguedad.find((bucket) => bucket.label === "90+ dias")?.importe ?? 0,
      gestionesCobranza: gestionesCobranza.length,
      promesasVigentes: promesasVigentes.length,
      promesasVencidas: promesasVencidas.length,
      acuerdosPago: acuerdosPago.length,
      acuerdosVigentes: acuerdosPago.filter((acuerdo) => acuerdo.estado === "VIGENTE").length,
      cuotasAcuerdoPendientes: cuotasAcuerdoPendientes.length,
      cuotasAcuerdoVencidas: cuotasAcuerdoVencidas.length,
    },
  };
}

export async function getImportacionesData() {
  const importaciones = await prisma.importacion.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return {
    archivo: process.env.ABONADOS_TEMPLATE_PATH ?? "",
    importaciones,
  };
}

export async function getUsuariosData(currentUserId: number, search = "") {
  const query = textSearch(search);
  const [usuarios, currentUser] = await Promise.all([
    prisma.usuario.findMany({
      where: query
        ? {
            OR: [
              { nombre: { contains: query } },
              { email: { contains: query } },
              { rol: { contains: query } },
            ],
          }
        : undefined,
      orderBy: [{ rol: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    prisma.usuario.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
      },
    }),
  ]);

  return { usuarios, currentUser };
}

export async function getAuditoriaData(filters: AuditoriaFilters = {}) {
  const query = textSearch(filters.q ?? "");
  const dateRange = buildDateRange(filters.desde, filters.hasta);
  const where: Prisma.AuditoriaWhereInput = {};

  if (query) {
    where.OR = [
      { modulo: { contains: query } },
      { accion: { contains: query } },
      { entidadTipo: { contains: query } },
      { descripcion: { contains: query } },
      { actor: { is: { nombre: { contains: query } } } },
      { actor: { is: { email: { contains: query } } } },
    ];
  }

  if (filters.modulo) {
    where.modulo = filters.modulo;
  }

  if (filters.actorId) {
    const actorId = Number.parseInt(filters.actorId, 10);
    if (!Number.isNaN(actorId)) {
      where.actorId = actorId;
    }
  }

  if (dateRange) {
    where.createdAt = dateRange;
  }

  const [eventos, actores] = await Promise.all([
    prisma.auditoria.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            nombre: true,
            email: true,
            rol: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.usuario.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    }),
  ]);

  return {
    eventos,
    actores,
    summary: {
      total: eventos.length,
      modulos: new Set(eventos.map((evento) => evento.modulo)).size,
      actores: new Set(eventos.map((evento) => evento.actorId).filter(Boolean)).size,
    },
  };
}

export async function getApiAbonadosData() {
  return prisma.abonado.findMany({
    include: {
      socio: true,
      servicios: {
        include: {
          servicioCatalogo: true,
        },
        orderBy: [{ tipo: "asc" }, { plan: "asc" }],
      },
      reclamos: {
        orderBy: { fechaApertura: "desc" },
      },
    },
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { numeroAbonado: "asc" }],
  });
}
