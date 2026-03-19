import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/shared/data-table";
import { PrintButton } from "@/components/shared/print-button";
import { StatusPill } from "@/components/shared/status-pill";
import { requireRole } from "@/lib/auth";
import { getPagoProfile } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function ReciboPage({ params }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const { id } = await params;
  const pagoId = Number.parseInt(id, 10);

  if (Number.isNaN(pagoId)) {
    notFound();
  }

  const pago = await getPagoProfile(pagoId);

  if (!pago) {
    notFound();
  }

  const titular =
    pago.abonado.razonSocial ||
    [pago.abonado.apellido, pago.abonado.nombre].filter(Boolean).join(" ") ||
    pago.abonado.numeroAbonado;

  const aplicacionesRows = pago.movimientos.map((movimiento) => [
    movimiento.factura?.numero ?? "Saldo a favor",
    movimiento.factura ? formatDate(movimiento.factura.fechaEmision.toISOString()) : "-",
    movimiento.factura ? formatCurrency(Number(movimiento.factura.total)) : "-",
    formatCurrency(Number(movimiento.importe)),
    movimiento.descripcion,
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Recibo de cobranza</span>
            <h1>{pago.numeroRecibo ?? `PAGO-${pago.id}`}</h1>
            <p>
              Comprobante interno de caja para {titular}. Resume medio de pago, operador,
              imputacion sobre facturas y estado administrativo del recibo.
            </p>
            <div className="hero__chips">
              <StatusPill tone={pago.estado === "ANULADO" ? "danger" : "success"}>{pago.estado}</StatusPill>
              <span className="hero-chip">{pago.abonado.numeroAbonado}</span>
              <span className="hero-chip">{pago.medioPago}</span>
            </div>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Importe recibido</span>
              <strong>{formatCurrency(Number(pago.importe))}</strong>
              <p>Pago registrado en fecha {formatDate(pago.fecha.toISOString())}.</p>
            </article>
            <article className="metric-card">
              <span>Operador</span>
              <strong>{pago.usuario.nombre}</strong>
              <p>Usuario que registro el cobro dentro del sistema.</p>
            </article>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Resumen del recibo</h2>
            <p>Datos basicos para control, impresion y conciliacion.</p>
          </div>
          <div className="toolbar__actions">
            <Link className="toolbar-button" href="/caja">
              Volver a caja
            </Link>
            <PrintButton />
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Titular</span>
            <div className="field__value">{titular}</div>
          </div>
          <div className="field field--readOnly">
            <span>Abonado</span>
            <div className="field__value">{pago.abonado.numeroAbonado}</div>
          </div>
          <div className="field field--readOnly">
            <span>Fecha y hora</span>
            <div className="field__value">{formatDateTime(pago.fecha.toISOString())}</div>
          </div>
          <div className="field field--readOnly">
            <span>Medio de pago</span>
            <div className="field__value">{pago.medioPago}</div>
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Importe</span>
            <div className="field__value">{formatCurrency(Number(pago.importe))}</div>
          </div>
          <div className="field field--readOnly">
            <span>Operador</span>
            <div className="field__value">{pago.usuario.nombre}</div>
          </div>
          <div className="field field--readOnly">
            <span>Estado</span>
            <div className="field__value">{pago.estado}</div>
          </div>
          <div className="field field--readOnly">
            <span>Socio vinculado</span>
            <div className="field__value">
              {pago.abonado.socio ? `${pago.abonado.socio.apellido}, ${pago.abonado.socio.nombre}` : "Sin vincular"}
            </div>
          </div>
        </div>
        {pago.motivoAnulacion ? (
          <div className="field field--readOnly">
            <span>Motivo de anulacion</span>
            <div className="field__value field__value--multiline">{pago.motivoAnulacion}</div>
          </div>
        ) : null}
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Aplicacion del cobro</h2>
            <p>Facturas o saldos a favor alcanzados por este recibo.</p>
          </div>
        </div>
        <DataTable
          columns={["Factura", "Emision", "Total factura", "Importe aplicado", "Detalle"]}
          rows={aplicacionesRows}
          emptyMessage="Este recibo no tiene imputaciones activas."
        />
      </article>
    </section>
  );
}
