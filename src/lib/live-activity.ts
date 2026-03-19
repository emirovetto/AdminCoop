import { prisma } from "@/lib/prisma";

export const LIVE_CHANNELS = [
  "dashboard",
  "abonados",
  "facturacion",
  "cobranzas",
  "reclamos",
  "ordenes",
  "comunicaciones",
  "portal",
  "pasarelas",
  "compras",
  "alertas",
] as const;

export type LiveChannel = (typeof LIVE_CHANNELS)[number];

type LiveSnapshotSummary = {
  pagosPendientes: number;
  reclamosAbiertos: number;
  ordenesPendientes: number;
  promesasVigentes: number;
  webhooksConError: number;
};

export type LiveActivitySnapshot = {
  generatedAt: string;
  revision: string;
  channels: Record<LiveChannel, string | null>;
  summary: LiveSnapshotSummary;
};

function latestDate(...dates: Array<Date | null | undefined>) {
  const validDates = dates.filter((value): value is Date => value instanceof Date);
  if (validDates.length === 0) {
    return null;
  }

  return new Date(Math.max(...validDates.map((value) => value.getTime())));
}

function toRevisionValue(value: Date | null) {
  return value ? value.toISOString() : null;
}

export async function getLiveActivitySnapshot(): Promise<LiveActivitySnapshot> {
  const [
    latestAbonado,
    latestServicio,
    latestFactura,
    latestPago,
    latestMovimiento,
    latestGestion,
    latestAcuerdo,
    latestCuota,
    latestReclamo,
    latestOrden,
    latestComunicacion,
    latestPublicacionPortal,
    latestPortalInteraccion,
    latestPasarela,
    latestPagoExterno,
    latestWebhook,
    latestEjecucion,
    latestMaterial,
    latestCompra,
    pagosPendientes,
    reclamosAbiertos,
    ordenesPendientes,
    promesasVigentes,
    webhooksConError,
  ] = await Promise.all([
    prisma.abonado.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.servicio.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.factura.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.pago.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.cuentaCorriente.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.gestionCobranza.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.acuerdoPago.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.acuerdoPagoCuota.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.reclamo.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.ordenTrabajo.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.comunicacionAbonado.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.publicacionPortal.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.portalInteraccion.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.pasarelaPago.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.pagoExterno.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.webhookPasarelaEvento.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.ejecucionAutomatizacion.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.material.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.compra.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.pagoExterno.count({
      where: {
        estado: {
          in: ["BORRADOR", "PENDIENTE", "EN_PROCESO"],
        },
      },
    }),
    prisma.reclamo.count({
      where: {
        estado: {
          in: ["ABIERTO", "EN_PROCESO"],
        },
      },
    }),
    prisma.ordenTrabajo.count({
      where: {
        estado: {
          in: ["PENDIENTE", "ASIGNADA", "EN_CURSO"],
        },
      },
    }),
    prisma.gestionCobranza.count({
      where: {
        estado: "PROMESA_VIGENTE",
      },
    }),
    prisma.webhookPasarelaEvento.count({
      where: {
        estado: "ERROR",
      },
    }),
  ]);

  const channels: Record<LiveChannel, string | null> = {
    dashboard: toRevisionValue(
      latestDate(
        latestAbonado?.updatedAt,
        latestServicio?.updatedAt,
        latestFactura?.updatedAt,
        latestPago?.updatedAt,
        latestReclamo?.updatedAt,
        latestOrden?.updatedAt,
        latestComunicacion?.updatedAt,
        latestPublicacionPortal?.updatedAt,
        latestPortalInteraccion?.updatedAt,
        latestPagoExterno?.updatedAt,
        latestWebhook?.updatedAt,
        latestEjecucion?.updatedAt,
      ),
    ),
    abonados: toRevisionValue(latestDate(latestAbonado?.updatedAt, latestServicio?.updatedAt)),
    facturacion: toRevisionValue(
      latestDate(latestFactura?.updatedAt, latestPago?.updatedAt, latestMovimiento?.updatedAt),
    ),
    cobranzas: toRevisionValue(
      latestDate(
        latestGestion?.updatedAt,
        latestAcuerdo?.updatedAt,
        latestCuota?.updatedAt,
        latestPago?.updatedAt,
        latestFactura?.updatedAt,
      ),
    ),
    reclamos: toRevisionValue(latestReclamo?.updatedAt ?? null),
    ordenes: toRevisionValue(latestDate(latestOrden?.updatedAt, latestServicio?.updatedAt)),
    comunicaciones: toRevisionValue(latestComunicacion?.updatedAt ?? null),
    portal: toRevisionValue(
      latestDate(latestPublicacionPortal?.updatedAt, latestPortalInteraccion?.updatedAt, latestComunicacion?.updatedAt),
    ),
    pasarelas: toRevisionValue(
      latestDate(
        latestPasarela?.updatedAt,
        latestPagoExterno?.updatedAt,
        latestWebhook?.updatedAt,
        latestEjecucion?.updatedAt,
      ),
    ),
    compras: toRevisionValue(latestDate(latestCompra?.updatedAt, latestMaterial?.updatedAt)),
    alertas: toRevisionValue(
      latestDate(
        latestGestion?.updatedAt,
        latestReclamo?.updatedAt,
        latestOrden?.updatedAt,
        latestWebhook?.updatedAt,
        latestMaterial?.updatedAt,
      ),
    ),
  };

  return {
    generatedAt: new Date().toISOString(),
    revision: LIVE_CHANNELS.map((channel) => `${channel}:${channels[channel] ?? "-"}`).join("|"),
    channels,
    summary: {
      pagosPendientes,
      reclamosAbiertos,
      ordenesPendientes,
      promesasVigentes,
      webhooksConError,
    },
  };
}
