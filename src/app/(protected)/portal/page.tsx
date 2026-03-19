import Link from "next/link";
import {
  createPortalInteractionAction,
  createPortalPublicationAction,
  updatePortalAccessAction,
  updatePortalPublicationAction,
} from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getPortalData } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

function getAbonadoDisplayName(abonado: {
  numeroAbonado: string;
  razonSocial?: string | null;
  apellido?: string | null;
  nombre?: string | null;
}) {
  return abonado.razonSocial || [abonado.apellido, abonado.nombre].filter(Boolean).join(" ") || abonado.numeroAbonado;
}

export default async function PortalPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    abonadoId: getQueryValue(params, "abonadoId"),
    categoria: getQueryValue(params, "categoria"),
    estado: getQueryValue(params, "estado"),
    destacado: getQueryValue(params, "destacado"),
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
  };

  const { publicaciones, abonados, categories, states, priorities, summary } = await getPortalData(filters);
  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const returnPath = `/portal${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  const rows = publicaciones.map((publicacion) => [
    formatDateTime(publicacion.createdAt.toISOString()),
    publicacion.abonado ? publicacion.abonado.numeroAbonado : "GENERAL",
    publicacion.abonado ? getAbonadoDisplayName(publicacion.abonado) : "Todos los abonados",
    publicacion.categoria,
    publicacion.titulo,
    <StatusPill
      key={`estado-portal-${publicacion.id}`}
      tone={
        publicacion.estado === "PUBLICADA"
          ? "success"
          : publicacion.estado === "ARCHIVADA"
            ? "neutral"
            : "warning"
      }
    >
      {publicacion.estado}
    </StatusPill>,
    publicacion.destacado ? "SI" : "NO",
    publicacion.visibleDesde || publicacion.visibleHasta
      ? `${publicacion.visibleDesde ? formatDate(publicacion.visibleDesde.toISOString()) : "inmediata"} / ${publicacion.visibleHasta ? formatDate(publicacion.visibleHasta.toISOString()) : "sin fin"}`
      : "Siempre visible",
    <div className="workspace-action-row" key={`portal-actions-${publicacion.id}`}>
      {publicacion.abonado ? (
        <Link className="toolbar-button" href={`/oficina-virtual/${publicacion.abonado.id}`}>
          Ver preview
        </Link>
      ) : null}
      <a className="toolbar-button" href={`#portal-publicacion-${publicacion.id}`}>
        Editar
      </a>
    </div>,
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Portal del abonado</span>
            <h1>Publicaciones y avisos de oficina virtual</h1>
            <p>
              Administra novedades generales, mensajes segmentados y avisos por abonado para que
              la oficina virtual tenga contenido real, ordenado y trazable.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Publicadas</span>
              <strong>{summary.publicadas}</strong>
              <p>Mensajes activos listos para verse en el portal.</p>
            </article>
          <article className="metric-card">
            <span>Destacadas</span>
            <strong>{summary.destacadas}</strong>
            <p>Contenido prioritario visible primero para el abonado.</p>
          </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <section className="stats-grid stats-grid--3">
        <article className="card stat-card">
          <span className="stat-card__label">Total</span>
          <strong className="stat-card__value">{summary.total}</strong>
          <p className="stat-card__detail">Publicaciones registradas dentro del portal.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Borradores</span>
          <strong className="stat-card__value">{summary.borradores}</strong>
          <p className="stat-card__detail">Pendientes de publicarse o revisarse.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Segmentadas</span>
          <strong className="stat-card__value">{summary.porAbonado}</strong>
          <p className="stat-card__detail">Dirigidas a abonados puntuales.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Lecturas</span>
          <strong className="stat-card__value">{summary.lecturas}</strong>
          <p className="stat-card__detail">Interacciones de lectura registradas desde el portal.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Confirmaciones</span>
          <strong className="stat-card__value">{summary.confirmaciones}</strong>
          <p className="stat-card__detail">Aceptaciones o vistas confirmadas por el abonado.</p>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros de publicaciones</h2>
            <p>Busca por titulo, abonado, categoria, estado, prioridad o vigencia.</p>
          </div>
          <div className="toolbar__actions">
            <Link className="toolbar-button" href={`/api/export/portal?${exportParams.toString()}`}>
              Exportar CSV
            </Link>
          </div>
        </div>
        <form className="form-panel" method="get">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda</span>
              <input defaultValue={filters.q} name="q" placeholder="Titulo, contenido o abonado" type="text" />
            </label>
            <label className="field">
              <span>Abonado</span>
              <select defaultValue={filters.abonadoId} name="abonadoId">
                <option value="">General</option>
                {abonados.map((abonado) => (
                  <option key={abonado.id} value={abonado.id}>
                    {abonado.numeroAbonado} - {getAbonadoDisplayName(abonado)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Categoria</span>
              <select defaultValue={filters.categoria} name="categoria">
                <option value="">Todas</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estado</span>
              <select defaultValue={filters.estado} name="estado">
                <option value="">Todos</option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Destacada</span>
              <select defaultValue={filters.destacado} name="destacado">
                <option value="">Todas</option>
                <option value="SI">Solo destacadas</option>
                <option value="NO">No destacadas</option>
              </select>
            </label>
            <label className="field">
              <span>Desde</span>
              <input defaultValue={filters.desde} name="desde" type="date" />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input defaultValue={filters.hasta} name="hasta" type="date" />
            </label>
          </div>
          <div className="form-actions">
            <SubmitButton idleLabel="Aplicar filtros" pendingLabel="Filtrando..." />
          </div>
        </form>
      </article>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Nueva publicacion</h2>
              <p>Crea avisos generales o segmentados para aparecer dentro del portal del abonado.</p>
            </div>
          </div>
          <form action={createPortalPublicationAction} className="form-panel">
            <input name="redirectPath" type="hidden" value={returnPath} />
            <div className="form-grid form-grid--3">
              <label className="field">
                <span>Abonado</span>
                <select defaultValue="" name="abonadoId">
                  <option value="">General para todos</option>
                  {abonados.map((abonado) => (
                    <option key={abonado.id} value={abonado.id}>
                      {abonado.numeroAbonado} - {getAbonadoDisplayName(abonado)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Categoria</span>
                <select defaultValue="GENERAL" name="categoria" required>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Estado</span>
                <select defaultValue="PUBLICADA" name="estado" required>
                  {states.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field field--span-2">
                <span>Titulo</span>
                <input name="titulo" placeholder="Titulo visible para el abonado" required type="text" />
              </label>
              <label className="field">
                <span>Prioridad</span>
                <select defaultValue="NORMAL" name="prioridad" required>
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Resumen</span>
              <input name="resumen" placeholder="Bajada breve opcional" type="text" />
            </label>
            <label className="field">
              <span>Contenido</span>
              <textarea name="contenido" placeholder="Mensaje completo de la publicacion" required rows={6} />
            </label>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Visible desde</span>
                <input name="visibleDesde" type="datetime-local" />
              </label>
              <label className="field">
                <span>Visible hasta</span>
                <input name="visibleHasta" type="datetime-local" />
              </label>
              <label className="field">
                <span>Destacada</span>
                <div className="field__value">
                  <input name="destacado" type="checkbox" value="SI" />
                </div>
              </label>
              <label className="field">
                <span>Requiere confirmacion</span>
                <div className="field__value">
                  <input name="requiereConfirmacion" type="checkbox" value="SI" />
                </div>
              </label>
            </div>
            <div className="form-actions">
              <SubmitButton idleLabel="Crear publicacion" pendingLabel="Guardando..." />
            </div>
          </form>
        </article>

        <article className="card card--dark">
          <div className="section-heading section-heading--light">
            <div>
              <h2>Uso del portal</h2>
              <p>Base lista para evolucionar a oficina virtual real y no solo preview interno.</p>
            </div>
          </div>
          <ul className="check-list check-list--light">
            <li>Publicaciones generales para todos los abonados.</li>
            <li>Avisos segmentados por cliente o cuenta.</li>
            <li>Vigencia controlada para avisos temporales.</li>
            <li>Destacado para priorizar comunicados clave.</li>
          </ul>
          {abonados[0] ? (
            <div className="workspace-action-row">
              <Link className="toolbar-button" href={`/oficina-virtual/${abonados[0].id}`}>
                Ver preview del portal
              </Link>
            </div>
          ) : null}
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Accesos de oficina virtual</h2>
            <p>Habilita o resetea credenciales del portal cliente sin salir del modulo.</p>
          </div>
        </div>
        <form action={updatePortalAccessAction} className="form-panel">
          <input name="redirectPath" type="hidden" value={returnPath} />
          <div className="form-grid form-grid--4">
            <label className="field field--span-2">
              <span>Abonado</span>
              <select defaultValue={filters.abonadoId} name="abonadoId" required>
                <option value="">Seleccionar abonado</option>
                {abonados.map((abonado) => (
                  <option key={abonado.id} value={abonado.id}>
                    {abonado.numeroAbonado} - {getAbonadoDisplayName(abonado)} {abonado.portalActivo ? "(Portal activo)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Portal habilitado</span>
              <div className="field__value">
                <input name="portalActivo" type="checkbox" value="SI" />
              </div>
            </label>
            <label className="field">
              <span>Nueva contrasena</span>
              <input name="nuevaPassword" placeholder="Minimo 8 caracteres" type="password" />
            </label>
          </div>
          <div className="form-actions">
            <SubmitButton idleLabel="Actualizar acceso" pendingLabel="Guardando..." />
          </div>
        </form>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Bandeja de publicaciones</h2>
            <p>Vista operativa y exportable de lo que ya existe dentro del portal.</p>
          </div>
        </div>
        <DataTable
          columns={["Fecha", "Destino", "Titular", "Categoria", "Titulo", "Estado", "Destacada", "Vigencia", "Acciones"]}
          rows={rows}
          emptyMessage="Todavia no hay publicaciones registradas."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Edicion operativa</h2>
            <p>Administra estado, vigencia y contenido sin salir del modulo.</p>
          </div>
        </div>
        <div className="workspace-side-stack">
          {publicaciones.map((publicacion) => (
            <article className="card card--embedded" id={`portal-publicacion-${publicacion.id}`} key={publicacion.id}>
              <div className="section-heading">
                <div>
                  <h3>{publicacion.titulo}</h3>
                  <p>
                    {publicacion.abonado
                      ? `${publicacion.abonado.numeroAbonado} - ${getAbonadoDisplayName(publicacion.abonado)}`
                      : "Publicacion general"}
                  </p>
                </div>
                <StatusPill tone={publicacion.estado === "PUBLICADA" ? "success" : publicacion.estado === "BORRADOR" ? "warning" : "neutral"}>
                  {publicacion.estado}
                </StatusPill>
              </div>
              <div className="workspace-inline-panel">
                <div>
                  <strong>
                    {publicacion.interaccionesPortal.filter((item) => item.tipo === "LECTURA").length} lecturas /{" "}
                    {publicacion.interaccionesPortal.filter((item) => item.tipo === "CONFIRMACION").length} confirmaciones
                  </strong>
                  <p>Seguimiento real de interacciones registradas sobre esta publicacion.</p>
                </div>
                {publicacion.abonado ? (
                  <form action={createPortalInteractionAction}>
                    <input name="abonadoId" type="hidden" value={publicacion.abonado.id} />
                    <input name="publicacionId" type="hidden" value={publicacion.id} />
                    <input name="tipo" type="hidden" value="LECTURA" />
                    <input name="redirectPath" type="hidden" value={returnPath} />
                    <SubmitButton idleLabel="Simular lectura" pendingLabel="Registrando..." />
                  </form>
                ) : null}
              </div>
              <form action={updatePortalPublicationAction}>
                <input name="publicacionId" type="hidden" value={publicacion.id} />
                <input name="redirectPath" type="hidden" value={returnPath} />
                <div className="form-grid form-grid--3">
                  <label className="field">
                    <span>Abonado</span>
                    <select defaultValue={String(publicacion.abonadoId ?? "")} name="abonadoId">
                      <option value="">General para todos</option>
                      {abonados.map((abonado) => (
                        <option key={abonado.id} value={abonado.id}>
                          {abonado.numeroAbonado} - {getAbonadoDisplayName(abonado)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Categoria</span>
                    <select defaultValue={publicacion.categoria} name="categoria" required>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Estado</span>
                    <select defaultValue={publicacion.estado} name="estado" required>
                      {states.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field field--span-2">
                    <span>Titulo</span>
                    <input defaultValue={publicacion.titulo} name="titulo" required type="text" />
                  </label>
                  <label className="field">
                    <span>Prioridad</span>
                    <select defaultValue={publicacion.prioridad} name="prioridad" required>
                      {priorities.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Resumen</span>
                  <input defaultValue={publicacion.resumen ?? ""} name="resumen" type="text" />
                </label>
                <label className="field">
                  <span>Contenido</span>
                  <textarea defaultValue={publicacion.contenido} name="contenido" required rows={5} />
                </label>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Visible desde</span>
                    <input
                      defaultValue={publicacion.visibleDesde ? publicacion.visibleDesde.toISOString().slice(0, 16) : ""}
                      name="visibleDesde"
                      type="datetime-local"
                    />
                  </label>
                  <label className="field">
                    <span>Visible hasta</span>
                    <input
                      defaultValue={publicacion.visibleHasta ? publicacion.visibleHasta.toISOString().slice(0, 16) : ""}
                      name="visibleHasta"
                      type="datetime-local"
                    />
                  </label>
                  <label className="field">
                    <span>Destacada</span>
                    <div className="field__value">
                      <input defaultChecked={publicacion.destacado} name="destacado" type="checkbox" value="SI" />
                    </div>
                  </label>
                  <label className="field">
                    <span>Requiere confirmacion</span>
                    <div className="field__value">
                      <input
                        defaultChecked={publicacion.requiereConfirmacion}
                        name="requiereConfirmacion"
                        type="checkbox"
                        value="SI"
                      />
                    </div>
                  </label>
                </div>
                <div className="form-actions">
                  <SubmitButton idleLabel="Guardar publicacion" pendingLabel="Guardando..." />
                </div>
              </form>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
