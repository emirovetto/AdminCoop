export const IVA_CONDITIONS = [
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTO",
  "EXENTO",
  "CONSUMIDOR_FINAL",
  "SUJETO_NO_CATEGORIZADO",
  "PROVEEDOR_EXTERIOR",
  "CLIENTE_EXTERIOR",
  "IVA_LIBERADO_LEY_19640",
  "MONOTRIBUTO_SOCIAL",
  "PEQUENO_CONTRIBUYENTE_EVENTUAL",
  "PEQUENO_CONTRIBUYENTE_EVENTUAL_SOCIAL",
] as const;

export const SERVICE_CATEGORIES = [
  "INTERNET",
  "TV",
  "AGUA_POTABLE",
  "TELEFONIA",
  "IPTV",
  "NICHOS",
  "OTROS",
] as const;

export const SERVICE_PERIODICITIES = ["MENSUAL", "BIMESTRAL", "TRIMESTRAL", "UNICO"] as const;

export const TICKET_PRIORITIES = ["BAJA", "MEDIA", "ALTA"] as const;

export const TICKET_STATES = ["ABIERTO", "EN_PROCESO", "RESUELTO"] as const;

export const INVOICE_STATES = ["PENDIENTE", "PAGADA", "VENCIDA"] as const;

export const WORK_ORDER_TYPES = [
  "INSTALACION",
  "VISITA_TECNICA",
  "CORTE",
  "RECONEXION",
  "BAJA",
  "MANTENIMIENTO",
] as const;

export const WORK_ORDER_STATES = [
  "PENDIENTE",
  "ASIGNADA",
  "EN_CURSO",
  "RESUELTA",
  "CANCELADA",
] as const;

export const COLLECTION_CHANNELS = ["TELEFONO", "WHATSAPP", "EMAIL", "PRESENCIAL", "OTRO"] as const;

export const COLLECTION_OUTCOMES = [
  "SIN_RESPUESTA",
  "CONTACTADO",
  "PROMESA_DE_PAGO",
  "RECHAZO",
  "RECLAMO_ADMINISTRATIVO",
  "ACUERDO",
  "OTRO",
] as const;

export const COLLECTION_STATES = [
  "REGISTRADA",
  "PROMESA_VIGENTE",
  "CUMPLIDA",
  "INCUMPLIDA",
  "CERRADA",
] as const;

export const PAYMENT_PLAN_STATES = ["VIGENTE", "CUMPLIDO", "INCUMPLIDO", "ANULADO"] as const;

export const PAYMENT_PLAN_INSTALLMENT_STATES = ["PENDIENTE", "CUMPLIDA", "INCUMPLIDA"] as const;

export const PAYMENT_METHODS = ["TRANSFERENCIA", "EFECTIVO", "TARJETA"] as const;

export const PAYMENT_GATEWAY_PROVIDERS = [
  "MERCADO_PAGO",
  "TODO_PAGO",
  "MODO",
  "DEBIN",
  "TRANSFERENCIA_BANCARIA",
  "CUSTOM",
] as const;

export const PAYMENT_GATEWAY_MODES = ["PRUEBA", "PRODUCCION"] as const;

export const EXTERNAL_PAYMENT_STATES = [
  "BORRADOR",
  "PENDIENTE",
  "EN_PROCESO",
  "ACREDITADO",
  "RECHAZADO",
  "EXPIRADO",
  "ANULADO",
] as const;

export const WEBHOOK_EVENT_STATES = ["RECIBIDO", "VALIDADO", "PROCESADO", "ERROR"] as const;

export const COMMUNICATION_CHANNELS = ["EMAIL", "WHATSAPP", "OFICINA_VIRTUAL", "INTERNA"] as const;

export const COMMUNICATION_TYPES = [
  "FACTURACION",
  "COBRANZA",
  "SOPORTE",
  "ORDEN_TRABAJO",
  "AVISO_GENERAL",
  "PROMOCION",
  "OTRO",
] as const;

