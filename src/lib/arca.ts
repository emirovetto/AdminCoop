type FacturaPrecheckInput = {
  subtotal: number;
  total: number;
  tipoComprobanteArca?: string | null;
  conceptoArca?: string | null;
  tipoDocumentoReceptor?: string | null;
  numeroDocumentoReceptor?: string | null;
  monedaCodigo?: string | null;
  puntoVentaArca?: string | null;
  detallesCount: number;
};

type ConfiguracionPrecheckInput = {
  arcaHabilitado?: boolean | null;
  cuit?: string | null;
  puntoVenta?: string | null;
  ambienteArca?: string | null;
  arcaWsService?: string | null;
  cuitRepresentadaArca?: string | null;
  aliasCertificadoArca?: string | null;
  certificadoRutaArca?: string | null;
  clavePrivadaRutaArca?: string | null;
};

export type ArcaPrecheck = {
  status: "LISTA" | "OBSERVADA" | "NO_APLICA";
  ready: boolean;
  issues: string[];
};

type FacturaPayloadInput = FacturaPrecheckInput & {
  fechaEmision?: Date | string | null;
  fechaVencimiento?: Date | string | null;
  totalIva?: number;
  detalles?: Array<{
    ivaAlicuota?: number | null;
    ivaImporte?: number | null;
    totalLinea?: number | null;
    descripcion?: string | null;
  }>;
};

