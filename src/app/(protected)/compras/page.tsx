import Link from "next/link";
import { cancelCompraAction, registerCompraAction } from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getComprasData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function ComprasPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    proveedor: getQueryValue(params, "proveedor"),
    proveedorId: getQueryValue(params, "proveedorId"),
    materialId: getQueryValue(params, "materialId"),
    estado: getQueryValue(params, "estado"),
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
  };

  const { compras, materiales, proveedores, summary } = await getComprasData(filters);

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const compraRows = compras.map((compra) => [
    formatDate(compra.fecha.toISOString()),
    compra.proveedorRef?.razonSocial ?? compra.proveedor,
    compra.comprobante ?? "-",
    compra.detalles
      .map(
        (detalle) =>
          `${detalle.material.nombre} x ${Number(detalle.cantidad)} @ ${formatCurrency(Number(detalle.costoUnitario))}`,
      )
      .join(" / "),
    formatCurrency(Number(compra.total)),
    <StatusPill
      key={`compra-estado-${compra.id}`}
      tone={compra.estado === "ANULADA" ? "danger" : "success"}
    >
      {compra.estado}
    </StatusPill>,
    <>
      <div>{compra.observaciones ?? "-"}</div>
      {compra.estado === "ANULADA" ? (
        <small>
          Motivo: {compra.motivoAnulacion ?? "Sin motivo"}{" "}
          {compra.anuladoAt ? `(${formatDate(compra.anuladoAt.toISOString())})` : ""}
        </small>
      ) : null}
    </>,
    compra.estado === "ANULADA" ? (
      <span key={`compra-accion-${compra.id}`}>Anulada</span>
    ) : (
      <form action={cancelCompraAction} className="inline-form" key={`compra-accion-${compra.id}`}>
        <input name="compraId" type="hidden" value={compra.id} />
        <input name="motivoAnulacion" placeholder="Motivo de anulacion" required type="text" />
        <SubmitButton idleLabel="Anular" pendingLabel="Anulando..." />
      </form>
    ),
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Abastecimiento</span>
            <h1>Compras e ingresos a stock</h1>
            <p>
              Cada compra impacta en costos, mueve stock y deja trazabilidad para soporte tecnico y
              futuras facturaciones por materiales utilizados.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Compras visibles</span>
              <strong>{summary.totalCompras}</strong>
              <p>Registros disponibles segun los filtros aplicados.</p>
            </article>
            <article className="metric-card">
              <span>Inversion filtrada</span>
              <strong>{formatCurrency(summary.totalInvertido)}</strong>
              <p>Solo compras vigentes dentro del filtro actual.</p>
            </article>
            <article className="metric-card">
              <span>Anuladas visibles</span>
              <strong>{summary.comprasAnuladas}</strong>
              <p>{formatCurrency(summary.totalAnulado)} revertidos con trazabilidad.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros y reportes de compras</h2>
            <p>Busca por proveedor, comprobante, material, fecha o estado.</p>
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
                placeholder="Proveedor, comprobante o material"
                type="search"
              />
            </label>
            <label className="field">
              <span>Proveedor exacto</span>
              <select defaultValue={filters.proveedorId} name="proveedorId">
                <option value="">Todos</option>
                {proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>
                    {proveedor.razonSocial}
                    {proveedor.cuit ? ` (${proveedor.cuit})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Proveedor</span>
              <input defaultValue={filters.proveedor} name="proveedor" type="text" />
            </label>
            <label className="field">
              <span>Material</span>
              <select defaultValue={filters.materialId} name="materialId">
                <option value="">Todos</option>
                {materiales.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.codigo} - {material.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estado</span>
              <select defaultValue={filters.estado} name="estado">
                <option value="">Todos</option>
                <option value="REGISTRADA">Registrada</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--4">
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
              <Link className="toolbar-button" href="/compras">
                Limpiar
              </Link>
              <a className="toolbar-button" href={`/api/export/compras?${exportParams.toString()}`}>
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
              <h2>Registrar compra</h2>
              <p>Ingresa un comprobante con varios materiales y actualiza el stock en el mismo paso.</p>
            </div>
          </div>
          <form action={registerCompraAction} className="form-panel">
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Proveedor registrado</span>
                <select defaultValue="" name="proveedorId">
                  <option value="">Seleccionar proveedor</option>
                  {proveedores.map((proveedor) => (
                    <option key={proveedor.id} value={proveedor.id}>
                      {proveedor.razonSocial}
                      {proveedor.cuit ? ` (${proveedor.cuit})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Proveedor manual</span>
                <input name="proveedor" placeholder="Solo si aun no esta en el padron" type="text" />
              </label>
              <label className="field">
                <span>Comprobante</span>
                <input name="comprobante" placeholder="FAC A 0001-00012345" type="text" />
              </label>
              <label className="field">
                <span>Fecha</span>
                <input name="fecha" type="date" />
              </label>
              <label className="field">
                <span>Observaciones</span>
                <input name="observaciones" placeholder="Compra para cuadrilla tecnica" type="text" />
              </label>
            </div>
            <div className="task-list">
              {[1, 2, 3, 4].map((linea) => (
                <article className="card card--soft" key={`linea-${linea}`}>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Detalle</span>
                      <h3>Linea {linea}</h3>
                      <p>Completa solo las lineas que correspondan al comprobante.</p>
                    </div>
                  </div>
                  <div className="form-grid form-grid--4">
                    <label className="field">
                      <span>Material</span>
                      <select defaultValue="" name="materialId">
                        <option value="">Seleccionar material</option>
                        {materiales.map((material) => (
                          <option key={`${linea}-${material.id}`} value={material.id}>
                            {material.codigo} - {material.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Cantidad</span>
                      <input name="cantidad" placeholder="10" type="text" />
                    </label>
                    <label className="field">
                      <span>Costo unitario</span>
                      <input name="costoUnitario" placeholder="25000" type="text" />
                    </label>
                  </div>
                </article>
              ))}
            </div>
            <div className="form-actions">
              <SubmitButton idleLabel="Registrar compra" pendingLabel="Registrando..." />
            </div>
          </form>
        </article>

        <article className="card card--soft">
          <div className="section-heading">
            <div>
              <h2>Impacto del circuito</h2>
              <p>La compra ya alimenta procesos encadenados en el resto del sistema.</p>
            </div>
            <Link className="toolbar-button" href="/proveedores">
              Administrar proveedores
            </Link>
          </div>
          <ul className="check-list">
            <li>Sube el stock disponible del material comprado.</li>
            <li>Actualiza el costo promedio usado en reclamos y analisis.</li>
            <li>Permite que los tecnicos descuente materiales al cerrar trabajos.</li>
            <li>Deja listo el cargo para pasar a la proxima factura si corresponde.</li>
            <li>Permite anular compras con reversa segura del stock y auditoria.</li>
          </ul>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Historico de compras</h2>
            <p>{compras.length} comprobantes visibles para seguimiento, anulación y exportacion.</p>
          </div>
        </div>
        <DataTable
          columns={[
            "Fecha",
            "Proveedor",
            "Comprobante",
            "Detalle",
            "Total",
            "Estado",
            "Observaciones",
            "Acciones",
          ]}
          rows={compraRows}
          emptyMessage="No hay compras que coincidan con el filtro actual."
        />
      </article>
    </section>
  );
}
