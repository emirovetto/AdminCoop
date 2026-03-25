"use server";

import fs from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCIES,
  ARCA_INVOICE_TYPES,
  COLLECTION_CHANNELS,
  COLLECTION_OUTCOMES,
  COLLECTION_STATES,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_PRIORITIES,
  COMMUNICATION_STATES,
  COMMUNICATION_TYPES,
  PAYMENT_PLAN_INSTALLMENT_STATES,
  ARCA_WS_SERVICES,
  IVA_CONDITIONS,
  EXTERNAL_PAYMENT_STATES,
  PAYMENT_GATEWAY_MODES,
  PAYMENT_GATEWAY_PROVIDERS,
  PORTAL_INTERACTION_TYPES,
  WORK_ORDER_STATES,
  WORK_ORDER_TYPES,
  PORTAL_PUBLICATION_CATEGORIES,
  PORTAL_PUBLICATION_STATES,
  WEBHOOK_EVENT_STATES,
} from "@/lib/domain";
import {
  clearPortalSession,
  clearSession,
  createPortalSession,
  createSession,
  getCurrentPortalSession,
  getCurrentSession,
  requirePortalSession,
  requireRole,
} from "@/lib/auth";
import { finalizeExternalPayment } from "@/lib/automation-engine";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  extractExternalReference,
  extractExternalStatus,
  extractInternalReference,
  normalizeExternalPaymentState,
} from "@/lib/payment-webhook";
import { prisma } from "@/lib/prisma";
import { getMonthBounds } from "@/lib/utils";

const DEFAULT_TEMPLATE_PATH =
  "C:/Users/Noxi-PC/Downloads/PLANTILLA PARA SISTEMA DE ABONADOS.ods";

function getRequiredString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getOptionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function getOptionalInt(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function getOptionalDate(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBoolean(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value === "on" || value === "true" || value === "SI";
}

function parseDecimal(raw: string | null) {
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);

  if (!Number.isFinite(value)) {
    return null;
  }

  return new Prisma.Decimal(value.toFixed(2));
}

function getMultiInt(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => !Number.isNaN(value));
}

function splitImportedName(fullName: string) {
  const tokens = fullName
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { nombre: "Sin nombre", apellido: "Importado" };
  }

  if (tokens.length === 1) {
    return { nombre: tokens[0], apellido: "Importado" };
  }

  return {
    nombre: tokens.slice(0, -1).join(" "),
    apellido: tokens[tokens.length - 1],
  };
}

function normalizeAbonadoNumber(value: string) {
  return value.trim().toUpperCase();
}

function redirectWithMessage(pathname: string, type: "ok" | "error", message: string) {
  redirect(`${pathname}?${type}=${encodeURIComponent(message)}`);
}

function revalidateCorePaths() {
  revalidatePath("/");
  revalidatePath("/socios");
  revalidatePath("/abonados");
  revalidatePath("/ordenes");
  revalidatePath("/proveedores");
  revalidatePath("/caja");
  revalidatePath("/cuentas");
  revalidatePath("/facturacion");
  revalidatePath("/reclamos");
  revalidatePath("/stock");
  revalidatePath("/compras");
  revalidatePath("/reportes");
  revalidatePath("/usuarios");
  revalidatePath("/importaciones");
  revalidatePath("/configuracion");
  revalidatePath("/pasarelas");
  revalidatePath("/auditoria");
  revalidatePath("/comunicaciones");
  revalidatePath("/portal");
  revalidatePath("/api/socios");
  revalidatePath("/api/abonados");
  revalidatePath("/api/resumen");
}

type AuditEventInput = {
  actorId?: number | null;
  modulo: string;
  accion: string;
  entidadTipo: string;
  entidadId?: number | null;
  descripcion: string;
  detalle?: Record<string, unknown> | null;
};

async function logAuditEvent(input: AuditEventInput) {
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

async function getNextInvoiceNumber(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `FAC-${year}${month}`;
  const samePeriodInvoices = await prisma.factura.count({
    where: {
      numero: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}-${String(samePeriodInvoices + 1).padStart(4, "0")}`;
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

async function getNextAdjustmentNumber(kind: "CREDITO" | "DEBITO", date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `${kind === "CREDITO" ? "NC" : "ND"}-${year}${month}`;
  const samePeriodAdjustments = await prisma.factura.count({
    where: {
      numero: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}-${String(samePeriodAdjustments + 1).padStart(4, "0")}`;
}

async function getNextPaymentPlanNumber(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `ACD-${year}${month}`;
  const samePeriodPlans = await prisma.acuerdoPago.count({
    where: {
      numero: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}-${String(samePeriodPlans + 1).padStart(4, "0")}`;
}

async function getNextExternalPaymentReference(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `PEXT-${year}${month}`;
  const samePeriodExternalPayments = await prisma.pagoExterno.count({
    where: {
      referenciaInterna: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}-${String(samePeriodExternalPayments + 1).padStart(4, "0")}`;
}

async function getBillingConfig() {
  let config = await prisma.configuracionFacturacion.findFirst();

  if (!config) {
    config = await prisma.configuracionFacturacion.create({
      data: {
        razonSocial: "Cooperativa de Servicios",
        cuit: "30-00000000-0",
        condicionIvaEmisor: "RESPONSABLE_INSCRIPTO",
        puntoVenta: "0001",
        ambienteArca: "HOMOLOGACION",
        arcaHabilitado: false,
        tipoComprobanteDefault: "011",
        conceptoArcaDefault: "2",
        monedaCodigoDefault: "PES",
        arcaWsService: "wsfe",
      },
    });
  }

  return config;
}

async function getAutomationRule() {
  let rule = await prisma.reglaAutomatizacion.findUnique({
    where: { codigo: "COBRANZA_BASE" },
  });

  if (!rule) {
    rule = await prisma.reglaAutomatizacion.create({
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
          "Regla base para automatizaciones de corte y reconexion sobre deuda y pagos acreditados.",
      },
    });
  }

  return rule;
}

function digitsOnly(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function inferArcaDocumentType(abonado: {
  cuit?: string | null;
  tipoDocumento?: string | null;
  documento?: string | null;
  condicionIva: string;
}) {
  const cuit = digitsOnly(abonado.cuit);
  const documento = digitsOnly(abonado.documento);

  if (cuit.length === 11) {
    return { code: "80", number: cuit };
  }

  if ((abonado.tipoDocumento ?? "").toUpperCase() === "PASAPORTE" && documento) {
    return { code: "94", number: documento };
  }

  if (documento) {
    return { code: "96", number: documento };
  }

  if (abonado.condicionIva === "CONSUMIDOR_FINAL") {
    return { code: "99", number: "0" };
  }

  return { code: "99", number: "0" };
}

function inferArcaInvoiceType(
  config: { condicionIvaEmisor: string; tipoComprobanteDefault: string },
  abonado: { condicionIva: string },
) {
  if (config.condicionIvaEmisor !== "RESPONSABLE_INSCRIPTO") {
    return config.tipoComprobanteDefault || "011";
  }

  if (["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO"].includes(abonado.condicionIva)) {
    return "001";
  }

  return "006";
}

function mapAdjustmentInvoiceType(baseCode: string, kind: "CREDITO" | "DEBITO") {
  const map: Record<string, { credito: string; debito: string }> = {
    "001": { credito: "003", debito: "002" },
    "006": { credito: "008", debito: "007" },
    "011": { credito: "013", debito: "012" },
    "003": { credito: "003", debito: "002" },
    "008": { credito: "008", debito: "007" },
    "013": { credito: "013", debito: "012" },
    "002": { credito: "003", debito: "002" },
    "007": { credito: "008", debito: "007" },
    "012": { credito: "013", debito: "012" },
  };

  const family = map[baseCode] ?? { credito: "013", debito: "012" };
  return kind === "CREDITO" ? family.credito : family.debito;
}

function calculateTax(baseAmount: Prisma.Decimal, taxRate: Prisma.Decimal) {
  return baseAmount.mul(taxRate).div(new Prisma.Decimal(100));
}

function sanitizeContractCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

function getOrderInitialState(tecnicoId?: number | null) {
  return tecnicoId ? "ASIGNADA" : "PENDIENTE";
}

function getServiceStateFromResolvedOrder(tipo: string) {
  switch (tipo) {
    case "INSTALACION":
    case "RECONEXION":
      return "ACTIVO";
    case "CORTE":
      return "SUSPENDIDO";
    case "BAJA":
      return "BAJA";
    default:
      return null;
  }
}

function getPeriodicidadMeses(periodicidad: string | null | undefined) {
  switch (periodicidad) {
    case "BIMESTRAL":
      return 2;
    case "TRIMESTRAL":
      return 3;
    case "UNICO":
      return Number.POSITIVE_INFINITY;
    case "MENSUAL":
    default:
      return 1;
  }
}

function getMonthDiff(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function shouldBillServiceForPeriod(
  periodicidad: string | null | undefined,
  lastBilledAt: Date | null,
  currentDate: Date,
) {
  if (!lastBilledAt) {
    return true;
  }

  if (periodicidad === "UNICO") {
    return false;
  }

  const monthsRequired = getPeriodicidadMeses(periodicidad);
  return getMonthDiff(lastBilledAt, currentDate) >= monthsRequired;
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

async function registerPaymentInAccount(
  tx: Prisma.TransactionClient,
  input: {
    abonadoId: number;
    usuarioId: number;
    medioPago: string;
    importe: Prisma.Decimal;
    fecha: Date;
    descripcion: string;
    pagoExternoId?: number | null;
  },
) {
  const numeroRecibo = await getNextReceiptNumber(input.fecha);

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

  return { pago, numeroRecibo };
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
    return {
      allowed: true,
      reasons: [] as string[],
    };
  }

  const reasons: string[] = [];
  const now = new Date();
  const oldestDue = input.facturasVencidas
    .slice()
    .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())[0];
  const minAmount = new Prisma.Decimal(input.rule.montoMinimoCorte.toString());

  if (input.facturasVencidas.length < input.rule.minFacturasVencidasParaCorte) {
    reasons.push(
      `Requiere al menos ${input.rule.minFacturasVencidasParaCorte} factura/s vencida/s para generar corte.`,
    );
  }

  if (input.deudaVencida.lessThan(minAmount)) {
    reasons.push(`La deuda vencida no alcanza el minimo configurado para corte.`);
  }

  if (input.rule.bloquearConPromesaVigente && input.promesaVigente) {
    reasons.push("Existe una promesa de pago vigente y la regla bloquea el corte.");
  }

  if (input.rule.bloquearConAcuerdoVigente && input.acuerdoVigente) {
    reasons.push("Existe un acuerdo vigente y la regla bloquea el corte.");
  }

  if (oldestDue) {
    const graceBoundary = new Date(oldestDue.fechaVencimiento);
    graceBoundary.setDate(graceBoundary.getDate() + input.rule.diasGraciaCorte);
    if (graceBoundary > now) {
      reasons.push(`Todavia no se cumplio la gracia minima configurada para corte.`);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

async function createReconnectionOrdersForAbonado(
  tx: Prisma.TransactionClient,
  input: {
    abonadoId: number;
    actorId: number;
    motivo: string;
  },
) {
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
      actorId: input.actorId,
      modulo: "AUTOMATIZACIONES",
      accion: "CREATE_RECONNECTION_ORDERS",
      entidadTipo: "ORDEN_TRABAJO",
      descripcion: `Se generaron ${created.length} ordenes de reconexion automáticas.`,
      detalle: {
        abonadoId: input.abonadoId,
        ordenes: created.map((item) => item.id),
      },
    });
  }

  return created;
}

export async function loginAction(formData: FormData) {
  const email = getRequiredString(formData, "email").toLowerCase();
  const password = getRequiredString(formData, "password");

  if (!email || !password) {
    redirectWithMessage("/login", "error", "Completa email y contrasena.");
  }

  const user = await prisma.usuario.findUnique({
    where: { email },
  });

  if (!user || !user.activo || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    redirectWithMessage("/login", "error", "Credenciales invalidas.");
  }

  const currentUser = user!;

  await prisma.usuario.update({
    where: { id: currentUser.id },
    data: { lastLoginAt: new Date() },
  });

  await logAuditEvent({
    actorId: currentUser.id,
    modulo: "AUTH",
    accion: "LOGIN",
    entidadTipo: "USUARIO",
    entidadId: currentUser.id,
    descripcion: `Inicio de sesion de ${currentUser.email}.`,
    detalle: {
      rol: currentUser.rol,
      email: currentUser.email,
    },
  });

  await createSession(currentUser.id, currentUser.rol);
  redirect("/");
}

export async function logoutAction() {
  const session = await getCurrentSession();
  if (session) {
    await logAuditEvent({
      actorId: session.id,
      modulo: "AUTH",
      accion: "LOGOUT",
      entidadTipo: "USUARIO",
      entidadId: session.id,
      descripcion: `Cierre de sesion de ${session.email}.`,
      detalle: {
        rol: session.rol,
        email: session.email,
      },
    });
  }

  await clearSession();
  redirect("/login");
}

export async function portalLoginAction(formData: FormData) {
  const numeroAbonado = getRequiredString(formData, "numeroAbonado").toUpperCase();
  const password = getRequiredString(formData, "password");

  if (!numeroAbonado || !password) {
    redirectWithMessage("/portal-cliente/login", "error", "Completa numero de abonado y contrasena.");
  }

  const abonado = await prisma.abonado.findUnique({
    where: { numeroAbonado },
    select: {
      id: true,
      numeroAbonado: true,
      portalActivo: true,
      portalPasswordHash: true,
      nombre: true,
      apellido: true,
      razonSocial: true,
    },
  });

  if (!abonado) {
    return redirectWithMessage("/portal-cliente/login", "error", "Credenciales invalidas del portal.");
  }

  if (!abonado.portalActivo || !abonado.portalPasswordHash || !verifyPassword(password, abonado.portalPasswordHash)) {
    return redirectWithMessage("/portal-cliente/login", "error", "Credenciales invalidas del portal.");
  }

  const currentAbonado = abonado;

  await prisma.abonado.update({
    where: { id: currentAbonado.id },
    data: {
      portalUltimoAccesoAt: new Date(),
    },
  });

  await logAuditEvent({
    modulo: "PORTAL",
    accion: "PORTAL_LOGIN",
    entidadTipo: "ABONADO",
    entidadId: currentAbonado.id,
    descripcion: `Ingreso del abonado ${currentAbonado.numeroAbonado} a la oficina virtual.`,
    detalle: {
      numeroAbonado: currentAbonado.numeroAbonado,
    },
  });

  await createPortalSession(currentAbonado.id);
  redirect("/portal-cliente");
}

export async function portalLogoutAction() {
  const abonado = await getCurrentPortalSession();
  if (abonado) {
    await logAuditEvent({
      modulo: "PORTAL",
      accion: "PORTAL_LOGOUT",
      entidadTipo: "ABONADO",
      entidadId: abonado.id,
      descripcion: `Cierre de sesion del abonado ${abonado.numeroAbonado} en la oficina virtual.`,
      detalle: {
        numeroAbonado: abonado.numeroAbonado,
      },
    });
  }

  await clearPortalSession();
  redirect("/portal-cliente/login");
}

export async function portalChangePasswordAction(formData: FormData) {
  const abonado = await requirePortalSession();
  const currentPassword = getRequiredString(formData, "currentPassword");
  const newPassword = getRequiredString(formData, "newPassword");
  const confirmPassword = getRequiredString(formData, "confirmPassword");

  if (!currentPassword || !newPassword || !confirmPassword) {
    redirectWithMessage("/portal-cliente", "error", "Completa todos los campos de contrasena del portal.");
  }

  if (newPassword.length < 8) {
    redirectWithMessage("/portal-cliente", "error", "La nueva contrasena del portal debe tener al menos 8 caracteres.");
  }

  if (newPassword !== confirmPassword) {
    redirectWithMessage("/portal-cliente", "error", "La confirmacion no coincide con la nueva contrasena.");
  }

  const current = await prisma.abonado.findUnique({
    where: { id: abonado.id },
    select: {
      portalPasswordHash: true,
      numeroAbonado: true,
    },
  });

  if (!current?.portalPasswordHash || !verifyPassword(currentPassword, current.portalPasswordHash)) {
    return redirectWithMessage("/portal-cliente", "error", "La contrasena actual del portal no es correcta.");
  }

  const currentPortalAccess = current;

  await prisma.abonado.update({
    where: { id: abonado.id },
    data: {
      portalPasswordHash: hashPassword(newPassword),
    },
  });

  await logAuditEvent({
    modulo: "PORTAL",
    accion: "PORTAL_CHANGE_PASSWORD",
    entidadTipo: "ABONADO",
    entidadId: abonado.id,
    descripcion: `Cambio de contrasena del portal para ${currentPortalAccess.numeroAbonado}.`,
  });

  revalidateCorePaths();
  redirectWithMessage("/portal-cliente", "ok", "Contrasena del portal actualizada correctamente.");
}

export async function createPortalSupportRequestAction(formData: FormData) {
  const abonado = await requirePortalSession();
  const tipoServicio = getRequiredString(formData, "tipoServicio");
  const descripcion = getRequiredString(formData, "descripcion");

  if (!tipoServicio || !descripcion) {
    redirectWithMessage("/portal-cliente", "error", "Completa el servicio y la descripcion del ticket.");
  }

  const reclamo = await prisma.reclamo.create({
    data: {
      abonadoId: abonado.id,
      tecnicoId: null,
      tipoServicio,
      descripcion,
      estado: "ABIERTO",
      prioridad: "MEDIA",
      fechaApertura: new Date(),
      diagnosticoCierre: null,
      resolucionCierre: null,
    },
  });

  await logAuditEvent({
    modulo: "PORTAL",
    accion: "PORTAL_CREATE_TICKET",
    entidadTipo: "RECLAMO",
    entidadId: reclamo.id,
    descripcion: `Ticket generado desde oficina virtual para ${abonado.numeroAbonado}.`,
    detalle: {
      tipoServicio,
    },
  });

  revalidateCorePaths();
  revalidatePath(`/oficina-virtual/${abonado.id}`);
  redirectWithMessage("/portal-cliente", "ok", `Ticket creado correctamente (#${reclamo.id}).`);
}

export async function createUsuarioAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const nombre = getRequiredString(formData, "nombre");
  const email = getRequiredString(formData, "email").toLowerCase();
  const rol = getRequiredString(formData, "rol");
  const password = getRequiredString(formData, "password");

  if (!nombre || !email || !rol || !password) {
    redirectWithMessage("/usuarios", "error", "Completa nombre, email, rol y contrasena.");
  }

  const existing = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    redirectWithMessage("/usuarios", "error", "Ya existe un usuario con ese email.");
  }

  const usuario = await prisma.usuario.create({
    data: {
      nombre,
      email,
      rol,
      activo: true,
      passwordHash: hashPassword(password),
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "USUARIOS",
    accion: "CREATE",
    entidadTipo: "USUARIO",
    entidadId: usuario.id,
    descripcion: `Alta de usuario interno ${email}.`,
    detalle: {
      rol,
      email,
      nombre,
    },
  });

  revalidatePath("/usuarios");
  redirectWithMessage("/usuarios", "ok", "Usuario interno creado correctamente.");
}

export async function resetUsuarioPasswordAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const usuarioId = getOptionalInt(formData, "usuarioId");
  const nuevaPassword = getRequiredString(formData, "nuevaPassword");

  if (!usuarioId || !nuevaPassword) {
    redirectWithMessage("/usuarios", "error", "Completa usuario y nueva contrasena.");
  }

  const usuarioIdValue = usuarioId!;

  await prisma.usuario.update({
    where: { id: usuarioIdValue },
    data: {
      passwordHash: hashPassword(nuevaPassword),
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "USUARIOS",
    accion: "RESET_PASSWORD",
    entidadTipo: "USUARIO",
    entidadId: usuarioIdValue,
    descripcion: `Reset de contrasena para usuario ${usuarioIdValue}.`,
  });

  revalidatePath("/usuarios");
  redirectWithMessage("/usuarios", "ok", "Contrasena reseteada correctamente.");
}

export async function toggleUsuarioActivoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const usuarioId = getOptionalInt(formData, "usuarioId");

  if (!usuarioId) {
    redirectWithMessage("/usuarios", "error", "No se pudo identificar el usuario.");
  }

  const usuarioIdValue = usuarioId!;

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioIdValue },
    select: { activo: true },
  });

  if (!usuario) {
    redirectWithMessage("/usuarios", "error", "Usuario no encontrado.");
  }

  const currentUsuario = usuario!;
  const nextValue = !currentUsuario.activo;
  await prisma.usuario.update({
    where: { id: usuarioIdValue },
    data: { activo: nextValue },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "USUARIOS",
    accion: nextValue ? "ACTIVAR" : "DESACTIVAR",
    entidadTipo: "USUARIO",
    entidadId: usuarioIdValue,
    descripcion: `Usuario ${usuarioIdValue} ${nextValue ? "activado" : "desactivado"}.`,
  });

  revalidatePath("/usuarios");
  redirectWithMessage(
    "/usuarios",
    "ok",
    `Usuario ${nextValue ? "activado" : "desactivado"} correctamente.`,
  );
}

export async function changeOwnPasswordAction(formData: FormData) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const currentPassword = getRequiredString(formData, "currentPassword");
  const newPassword = getRequiredString(formData, "newPassword");
  const confirmPassword = getRequiredString(formData, "confirmPassword");

  if (!currentPassword || !newPassword || !confirmPassword) {
    redirectWithMessage("/usuarios", "error", "Completa todos los campos de contrasena.");
  }

  if (newPassword.length < 8) {
    redirectWithMessage("/usuarios", "error", "La nueva contrasena debe tener al menos 8 caracteres.");
  }

  if (newPassword !== confirmPassword) {
    redirectWithMessage("/usuarios", "error", "La confirmacion no coincide con la nueva contrasena.");
  }

  const user = await prisma.usuario.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  if (!user?.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
    redirectWithMessage("/usuarios", "error", "La contrasena actual no es correcta.");
  }

  await prisma.usuario.update({
    where: { id: session.id },
    data: {
      passwordHash: hashPassword(newPassword),
    },
  });

  await logAuditEvent({
    actorId: session.id,
    modulo: "USUARIOS",
    accion: "CHANGE_PASSWORD",
    entidadTipo: "USUARIO",
    entidadId: session.id,
    descripcion: "Cambio de contrasena propia.",
  });

  revalidatePath("/usuarios");
  redirectWithMessage("/usuarios", "ok", "Tu contrasena fue actualizada.");
}

