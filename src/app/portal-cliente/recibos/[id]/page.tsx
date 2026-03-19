import { notFound } from "next/navigation";
import { PrintButton } from "@/components/shared/print-button";
import { StatusPill } from "@/components/shared/status-pill";
import { requirePortalSession } from "@/lib/auth";
import { getPagoProfile } from "@/lib/data";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function PortalReciboPage({ params }: PageProps) {
  const session = await requirePortalSession();
  const { id } = await params;
  const pagoId = Number.parseInt(id, 10);

  if (Number.isNaN(pagoId)) {
    notFound();
  }

  const pago = await getPagoProfile(pagoId);
  if (!pago || pago.abonadoId !== session.id) {
    notFound();
  }

  return (
    <section className="page-stack" style={{ padding: "24px", maxWidth: "1000px", margin: "0 auto" }}>
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Recibo</span>
            <h1>{pago.numeroRecibo ?? `PAGO-${pago.id}`}</h1>
            <p>Comprobante de pago disponible dentro de tu oficina virtual.</p>
          </div>
          <div className="toolbar__actions">
            <StatusPill tone={pago.estado === "REGISTRADO" ? "success" : "neutral"}>{pago.estado}</StatusPill>
            <PrintButton />
          </div>
        </div>
      </article>

      <article className="card">
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Fecha</span>
            <div className="field__value">{formatDateTime(pago.fecha.toISOString())}</div>
          </div>
          <div className="field field--readOnly">
            <span>Medio</span>
            <div className="field__value">{pago.medioPago}</div>
          </div>
          <div className="field field--readOnly">
            <span>Importe</span>
            <div className="field__value">{formatCurrency(Number(pago.importe))}</div>
          </div>
          <div className="field field--readOnly">
            <span>Estado</span>
            <div className="field__value">{pago.estado}</div>
          </div>
        </div>
      </article>
    </section>
  );
}
