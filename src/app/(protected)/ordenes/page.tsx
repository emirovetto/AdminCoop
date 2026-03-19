import Link from "next/link";
import { createOrdenTrabajoAction, updateOrdenTrabajoAction } from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getOrdenesTrabajoData } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

function getStatusTone(estado: string) {
  switch (estado) {
    case "RESUELTA":
      return "success";
    case "EN_CURSO":
      return "info";
    case "CANCELADA":
      return "danger";
    case "ASIGNADA":
      return "warning";
    default:
      return "neutral";
  }
}

export default async function OrdenesPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    estado: getQueryValue(params, "estado"),
    tipo: getQueryValue(params, "tipo"),
    tecnicoId: getQueryValue(params, "tecnicoId"),
    abonadoId: getQueryValue(params, "abonadoId"),
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
  };

  const { ordenes, abonados, tecnicos, servicios, reclamos, orderStates, orderTypes, summary } =
    await getOrdenesTrabajoData(filters);

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const rows = ordenes.map((orden) => {
    const titular =
      orden.abonado.razonSocial ||
      [orden.abonado.apellido, orden.abonado.nombre].filter(Boolean).join(" ") ||
      orden.abonado.numeroAbonado;
    const referencia = [
      orden.servicio
        ? `${orden.servicio.plan}${orden.servicio.numeroContrato ? ` / ${orden.servicio.numeroContrato}` : ""}`
        : null,
      orden.reclamoId ? `Reclamo #${orden.reclamoId}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    return [
      `#${orden.id}`,
      orden.tipo,
      `${orden.abonado.numeroAbonado} - ${titular}`,
      referencia || "-",
      <StatusPill key={`estado-${orden.id}`} tone={getStatusTone(orden.estado)}>
        {orden.estado}
      </StatusPill>,
      orden.tecnico?.nombre ?? "Sin asignar",
      orden.fechaProgramada ? formatDate(orden.fechaProgramada.toISOString()) : "Sin fecha",
      orden.motivo,
      <form action={updateOrdenTrabajoAction} className="inline-form" key={`form-${orden.id}`}>
        <input name="ordenId" type="hidden" value={orden.id} />
        <div className="inline-form__grid">
          <select defaultValue={orden.estado} name="estado">
            {orderStates.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
          <select defaultValue={String(orden.tecnicoId ?? "")} name="tecnicoId">
            <option value="">Sin tecnico</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.nombre}
              </option>
            ))}
          </select>
          <input
            defaultValue={orden.fechaProgramada ? orden.fechaProgramada.toISOString().slice(0, 10) : ""}
            name="fechaProgramada"
            type="date"
          />
          <input defaultValue={orden.resolucion ?? ""} name="resolucion" placeholder="Resolucion" type="text" />
          <SubmitButton idleLabel="Actualizar" pendingLabel="Guardando..." />
        </div>
      </form>,
    ];
  });

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Operacion tecnica</span>
            <h1>Ordenes de trabajo</h1>
            <p>
              Administra instalaciones, visitas tecnicas, cortes, reconexiones y bajas con un
              circuito propio. Al resolver una orden, el estado del servicio se ajusta de forma coherente.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Pendientes</span>
              <strong>{summary.pendientes}</strong>
              <p>Ordenes todavia sin cierre operativo.</p>
            </article>
            <article className="metric-card">
              <span>En curso</span>
              <strong>{summary.enCurso}</strong>
              <p>Trabajos tecnicos actualmente en ejecucion.</p>
            </article>
            <article className="metric-card">
              <span>Instalaciones</span>
              <strong>{summary.instalaciones}</strong>
              <p>Contratos que ya tienen una OT asociada.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros y exportacion</h2>
            <p>{summary.total} ordenes visibles con el corte actual.</p>
          </div>
          <a className="toolbar-button" href={`/api/export/ordenes?${exportParams.toString()}`}>
            Exportar CSV
          </a>
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda general</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="Abonado, tecnico, motivo o detalle"
                type="search"
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select defaultValue={filters.estado} name="estado">
                <option value="">Todos</option>
                {orderStates.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo</span>
              <select defaultValue={filters.tipo} name="tipo">
                <option value="">Todos</option>
                {orderTypes.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tecnico</span>
              <select defaultValue={filters.tecnicoId} name="tecnicoId">
                <option value="">Todos</option>
                {tecnicos.map((tecnico) => (
                  <option key={tecnico.id} value={tecnico.id}>
                    {tecnico.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Abonado</span>
              <select defaultValue={filters.abonadoId} name="abonadoId">
                <option value="">Todos</option>
                {abonados.map((abonado) => (
                  <option key={abonado.id} value={abonado.id}>
                    {abonado.numeroAbonado} -{" "}
                    {abonado.razonSocial || [abonado.apellido, abonado.nombre].filter(Boolean).join(" ")}
                  </option>
                ))}
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
            <div className="toolbar__actions">
              <button className="toolbar-button" type="submit">
                Filtrar
              </button>
              <Link className="toolbar-button" href="/ordenes">
                Limpiar
              </Link>
            </div>
          </div>
        </form>
      </article>

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Nueva orden</h2>
              <p>Permite programar instalaciones, visitas, cortes y reconexiones.</p>
            </div>
          </div>
          <form action={createOrdenTrabajoAction} className="form-panel">
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Abonado</span>
                <select name="abonadoId" required>
                  <option value="">Seleccionar abonado</option>
                  {abonados.map((abonado) => (
                    <option key={abonado.id} value={abonado.id}>
                      {abonado.numeroAbonado} -{" "}
                      {abonado.razonSocial || [abonado.apellido, abonado.nombre].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tipo</span>
                <select name="tipo" required>
                  {orderTypes.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tecnico</span>
                <select name="tecnicoId">
                  <option value="">Asignar despues</option>
                  {tecnicos.map((tecnico) => (
                    <option key={tecnico.id} value={tecnico.id}>
                      {tecnico.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Fecha programada</span>
                <input name="fechaProgramada" type="date" />
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Servicio vinculado</span>
                <select name="servicioId">
                  <option value="">Sin vincular</option>
                  {servicios.map((servicio) => (
                    <option key={servicio.id} value={servicio.id}>
                      {servicio.abonado.numeroAbonado} - {servicio.plan}
                      {servicio.numeroContrato ? ` / ${servicio.numeroContrato}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Reclamo vinculado</span>
                <select name="reclamoId">
                  <option value="">Sin vincular</option>
                  {reclamos.map((reclamo) => (
                    <option key={reclamo.id} value={reclamo.id}>
                      #{reclamo.id} - {reclamo.abonado.numeroAbonado} - {reclamo.tipoServicio}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Motivo</span>
                <input name="motivo" required type="text" />
              </label>
              <label className="field field--checkbox">
                <span>Cargo facturable</span>
                <input name="cargoFacturable" type="checkbox" value="true" />
              </label>
            </div>
            <label className="field">
              <span>Detalle operativo</span>
              <textarea name="detalle" rows={4} />
            </label>
            <SubmitButton idleLabel="Crear orden" pendingLabel="Creando..." />
          </form>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Criterios operativos</h2>
              <p>La instalacion se crea sola al contratar un servicio nuevo.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-list__item">
              <strong>Instalacion</strong>
              <p>Cuando se resuelve, el servicio pasa a estado activo y ya puede entrar en facturacion.</p>
            </div>
            <div className="stack-list__item">
              <strong>Corte</strong>
              <p>Al resolverla, el servicio queda suspendido hasta una futura reconexion.</p>
            </div>
            <div className="stack-list__item">
              <strong>Reconexion o baja</strong>
              <p>La resolucion sincroniza el estado del contrato para evitar inconsistencias administrativas.</p>
            </div>
            <div className="stack-list__item">
              <strong>Historial por abonado</strong>
              <p>La orden queda visible en la ficha del abonado junto con reclamos, materiales y facturacion.</p>
            </div>
          </div>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Seguimiento de ordenes</h2>
            <p>Cada fila permite reasignar tecnico, programar fecha y cerrar la orden.</p>
          </div>
        </div>
        <DataTable
          columns={["OT", "Tipo", "Abonado", "Referencia", "Estado", "Tecnico", "Programada", "Motivo", "Gestion"]}
          rows={rows}
          emptyMessage="No hay ordenes de trabajo para mostrar con estos filtros."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Ultimas programaciones</h2>
            <p>Vista rapida para controlar agenda y cierre tecnico.</p>
          </div>
        </div>
        <DataTable
          columns={["OT", "Fecha solicitud", "Programada", "Estado", "Resolucion"]}
          rows={ordenes.slice(0, 12).map((orden) => [
            `#${orden.id}`,
            formatDateTime(orden.fechaSolicitud.toISOString()),
            orden.fechaProgramada ? formatDateTime(orden.fechaProgramada.toISOString()) : "Sin definir",
            <StatusPill key={`quick-${orden.id}`} tone={getStatusTone(orden.estado)}>
              {orden.estado}
            </StatusPill>,
            orden.resolucion ?? "-",
          ])}
          emptyMessage="Todavia no hay ordenes registradas."
        />
      </article>
    </section>
  );
}