export async function createSocioAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const nombre = getRequiredString(formData, "nombre");
  const apellido = getRequiredString(formData, "apellido");
  const dni = getRequiredString(formData, "dni");
  const email = getOptionalString(formData, "email");
  const telefono = getOptionalString(formData, "telefono");

  if (!nombre || !apellido || !dni) {
    redirectWithMessage("/socios", "error", "Completa nombre, apellido y DNI.");
  }

  const existing = await prisma.socio.findUnique({
    where: { dni },
    select: { id: true },
  });

  if (existing) {
    redirectWithMessage("/socios", "error", "Ya existe un socio con ese DNI.");
  }

  const socio = await prisma.socio.create({
    data: {
      nombre,
      apellido,
      dni,
      email,
      telefono,
      estado: "ACTIVO",
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "SOCIOS",
    accion: "CREATE",
    entidadTipo: "SOCIO",
    entidadId: socio.id,
    descripcion: `Alta de socio ${apellido}, ${nombre}.`,
    detalle: { dni },
  });

  revalidateCorePaths();
  redirectWithMessage("/socios", "ok", "Socio creado correctamente.");
}

export async function toggleSocioStatusAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const socioId = getOptionalInt(formData, "socioId");

  if (!socioId) {
    redirectWithMessage("/socios", "error", "No se pudo identificar el socio.");
  }

  const socioIdValue = socioId!;

  const socio = await prisma.socio.findUnique({
    where: { id: socioIdValue },
    select: { estado: true },
  });

  if (!socio) {
    redirectWithMessage("/socios", "error", "Socio no encontrado.");
  }

  const currentSocio = socio!;
  const nextStatus = currentSocio.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

  await prisma.socio.update({
    where: { id: socioIdValue },
    data: { estado: nextStatus },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "SOCIOS",
    accion: "STATUS",
    entidadTipo: "SOCIO",
    entidadId: socioIdValue,
    descripcion: `Cambio de estado de socio a ${nextStatus}.`,
  });

  revalidateCorePaths();
  redirectWithMessage("/socios", "ok", `Socio actualizado a estado ${nextStatus}.`);
}

export async function updateSocioAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const socioId = getOptionalInt(formData, "socioId");
  const nombre = getRequiredString(formData, "nombre");
  const apellido = getRequiredString(formData, "apellido");
  const dni = getRequiredString(formData, "dni");
  const email = getOptionalString(formData, "email");
  const telefono = getOptionalString(formData, "telefono");
  const estado = getRequiredString(formData, "estado") || "ACTIVO";

  if (!socioId || !nombre || !apellido || !dni) {
    redirectWithMessage("/socios", "error", "Completa id, nombre, apellido y DNI para editar el socio.");
  }

  const socioIdValue = socioId!;
  const duplicate = await prisma.socio.findFirst({
    where: {
      dni,
      id: { not: socioIdValue },
    },
    select: { id: true },
  });

  if (duplicate) {
    redirectWithMessage("/socios", "error", "Ya existe otro socio con ese DNI.");
  }

  await prisma.socio.update({
    where: { id: socioIdValue },
    data: {
      nombre,
      apellido,
      dni,
      email,
      telefono,
      estado,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "SOCIOS",
    accion: "UPDATE",
    entidadTipo: "SOCIO",
    entidadId: socioIdValue,
    descripcion: `Actualizacion de socio ${socioIdValue}.`,
    detalle: { nombre, apellido, dni, estado },
  });

  revalidateCorePaths();
  redirectWithMessage("/socios", "ok", "Socio actualizado correctamente.");
}

