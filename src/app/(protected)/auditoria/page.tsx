import { DataTable } from "@/components/shared/data-table";
import { StatusPill } from "@/components/shared/status-pill";
import { requireRole } from "@/lib/auth";
import { getAuditoriaData } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

function formatAuditDetail(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default async function AuditoriaPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN"]);
  const params = searchParams ? await searchParams : undefined;
  const filters = {
    q: getQueryValue(params, "q"),
    modulo: getQueryValue(params, "modulo"),
    actorId: getQueryValue(params, "actorId"),
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
  };

  const { eventos, actores, summary } = await getAuditoriaData(filters);
  const modulos = Array.from(new Set(eventos.map((evento) => evento.modulo))).sort();
  const exportParams = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const rows = eventos.map((evento) => [
    formatDateTime(evento.createdAt.toISOString()),
    evento.modulo,
    <StatusPill key={`accion-${evento.id}`} tone="info">
      {evento.accion}
    </StatusPill>,
    evento.entidadId ? `${evento.entidadTipo} #${evento.entidadId}` : evento.entidadTipo,
    evento.actor ? `${evento.actor.nombre} (${evento.actor.rol})` : "Sistema",
    evento.descripcion,
    evento.detalleJson ? (
      <details key={`detail-${evento.id}`}>
        <summary>Ver detalle</summary>
        <div className="code-panel">
          <pre>{formatAuditDetail(evento.detalleJson)}</pre>
        </div>
      </details>
    ) : (
      "-"
    ),
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Control interno</span>
            <h1>Auditoria operativa</h1>
            <p>
              Revisa cambios sensibles del sistema, identifica actor, modulo y entidad afectada y
              deja trazabilidad para soporte, caja y administracion.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Eventos</span>
              <strong>{summary.total}</strong>
              <p>Registros visibles con el filtro actual.</p>
            </article>
            <article className="metric-card">
              <span>Modulos</span>
              <strong>{summary.modulos}</strong>
              <p>Areas operativas con actividad registrada.</p>
            </article>
            <article className="metric-card">
              <span>Actores</span>
              <strong>{summary.actores}</strong>
              <p>Usuarios distintos involucrados en estos eventos.</p>
            </article>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros de auditoria</h2>
            <p>Filtra por modulo, actor o periodo para rastrear acciones concretas.</p>
          </div>
          <a className="toolbar-button" href={`/api/export/auditoria?${exportParams.toString()}`}>
            Exportar auditoria CSV
          </a>
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda general</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="Modulo, actor, entidad o descripcion"
                type="search"
              />
            </label>
            <label className="field">
              <span>Modulo</span>
              <select defaultValue={filters.modulo} name="modulo">
                <option value="">Todos</option>
                {modulos.map((modulo) => (
                  <option key={modulo} value={modulo}>
                    {modulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Actor</span>
              <select defaultValue={filters.actorId} name="actorId">
                <option value="">Todos</option>
                {actores.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.nombre} - {actor.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Desde</span>
              <input defaultValue={filters.desde} name="desde" type="date" />
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Hasta</span>
              <input defaultValue={filters.hasta} name="hasta" type="date" />
            </label>
            <div className="toolbar__actions">
              <button className="toolbar-button" type="submit">
                Filtrar
              </button>
              <a className="toolbar-button" href="/auditoria">
                Limpiar
              </a>
            </div>
          </div>
        </form>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Eventos registrados</h2>
            <p>Se muestran hasta 300 eventos recientes en orden cronologico inverso.</p>
          </div>
        </div>
        <DataTable
          columns={["Fecha", "Modulo", "Accion", "Entidad", "Actor", "Descripcion", "Detalle"]}
          rows={rows}
          emptyMessage="Todavia no hay eventos de auditoria para mostrar."
        />
      </article>
    </section>
  );
}
