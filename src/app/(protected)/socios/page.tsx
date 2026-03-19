import Link from "next/link";
import { createSocioAction, toggleSocioStatusAction, updateSocioAction } from "@/app/actions";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { DataTable } from "@/components/shared/data-table";
import { requireRole } from "@/lib/auth";
import { getSociosData } from "@/lib/data";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function SociosPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = typeof params?.ok === "string" ? params.ok : undefined;
  const error = typeof params?.error === "string" ? params.error : undefined;
  const query = typeof params?.q === "string" ? params.q.trim() : "";
  const socios = await getSociosData(query);
  const activos = socios.filter((socio) => socio.estado === "ACTIVO").length;
  const inactivos = socios.length - activos;
  const rows = socios.map((socio) => [
    `${socio.apellido}, ${socio.nombre}`,
    socio.dni,
    socio.email ?? "-",
    socio.telefono ?? "-",
    formatDate(socio.fechaAlta.toISOString()),
    <StatusPill key={`estado-${socio.id}`} tone={socio.estado === "ACTIVO" ? "success" : "warning"}>
      {socio.estado}
    </StatusPill>,
    <form action={toggleSocioStatusAction} key={`toggle-socio-${socio.id}`}>
      <input name="socioId" type="hidden" value={socio.id} />
      <button className="table-action table-action--neutral" type="submit">
        {socio.estado === "ACTIVO" ? "Desactivar" : "Activar"}
      </button>
    </form>,
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Modulo base</span>
            <h1>Socios</h1>
            <p>
              Padron principal para altas, consultas administrativas y vinculacion posterior con
              abonados y servicios.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Registros visibles</span>
              <strong>{socios.length}</strong>
              <p>Listado cargado con el filtro actual.</p>
            </article>
            <article className="metric-card">
              <span>Socios activos</span>
              <strong>{activos}</strong>
              <p>Disponibles para operar y asociar servicios.</p>
            </article>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Padron actual</h2>
            <p>
              {socios.length} resultados, {activos} activos y {inactivos} inactivos.
            </p>
          </div>
        </div>
        <FeedbackBanner message={ok} tone="success" />
        <FeedbackBanner message={error} tone="error" />
        <form className="toolbar">
          <div className="toolbar__group">
            <label className="field">
              <span>Buscar en padron</span>
              <input
                defaultValue={query}
                name="q"
                placeholder="Nombre, apellido, DNI, email o telefono"
                type="search"
              />
            </label>
          </div>
          <div className="toolbar__actions">
            <button className="toolbar-button" type="submit">
              Filtrar
            </button>
            <Link className="toolbar-button" href="/socios">
              Limpiar
            </Link>
            <a className="toolbar-button" href={`/api/export/socios${query ? `?q=${encodeURIComponent(query)}` : ""}`}>
              Exportar CSV
            </a>
          </div>
        </form>
        <form action={createSocioAction} className="form-panel">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Nombre</span>
              <input name="nombre" placeholder="Ana" required type="text" />
            </label>
            <label className="field">
              <span>Apellido</span>
              <input name="apellido" placeholder="Ruiz" required type="text" />
            </label>
            <label className="field">
              <span>DNI</span>
              <input name="dni" placeholder="28111222" required type="text" />
            </label>
            <label className="field">
              <span>Telefono</span>
              <input name="telefono" placeholder="3704-555101" type="text" />
            </label>
          </div>
          <div className="form-grid form-grid--2">
            <label className="field">
              <span>Email</span>
              <input name="email" placeholder="persona@correo.com" type="email" />
            </label>
            <div className="form-actions">
              <SubmitButton idleLabel="Crear socio" pendingLabel="Creando socio..." />
            </div>
          </div>
        </form>
        <DataTable
          columns={["Socio", "DNI", "Email", "Telefono", "Alta", "Estado", "Accion"]}
          rows={rows}
          emptyMessage="No hay socios que coincidan con la busqueda actual."
        />
      </article>

      {socios.length > 0 ? (
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Editar socios</h2>
              <p>Correccion rapida de datos padronales y estado sin salir del modulo.</p>
            </div>
          </div>
          <div className="task-list">
            {socios.map((socio) => (
              <form action={updateSocioAction} className="form-panel" key={`edit-socio-${socio.id}`}>
                <input name="socioId" type="hidden" value={socio.id} />
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Padron</span>
                    <h3>
                      {socio.apellido}, {socio.nombre}
                    </h3>
                    <p>Alta: {formatDate(socio.fechaAlta.toISOString())}</p>
                  </div>
                  <StatusPill tone={socio.estado === "ACTIVO" ? "success" : "warning"}>
                    {socio.estado}
                  </StatusPill>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Nombre</span>
                    <input defaultValue={socio.nombre} name="nombre" required type="text" />
                  </label>
                  <label className="field">
                    <span>Apellido</span>
                    <input defaultValue={socio.apellido} name="apellido" required type="text" />
                  </label>
                  <label className="field">
                    <span>DNI</span>
                    <input defaultValue={socio.dni} name="dni" required type="text" />
                  </label>
                  <label className="field">
                    <span>Estado</span>
                    <select defaultValue={socio.estado} name="estado">
                      <option value="ACTIVO">Activo</option>
                      <option value="INACTIVO">Inactivo</option>
                    </select>
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Email</span>
                    <input defaultValue={socio.email ?? ""} name="email" type="email" />
                  </label>
                  <label className="field">
                    <span>Telefono</span>
                    <input defaultValue={socio.telefono ?? ""} name="telefono" type="text" />
                  </label>
                  <div className="form-actions">
                    <SubmitButton idleLabel="Guardar socio" pendingLabel="Guardando..." />
                  </div>
                </div>
              </form>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
