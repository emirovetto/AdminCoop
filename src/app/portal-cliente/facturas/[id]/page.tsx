import { notFound } from "next/navigation";
import { PrintButton } from "@/components/shared/print-button";
import { StatusPill } from "@/components/shared/status-pill";
import { requirePortalSession } from "@/lib/auth";
import { getFacturaProfile } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function PortalFacturaPage({ params }: PageProps) {
  const session = await requirePortalSession();
  const { id } = await params;
  const facturaId = Number.parseInt(id, 10);

  if (Number.isNaN(facturaId)) {
    notFound();
  }

  const factura = await getFacturaProfile(facturaId);
  if (!factura || factura.abonadoId !== session.id) {
    notFound();
  }

  return (
    <section className="page-stack" style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto" }}>
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Factura</span>
            <h1>{factura.numero}</h1>
            <p>Comprobante disponible dentro de tu oficina virtual.</p>
          </div>
          <div className="toolbar__actions">
            <StatusPill tone={factura.estado === "PAGADA" ? "success" : factura.estado === "VENCIDA" ? "danger" : "warning"}>
              {factura.estado}
            </StatusPill>
            <PrintButton />
          </div>
        </div>
      </article>

      <article className="card">
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Emision</span>
            <div className="field__value">{formatDate(factura.fechaEmision.toISOString())}</div>
          </div>
          <div className="field field--readOnly">
            <span>Vencimiento</span>
            <div className="field__value">{formatDate(factura.fechaVencimiento.toISOString())}</div>
          </div>
          <div className="field field--readOnly">
            <span>Subtotal</span>
            <div className="field__value">{formatCurrency(Number(factura.subtotal))}</div>
          </div>
          <div className="field field--readOnly">
            <span>Total</span>
            <div className="field__value">{formatCurrency(Number(factura.total))}</div>
          </div>
        </div>
        <div className="stack-list">
          {factura.detalles.map((detalle) => (
            <article className="stack-list__item" key={detalle.id}>
              <strong>{detalle.descripcion}</strong>
              <p>
                {detalle.cantidad.toString()} x {formatCurrency(Number(detalle.precioUnitario))} ={" "}
                {formatCurrency(Number(detalle.totalLinea))}
              </p>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
