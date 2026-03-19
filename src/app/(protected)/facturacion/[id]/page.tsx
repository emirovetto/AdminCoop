import Link from "next/link";
import { notFound } from "next/navigation";
import { createNotaAjusteAction } from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { PrintButton } from "@/components/shared/print-button";
import { StatusPill } from "@/components/shared/status-pill";
import { buildFacturaArcaPrecheck, buildWsfeRequestPreview } from "@/lib/arca";
import { requireRole } from "@/lib/auth";
import { ARCA_CONCEPT_TYPES, ARCA_DOCUMENT_TYPES, ARCA_INVOICE_TYPES } from "@/lib/domain";
import { getConfiguracionFacturacionData, getFacturaProfile } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime, formatDecimal, getDaysOverdue } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

function getStatusTone(status: string) {
  if (status === "PAGADA") {
    return "success";
  }

  if (status === "VENCIDA") {
    return "danger";
  }

  return "warning";
}

function getArcaLabel(
  collection: ReadonlyArray<{ code: string; label: string }>,
  code?: string | null,
) {
  return collection.find((item) => item.code === code)?.label ?? code ?? "-";
}

export default async function FacturaDetailPage({ params }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const { id } = await params;
  const facturaId = Number.parseInt(id, 10);

  if (Number.isNaN(facturaId)) {
    notFound();
  }

  const [factura, billingData] = await Promise.all([
    getFacturaProfile(facturaId),
    getConfiguracionFacturacionData(),
  ]);

  if (!factura) {
    notFound();
  }

  const titular =
    factura.abonado.razonSocial ||
    [factura.abonado.apellido, factura.abonado.nombre].filter(Boolean).join(" ") ||
    factura.abonado.numeroAbonado;
  const creditosAplicados = factura.movimientos.filter(
    (movimiento) => movimiento.tipo === "CREDITO" && !movimiento.anuladoAt,
  );
  const totalAplicado = creditosAplicados.reduce((sum, movimiento) => sum + Number(movimiento.importe), 0);
  const saldoPendiente = Math.max(Number(factura.total) - totalAplicado, 0);
  const diasMora = factura.estado === "VENCIDA" ? getDaysOverdue(factura.fechaVencimiento.toISOString()) : 0;
  const serviciosActivos = factura.abonado.servicios.length;
  const notasRows = factura.notasRelacionadas.map((nota) => [
    nota.numero,
    nota.tipoAjuste ?? "FACTURA",
    formatDate(nota.fechaEmision.toISOString()),
    formatCurrency(Number(nota.total)),
    <StatusPill key={`nota-${nota.id}`} tone={getStatusTone(nota.estado)}>
      {nota.estado}
    </StatusPill>,
    <Link className="toolbar-button" href={`/facturacion/${nota.id}`} key={`nota-link-${nota.id}`}>
      Ver nota
    </Link>,
  ]);
  const arcaPrecheck = buildFacturaArcaPrecheck(
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
    billingData.configuracion,
  );
  const wsfePreview = buildWsfeRequestPreview(
    {
      subtotal: Number(factura.subtotal),
      total: Number(factura.total),
      totalIva: Number(factura.totalIva),
      tipoComprobanteArca: factura.tipoComprobanteArca,
      conceptoArca: factura.conceptoArca,
      tipoDocumentoReceptor: factura.tipoDocumentoReceptor,
      numeroDocumentoReceptor: factura.numeroDocumentoReceptor,
      monedaCodigo: factura.monedaCodigo,
      puntoVentaArca: factura.puntoVentaArca,
      fechaEmision: factura.fechaEmision,
      fechaVencimiento: factura.fechaVencimiento,
      detallesCount: factura.detalles.length,
      detalles: factura.detalles.map((detalle) => ({
        ivaAlicuota: Number(detalle.ivaAlicuota),
        ivaImporte: Number(detalle.ivaImporte),
        totalLinea: Number(detalle.totalLinea),
        descripcion: detalle.descripcion,
      })),
    },
    billingData.configuracion,
  );

  const detalleRows = factura.detalles.map((detalle) => {
    const origen = detalle.reclamoMaterial
      ? `Reclamo #${detalle.reclamoMaterial.reclamo.id} / ${detalle.reclamoMaterial.material.nombre}`
      : detalle.servicio
        ? [
            detalle.servicio.tipo,
            detalle.servicio.plan,
            detalle.servicio.numeroContrato ? `Contrato ${detalle.servicio.numeroContrato}` : null,
          ]
            .filter(Boolean)
            .join(" / ")
        : "Cargo manual";

    return [
      detalle.descripcion,
      origen,
      formatDecimal(Number(detalle.cantidad)),
      formatCurrency(Number(detalle.precioUnitario)),
      `${formatDecimal(Number(detalle.ivaAlicuota))}%`,
      formatCurrency(Number(detalle.subtotal)),
      formatCurrency(Number(detalle.ivaImporte)),
      formatCurrency(Number(detalle.totalLinea)),
    ];
  });

  let saldoRestante = Number(factura.total);
  const pagosRows = creditosAplicados.map((movimiento) => {
    saldoRestante = Math.max(saldoRestante - Number(movimiento.importe), 0);

    return [
      formatDateTime(movimiento.fecha.toISOString()),
      movimiento.pago?.numeroRecibo
        ? `${movimiento.pago.numeroRecibo} / ${movimiento.descripcion}`
        : movimiento.descripcion,
      formatCurrency(Number(movimiento.importe)),
      formatCurrency(saldoRestante),
    ];
  });

  const movimientosRows = factura.movimientos.map((movimiento) => [
    formatDateTime(movimiento.fecha.toISOString()),
    movimiento.pago?.numeroRecibo ?? "-",
    movimiento.tipo,
    movimiento.descripcion,
    formatCurrency(Number(movimiento.importe)),
    formatCurrency(Number(movimiento.saldo)),
    movimiento.anuladoAt ? "ANULADO" : movimiento.pago?.estado ?? "VIGENTE",
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Ficha del comprobante</span>
            <h1>{factura.numero}</h1>
            <p>
              Comprobante emitido para {titular}. Esta vista concentra detalle facturado, pagos
              aplicados, vencimiento y trazabilidad dentro de la cuenta corriente del abonado.
            </p>
            <div className="hero__chips">
              <StatusPill tone={getStatusTone(factura.estado)}>{factura.estado}</StatusPill>
              <span className="hero-chip">{factura.abonado.numeroAbonado}</span>
              <span className="hero-chip">{factura.condicionIvaReceptor ?? factura.abonado.condicionIva}</span>
              <span className="hero-chip">{factura.detalles.length} conceptos</span>
            </div>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Total comprobante</span>
              <strong>{formatCurrency(Number(factura.total))}</strong>
              <p>Subtotal {formatCurrency(Number(factura.subtotal))} + IVA {formatCurrency(Number(factura.totalIva))}.</p>
            </article>
            <article className="metric-card">
              <span>Precheck ARCA</span>
              <strong>{arcaPrecheck.status}</strong>
              <p>
                {arcaPrecheck.ready
                  ? "Comprobante listo para circuito WSAA/WSFEv1."
                  : `${arcaPrecheck.issues.length} observaciones antes de emitir.`}
              </p>
            </article>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Resumen del comprobante</h2>
            <p>Datos del abonado, fiscalidad y acceso rapido al historial relacionado.</p>
          </div>
          <div className="toolbar__actions">
            <Link className="toolbar-button" href="/facturacion">
              Volver a facturacion
            </Link>
            <Link className="toolbar-button" href={`/abonados/${factura.abonado.id}`}>
              Ver ficha del abonado
            </Link>
            <Link
              className="toolbar-button"
              href={`/pasarelas?abonadoId=${factura.abonado.id}&facturaId=${factura.id}`}
            >
              Generar pago online
            </Link>
            <PrintButton label="Imprimir comprobante" />
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Titular</span>
            <div className="field__value">{titular}</div>
          </div>
          <div className="field field--readOnly">
            <span>Emision</span>
            <div className="field__value">{formatDate(factura.fechaEmision.toISOString())}</div>
          </div>
          <div className="field field--readOnly">
            <span>Vencimiento</span>
            <div className="field__value">{formatDate(factura.fechaVencimiento.toISOString())}</div>
          </div>
          <div className="field field--readOnly">
            <span>Contacto</span>
            <div className="field__value">{factura.abonado.telefono ?? factura.abonado.email ?? "-"}</div>
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Saldo pendiente</span>
            <div className="field__value">{formatCurrency(saldoPendiente)}</div>
          </div>
          <div className="field field--readOnly">
            <span>Mora actual</span>
            <div className="field__value">{diasMora > 0 ? `${diasMora} dias` : "Sin mora"}</div>
          </div>
          <div className="field field--readOnly">
            <span>Estado de cobro</span>
            <div className="field__value">
              {saldoPendiente > 0 ? `${creditosAplicados.length} pagos aplicados` : "Cancelada"}
            </div>
          </div>
          <div className="field field--readOnly">
            <span>Moneda</span>
            <div className="field__value">
              {factura.monedaCodigo} / cotizacion {formatDecimal(Number(factura.monedaCotizacion))}
            </div>
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Condicion IVA receptor</span>
            <div className="field__value">{factura.condicionIvaReceptor ?? factura.abonado.condicionIva}</div>
          </div>
          <div className="field field--readOnly">
            <span>Condicion IVA emisor</span>
            <div className="field__value">{factura.condicionIvaEmisor ?? "-"}</div>
          </div>
          <div className="field field--readOnly">
            <span>Socio vinculado</span>
            <div className="field__value">
              {factura.abonado.socio
                ? `${factura.abonado.socio.apellido}, ${factura.abonado.socio.nombre}`
                : "Sin vincular"}
            </div>
          </div>
          <div className="field field--readOnly">
            <span>Servicios activos</span>
            <div className="field__value">{serviciosActivos}</div>
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Tipo comprobante ARCA</span>
            <div className="field__value">
              {factura.tipoComprobanteArca} - {getArcaLabel(ARCA_INVOICE_TYPES, factura.tipoComprobanteArca)}
            </div>
          </div>
          <div className="field field--readOnly">
            <span>Concepto</span>
            <div className="field__value">
              {factura.conceptoArca} - {getArcaLabel(ARCA_CONCEPT_TYPES, factura.conceptoArca)}
            </div>
          </div>
          <div className="field field--readOnly">
            <span>Documento receptor</span>
            <div className="field__value">
              {getArcaLabel(ARCA_DOCUMENT_TYPES, factura.tipoDocumentoReceptor)} /{" "}
              {factura.numeroDocumentoReceptor ?? "-"}
            </div>
          </div>
          <div className="field field--readOnly">
            <span>Resultado ARCA</span>
            <div className="field__value">{factura.resultadoArca}</div>
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Punto de venta</span>
            <div className="field__value">{factura.puntoVentaArca ?? "-"}</div>
          </div>
          <div className="field field--readOnly">
            <span>CAE</span>
            <div className="field__value">{factura.cae ?? "Sin autorizacion todavia"}</div>
          </div>
          <div className="field field--readOnly">
            <span>Vto. CAE</span>
            <div className="field__value">
              {factura.caeVencimiento ? formatDate(factura.caeVencimiento.toISOString()) : "-"}
            </div>
          </div>
          <div className="field field--readOnly">
            <span>Autorizado en</span>
            <div className="field__value">
              {factura.autorizadoArcaAt ? formatDateTime(factura.autorizadoArcaAt.toISOString()) : "-"}
            </div>
          </div>
        </div>
        {factura.observacionesArca ? (
          <div className="field field--readOnly">
            <span>Observaciones ARCA</span>
            <div className="field__value">{factura.observacionesArca}</div>
          </div>
        ) : null}
        {factura.facturaOrigen ? (
          <div className="field field--readOnly">
            <span>Comprobante origen</span>
            <div className="field__value">
              <Link href={`/facturacion/${factura.facturaOrigen.id}`}>{factura.facturaOrigen.numero}</Link>
            </div>
          </div>
        ) : null}
        {factura.tipoAjuste ? (
          <div className="field field--readOnly">
            <span>Tipo de ajuste</span>
            <div className="field__value">{factura.tipoAjuste}</div>
          </div>
        ) : null}
        {factura.motivoAjuste ? (
          <div className="field field--readOnly">
            <span>Motivo del ajuste</span>
            <div className="field__value field__value--multiline">{factura.motivoAjuste}</div>
          </div>
        ) : null}
      </article>

      {!factura.tipoAjuste ? (
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Generar nota de credito o debito</h2>
              <p>Crea un ajuste interno vinculado a este comprobante para corregir saldo o refacturar diferencias.</p>
            </div>
          </div>
          <form action={createNotaAjusteAction} className="form-panel">
            <input name="facturaOrigenId" type="hidden" value={factura.id} />
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Tipo de nota</span>
                <select defaultValue="CREDITO" name="tipoNota">
                  <option value="CREDITO">Nota de credito</option>
                  <option value="DEBITO">Nota de debito</option>
                </select>
              </label>
              <label className="field">
                <span>Importe</span>
                <input name="importe" placeholder="10000" required type="text" />
              </label>
              <label className="field field--span-2">
                <span>Descripcion / motivo</span>
                <input
                  name="descripcion"
                  placeholder="Bonificacion, refacturacion, diferencia de abono o ajuste tecnico"
                  required
                  type="text"
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="action-button" type="submit">
                Generar nota
              </button>
            </div>
          </form>
        </article>
      ) : null}

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Validacion previa ARCA</h2>
            <p>Checklist interno antes de conectar el envio real a WSAA y WSFEv1.</p>
          </div>
          <StatusPill
            tone={
              arcaPrecheck.status === "LISTA"
                ? "success"
                : arcaPrecheck.status === "OBSERVADA"
                  ? "warning"
                  : "neutral"
            }
          >
            {arcaPrecheck.status}
          </StatusPill>
        </div>
        {arcaPrecheck.issues.length > 0 ? (
          <ul className="check-list">
            {arcaPrecheck.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : (
          <ul className="check-list">
            <li>CUIT emisor, punto de venta y comprobante listos.</li>
            <li>Documento receptor, moneda y renglones completos.</li>
            <li>Comprobante preparado para siguiente bloque de integracion WSAA/WSFEv1.</li>
          </ul>
        )}
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Payload WSFEv1 preparado</h2>
            <p>Vista previa tecnica de la solicitud a FECAESolicitar, lista para integracion futura.</p>
          </div>
        </div>
        <div className="form-grid form-grid--2">
          <div className="field field--readOnly">
            <span>Endpoint WSAA</span>
            <div className="field__value field__value--multiline">{wsfePreview.endpoints.wsaa}</div>
          </div>
          <div className="field field--readOnly">
            <span>Endpoint WSFEv1</span>
            <div className="field__value field__value--multiline">{wsfePreview.endpoints.wsfev1}</div>
          </div>
        </div>
        <div className="code-panel">
          <pre>{JSON.stringify(wsfePreview, null, 2)}</pre>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Detalle facturado</h2>
            <p>Conceptos, contratos y cargos tecnicos que componen el comprobante.</p>
          </div>
        </div>
        <DataTable
          columns={["Descripcion", "Origen", "Cantidad", "Unitario", "IVA %", "Subtotal", "IVA", "Total"]}
          rows={detalleRows}
          emptyMessage="No hay renglones cargados en esta factura."
        />
      </article>

      {factura.notasRelacionadas.length > 0 ? (
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Notas relacionadas</h2>
              <p>Ajustes ya emitidos sobre este comprobante.</p>
            </div>
          </div>
          <DataTable
            columns={["Comprobante", "Tipo", "Emision", "Importe", "Estado", "Ficha"]}
            rows={notasRows}
            emptyMessage="No hay notas vinculadas a este comprobante."
          />
        </article>
      ) : null}

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Pagos aplicados</h2>
              <p>Imputaciones concretas sobre este comprobante en orden cronologico.</p>
            </div>
          </div>
        <DataTable
          columns={["Fecha", "Descripcion", "Importe aplicado", "Saldo factura"]}
          rows={pagosRows}
          emptyMessage="Todavia no hay pagos aplicados sobre este comprobante."
        />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Cuenta corriente vinculada</h2>
              <p>Debito original y creditos posteriores asociados a esta factura.</p>
            </div>
          </div>
        <DataTable
          columns={["Fecha", "Recibo", "Tipo", "Descripcion", "Importe", "Saldo global", "Estado"]}
          rows={movimientosRows}
          emptyMessage="No hay movimientos vinculados a esta factura."
        />
        </article>
      </section>
    </section>
  );
}