function formatArcaDate(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function digitsOnly(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function mapIvaToAfipId(ivaAlicuota: number) {
  if (ivaAlicuota === 27) {
    return 6;
  }

  if (ivaAlicuota === 21) {
    return 5;
  }

  if (ivaAlicuota === 10.5) {
    return 4;
  }

  if (ivaAlicuota === 5) {
    return 8;
  }

  if (ivaAlicuota === 2.5) {
    return 9;
  }

  return 3;
}

export function getArcaServiceUrls(environment?: string | null) {
  if (environment === "PRODUCCION") {
    return {
      wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
      wsaaWsdl: "https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL",
      wsfev1: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
      wsfev1Wsdl: "https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL",
    };
  }

  return {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsaaWsdl: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL",
    wsfev1: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
    wsfev1Wsdl: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL",
  };
}

export function buildFacturaArcaPrecheck(
  factura: FacturaPrecheckInput,
  configuracion?: ConfiguracionPrecheckInput | null,
): ArcaPrecheck {
  if (!configuracion?.arcaHabilitado) {
    return {
      status: "NO_APLICA",
      ready: false,
      issues: ["ARCA esta deshabilitado en configuracion."],
    };
  }

  const issues: string[] = [];

  if (digitsOnly(configuracion.cuit).length !== 11) {
    issues.push("CUIT emisor incompleto o invalido.");
  }

  if (!configuracion.puntoVenta?.trim()) {
    issues.push("Punto de venta no configurado.");
  }

  if (!configuracion.aliasCertificadoArca?.trim()) {
    issues.push("Falta alias o referencia del certificado ARCA.");
  }

  if (!factura.tipoComprobanteArca?.trim()) {
    issues.push("Tipo de comprobante ARCA no definido.");
  }

  if (!factura.conceptoArca?.trim()) {
    issues.push("Concepto ARCA no definido.");
  }

  if (!factura.tipoDocumentoReceptor?.trim()) {
    issues.push("Tipo de documento del receptor no definido.");
  }

  if (!factura.numeroDocumentoReceptor?.trim()) {
    issues.push("Numero de documento del receptor vacio.");
  }

  if (!factura.monedaCodigo?.trim()) {
    issues.push("Moneda no configurada.");
  }

  if (!factura.puntoVentaArca?.trim()) {
    issues.push("El comprobante no tiene punto de venta asignado.");
  }

  if (factura.detallesCount === 0) {
    issues.push("El comprobante no tiene renglones facturables.");
  }

  if (factura.subtotal <= 0 || factura.total <= 0) {
    issues.push("Importes invalidos para emitir comprobante.");
  }

  return {
    status: issues.length === 0 ? "LISTA" : "OBSERVADA",
    ready: issues.length === 0,
    issues,
  };
}

export function buildArcaConnectionPrecheck(
  configuracion?: ConfiguracionPrecheckInput | null,
): ArcaPrecheck {
  if (!configuracion?.arcaHabilitado) {
    return {
      status: "NO_APLICA",
      ready: false,
      issues: ["ARCA esta deshabilitado en configuracion."],
    };
  }

  const issues: string[] = [];

  if (digitsOnly(configuracion.cuit).length !== 11) {
    issues.push("CUIT emisor invalido para autenticacion.");
  }

  if (digitsOnly(configuracion.cuitRepresentadaArca ?? configuracion.cuit).length !== 11) {
    issues.push("CUIT representada no configurada correctamente.");
  }

  if (!configuracion.ambienteArca?.trim()) {
    issues.push("Ambiente ARCA no definido.");
  }

  if (!configuracion.arcaWsService?.trim()) {
    issues.push("Servicio ARCA no definido.");
  }

  if (!configuracion.aliasCertificadoArca?.trim()) {
    issues.push("Falta alias o identificador del certificado.");
  }

  if (!configuracion.certificadoRutaArca?.trim()) {
    issues.push("Falta ruta del certificado.");
  }

  if (!configuracion.clavePrivadaRutaArca?.trim()) {
    issues.push("Falta ruta de la clave privada.");
  }

  return {
    status: issues.length === 0 ? "LISTA" : "OBSERVADA",
    ready: issues.length === 0,
    issues,
  };
}

export function buildWsaaLoginTicketRequestPreview(configuracion?: ConfiguracionPrecheckInput | null) {
  const service = configuracion?.arcaWsService ?? "wsfe";
  const now = new Date();
  const generationTime = new Date(now.getTime() - 60_000).toISOString();
  const expirationTime = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

export function buildWsfeRequestPreview(
  factura: FacturaPayloadInput,
  configuracion?: ConfiguracionPrecheckInput | null,
) {
  const urls = getArcaServiceUrls(configuracion?.ambienteArca);
  const cuit = Number(digitsOnly(configuracion?.cuitRepresentadaArca ?? configuracion?.cuit)) || 0;
  const ptoVta = Number(digitsOnly(factura.puntoVentaArca ?? configuracion?.puntoVenta)) || 0;
  const cbteTipo = Number(factura.tipoComprobanteArca ?? 0);
  const cbteNumero = 0;
  const docTipo = Number(factura.tipoDocumentoReceptor ?? 0);
  const docNro = Number(digitsOnly(factura.numeroDocumentoReceptor)) || 0;
  const ivaGroups = new Map<number, { BaseImp: number; Importe: number }>();

  for (const detalle of factura.detalles ?? []) {
    const alicuota = Number(detalle.ivaAlicuota ?? 0);
    const importe = Number(detalle.ivaImporte ?? 0);
    const totalLinea = Number(detalle.totalLinea ?? 0);
    const baseImp = Math.max(totalLinea - importe, 0);
    const id = mapIvaToAfipId(alicuota);
    const current = ivaGroups.get(id) ?? { BaseImp: 0, Importe: 0 };
    ivaGroups.set(id, {
      BaseImp: current.BaseImp + baseImp,
      Importe: current.Importe + importe,
    });
  }

  return {
    environment: configuracion?.ambienteArca ?? "HOMOLOGACION",
    endpoints: urls,
    auth: {
      Token: "<PENDIENTE_WSAA_TOKEN>",
      Sign: "<PENDIENTE_WSAA_SIGN>",
      Cuit: cuit,
    },
    request: {
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: ptoVta,
          CbteTipo: cbteTipo,
        },
        FeDetReq: {
          FECAEDetRequest: [
            {
              Concepto: Number(factura.conceptoArca ?? 0),
              DocTipo: docTipo,
              DocNro: docNro,
              CbteDesde: cbteNumero,
              CbteHasta: cbteNumero,
              CbteFch: formatArcaDate(factura.fechaEmision),
              FchServDesde: formatArcaDate(factura.fechaEmision),
              FchServHasta: formatArcaDate(factura.fechaEmision),
              FchVtoPago: formatArcaDate(factura.fechaVencimiento),
              ImpTotal: Number(factura.total.toFixed(2)),
              ImpTotConc: 0,
              ImpNeto: Number(factura.subtotal.toFixed(2)),
              ImpOpEx: 0,
              ImpIVA: Number((factura.totalIva ?? 0).toFixed(2)),
              ImpTrib: 0,
              MonId: factura.monedaCodigo ?? "PES",
              MonCotiz: 1,
              Iva: {
                AlicIva: Array.from(ivaGroups.entries()).map(([Id, values]) => ({
                  Id,
                  BaseImp: Number(values.BaseImp.toFixed(2)),
                  Importe: Number(values.Importe.toFixed(2)),
                })),
              },
            },
          ],
        },
      },
    },
  };
}