export const COMMUNICATION_STATES = ["REGISTRADA", "PROGRAMADA", "ENVIADA", "ERROR", "ARCHIVADA"] as const;

export const COMMUNICATION_PRIORITIES = ["BAJA", "NORMAL", "ALTA"] as const;

export const PORTAL_PUBLICATION_CATEGORIES = [
  "GENERAL",
  "FACTURACION",
  "COBRANZA",
  "SOPORTE",
  "SERVICIOS",
  "PROMOCION",
] as const;

export const PORTAL_PUBLICATION_STATES = ["BORRADOR", "PUBLICADA", "ARCHIVADA"] as const;

export const PORTAL_INTERACTION_TYPES = ["LECTURA", "CONFIRMACION"] as const;

export const ARCA_ENVIRONMENTS = ["HOMOLOGACION", "PRODUCCION"] as const;

export const ARCA_INVOICE_TYPES = [
  { code: "001", label: "Factura A" },
  { code: "006", label: "Factura B" },
  { code: "011", label: "Factura C" },
  { code: "003", label: "Nota de credito A" },
  { code: "008", label: "Nota de credito B" },
  { code: "013", label: "Nota de credito C" },
  { code: "002", label: "Nota de debito A" },
  { code: "007", label: "Nota de debito B" },
  { code: "012", label: "Nota de debito C" },
] as const;

export const ARCA_CONCEPT_TYPES = [
  { code: "1", label: "Productos" },
  { code: "2", label: "Servicios" },
  { code: "3", label: "Productos y servicios" },
] as const;

export const ARCA_DOCUMENT_TYPES = [
  { code: "80", label: "CUIT" },
  { code: "86", label: "CUIL" },
  { code: "96", label: "DNI" },
  { code: "87", label: "CDI" },
  { code: "89", label: "LE" },
  { code: "90", label: "LC" },
  { code: "94", label: "Pasaporte" },
  { code: "99", label: "Consumidor final" },
] as const;

export const ARCA_CURRENCIES = [
  { code: "PES", label: "Peso argentino" },
  { code: "DOL", label: "Dolar estadounidense" },
] as const;

export const ARCA_RESULT_STATES = ["NO_ENVIADA", "PENDIENTE", "AUTORIZADA", "RECHAZADA"] as const;

export const ARCA_WS_SERVICES = [{ code: "wsfe", label: "WSFEv1" }] as const;

export const DEFAULT_SERVICE_CATALOG = [
  {
    codigo: "INT-300",
    nombre: "Internet Fibra 300 MB",
    categoria: "INTERNET",
    precioBase: 28500,
    periodicidad: "MENSUAL",
    alicuotaIva: 21,
  },
  {
    codigo: "TV-DIGITAL",
    nombre: "TV Digital Plus",
    categoria: "TV",
    precioBase: 11900,
    periodicidad: "MENSUAL",
    alicuotaIva: 21,
  },
  {
    codigo: "AGUA-HOGAR",
    nombre: "Agua Potable Hogar",
    categoria: "AGUA_POTABLE",
    precioBase: 8400,
    periodicidad: "MENSUAL",
    alicuotaIva: 21,
  },
  {
    codigo: "TEL-FIJO",
    nombre: "Telefonia Basica",
    categoria: "TELEFONIA",
    precioBase: 7300,
    periodicidad: "MENSUAL",
    alicuotaIva: 21,
  },
  {
    codigo: "IPTV-FULL",
    nombre: "IPTV Full HD",
    categoria: "IPTV",
    precioBase: 9800,
    periodicidad: "MENSUAL",
    alicuotaIva: 21,
  },
  {
    codigo: "NICHO-MENSUAL",
    nombre: "Nicho Cementerio",
    categoria: "NICHOS",
    precioBase: 6200,
    periodicidad: "MENSUAL",
    alicuotaIva: 21,
  },
] as const;
