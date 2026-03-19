import Link from "next/link";
import {
  changeOwnPasswordAction,
  createUsuarioAction,
  resetUsuarioPasswordAction,
  toggleUsuarioActivoAction,
} from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole, requireUser } from "@/lib/auth";
import { getUsuariosData } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function UsuariosPage({ searchParams }: PageProps) {
  const session = await requireUser();
  await requireRole(["ADMIN"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = typeof params?.ok === "string" ? params.ok : undefined;
  const error = typeof params?.error === "string" ? params.error : undefined;
  const query = typeof params?.q === "string" ? params.q.trim() : "";
  const { usuarios, currentUser } = await getUsuariosData(session.id, query);
  const activos = usuarios.filter((usuario) => usuario.activo).length;
  const admins = usuarios.filter((usuario) => usuario.rol === "ADMIN").length;

  const rows = usuarios.map((usuario) => [
    usuario.nombre,
    usuario.email,
    <StatusPill key={`rol-${usuario.id}`} tone={usuario.rol === "ADMIN" ? "info" : "neutral"}>
      {usuario.rol}
    </StatusPill>,
    <StatusPill key={`estado-${usuario.id}`} tone={usuario.activo ? "success" : "warning"}>
      {usuario.activo ? "ACTIVO" : "INACTIVO"}
    </StatusPill>,
    usuario.lastLoginAt ? formatDateTime(usuario.lastLoginAt.toISOString()) : "Nunca",
    formatDateTime(usuario.createdAt.toISOString()),
    <form action={toggleUsuarioActivoAction} key={`toggle-usuario-${usuario.id}`}>
      <input name="usuarioId" type="hidden" value={usuario.id} />
      <button className="table-action table-action--neutral" type="submit">
        {usuario.activo ? "Desactivar" : "Activar"}
      </button>
    </form>,
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Accesos internos</span>
            <h1>Usuarios</h1>
            <p>
              Crea usuarios internos, resetea claves y administra permisos desde una pantalla
              unica, sin intervenciones manuales sobre la base.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Usuarios activos</span>
              <strong>{activos}</strong>
              <p>Personal con acceso disponible al sistema.</p>
            </article>
            <article className="metric-card">
              <span>Administradores</span>
              <strong>{admins}</strong>
              <p>Perfiles con permisos completos.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <form className="toolbar">
        <div className="toolbar__group">
          <label className="field">
            <span>Buscar usuario</span>
            <input defaultValue={query} name="q" placeholder="Nombre, email o rol" type="search" />
          </label>
        </div>
        <div className="toolbar__actions">
          <button className="toolbar-button" type="submit">
            Filtrar
          </button>
          <Link className="toolbar-button" href="/usuarios">
            Limpiar
          </Link>
        </div>
      </form>

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Nuevo usuario interno</h2>
              <p>Alta rapida para administracion, caja o soporte tecnico.</p>
            </div>
          </div>
          <form action={createUsuarioAction} className="form-panel">
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Nombre</span>
                <input name="nombre" placeholder="Pedro Acosta" required type="text" />
              </label>
              <label className="field">
                <span>Email</span>
                <input name="email" placeholder="pedro@coop.local" required type="email" />
              </label>
              <label className="field">
                <span>Rol</span>
                <select defaultValue="CAJA" name="rol" required>
                  <option value="ADMIN">Admin</option>
                  <option value="CAJA">Caja</option>
                  <option value="TECNICO">Tecnico</option>
                </select>
              </label>
              <label className="field">
                <span>Contrasena inicial</span>
                <input name="password" placeholder="Clave inicial" required type="password" />
              </label>
            </div>
            <div className="form-actions">
              <SubmitButton idleLabel="Crear usuario" pendingLabel="Creando usuario..." />
            </div>
          </form>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Resetear contrasena</h2>
              <p>Solo administradores pueden redefinir claves de otros usuarios.</p>
            </div>
          </div>
          <form action={resetUsuarioPasswordAction} className="form-panel">
            <div className="form-grid form-grid--2">
              <label className="field">
                <span>Usuario</span>
                <select defaultValue="" name="usuarioId" required>
                  <option value="">Seleccionar usuario</option>
                  {usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.nombre} ({usuario.rol})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Nueva contrasena</span>
                <input name="nuevaPassword" placeholder="Nueva clave" required type="password" />
              </label>
            </div>
            <div className="form-actions">
              <SubmitButton idleLabel="Resetear contrasena" pendingLabel="Actualizando..." />
            </div>
          </form>
        </article>
      </section>

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Mi contrasena</h2>
              <p>
                Usuario actual: {currentUser?.nombre ?? session.nombre} ({currentUser?.rol ?? session.rol})
              </p>
            </div>
          </div>
          <form action={changeOwnPasswordAction} className="form-panel">
            <div className="form-grid form-grid--3">
              <label className="field">
                <span>Contrasena actual</span>
                <input name="currentPassword" required type="password" />
              </label>
              <label className="field">
                <span>Nueva contrasena</span>
                <input name="newPassword" required type="password" />
              </label>
              <label className="field">
                <span>Confirmar nueva</span>
                <input name="confirmPassword" required type="password" />
              </label>
            </div>
            <div className="form-actions">
              <SubmitButton idleLabel="Cambiar mi contrasena" pendingLabel="Guardando..." />
            </div>
          </form>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Usuarios actuales</h2>
              <p>{usuarios.length} usuarios internos visibles.</p>
            </div>
          </div>
          <DataTable
            columns={["Nombre", "Email", "Rol", "Estado", "Ultimo acceso", "Creado", "Accion"]}
            rows={rows}
            emptyMessage="No hay usuarios que coincidan con la busqueda actual."
          />
        </article>
      </section>
    </section>
  );
}
