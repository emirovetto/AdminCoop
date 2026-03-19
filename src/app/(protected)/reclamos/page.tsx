import Link from "next/link";
import {
  addReclamoMaterialAction,
  createReclamoAction,
  resolveReclamoAction,
} from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { SERVICE_CATEGORIES } from "@/lib/domain";
import { getReclamosData } from "@/lib/data";
import { formatCurrency, formatDateTime, formatDecimal } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function ReclamosPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    estado: getQueryValue(params, "estado"),
    prioridad: getQueryValue(params, "prioridad"),
    tecnicoId: getQueryValue(params, "tecnicoId"),
    abonadoId: getQueryValue(params, "abonadoId"),
    tipoServicio: getQueryValue(params, "tipoServicio"),
    localidad: getQueryValue(params, "localidad"),
    cargoFacturable: getQueryValue(params, "cargoFacturable"),
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
  };

  const { reclamos, abonados, tecnicos, materiales } = await getReclamosData(filters);
  const abiertos = reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO").length;
  const criticos = reclamos.filter((reclamo) => reclamo.prioridad === "ALTA").length;
  const cargosPendientes = reclamos.reduce(
    (sum, reclamo) =>
      sum +
      reclamo.materiales.filter((material) => material.facturarProximaFactura && !material.facturado).length,
    0,
  );
  const reclamosAbiertos = reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO");

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const rows = reclamos.map((reclamo) => {
    const titular =
      reclamo.abonado.razonSocial ||
      [reclamo.abonado.apellido, reclamo.abonado.nombre].filter(Boolean).join(" ") ||
      reclamo.abonado.numeroAbonado;

    const materialesResumen =
      reclamo.materiales.length > 0
        ? reclamo.materiales
            .map((material) => {
              const extra = material.facturarProximaFactura
                ? ` / prox. factura ${formatCurrency(
                    Number(material.precioFacturable ?? material.costoUnitario) * Number(material.cantidad),
                  )}`
                : "";
              return `${material.material.nombre} x ${formatDecimal(Number(material.cantidad))}${extra}`;
            })
            .join(" | ")
        : "Sin materiales";

    return [
      `#${reclamo.id}`,
      `${reclamo.abonado.numeroAbonado} - ${titular}`,
      reclamo.abonado.localidad,
      reclamo.tipoServicio,
      <StatusPill
        key={`prioridad-${reclamo.id}`}
        tone={
          reclamo.prioridad === "ALTA"
            ? "danger"
            : reclamo.prioridad === "MEDIA"
              ? "warning"
              : "info"
        }
      >
        {reclamo.prioridad}
      </StatusPill>,
      <StatusPill
        key={`estado-${reclamo.id}`}
        tone={
          reclamo.estado === "RESUELTO"
            ? "success"
            : reclamo.estado === "EN_PROCESO"
              ? "info"
              : "warning"
        }
      >
        {reclamo.estado}
      </StatusPill>,
      reclamo.tecnico?.nombre ?? "Sin asignar",
      formatDateTime(reclamo.fechaApertura.toISOString()),
      materialesResumen,
      reclamo.resolucionCierre ?? "-",
    ];
  });

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Mesa tecnica</span>
            <h1>Reclamos con historial tecnico y cargos asociados</h1>
            <p>
              Cada ticket queda en la ficha del abonado, permite registrar diagnostico, resolucion
              y materiales usados, y puede enviar esos consumos a la proxima facturacion.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Abiertos</span>
              <strong>{abiertos}</strong>
              <p>Tickets que todavia requieren atencion o cierre tecnico.</p>
            </article>
            <article className="metric-card">
              <span>Cargos pendientes</span>
              <strong>{cargosPendientes}</strong>
              <p>Materiales marcados para pasar a la proxima factura.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros y reportes</h2>
            <p>{reclamos.length} tickets visibles con el filtro actual.</p>
          </div>
          <Link className="toolbar-button" href="/stock">
            Ver stock
          </Link>
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda general</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="Abonado, tecnico, descripcion, diagnostico o resolucion"
                type="search"
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select defaultValue={filters.estado} name="estado">
                <option value="">Todos</option>
                <option value="ABIERTO">Abierto</option>
                <option value="EN_PROCESO">En proceso</option>
                <option value="RESUELTO">Resuelto</option>
              </select>
            </label>
            <label className="field">
              <span>Prioridad</span>
              <select defaultValue={filters.prioridad} name="prioridad">
                <option value="">Todas</option>
                <option value="BAJA">Baja</option>
                <option value="MEDIA">Media</option>
                <option value="ALTA">Alta</option>
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
              <span>Servicio</span>
              <select defaultValue={filters.tipoServicio} name="tipoServicio">
                <option value="">Todos</option>
                {SERVICE_CATEGORIES.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Localidad</span>
              <input defaultValue={filters.localidad} name="localidad" type="text" />
            </label>
            <label className="field">
              <span>Cargos</span>
              <select defaultValue={filters.cargoFacturable} name="cargoFacturable">
                <option value="">Todos</option>
                <option value="PENDIENTE_FACTURACION">Pendiente de facturar</option>
                <option value="CON_MATERIALES">Con materiales</option>
                <option value="SIN_MATERIALES">Sin materiales</option>
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
              <Link className="toolbar-button" href="/reclamos">
                Limpiar
              </Link>
              <a className="toolbar-button" href={`/api/export/reclamos?${exportParams.toString()}`}>
                Exportar CSV
              </a>
            </div>
          </div>
        </form>
      </article>

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Abrir nuevo reclamo</h2>
              <p>{criticos} casos de prioridad alta en la vista actual.</p>
            </div>
          </div>
          <form action={createReclamoAction} className="form-panel">
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Abonado</span>
                <select defaultValue="" name="abonadoId" required>
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
                <span>Servicio</span>
                <select defaultValue="INTERNET" name="tipoServicio" required>
                  <option value="INTERNET">Internet</option>
                  <option value="TV">TV</option>
                  <option value="AGUA_POTABLE">Agua potable</option>
                  <option value="TELEFONIA">Telefonia</option>
                  <option value="IPTV">IPTV</option>
                  <option value="NICHOS">Nichos</option>
                  <option value="OTROS">Otros</option>
                </select>
              </label>
              <label className="field">
                <span>Prioridad</span>
                <select defaultValue="MEDIA" name="prioridad" required>
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                </select>
              </label>
              <label className="field">
                <span>Tecnico asignado</span>
                <select defaultValue="" name="tecnicoId">
                  <option value="">Sin asignar</option>
                  {tecnicos.map((tecnico) => (
                    <option key={tecnico.id} value={tecnico.id}>
                      {tecnico.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Descripcion</span>
              <textarea
                name="descripcion"
                placeholder="Describe el inconveniente, domicilio, antecedentes o urgencia"
                required
                rows={4}
              />
            </label>
            <div className="form-actions">
              <SubmitButton idleLabel="Registrar reclamo" pendingLabel="Registrando..." />
            </div>
          </form>
        </article>

        <article className="card card--soft">
          <div className="section-heading">
            <div>
              <h2>Proceso tecnico</h2>
              <p>El cierre del ticket deja rastro completo en el historial del abonado.</p>
            </div>
          </div>
          <ul className="check-list">
            <li>El reclamo queda vinculado al abonado y a su servicio afectado.</li>
            <li>Se puede descontar material desde stock durante la atencion.</li>
            <li>El tecnico informa diagnostico y resolucion al cierre.</li>
            <li>Los materiales consumidos pueden cobrarse en la proxima factura.</li>
          </ul>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Tickets operativos</h2>
            <p>Vista historica y exportable con materiales y resoluciones.</p>
          </div>
        </div>
        <DataTable
          columns={[
            "Ticket",
            "Abonado",
            "Localidad",
            "Servicio",
            "Prioridad",
            "Estado",
            "Tecnico",
            "Apertura",
            "Materiales / cargos",
            "Resolucion",
          ]}
          rows={rows}
          emptyMessage="No hay reclamos para mostrar con los filtros actuales."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Gestion tecnica por ticket</h2>
            <p>
              Agrega materiales usados y cierra cada reclamo con diagnostico y resolucion tecnica.
            </p>
          </div>
        </div>
        {reclamosAbiertos.length > 0 ? (
          <div className="task-list">
            {reclamosAbiertos.map((reclamo) => {
              const titular =
                reclamo.abonado.razonSocial ||
                [reclamo.abonado.apellido, reclamo.abonado.nombre].filter(Boolean).join(" ") ||
                reclamo.abonado.numeroAbonado;

              return (
                <article className="card card--soft" key={reclamo.id}>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Ticket #{reclamo.id}</span>
                      <h3>
                        {reclamo.abonado.numeroAbonado} - {titular}
                      </h3>
                      <p>
                        {reclamo.tipoServicio} / {reclamo.prioridad} / tecnico:{" "}
                        {reclamo.tecnico?.nombre ?? "Sin asignar"}
                      </p>
                    </div>
                    <StatusPill tone={reclamo.estado === "EN_PROCESO" ? "info" : "warning"}>
                      {reclamo.estado}
                    </StatusPill>
                  </div>

                  <div className="form-grid form-grid--2">
                    <form action={addReclamoMaterialAction} className="form-panel form-panel--dense">
                      <input name="reclamoId" type="hidden" value={reclamo.id} />
                      <div className="form-grid form-grid--4">
                        <label className="field">
                          <span>Material</span>
                          <select defaultValue="" name="materialId" required>
                            <option value="">Seleccionar material</option>
                            {materiales.map((material) => (
                              <option key={material.id} value={material.id}>
                                {material.codigo} - {material.nombre} (stock {Number(material.stockActual)})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Cantidad</span>
                          <input defaultValue="1" name="cantidad" required type="text" />
                        </label>
                        <label className="field">
                          <span>Precio prox. factura</span>
                          <input name="precioFacturable" placeholder="Opcional" type="text" />
                        </label>
                        <label className="field">
                          <span>Facturar en proxima</span>
                          <div className="field__value">
                            <input name="facturarProximaFactura" type="checkbox" value="SI" />
                          </div>
                        </label>
                      </div>
                      <div className="form-actions">
                        <SubmitButton idleLabel="Agregar material" pendingLabel="Descontando..." />
                      </div>
                    </form>

                    <form action={resolveReclamoAction} className="form-panel form-panel--dense">
                      <input name="reclamoId" type="hidden" value={reclamo.id} />
                      <label className="field">
                        <span>Diagnostico</span>
                        <textarea name="diagnosticoCierre" placeholder="Falla detectada" required rows={3} />
                      </label>
                      <label className="field">
                        <span>Resolucion</span>
                        <textarea
                          name="resolucionCierre"
                          placeholder="Trabajo realizado, instalacion o reemplazo efectuado"
                          required
                          rows={3}
                        />
                      </label>
                      <div className="form-actions">
                        <SubmitButton idleLabel="Cerrar ticket" pendingLabel="Cerrando..." />
                      </div>
                    </form>
                  </div>

                  <div className="field field--readOnly">
                    <span>Materiales ya cargados</span>
                    <div className="field__value">
                      {reclamo.materiales.length > 0
                        ? reclamo.materiales
                            .map((material) => {
                              const monto = Number(material.precioFacturable ?? material.costoUnitario);
                              return `${material.material.nombre} x ${formatDecimal(Number(material.cantidad))} (${material.facturarProximaFactura ? `facturar ${formatCurrency(monto * Number(material.cantidad))}` : "uso interno"})`;
                            })
                            .join(" | ")
                        : "Todavia no hay materiales asociados a este ticket."}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="field field--readOnly">
            <span>Gestion tecnica</span>
            <div className="field__value">No hay tickets abiertos para operar en este momento.</div>
          </div>
        )}
      </article>
    </section>
  );
}
