type TemplateAbonadoInput = {
  numeroAbonado: string;
  nombre?: string | null;
  apellido?: string | null;
  razonSocial?: string | null;
  email?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  condicionIva?: string | null;
};

type TemplateMetricsInput = {
  deudaAbierta?: number;
  facturasAbiertas?: number;
  facturasVencidas?: number;
  serviciosActivos?: number;
  fecha?: Date;
};

function formatArgCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatArgDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getTitular(abonado: TemplateAbonadoInput) {
  return (
    abonado.razonSocial ||
    [abonado.nombre, abonado.apellido].filter(Boolean).join(" ") ||
    abonado.numeroAbonado
  );
}

export function buildCommunicationTemplateContext(
  abonado: TemplateAbonadoInput,
  metrics: TemplateMetricsInput = {},
) {
  const referenceDate = metrics.fecha ?? new Date();

  return {
    abonado_titular: getTitular(abonado),
    abonado_nombre: abonado.nombre ?? "",
    abonado_apellido: abonado.apellido ?? "",
    abonado_numero: abonado.numeroAbonado,
    abonado_email: abonado.email ?? "",
    abonado_telefono: abonado.telefono ?? "",
    abonado_domicilio: abonado.domicilio ?? "",
    abonado_localidad: abonado.localidad ?? "",
    abonado_provincia: abonado.provincia ?? "",
    abonado_condicion_iva: abonado.condicionIva ?? "",
    deuda_abierta: formatArgCurrency(metrics.deudaAbierta ?? 0),
    facturas_abiertas: String(metrics.facturasAbiertas ?? 0),
    facturas_vencidas: String(metrics.facturasVencidas ?? 0),
    servicios_activos: String(metrics.serviciosActivos ?? 0),
    fecha_hoy: formatArgDate(referenceDate),
  };
}

export function renderCommunicationTemplate(
  template: string,
  abonado: TemplateAbonadoInput,
  metrics: TemplateMetricsInput = {},
) {
  const context = buildCommunicationTemplateContext(abonado, metrics);

  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, rawKey: string) => {
    const key = rawKey.toLowerCase() as keyof typeof context;
    return context[key] ?? "";
  });
}
