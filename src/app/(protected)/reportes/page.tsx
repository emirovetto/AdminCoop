import Link from "next/link";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { requireRole } from "@/lib/auth";
import { IVA_CONDITIONS } from "@/lib/domain";
import { getReportesData } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function ReportesPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
    localidad: getQueryValue(params, "localidad"),
    provincia: getQueryValue(params, "provincia"),
    servicio: getQueryValue(params, "servicio"),
    condicionIva: getQueryValue(params, "condicionIva"),
    deuda: getQueryValue(params, "deuda"),
    estadoFactura: getQueryValue(params, "estadoFactura"),
    estadoReclamo: getQueryValue(params, "estadoReclamo"),
    tecnicoId: getQueryValue(params, "tecnicoId"),
    cargoFacturable: getQueryValue(params, "cargoFacturable"),
    proveedor: getQueryValue(params, "proveedor"),
  };

  const {
    abonados,
    facturas,
    reclamos,
    stockCritico,
    compras,
    gestionesCobranza,
    acuerdosPago,
    summary,
    tecnicos,
    moraPorAntiguedad,
    productividadTecnica,
    serviciosRentables,
    evolucionMensual,
  } = await getReportesData(filters);

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const abonadosRows = abonados.map((abonado) => {
    const titular =
      abonado.razonSocial ||
      [abonado.apellido, abonado.nombre].filter(Boolean).join(" ") ||
      abonado.numeroAbonado;
    const deuda = abonado.facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
    const vencidas = abonado.facturas.filter((factura) => factura.estado === "VENCIDA").length;

    return [
      abonado.numeroAbonado,
      titular,
      abonado.localidad,
      abonado.servicios.map((servicio) => servicio.plan).join(" / ") || "Sin servicios",
      formatCurrency(deuda),
      vencidas,
      `${abonado.reclamos.length} abiertos`,
      <Link className="toolbar-button" href={`/abonados/${abonado.id}`} key={`link-${abonado.id}`}>
        Ver ficha
      </Link>,
    ];
  });

  const facturasRows = facturas.map((factura) => [
    factura.numero,
    factura.abonado.numeroAbonado,
    factura.abonado.razonSocial ||
      [factura.abonado.apellido, factura.abonado.nombre].filter(Boolean).join(" ") ||
      "-",
    formatDate(factura.fechaEmision.toISOString()),
    formatCurrency(Number(factura.total)),
    <StatusPill
      key={`factura-${factura.id}`}
      tone={
        factura.estado === "PAGADA"
          ? "success"
          : factura.estado === "VENCIDA"
            ? "danger"
            : "warning"
      }
    >
      {factura.estado}
    </StatusPill>,
    factura.detalles.map((detalle) => detalle.descripcion).join(" / "),
    <Link className="toolbar-button" href={`/facturacion/${factura.id}`} key={`factura-link-${factura.id}`}>
      Ver comprobante
    </Link>,
  ]);

  const reclamosRows = reclamos.map((reclamo) => [
    `#${reclamo.id}`,
    reclamo.abonado.numeroAbonado,
    reclamo.abonado.localidad,
    reclamo.tipoServicio,
    reclamo.tecnico?.nombre ?? "Sin asignar",
    formatDateTime(reclamo.fechaApertura.toISOString()),
    <StatusPill
      key={`reclamo-${reclamo.id}`}
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
    reclamo.materiales.map((material) => material.material.nombre).join(" / ") || "Sin materiales",
  ]);

  const stockRows = stockCritico.map((material) => [
    material.codigo,
    material.nombre,
    material.categoria,
    Number(material.stockActual),
    Number(material.stockMinimo),
    formatCurrency(Number(material.costoPromedio)),
    <StatusPill key={`stock-${material.id}`} tone="danger">
      CRITICO
    </StatusPill>,
  ]);

  const comprasRows = compras.map((compra) => [
    formatDate(compra.fecha.toISOString()),
    compra.proveedorRef?.razonSocial ?? compra.proveedor,
    compra.comprobante ?? "-",
    formatCurrency(Number(compra.total)),
    compra.detalles.map((detalle) => `${detalle.material.nombre} x ${Number(detalle.cantidad)}`).join(" / "),
  ]);

  const moraRows = moraPorAntiguedad.map((bucket) => [
    bucket.label,
    bucket.cantidad,
    formatCurrency(bucket.importe),
  ]);

  const productividadRows = productividadTecnica.map((item) => [
    item.tecnico,
    item.total,
    item.resueltos,
    item.abiertos,
    item.materiales,
  ]);

  const serviciosRows = serviciosRentables.map((item) => [
    item.servicio,
    item.conceptos,
    formatCurrency(item.importe),
  ]);

  const evolucionRows = evolucionMensual.map((item) => [
    item.label,
    formatCurrency(item.facturado),
    formatCurrency(item.cobrado),
    formatCurrency(item.compras),
  ]);

  const gestionesRows = gestionesCobranza.map((gestion) => [
    formatDateTime(gestion.createdAt.toISOString()),
    gestion.abonado.numeroAbonado,
    gestion.abonado.razonSocial ||
      [gestion.abonado.apellido, gestion.abonado.nombre].filter(Boolean).join(" ") ||
      "-",
    gestion.usuario.nombre,
    gestion.canal,
    gestion.resultado,
    <StatusPill
      key={`gestion-${gestion.id}`}
      tone={
        gestion.estado === "CUMPLIDA"
          ? "success"
          : gestion.estado === "INCUMPLIDA"
            ? "danger"
            : gestion.estado === "PROMESA_VIGENTE"
              ? "warning"
              : "neutral"
      }
    >
      {gestion.estado}
    </StatusPill>,
    gestion.compromisoPagoAt
      ? `${formatDate(gestion.compromisoPagoAt.toISOString())} / ${formatCurrency(Number(gestion.compromisoImporte ?? 0))}`
      : "-",
  ]);

  const acuerdosRows = acuerdosPago.map((acuerdo) => {
    const cuotasCumplidas = acuerdo.cuotas.filter((cuota) => cuota.estado === "CUMPLIDA").length;
    const cuotasPendientes = acuerdo.cuotas.filter((cuota) => cuota.estado === "PENDIENTE");
    const cuotasVencidas = cuotasPendientes.filter((cuota) => cuota.fechaVencimiento < new Date()).length;

    return [
      acuerdo.numero,
      acuerdo.abonado.numeroAbonado,
      acuerdo.abonado.razonSocial ||
        [acuerdo.abonado.apellido, acuerdo.abonado.nombre].filter(Boolean).join(" ") ||
        "-",
      acuerdo.usuario.nombre,
      formatDate(acuerdo.fechaAcuerdo.toISOString()),
      formatCurrency(Number(acuerdo.totalAcuerdo)),
      `${cuotasCumplidas}/${acuerdo.cantidadCuotas} cumplidas`,
      cuotasVencidas,
      <StatusPill
        key={`acuerdo-${acuerdo.id}`}
        tone={
          acuerdo.estado === "CUMPLIDO"
            ? "success"
            : acuerdo.estado === "INCUMPLIDO"
              ? "danger"
              : "warning"
        }
      >
        {acuerdo.estado}
      </StatusPill>,
    ];
  });

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Control operativo</span>
            <h1>Reportes integrados</h1>
            <p>
              Cruza caja, facturacion, reclamos, stock y compras para detectar deuda, tickets,
              faltantes de materiales y movimientos del periodo sin entrar modulo por modulo.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Facturado</span>
              <strong>{formatCurrency(summary.facturadoPeriodo)}</strong>
              <p>Total visible en el rango actual.</p>
            </article>
            <article className="metric-card">
              <span>Cobrado</span>
              <strong>{formatCurrency(summary.cobradoPeriodo)}</strong>
              <p>Pagos registrados dentro del periodo filtrado.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <section className="stats-grid stats-grid--3">
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Pendiente actual</span>
          <strong className="stat-card__value">{formatCurrency(summary.pendienteActual)}</strong>
          <p className="stat-card__detail">{summary.abonadosConDeuda} abonados con deuda visible.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Vencido actual</span>
          <strong className="stat-card__value">{formatCurrency(summary.vencidoActual)}</strong>
          <p className="stat-card__detail">
            {summary.facturasVencidas} facturas y {summary.abonadosConVencida} abonados con vencida.
          </p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Reclamos abiertos</span>
          <strong className="stat-card__value">{summary.reclamosAbiertos}</strong>
          <p className="stat-card__detail">Tickets que siguen en curso con este filtro.</p>
        </article>
        <article className="card stat-card stat-card--accent">
          <span className="stat-card__label">Compras del periodo</span>
          <strong className="stat-card__value">{formatCurrency(summary.comprasPeriodo)}</strong>
          <p className="stat-card__detail">Inversion operativa visible.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Stock critico</span>
          <strong className="stat-card__value">{summary.stockCritico}</strong>
          <p className="stat-card__detail">Materiales en minimo o por debajo.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Cargos tecnicos</span>
          <strong className="stat-card__value">{summary.cargosTecnicosPendientes}</strong>
          <p className="stat-card__detail">
            {summary.ticketsPendientesFacturacion} tickets con cargos pendientes de facturar.
          </p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Tickets con materiales</span>
          <strong className="stat-card__value">{summary.ticketsConMateriales}</strong>
          <p className="stat-card__detail">Reclamos con consumo tecnico registrado.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Mora 90+ dias</span>
          <strong className="stat-card__value">{formatCurrency(summary.moraMayor90)}</strong>
          <p className="stat-card__detail">Tramo mas critico para seguimiento de cobrabilidad.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Promesas vigentes</span>
          <strong className="stat-card__value">{summary.promesasVigentes}</strong>
          <p className="stat-card__detail">{summary.promesasVencidas} ya vencieron y requieren gestion.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Planes vigentes</span>
          <strong className="stat-card__value">{summary.acuerdosVigentes}</strong>
          <p className="stat-card__detail">{summary.cuotasAcuerdoVencidas} cuotas vencidas en acuerdos activos.</p>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros transversales</h2>
            <p>Usa el mismo rango para controlar deuda, tickets, stock y compras.</p>
          </div>
          <a className="toolbar-button" href={`/api/export/reportes?${exportParams.toString()}`}>
            Exportar reporte CSV
          </a>
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Desde</span>
              <input defaultValue={filters.desde} name="desde" type="date" />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input defaultValue={filters.hasta} name="hasta" type="date" />
            </label>
            <label className="field">
              <span>Localidad</span>
              <input defaultValue={filters.localidad} name="localidad" type="text" />
            </label>
            <label className="field">
              <span>Provincia</span>
              <input defaultValue={filters.provincia} name="provincia" type="text" />
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Servicio</span>
              <input defaultValue={filters.servicio} name="servicio" type="text" />
            </label>
            <label className="field">
              <span>Condicion IVA</span>
              <select defaultValue={filters.condicionIva} name="condicionIva">
                <option value="">Todas</option>
                {IVA_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Deuda</span>
              <select defaultValue={filters.deuda} name="deuda">
                <option value="">Todas</option>
                <option value="CON_DEUDA">Con deuda</option>
                <option value="CON_VENCIDA">Con vencida</option>
                <option value="AL_DIA">Al dia</option>
              </select>
            </label>
            <label className="field">
              <span>Estado factura</span>
              <select defaultValue={filters.estadoFactura} name="estadoFactura">
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PAGADA">Pagada</option>
                <option value="VENCIDA">Vencida</option>
              </select>
            </label>
            <label className="field">
              <span>Estado reclamo</span>
              <select defaultValue={filters.estadoReclamo} name="estadoReclamo">
                <option value="">Todos</option>
                <option value="ABIERTO">Abierto</option>
                <option value="EN_PROCESO">En proceso</option>
                <option value="RESUELTO">Resuelto</option>
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
            <label className="field">
              <span>Cargos tecnicos</span>
              <select defaultValue={filters.cargoFacturable} name="cargoFacturable">
                <option value="">Todos</option>
                <option value="PENDIENTE_FACTURACION">Pendiente de facturar</option>
                <option value="CON_MATERIALES">Con materiales</option>
                <option value="SIN_MATERIALES">Sin materiales</option>
              </select>
            </label>
            <label className="field">
              <span>Proveedor</span>
              <input defaultValue={filters.proveedor} name="proveedor" type="text" />
            </label>
            <div className="toolbar__actions">
              <button className="toolbar-button" type="submit">
                Filtrar
              </button>
              <Link className="toolbar-button" href="/reportes">
                Limpiar
              </Link>
            </div>
          </div>
        </form>
      </article>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Abonados bajo seguimiento</h2>
              <p>Deuda y reclamos abiertos visibles con el filtro actual.</p>
            </div>
          </div>
          <DataTable
            columns={["Abonado", "Titular", "Localidad", "Servicios", "Deuda", "Vencidas", "Reclamos", "Ficha"]}
            rows={abonadosRows}
            emptyMessage="No hay abonados para mostrar con este filtro."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Facturas visibles</h2>
              <p>{facturas.length} comprobantes dentro del analisis.</p>
            </div>
          </div>
          <DataTable
            columns={["Factura", "Abonado", "Titular", "Emision", "Total", "Estado", "Detalle", "Ficha"]}
            rows={facturasRows}
            emptyMessage="No hay facturas visibles para el filtro actual."
          />
        </article>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Reclamos y soporte</h2>
              <p>{reclamos.length} tickets visibles con su tecnico y materiales.</p>
            </div>
          </div>
          <DataTable
            columns={["Ticket", "Abonado", "Localidad", "Servicio", "Tecnico", "Apertura", "Estado", "Materiales"]}
            rows={reclamosRows}
            emptyMessage="No hay reclamos visibles para este analisis."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Stock critico</h2>
              <p>{stockCritico.length} materiales en nivel minimo o por debajo.</p>
            </div>
          </div>
          <DataTable
            columns={["Codigo", "Material", "Categoria", "Stock", "Minimo", "Costo", "Estado"]}
            rows={stockRows}
            emptyMessage="No hay materiales criticos con la informacion actual."
          />
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Compras del periodo</h2>
            <p>{compras.length} ingresos registrados para abastecimiento.</p>
          </div>
        </div>
        <DataTable
          columns={["Fecha", "Proveedor", "Comprobante", "Total", "Detalle"]}
          rows={comprasRows}
          emptyMessage="No hay compras en el periodo seleccionado."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Gestiones de cobranza</h2>
            <p>{gestionesCobranza.length} contactos visibles para seguimiento de recupero.</p>
          </div>
        </div>
        <DataTable
          columns={["Fecha", "Abonado", "Titular", "Operador", "Canal", "Resultado", "Estado", "Compromiso"]}
          rows={gestionesRows}
          emptyMessage="No hay gestiones de cobranza para el corte actual."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Planes de pago</h2>
            <p>{acuerdosPago.length} acuerdos visibles para control de cobrabilidad.</p>
          </div>
        </div>
        <DataTable
          columns={["Acuerdo", "Abonado", "Titular", "Operador", "Fecha", "Monto", "Cuotas", "Vencidas", "Estado"]}
          rows={acuerdosRows}
          emptyMessage="No hay planes de pago para el corte actual."
        />
      </article>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Antiguedad de deuda</h2>
              <p>Distribucion de mora sobre las facturas abiertas visibles.</p>
            </div>
          </div>
          <DataTable
            columns={["Tramo", "Facturas", "Importe"]}
            rows={moraRows}
            emptyMessage="No hay deuda abierta en los filtros actuales."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Productividad tecnica</h2>
              <p>Resumen de tickets, cierres y materiales por tecnico.</p>
            </div>
          </div>
          <DataTable
            columns={["Tecnico", "Tickets", "Resueltos", "Abiertos", "Materiales"]}
            rows={productividadRows}
            emptyMessage="No hay actividad tecnica para este corte."
          />
        </article>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Servicios con mayor importe</h2>
              <p>Composicion del ingreso segun conceptos facturados.</p>
            </div>
          </div>
          <DataTable
            columns={["Servicio / concepto", "Renglones", "Importe"]}
            rows={serviciosRows}
            emptyMessage="No hay conceptos facturados para analizar."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Evolucion mensual</h2>
              <p>Comparativo rapido de facturacion, cobranza y compras.</p>
            </div>
          </div>
          <DataTable
            columns={["Mes", "Facturado", "Cobrado", "Compras"]}
            rows={evolucionRows}
            emptyMessage="No hay evolucion disponible para el rango actual."
          />
        </article>
      </section>
    </section>
  );
}
