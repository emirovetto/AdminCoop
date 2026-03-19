import Link from "next/link";
import {
  createComunicacionAbonadoAction,
  createPlantillaComunicacionAction,
  updatePlantillaComunicacionAction,
  updateComunicacionEstadoAction,
} from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getComunicacionesData } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

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

export default async function ComunicacionesPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    abonadoId: getQueryValue(params, "abonadoId"),
    canal: getQueryValue(params, "canal"),
    tipo: getQueryValue(params, "tipo"),
    estado: getQueryValue(params, "estado"),
    oficinaVirtual: getQueryValue(params, "oficinaVirtual"),
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
  };

  const { comunicaciones, abonados, plantillas, summary, channels, types, states, priorities } =
    await getComunicacionesData(filters);
  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const returnPath = `/comunicaciones${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  const rows = comunicaciones.map((comunicacion) => [
    formatDateTime(comunicacion.createdAt.toISOString()),
    comunicacion.abonado.numeroAbonado,
    getAbonadoDisplayName(comunicacion.abonado),
    comunicacion.canal,
    comunicacion.tipo,
    comunicacion.asunto,
    <StatusPill
      key={`estado-${comunicacion.id}`}
      tone={
        comunicacion.estado === "ENVIADA"
          ? "success"
          : comunicacion.estado === "ERROR"
            ? "danger"
            : comunicacion.estado === "ARCHIVADA"
              ? "neutral"
              : "warning"
      }
    >
      {comunicacion.estado}
    </StatusPill>,
    comunicacion.visibleOficinaVirtual ? "SI" : "NO",
    <div className="workspace-action-row" key={`acciones-${comunicacion.id}`}>
      <Link className="toolbar-button" href={`/abonados/${comunicacion.abonadoId}?tab=comunicaciones`}>
        Ver ficha
      </Link>
      {["REGISTRADA", "PROGRAMADA", "ERROR"].includes(comunicacion.estado) ? (
        <form action={updateComunicacionEstadoAction}>
          <input name="comunicacionId" type="hidden" value={comunicacion.id} />
          <input name="estado" type="hidden" value="ENVIADA" />
          <input name="redirectPath" type="hidden" value={returnPath} />
          <SubmitButton idleLabel="Enviada" pendingLabel="Actualizando..." />
        </form>
      ) : null}
      {comunicacion.estado !== "ARCHIVADA" ? (
        <form action={updateComunicacionEstadoAction}>
          <input name="comunicacionId" type="hidden" value={comunicacion.id} />
          <input name="estado" type="hidden" value="ARCHIVADA" />
          <input name="redirectPath" type="hidden" value={returnPath} />
          <SubmitButton idleLabel="Archivar" pendingLabel="Actualizando..." />
        </form>
      ) : null}
    </div>,
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Operacion multicanal</span>
            <h1>Comunicaciones con abonados</h1>
            <p>
              Registra mensajes de cobranza, facturacion, soporte y avisos internos, dejando todo
              vinculado al abonado y listo para oficina virtual.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Registradas o programadas</span>
              <strong>{summary.pendientes}</strong>
              <p>Mensajes aun pendientes de cierre o envio.</p>
            </article>
            <article className="metric-card">
              <span>Visibles en oficina virtual</span>
              <strong>{summary.oficinaVirtual}</strong>
              <p>Comunicaciones preparadas para el portal del abonado.</p>
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
          <p className="stat-card__detail">Historial general registrado en el modulo.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Pendientes</span>
          <strong className="stat-card__value">{summary.pendientes}</strong>
          <p className="stat-card__detail">Registradas o programadas, aun sin cierre operativo.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Enviadas</span>
          <strong className="stat-card__value">{summary.enviadas}</strong>
          <p className="stat-card__detail">Marcadas como completadas sobre el canal correspondiente.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Errores</span>
          <strong className="stat-card__value">{summary.errores}</strong>
          <p className="stat-card__detail">Casos que requieren revision manual.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Oficina virtual</span>
          <strong className="stat-card__value">{summary.oficinaVirtual}</strong>
          <p className="stat-card__detail">Disponibles para publicacion en el portal del abonado.</p>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros de bandeja</h2>
            <p>Busca por abonado, canal, tipo, estado o rango de fechas.</p>
          </div>
          <div className="toolbar__actions">
            <Link className="toolbar-button" href={`/api/export/comunicaciones?${exportParams.toString()}`}>
              Exportar CSV
            </Link>
          </div>
        </div>
        <form className="form-panel" method="get">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda</span>
              <input defaultValue={filters.q} name="q" placeholder="Abonado, asunto o mensaje" type="text" />
            </label>
            <label className="field">
              <span>Abonado</span>
              <select defaultValue={filters.abonadoId} name="abonadoId">
                <option value="">Todos</option>
                {abonados.map((abonado) => (
                  <option key={abonado.id} value={abonado.id}>
                    {abonado.numeroAbonado} - {getAbonadoDisplayName(abonado)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Canal</span>
              <select defaultValue={filters.canal} name="canal">
                <option value="">Todos</option>
                {channels.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo</span>
              <select defaultValue={filters.tipo} name="tipo">
                <option value="">Todos</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--4">
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
            <label className="field">
              <span>Oficina virtual</span>
              <select defaultValue={filters.oficinaVirtual} name="oficinaVirtual">
                <option value="">Todos</option>
                <option value="SI">Visible</option>
                <option value="NO">No visible</option>
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
              <h2>Nueva comunicacion</h2>
              <p>Dejala registrada y vinculada al abonado para seguimiento y oficina virtual.</p>
            </div>
          </div>
          <form action={createComunicacionAbonadoAction} className="form-panel">
            <input name="redirectPath" type="hidden" value={returnPath} />
            <input name="origenModulo" type="hidden" value="COMUNICACIONES" />
            <div className="form-grid form-grid--3">
              <label className="field">
                <span>Abonado</span>
                <select defaultValue={filters.abonadoId} name="abonadoId" required>
                  <option value="">Seleccionar abonado</option>
                  {abonados.map((abonado) => (
                    <option key={abonado.id} value={abonado.id}>
                      {abonado.numeroAbonado} - {getAbonadoDisplayName(abonado)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Canal</span>
                <select defaultValue="EMAIL" name="canal" required>
                  {channels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tipo</span>
                <select defaultValue="AVISO_GENERAL" name="tipo" required>
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Estado</span>
                <select defaultValue="REGISTRADA" name="estado" required>
                  {states.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
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
              <label className="field field--span-2">
                <span>Asunto</span>
                <input name="asunto" placeholder="Asunto de la comunicacion" required type="text" />
              </label>
            </div>
            <div className="form-grid form-grid--2">
              <label className="field">
                <span>Programada para</span>
                <input name="programadaAt" type="datetime-local" />
              </label>
              <label className="field">
                <span>Visible en oficina virtual</span>
                <div className="field__value">
                  <input name="visibleOficinaVirtual" type="checkbox" value="SI" />
                </div>
              </label>
            </div>
            <label className="field">
              <span>Mensaje</span>
              <textarea name="mensaje" placeholder="Detalle completo del mensaje" required rows={5} />
            </label>
            <label className="field">
              <span>Requiere seguimiento</span>
              <div className="field__value">
                <input name="requiereSeguimiento" type="checkbox" value="SI" />
              </div>
            </label>
            <div className="form-actions">
              <SubmitButton idleLabel="Registrar comunicacion" pendingLabel="Guardando..." />
            </div>
          </form>
        </article>

        <article className="card card--dark">
          <div className="section-heading section-heading--light">
            <div>
              <h2>Uso del modulo</h2>
              <p>Centro operativo previo a integracion de envio real y oficina virtual completa.</p>
            </div>
          </div>
          <ul className="check-list check-list--light">
            <li>Registra avisos de cobranza, facturacion, soporte y mensajes generales.</li>
            <li>Deja trazabilidad por abonado y operador interno.</li>
            <li>Permite marcar comunicaciones como enviadas, archivadas o con error.</li>
            <li>Prepara publicaciones visibles para la futura oficina virtual.</li>
          </ul>
          {abonados[0] ? (
            <div className="workspace-action-row">
              <Link className="toolbar-button" href={`/oficina-virtual/${abonados[0].id}`}>
                Ver preview oficina virtual
              </Link>
            </div>
          ) : null}
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Plantillas operativas</h2>
            <p>Mensajes base para cobranza, facturacion, soporte y avisos visibles en oficina virtual.</p>
          </div>
        </div>
        <div className="workspace-focus-grid">
          <article className="form-panel form-panel--primary">
            <div className="section-heading">
              <div>
                <h3>Nueva plantilla</h3>
                <p>Crea mensajes reutilizables para acelerar la operacion diaria.</p>
              </div>
            </div>
            <form action={createPlantillaComunicacionAction}>
              <input name="redirectPath" type="hidden" value={returnPath} />
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Codigo</span>
                  <input name="codigo" placeholder="COBRO_VENCIDO" required type="text" />
                </label>
                <label className="field">
                  <span>Nombre</span>
                  <input name="nombre" placeholder="Cobranza vencida" required type="text" />
                </label>
                <label className="field">
                  <span>Canal</span>
                  <select defaultValue="EMAIL" name="canal" required>
                    {channels.map((channel) => (
                      <option key={channel} value={channel}>
                        {channel}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Tipo</span>
                  <select defaultValue="COBRANZA" name="tipo" required>
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid form-grid--4">
                <label className="field field--span-2">
                  <span>Asunto</span>
                  <input name="asuntoTemplate" placeholder="Recordatorio de deuda para {abonado}" required type="text" />
                </label>
                <label className="field">
                  <span>Prioridad</span>
                  <select defaultValue="NORMAL" name="prioridadDefault" required>
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Mensaje plantilla</span>
                <textarea
                  name="mensajeTemplate"
                  placeholder="Hola {abonado}, te informamos..."
                  required
                  rows={5}
                />
              </label>
              <div className="form-grid form-grid--2">
                <label className="field">
                  <span>Visible en oficina virtual</span>
                  <div className="field__value">
                    <input name="visibleOficinaVirtualDefault" type="checkbox" value="SI" />
                  </div>
                </label>
                <label className="field">
                  <span>Requiere seguimiento</span>
                  <div className="field__value">
                    <input name="requiereSeguimientoDefault" type="checkbox" value="SI" />
                  </div>
                </label>
              </div>
              <label className="field">
                <span>Observaciones</span>
                <input name="observaciones" placeholder="Uso interno o contexto de aplicacion" type="text" />
              </label>
              <div className="form-actions">
                <SubmitButton idleLabel="Crear plantilla" pendingLabel="Guardando..." />
              </div>
            </form>
          </article>

          <div className="workspace-side-stack">
            {plantillas.map((plantilla) => (
              <article className="card card--embedded" key={plantilla.id}>
                <div className="section-heading">
                  <div>
                    <h3>{plantilla.nombre}</h3>
                    <p>
                      {plantilla.codigo} / {plantilla.canal} / {plantilla.tipo}
                    </p>
                  </div>
                  <StatusPill tone={plantilla.activa ? "success" : "warning"}>
                    {plantilla.activa ? "ACTIVA" : "INACTIVA"}
                  </StatusPill>
                </div>
                <form action={updatePlantillaComunicacionAction}>
                  <input name="plantillaId" type="hidden" value={plantilla.id} />
                  <input name="redirectPath" type="hidden" value={returnPath} />
                  <div className="form-grid form-grid--2">
                    <label className="field">
                      <span>Codigo</span>
                      <input defaultValue={plantilla.codigo} name="codigo" required type="text" />
                    </label>
                    <label className="field">
                      <span>Nombre</span>
                      <input defaultValue={plantilla.nombre} name="nombre" required type="text" />
                    </label>
                  </div>
                  <div className="form-grid form-grid--4">
                    <label className="field">
                      <span>Canal</span>
                      <select defaultValue={plantilla.canal} name="canal" required>
                        {channels.map((channel) => (
                          <option key={channel} value={channel}>
                            {channel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Tipo</span>
                      <select defaultValue={plantilla.tipo} name="tipo" required>
                        {types.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Prioridad</span>
                      <select defaultValue={plantilla.prioridadDefault} name="prioridadDefault" required>
                        {priorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Activa</span>
                      <div className="field__value">
                        <input defaultChecked={plantilla.activa} name="activa" type="checkbox" value="SI" />
                      </div>
                    </label>
                  </div>
                  <label className="field">
                    <span>Asunto</span>
                    <input defaultValue={plantilla.asuntoTemplate} name="asuntoTemplate" required type="text" />
                  </label>
                  <label className="field">
                    <span>Mensaje</span>
                    <textarea defaultValue={plantilla.mensajeTemplate} name="mensajeTemplate" required rows={4} />
                  </label>
                  <div className="form-grid form-grid--2">
                    <label className="field">
                      <span>Visible en oficina virtual</span>
                      <div className="field__value">
                        <input
                          defaultChecked={plantilla.visibleOficinaVirtualDefault}
                          name="visibleOficinaVirtualDefault"
                          type="checkbox"
                          value="SI"
                        />
                      </div>
                    </label>
                    <label className="field">
                      <span>Requiere seguimiento</span>
                      <div className="field__value">
                        <input
                          defaultChecked={plantilla.requiereSeguimientoDefault}
                          name="requiereSeguimientoDefault"
                          type="checkbox"
                          value="SI"
                        />
                      </div>
                    </label>
                  </div>
                  <label className="field">
                    <span>Observaciones</span>
                    <input defaultValue={plantilla.observaciones ?? ""} name="observaciones" type="text" />
                  </label>
                  <div className="form-actions">
                    <SubmitButton idleLabel="Guardar plantilla" pendingLabel="Guardando..." />
                  </div>
                </form>
              </article>
            ))}
          </div>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Historial general</h2>
            <p>Bandeja operativa de comunicaciones registradas sobre toda la base de abonados.</p>
          </div>
        </div>
        <DataTable
          columns={["Fecha", "Abonado", "Titular", "Canal", "Tipo", "Asunto", "Estado", "Oficina virtual", "Acciones"]}
          rows={rows}
          emptyMessage="Todavia no hay comunicaciones registradas."
        />
      </article>
    </section>
  );
}
