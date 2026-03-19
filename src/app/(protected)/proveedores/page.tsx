import { createProveedorAction, updateProveedorAction } from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getProveedoresData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function ProveedoresPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    condicionIva: getQueryValue(params, "condicionIva"),
    activo: getQueryValue(params, "activo"),
    localidad: getQueryValue(params, "localidad"),
  };

  const { proveedores, summary, ivaConditions } = await getProveedoresData(filters);
  const exportParams = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const rows = proveedores.map((proveedor) => [
    proveedor.razonSocial,
    proveedor.cuit ?? "-",
    proveedor.condicionIva,
    proveedor.localidad ?? "-",
    proveedor.telefono ?? "-",
    <StatusPill key={`estado-${proveedor.id}`} tone={proveedor.activo ? "success" : "warning"}>
      {proveedor.activo ? "ACTIVO" : "INACTIVO"}
    </StatusPill>,
    proveedor.compras.length > 0
      ? proveedor.compras
          .map(
            (compra) =>
              `${formatDate(compra.fecha.toISOString())} ${compra.comprobante ?? `COMPRA-${compra.id}`} ${formatCurrency(
                Number(compra.total),
              )}`,
          )
          .join(" / ")
      : "Sin compras recientes",
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Padron comercial</span>
            <h1>Proveedores</h1>
            <p>
              Centraliza datos fiscales y de contacto del abastecimiento para vincular compras,
              reportes y control administrativo con mejor trazabilidad.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Proveedores</span>
              <strong>{summary.total}</strong>
              <p>Total visible con el filtro actual.</p>
            </article>
            <article className="metric-card">
              <span>Activos</span>
              <strong>{summary.activos}</strong>
              <p>Padron disponible para nuevas compras.</p>
            </article>
            <article className="metric-card">
              <span>Compras ligadas</span>
              <strong>{summary.comprasAsociadas}</strong>
              <p>Comprobantes recientes vinculados al padron.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros</h2>
            <p>Busca por razon social, CUIT, localidad o condicion IVA.</p>
          </div>
          <a className="toolbar-button" href={`/api/export/proveedores?${exportParams.toString()}`}>
            Exportar CSV
          </a>
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda general</span>
              <input defaultValue={filters.q} name="q" placeholder="Razon social, CUIT o email" type="search" />
            </label>
            <label className="field">
              <span>Condicion IVA</span>
              <select defaultValue={filters.condicionIva} name="condicionIva">
                <option value="">Todas</option>
                {ivaConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estado</span>
              <select defaultValue={filters.activo} name="activo">
                <option value="">Todos</option>
                <option value="SI">Activos</option>
                <option value="NO">Inactivos</option>
              </select>
            </label>
            <label className="field">
              <span>Localidad</span>
              <input defaultValue={filters.localidad} name="localidad" type="text" />
            </label>
          </div>
          <div className="toolbar__actions">
            <button className="toolbar-button" type="submit">
              Filtrar
            </button>
            <a className="toolbar-button" href="/proveedores">
              Limpiar
            </a>
          </div>
        </form>
      </article>

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Nuevo proveedor</h2>
              <p>Alta fiscal y comercial para empezar a vincular compras.</p>
            </div>
          </div>
          <form action={createProveedorAction} className="form-panel">
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Razon social</span>
                <input name="razonSocial" required type="text" />
              </label>
              <label className="field">
                <span>Nombre fantasia</span>
                <input name="nombreFantasia" type="text" />
              </label>
              <label className="field">
                <span>CUIT</span>
                <input name="cuit" type="text" />
              </label>
              <label className="field">
                <span>Condicion IVA</span>
                <select name="condicionIva" required>
                  {ivaConditions.map((condition) => (
                    <option key={condition} value={condition}>
                      {condition}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" />
              </label>
              <label className="field">
                <span>Telefono</span>
                <input name="telefono" type="text" />
              </label>
              <label className="field">
                <span>Direccion</span>
                <input name="direccion" type="text" />
              </label>
              <label className="field">
                <span>Localidad</span>
                <input name="localidad" type="text" />
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Provincia</span>
                <input name="provincia" type="text" />
              </label>
              <label className="field field--span-3">
                <span>Observaciones</span>
                <textarea name="observaciones" rows={3} />
              </label>
              <div className="form-actions">
                <SubmitButton idleLabel="Crear proveedor" pendingLabel="Guardando..." />
              </div>
            </div>
          </form>
        </article>

        <article className="card card--soft">
          <div className="section-heading">
            <div>
              <h2>Uso dentro del sistema</h2>
              <p>Este padron ordena compras y mejora reportes de abastecimiento.</p>
            </div>
          </div>
          <ul className="check-list">
            <li>Permite asociar compras a un proveedor concreto y no a texto libre.</li>
            <li>Conserva CUIT y condicion IVA para controles administrativos.</li>
            <li>Mejora filtros, exportaciones y futuros cierres contables.</li>
            <li>Mantiene compatibilidad con compras historicas ya cargadas.</li>
          </ul>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Padron editable</h2>
            <p>Actualiza datos fiscales, contacto y estado sin tocar la base manualmente.</p>
          </div>
        </div>
        <div className="task-list">
          {proveedores.map((proveedor) => (
            <form action={updateProveedorAction} className="form-panel" key={proveedor.id}>
              <input name="proveedorId" type="hidden" value={proveedor.id} />
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Proveedor</span>
                  <h3>{proveedor.razonSocial}</h3>
                  <p>{proveedor.cuit ?? "Sin CUIT registrado"}.</p>
                </div>
                <StatusPill tone={proveedor.activo ? "success" : "warning"}>
                  {proveedor.activo ? "ACTIVO" : "INACTIVO"}
                </StatusPill>
              </div>
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Razon social</span>
                  <input defaultValue={proveedor.razonSocial} name="razonSocial" required type="text" />
                </label>
                <label className="field">
                  <span>Nombre fantasia</span>
                  <input defaultValue={proveedor.nombreFantasia ?? ""} name="nombreFantasia" type="text" />
                </label>
                <label className="field">
                  <span>CUIT</span>
                  <input defaultValue={proveedor.cuit ?? ""} name="cuit" type="text" />
                </label>
                <label className="field">
                  <span>Condicion IVA</span>
                  <select defaultValue={proveedor.condicionIva} name="condicionIva">
                    {ivaConditions.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Email</span>
                  <input defaultValue={proveedor.email ?? ""} name="email" type="email" />
                </label>
                <label className="field">
                  <span>Telefono</span>
                  <input defaultValue={proveedor.telefono ?? ""} name="telefono" type="text" />
                </label>
                <label className="field">
                  <span>Direccion</span>
                  <input defaultValue={proveedor.direccion ?? ""} name="direccion" type="text" />
                </label>
                <label className="field">
                  <span>Localidad</span>
                  <input defaultValue={proveedor.localidad ?? ""} name="localidad" type="text" />
                </label>
              </div>
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Provincia</span>
                  <input defaultValue={proveedor.provincia ?? ""} name="provincia" type="text" />
                </label>
                <label className="field">
                  <span>Activo</span>
                  <select defaultValue={proveedor.activo ? "SI" : "NO"} name="activo">
                    <option value="SI">Si</option>
                    <option value="NO">No</option>
                  </select>
                </label>
                <label className="field field--span-2">
                  <span>Observaciones</span>
                  <textarea defaultValue={proveedor.observaciones ?? ""} name="observaciones" rows={3} />
                </label>
              </div>
              <div className="form-actions">
                <SubmitButton idleLabel="Guardar proveedor" pendingLabel="Guardando..." />
              </div>
            </form>
          ))}
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Resumen rapido</h2>
            <p>Vista consolidada del padron y sus compras recientes.</p>
          </div>
        </div>
        <DataTable
          columns={["Razon social", "CUIT", "Condicion IVA", "Localidad", "Telefono", "Estado", "Compras recientes"]}
          rows={rows}
          emptyMessage="No hay proveedores cargados con estos filtros."
        />
      </article>
    </section>
  );
}