export async function createServicioCatalogoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const codigo = getRequiredString(formData, "codigo").toUpperCase();
  const nombre = getRequiredString(formData, "nombre");
  const categoria = getRequiredString(formData, "categoria");
  const descripcion = getOptionalString(formData, "descripcion");
  const periodicidad = getRequiredString(formData, "periodicidad");
  const condicionIva = getRequiredString(formData, "condicionIva");
  const precioBase = parseDecimal(getRequiredString(formData, "precioBase"));
  const alicuotaIva = parseDecimal(getRequiredString(formData, "alicuotaIva"));

  if (!codigo || !nombre || !categoria || !periodicidad || !condicionIva || !precioBase || !alicuotaIva) {
    redirectWithMessage(
      "/configuracion",
      "error",
      "Completa codigo, nombre, categoria, periodicidad, condicion IVA, precio y alicuota.",
    );
  }

  const precioBaseValue = precioBase!;
  const alicuotaIvaValue = alicuotaIva!;

  const existing = await prisma.servicioCatalogo.findUnique({
    where: { codigo },
    select: { id: true },
  });

  if (existing) {
    redirectWithMessage("/configuracion", "error", "Ya existe un servicio global con ese codigo.");
  }

  const servicioCatalogo = await prisma.servicioCatalogo.create({
    data: {
      codigo,
      nombre,
      categoria,
      descripcion,
      periodicidad,
      condicionIva,
      precioBase: precioBaseValue,
      alicuotaIva: alicuotaIvaValue,
      conceptoFacturado: "SERVICIO",
      activo: true,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "CONFIGURACION",
    accion: "CREATE_SERVICE",
    entidadTipo: "SERVICIO_CATALOGO",
    entidadId: servicioCatalogo.id,
    descripcion: `Alta de servicio global ${codigo}.`,
    detalle: {
      nombre,
      categoria,
      periodicidad,
      precioBase: precioBaseValue.toString(),
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/configuracion", "ok", "Servicio global creado correctamente.");
}

export async function updateServicioCatalogoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const servicioId = getOptionalInt(formData, "servicioId");
  const codigo = getRequiredString(formData, "codigo").toUpperCase();
  const nombre = getRequiredString(formData, "nombre");
  const categoria = getRequiredString(formData, "categoria");
  const descripcion = getOptionalString(formData, "descripcion");
  const periodicidad = getRequiredString(formData, "periodicidad");
  const condicionIva = getRequiredString(formData, "condicionIva");
  const precioBase = parseDecimal(getRequiredString(formData, "precioBase"));
  const alicuotaIva = parseDecimal(getRequiredString(formData, "alicuotaIva"));
  const activo = getRequiredString(formData, "activo") !== "NO";

  if (!servicioId || !codigo || !nombre || !categoria || !periodicidad || !condicionIva || !precioBase || !alicuotaIva) {
    redirectWithMessage(
      "/configuracion",
      "error",
      "Completa todos los campos obligatorios para actualizar el servicio global.",
    );
  }

  const servicioIdValue = servicioId!;
  const duplicate = await prisma.servicioCatalogo.findFirst({
    where: {
      codigo,
      id: { not: servicioIdValue },
    },
    select: { id: true },
  });

  if (duplicate) {
    redirectWithMessage("/configuracion", "error", "Ya existe otro servicio global con ese codigo.");
  }

  await prisma.servicioCatalogo.update({
    where: { id: servicioIdValue },
    data: {
      codigo,
      nombre,
      categoria,
      descripcion,
      periodicidad,
      condicionIva,
      precioBase: precioBase!,
      alicuotaIva: alicuotaIva!,
      activo,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "CONFIGURACION",
    accion: "UPDATE_SERVICE",
    entidadTipo: "SERVICIO_CATALOGO",
    entidadId: servicioIdValue,
    descripcion: `Actualizacion de servicio global ${codigo}.`,
    detalle: {
      nombre,
      categoria,
      periodicidad,
      activo,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/configuracion", "ok", "Servicio global actualizado.");
}

export async function createMaterialAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const redirectTo = getOptionalString(formData, "redirectTo") ?? "/stock";
  const codigo = sanitizeContractCode(getRequiredString(formData, "codigo"));
  const nombre = getRequiredString(formData, "nombre");
  const categoria = getRequiredString(formData, "categoria");
  const unidad = getRequiredString(formData, "unidad") || "UN";
  const stockMinimo = parseDecimal(getRequiredString(formData, "stockMinimo"));
  const precioFacturable = parseDecimal(getOptionalString(formData, "precioFacturable"));
  const ivaAlicuota = parseDecimal(getRequiredString(formData, "ivaAlicuota"));
  const observaciones = getOptionalString(formData, "observaciones");
  const facturable = getBoolean(formData, "facturable");

  if (!codigo || !nombre || !categoria || !stockMinimo || !ivaAlicuota) {
    redirectWithMessage(
      redirectTo,
      "error",
      "Completa codigo, nombre, categoria, stock minimo y alicuota para el material.",
    );
  }

  const existing = await prisma.material.findUnique({
    where: { codigo },
    select: { id: true },
  });

  if (existing) {
    redirectWithMessage(redirectTo, "error", "Ya existe un material con ese codigo.");
  }

  const material = await prisma.material.create({
    data: {
      codigo,
      nombre,
      categoria,
      unidad,
      stockMinimo: stockMinimo!,
      precioFacturable: precioFacturable ?? null,
      ivaAlicuota: ivaAlicuota!,
      facturable,
      activo: true,
      observaciones,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "STOCK",
    accion: "CREATE_MATERIAL",
    entidadTipo: "MATERIAL",
    entidadId: material.id,
    descripcion: `Alta de material ${codigo}.`,
    detalle: {
      nombre,
      categoria,
      unidad,
      facturable,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(redirectTo, "ok", "Material creado correctamente.");
}

export async function updateMaterialAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const redirectTo = getOptionalString(formData, "redirectTo") ?? "/stock";
  const materialId = getOptionalInt(formData, "materialId");
  const codigo = sanitizeContractCode(getRequiredString(formData, "codigo"));
  const nombre = getRequiredString(formData, "nombre");
  const categoria = getRequiredString(formData, "categoria");
  const unidad = getRequiredString(formData, "unidad") || "UN";
  const stockMinimo = parseDecimal(getRequiredString(formData, "stockMinimo"));
  const precioFacturable = parseDecimal(getOptionalString(formData, "precioFacturable"));
  const ivaAlicuota = parseDecimal(getRequiredString(formData, "ivaAlicuota"));
  const observaciones = getOptionalString(formData, "observaciones");
  const facturable = getRequiredString(formData, "facturable") !== "NO";
  const activo = getRequiredString(formData, "activo") !== "NO";

  if (!materialId || !codigo || !nombre || !categoria || !stockMinimo || !ivaAlicuota) {
    redirectWithMessage(
      redirectTo,
      "error",
      "Completa todos los campos obligatorios para actualizar el material.",
    );
  }

  const materialIdValue = materialId!;
  const duplicate = await prisma.material.findFirst({
    where: {
      codigo,
      id: { not: materialIdValue },
    },
    select: { id: true },
  });

  if (duplicate) {
    redirectWithMessage(redirectTo, "error", "Ya existe otro material con ese codigo.");
  }

  await prisma.material.update({
    where: { id: materialIdValue },
    data: {
      codigo,
      nombre,
      categoria,
      unidad,
      stockMinimo: stockMinimo!,
      precioFacturable: precioFacturable ?? null,
      ivaAlicuota: ivaAlicuota!,
      observaciones,
      facturable,
      activo,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "STOCK",
    accion: "UPDATE_MATERIAL",
    entidadTipo: "MATERIAL",
    entidadId: materialIdValue,
    descripcion: `Actualizacion de material ${codigo}.`,
    detalle: {
      nombre,
      categoria,
      activo,
      facturable,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(redirectTo, "ok", "Material actualizado correctamente.");
}

export async function createProveedorAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const razonSocial = getRequiredString(formData, "razonSocial");
  const nombreFantasia = getOptionalString(formData, "nombreFantasia");
  const cuit = getOptionalString(formData, "cuit");
  const email = getOptionalString(formData, "email");
  const telefono = getOptionalString(formData, "telefono");
  const direccion = getOptionalString(formData, "direccion");
  const localidad = getOptionalString(formData, "localidad");
  const provincia = getOptionalString(formData, "provincia");
  const condicionIva = getRequiredString(formData, "condicionIva");
  const observaciones = getOptionalString(formData, "observaciones");

  if (!razonSocial || !condicionIva) {
    redirectWithMessage("/proveedores", "error", "Completa razon social y condicion IVA.");
  }

  if (!IVA_CONDITIONS.includes(condicionIva as (typeof IVA_CONDITIONS)[number])) {
    redirectWithMessage("/proveedores", "error", "La condicion frente al IVA no es valida.");
  }

  if (cuit) {
    const existing = await prisma.proveedor.findUnique({
      where: { cuit },
      select: { id: true },
    });

    if (existing) {
      redirectWithMessage("/proveedores", "error", "Ya existe un proveedor con ese CUIT.");
    }
  }

  const proveedor = await prisma.proveedor.create({
    data: {
      razonSocial,
      nombreFantasia,
      cuit,
      email,
      telefono,
      direccion,
      localidad,
      provincia,
      condicionIva,
      observaciones,
      activo: true,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PROVEEDORES",
    accion: "CREATE",
    entidadTipo: "PROVEEDOR",
    entidadId: proveedor.id,
    descripcion: `Alta de proveedor ${razonSocial}.`,
    detalle: {
      cuit,
      condicionIva,
      localidad,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/proveedores", "ok", "Proveedor creado correctamente.");
}

export async function updateProveedorAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const proveedorId = getOptionalInt(formData, "proveedorId");
  const razonSocial = getRequiredString(formData, "razonSocial");
  const nombreFantasia = getOptionalString(formData, "nombreFantasia");
  const cuit = getOptionalString(formData, "cuit");
  const email = getOptionalString(formData, "email");
  const telefono = getOptionalString(formData, "telefono");
  const direccion = getOptionalString(formData, "direccion");
  const localidad = getOptionalString(formData, "localidad");
  const provincia = getOptionalString(formData, "provincia");
  const condicionIva = getRequiredString(formData, "condicionIva");
  const observaciones = getOptionalString(formData, "observaciones");
  const activo = getRequiredString(formData, "activo") !== "NO";

  if (!proveedorId || !razonSocial || !condicionIva) {
    redirectWithMessage("/proveedores", "error", "Completa los datos obligatorios del proveedor.");
  }

  if (!IVA_CONDITIONS.includes(condicionIva as (typeof IVA_CONDITIONS)[number])) {
    redirectWithMessage("/proveedores", "error", "La condicion frente al IVA no es valida.");
  }

  const proveedorIdValue = proveedorId!;

  if (cuit) {
    const duplicate = await prisma.proveedor.findFirst({
      where: {
        cuit,
        id: { not: proveedorIdValue },
      },
      select: { id: true },
    });

    if (duplicate) {
      redirectWithMessage("/proveedores", "error", "Ya existe otro proveedor con ese CUIT.");
    }
  }

  await prisma.proveedor.update({
    where: { id: proveedorIdValue },
    data: {
      razonSocial,
      nombreFantasia,
      cuit,
      email,
      telefono,
      direccion,
      localidad,
      provincia,
      condicionIva,
      observaciones,
      activo,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PROVEEDORES",
    accion: "UPDATE",
    entidadTipo: "PROVEEDOR",
    entidadId: proveedorIdValue,
    descripcion: `Actualizacion de proveedor ${razonSocial}.`,
    detalle: {
      cuit,
      condicionIva,
      activo,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/proveedores", "ok", "Proveedor actualizado correctamente.");
}

export async function adjustMaterialStockAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const materialId = getOptionalInt(formData, "materialId");
  const ajusteCantidad = parseDecimal(getRequiredString(formData, "ajusteCantidad"));
  const descripcion = getOptionalString(formData, "descripcion") ?? "Ajuste manual de stock";

  if (!materialId || !ajusteCantidad) {
    redirectWithMessage("/stock", "error", "Completa material y cantidad de ajuste.");
  }

  const materialIdValue = materialId!;
  const ajusteValue = ajusteCantidad!;
  const material = await prisma.material.findUnique({
    where: { id: materialIdValue },
    select: {
      id: true,
      nombre: true,
      stockActual: true,
      costoPromedio: true,
    },
  });

  if (!material) {
    redirectWithMessage("/stock", "error", "Material no encontrado para el ajuste.");
  }

  const currentMaterial = material!;
  const nuevoStock = new Prisma.Decimal(currentMaterial.stockActual.toString()).add(ajusteValue);

  if (nuevoStock.lessThan(new Prisma.Decimal(0))) {
    redirectWithMessage("/stock", "error", "El ajuste deja el stock en negativo. Corrige la cantidad.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.material.update({
      where: { id: currentMaterial.id },
      data: {
        stockActual: nuevoStock,
      },
    });

    await tx.movimientoStock.create({
      data: {
        materialId: currentMaterial.id,
        tipo: "AJUSTE_MANUAL",
        cantidad: ajusteValue,
        costoUnitario: currentMaterial.costoPromedio,
        descripcion,
      },
    });
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "STOCK",
    accion: "AJUSTE_MANUAL",
    entidadTipo: "MATERIAL",
    entidadId: currentMaterial.id,
    descripcion: `Ajuste manual de stock para ${currentMaterial.nombre}.`,
    detalle: {
      cantidad: ajusteValue.toString(),
      descripcion,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/stock", "ok", `Stock de ${currentMaterial.nombre} ajustado correctamente.`);
}

export async function registerCompraAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const proveedorId = getOptionalInt(formData, "proveedorId");
  const proveedorManual = getOptionalString(formData, "proveedor");
  const comprobante = getOptionalString(formData, "comprobante");
  const fecha = getOptionalDate(formData, "fecha") ?? new Date();
  const observaciones = getOptionalString(formData, "observaciones");
  const materialIds = formData.getAll("materialId").map((value) => String(value).trim());
  const cantidades = formData.getAll("cantidad").map((value) => String(value).trim());
  const costosUnitarios = formData.getAll("costoUnitario").map((value) => String(value).trim());

  const lineItems = materialIds
    .map((materialIdRaw, index) => {
      const cantidadRaw = cantidades[index] ?? "";
      const costoUnitarioRaw = costosUnitarios[index] ?? "";
      const hasAnyValue = Boolean(materialIdRaw || cantidadRaw || costoUnitarioRaw);

      if (!hasAnyValue) {
        return null;
      }

      const materialId = Number.parseInt(materialIdRaw, 10);
      const cantidad = parseDecimal(cantidadRaw);
      const costoUnitario = parseDecimal(costoUnitarioRaw);

      if (Number.isNaN(materialId) || !cantidad || !costoUnitario) {
        redirectWithMessage(
          "/compras",
          "error",
          `Completa correctamente material, cantidad y costo unitario en la linea ${index + 1}.`,
        );
      }

      return {
        materialId,
        cantidad: cantidad!,
        costoUnitario: costoUnitario!,
        subtotal: cantidad!.mul(costoUnitario!),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  let proveedorNombre = proveedorManual ?? "";
  let proveedorRefId: number | null = proveedorId ?? null;

  if (proveedorId) {
    const proveedorRef = await prisma.proveedor.findUnique({
      where: { id: proveedorId },
      select: {
        id: true,
        razonSocial: true,
      },
    });

    if (!proveedorRef) {
      redirectWithMessage("/compras", "error", "El proveedor seleccionado ya no existe.");
    }

    proveedorRefId = proveedorRef!.id;
    proveedorNombre = proveedorRef!.razonSocial;
  }

  if (!proveedorNombre || lineItems.length === 0) {
    redirectWithMessage(
      "/compras",
      "error",
      "Completa proveedor y al menos una linea de material para registrar la compra.",
    );
  }

  const materialIdsUnicos = Array.from(new Set(lineItems.map((item) => item.materialId)));
  const materiales = await prisma.material.findMany({
    where: {
      id: {
        in: materialIdsUnicos,
      },
    },
    select: {
      id: true,
      nombre: true,
      stockActual: true,
    },
  });

  if (materiales.length !== materialIdsUnicos.length) {
    redirectWithMessage("/compras", "error", "Uno de los materiales seleccionados ya no existe.");
  }

  const materialesMap = new Map(materiales.map((material) => [material.id, material]));
  const totalCompra = lineItems.reduce(
    (sum, item) => sum.add(item.subtotal),
    new Prisma.Decimal(0),
  );

  const stockAdjustments = materialIdsUnicos.map((materialId) => {
    const material = materialesMap.get(materialId)!;
    const lineasMaterial = lineItems.filter((item) => item.materialId === materialId);
    const cantidadTotal = lineasMaterial.reduce(
      (sum, item) => sum.add(item.cantidad),
      new Prisma.Decimal(0),
    );
    const ultimoCosto = lineasMaterial[lineasMaterial.length - 1]!.costoUnitario;

    return {
      materialId,
      nombre: material.nombre,
      nuevoStock: new Prisma.Decimal(material.stockActual.toString()).add(cantidadTotal),
      costoPromedio: ultimoCosto,
    };
  });

  let compraRegistradaId = 0;
  await prisma.$transaction(async (tx) => {
    const compra = await tx.compra.create({
      data: {
        proveedorId: proveedorRefId,
        proveedor: proveedorNombre,
        comprobante,
        fecha,
        estado: "REGISTRADA",
        total: totalCompra,
        observaciones,
      },
    });
    compraRegistradaId = compra.id;

    await tx.compraDetalle.createMany({
      data: lineItems.map((item) => ({
        compraId: compra.id,
        materialId: item.materialId,
        cantidad: item.cantidad,
        costoUnitario: item.costoUnitario,
        subtotal: item.subtotal,
      })),
    });

    for (const adjustment of stockAdjustments) {
      await tx.material.update({
        where: { id: adjustment.materialId },
        data: {
          stockActual: adjustment.nuevoStock,
          costoPromedio: adjustment.costoPromedio,
        },
      });
    }

    await tx.movimientoStock.createMany({
      data: lineItems.map((item) => ({
        materialId: item.materialId,
        compraId: compra.id,
        tipo: "COMPRA",
        cantidad: item.cantidad,
        costoUnitario: item.costoUnitario,
        descripcion: `Ingreso por compra a ${proveedorNombre}`,
      })),
    });
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COMPRAS",
    accion: "CREATE",
    entidadTipo: "COMPRA",
    entidadId: compraRegistradaId,
    descripcion: `Registro de compra a ${proveedorNombre}.`,
    detalle: {
      proveedor: proveedorNombre,
      proveedorId: proveedorRefId,
      comprobante,
      total: totalCompra.toString(),
      lineas: lineItems.length,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/compras", "ok", `Compra registrada con ${lineItems.length} lineas y stock actualizado.`);
}

export async function cancelCompraAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const compraId = getOptionalInt(formData, "compraId");
  const motivoAnulacion = getRequiredString(formData, "motivoAnulacion");

  if (!compraId || !motivoAnulacion) {
    redirectWithMessage("/compras", "error", "Completa la compra y el motivo de anulacion.");
  }

  const compraIdValue = compraId!;
  const compra = await prisma.compra.findUnique({
    where: { id: compraIdValue },
    include: {
      proveedorRef: {
        select: {
          razonSocial: true,
        },
      },
      detalles: {
        include: {
          material: {
            select: {
              id: true,
              nombre: true,
              stockActual: true,
            },
          },
        },
      },
    },
  });

  if (!compra) {
    redirectWithMessage("/compras", "error", "Compra no encontrada.");
  }

  const currentCompra = compra!;

  if (currentCompra.estado === "ANULADA" || currentCompra.anuladoAt) {
    redirectWithMessage("/compras", "error", "Esa compra ya se encuentra anulada.");
  }

  if (currentCompra.detalles.length === 0) {
    redirectWithMessage("/compras", "error", "La compra no tiene detalle para revertir.");
  }

  const stockRollback = Array.from(
    currentCompra.detalles.reduce(
      (map, detalle) => {
        const existing = map.get(detalle.materialId) ?? {
          materialId: detalle.materialId,
          nombre: detalle.material.nombre,
          cantidad: new Prisma.Decimal(0),
          stockActual: new Prisma.Decimal(detalle.material.stockActual.toString()),
        };

        existing.cantidad = existing.cantidad.add(detalle.cantidad);
        map.set(detalle.materialId, existing);
        return map;
      },
      new Map<
        number,
        {
          materialId: number;
          nombre: string;
          cantidad: Prisma.Decimal;
          stockActual: Prisma.Decimal;
        }
      >(),
    ).values(),
  );

  const stockInsuficiente = stockRollback.filter((item) => item.stockActual.lessThan(item.cantidad));
  if (stockInsuficiente.length > 0) {
    const detalle = stockInsuficiente
      .map((item) => `${item.nombre} (${item.stockActual.toString()} disponible / ${item.cantidad.toString()} a revertir)`)
      .join(", ");
    redirectWithMessage(
      "/compras",
      "error",
      `No se puede anular la compra porque el stock ya fue consumido. Revisa: ${detalle}.`,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.compra.update({
      where: { id: currentCompra.id },
      data: {
        estado: "ANULADA",
        motivoAnulacion,
        anuladoAt: now,
      },
    });

    for (const rollback of stockRollback) {
      const nuevoStock = rollback.stockActual.sub(rollback.cantidad);
      await tx.material.update({
        where: { id: rollback.materialId },
        data: {
          stockActual: nuevoStock,
          ...(nuevoStock.lessThanOrEqualTo(new Prisma.Decimal(0))
            ? { costoPromedio: new Prisma.Decimal(0) }
            : {}),
        },
      });
    }

    await tx.movimientoStock.createMany({
      data: currentCompra.detalles.map((detalle) => ({
        materialId: detalle.materialId,
        compraId: currentCompra.id,
        tipo: "ANULACION_COMPRA",
        cantidad: detalle.cantidad.mul(new Prisma.Decimal(-1)),
        costoUnitario: detalle.costoUnitario,
        descripcion: `Anulacion de compra ${currentCompra.comprobante ?? `#${currentCompra.id}`} - ${motivoAnulacion}`,
      })),
    });
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COMPRAS",
    accion: "CANCEL",
    entidadTipo: "COMPRA",
    entidadId: currentCompra.id,
    descripcion: `Anulacion de compra ${currentCompra.comprobante ?? `#${currentCompra.id}`}.`,
    detalle: {
      proveedor: currentCompra.proveedorRef?.razonSocial ?? currentCompra.proveedor,
      motivoAnulacion,
      total: currentCompra.total.toString(),
      lineas: currentCompra.detalles.length,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(
    "/compras",
    "ok",
    `Compra ${currentCompra.comprobante ?? `#${currentCompra.id}`} anulada y stock revertido correctamente.`,
  );
}

export async function updateBillingConfigAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const razonSocial = getRequiredString(formData, "razonSocial");
  const cuit = getRequiredString(formData, "cuit");
  const condicionIvaEmisor = getRequiredString(formData, "condicionIvaEmisor");
  const puntoVenta = getRequiredString(formData, "puntoVenta");
  const provincia = getOptionalString(formData, "provincia");
  const ingresosBrutos = getOptionalString(formData, "ingresosBrutos");
  const inicioActividad = getOptionalDate(formData, "inicioActividad");
  const notasLegales = getOptionalString(formData, "notasLegales");
  const ambienteArca = getRequiredString(formData, "ambienteArca");
  const arcaHabilitado = getBoolean(formData, "arcaHabilitado");
  const tipoComprobanteDefault = getRequiredString(formData, "tipoComprobanteDefault");
  const conceptoArcaDefault = getRequiredString(formData, "conceptoArcaDefault");
  const monedaCodigoDefault = getRequiredString(formData, "monedaCodigoDefault");
  const arcaWsService = getRequiredString(formData, "arcaWsService");
  const cuitRepresentadaArca = getOptionalString(formData, "cuitRepresentadaArca");
  const aliasCertificadoArca = getOptionalString(formData, "aliasCertificadoArca");
  const certificadoRutaArca = getOptionalString(formData, "certificadoRutaArca");
  const clavePrivadaRutaArca = getOptionalString(formData, "clavePrivadaRutaArca");
  const observacionesArca = getOptionalString(formData, "observacionesArca");

  if (
    !razonSocial ||
    !cuit ||
    !condicionIvaEmisor ||
    !puntoVenta ||
    !ambienteArca ||
    !tipoComprobanteDefault ||
    !conceptoArcaDefault ||
    !monedaCodigoDefault ||
    !arcaWsService
  ) {
    redirectWithMessage(
      "/configuracion",
      "error",
      "Completa datos fiscales, punto de venta y parametros ARCA obligatorios.",
    );
  }

  const invoiceTypeExists = ARCA_INVOICE_TYPES.some((item) => item.code === tipoComprobanteDefault);
  const conceptTypeExists = ARCA_CONCEPT_TYPES.some((item) => item.code === conceptoArcaDefault);
  const currencyExists = ARCA_CURRENCIES.some((item) => item.code === monedaCodigoDefault);
  const wsServiceExists = ARCA_WS_SERVICES.some((item) => item.code === arcaWsService);

  if (!invoiceTypeExists || !conceptTypeExists || !currencyExists || !wsServiceExists) {
    redirectWithMessage("/configuracion", "error", "Los parametros ARCA seleccionados no son validos.");
  }

  const config = await getBillingConfig();

  await prisma.configuracionFacturacion.update({
    where: { id: config.id },
    data: {
      razonSocial,
      cuit,
      condicionIvaEmisor,
      puntoVenta,
      provincia,
      ingresosBrutos,
      inicioActividad,
      notasLegales,
      ambienteArca,
      arcaHabilitado,
      tipoComprobanteDefault,
      conceptoArcaDefault,
      monedaCodigoDefault,
      arcaWsService,
      cuitRepresentadaArca,
      aliasCertificadoArca,
      certificadoRutaArca,
      clavePrivadaRutaArca,
      observacionesArca,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "CONFIGURACION",
    accion: "UPDATE_BILLING",
    entidadTipo: "CONFIGURACION_FACTURACION",
    entidadId: config.id,
    descripcion: "Actualizacion de configuracion fiscal y ARCA.",
    detalle: {
      puntoVenta,
      ambienteArca,
      arcaHabilitado,
      tipoComprobanteDefault,
      arcaWsService,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/configuracion", "ok", "Configuracion fiscal y ARCA actualizada.");
}

export async function createPasarelaPagoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const codigo = getRequiredString(formData, "codigo").toUpperCase();
  const nombre = getRequiredString(formData, "nombre");
  const proveedor = getRequiredString(formData, "proveedor");
  const modo = getRequiredString(formData, "modo");
  const checkoutBaseUrl = getOptionalString(formData, "checkoutBaseUrl");
  const webhookPath = getOptionalString(formData, "webhookPath");
  const publicKey = getOptionalString(formData, "publicKey");
  const secretKeyMasked = getOptionalString(formData, "secretKeyMasked");
  const moneda = getOptionalString(formData, "moneda") ?? "ARS";
  const activa = getBoolean(formData, "activa");
  const confirmacionAutomatica = getBoolean(formData, "confirmacionAutomatica");
  const permiteCorteAutomatico = getBoolean(formData, "permiteCorteAutomatico");
  const permiteReconexionAutomatica = getBoolean(formData, "permiteReconexionAutomatica");
  const requiereValidacionManual = getBoolean(formData, "requiereValidacionManual");
  const orden = getOptionalInt(formData, "orden") ?? 0;
  const observaciones = getOptionalString(formData, "observaciones");

  if (!codigo || !nombre || !proveedor || !modo) {
    redirectWithMessage("/pasarelas", "error", "Completa codigo, nombre, proveedor y modo.");
  }

  if (!PAYMENT_GATEWAY_PROVIDERS.includes(proveedor as (typeof PAYMENT_GATEWAY_PROVIDERS)[number])) {
    redirectWithMessage("/pasarelas", "error", "El proveedor de pasarela no es valido.");
  }

  if (!PAYMENT_GATEWAY_MODES.includes(modo as (typeof PAYMENT_GATEWAY_MODES)[number])) {
    redirectWithMessage("/pasarelas", "error", "El modo de la pasarela no es valido.");
  }

  const duplicate = await prisma.pasarelaPago.findUnique({
    where: { codigo },
    select: { id: true },
  });

  if (duplicate) {
    redirectWithMessage("/pasarelas", "error", "Ya existe una pasarela con ese codigo.");
  }

  const pasarela = await prisma.pasarelaPago.create({
    data: {
      codigo,
      nombre,
      proveedor,
      modo,
      checkoutBaseUrl,
      webhookPath,
      publicKey,
      secretKeyMasked,
      moneda,
      activa,
      confirmacionAutomatica,
      permiteCorteAutomatico,
      permiteReconexionAutomatica,
      requiereValidacionManual,
      orden,
      observaciones,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PASARELAS",
    accion: "CREATE_GATEWAY",
    entidadTipo: "PASARELA_PAGO",
    entidadId: pasarela.id,
    descripcion: `Alta de pasarela ${codigo}.`,
    detalle: { proveedor, modo, activa },
  });

  revalidateCorePaths();
  revalidatePath("/pasarelas");
  redirectWithMessage("/pasarelas", "ok", "Pasarela de pago creada correctamente.");
}

export async function updatePasarelaPagoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const pasarelaId = getOptionalInt(formData, "pasarelaId");
  const codigo = getRequiredString(formData, "codigo").toUpperCase();
  const nombre = getRequiredString(formData, "nombre");
  const proveedor = getRequiredString(formData, "proveedor");
  const modo = getRequiredString(formData, "modo");
  const checkoutBaseUrl = getOptionalString(formData, "checkoutBaseUrl");
  const webhookPath = getOptionalString(formData, "webhookPath");
  const publicKey = getOptionalString(formData, "publicKey");
  const secretKeyMasked = getOptionalString(formData, "secretKeyMasked");
  const moneda = getOptionalString(formData, "moneda") ?? "ARS";
  const activa = getBoolean(formData, "activa");
  const confirmacionAutomatica = getBoolean(formData, "confirmacionAutomatica");
  const permiteCorteAutomatico = getBoolean(formData, "permiteCorteAutomatico");
  const permiteReconexionAutomatica = getBoolean(formData, "permiteReconexionAutomatica");
  const requiereValidacionManual = getBoolean(formData, "requiereValidacionManual");
  const orden = getOptionalInt(formData, "orden") ?? 0;
  const observaciones = getOptionalString(formData, "observaciones");

  if (!pasarelaId || !codigo || !nombre || !proveedor || !modo) {
    redirectWithMessage("/pasarelas", "error", "Completa los datos obligatorios de la pasarela.");
  }

  if (!PAYMENT_GATEWAY_PROVIDERS.includes(proveedor as (typeof PAYMENT_GATEWAY_PROVIDERS)[number])) {
    redirectWithMessage("/pasarelas", "error", "El proveedor de pasarela no es valido.");
  }

  if (!PAYMENT_GATEWAY_MODES.includes(modo as (typeof PAYMENT_GATEWAY_MODES)[number])) {
    redirectWithMessage("/pasarelas", "error", "El modo de la pasarela no es valido.");
  }

  const duplicate = await prisma.pasarelaPago.findFirst({
    where: {
      codigo,
      id: { not: pasarelaId! },
    },
    select: { id: true },
  });

  if (duplicate) {
    redirectWithMessage("/pasarelas", "error", "Ya existe otra pasarela con ese codigo.");
  }

  await prisma.pasarelaPago.update({
    where: { id: pasarelaId! },
    data: {
      codigo,
      nombre,
      proveedor,
      modo,
      checkoutBaseUrl,
      webhookPath,
      publicKey,
      secretKeyMasked,
      moneda,
      activa,
      confirmacionAutomatica,
      permiteCorteAutomatico,
      permiteReconexionAutomatica,
      requiereValidacionManual,
      orden,
      observaciones,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PASARELAS",
    accion: "UPDATE_GATEWAY",
    entidadTipo: "PASARELA_PAGO",
    entidadId: pasarelaId!,
    descripcion: `Actualizacion de pasarela ${codigo}.`,
    detalle: { proveedor, modo, activa },
  });

  revalidateCorePaths();
  revalidatePath("/pasarelas");
  redirectWithMessage("/pasarelas", "ok", "Pasarela actualizada correctamente.");
}

export async function updateReglaAutomatizacionAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const regla = await getAutomationRule();
  const nombre = getRequiredString(formData, "nombre");
  const activa = getBoolean(formData, "activa");
  const requierePagoAcreditado = getBoolean(formData, "requierePagoAcreditado");
  const minFacturasVencidasParaCorte = getOptionalInt(formData, "minFacturasVencidasParaCorte") ?? 1;
  const diasGraciaCorte = getOptionalInt(formData, "diasGraciaCorte") ?? 0;
  const montoMinimoCorte = parseDecimal(getOptionalString(formData, "montoMinimoCorte")) ?? new Prisma.Decimal(0);
  const bloquearConPromesaVigente = getBoolean(formData, "bloquearConPromesaVigente");
  const bloquearConAcuerdoVigente = getBoolean(formData, "bloquearConAcuerdoVigente");
  const reactivarConSaldoCero = getBoolean(formData, "reactivarConSaldoCero");
  const reactivarConPagoConfirmado = getBoolean(formData, "reactivarConPagoConfirmado");
  const generarOrdenCorteAutomatica = getBoolean(formData, "generarOrdenCorteAutomatica");
  const generarOrdenReconexionAutomatica = getBoolean(formData, "generarOrdenReconexionAutomatica");
  const observaciones = getOptionalString(formData, "observaciones");

  await prisma.reglaAutomatizacion.update({
    where: { id: regla.id },
    data: {
      nombre,
      activa,
      requierePagoAcreditado,
      minFacturasVencidasParaCorte,
      diasGraciaCorte,
      montoMinimoCorte,
      bloquearConPromesaVigente,
      bloquearConAcuerdoVigente,
      reactivarConSaldoCero,
      reactivarConPagoConfirmado,
      generarOrdenCorteAutomatica,
      generarOrdenReconexionAutomatica,
      observaciones,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "AUTOMATIZACIONES",
    accion: "UPDATE_RULE",
    entidadTipo: "REGLA_AUTOMATIZACION",
    entidadId: regla.id,
    descripcion: "Actualizacion de la regla base de corte y reconexion.",
    detalle: {
      activa,
      requierePagoAcreditado,
      minFacturasVencidasParaCorte,
      diasGraciaCorte,
      montoMinimoCorte: montoMinimoCorte.toString(),
      generarOrdenCorteAutomatica,
      generarOrdenReconexionAutomatica,
    },
  });

  revalidateCorePaths();
  revalidatePath("/pasarelas");
  redirectWithMessage("/pasarelas", "ok", "Regla de automatizacion actualizada.");
}

export async function createPagoExternoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const facturaId = getOptionalInt(formData, "facturaId");
  const pasarelaId = getOptionalInt(formData, "pasarelaId");
  const importe = parseDecimal(getRequiredString(formData, "importe"));
  const descripcion = getOptionalString(formData, "descripcion");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : "/pasarelas";

  if (!abonadoId || !pasarelaId || !importe) {
    redirectWithMessage(redirectPath, "error", "Completa abonado, pasarela e importe.");
  }

  const [abonado, pasarela, factura] = await Promise.all([
    prisma.abonado.findUnique({
      where: { id: abonadoId! },
      select: { id: true, numeroAbonado: true },
    }),
    prisma.pasarelaPago.findUnique({
      where: { id: pasarelaId! },
    }),
    facturaId
      ? prisma.factura.findFirst({
          where: { id: facturaId, abonadoId: abonadoId! },
          select: { id: true, numero: true },
        })
      : Promise.resolve(null),
  ]);

  if (!abonado) {
    redirectWithMessage(redirectPath, "error", "Abonado no encontrado.");
  }

  if (!pasarela || !pasarela.activa) {
    redirectWithMessage(redirectPath, "error", "La pasarela seleccionada no esta activa.");
  }

  if (facturaId && !factura) {
    redirectWithMessage(redirectPath, "error", "La factura seleccionada no corresponde al abonado.");
  }

  const currentPasarela = pasarela!;
  const currentAbonado = abonado!;
  const now = new Date();
  const referenciaInterna = await getNextExternalPaymentReference(now);
  const checkoutUrl = currentPasarela.checkoutBaseUrl
    ? `${currentPasarela.checkoutBaseUrl}${currentPasarela.checkoutBaseUrl.includes("?") ? "&" : "?"}ref=${encodeURIComponent(referenciaInterna)}`
    : null;

  const pagoExterno = await prisma.pagoExterno.create({
    data: {
      abonadoId: abonadoId!,
      facturaId,
      pasarelaId: currentPasarela.id,
      referenciaInterna,
      estado: "PENDIENTE",
      importe: importe!,
      moneda: currentPasarela.moneda,
      descripcion: descripcion ?? `Pago online ${factura?.numero ?? currentAbonado.numeroAbonado}`,
      checkoutUrl,
      solicitadoAt: now,
      payloadJson: JSON.stringify({
        facturaNumero: factura?.numero ?? null,
        pasarelaCodigo: currentPasarela.codigo,
        generadoPor: actor.id,
      }),
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PASARELAS",
    accion: "CREATE_PAYMENT_INTENT",
    entidadTipo: "PAGO_EXTERNO",
    entidadId: pagoExterno.id,
    descripcion: `Generacion de pago online ${referenciaInterna}.`,
    detalle: {
      abonadoId,
      facturaId,
      pasarelaId,
      importe: importe!.toString(),
      checkoutUrl,
    },
  });

  revalidateCorePaths();
  revalidatePath("/pasarelas");
  redirectWithMessage(redirectPath, "ok", `Pago online generado: ${referenciaInterna}.`);
}

export async function confirmPagoExternoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const pagoExternoId = getOptionalInt(formData, "pagoExternoId");
  const estado = getRequiredString(formData, "estado");
  const referenciaExterna = getOptionalString(formData, "referenciaExterna");
  const notasInternas = getOptionalString(formData, "notasInternas");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : "/pasarelas";

  if (!pagoExternoId || !estado) {
    redirectWithMessage(redirectPath, "error", "No se pudo identificar el pago online.");
  }

  if (!EXTERNAL_PAYMENT_STATES.includes(estado as (typeof EXTERNAL_PAYMENT_STATES)[number])) {
    redirectWithMessage(redirectPath, "error", "El estado externo no es valido.");
  }

  const current = await prisma.pagoExterno.findUnique({
    where: { id: pagoExternoId! },
    include: {
      pasarela: true,
      pago: true,
      abonado: true,
    },
  });

  if (!current) {
    redirectWithMessage(redirectPath, "error", "Pago online no encontrado.");
  }

  let numeroRecibo: string | null = null;
  let reconnectionOrders = 0;
  const regla = await getAutomationRule();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.pagoExterno.update({
      where: { id: pagoExternoId! },
      data: {
        estado,
        referenciaExterna,
        notasInternas,
        confirmadoAt: estado === "ACREDITADO" ? new Date() : null,
        conciliadoAt: estado === "ACREDITADO" ? new Date() : null,
      },
      include: {
        pago: true,
        pasarela: true,
      },
    });

    if (estado === "ACREDITADO" && !updated.pago) {
      const registered = await registerPaymentInAccount(tx, {
        abonadoId: updated.abonadoId,
        usuarioId: actor.id,
        medioPago: `PASARELA_${updated.pasarela.codigo}`,
        importe: new Prisma.Decimal(updated.importe.toString()),
        fecha: new Date(),
        descripcion: `Pago online acreditado ${updated.referenciaInterna}`,
        pagoExternoId: updated.id,
      });
      numeroRecibo = registered.numeroRecibo;

      const facturasAbiertas = await tx.factura.count({
        where: {
          abonadoId: updated.abonadoId,
          estado: { in: ["PENDIENTE", "VENCIDA"] },
        },
      });

      const canReconnect =
        regla.activa &&
        updated.pasarela.permiteReconexionAutomatica &&
        regla.generarOrdenReconexionAutomatica &&
        (regla.reactivarConPagoConfirmado ||
          (regla.reactivarConSaldoCero && facturasAbiertas === 0));

      if (canReconnect) {
        const created = await createReconnectionOrdersForAbonado(tx, {
          abonadoId: updated.abonadoId,
          actorId: actor.id,
          motivo: `Reconexion automatica por pago acreditado ${updated.referenciaInterna}`,
        });
        reconnectionOrders = created.length;
      }
    }
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PASARELAS",
    accion: "CONFIRM_PAYMENT",
    entidadTipo: "PAGO_EXTERNO",
    entidadId: pagoExternoId!,
    descripcion: `Actualizacion de pago online a ${estado}.`,
    detalle: {
      referenciaExterna,
      numeroRecibo,
      reconnectionOrders,
    },
  });

  revalidateCorePaths();
  revalidatePath("/pasarelas");
  revalidatePath(`/abonados/${current!.abonadoId}`);
  revalidatePath(`/cuentas/${current!.abonadoId}`);
  redirectWithMessage(
    redirectPath,
    "ok",
    estado === "ACREDITADO"
      ? `Pago online acreditado${numeroRecibo ? `. Recibo ${numeroRecibo}` : ""}${reconnectionOrders > 0 ? ` y ${reconnectionOrders} orden/es de reconexion generadas` : ""}.`
      : `Pago online actualizado a ${estado}.`,
  );
}

export async function registerWebhookPasarelaAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const pasarelaId = getOptionalInt(formData, "pasarelaId");
  const pagoExternoId = getOptionalInt(formData, "pagoExternoId");
  const tipoEvento = getRequiredString(formData, "tipoEvento");
  const referenciaExterna = getOptionalString(formData, "referenciaExterna");
  const estado = getOptionalString(formData, "estado") ?? "RECIBIDO";
  const firmaValida = getBoolean(formData, "firmaValida");
  const payloadJson = getRequiredString(formData, "payloadJson");

  if (!pasarelaId || !tipoEvento || !payloadJson) {
    redirectWithMessage("/pasarelas", "error", "Completa pasarela, tipo de evento y payload.");
  }

  if (!WEBHOOK_EVENT_STATES.includes(estado as (typeof WEBHOOK_EVENT_STATES)[number])) {
    redirectWithMessage("/pasarelas", "error", "El estado del webhook no es valido.");
  }

  const webhook = await prisma.webhookPasarelaEvento.create({
    data: {
      pasarelaId: pasarelaId!,
      pagoExternoId,
      tipoEvento,
      referenciaExterna,
      estado,
      payloadJson,
      firmaValida,
      procesadoAt: ["VALIDADO", "PROCESADO"].includes(estado) ? new Date() : null,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PASARELAS",
    accion: "REGISTER_WEBHOOK",
    entidadTipo: "WEBHOOK_PASARELA",
    entidadId: webhook.id,
    descripcion: `Registro manual de webhook ${tipoEvento}.`,
    detalle: {
      pasarelaId,
      pagoExternoId,
      estado,
      referenciaExterna,
    },
  });

  revalidateCorePaths();
  revalidatePath("/pasarelas");
  redirectWithMessage("/pasarelas", "ok", "Webhook registrado para auditoria y pruebas.");
}

export async function reprocessWebhookPasarelaAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const webhookId = getOptionalInt(formData, "webhookId");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : "/pasarelas";

  if (!webhookId) {
    redirectWithMessage(redirectPath, "error", "No se pudo identificar el webhook a reprocesar.");
  }

  const webhook = await prisma.webhookPasarelaEvento.findUnique({
    where: { id: webhookId! },
    include: {
      pasarela: true,
      pagoExterno: {
        select: {
          id: true,
          abonadoId: true,
          referenciaInterna: true,
        },
      },
    },
  });

  if (!webhook) {
    redirectWithMessage(redirectPath, "error", "Webhook no encontrado.");
  }

  const currentWebhook = webhook!;

  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(currentWebhook.payloadJson) as Record<string, unknown>;
  } catch {
    redirectWithMessage(redirectPath, "error", "El payload guardado del webhook no es un JSON valido.");
  }

  const safePayload = payload ?? {};

  const referenciaInterna =
    currentWebhook.pagoExterno?.referenciaInterna ?? extractInternalReference(safePayload);
  const referenciaExterna = currentWebhook.referenciaExterna ?? extractExternalReference(safePayload);
  const rawStatus = extractExternalStatus(safePayload);
  const estadoNormalizado = normalizeExternalPaymentState(rawStatus);

  if (!referenciaInterna) {
    redirectWithMessage(redirectPath, "error", "El webhook no tiene referencia interna util para conciliacion.");
  }

  if (!estadoNormalizado) {
    redirectWithMessage(redirectPath, "error", "No se pudo inferir un estado externo procesable desde el webhook.");
  }

  const currentEstadoNormalizado = estadoNormalizado!;

  const pagoExterno =
    currentWebhook.pagoExterno ??
    (await prisma.pagoExterno.findUnique({
      where: { referenciaInterna: referenciaInterna! },
      select: {
        id: true,
        abonadoId: true,
        referenciaInterna: true,
      },
    }));

  if (!pagoExterno) {
    redirectWithMessage(redirectPath, "error", "No existe un pago online asociado a la referencia del webhook.");
  }

  const currentPagoExterno = pagoExterno!;

  try {
    const finalized = await finalizeExternalPayment({
      pagoExternoId: currentPagoExterno.id,
      estado: currentEstadoNormalizado,
      referenciaExterna,
      notasInternas: `Webhook ${currentWebhook.id} reprocesado manualmente desde panel.`,
      actorId: actor.id,
    });

    await prisma.webhookPasarelaEvento.update({
      where: { id: currentWebhook.id },
      data: {
        pagoExternoId: currentPagoExterno.id,
        estado: "PROCESADO",
        procesadoAt: new Date(),
        errorDetalle: null,
      },
    });

    await logAuditEvent({
      actorId: actor.id,
      modulo: "PASARELAS",
      accion: "REPROCESS_WEBHOOK",
      entidadTipo: "WEBHOOK_PASARELA",
      entidadId: currentWebhook.id,
      descripcion: `Webhook ${currentWebhook.tipoEvento} reprocesado manualmente.`,
      detalle: {
        referenciaInterna,
        referenciaExterna,
        estado: currentEstadoNormalizado,
        numeroRecibo: finalized.numeroRecibo,
        reconnectionOrders: finalized.reconnectionOrders,
      },
    });

    revalidateCorePaths();
    revalidatePath("/pasarelas");
    revalidatePath(`/abonados/${finalized.abonadoId}`);
    revalidatePath(`/cuentas/${finalized.abonadoId}`);
    redirectWithMessage(
      redirectPath,
      "ok",
      `Webhook reprocesado correctamente${finalized.numeroRecibo ? `. Recibo ${finalized.numeroRecibo}` : ""}.`,
    );
  } catch (error) {
    await prisma.webhookPasarelaEvento.update({
      where: { id: currentWebhook.id },
      data: {
        estado: "ERROR",
        errorDetalle: error instanceof Error ? error.message : "No se pudo reprocesar el webhook.",
      },
    });

    await logAuditEvent({
      actorId: actor.id,
      modulo: "PASARELAS",
      accion: "REPROCESS_WEBHOOK_ERROR",
      entidadTipo: "WEBHOOK_PASARELA",
      entidadId: currentWebhook.id,
      descripcion: `Fallo el reproceso manual del webhook ${currentWebhook.tipoEvento}.`,
      detalle: {
        referenciaInterna,
        referenciaExterna,
        error: error instanceof Error ? error.message : "No se pudo reprocesar el webhook.",
      },
    });

    revalidateCorePaths();
    revalidatePath("/pasarelas");
    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "No se pudo reprocesar el webhook.",
    );
  }
}

export async function runAutomationCycleAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : "/pasarelas";
  const regla = await getAutomationRule();
  const detail: Record<string, unknown> = {};
  let cortesGenerados = 0;
  let reconexionesGeneradas = 0;

  if (!regla.activa) {
    await prisma.ejecucionAutomatizacion.create({
      data: {
        codigo: regla.codigo,
        origen: "MANUAL",
        estado: "SKIPPED",
        resumen: "La regla base esta desactivada; no se ejecutaron automatizaciones.",
        detalleJson: JSON.stringify({ actorId: actor.id }),
      },
    });

    revalidateCorePaths();
    redirectWithMessage(redirectPath, "ok", "La regla esta desactivada. No se ejecutaron automatizaciones.");
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
          where: {
            estado: "ACTIVO",
          },
          include: {
            servicioCatalogo: {
              select: { nombre: true },
            },
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
          where: {
            estado: "VENCIDA",
          },
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
          some: {
            estado: "SUSPENDIDO",
          },
        },
        pagosExternos: {
          some: {
            estado: "ACREDITADO",
          },
        },
      },
      select: {
        id: true,
        facturas: {
          where: {
            estado: { in: ["PENDIENTE", "VENCIDA"] },
          },
          select: { id: true },
        },
        pagosExternos: {
          where: {
            estado: "ACREDITADO",
          },
          orderBy: { confirmadoAt: "desc" },
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

      const created = await prisma.$transaction((tx) =>
        createReconnectionOrdersForAbonado(tx, {
          abonadoId: abonado.id,
          actorId: actor.id,
          motivo: "Reconexion automatica desde motor de automatizaciones",
        }),
      );
      reconexionesGeneradas += created.length;
    }
  }

  detail.regla = regla.codigo;
  detail.actorId = actor.id;
  detail.cortesGenerados = cortesGenerados;
  detail.reconexionesGeneradas = reconexionesGeneradas;

  const ejecucion = await prisma.ejecucionAutomatizacion.create({
    data: {
      codigo: regla.codigo,
      origen: "MANUAL",
      estado: "OK",
      resumen: `Ciclo ejecutado. Cortes ${cortesGenerados}, reconexiones ${reconexionesGeneradas}.`,
      cortesGenerados,
      reconexionesGeneradas,
      pagosConciliados: 0,
      detalleJson: JSON.stringify(detail),
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "AUTOMATIZACIONES",
    accion: "RUN_CYCLE",
    entidadTipo: "EJECUCION_AUTOMATIZACION",
    entidadId: ejecucion.id,
    descripcion: "Ejecucion manual del ciclo de automatizaciones.",
    detalle: detail,
  });

  revalidateCorePaths();
  revalidatePath("/pasarelas");
  redirectWithMessage(
    redirectPath,
    "ok",
    `Ciclo ejecutado. Cortes ${cortesGenerados} / reconexiones ${reconexionesGeneradas}.`,
  );
}

export async function createAbonadoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const socioId = getOptionalInt(formData, "socioId");
  const esSocio = getBoolean(formData, "esSocio");
  const numeroAbonado = normalizeAbonadoNumber(getRequiredString(formData, "numeroAbonado"));
  const nombre = getOptionalString(formData, "nombre");
  const apellido = getOptionalString(formData, "apellido");
  const documento = getOptionalString(formData, "documento");
  const tipoDocumento = getOptionalString(formData, "tipoDocumento") ?? "DNI";
  const razonSocial = getOptionalString(formData, "razonSocial");
  const cuit = getOptionalString(formData, "cuit");
  const telefono = getOptionalString(formData, "telefono");
  const email = getOptionalString(formData, "email");
  const domicilio = getRequiredString(formData, "domicilio");
  const localidad = getRequiredString(formData, "localidad");
  const provincia = getOptionalString(formData, "provincia");
  const codigoPostal = getOptionalString(formData, "codigoPostal");
  const condicionFiscal = getOptionalString(formData, "condicionFiscal");
  const condicionIva = getRequiredString(formData, "condicionIva");
  const observaciones = getOptionalString(formData, "observaciones");
  const servicioCatalogoIds = getMultiInt(formData, "servicioCatalogoIds");

  if (!numeroAbonado || !domicilio || !localidad || !condicionIva) {
    redirectWithMessage(
      "/abonados",
      "error",
      "Completa numero, domicilio, localidad y condicion frente al IVA.",
    );
  }

  if (!IVA_CONDITIONS.includes(condicionIva as (typeof IVA_CONDITIONS)[number])) {
    redirectWithMessage("/abonados", "error", "La condicion frente al IVA no es valida.");
  }

  const existing = await prisma.abonado.findUnique({
    where: { numeroAbonado },
    select: { id: true },
  });

  if (existing) {
    redirectWithMessage("/abonados", "error", "Ese numero de abonado ya existe.");
  }

  let socioData:
    | {
        id: number;
        nombre: string;
        apellido: string;
        email: string | null;
        telefono: string | null;
        dni: string;
      }
    | null = null;

  if (socioId) {
    const socioIdValue = socioId;
    socioData = await prisma.socio.findUnique({
      where: { id: socioIdValue },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        dni: true,
      },
    });
  }

  const serviciosGlobales = servicioCatalogoIds.length
    ? await prisma.servicioCatalogo.findMany({
        where: {
          id: {
            in: servicioCatalogoIds,
          },
        },
      })
    : [];

  const abonado = await prisma.abonado.create({
    data: {
      socioId: socioData?.id ?? null,
      esSocio: esSocio || Boolean(socioData),
      numeroAbonado,
      nombre: nombre ?? socioData?.nombre ?? null,
      apellido: apellido ?? socioData?.apellido ?? null,
      documento: documento ?? socioData?.dni ?? null,
      tipoDocumento,
      razonSocial,
      cuit,
      telefono: telefono ?? socioData?.telefono ?? null,
      email: email ?? socioData?.email ?? null,
      domicilio,
      localidad,
      provincia,
      codigoPostal,
      condicionFiscal,
      condicionIva,
      observaciones,
      estado: "ACTIVO",
      servicios: serviciosGlobales.length
        ? {
            create: serviciosGlobales.map((servicio) => ({
              servicioCatalogoId: servicio.id,
              tipo: servicio.categoria,
              plan: servicio.nombre,
              precio: servicio.precioBase,
              cantidad: new Prisma.Decimal(1),
              estado: "ACTIVO",
            })),
          }
        : undefined,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "ABONADOS",
    accion: "CREATE",
    entidadTipo: "ABONADO",
    entidadId: abonado.id,
    descripcion: `Alta de abonado ${numeroAbonado}.`,
    detalle: {
      localidad,
      condicionIva,
      esSocio: esSocio || Boolean(socioData),
      serviciosIniciales: serviciosGlobales.length,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/abonados", "ok", "Abonado creado correctamente.");
}

export async function updateAbonadoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const redirectPath = getOptionalString(formData, "redirectPath");
  const numeroAbonado = normalizeAbonadoNumber(getRequiredString(formData, "numeroAbonado"));
  const socioId = getOptionalInt(formData, "socioId");
  const esSocio = getBoolean(formData, "esSocio");
  const nombre = getOptionalString(formData, "nombre");
  const apellido = getOptionalString(formData, "apellido");
  const razonSocial = getOptionalString(formData, "razonSocial");
  const documento = getOptionalString(formData, "documento");
  const tipoDocumento = getOptionalString(formData, "tipoDocumento") ?? "DNI";
  const cuit = getOptionalString(formData, "cuit");
  const telefono = getOptionalString(formData, "telefono");
  const email = getOptionalString(formData, "email");
  const domicilio = getRequiredString(formData, "domicilio");
  const localidad = getRequiredString(formData, "localidad");
  const provincia = getOptionalString(formData, "provincia");
  const codigoPostal = getOptionalString(formData, "codigoPostal");
  const condicionFiscal = getOptionalString(formData, "condicionFiscal");
  const condicionIva = getRequiredString(formData, "condicionIva");
  const observaciones = getOptionalString(formData, "observaciones");
  const estado = getRequiredString(formData, "estado") || "ACTIVO";

  const fallbackPath = `/abonados/${abonadoId ?? ""}`;

  if (!abonadoId || !numeroAbonado || !domicilio || !localidad || !condicionIva) {
    redirectWithMessage(fallbackPath, "error", "Completa los datos obligatorios del abonado.");
  }

  if (!IVA_CONDITIONS.includes(condicionIva as (typeof IVA_CONDITIONS)[number])) {
    redirectWithMessage(fallbackPath, "error", "La condicion frente al IVA no es valida.");
  }

  const abonadoIdValue = abonadoId!;
  const duplicate = await prisma.abonado.findFirst({
    where: {
      numeroAbonado,
      id: { not: abonadoIdValue },
    },
    select: { id: true },
  });

  if (duplicate) {
    redirectWithMessage(redirectPath || `/abonados/${abonadoIdValue}`, "error", "Ese numero de abonado ya esta en uso.");
  }

  await prisma.abonado.update({
    where: { id: abonadoIdValue },
    data: {
      socioId,
      esSocio,
      numeroAbonado,
      nombre,
      apellido,
      razonSocial,
      documento,
      tipoDocumento,
      cuit,
      telefono,
      email,
      domicilio,
      localidad,
      provincia,
      codigoPostal,
      condicionFiscal,
      condicionIva,
      observaciones,
      estado,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "ABONADOS",
    accion: "UPDATE",
    entidadTipo: "ABONADO",
    entidadId: abonadoIdValue,
    descripcion: `Actualizacion de abonado ${numeroAbonado}.`,
    detalle: {
      estado,
      localidad,
      condicionIva,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(redirectPath || `/abonados/${abonadoIdValue}`, "ok", "Ficha del abonado actualizada.");
}

export async function contractServicioAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const redirectPath = getOptionalString(formData, "redirectPath");
  const servicioCatalogoId = getOptionalInt(formData, "servicioCatalogoId");
  const precio = parseDecimal(getRequiredString(formData, "precio"));
  const cantidad = parseDecimal(getOptionalString(formData, "cantidad")) ?? new Prisma.Decimal(1);
  const bonificacion = parseDecimal(getOptionalString(formData, "bonificacion")) ?? new Prisma.Decimal(0);
  const observaciones = getOptionalString(formData, "observaciones");
  const numeroContratoInput = getOptionalString(formData, "numeroContrato");
  const facturable = !getOptionalString(formData, "facturable") || getBoolean(formData, "facturable");

  const fallbackPath = `/abonados/${abonadoId ?? ""}`;

  if (!abonadoId || !servicioCatalogoId || !precio) {
    redirectWithMessage(
      fallbackPath,
      "error",
      "Completa servicio, precio y abonado para generar la contratacion.",
    );
  }

  const abonadoIdValue = abonadoId!;
  const servicioCatalogoIdValue = servicioCatalogoId!;

  const [abonado, servicioCatalogo] = await Promise.all([
    prisma.abonado.findUnique({
      where: { id: abonadoIdValue },
      select: { id: true, numeroAbonado: true },
    }),
    prisma.servicioCatalogo.findUnique({
      where: { id: servicioCatalogoIdValue },
      select: { id: true, categoria: true, nombre: true },
    }),
  ]);

  if (!abonado || !servicioCatalogo) {
    redirectWithMessage(fallbackPath, "error", "No se pudo generar la contratacion.");
  }

  const currentAbonado = abonado!;
  const currentServicioCatalogo = servicioCatalogo!;
  const contratoCount = await prisma.servicio.count({
    where: {
      abonadoId: currentAbonado.id,
    },
  });
  const numeroContrato =
    numeroContratoInput ||
    `${currentAbonado.numeroAbonado}-${sanitizeContractCode(currentServicioCatalogo.categoria)}-${String(contratoCount + 1).padStart(3, "0")}`;

  const servicio = await prisma.$transaction(async (tx) => {
    const createdServicio = await tx.servicio.create({
      data: {
        abonadoId: currentAbonado.id,
        servicioCatalogoId: currentServicioCatalogo.id,
        numeroContrato,
        tipo: currentServicioCatalogo.categoria,
        plan: currentServicioCatalogo.nombre,
        precio: precio!,
        cantidad,
        bonificacion,
        facturable,
        estado: "PENDIENTE_INSTALACION",
        observaciones,
      },
    });

    await tx.ordenTrabajo.create({
      data: {
        abonadoId: currentAbonado.id,
        servicioId: createdServicio.id,
        tipo: "INSTALACION",
        estado: "PENDIENTE",
        motivo: `Nueva contratacion de ${currentServicioCatalogo.nombre}`,
        detalle: observaciones ?? `Contrato ${numeroContrato} pendiente de instalacion.`,
      },
    });

    return createdServicio;
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "ABONADOS",
    accion: "CONTRACT_SERVICE",
    entidadTipo: "SERVICIO",
    entidadId: servicio.id,
    descripcion: `Contratacion de servicio ${currentServicioCatalogo.nombre} para abonado ${currentAbonado.numeroAbonado}.`,
    detalle: {
      abonadoId: currentAbonado.id,
      servicioCatalogoId: currentServicioCatalogo.id,
      numeroContrato,
      precio: precio!.toString(),
      estado: "PENDIENTE_INSTALACION",
    },
  });

  revalidateCorePaths();
  redirectWithMessage(
    redirectPath || `/abonados/${currentAbonado.id}`,
    "ok",
    "Servicio contratado. Se genero la orden de instalacion correspondiente.",
  );
}

export async function updateServicioContratoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const servicioId = getOptionalInt(formData, "servicioId");
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const redirectPath = getOptionalString(formData, "redirectPath");
  const numeroContrato = getOptionalString(formData, "numeroContrato");
  const precio = parseDecimal(getRequiredString(formData, "precio"));
  const cantidad = parseDecimal(getRequiredString(formData, "cantidad"));
  const bonificacion = parseDecimal(getOptionalString(formData, "bonificacion")) ?? new Prisma.Decimal(0);
  const facturable = getBoolean(formData, "facturable");
  const estado = getRequiredString(formData, "estado");
  const observaciones = getOptionalString(formData, "observaciones");

  const fallbackPath = `/abonados/${abonadoId ?? ""}`;

  if (!servicioId || !abonadoId || !precio || !cantidad || !estado) {
    redirectWithMessage(
      fallbackPath,
      "error",
      "Completa precio, cantidad, estado y servicio para actualizar el contrato.",
    );
  }

  const servicioIdValue = servicioId!;
  const abonadoIdValue = abonadoId!;
  const fechaBaja = estado === "BAJA" ? new Date() : null;

  await prisma.servicio.update({
    where: { id: servicioIdValue },
    data: {
      numeroContrato,
      precio: precio!,
      cantidad: cantidad!,
      bonificacion,
      facturable,
      estado,
      fechaBaja,
      observaciones,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "ABONADOS",
    accion: "UPDATE_CONTRACT",
    entidadTipo: "SERVICIO",
    entidadId: servicioIdValue,
    descripcion: `Actualizacion de contrato de servicio ${servicioIdValue}.`,
    detalle: {
      abonadoId: abonadoIdValue,
      numeroContrato,
      estado,
      facturable,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(redirectPath || `/abonados/${abonadoIdValue}`, "ok", "Contrato actualizado correctamente.");
}

export async function createOrdenTrabajoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const servicioId = getOptionalInt(formData, "servicioId");
  const reclamoId = getOptionalInt(formData, "reclamoId");
  const tecnicoId = getOptionalInt(formData, "tecnicoId");
  const tipo = getRequiredString(formData, "tipo");
  const motivo = getRequiredString(formData, "motivo");
  const detalle = getOptionalString(formData, "detalle");
  const fechaProgramada = getOptionalDate(formData, "fechaProgramada");
  const cargoFacturable = getBoolean(formData, "cargoFacturable");

  if (!abonadoId || !tipo || !motivo) {
    redirectWithMessage("/ordenes", "error", "Completa abonado, tipo de orden y motivo.");
  }

  if (!WORK_ORDER_TYPES.includes(tipo as (typeof WORK_ORDER_TYPES)[number])) {
    redirectWithMessage("/ordenes", "error", "El tipo de orden de trabajo no es valido.");
  }

  const abonadoIdValue = abonadoId!;
  const orden = await prisma.ordenTrabajo.create({
    data: {
      abonadoId: abonadoIdValue,
      servicioId,
      reclamoId,
      tecnicoId,
      tipo,
      estado: getOrderInitialState(tecnicoId),
      fechaProgramada,
      motivo,
      detalle,
      cargoFacturable,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "ORDENES",
    accion: "CREATE",
    entidadTipo: "ORDEN_TRABAJO",
    entidadId: orden.id,
    descripcion: `Alta de orden ${tipo} para abonado ${abonadoIdValue}.`,
    detalle: {
      servicioId,
      reclamoId,
      tecnicoId,
      estado: orden.estado,
      cargoFacturable,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/ordenes", "ok", "Orden de trabajo creada correctamente.");
}

export async function createServicioOrdenRapidaAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const servicioId = getOptionalInt(formData, "servicioId");
  const tipo = getRequiredString(formData, "tipo");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : `/abonados/${abonadoId ?? ""}`;

  if (!abonadoId || !servicioId || !tipo) {
    redirectWithMessage(redirectPath, "error", "No se pudo generar la orden rapida del servicio.");
  }

  if (!WORK_ORDER_TYPES.includes(tipo as (typeof WORK_ORDER_TYPES)[number])) {
    redirectWithMessage(redirectPath, "error", "El tipo de orden solicitado no es valido.");
  }

  const servicio = await prisma.servicio.findUnique({
    where: { id: servicioId! },
    include: {
      abonado: {
        select: {
          id: true,
          numeroAbonado: true,
        },
      },
      servicioCatalogo: {
        select: {
          nombre: true,
        },
      },
      ordenesTrabajo: {
        where: {
          estado: {
            in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"],
          },
        },
        select: {
          id: true,
          tipo: true,
          estado: true,
        },
      },
    },
  });

  if (!servicio || servicio.abonadoId !== abonadoId) {
    redirectWithMessage(redirectPath, "error", "El servicio seleccionado no corresponde al abonado.");
  }

  const currentServicio = servicio!;
  const existingOpenOrder = currentServicio.ordenesTrabajo.find((orden) => orden.tipo === tipo);
  if (existingOpenOrder) {
    redirectWithMessage(
      redirectPath,
      "error",
      `Ya existe una orden ${tipo} abierta para este servicio (#${existingOpenOrder.id}).`,
    );
  }

  const motivoMap: Record<string, string> = {
    INSTALACION: "Instalacion de servicio contratada desde ficha del abonado",
    VISITA_TECNICA: "Visita tecnica solicitada desde ficha del abonado",
    CORTE: "Corte operativo solicitado desde ficha del abonado",
    RECONEXION: "Reconexion solicitada desde ficha del abonado",
    BAJA: "Baja administrativa solicitada desde ficha del abonado",
    MANTENIMIENTO: "Mantenimiento programado desde ficha del abonado",
  };

  const motivoBase = motivoMap[tipo] ?? "Orden generada desde ficha del abonado";
  const detalle = [
    currentServicio.servicioCatalogo?.nombre ?? currentServicio.plan,
    currentServicio.numeroContrato ? `Contrato ${currentServicio.numeroContrato}` : null,
    `Estado actual ${currentServicio.estado}`,
  ]
    .filter(Boolean)
    .join(" / ");

  const orden = await prisma.ordenTrabajo.create({
    data: {
      abonadoId: abonadoId!,
      servicioId: currentServicio.id,
      tipo,
      estado: "PENDIENTE",
      motivo: motivoBase,
      detalle,
      cargoFacturable: false,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "ORDENES",
    accion: "CREATE_QUICK",
    entidadTipo: "ORDEN_TRABAJO",
    entidadId: orden.id,
    descripcion: `Alta rapida de orden ${tipo} para servicio ${currentServicio.id}.`,
    detalle: {
      abonadoId,
      servicioId: currentServicio.id,
      servicio: currentServicio.servicioCatalogo?.nombre ?? currentServicio.plan,
      numeroAbonado: currentServicio.abonado.numeroAbonado,
    },
  });

  revalidateCorePaths();
  revalidatePath(redirectPath);
  revalidatePath("/ordenes");
  redirectWithMessage(redirectPath, "ok", `Orden ${tipo} creada correctamente para el contrato.`);
}

export async function createCorteMoraAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : "/cobranzas";

  if (!abonadoId) {
    redirectWithMessage(redirectPath, "error", "No se pudo identificar el abonado para generar corte.");
  }

  const abonado = await prisma.abonado.findUnique({
    where: { id: abonadoId! },
    include: {
      servicios: {
        where: {
          estado: "ACTIVO",
        },
        include: {
          servicioCatalogo: {
            select: {
              nombre: true,
            },
          },
          ordenesTrabajo: {
            where: {
              tipo: "CORTE",
              estado: {
                in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"],
              },
            },
            select: {
              id: true,
            },
          },
        },
      },
      facturas: {
        where: {
          estado: "VENCIDA",
        },
        select: {
          numero: true,
          total: true,
          fechaVencimiento: true,
        },
      },
    },
  });

  if (!abonado) {
    redirectWithMessage(redirectPath, "error", "Abonado no encontrado.");
  }

  const currentAbonado = abonado!;
  const serviciosObjetivo = currentAbonado.servicios.filter((servicio) => servicio.ordenesTrabajo.length === 0);

  if (currentAbonado.facturas.length === 0) {
    redirectWithMessage(redirectPath, "error", "El abonado no tiene deuda vencida para justificar corte.");
  }

  if (serviciosObjetivo.length === 0) {
    redirectWithMessage(redirectPath, "error", "Todos los servicios activos ya tienen una orden de corte abierta.");
  }

  const totalVencido = currentAbonado.facturas.reduce(
    (sum, factura) => sum.add(new Prisma.Decimal(factura.total.toString())),
    new Prisma.Decimal(0),
  );
  const regla = await getAutomationRule();
  const [promesaVigente, acuerdoVigente] = await Promise.all([
    prisma.gestionCobranza.findFirst({
      where: {
        abonadoId: currentAbonado.id,
        estado: "PROMESA_VIGENTE",
      },
      select: { id: true },
    }),
    prisma.acuerdoPago.findFirst({
      where: {
        abonadoId: currentAbonado.id,
        estado: "VIGENTE",
      },
      select: { id: true },
    }),
  ]);
  const evaluacion = evaluateCutAutomation({
    facturasVencidas: currentAbonado.facturas,
    promesaVigente: Boolean(promesaVigente),
    acuerdoVigente: Boolean(acuerdoVigente),
    deudaVencida: totalVencido,
    rule: regla,
  });

  if (!evaluacion.allowed) {
    redirectWithMessage(
      redirectPath,
      "error",
      evaluacion.reasons[0] ?? "La validacion automatica actual no permite generar el corte.",
    );
  }

  const ordenes = await prisma.$transaction(
    serviciosObjetivo.map((servicio) =>
      prisma.ordenTrabajo.create({
        data: {
          abonadoId: currentAbonado.id,
          servicioId: servicio.id,
          tipo: "CORTE",
          estado: "PENDIENTE",
          motivo: "Corte por mora generado desde cobranzas",
          detalle: `Deuda vencida ${totalVencido.toString()} / ${servicio.servicioCatalogo?.nombre ?? servicio.plan}${servicio.numeroContrato ? ` / Contrato ${servicio.numeroContrato}` : ""}`,
          cargoFacturable: false,
        },
      }),
    ),
  );

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COBRANZAS",
    accion: "CREATE_CUT_ORDERS",
    entidadTipo: "ORDEN_TRABAJO",
    descripcion: `Generacion de ${ordenes.length} ordenes de corte por mora para abonado ${currentAbonado.numeroAbonado}.`,
    detalle: {
      abonadoId: currentAbonado.id,
      numeroAbonado: currentAbonado.numeroAbonado,
      deudaVencida: totalVencido.toString(),
      ordenes: ordenes.map((orden) => orden.id),
      servicios: serviciosObjetivo.map((servicio) => servicio.id),
    },
  });

  revalidateCorePaths();
  revalidatePath(redirectPath);
  revalidatePath(`/abonados/${currentAbonado.id}`);
  revalidatePath("/ordenes");
  redirectWithMessage(redirectPath, "ok", `Se generaron ${ordenes.length} ordenes de corte por mora.`);
}

export async function updateOrdenTrabajoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const ordenId = getOptionalInt(formData, "ordenId");
  const estado = getRequiredString(formData, "estado");
  const tecnicoId = getOptionalInt(formData, "tecnicoId");
  const fechaProgramada = getOptionalDate(formData, "fechaProgramada");
  const resolucion = getOptionalString(formData, "resolucion");

  if (!ordenId || !estado) {
    redirectWithMessage("/ordenes", "error", "No se pudo actualizar la orden de trabajo.");
  }

  if (!WORK_ORDER_STATES.includes(estado as (typeof WORK_ORDER_STATES)[number])) {
    redirectWithMessage("/ordenes", "error", "El estado de la orden no es valido.");
  }

  const ordenIdValue = ordenId!;
  const orden = await prisma.ordenTrabajo.findUnique({
    where: { id: ordenIdValue },
    include: {
      servicio: true,
      abonado: {
        select: {
          id: true,
          numeroAbonado: true,
        },
      },
    },
  });

  if (!orden) {
    redirectWithMessage("/ordenes", "error", "Orden de trabajo no encontrada.");
  }

  const currentOrden = orden!;
  const fechaCierre = estado === "RESUELTA" || estado === "CANCELADA" ? new Date() : null;
  const serviceTargetState =
    estado === "RESUELTA" ? getServiceStateFromResolvedOrder(currentOrden.tipo) : null;

  await prisma.$transaction(async (tx) => {
    await tx.ordenTrabajo.update({
      where: { id: ordenIdValue },
      data: {
        estado,
        tecnicoId,
        fechaProgramada,
        fechaCierre,
        resolucion,
      },
    });

    if (currentOrden.servicioId && serviceTargetState) {
      await tx.servicio.update({
        where: { id: currentOrden.servicioId },
        data: {
          estado: serviceTargetState,
          fechaBaja: serviceTargetState === "BAJA" ? new Date() : null,
        },
      });
    }
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "ORDENES",
    accion: "UPDATE",
    entidadTipo: "ORDEN_TRABAJO",
    entidadId: ordenIdValue,
    descripcion: `Actualizacion de orden ${ordenIdValue} a estado ${estado}.`,
    detalle: {
      tecnicoId,
      fechaProgramada: fechaProgramada?.toISOString() ?? null,
      resolucion,
      servicioId: currentOrden.servicioId,
      serviceTargetState,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/ordenes", "ok", "Orden de trabajo actualizada.");
}

export async function toggleAbonadoStatusAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");

  if (!abonadoId) {
    redirectWithMessage("/abonados", "error", "No se pudo identificar el abonado.");
  }

  const abonadoIdValue = abonadoId!;

  const abonado = await prisma.abonado.findUnique({
    where: { id: abonadoIdValue },
    select: { estado: true },
  });

  if (!abonado) {
    redirectWithMessage("/abonados", "error", "Abonado no encontrado.");
  }

  const currentAbonado = abonado!;
  const nextStatus = currentAbonado.estado === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO";

  await prisma.abonado.update({
    where: { id: abonadoIdValue },
    data: { estado: nextStatus },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "ABONADOS",
    accion: "STATUS",
    entidadTipo: "ABONADO",
    entidadId: abonadoIdValue,
    descripcion: `Cambio de estado de abonado a ${nextStatus}.`,
  });

  revalidateCorePaths();
  redirectWithMessage("/abonados", "ok", `Abonado actualizado a estado ${nextStatus}.`);
}

export async function createGestionCobranzaAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const facturaId = getOptionalInt(formData, "facturaId");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const canal = getRequiredString(formData, "canal");
  const resultado = getRequiredString(formData, "resultado");
  const estadoInput = getOptionalString(formData, "estado");
  const detalle = getOptionalString(formData, "detalle");
  const compromisoPagoAt = getOptionalDate(formData, "compromisoPagoAt");
  const compromisoImporte = parseDecimal(getOptionalString(formData, "compromisoImporte"));
  const proximaGestionAt = getOptionalDate(formData, "proximaGestionAt");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : `/cuentas/${abonadoId ?? ""}`;

  if (!abonadoId || !canal || !resultado) {
    redirectWithMessage(redirectPath, "error", "Completa abonado, canal y resultado para registrar la gestion.");
  }

  if (!COLLECTION_CHANNELS.includes(canal as (typeof COLLECTION_CHANNELS)[number])) {
    redirectWithMessage(redirectPath, "error", "El canal de cobranza no es valido.");
  }

  if (!COLLECTION_OUTCOMES.includes(resultado as (typeof COLLECTION_OUTCOMES)[number])) {
    redirectWithMessage(redirectPath, "error", "El resultado de la gestion no es valido.");
  }

  const abonadoIdValue = abonadoId!;
  const requestedEstado =
    estadoInput && COLLECTION_STATES.includes(estadoInput as (typeof COLLECTION_STATES)[number])
      ? estadoInput
      : null;
  const estado =
    compromisoPagoAt && (!requestedEstado || requestedEstado === "REGISTRADA")
      ? "PROMESA_VIGENTE"
      : requestedEstado ?? "REGISTRADA";

  if (estado === "PROMESA_VIGENTE" && !compromisoPagoAt) {
    redirectWithMessage(
      redirectPath,
      "error",
      "Para registrar una promesa vigente debes indicar la fecha de compromiso de pago.",
    );
  }

  const abonado = await prisma.abonado.findUnique({
    where: { id: abonadoIdValue },
    select: {
      id: true,
      numeroAbonado: true,
    },
  });

  if (!abonado) {
    redirectWithMessage("/cuentas", "error", "Abonado no encontrado para registrar la gestion.");
  }

  if (facturaId) {
    const factura = await prisma.factura.findFirst({
      where: {
        id: facturaId,
        abonadoId: abonadoIdValue,
      },
      select: { id: true },
    });

    if (!factura) {
      redirectWithMessage(redirectPath, "error", "La factura vinculada no corresponde al abonado.");
    }
  }

  const cerradaAt = ["CUMPLIDA", "INCUMPLIDA", "CERRADA"].includes(estado) ? new Date() : null;

  const gestion = await prisma.gestionCobranza.create({
    data: {
      abonadoId: abonadoIdValue,
      usuarioId: actor.id,
      facturaId,
      canal,
      resultado,
      estado,
      detalle,
      compromisoPagoAt,
      compromisoImporte,
      proximaGestionAt,
      cerradaAt,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COBRANZAS",
    accion: "CREATE",
    entidadTipo: "GESTION_COBRANZA",
    entidadId: gestion.id,
    descripcion: `Registro de gestion de cobranza para abonado ${abonado!.numeroAbonado}.`,
    detalle: {
      abonadoId: abonadoIdValue,
      facturaId,
      canal,
      resultado,
      estado,
      compromisoPagoAt: compromisoPagoAt?.toISOString() ?? null,
      compromisoImporte: compromisoImporte?.toString() ?? null,
      proximaGestionAt: proximaGestionAt?.toISOString() ?? null,
    },
  });

  revalidateCorePaths();
  revalidatePath(redirectPath);
  revalidatePath(`/cuentas/${abonadoIdValue}`);
  revalidatePath(`/abonados/${abonadoIdValue}`);
  redirectWithMessage(redirectPath, "ok", "Gestion de cobranza registrada correctamente.");
}

export async function updateGestionCobranzaEstadoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const gestionId = getOptionalInt(formData, "gestionId");
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const estado = getRequiredString(formData, "estado");
  const detalleCierre = getOptionalString(formData, "detalleCierre");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : `/cuentas/${abonadoId ?? ""}`;

  if (!gestionId || !abonadoId || !estado) {
    redirectWithMessage(redirectPath, "error", "No se pudo actualizar la gestion de cobranza.");
  }

  if (!COLLECTION_STATES.includes(estado as (typeof COLLECTION_STATES)[number])) {
    redirectWithMessage(redirectPath, "error", "El estado de cobranza no es valido.");
  }

  const currentGestion = await prisma.gestionCobranza.findUnique({
    where: { id: gestionId! },
    select: {
      id: true,
      abonadoId: true,
      estado: true,
      detalle: true,
    },
  });

  if (!currentGestion || currentGestion.abonadoId !== abonadoId) {
    redirectWithMessage(redirectPath, "error", "Gestion de cobranza no encontrada.");
  }

  const gestionActual = currentGestion!;
  const isClosed = ["CUMPLIDA", "INCUMPLIDA", "CERRADA"].includes(estado);
  await prisma.gestionCobranza.update({
    where: { id: gestionId! },
    data: {
      estado,
      cerradaAt: isClosed ? new Date() : null,
      detalle: detalleCierre
        ? [gestionActual.detalle, `Actualizacion: ${detalleCierre}`].filter(Boolean).join("\n")
        : gestionActual.detalle,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COBRANZAS",
    accion: "UPDATE_STATUS",
    entidadTipo: "GESTION_COBRANZA",
    entidadId: gestionId,
    descripcion: `Cambio de estado de gestion de cobranza a ${estado}.`,
    detalle: {
      abonadoId,
      estadoAnterior: gestionActual.estado,
      estadoNuevo: estado,
      detalleCierre,
    },
  });

  revalidateCorePaths();
  revalidatePath(redirectPath);
  revalidatePath(`/cuentas/${abonadoId}`);
  revalidatePath(`/abonados/${abonadoId}`);
  redirectWithMessage(redirectPath, "ok", `Gestion de cobranza actualizada a ${estado}.`);
}

export async function createAcuerdoPagoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const facturaId = getOptionalInt(formData, "facturaId");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const descripcion = getOptionalString(formData, "descripcion");
  const totalAcuerdo = parseDecimal(getRequiredString(formData, "totalAcuerdo"));
  const cantidadCuotas = getOptionalInt(formData, "cantidadCuotas");
  const primerVencimiento = getOptionalDate(formData, "primerVencimiento");
  const observaciones = getOptionalString(formData, "observaciones");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : `/cuentas/${abonadoId ?? ""}`;

  if (!abonadoId || !totalAcuerdo || !cantidadCuotas || !primerVencimiento) {
    redirectWithMessage(redirectPath, "error", "Completa monto, cantidad de cuotas y primer vencimiento.");
  }

  if (cantidadCuotas! <= 0) {
    redirectWithMessage(redirectPath, "error", "La cantidad de cuotas debe ser mayor a cero.");
  }

  if (totalAcuerdo!.lessThanOrEqualTo(new Prisma.Decimal(0))) {
    redirectWithMessage(redirectPath, "error", "El monto del acuerdo debe ser mayor a cero.");
  }

  const abonadoIdValue = abonadoId!;
  const now = new Date();
  const numero = await getNextPaymentPlanNumber(now);
  const primerVencimientoValue = primerVencimiento!;

  if (facturaId) {
    const factura = await prisma.factura.findFirst({
      where: {
        id: facturaId,
        abonadoId: abonadoIdValue,
      },
      select: {
        id: true,
      },
    });

    if (!factura) {
      redirectWithMessage(redirectPath, "error", "La factura seleccionada no corresponde al abonado.");
    }
  }

  const totalCents = Math.round(Number(totalAcuerdo!.toString()) * 100);
  const baseCents = Math.floor(totalCents / cantidadCuotas!);
  const remainder = totalCents - baseCents * cantidadCuotas!;

  let acuerdoId = 0;
  await prisma.$transaction(async (tx) => {
    const acuerdo = await tx.acuerdoPago.create({
      data: {
        abonadoId: abonadoIdValue,
        usuarioId: actor.id,
        facturaId,
        numero,
        fechaAcuerdo: now,
        estado: "VIGENTE",
        descripcion,
        totalAcuerdo: totalAcuerdo!,
        cantidadCuotas: cantidadCuotas!,
        primerVencimiento: primerVencimientoValue,
        observaciones,
      },
    });
    acuerdoId = acuerdo.id;

    const cuotas = Array.from({ length: cantidadCuotas! }, (_, index) => {
      const importeCents = baseCents + (index < remainder ? 1 : 0);
      const fechaVencimiento = new Date(primerVencimientoValue);
      fechaVencimiento.setMonth(fechaVencimiento.getMonth() + index);

      return {
        acuerdoPagoId: acuerdo.id,
        numeroCuota: index + 1,
        fechaVencimiento,
        importe: new Prisma.Decimal((importeCents / 100).toFixed(2)),
        estado: "PENDIENTE",
      };
    });

    await tx.acuerdoPagoCuota.createMany({
      data: cuotas,
    });
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COBRANZAS",
    accion: "CREATE_PLAN",
    entidadTipo: "ACUERDO_PAGO",
    entidadId: acuerdoId,
    descripcion: `Alta de acuerdo de pago ${numero} para abonado ${abonadoIdValue}.`,
    detalle: {
      facturaId,
      totalAcuerdo: totalAcuerdo!.toString(),
      cantidadCuotas,
      primerVencimiento: primerVencimientoValue.toISOString(),
    },
  });

  revalidateCorePaths();
  revalidatePath(redirectPath);
  revalidatePath(`/cuentas/${abonadoIdValue}`);
  revalidatePath(`/abonados/${abonadoIdValue}`);
  redirectWithMessage(redirectPath, "ok", `Plan de pago ${numero} registrado correctamente.`);
}

export async function updateAcuerdoPagoCuotaEstadoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const acuerdoId = getOptionalInt(formData, "acuerdoId");
  const cuotaId = getOptionalInt(formData, "cuotaId");
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const estado = getRequiredString(formData, "estado");
  const observaciones = getOptionalString(formData, "observaciones");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : `/cuentas/${abonadoId ?? ""}`;

  if (!acuerdoId || !cuotaId || !abonadoId || !estado) {
    redirectWithMessage(redirectPath, "error", "No se pudo actualizar la cuota del acuerdo.");
  }

  if (!PAYMENT_PLAN_INSTALLMENT_STATES.includes(estado as (typeof PAYMENT_PLAN_INSTALLMENT_STATES)[number])) {
    redirectWithMessage(redirectPath, "error", "El estado de la cuota no es valido.");
  }

  const acuerdo = await prisma.acuerdoPago.findUnique({
    where: { id: acuerdoId! },
    include: {
      cuotas: {
        orderBy: { numeroCuota: "asc" },
      },
    },
  });

  if (!acuerdo || acuerdo.abonadoId !== abonadoId) {
    redirectWithMessage(redirectPath, "error", "Acuerdo de pago no encontrado.");
  }

  const acuerdoActual = acuerdo!;
  await prisma.$transaction(async (tx) => {
    await tx.acuerdoPagoCuota.update({
      where: { id: cuotaId! },
      data: {
        estado,
        cumplidaAt: estado === "CUMPLIDA" ? new Date() : null,
        observaciones,
      },
    });

    const cuotasActualizadas = acuerdoActual.cuotas.map((cuota) =>
      cuota.id === cuotaId!
        ? {
            ...cuota,
            estado,
          }
        : cuota,
    );

    const acuerdoEstado =
      cuotasActualizadas.every((cuota) => cuota.estado === "CUMPLIDA")
        ? "CUMPLIDO"
        : cuotasActualizadas.some((cuota) => cuota.estado === "INCUMPLIDA")
          ? "INCUMPLIDO"
          : "VIGENTE";

    await tx.acuerdoPago.update({
      where: { id: acuerdoId! },
      data: {
        estado: acuerdoEstado,
        cerradoAt: acuerdoEstado === "CUMPLIDO" ? new Date() : null,
      },
    });
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COBRANZAS",
    accion: "UPDATE_PLAN_INSTALLMENT",
    entidadTipo: "ACUERDO_PAGO_CUOTA",
    entidadId: cuotaId,
    descripcion: `Actualizacion de cuota de acuerdo ${acuerdoId} a estado ${estado}.`,
    detalle: {
      abonadoId,
      acuerdoId,
      observaciones,
    },
  });

  revalidateCorePaths();
  revalidatePath(redirectPath);
  revalidatePath(`/cuentas/${abonadoId}`);
  redirectWithMessage(redirectPath, "ok", `Cuota actualizada a ${estado}.`);
}

export async function createPagoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const usuarioId = getOptionalInt(formData, "usuarioId") ?? actor.id;
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const medioPago = getRequiredString(formData, "medioPago");
  const importeRaw = getRequiredString(formData, "importe");
  const descripcion = getOptionalString(formData, "descripcion") ?? "Pago registrado manualmente";
  const importe = parseDecimal(importeRaw);
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : "/facturacion";

  if (!abonadoId || !usuarioId || !medioPago || !importe) {
    redirectWithMessage(redirectPath, "error", "Completa abonado, operador, medio e importe.");
  }

  const abonadoIdValue = abonadoId!;
  const usuarioIdValue = usuarioId!;
  const importeValue = importe!;
  const now = new Date();
  let numeroRecibo = "";

  await prisma.$transaction(async (tx) => {
    const registered = await registerPaymentInAccount(tx, {
      abonadoId: abonadoIdValue,
      usuarioId: usuarioIdValue,
      medioPago,
      importe: importeValue,
      fecha: now,
      descripcion,
    });
    numeroRecibo = registered.numeroRecibo;
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "FACTURACION",
    accion: "PAGO",
    entidadTipo: "ABONADO",
    entidadId: abonadoIdValue,
    descripcion: `Registro de pago para abonado ${abonadoIdValue}.`,
    detalle: {
      numeroRecibo,
      medioPago,
      importe: importeValue.toString(),
      usuarioCajaId: usuarioIdValue,
    },
  });

  revalidateCorePaths();
  revalidatePath(redirectPath);
  revalidatePath(`/abonados/${abonadoIdValue}`);
  revalidatePath(`/cuentas/${abonadoIdValue}`);
  redirectWithMessage(
    redirectPath,
    "ok",
    `Pago registrado correctamente. Recibo generado: ${numeroRecibo}.`,
  );
}

export async function cancelPagoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const pagoId = getOptionalInt(formData, "pagoId");
  const motivoAnulacion = getRequiredString(formData, "motivoAnulacion");

  if (!pagoId || !motivoAnulacion) {
    redirectWithMessage("/facturacion", "error", "Completa pago y motivo de anulacion.");
  }

  const pagoIdValue = pagoId!;
  const pago = await prisma.pago.findUnique({
    where: { id: pagoIdValue },
    include: {
      movimientos: {
        where: {
          anuladoAt: null,
          tipo: "CREDITO",
        },
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
      },
      abonado: {
        select: {
          id: true,
          numeroAbonado: true,
        },
      },
    },
  });

  if (!pago) {
    redirectWithMessage("/facturacion", "error", "Pago no encontrado.");
  }

  const currentPago = pago!;

  if (currentPago.estado === "ANULADO") {
    redirectWithMessage("/facturacion", "error", "Ese pago ya se encuentra anulado.");
  }

  if (currentPago.movimientos.length === 0) {
    redirectWithMessage(
      "/facturacion",
      "error",
      "Este pago no tiene trazabilidad suficiente para anularse automaticamente.",
    );
  }

  const now = new Date();
  const latestMovement = await prisma.cuentaCorriente.findFirst({
    where: { abonadoId: currentPago.abonadoId },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
    select: { saldo: true },
  });

  let saldoCorriente = latestMovement
    ? new Prisma.Decimal(latestMovement.saldo.toString())
    : new Prisma.Decimal(0);

  await prisma.$transaction(async (tx) => {
    await tx.pago.update({
      where: { id: pagoIdValue },
      data: {
        estado: "ANULADO",
        motivoAnulacion,
        anuladoAt: now,
      },
    });

    await tx.cuentaCorriente.updateMany({
      where: {
        pagoId: pagoIdValue,
        anuladoAt: null,
        tipo: "CREDITO",
      },
      data: {
        anuladoAt: now,
      },
    });

    for (const movimiento of currentPago.movimientos) {
      saldoCorriente = saldoCorriente.add(new Prisma.Decimal(movimiento.importe.toString()));

      await tx.cuentaCorriente.create({
        data: {
          abonadoId: currentPago.abonadoId,
          facturaId: movimiento.facturaId,
          pagoId: null,
          tipo: "DEBITO",
          importe: movimiento.importe,
          saldo: saldoCorriente,
          fecha: now,
          descripcion: `Anulacion de ${currentPago.numeroRecibo ?? `PAGO-${currentPago.id}`} - ${motivoAnulacion}`,
        },
      });

      if (movimiento.facturaId) {
        const creditosVigentes = await tx.cuentaCorriente.findMany({
          where: {
            facturaId: movimiento.facturaId,
            tipo: "CREDITO",
            anuladoAt: null,
          },
          select: { importe: true },
        });

        const factura = await tx.factura.findUnique({
          where: { id: movimiento.facturaId },
          select: {
            id: true,
            total: true,
            fechaVencimiento: true,
          },
        });

        if (factura) {
          const creditedActive = creditosVigentes.reduce(
            (sum, item) => sum.add(new Prisma.Decimal(item.importe.toString())),
            new Prisma.Decimal(0),
          );

          await tx.factura.update({
            where: { id: factura.id },
            data: {
              estado: getInvoiceStatusByBalance(
                new Prisma.Decimal(factura.total.toString()),
                creditedActive,
                factura.fechaVencimiento,
                now,
              ),
            },
          });
        }
      }
    }
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "FACTURACION",
    accion: "ANULAR_PAGO",
    entidadTipo: "PAGO",
    entidadId: pagoIdValue,
    descripcion: `Anulacion de recibo ${currentPago.numeroRecibo ?? `PAGO-${currentPago.id}`}.`,
    detalle: {
      numeroRecibo: currentPago.numeroRecibo ?? null,
      motivoAnulacion,
      abonadoId: currentPago.abonadoId,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(
    "/facturacion",
    "ok",
    `Recibo ${currentPago.numeroRecibo ?? `PAGO-${currentPago.id}`} anulado correctamente.`,
  );
}

export async function openCajaAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const saldoInicial = parseDecimal(getRequiredString(formData, "saldoInicial")) ?? new Prisma.Decimal(0);
  const observacionesApertura = getOptionalString(formData, "observacionesApertura");
  const now = new Date();
  const fecha = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const existing = await prisma.cajaCierre.findFirst({
    where: {
      fecha,
      estado: "ABIERTA",
    },
    select: { id: true },
  });

  if (existing) {
    redirectWithMessage("/caja", "error", "Ya existe una caja abierta para esta fecha.");
  }

  const cierre = await prisma.cajaCierre.create({
    data: {
      fecha,
      estado: "ABIERTA",
      saldoInicial,
      observacionesApertura,
      aperturaAt: now,
      usuarioAperturaId: actor.id,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "CAJA",
    accion: "APERTURA",
    entidadTipo: "CAJA_CIERRE",
    entidadId: cierre.id,
    descripcion: "Apertura de caja diaria.",
    detalle: {
      saldoInicial: saldoInicial.toString(),
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/caja", "ok", "Caja abierta correctamente.");
}

export async function closeCajaAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const cajaId = getOptionalInt(formData, "cajaId");
  const efectivoDeclarado = parseDecimal(getOptionalString(formData, "efectivoDeclarado")) ?? new Prisma.Decimal(0);
  const transferenciaDeclarada =
    parseDecimal(getOptionalString(formData, "transferenciaDeclarada")) ?? new Prisma.Decimal(0);
  const tarjetaDeclarada = parseDecimal(getOptionalString(formData, "tarjetaDeclarada")) ?? new Prisma.Decimal(0);
  const observacionesCierre = getOptionalString(formData, "observacionesCierre");

  if (!cajaId) {
    redirectWithMessage("/caja", "error", "No se pudo identificar la caja a cerrar.");
  }

  const cajaIdValue = cajaId!;
  const caja = await prisma.cajaCierre.findUnique({
    where: { id: cajaIdValue },
    select: {
      id: true,
      fecha: true,
      estado: true,
      saldoInicial: true,
    },
  });

  if (!caja) {
    redirectWithMessage("/caja", "error", "Caja no encontrada.");
  }

  const currentCaja = caja!;

  if (currentCaja.estado !== "ABIERTA") {
    redirectWithMessage("/caja", "error", "La caja ya fue cerrada.");
  }

  const start = new Date(currentCaja.fecha);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const pagos = await prisma.pago.findMany({
    where: {
      fecha: {
        gte: start,
        lt: end,
      },
      estado: "REGISTRADO",
    },
    select: {
      medioPago: true,
      importe: true,
    },
  });

  const saldoInicialValue = new Prisma.Decimal(currentCaja.saldoInicial.toString());
  const efectivoSistema = pagos
    .filter((pago) => pago.medioPago === "EFECTIVO")
    .reduce((sum, pago) => sum.add(new Prisma.Decimal(pago.importe.toString())), new Prisma.Decimal(0));
  const transferenciaSistema = pagos
    .filter((pago) => pago.medioPago === "TRANSFERENCIA")
    .reduce((sum, pago) => sum.add(new Prisma.Decimal(pago.importe.toString())), new Prisma.Decimal(0));
  const tarjetaSistema = pagos
    .filter((pago) => pago.medioPago === "TARJETA")
    .reduce((sum, pago) => sum.add(new Prisma.Decimal(pago.importe.toString())), new Prisma.Decimal(0));
  const ingresosSistema = pagos.reduce(
    (sum, pago) => sum.add(new Prisma.Decimal(pago.importe.toString())),
    new Prisma.Decimal(0),
  );
  const totalDeclarado = saldoInicialValue
    .add(efectivoDeclarado)
    .add(transferenciaDeclarada)
    .add(tarjetaDeclarada);
  const totalSistema = saldoInicialValue.add(ingresosSistema);
  const diferencia = totalDeclarado.sub(totalSistema);

  await prisma.cajaCierre.update({
    where: { id: cajaIdValue },
    data: {
      estado: "CERRADA",
      ingresosSistema,
      efectivoSistema,
      transferenciaSistema,
      tarjetaSistema,
      efectivoDeclarado,
      transferenciaDeclarada,
      tarjetaDeclarada,
      totalDeclarado,
      diferencia,
      observacionesCierre,
      cierreAt: new Date(),
      usuarioCierreId: actor.id,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "CAJA",
    accion: "CIERRE",
    entidadTipo: "CAJA_CIERRE",
    entidadId: cajaIdValue,
    descripcion: "Cierre de caja diaria.",
    detalle: {
      ingresosSistema: ingresosSistema.toString(),
      totalDeclarado: totalDeclarado.toString(),
      diferencia: diferencia.toString(),
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/caja", "ok", "Caja cerrada correctamente.");
}

export async function generateMonthlyInvoicesAction() {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const now = new Date();
  const { start, end } = getMonthBounds(now);
  const billingConfig = await getBillingConfig();

  const abonados = await prisma.abonado.findMany({
    where: { estado: "ACTIVO" },
    include: {
      servicios: {
        where: { estado: "ACTIVO", facturable: true },
        include: {
          servicioCatalogo: true,
        },
      },
      reclamos: {
        include: {
          materiales: {
            where: {
              facturarProximaFactura: true,
              facturado: false,
            },
            include: {
              material: true,
            },
          },
        },
      },
    },
    orderBy: { numeroAbonado: "asc" },
  });

  const serviceIds = abonados.flatMap((abonado) => abonado.servicios.map((servicio) => servicio.id));
  const latestFacturaDetalles = serviceIds.length
    ? await prisma.facturaDetalle.findMany({
        where: {
          servicioId: {
            in: serviceIds,
          },
        },
        include: {
          factura: {
            select: {
              fechaEmision: true,
            },
          },
        },
        orderBy: [{ factura: { fechaEmision: "desc" } }, { id: "desc" }],
      })
    : [];

  const latestBilledByService = new Map<number, Date>();
  for (const detalle of latestFacturaDetalles) {
    if (!detalle.servicioId || latestBilledByService.has(detalle.servicioId)) {
      continue;
    }

    latestBilledByService.set(detalle.servicioId, detalle.factura.fechaEmision);
  }

  const existingInvoices = await prisma.factura.findMany({
    where: {
      fechaEmision: {
        gte: start,
        lt: end,
      },
    },
    select: {
      abonadoId: true,
    },
  });

  const alreadyBilled = new Set(existingInvoices.map((item) => item.abonadoId));
  let created = 0;
  let skipped = 0;

  for (const abonado of abonados) {
    const materialesFacturables = abonado.reclamos.flatMap((reclamo) =>
      reclamo.materiales.map((material) => {
        const cantidad = new Prisma.Decimal(material.cantidad.toString());
        const precioUnitario = material.precioFacturable
          ? new Prisma.Decimal(material.precioFacturable.toString())
          : new Prisma.Decimal(material.costoUnitario.toString());
        const subtotal = precioUnitario.mul(cantidad);
        const ivaAlicuota = new Prisma.Decimal(material.ivaAlicuota.toString());
        const ivaImporte = calculateTax(subtotal, ivaAlicuota);
        const totalLinea = subtotal.add(ivaImporte);

        return {
          servicioId: null,
          reclamoMaterialId: material.id,
          descripcion: `Material tecnico - ${material.material.nombre}`,
          cantidad,
          precioUnitario,
          subtotal,
          ivaAlicuota,
          ivaImporte,
          totalLinea,
        };
      }),
    );

    if (alreadyBilled.has(abonado.id) || (abonado.servicios.length === 0 && materialesFacturables.length === 0)) {
      skipped += 1;
      continue;
    }

    const invoiceNumber = await getNextInvoiceNumber(now);
    const vencimiento = new Date(now.getFullYear(), now.getMonth(), 15);
    const latestMovement = await prisma.cuentaCorriente.findFirst({
      where: { abonadoId: abonado.id },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      select: { saldo: true },
    });

    const saldoActual = latestMovement
      ? new Prisma.Decimal(latestMovement.saldo.toString())
      : new Prisma.Decimal(0);

    const detalleItems = abonado.servicios
      .filter((servicio) =>
        shouldBillServiceForPeriod(
          servicio.servicioCatalogo?.periodicidad,
          latestBilledByService.get(servicio.id) ?? null,
          now,
        ),
      )
      .map((servicio) => {
        const cantidad = new Prisma.Decimal(servicio.cantidad.toString());
        const precioUnitario = new Prisma.Decimal(servicio.precio.toString()).sub(
          new Prisma.Decimal(servicio.bonificacion.toString()),
        );
        const subtotal = precioUnitario.mul(cantidad);
        const ivaAlicuota = servicio.servicioCatalogo
          ? new Prisma.Decimal(servicio.servicioCatalogo.alicuotaIva.toString())
          : new Prisma.Decimal(0);
        const totalLinea = subtotal.add(calculateTax(subtotal, ivaAlicuota));

        return {
          servicioId: servicio.id,
          reclamoMaterialId: null,
          descripcion: `${servicio.plan}${
            servicio.servicioCatalogo?.periodicidad && servicio.servicioCatalogo.periodicidad !== "MENSUAL"
              ? ` (${servicio.servicioCatalogo.periodicidad})`
              : ""
          }`,
          cantidad,
          precioUnitario,
          subtotal,
          ivaAlicuota,
          ivaImporte: calculateTax(subtotal, ivaAlicuota),
          totalLinea,
        };
      });

    if (detalleItems.length === 0 && materialesFacturables.length === 0) {
      skipped += 1;
      continue;
    }

    const allDetalleItems = [...detalleItems, ...materialesFacturables];

    const subtotalFactura = allDetalleItems.reduce(
      (sum, item) => sum.add(item.subtotal),
      new Prisma.Decimal(0),
    );
    const totalIva = allDetalleItems.reduce(
      (sum, item) => sum.add(item.ivaImporte),
      new Prisma.Decimal(0),
    );
    const total = subtotalFactura.add(totalIva);
    const saldoNuevo = saldoActual.add(total);
    const receptorDocumento = inferArcaDocumentType(abonado);
    const tipoComprobanteArca = inferArcaInvoiceType(billingConfig, abonado);

    await prisma.$transaction(async (tx) => {
      const factura = await tx.factura.create({
        data: {
          abonadoId: abonado.id,
          numero: invoiceNumber,
          fechaEmision: now,
          fechaVencimiento: vencimiento,
          subtotal: subtotalFactura,
          totalIva,
          total,
          estado: "PENDIENTE",
          condicionIvaEmisor: billingConfig.condicionIvaEmisor,
          condicionIvaReceptor: abonado.condicionIva,
          tipoComprobanteArca,
          conceptoArca: billingConfig.conceptoArcaDefault,
          tipoDocumentoReceptor: receptorDocumento.code,
          numeroDocumentoReceptor: receptorDocumento.number,
          monedaCodigo: billingConfig.monedaCodigoDefault,
          monedaCotizacion: new Prisma.Decimal(1),
          puntoVentaArca: billingConfig.puntoVenta,
          resultadoArca: billingConfig.arcaHabilitado ? "PENDIENTE" : "NO_ENVIADA",
          observacionesArca: billingConfig.arcaHabilitado
            ? "Pendiente de envio a ARCA/WSFEv1."
            : "ARCA deshabilitado en configuracion. Comprobante emitido solo para uso interno.",
        },
      });

      if (allDetalleItems.length > 0) {
        await tx.facturaDetalle.createMany({
          data: allDetalleItems.map((item) => ({
            facturaId: factura.id,
            servicioId: item.servicioId,
            reclamoMaterialId: item.reclamoMaterialId,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            subtotal: item.subtotal,
            ivaAlicuota: item.ivaAlicuota,
            ivaImporte: item.ivaImporte,
            totalLinea: item.totalLinea,
          })),
        });
      }

      if (materialesFacturables.length > 0) {
        await tx.reclamoMaterial.updateMany({
          where: {
            id: {
              in: materialesFacturables
                .map((item) => item.reclamoMaterialId)
                .filter((value): value is number => value !== null),
            },
          },
          data: {
            facturado: true,
          },
        });
      }

      await tx.cuentaCorriente.create({
        data: {
          abonadoId: abonado.id,
          facturaId: factura.id,
          tipo: "DEBITO",
          importe: total,
          saldo: saldoNuevo,
          fecha: now,
          descripcion: `Factura generada automaticamente para ${String(
            now.getMonth() + 1,
          ).padStart(2, "0")}/${now.getFullYear()}`,
        },
      });
    });

    created += 1;
  }

  await logAuditEvent({
    actorId: actor.id,
    modulo: "FACTURACION",
    accion: "GENERAR_LOTE",
    entidadTipo: "FACTURA",
    descripcion: "Generacion mensual de facturas.",
    detalle: {
      creadas: created,
      omitidas: skipped,
      fecha: now.toISOString(),
    },
  });

  revalidateCorePaths();
  redirectWithMessage(
    "/facturacion",
    "ok",
    `Facturacion mensual completada: ${created} facturas nuevas y ${skipped} abonados omitidos.`,
  );
}

export async function createNotaAjusteAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const facturaOrigenId = getOptionalInt(formData, "facturaOrigenId");
  const tipoNota = getRequiredString(formData, "tipoNota");
  const descripcion = getRequiredString(formData, "descripcion");
  const importe = parseDecimal(getRequiredString(formData, "importe"));

  if (!facturaOrigenId || !tipoNota || !descripcion || !importe) {
    redirectWithMessage(`/facturacion/${facturaOrigenId ?? ""}`, "error", "Completa tipo, importe y descripcion del ajuste.");
  }

  if (!["CREDITO", "DEBITO"].includes(tipoNota)) {
    redirectWithMessage(`/facturacion/${facturaOrigenId}`, "error", "El tipo de ajuste no es valido.");
  }

  const facturaOrigenIdValue = facturaOrigenId!;
  const facturaOrigen = await prisma.factura.findUnique({
    where: { id: facturaOrigenIdValue },
    select: {
      id: true,
      abonadoId: true,
      numero: true,
      fechaVencimiento: true,
      total: true,
      condicionIvaEmisor: true,
      condicionIvaReceptor: true,
      tipoComprobanteArca: true,
      conceptoArca: true,
      tipoDocumentoReceptor: true,
      numeroDocumentoReceptor: true,
      monedaCodigo: true,
      monedaCotizacion: true,
      puntoVentaArca: true,
      resultadoArca: true,
    },
  });

  if (!facturaOrigen) {
    redirectWithMessage("/facturacion", "error", "Factura origen no encontrada.");
  }

  const currentFactura = facturaOrigen!;
  const kind = tipoNota as "CREDITO" | "DEBITO";
  const now = new Date();
  const numeroAjuste = await getNextAdjustmentNumber(kind, now);
  const latestMovement = await prisma.cuentaCorriente.findFirst({
    where: { abonadoId: currentFactura.abonadoId },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
    select: { saldo: true },
  });

  let saldoCorriente = latestMovement
    ? new Prisma.Decimal(latestMovement.saldo.toString())
    : new Prisma.Decimal(0);

  const nota = await prisma.$transaction(async (tx) => {
    const notaCreada = await tx.factura.create({
      data: {
        abonadoId: currentFactura.abonadoId,
        facturaOrigenId: currentFactura.id,
        numero: numeroAjuste,
        fechaEmision: now,
        fechaVencimiento: now,
        subtotal: importe!,
        totalIva: new Prisma.Decimal(0),
        total: importe!,
        estado: kind === "CREDITO" ? "PAGADA" : "PENDIENTE",
        tipoAjuste: kind,
        motivoAjuste: descripcion,
        condicionIvaEmisor: currentFactura.condicionIvaEmisor,
        condicionIvaReceptor: currentFactura.condicionIvaReceptor,
        tipoComprobanteArca: mapAdjustmentInvoiceType(currentFactura.tipoComprobanteArca, kind),
        conceptoArca: currentFactura.conceptoArca,
        tipoDocumentoReceptor: currentFactura.tipoDocumentoReceptor,
        numeroDocumentoReceptor: currentFactura.numeroDocumentoReceptor,
        monedaCodigo: currentFactura.monedaCodigo,
        monedaCotizacion: currentFactura.monedaCotizacion,
        puntoVentaArca: currentFactura.puntoVentaArca,
        resultadoArca: currentFactura.resultadoArca === "AUTORIZADA" ? "PENDIENTE" : "NO_ENVIADA",
        observacionesArca: `${kind === "CREDITO" ? "Nota de credito" : "Nota de debito"} interna vinculada a ${currentFactura.numero}.`,
      },
    });

    await tx.facturaDetalle.create({
      data: {
        facturaId: notaCreada.id,
        descripcion,
        cantidad: new Prisma.Decimal(1),
        precioUnitario: importe!,
        subtotal: importe!,
        ivaAlicuota: new Prisma.Decimal(0),
        ivaImporte: new Prisma.Decimal(0),
        totalLinea: importe!,
      },
    });

    if (kind === "CREDITO") {
      saldoCorriente = saldoCorriente.sub(importe!);

      await tx.cuentaCorriente.create({
        data: {
          abonadoId: currentFactura.abonadoId,
          facturaId: currentFactura.id,
          tipo: "CREDITO",
          importe: importe!,
          saldo: saldoCorriente,
          fecha: now,
          descripcion: `${numeroAjuste} - ${descripcion}`,
        },
      });

      const creditosActivos = await tx.cuentaCorriente.findMany({
        where: {
          facturaId: currentFactura.id,
          tipo: "CREDITO",
          anuladoAt: null,
        },
        select: {
          importe: true,
        },
      });

      const totalCreditos = creditosActivos.reduce(
        (sum, item) => sum.add(new Prisma.Decimal(item.importe.toString())),
        new Prisma.Decimal(0),
      );

      await tx.factura.update({
        where: { id: currentFactura.id },
        data: {
          estado: getInvoiceStatusByBalance(
            new Prisma.Decimal(currentFactura.total.toString()),
            totalCreditos,
            currentFactura.fechaVencimiento,
            now,
          ),
        },
      });
    } else {
      saldoCorriente = saldoCorriente.add(importe!);

      await tx.cuentaCorriente.create({
        data: {
          abonadoId: currentFactura.abonadoId,
          facturaId: notaCreada.id,
          tipo: "DEBITO",
          importe: importe!,
          saldo: saldoCorriente,
          fecha: now,
          descripcion: `${numeroAjuste} - ${descripcion}`,
        },
      });
    }

    return notaCreada;
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "FACTURACION",
    accion: kind === "CREDITO" ? "NOTA_CREDITO" : "NOTA_DEBITO",
    entidadTipo: "FACTURA",
    entidadId: nota.id,
    descripcion: `Generacion de ${kind === "CREDITO" ? "nota de credito" : "nota de debito"} ${numeroAjuste}.`,
    detalle: {
      facturaOrigenId: currentFactura.id,
      facturaOrigen: currentFactura.numero,
      importe: importe!.toString(),
      descripcion,
    },
  });

  revalidateCorePaths();
  revalidatePath(`/facturacion/${facturaOrigenIdValue}`);
  revalidatePath(`/facturacion/${nota.id}`);
  redirectWithMessage(`/facturacion/${facturaOrigenIdValue}`, "ok", `${kind === "CREDITO" ? "Nota de credito" : "Nota de debito"} generada: ${numeroAjuste}.`);
}

export async function createReclamoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const tecnicoId = getOptionalInt(formData, "tecnicoId");
  const redirectPathRaw = getOptionalString(formData, "redirectPath");
  const tipoServicio = getRequiredString(formData, "tipoServicio");
  const prioridad = getRequiredString(formData, "prioridad");
  const descripcion = getRequiredString(formData, "descripcion");
  const redirectPath =
    redirectPathRaw && redirectPathRaw.startsWith("/") ? redirectPathRaw : "/reclamos";

  if (!abonadoId || !tipoServicio || !prioridad || !descripcion) {
    redirectWithMessage(
      redirectPath,
      "error",
      "Completa abonado, tipo de servicio, prioridad y descripcion.",
    );
  }

  const abonadoIdValue = abonadoId!;

  const reclamo = await prisma.reclamo.create({
    data: {
      abonadoId: abonadoIdValue,
      tecnicoId,
      tipoServicio,
      prioridad,
      descripcion,
      estado: tecnicoId ? "EN_PROCESO" : "ABIERTO",
      fechaApertura: new Date(),
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "RECLAMOS",
    accion: "CREATE",
    entidadTipo: "RECLAMO",
    entidadId: reclamo.id,
    descripcion: `Apertura de reclamo para abonado ${abonadoIdValue}.`,
    detalle: {
      tipoServicio,
      prioridad,
      tecnicoId,
    },
  });

  revalidateCorePaths();
  revalidatePath(redirectPath);
  revalidatePath(`/abonados/${abonadoIdValue}`);
  redirectWithMessage(redirectPath, "ok", "Reclamo registrado correctamente.");
}

export async function addReclamoMaterialAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const reclamoId = getOptionalInt(formData, "reclamoId");
  const materialId = getOptionalInt(formData, "materialId");
  const cantidad = parseDecimal(getRequiredString(formData, "cantidad"));
  const precioFacturable = parseDecimal(getOptionalString(formData, "precioFacturable"));
  const facturarProximaFactura = getBoolean(formData, "facturarProximaFactura");

  if (!reclamoId || !materialId || !cantidad) {
    redirectWithMessage(
      "/reclamos",
      "error",
      "Completa reclamo, material y cantidad para registrar el consumo tecnico.",
    );
  }

  const materialIdValue = materialId!;
  const cantidadValue = cantidad!;

  const [reclamo, material] = await Promise.all([
    prisma.reclamo.findUnique({
      where: { id: reclamoId! },
      select: { id: true },
    }),
    prisma.material.findUnique({
      where: { id: materialIdValue },
      select: {
        id: true,
        nombre: true,
        stockActual: true,
        costoPromedio: true,
        precioFacturable: true,
        ivaAlicuota: true,
      },
    }),
  ]);

  if (!reclamo || !material) {
    redirectWithMessage("/reclamos", "error", "No se pudo registrar el material del reclamo.");
  }

  const currentReclamo = reclamo!;
  const currentMaterial = material!;
  const stockActual = new Prisma.Decimal(currentMaterial.stockActual.toString());
  if (stockActual.lessThan(cantidadValue)) {
    redirectWithMessage("/reclamos", "error", "No hay stock suficiente para descontar ese material.");
  }

  const costoUnitario = new Prisma.Decimal(currentMaterial.costoPromedio.toString());
  const nuevoStock = stockActual.sub(cantidadValue);

  await prisma.$transaction(async (tx) => {
    await tx.reclamoMaterial.create({
      data: {
        reclamoId: currentReclamo.id,
        materialId: currentMaterial.id,
        cantidad: cantidadValue,
        costoUnitario,
        precioFacturable: facturarProximaFactura
          ? precioFacturable ?? currentMaterial.precioFacturable ?? costoUnitario
          : null,
        ivaAlicuota: currentMaterial.ivaAlicuota,
        facturarProximaFactura,
      },
    });

    await tx.material.update({
      where: { id: currentMaterial.id },
      data: {
        stockActual: nuevoStock,
      },
    });

    await tx.movimientoStock.create({
      data: {
        materialId: currentMaterial.id,
        reclamoId: currentReclamo.id,
        tipo: "CONSUMO_RECLAMO",
        cantidad: cantidadValue.mul(new Prisma.Decimal(-1)),
        costoUnitario,
        descripcion: `Consumo tecnico en reclamo #${currentReclamo.id}`,
      },
    });
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "RECLAMOS",
    accion: "ADD_MATERIAL",
    entidadTipo: "RECLAMO",
    entidadId: currentReclamo.id,
    descripcion: `Carga de material ${currentMaterial.nombre} en reclamo ${currentReclamo.id}.`,
    detalle: {
      materialId: currentMaterial.id,
      cantidad: cantidadValue.toString(),
      facturarProximaFactura,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(
    "/reclamos",
    "ok",
    `Material ${currentMaterial.nombre} registrado en el reclamo y descontado del stock.`,
  );
}

export async function resolveReclamoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const reclamoId = getOptionalInt(formData, "reclamoId");
  const diagnosticoCierre = getRequiredString(formData, "diagnosticoCierre");
  const resolucionCierre = getRequiredString(formData, "resolucionCierre");

  if (!reclamoId) {
    redirectWithMessage("/reclamos", "error", "No se pudo identificar el reclamo.");
  }

  if (!diagnosticoCierre || !resolucionCierre) {
    redirectWithMessage(
      "/reclamos",
      "error",
      "Para cerrar el reclamo debes informar diagnostico y resolucion.",
    );
  }

  const reclamoIdValue = reclamoId!;

  await prisma.reclamo.update({
    where: { id: reclamoIdValue },
    data: {
      estado: "RESUELTO",
      fechaCierre: new Date(),
      diagnosticoCierre,
      resolucionCierre,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "RECLAMOS",
    accion: "RESOLVE",
    entidadTipo: "RECLAMO",
    entidadId: reclamoIdValue,
    descripcion: `Cierre de reclamo ${reclamoIdValue}.`,
    detalle: {
      diagnosticoCierre,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/reclamos", "ok", "Reclamo marcado como resuelto.");
}

export async function createComunicacionAbonadoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const plantillaId = getOptionalInt(formData, "plantillaId");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/comunicaciones";
  const canal = getRequiredString(formData, "canal");
  const tipo = getRequiredString(formData, "tipo");
  const asunto = getRequiredString(formData, "asunto");
  const mensaje = getRequiredString(formData, "mensaje");
  const prioridad = getOptionalString(formData, "prioridad") ?? "NORMAL";
  const estado = getOptionalString(formData, "estado") ?? "REGISTRADA";
  const origenModulo = getOptionalString(formData, "origenModulo");
  const visibleOficinaVirtual = getBoolean(formData, "visibleOficinaVirtual");
  const requiereSeguimiento = getBoolean(formData, "requiereSeguimiento");
  const programadaAt = getOptionalDate(formData, "programadaAt");

  if (!abonadoId || !canal || !tipo || !asunto || !mensaje) {
    redirectWithMessage(redirectPath, "error", "Completa abonado, canal, tipo, asunto y mensaje.");
  }

  if (!COMMUNICATION_CHANNELS.includes(canal as (typeof COMMUNICATION_CHANNELS)[number])) {
    redirectWithMessage(redirectPath, "error", "El canal de comunicacion no es valido.");
  }

  if (!COMMUNICATION_TYPES.includes(tipo as (typeof COMMUNICATION_TYPES)[number])) {
    redirectWithMessage(redirectPath, "error", "El tipo de comunicacion no es valido.");
  }

  if (!COMMUNICATION_STATES.includes(estado as (typeof COMMUNICATION_STATES)[number])) {
    redirectWithMessage(redirectPath, "error", "El estado de comunicacion no es valido.");
  }

  if (!COMMUNICATION_PRIORITIES.includes(prioridad as (typeof COMMUNICATION_PRIORITIES)[number])) {
    redirectWithMessage(redirectPath, "error", "La prioridad de comunicacion no es valida.");
  }

  const abonadoIdValue = abonadoId!;
  const abonado = await prisma.abonado.findUnique({
    where: { id: abonadoIdValue },
    select: { id: true, numeroAbonado: true },
  });

  if (!abonado) {
    redirectWithMessage(redirectPath, "error", "Abonado no encontrado para registrar la comunicacion.");
  }

  const plantilla = plantillaId
    ? await prisma.plantillaComunicacion.findUnique({
        where: { id: plantillaId },
        select: {
          id: true,
          codigo: true,
          nombre: true,
        },
      })
    : null;

  const comunicacion = await prisma.comunicacionAbonado.create({
    data: {
      abonadoId: abonadoIdValue,
      usuarioId: actor.id,
      canal,
      tipo,
      asunto,
      mensaje,
      prioridad,
      estado,
      origenModulo,
      visibleOficinaVirtual,
      requiereSeguimiento,
      programadaAt,
      enviadaAt: estado === "ENVIADA" ? new Date() : null,
      metadataJson: plantilla
        ? JSON.stringify({
            plantillaId: plantilla.id,
            plantillaCodigo: plantilla.codigo,
            plantillaNombre: plantilla.nombre,
          })
        : null,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COMUNICACIONES",
    accion: "CREATE",
    entidadTipo: "COMUNICACION",
    entidadId: comunicacion.id,
    descripcion: `Comunicacion ${canal} registrada para abonado ${abonado!.numeroAbonado}.`,
    detalle: {
      abonadoId: abonadoIdValue,
      canal,
      tipo,
      estado,
      plantillaId: plantilla?.id ?? null,
      visibleOficinaVirtual,
      requiereSeguimiento,
    },
  });

  revalidateCorePaths();
  revalidatePath(`/abonados/${abonadoIdValue}`);
  revalidatePath(`/oficina-virtual/${abonadoIdValue}`);
  redirectWithMessage(redirectPath, "ok", "Comunicacion registrada correctamente.");
}

export async function updateComunicacionEstadoAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const comunicacionId = getOptionalInt(formData, "comunicacionId");
  const estado = getRequiredString(formData, "estado");
  const errorDetalle = getOptionalString(formData, "errorDetalle");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/comunicaciones";

  if (!comunicacionId || !estado) {
    redirectWithMessage(redirectPath, "error", "No se pudo identificar la comunicacion a actualizar.");
  }

  if (!COMMUNICATION_STATES.includes(estado as (typeof COMMUNICATION_STATES)[number])) {
    redirectWithMessage(redirectPath, "error", "El estado de comunicacion no es valido.");
  }

  const comunicacion = await prisma.comunicacionAbonado.findUnique({
    where: { id: comunicacionId! },
    select: { id: true, abonadoId: true, estado: true },
  });

  if (!comunicacion) {
    redirectWithMessage(redirectPath, "error", "Comunicacion no encontrada.");
  }

  await prisma.comunicacionAbonado.update({
    where: { id: comunicacionId! },
    data: {
      estado,
      errorDetalle,
      enviadaAt: estado === "ENVIADA" ? new Date() : null,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COMUNICACIONES",
    accion: "UPDATE_STATUS",
    entidadTipo: "COMUNICACION",
    entidadId: comunicacionId!,
    descripcion: `Estado de comunicacion actualizado a ${estado}.`,
    detalle: {
      estadoAnterior: comunicacion!.estado,
      estadoNuevo: estado,
      abonadoId: comunicacion!.abonadoId,
    },
  });

  revalidateCorePaths();
  revalidatePath(`/abonados/${comunicacion!.abonadoId}`);
  revalidatePath(`/oficina-virtual/${comunicacion!.abonadoId}`);
  redirectWithMessage(redirectPath, "ok", `Comunicacion actualizada a ${estado}.`);
}

export async function createPlantillaComunicacionAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const codigo = getRequiredString(formData, "codigo").toUpperCase();
  const nombre = getRequiredString(formData, "nombre");
  const canal = getRequiredString(formData, "canal");
  const tipo = getRequiredString(formData, "tipo");
  const asuntoTemplate = getRequiredString(formData, "asuntoTemplate");
  const mensajeTemplate = getRequiredString(formData, "mensajeTemplate");
  const prioridadDefault = getOptionalString(formData, "prioridadDefault") ?? "NORMAL";
  const visibleOficinaVirtualDefault = getBoolean(formData, "visibleOficinaVirtualDefault");
  const requiereSeguimientoDefault = getBoolean(formData, "requiereSeguimientoDefault");
  const observaciones = getOptionalString(formData, "observaciones");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/comunicaciones";

  if (!codigo || !nombre || !canal || !tipo || !asuntoTemplate || !mensajeTemplate) {
    redirectWithMessage(redirectPath, "error", "Completa codigo, nombre, canal, tipo, asunto y mensaje plantilla.");
  }

  if (!COMMUNICATION_CHANNELS.includes(canal as (typeof COMMUNICATION_CHANNELS)[number])) {
    redirectWithMessage(redirectPath, "error", "El canal de la plantilla no es valido.");
  }

  if (!COMMUNICATION_TYPES.includes(tipo as (typeof COMMUNICATION_TYPES)[number])) {
    redirectWithMessage(redirectPath, "error", "El tipo de plantilla no es valido.");
  }

  if (!COMMUNICATION_PRIORITIES.includes(prioridadDefault as (typeof COMMUNICATION_PRIORITIES)[number])) {
    redirectWithMessage(redirectPath, "error", "La prioridad por defecto no es valida.");
  }

  const duplicate = await prisma.plantillaComunicacion.findUnique({
    where: { codigo },
    select: { id: true },
  });

  if (duplicate) {
    redirectWithMessage(redirectPath, "error", "Ya existe una plantilla con ese codigo.");
  }

  const plantilla = await prisma.plantillaComunicacion.create({
    data: {
      codigo,
      nombre,
      canal,
      tipo,
      asuntoTemplate,
      mensajeTemplate,
      prioridadDefault,
      visibleOficinaVirtualDefault,
      requiereSeguimientoDefault,
      observaciones,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COMUNICACIONES",
    accion: "CREATE_TEMPLATE",
    entidadTipo: "PLANTILLA_COMUNICACION",
    entidadId: plantilla.id,
    descripcion: `Plantilla de comunicacion ${codigo} creada.`,
    detalle: {
      canal,
      tipo,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(redirectPath, "ok", "Plantilla de comunicacion creada correctamente.");
}

export async function updatePlantillaComunicacionAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const plantillaId = getOptionalInt(formData, "plantillaId");
  const codigo = getRequiredString(formData, "codigo").toUpperCase();
  const nombre = getRequiredString(formData, "nombre");
  const canal = getRequiredString(formData, "canal");
  const tipo = getRequiredString(formData, "tipo");
  const asuntoTemplate = getRequiredString(formData, "asuntoTemplate");
  const mensajeTemplate = getRequiredString(formData, "mensajeTemplate");
  const prioridadDefault = getOptionalString(formData, "prioridadDefault") ?? "NORMAL";
  const visibleOficinaVirtualDefault = getBoolean(formData, "visibleOficinaVirtualDefault");
  const requiereSeguimientoDefault = getBoolean(formData, "requiereSeguimientoDefault");
  const activa = getBoolean(formData, "activa");
  const observaciones = getOptionalString(formData, "observaciones");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/comunicaciones";

  if (!plantillaId || !codigo || !nombre || !canal || !tipo || !asuntoTemplate || !mensajeTemplate) {
    redirectWithMessage(redirectPath, "error", "Completa los datos obligatorios de la plantilla.");
  }

  if (!COMMUNICATION_CHANNELS.includes(canal as (typeof COMMUNICATION_CHANNELS)[number])) {
    redirectWithMessage(redirectPath, "error", "El canal de la plantilla no es valido.");
  }

  if (!COMMUNICATION_TYPES.includes(tipo as (typeof COMMUNICATION_TYPES)[number])) {
    redirectWithMessage(redirectPath, "error", "El tipo de plantilla no es valido.");
  }

  if (!COMMUNICATION_PRIORITIES.includes(prioridadDefault as (typeof COMMUNICATION_PRIORITIES)[number])) {
    redirectWithMessage(redirectPath, "error", "La prioridad por defecto no es valida.");
  }

  const duplicate = await prisma.plantillaComunicacion.findFirst({
    where: {
      codigo,
      id: { not: plantillaId! },
    },
    select: { id: true },
  });

  if (duplicate) {
    redirectWithMessage(redirectPath, "error", "Ya existe otra plantilla con ese codigo.");
  }

  await prisma.plantillaComunicacion.update({
    where: { id: plantillaId! },
    data: {
      codigo,
      nombre,
      canal,
      tipo,
      asuntoTemplate,
      mensajeTemplate,
      prioridadDefault,
      visibleOficinaVirtualDefault,
      requiereSeguimientoDefault,
      activa,
      observaciones,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "COMUNICACIONES",
    accion: "UPDATE_TEMPLATE",
    entidadTipo: "PLANTILLA_COMUNICACION",
    entidadId: plantillaId!,
    descripcion: `Plantilla de comunicacion ${codigo} actualizada.`,
    detalle: {
      canal,
      tipo,
      activa,
    },
  });

  revalidateCorePaths();
  redirectWithMessage(redirectPath, "ok", "Plantilla de comunicacion actualizada correctamente.");
}

export async function createPortalPublicationAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const titulo = getRequiredString(formData, "titulo");
  const resumen = getOptionalString(formData, "resumen");
  const contenido = getRequiredString(formData, "contenido");
  const categoria = getOptionalString(formData, "categoria") ?? "GENERAL";
  const prioridad = getOptionalString(formData, "prioridad") ?? "NORMAL";
  const estado = getOptionalString(formData, "estado") ?? "PUBLICADA";
  const visibleDesde = getOptionalDate(formData, "visibleDesde");
  const visibleHasta = getOptionalDate(formData, "visibleHasta");
  const destacado = getBoolean(formData, "destacado");
  const requiereConfirmacion = getBoolean(formData, "requiereConfirmacion");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/portal";

  if (!titulo || !contenido) {
    redirectWithMessage(redirectPath, "error", "Completa titulo y contenido de la publicacion.");
  }

  if (!PORTAL_PUBLICATION_CATEGORIES.includes(categoria as (typeof PORTAL_PUBLICATION_CATEGORIES)[number])) {
    redirectWithMessage(redirectPath, "error", "La categoria de la publicacion no es valida.");
  }

  if (!PORTAL_PUBLICATION_STATES.includes(estado as (typeof PORTAL_PUBLICATION_STATES)[number])) {
    redirectWithMessage(redirectPath, "error", "El estado de la publicacion no es valido.");
  }

  if (visibleDesde && visibleHasta && visibleHasta < visibleDesde) {
    redirectWithMessage(redirectPath, "error", "La vigencia hasta no puede ser anterior a la fecha desde.");
  }

  if (prioridad && !COMMUNICATION_PRIORITIES.includes(prioridad as (typeof COMMUNICATION_PRIORITIES)[number])) {
    redirectWithMessage(redirectPath, "error", "La prioridad de la publicacion no es valida.");
  }

  if (abonadoId) {
    const abonado = await prisma.abonado.findUnique({
      where: { id: abonadoId },
      select: { id: true },
    });

    if (!abonado) {
      redirectWithMessage(redirectPath, "error", "El abonado seleccionado ya no existe.");
    }
  }

  const publicacion = await prisma.publicacionPortal.create({
    data: {
      abonadoId,
      usuarioId: actor.id,
      titulo,
      resumen,
      contenido,
      categoria,
      prioridad,
      estado,
      visibleDesde,
      visibleHasta,
      destacado,
      requiereConfirmacion,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PORTAL",
    accion: "CREATE_PUBLICATION",
    entidadTipo: "PUBLICACION_PORTAL",
    entidadId: publicacion.id,
    descripcion: `Publicacion de portal creada: ${titulo}.`,
    detalle: {
      abonadoId,
      categoria,
      estado,
      destacado,
    },
  });

  revalidateCorePaths();
  if (abonadoId) {
    revalidatePath(`/oficina-virtual/${abonadoId}`);
    revalidatePath(`/abonados/${abonadoId}`);
  }
  redirectWithMessage(redirectPath, "ok", "Publicacion de portal creada correctamente.");
}

export async function updatePortalPublicationAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const publicacionId = getOptionalInt(formData, "publicacionId");
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const titulo = getRequiredString(formData, "titulo");
  const resumen = getOptionalString(formData, "resumen");
  const contenido = getRequiredString(formData, "contenido");
  const categoria = getOptionalString(formData, "categoria") ?? "GENERAL";
  const prioridad = getOptionalString(formData, "prioridad") ?? "NORMAL";
  const estado = getOptionalString(formData, "estado") ?? "PUBLICADA";
  const visibleDesde = getOptionalDate(formData, "visibleDesde");
  const visibleHasta = getOptionalDate(formData, "visibleHasta");
  const destacado = getBoolean(formData, "destacado");
  const requiereConfirmacion = getBoolean(formData, "requiereConfirmacion");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/portal";

  if (!publicacionId || !titulo || !contenido) {
    redirectWithMessage(redirectPath, "error", "Completa los datos obligatorios de la publicacion.");
  }

  if (!PORTAL_PUBLICATION_CATEGORIES.includes(categoria as (typeof PORTAL_PUBLICATION_CATEGORIES)[number])) {
    redirectWithMessage(redirectPath, "error", "La categoria de la publicacion no es valida.");
  }

  if (!PORTAL_PUBLICATION_STATES.includes(estado as (typeof PORTAL_PUBLICATION_STATES)[number])) {
    redirectWithMessage(redirectPath, "error", "El estado de la publicacion no es valido.");
  }

  if (prioridad && !COMMUNICATION_PRIORITIES.includes(prioridad as (typeof COMMUNICATION_PRIORITIES)[number])) {
    redirectWithMessage(redirectPath, "error", "La prioridad de la publicacion no es valida.");
  }

  if (visibleDesde && visibleHasta && visibleHasta < visibleDesde) {
    redirectWithMessage(redirectPath, "error", "La vigencia hasta no puede ser anterior a la fecha desde.");
  }

  const current = await prisma.publicacionPortal.findUnique({
    where: { id: publicacionId! },
    select: { id: true, abonadoId: true },
  });

  if (!current) {
    redirectWithMessage(redirectPath, "error", "Publicacion no encontrada.");
  }

  if (abonadoId) {
    const abonado = await prisma.abonado.findUnique({
      where: { id: abonadoId },
      select: { id: true },
    });

    if (!abonado) {
      redirectWithMessage(redirectPath, "error", "El abonado seleccionado ya no existe.");
    }
  }

  await prisma.publicacionPortal.update({
    where: { id: publicacionId! },
    data: {
      abonadoId,
      titulo,
      resumen,
      contenido,
      categoria,
      prioridad,
      estado,
      visibleDesde,
      visibleHasta,
      destacado,
      requiereConfirmacion,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PORTAL",
    accion: "UPDATE_PUBLICATION",
    entidadTipo: "PUBLICACION_PORTAL",
    entidadId: publicacionId!,
    descripcion: `Publicacion de portal actualizada: ${titulo}.`,
    detalle: {
      abonadoId,
      categoria,
      estado,
      destacado,
    },
  });

  revalidateCorePaths();
  if (current!.abonadoId) {
    revalidatePath(`/oficina-virtual/${current!.abonadoId}`);
    revalidatePath(`/abonados/${current!.abonadoId}`);
  }
  if (abonadoId) {
    revalidatePath(`/oficina-virtual/${abonadoId}`);
    revalidatePath(`/abonados/${abonadoId}`);
  }
  redirectWithMessage(redirectPath, "ok", "Publicacion de portal actualizada correctamente.");
}

export async function updatePortalAccessAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const portalActivo = getBoolean(formData, "portalActivo");
  const nuevaPassword = getOptionalString(formData, "nuevaPassword");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/portal";

  if (!abonadoId) {
    redirectWithMessage(redirectPath, "error", "Selecciona un abonado para configurar acceso al portal.");
  }

  const abonado = await prisma.abonado.findUnique({
    where: { id: abonadoId! },
    select: {
      id: true,
      numeroAbonado: true,
      portalPasswordHash: true,
    },
  });

  if (!abonado) {
    return redirectWithMessage(redirectPath, "error", "Abonado no encontrado para acceso de portal.");
  }

  const currentAbonado = abonado;

  if (portalActivo && !nuevaPassword && !currentAbonado.portalPasswordHash) {
    redirectWithMessage(redirectPath, "error", "Para habilitar el portal por primera vez debes definir una contrasena.");
  }

  if (nuevaPassword && nuevaPassword.length < 8) {
    redirectWithMessage(redirectPath, "error", "La contrasena del portal debe tener al menos 8 caracteres.");
  }

  await prisma.abonado.update({
    where: { id: abonadoId! },
    data: {
      portalActivo,
      portalPasswordHash: nuevaPassword ? hashPassword(nuevaPassword) : undefined,
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PORTAL",
    accion: "UPDATE_PORTAL_ACCESS",
    entidadTipo: "ABONADO",
    entidadId: abonadoId!,
    descripcion: `Acceso de portal actualizado para ${currentAbonado.numeroAbonado}.`,
    detalle: {
      portalActivo,
      passwordReseteada: Boolean(nuevaPassword),
    },
  });

  revalidateCorePaths();
  redirectWithMessage(redirectPath, "ok", "Acceso al portal actualizado correctamente.");
}

export async function createPortalInteractionAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const publicacionId = getOptionalInt(formData, "publicacionId");
  const comunicacionId = getOptionalInt(formData, "comunicacionId");
  const tipo = getRequiredString(formData, "tipo");
  const observaciones = getOptionalString(formData, "observaciones");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/portal";

  if (!abonadoId || (!publicacionId && !comunicacionId) || !tipo) {
    redirectWithMessage(redirectPath, "error", "No se pudo registrar la interaccion del portal.");
  }

  if (!PORTAL_INTERACTION_TYPES.includes(tipo as (typeof PORTAL_INTERACTION_TYPES)[number])) {
    redirectWithMessage(redirectPath, "error", "El tipo de interaccion del portal no es valido.");
  }

  const abonado = await prisma.abonado.findUnique({
    where: { id: abonadoId! },
    select: { id: true },
  });

  if (!abonado) {
    redirectWithMessage(redirectPath, "error", "Abonado no encontrado para registrar la interaccion.");
  }

  if (publicacionId) {
    const publicacion = await prisma.publicacionPortal.findUnique({
      where: { id: publicacionId },
      select: { id: true, abonadoId: true, requiereConfirmacion: true },
    });

    if (!publicacion) {
      redirectWithMessage(redirectPath, "error", "La publicacion seleccionada ya no existe.");
    }

    if (publicacion!.abonadoId && publicacion!.abonadoId !== abonadoId!) {
      redirectWithMessage(redirectPath, "error", "La publicacion no corresponde al abonado indicado.");
    }

    if (tipo === "CONFIRMACION" && !publicacion!.requiereConfirmacion) {
      redirectWithMessage(redirectPath, "error", "La publicacion no requiere confirmacion.");
    }
  }

  if (comunicacionId) {
    const comunicacion = await prisma.comunicacionAbonado.findUnique({
      where: { id: comunicacionId },
      select: { id: true, abonadoId: true, visibleOficinaVirtual: true, requiereSeguimiento: true },
    });

    if (!comunicacion) {
      redirectWithMessage(redirectPath, "error", "La comunicacion seleccionada ya no existe.");
    }

    if (comunicacion!.abonadoId !== abonadoId!) {
      redirectWithMessage(redirectPath, "error", "La comunicacion no corresponde al abonado indicado.");
    }

    if (!comunicacion!.visibleOficinaVirtual) {
      redirectWithMessage(redirectPath, "error", "La comunicacion no esta marcada como visible en oficina virtual.");
    }

    if (tipo === "CONFIRMACION" && !comunicacion!.requiereSeguimiento) {
      redirectWithMessage(redirectPath, "error", "La comunicacion no requiere confirmacion.");
    }
  }

  const existing = await prisma.portalInteraccion.findFirst({
    where: {
      abonadoId: abonadoId!,
      publicacionId: publicacionId ?? null,
      comunicacionId: comunicacionId ?? null,
      tipo,
    },
    select: { id: true },
    orderBy: { id: "desc" },
  });

  const timestamp = new Date();
  const interaccion = existing
    ? await prisma.portalInteraccion.update({
        where: { id: existing.id },
        data: {
          observaciones,
          leidoAt: tipo === "LECTURA" ? timestamp : undefined,
          confirmadoAt: tipo === "CONFIRMACION" ? timestamp : undefined,
        },
      })
    : await prisma.portalInteraccion.create({
        data: {
          abonadoId: abonadoId!,
          publicacionId,
          comunicacionId,
          tipo,
          observaciones,
          leidoAt: tipo === "LECTURA" ? timestamp : null,
          confirmadoAt: tipo === "CONFIRMACION" ? timestamp : null,
        },
      });

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PORTAL",
    accion: tipo === "LECTURA" ? "REGISTER_READING" : "REGISTER_CONFIRMATION",
    entidadTipo: "PORTAL_INTERACCION",
    entidadId: interaccion.id,
    descripcion:
      tipo === "LECTURA"
        ? "Lectura registrada sobre contenido de oficina virtual."
        : "Confirmacion registrada sobre contenido de oficina virtual.",
    detalle: {
      abonadoId,
      publicacionId,
      comunicacionId,
      tipo,
    },
  });

  revalidateCorePaths();
  revalidatePath(`/oficina-virtual/${abonadoId!}`);
  revalidatePath(`/abonados/${abonadoId!}`);
  redirectWithMessage(
    redirectPath,
    "ok",
    tipo === "LECTURA" ? "Lectura registrada correctamente." : "Confirmacion registrada correctamente.",
  );
}

export async function createPortalClientInteractionAction(formData: FormData) {
  const abonado = await requirePortalSession();
  const publicacionId = getOptionalInt(formData, "publicacionId");
  const comunicacionId = getOptionalInt(formData, "comunicacionId");
  const tipo = getRequiredString(formData, "tipo");

  if ((!publicacionId && !comunicacionId) || !tipo) {
    redirectWithMessage("/portal-cliente", "error", "No se pudo registrar la accion del portal.");
  }

  if (!PORTAL_INTERACTION_TYPES.includes(tipo as (typeof PORTAL_INTERACTION_TYPES)[number])) {
    redirectWithMessage("/portal-cliente", "error", "El tipo de interaccion no es valido.");
  }

  if (publicacionId) {
    const publicacion = await prisma.publicacionPortal.findUnique({
      where: { id: publicacionId },
      select: { id: true, abonadoId: true, requiereConfirmacion: true },
    });

    if (!publicacion) {
      redirectWithMessage("/portal-cliente", "error", "La publicacion seleccionada ya no existe.");
    }

    if (publicacion!.abonadoId && publicacion!.abonadoId !== abonado.id) {
      redirectWithMessage("/portal-cliente", "error", "La publicacion no corresponde al abonado logueado.");
    }

    if (tipo === "CONFIRMACION" && !publicacion!.requiereConfirmacion) {
      redirectWithMessage("/portal-cliente", "error", "La publicacion no requiere confirmacion.");
    }
  }

  if (comunicacionId) {
    const comunicacion = await prisma.comunicacionAbonado.findUnique({
      where: { id: comunicacionId },
      select: { id: true, abonadoId: true, visibleOficinaVirtual: true, requiereSeguimiento: true },
    });

    if (!comunicacion) {
      redirectWithMessage("/portal-cliente", "error", "La comunicacion seleccionada ya no existe.");
    }

    if (comunicacion!.abonadoId !== abonado.id || !comunicacion!.visibleOficinaVirtual) {
      redirectWithMessage("/portal-cliente", "error", "La comunicacion no corresponde al abonado logueado.");
    }

    if (tipo === "CONFIRMACION" && !comunicacion!.requiereSeguimiento) {
      redirectWithMessage("/portal-cliente", "error", "La comunicacion no requiere confirmacion.");
    }
  }

  const existing = await prisma.portalInteraccion.findFirst({
    where: {
      abonadoId: abonado.id,
      publicacionId: publicacionId ?? null,
      comunicacionId: comunicacionId ?? null,
      tipo,
    },
    select: { id: true },
    orderBy: { id: "desc" },
  });

  const timestamp = new Date();
  if (existing) {
    await prisma.portalInteraccion.update({
      where: { id: existing.id },
      data: {
        leidoAt: tipo === "LECTURA" ? timestamp : undefined,
        confirmadoAt: tipo === "CONFIRMACION" ? timestamp : undefined,
      },
    });
  } else {
    await prisma.portalInteraccion.create({
      data: {
        abonadoId: abonado.id,
        publicacionId,
        comunicacionId,
        tipo,
        leidoAt: tipo === "LECTURA" ? timestamp : null,
        confirmadoAt: tipo === "CONFIRMACION" ? timestamp : null,
      },
    });
  }

  await logAuditEvent({
    modulo: "PORTAL",
    accion: tipo === "LECTURA" ? "PORTAL_CLIENT_READING" : "PORTAL_CLIENT_CONFIRMATION",
    entidadTipo: "ABONADO",
    entidadId: abonado.id,
    descripcion:
      tipo === "LECTURA"
        ? `Lectura registrada desde portal cliente para ${abonado.numeroAbonado}.`
        : `Confirmacion registrada desde portal cliente para ${abonado.numeroAbonado}.`,
    detalle: {
      publicacionId,
      comunicacionId,
      tipo,
    },
  });

  revalidateCorePaths();
  redirectWithMessage("/portal-cliente", "ok", tipo === "LECTURA" ? "Lectura registrada." : "Confirmacion registrada.");
}

export async function createPortalClientBulkInteractionAction(formData: FormData) {
  const abonado = await requirePortalSession();
  const scope = getRequiredString(formData, "scope");
  const tipo = getRequiredString(formData, "tipo");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/portal-cliente?tab=inbox";

  if (!["PUBLICACIONES", "COMUNICACIONES"].includes(scope)) {
    return redirectWithMessage(redirectPath, "error", "El alcance de la accion del portal no es valido.");
  }

  if (!PORTAL_INTERACTION_TYPES.includes(tipo as (typeof PORTAL_INTERACTION_TYPES)[number])) {
    return redirectWithMessage(redirectPath, "error", "El tipo de interaccion del portal no es valido.");
  }

  const timestamp = new Date();
  let processed = 0;

  if (scope === "PUBLICACIONES") {
    const publicaciones = await prisma.publicacionPortal.findMany({
      where: {
        estado: "PUBLICADA",
        OR: [{ abonadoId: null }, { abonadoId: abonado.id }],
        ...(tipo === "CONFIRMACION" ? { requiereConfirmacion: true } : {}),
      },
      select: {
        id: true,
      },
    });

    for (const publicacion of publicaciones) {
      const existing = await prisma.portalInteraccion.findFirst({
        where: {
          abonadoId: abonado.id,
          publicacionId: publicacion.id,
          comunicacionId: null,
          tipo,
        },
        select: { id: true },
        orderBy: { id: "desc" },
      });

      if (existing) {
        await prisma.portalInteraccion.update({
          where: { id: existing.id },
          data: {
            leidoAt: tipo === "LECTURA" ? timestamp : undefined,
            confirmadoAt: tipo === "CONFIRMACION" ? timestamp : undefined,
          },
        });
      } else {
        await prisma.portalInteraccion.create({
          data: {
            abonadoId: abonado.id,
            publicacionId: publicacion.id,
            tipo,
            leidoAt: tipo === "LECTURA" ? timestamp : null,
            confirmadoAt: tipo === "CONFIRMACION" ? timestamp : null,
          },
        });
      }

      processed += 1;
    }
  }

  if (scope === "COMUNICACIONES") {
    const comunicaciones = await prisma.comunicacionAbonado.findMany({
      where: {
        abonadoId: abonado.id,
        visibleOficinaVirtual: true,
        estado: {
          in: ["REGISTRADA", "PROGRAMADA", "ENVIADA"],
        },
        ...(tipo === "CONFIRMACION" ? { requiereSeguimiento: true } : {}),
      },
      select: {
        id: true,
      },
    });

    for (const comunicacion of comunicaciones) {
      const existing = await prisma.portalInteraccion.findFirst({
        where: {
          abonadoId: abonado.id,
          publicacionId: null,
          comunicacionId: comunicacion.id,
          tipo,
        },
        select: { id: true },
        orderBy: { id: "desc" },
      });

      if (existing) {
        await prisma.portalInteraccion.update({
          where: { id: existing.id },
          data: {
            leidoAt: tipo === "LECTURA" ? timestamp : undefined,
            confirmadoAt: tipo === "CONFIRMACION" ? timestamp : undefined,
          },
        });
      } else {
        await prisma.portalInteraccion.create({
          data: {
            abonadoId: abonado.id,
            comunicacionId: comunicacion.id,
            tipo,
            leidoAt: tipo === "LECTURA" ? timestamp : null,
            confirmadoAt: tipo === "CONFIRMACION" ? timestamp : null,
          },
        });
      }

      processed += 1;
    }
  }

  await logAuditEvent({
    modulo: "PORTAL",
    accion: tipo === "LECTURA" ? "PORTAL_CLIENT_BULK_READING" : "PORTAL_CLIENT_BULK_CONFIRMATION",
    entidadTipo: "ABONADO",
    entidadId: abonado.id,
    descripcion:
      tipo === "LECTURA"
        ? `Lecturas masivas registradas desde portal cliente para ${abonado.numeroAbonado}.`
        : `Confirmaciones masivas registradas desde portal cliente para ${abonado.numeroAbonado}.`,
    detalle: {
      scope,
      tipo,
      processed,
    },
  });

  revalidateCorePaths();
  revalidatePath(`/oficina-virtual/${abonado.id}`);
  redirectWithMessage(
    redirectPath,
    "ok",
    processed > 0
      ? tipo === "LECTURA"
        ? `Se actualizaron ${processed} elemento/s como leidos.`
        : `Se confirmaron ${processed} elemento/s del portal.`
      : "No habia elementos pendientes para actualizar.",
  );
}

export async function createPortalBulkInteractionAction(formData: FormData) {
  const actor = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const abonadoId = getOptionalInt(formData, "abonadoId");
  const scope = getRequiredString(formData, "scope");
  const tipo = getRequiredString(formData, "tipo");
  const redirectPath = getOptionalString(formData, "redirectPath") ?? "/portal";

  if (!abonadoId || !scope || !tipo) {
    redirectWithMessage(redirectPath, "error", "No se pudo ejecutar la accion masiva del portal.");
  }

  if (!PORTAL_INTERACTION_TYPES.includes(tipo as (typeof PORTAL_INTERACTION_TYPES)[number])) {
    redirectWithMessage(redirectPath, "error", "El tipo de interaccion masiva no es valido.");
  }

  const abonado = await prisma.abonado.findUnique({
    where: { id: abonadoId! },
    select: { id: true },
  });

  if (!abonado) {
    redirectWithMessage(redirectPath, "error", "Abonado no encontrado para la accion masiva.");
  }

  const now = new Date();
  let affected = 0;

  if (scope === "PUBLICACIONES") {
    const publicaciones = await prisma.publicacionPortal.findMany({
      where: {
        estado: "PUBLICADA",
        OR: [{ abonadoId: null }, { abonadoId: abonadoId! }],
        ...(tipo === "CONFIRMACION" ? { requiereConfirmacion: true } : {}),
      },
      select: { id: true },
    });

    for (const publicacion of publicaciones) {
      const existing = await prisma.portalInteraccion.findFirst({
        where: {
          abonadoId: abonadoId!,
          publicacionId: publicacion.id,
          tipo,
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.portalInteraccion.update({
          where: { id: existing.id },
          data: {
            leidoAt: tipo === "LECTURA" ? now : undefined,
            confirmadoAt: tipo === "CONFIRMACION" ? now : undefined,
          },
        });
      } else {
        await prisma.portalInteraccion.create({
          data: {
            abonadoId: abonadoId!,
            publicacionId: publicacion.id,
            tipo,
            leidoAt: tipo === "LECTURA" ? now : null,
            confirmadoAt: tipo === "CONFIRMACION" ? now : null,
          },
        });
      }

      affected += 1;
    }
  } else if (scope === "COMUNICACIONES") {
    const comunicaciones = await prisma.comunicacionAbonado.findMany({
      where: {
        abonadoId: abonadoId!,
        visibleOficinaVirtual: true,
        estado: { in: ["REGISTRADA", "PROGRAMADA", "ENVIADA"] },
        ...(tipo === "CONFIRMACION" ? { requiereSeguimiento: true } : {}),
      },
      select: { id: true },
    });

    for (const comunicacion of comunicaciones) {
      const existing = await prisma.portalInteraccion.findFirst({
        where: {
          abonadoId: abonadoId!,
          comunicacionId: comunicacion.id,
          tipo,
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.portalInteraccion.update({
          where: { id: existing.id },
          data: {
            leidoAt: tipo === "LECTURA" ? now : undefined,
            confirmadoAt: tipo === "CONFIRMACION" ? now : undefined,
          },
        });
      } else {
        await prisma.portalInteraccion.create({
          data: {
            abonadoId: abonadoId!,
            comunicacionId: comunicacion.id,
            tipo,
            leidoAt: tipo === "LECTURA" ? now : null,
            confirmadoAt: tipo === "CONFIRMACION" ? now : null,
          },
        });
      }

      affected += 1;
    }
  } else {
    redirectWithMessage(redirectPath, "error", "El alcance de la accion masiva no es valido.");
  }

  await logAuditEvent({
    actorId: actor.id,
    modulo: "PORTAL",
    accion: `BULK_${tipo}`,
    entidadTipo: "PORTAL_INTERACCION",
    descripcion: `Accion masiva ${tipo} sobre ${scope.toLowerCase()}.`,
    detalle: {
      abonadoId,
      scope,
      tipo,
      affected,
    },
  });

  revalidateCorePaths();
  revalidatePath(`/oficina-virtual/${abonadoId!}`);
  revalidatePath(`/abonados/${abonadoId!}`);
  redirectWithMessage(
    redirectPath,
    "ok",
    `${affected} elemento/s del portal actualizados con accion ${tipo.toLowerCase()}.`,
  );
}

export async function runAbonadosImportAction() {
  const actor = await requireRole(["ADMIN"]);
  const archivo = process.env.ABONADOS_TEMPLATE_PATH ?? DEFAULT_TEMPLATE_PATH;
  const importacion = await prisma.importacion.create({
    data: {
      tipo: "ABONADOS_ODS",
      archivo,
      estado: "EN_PROCESO",
    },
  });

  try {
    await fs.access(archivo);
    const XLSX = await import("xlsx");
    const workbook = XLSX.readFile(archivo, { cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, {
      defval: "",
    });

    let filasProcesadas = 0;
    let filasCreadas = 0;
    let filasOmitidas = 0;

    for (const row of rows) {
      const numeroAbonado = normalizeAbonadoNumber(String(row["NUMERO DE ABONADO"] ?? ""));
      const nombreRazonSocial = String(row["NOMBRE / RAZON SOCIAL"] ?? "").trim();
      const direccion = String(row["DIRECCION"] ?? "").trim();
      const telefono = String(row["TELEFONO"] ?? "").trim();

      if (!numeroAbonado && !nombreRazonSocial && !direccion && !telefono) {
        continue;
      }

      filasProcesadas += 1;

      if (!numeroAbonado || !nombreRazonSocial) {
        filasOmitidas += 1;
        continue;
      }

      const existing = await prisma.abonado.findUnique({
        where: { numeroAbonado },
        select: { id: true },
      });

      if (existing) {
        filasOmitidas += 1;
        continue;
      }

      const { nombre, apellido } = splitImportedName(nombreRazonSocial);

      await prisma.abonado.create({
        data: {
          numeroAbonado,
          nombre,
          apellido,
          telefono: telefono || null,
          domicilio: direccion || "Sin direccion",
          localidad: "Pendiente",
          condicionIva: "CONSUMIDOR_FINAL",
          estado: "ACTIVO",
        },
      });

      filasCreadas += 1;
    }

    await prisma.importacion.update({
      where: { id: importacion.id },
      data: {
        estado: "COMPLETADA",
        filasProcesadas,
        filasCreadas,
        filasOmitidas,
        resumen: `Importacion completada desde ${archivo}`,
      },
    });

    await logAuditEvent({
      actorId: actor.id,
      modulo: "IMPORTACIONES",
      accion: "RUN_ABONADOS_IMPORT",
      entidadTipo: "IMPORTACION",
      entidadId: importacion.id,
      descripcion: "Importacion masiva de abonados completada.",
      detalle: {
        archivo,
        filasProcesadas,
        filasCreadas,
        filasOmitidas,
      },
    });

    revalidateCorePaths();
    redirectWithMessage("/importaciones", "ok", "Importacion de abonados completada.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";

    await prisma.importacion.update({
      where: { id: importacion.id },
      data: {
        estado: "ERROR",
        resumen: message,
      },
    });

    await logAuditEvent({
      actorId: actor.id,
      modulo: "IMPORTACIONES",
      accion: "RUN_ABONADOS_IMPORT_ERROR",
      entidadTipo: "IMPORTACION",
      entidadId: importacion.id,
      descripcion: "Importacion masiva de abonados con error.",
      detalle: {
        archivo,
        error: message,
      },
    });

    revalidateCorePaths();
    redirectWithMessage("/importaciones", "error", `La importacion fallo: ${message}`);
  }
}
