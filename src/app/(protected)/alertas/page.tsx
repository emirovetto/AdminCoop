import Link from "next/link";
import { DataTable } from "@/components/shared/data-table";
import { StatusPill } from "@/components/shared/status-pill";
import { requireRole } from "@/lib/auth";
import { getAlertasOperativasData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

function getSeverityTone(value: string) {
  if (value === "CRITICA") {
    return "danger" as const;
  }

  if (value === "ALTA") {
    return "warning" as const;
  }

  return "info" as const;
}

export default async function AlertasPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const params = searchParams ? await searchParams : undefined;
  const filters = {
    q: getQueryValue(params, "q"),
    categoria: getQueryValue(params, "categoria"),
    severidad: getQueryValue(params, "severidad"),
    horizonte: getQueryValue(params, "horizonte") || "7",
  };

  const {
    promesasVencidas,
    cuotasVencidas,
    cortesMora,
    stockCritico,
    reclamosCriticos,
    ordenesDemoradas,
    alertasArca,
    summary,
  } =
    await getAlertasOperativasData(filters);

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const promesasRows = promesasVencidas.map((item) => [
    <StatusPill key={`sev-promesa-${item.gestion.id}`} tone={getSeverityTone(item.severidad)}>
      {item.severidad}
    </StatusPill>,
    item.gestion.abonado.numeroAbonado,
    item.gestion.abonado.razonSocial ||
      [item.gestion.abonado.apellido, item.gestion.abonado.nombre].filter(Boolean).join(" ") ||
      "-",
    formatDate(item.gestion.compromisoPagoAt?.toISOString() ?? item.gestion.createdAt.toISOString()),
    formatCurrency(Number(item.gestion.compromisoImporte ?? 0)),
    item.gestion.usuario.nombre,
    item.gestion.factura?.numero ?? "-",
    <Link className="toolbar-button" href={`/cobranzas?q=${item.gestion.abonado.numeroAbonado}`} key={`go-promesa-${item.gestion.id}`}>
      Gestionar
    </Link>,
  ]);

  const cuotasRows = cuotasVencidas.map((item) => [
    <StatusPill key={`sev-cuota-${item.cuota.id}`} tone={getSeverityTone(item.severidad)}>
      {item.severidad}
    </StatusPill>,
    item.cuota.acuerdoPago.numero,
    item.cuota.acuerdoPago.abonado.numeroAbonado,
    item.cuota.acuerdoPago.abonado.razonSocial ||
      [item.cuota.acuerdoPago.abonado.apellido, item.cuota.acuerdoPago.abonado.nombre].filter(Boolean).join(" ") ||
      "-",
    `Cuota ${item.cuota.numeroCuota}`,
    formatDate(item.cuota.fechaVencimiento.toISOString()),
    formatCurrency(Number(item.cuota.importe)),
    <Link className="toolbar-button" href={`/cobranzas?q=${item.cuota.acuerdoPago.abonado.numeroAbonado}`} key={`go-cuota-${item.cuota.id}`}>
      Gestionar
    </Link>,
  ]);

  const cortesRows = cortesMora.map((item) => [
    <StatusPill key={`sev-corte-${item.corte.id}`} tone={getSeverityTone(item.severidad)}>
      {item.severidad}
    </StatusPill>,
    item.corte.numeroAbonado,
    item.corte.razonSocial || [item.corte.apellido, item.corte.nombre].filter(Boolean).join(" ") || "-",
    item.corte.localidad || "-",
    String(item.corte.facturas.length),
    formatCurrency(item.corte.deudaVencida),
    item.corte.serviciosActivosSinCorte
      .map((servicio) => servicio.servicioCatalogo?.nombre ?? servicio.plan)
      .join(" / "),
    item.corte.promesaVigente ? "Promesa vigente" : "Sin promesa",
    <Link className="toolbar-button" href={`/cobranzas?q=${item.corte.numeroAbonado}`} key={`go-corte-${item.corte.id}`}>
      Gestionar
    </Link>,
  ]);

  const stockRows = stockCritico.map((item) => [
    <StatusPill key={`sev-stock-${item.material.id}`} tone={getSeverityTone(item.severidad)}>
      {item.severidad}
    </StatusPill>,
    item.material.codigo,
    item.material.nombre,
    item.material.categoria,
    Number(item.material.stockActual),
    Number(item.material.stockMinimo),
    <Link className="toolbar-button" href={`/stock?q=${encodeURIComponent(item.material.codigo)}`} key={`go-stock-${item.material.id}`}>
      Ver stock
    </Link>,
  ]);

  const reclamosRows = reclamosCriticos.map((item) => [
    <StatusPill key={`sev-rec-${item.reclamo.id}`} tone={getSeverityTone(item.severidad)}>
      {item.severidad}
    </StatusPill>,
    item.reclamo.abonado.numeroAbonado,
    item.reclamo.abonado.razonSocial ||
      [item.reclamo.abonado.apellido, item.reclamo.abonado.nombre].filter(Boolean).join(" ") ||
      "-",
    item.reclamo.tipoServicio,
    item.reclamo.prioridad,
    formatDate(item.reclamo.fechaApertura.toISOString()),
    item.reclamo.tecnico?.nombre ?? "Sin asignar",
    <Link className="toolbar-button" href={`/reclamos?q=${item.reclamo.abonado.numeroAbonado}`} key={`go-rec-${item.reclamo.id}`}>
      Ver reclamo
    </Link>,
  ]);

  const ordenesRows = ordenesDemoradas.map((item) => [
    <StatusPill key={`sev-ot-${item.orden.id}`} tone={getSeverityTone(item.severidad)}>
      {item.severidad}
    </StatusPill>,
    item.orden.abonado.numeroAbonado,
    item.orden.abonado.razonSocial ||
      [item.orden.abonado.apellido, item.orden.abonado.nombre].filter(Boolean).join(" ") ||
      "-",
    item.orden.tipo,
    item.orden.estado,
    item.orden.fechaProgramada ? formatDate(item.orden.fechaProgramada.toISOString()) : formatDate(item.orden.createdAt.toISOString()),
    item.orden.tecnico?.nombre ?? "Sin asignar",
    <Link className="toolbar-button" href={`/ordenes?q=${item.orden.abonado.numeroAbonado}`} key={`go-ot-${item.orden.id}`}>
      Ver orden
    </Link>,
  ]);

  const arcaRows = alertasArca.map((item) => [
    <StatusPill key={`sev-arca-${item.factura.id}`} tone={getSeverityTone(item.severidad)}>
      {item.severidad}
    </StatusPill>,
    item.factura.numero,
    item.factura.abonado.numeroAbonado,
    item.factura.abonado.razonSocial ||
      [item.factura.abonado.apellido, item.factura.abonado.nombre].filter(Boolean).join(" ") ||
      "-",
    item.factura.resultadoArca,
    item.precheck.issues[0] ?? "Observacion ARCA",
    <Link className="toolbar-button" href={`/facturacion/${item.factura.id}`} key={`go-arca-${item.factura.id}`}>
      Ver factura
    </Link>,
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Centro de prioridades</span>
            <h1>Alertas operativas</h1>
            <p>
              Consolida urgencias de cobranzas, mora critica, stock, reclamos, ordenes y control ARCA en una sola
              bandeja para seguimiento diario.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Alertas criticas</span>
              <strong>{summary.criticas}</strong>
              <p>Total de alertas con impacto inmediato sobre operacion y cobranzas.</p>
            </article>
            <article className="metric-card">
              <span>Total visible</span>
              <strong>{summary.total}</strong>
              <p>Bandeja consolidada con corte a {formatDate(summary.horizonte.toISOString())}.</p>
            </article>
          </div>
        </div>
      </article>

      <section className="stats-grid stats-grid--3">
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Cobranzas</span>
          <strong className="stat-card__value">{summary.categorias.cobranzas}</strong>
          <p className="stat-card__detail">Promesas y cuotas vencidas que requieren accion.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Stock critico</span>
          <strong className="stat-card__value">{summary.categorias.stock}</strong>
          <p className="stat-card__detail">Materiales en minimo o sin stock para operar.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Reclamos criticos</span>
          <strong className="stat-card__value">{summary.categorias.reclamos}</strong>
          <p className="stat-card__detail">Tickets altos o demorados sin cierre.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Ordenes demoradas</span>
          <strong className="stat-card__value">{summary.categorias.ordenes}</strong>
          <p className="stat-card__detail">Instalaciones y visitas fuera de termino.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Observaciones ARCA</span>
          <strong className="stat-card__value">{summary.categorias.arca}</strong>
          <p className="stat-card__detail">Comprobantes con rechazo o precheck observado.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Alertas altas</span>
          <strong className="stat-card__value">{summary.altas}</strong>
          <p className="stat-card__detail">Bloques que deben resolverse antes del proximo corte.</p>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros</h2>
            <p>Busca por abonado, material, factura o modulo para acotar la bandeja.</p>
          </div>
          <a className="toolbar-button" href={`/api/export/alertas?${exportParams.toString()}`}>
            Exportar CSV
          </a>
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda</span>
              <input defaultValue={filters.q} name="q" placeholder="Abonado, material, factura" type="search" />
            </label>
            <label className="field">
              <span>Categoria</span>
              <select defaultValue={filters.categoria} name="categoria">
                <option value="">Todas</option>
                <option value="COBRANZAS">Cobranzas</option>
                <option value="STOCK">Stock</option>
                <option value="RECLAMOS">Reclamos</option>
                <option value="ORDENES">Ordenes</option>
                <option value="ARCA">ARCA</option>
              </select>
            </label>
            <label className="field">
              <span>Severidad</span>
              <select defaultValue={filters.severidad} name="severidad">
                <option value="">Todas</option>
                <option value="CRITICA">Critica</option>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
              </select>
            </label>
            <label className="field">
              <span>Horizonte</span>
              <select defaultValue={filters.horizonte} name="horizonte">
                <option value="3">3 dias</option>
                <option value="7">7 dias</option>
                <option value="15">15 dias</option>
                <option value="30">30 dias</option>
              </select>
            </label>
            <div className="toolbar__actions">
              <button className="toolbar-button" type="submit">
                Filtrar
              </button>
              <Link className="toolbar-button" href="/alertas">
                Limpiar
              </Link>
            </div>
          </div>
        </form>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Cobranzas en rojo</h2>
            <p>{promesasVencidas.length + cuotasVencidas.length + cortesMora.length} alertas financieras listas para gestionar.</p>
          </div>
        </div>
        <DataTable
          columns={["Severidad", "Abonado", "Titular", "Compromiso", "Importe", "Operador", "Factura", "Accion"]}
          rows={promesasRows}
          emptyMessage="No hay promesas vencidas con los filtros actuales."
        />
        <DataTable
          columns={["Severidad", "Acuerdo", "Abonado", "Titular", "Cuota", "Vencimiento", "Importe", "Accion"]}
          rows={cuotasRows}
          emptyMessage="No hay cuotas vencidas con los filtros actuales."
        />
        <DataTable
          columns={["Severidad", "Abonado", "Titular", "Localidad", "Facturas", "Deuda", "Servicios", "Promesa", "Accion"]}
          rows={cortesRows}
          emptyMessage="No hay abonados candidatos a corte con los filtros actuales."
        />
      </article>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Stock critico</h2>
              <p>{stockCritico.length} materiales requieren reposicion o control.</p>
            </div>
          </div>
          <DataTable
            columns={["Severidad", "Codigo", "Material", "Categoria", "Stock", "Minimo", "Accion"]}
            rows={stockRows}
            emptyMessage="No hay materiales bajo stock con este corte."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Reclamos criticos</h2>
              <p>{reclamosCriticos.length} tickets requieren seguimiento prioritario.</p>
            </div>
          </div>
          <DataTable
            columns={["Severidad", "Abonado", "Titular", "Servicio", "Prioridad", "Apertura", "Tecnico", "Accion"]}
            rows={reclamosRows}
            emptyMessage="No hay reclamos criticos con los filtros actuales."
          />
        </article>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Ordenes demoradas</h2>
              <p>{ordenesDemoradas.length} ordenes superaron su fecha prevista o edad razonable.</p>
            </div>
          </div>
          <DataTable
            columns={["Severidad", "Abonado", "Titular", "Tipo", "Estado", "Fecha", "Tecnico", "Accion"]}
            rows={ordenesRows}
            emptyMessage="No hay ordenes demoradas con este corte."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Observaciones ARCA</h2>
              <p>{alertasArca.length} comprobantes requieren revision antes del envio real.</p>
            </div>
          </div>
          <DataTable
            columns={["Severidad", "Factura", "Abonado", "Titular", "Resultado", "Detalle", "Accion"]}
            rows={arcaRows}
            emptyMessage="No hay observaciones ARCA para este corte."
          />
        </article>
      </section>
    </section>
  );
}
