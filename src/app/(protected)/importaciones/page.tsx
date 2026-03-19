import { runAbonadosImportAction } from "@/app/actions";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { SubmitButton } from "@/components/shared/submit-button";
import { DataTable } from "@/components/shared/data-table";
import { requireRole } from "@/lib/auth";
import { getImportacionesData } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ImportacionesPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = typeof params?.ok === "string" ? params.ok : undefined;
  const error = typeof params?.error === "string" ? params.error : undefined;
  const { archivo, importaciones } = await getImportacionesData();

  const rows = importaciones.map((importacion) => [
    String(importacion.id),
    importacion.tipo,
    importacion.estado,
    String(importacion.filasProcesadas),
    String(importacion.filasCreadas),
    String(importacion.filasOmitidas),
    importacion.resumen ?? "-",
    formatDateTime(importacion.createdAt.toISOString()),
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <span className="eyebrow">Carga masiva</span>
        <h1>Importaciones</h1>
        <p>
          Este modulo toma la plantilla local de abonados y crea socios y abonados nuevos sin
          duplicar numeros existentes. Cada corrida queda registrada en la base.
        </p>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Importador de abonados ODS</h2>
            <p>Archivo configurado: {archivo || "No definido"}</p>
          </div>
        </div>
        <FeedbackBanner message={ok} tone="success" />
        <FeedbackBanner message={error} tone="error" />
        <form action={runAbonadosImportAction} className="form-panel">
          <div className="form-grid form-grid--2">
            <div className="field field--readOnly">
              <span>Origen esperado</span>
              <div className="field__value">{archivo || "Configura ABONADOS_TEMPLATE_PATH en .env"}</div>
            </div>
            <div className="form-actions">
              <SubmitButton idleLabel="Importar plantilla" pendingLabel="Importando..." />
            </div>
          </div>
        </form>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Historial de corridas</h2>
            <p>{importaciones.length} registros recientes.</p>
          </div>
        </div>
        <DataTable
          columns={[
            "ID",
            "Tipo",
            "Estado",
            "Procesadas",
            "Creadas",
            "Omitidas",
            "Resumen",
            "Fecha",
          ]}
          rows={rows}
        />
      </article>
    </section>
  );
}
