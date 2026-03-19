import Link from "next/link";
import { adjustMaterialStockAction, createMaterialAction, updateMaterialAction } from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getStockData } from "@/lib/data";
import { formatCurrency, formatDateTime, formatDecimal } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function StockPage({ searchParams }: PageProps) {
  const user = await requireRole(["ADMIN", "TECNICO"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    categoria: getQueryValue(params, "categoria"),
    bajoStock: getQueryValue(params, "bajoStock"),
  };

  const { materiales, movimientos, summary } = await getStockData(filters);
  const categorias = Array.from(new Set(materiales.map((material) => material.categoria))).sort();

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const materialRows = materiales.map((material) => {
    const bajoStock = Number(material.stockActual) <= Number(material.stockMinimo);

    return [
      material.codigo,
      material.nombre,
      material.categoria,
      material.unidad,
      formatDecimal(Number(material.stockActual)),
      formatDecimal(Number(material.stockMinimo)),
      formatCurrency(Number(material.costoPromedio)),
      formatCurrency(Number(material.precioFacturable ?? 0)),
      <StatusPill key={`stock-${material.id}`} tone={bajoStock ? "danger" : "success"}>
        {bajoStock ? "BAJO MINIMO" : "OK"}
      </StatusPill>,
      <StatusPill key={`activo-${material.id}`} tone={material.facturable ? "info" : "warning"}>
        {material.facturable ? "FACTURABLE" : "INTERNO"}
      </StatusPill>,
    ];
  });

  const movimientoRows = movimientos.map((movimiento) => [
    formatDateTime(movimiento.createdAt.toISOString()),
    movimiento.material.codigo,
    movimiento.material.nombre,
    movimiento.tipo,
    formatDecimal(Number(movimiento.cantidad)),
    formatCurrency(Number(movimiento.costoUnitario ?? 0)),
    movimiento.compra?.proveedor ?? movimiento.descripcion ?? "-",
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Inventario tecnico</span>
            <h1>Stock y materiales</h1>
            <p>
              El inventario ya alimenta reclamos, compras y cargos tecnicos para que cada consumo
              tenga trazabilidad y pueda impactar en la proxima facturacion.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Materiales visibles</span>
              <strong>{summary.totalMateriales}</strong>
              <p>Catalogo filtrado segun la busqueda actual.</p>
            </article>
            <article className="metric-card">
              <span>Bajo stock</span>
              <strong>{summary.materialesBajoStock}</strong>
              <p>Items que ya tocaron o perforaron el minimo definido.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros de inventario</h2>
            <p>Busca por codigo, material, categoria o alerta de stock minimo.</p>
          </div>
          {user.rol === "ADMIN" ? (
            <Link className="toolbar-button" href="/compras">
              Ir a compras
            </Link>
          ) : null}
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda general</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="Codigo, material, categoria u observaciones"
                type="search"
              />
            </label>
            <label className="field">
              <span>Categoria</span>
              <select defaultValue={filters.categoria} name="categoria">
                <option value="">Todas</option>
                {categorias.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Solo bajo stock</span>
              <select defaultValue={filters.bajoStock} name="bajoStock">
                <option value="">No</option>
                <option value="SI">Si</option>
              </select>
            </label>
            <div className="toolbar__actions">
              <button className="toolbar-button" type="submit">
                Filtrar
              </button>
              <Link className="toolbar-button" href="/stock">
                Limpiar
              </Link>
              <a className="toolbar-button" href={`/api/export/stock?${exportParams.toString()}`}>
                Exportar CSV
              </a>
            </div>
          </div>
        </form>
      </article>

      {user.rol === "ADMIN" ? (
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Alta de material</h2>
              <p>Disponible para compras, stock, soporte tecnico y cargos facturables.</p>
            </div>
          </div>
          <form action={createMaterialAction} className="form-panel">
            <input name="redirectTo" type="hidden" value="/stock" />
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Codigo</span>
                <input name="codigo" placeholder="CABLE-UTP-CAT6" required type="text" />
              </label>
              <label className="field">
                <span>Nombre</span>
                <input name="nombre" placeholder="Cable UTP CAT6 x metro" required type="text" />
              </label>
              <label className="field">
                <span>Categoria</span>
                <input name="categoria" placeholder="Red / TV / Agua / Nichos" required type="text" />
              </label>
              <label className="field">
                <span>Unidad</span>
                <input defaultValue="UN" name="unidad" type="text" />
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Stock minimo</span>
                <input defaultValue="0" name="stockMinimo" required type="text" />
              </label>
              <label className="field">
                <span>Precio facturable</span>
                <input name="precioFacturable" placeholder="3200" type="text" />
              </label>
              <label className="field">
                <span>Alicuota IVA</span>
                <input defaultValue="21" name="ivaAlicuota" required type="text" />
              </label>
              <label className="field">
                <span>Facturable</span>
                <div className="field__value">
                  <input defaultChecked name="facturable" type="checkbox" value="SI" />
                </div>
              </label>
            </div>
            <label className="field">
              <span>Observaciones</span>
              <textarea name="observaciones" placeholder="Notas internas del item" rows={3} />
            </label>
            <div className="form-actions">
              <SubmitButton idleLabel="Crear material" pendingLabel="Creando material..." />
            </div>
          </form>
        </article>
      ) : null}

      {user.rol === "ADMIN" && materiales.length > 0 ? (
        <section className="split-grid split-grid--equal">
          <article className="card">
            <div className="section-heading">
              <div>
                <h2>Ajuste manual de stock</h2>
                <p>Corrige diferencias de inventario y deja trazabilidad en movimientos.</p>
              </div>
            </div>
            <form action={adjustMaterialStockAction} className="form-panel">
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Material</span>
                  <select defaultValue="" name="materialId" required>
                    <option value="">Seleccionar material</option>
                    {materiales.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.codigo} - {material.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Ajuste cantidad</span>
                  <input name="ajusteCantidad" placeholder="10 o -3" required type="text" />
                </label>
                <label className="field">
                  <span>Descripcion</span>
                  <input name="descripcion" placeholder="Regularizacion por conteo" type="text" />
                </label>
                <div className="form-actions">
                  <SubmitButton idleLabel="Aplicar ajuste" pendingLabel="Aplicando..." />
                </div>
              </div>
            </form>
          </article>

          <article className="card card--soft">
            <div className="section-heading">
              <div>
                <h2>Mantenimiento rapido</h2>
                <p>Control del catalogo tecnico desde el modulo de inventario.</p>
              </div>
            </div>
            <ul className="check-list">
              <li>Editar nombre, categoria, unidad y precio facturable.</li>
              <li>Definir si el insumo es facturable o de uso interno.</li>
              <li>Marcar materiales inactivos sin borrar historial.</li>
              <li>Corregir stock con movimiento de ajuste manual.</li>
            </ul>
          </article>
        </section>
      ) : null}

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Catalogo de materiales</h2>
              <p>Inventario valorizado estimado: {formatCurrency(summary.valorizadoEstimado)}</p>
            </div>
          </div>
          <DataTable
            columns={[
              "Codigo",
              "Material",
              "Categoria",
              "Unidad",
              "Stock",
              "Minimo",
              "Costo",
              "Precio",
              "Alerta",
              "Uso",
            ]}
            rows={materialRows}
            emptyMessage="No hay materiales para mostrar con este filtro."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Ultimos movimientos</h2>
              <p>{movimientos.length} movimientos recientes de stock.</p>
            </div>
          </div>
          <DataTable
            columns={["Fecha", "Codigo", "Material", "Tipo", "Cantidad", "Costo", "Referencia"]}
            rows={movimientoRows}
            emptyMessage="No hay movimientos recientes para mostrar."
          />
        </article>
      </section>

      {user.rol === "ADMIN" && materiales.length > 0 ? (
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Editar materiales</h2>
              <p>Mantenimiento de catalogo, precio y estados directamente desde stock.</p>
            </div>
          </div>
          <div className="task-list">
            {materiales.map((material) => (
              <form action={updateMaterialAction} className="form-panel" key={`stock-edit-${material.id}`}>
                <input name="materialId" type="hidden" value={material.id} />
                <input name="redirectTo" type="hidden" value="/stock" />
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Catalogo tecnico</span>
                    <h3>{material.nombre}</h3>
                    <p>
                      {material.codigo} / stock actual {formatDecimal(Number(material.stockActual))}
                    </p>
                  </div>
                  <StatusPill tone={material.activo ? "success" : "warning"}>
                    {material.activo ? "ACTIVO" : "INACTIVO"}
                  </StatusPill>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Codigo</span>
                    <input defaultValue={material.codigo} name="codigo" required type="text" />
                  </label>
                  <label className="field">
                    <span>Nombre</span>
                    <input defaultValue={material.nombre} name="nombre" required type="text" />
                  </label>
                  <label className="field">
                    <span>Categoria</span>
                    <input defaultValue={material.categoria} name="categoria" required type="text" />
                  </label>
                  <label className="field">
                    <span>Unidad</span>
                    <input defaultValue={material.unidad} name="unidad" type="text" />
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Stock minimo</span>
                    <input defaultValue={String(Number(material.stockMinimo))} name="stockMinimo" required type="text" />
                  </label>
                  <label className="field">
                    <span>Precio facturable</span>
                    <input defaultValue={material.precioFacturable ? String(Number(material.precioFacturable)) : ""} name="precioFacturable" type="text" />
                  </label>
                  <label className="field">
                    <span>Alicuota IVA</span>
                    <input defaultValue={String(Number(material.ivaAlicuota))} name="ivaAlicuota" required type="text" />
                  </label>
                  <label className="field">
                    <span>Facturable</span>
                    <select defaultValue={material.facturable ? "SI" : "NO"} name="facturable">
                      <option value="SI">Si</option>
                      <option value="NO">No</option>
                    </select>
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Activo</span>
                    <select defaultValue={material.activo ? "SI" : "NO"} name="activo">
                      <option value="SI">Si</option>
                      <option value="NO">No</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Observaciones</span>
                    <textarea defaultValue={material.observaciones ?? ""} name="observaciones" rows={3} />
                  </label>
                  <div className="form-actions">
                    <SubmitButton idleLabel="Guardar material" pendingLabel="Guardando..." />
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
