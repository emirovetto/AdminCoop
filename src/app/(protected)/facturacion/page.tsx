import Link from "next/link";
import { cancelPagoAction, createPagoAction, generateMonthlyInvoicesAction } from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { buildFacturaArcaPrecheck } from "@/lib/arca";
import { requireRole } from "@/lib/auth";
import { IVA_CONDITIONS } from "@/lib/domain";
import { getFacturacionData } from "@/lib/data";
import { formatCurrency, formatDate, getDaysOverdue } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function FacturacionPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    estado: getQueryValue(params, "estado"),
    medioPago: getQueryValue(params, "medioPago"),
    abonadoId: getQueryValue(params, "abonadoId"),
    localidad: getQueryValue(params, "localidad"),
    condicionIva: getQueryValue(params, "condicionIva"),
    servicioCatalogoId: getQueryValue(params, "servicioCatalogoId"),
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
  };

  const { facturas, pagos, movimientos, abonados, usuarios, summary, configuracion, catalogoServicios } =
    await getFacturacionData(filters);
  const arcaReadyCount = facturas.filter((factura) =>
    buildFacturaArcaPrecheck(
      {
        subtotal: Number(factura.subtotal),
        total: Number(factura.total),
        tipoComprobanteArca: factura.tipoComprobanteArca,
        conceptoArca: factura.conceptoArca,
        tipoDocumentoReceptor: factura.tipoDocumentoReceptor,
        numeroDocumentoReceptor: factura.numeroDocumentoReceptor,
        monedaCodigo: factura.monedaCodigo,
        puntoVentaArca: factura.puntoVentaArca,
        detallesCount: factura.detalles.length,
      },
      configuracion,
    ).ready,
  ).length;

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const invoiceRows = facturas.map((factura) => [
    (() => {
      const precheck = buildFacturaArcaPrecheck(
        {
          subtotal: Number(factura.subtotal),
          total: Number(factura.total),
          tipoComprobanteArca: factura.tipoComprobanteArca,
          conceptoArca: factura.conceptoArca,
          tipoDocumentoReceptor: factura.tipoDocumentoReceptor,
          numeroDocumentoReceptor: factura.numeroDocumentoReceptor,
          monedaCodigo: factura.monedaCodigo,
          puntoVentaArca: factura.puntoVentaArca,
          detallesCount: factura.detalles.length,
        },
        configuracion,
      );

      return (
        <StatusPill
          key={`precheck-${factura.id}`}
          tone={
            precheck.status === "LISTA"
              ? "success"
              : precheck.status === "OBSERVADA"
                ? "warning"
                : "neutral"
          }
        >
          {precheck.status}
        </StatusPill>
      );
    })(),
    factura.tipoAjuste ?? "FACTURA",
    factura.numero,
    `${factura.puntoVentaArca ?? configuracion?.puntoVenta ?? "0001"}-${factura.tipoComprobanteArca}`,
    factura.abonado.numeroAbonado,
    factura.abonado.razonSocial ||
      [factura.abonado.apellido, factura.abonado.nombre].filter(Boolean).join(" ") ||
      "-",
    factura.condicionIvaReceptor ?? factura.abonado.condicionIva,
    formatDate(factura.fechaEmision.toISOString()),
    factura.estado === "VENCIDA" ? `${getDaysOverdue(factura.fechaVencimiento.toISOString())} dias` : "-",
    formatCurrency(Number(factura.subtotal)),
    formatCurrency(Number(factura.totalIva)),
    formatCurrency(Number(factura.total)),
    factura.detalles.map((detalle) => detalle.descripcion).join(" / "),
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
    <StatusPill
      key={`arca-${factura.id}`}
      tone={
        factura.resultadoArca === "AUTORIZADA"
          ? "success"
          : factura.resultadoArca === "RECHAZADA"
            ? "danger"
            : "info"
      }
    >
      {factura.resultadoArca}
    </StatusPill>,
    <Link className="toolbar-button" href={`/facturacion/${factura.id}`} key={`factura-link-${factura.id}`}>
      Ver comprobante
    </Link>,
  ]);

  const paymentRows = pagos.map((pago) => [
    pago.numeroRecibo ?? `PAGO-${pago.id}`,
    pago.abonado.numeroAbonado,
    formatDate(pago.fecha.toISOString()),
    pago.medioPago,
    pago.usuario.nombre,
    formatCurrency(Number(pago.importe)),
    <StatusPill key={`pago-${pago.id}`} tone={pago.estado === "ANULADO" ? "danger" : "success"}>
      {pago.estado}
    </StatusPill>,
    <div className="stack-list" key={`acciones-${pago.id}`}>
      <Link className="toolbar-button" href={`/recibos/${pago.id}`}>
        Ver recibo
      </Link>
      {pago.estado === "ANULADO" ? (
        <span>{pago.motivoAnulacion ?? "-"}</span>
      ) : (
        <form action={cancelPagoAction} className="inline-form">
          <input name="pagoId" type="hidden" value={pago.id} />
          <div className="inline-form__grid inline-form__grid--compact">
            <input name="motivoAnulacion" placeholder="Motivo de anulacion" required type="text" />
            <SubmitButton idleLabel="Anular" pendingLabel="Anulando..." />
          </div>
        </form>
      )}
    </div>,
  ]);

  const currentAccountRows = movimientos.map((movimiento) => [
    movimiento.abonado.numeroAbonado,
    movimiento.pago?.numeroRecibo ?? "-",
    formatDate(movimiento.fecha.toISOString()),
    movimiento.tipo,
    movimiento.descripcion,
    formatCurrency(Number(movimiento.importe)),
    formatCurrency(Number(movimiento.saldo)),
    movimiento.anuladoAt ? "ANULADO" : movimiento.pago?.estado ?? "VIGENTE",
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Caja y cobranzas</span>
            <h1>Facturacion compuesta por servicios y condicion fiscal</h1>
            <p>
              Emision, seguimiento de deuda, cobranzas y control fiscal en una sola mesa de trabajo.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Facturas del mes</span>
              <strong>{summary.facturasDelMes}</strong>
              <p>Comprobantes emitidos en el ciclo visible.</p>
            </article>
            <article className="metric-card">
              <span>Pagos registrados</span>
              <strong>{summary.pagosRegistrados}</strong>
              <p>Movimientos de cobranza cargados en el sistema.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <section className="stats-grid stats-grid--ops">
        <article className="card stat-card stat-card--accent">
          <span className="stat-card__label">Emisor</span>
          <strong className="stat-card__value">{configuracion?.puntoVenta ?? "0001"}</strong>
          <p className="stat-card__detail">
            {configuracion?.razonSocial ?? "Configuracion pendiente"} /{" "}
            {configuracion?.condicionIvaEmisor ?? "Sin definir"}
          </p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">ARCA</span>
          <strong className="stat-card__value">
            {configuracion?.arcaHabilitado ? configuracion.ambienteArca : "INTERNO"}
          </strong>
          <p className="stat-card__detail">
            {arcaReadyCount} comprobantes listos para validar/envio / tipo {configuracion?.tipoComprobanteDefault ?? "011"}.
          </p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Servicios globales</span>
          <strong className="stat-card__value">{catalogoServicios.length}</strong>
          <p className="stat-card__detail">Catalogo disponible para componer comprobantes.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Cargos tecnicos</span>
          <strong className="stat-card__value">{summary.cargosTecnicosPendientes}</strong>
          <p className="stat-card__detail">Materiales pendientes de pasar a la proxima factura.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Recibos anulados</span>
          <strong className="stat-card__value">{summary.pagosAnulados}</strong>
          <p className="stat-card__detail">Pagos revertidos con trazabilidad y motivo registrado.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Facturas vencidas</span>
          <strong className="stat-card__value">{summary.facturasVencidas}</strong>
          <p className="stat-card__detail">Comprobantes ya vencidos y pendientes de cobro.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Saldo pendiente</span>
          <strong className="stat-card__value">{formatCurrency(summary.saldoPendiente)}</strong>
          <p className="stat-card__detail">Deuda acumulada entre pendiente y vencido.</p>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros y reportes</h2>
            <p>Filtra movimientos y exporta CSV para analisis o conciliacion.</p>
          </div>
          <Link className="toolbar-button" href="/configuracion">
            Configurar servicios
          </Link>
        </div>
        <form className="filters-panel">
          <div className="filters-panel__grid">
            <label className="field">
              <span>Busqueda general</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="Factura, abonado, medio de pago o descripcion"
                type="search"
              />
            </label>
            <label className="field">
              <span>Estado factura</span>
              <select defaultValue={filters.estado} name="estado">
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PAGADA">Pagada</option>
                <option value="VENCIDA">Vencida</option>
              </select>
            </label>
            <label className="field">
              <span>Medio de pago</span>
              <select defaultValue={filters.medioPago} name="medioPago">
                <option value="">Todos</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
              </select>
            </label>
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
              <span>Localidad</span>
              <input defaultValue={filters.localidad} name="localidad" placeholder="Filtrar por localidad" type="text" />
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
              <span>Servicio global</span>
              <select defaultValue={filters.servicioCatalogoId} name="servicioCatalogoId">
                <option value="">Todos</option>
                {catalogoServicios.map((servicio) => (
                  <option key={servicio.id} value={servicio.id}>
                    {servicio.nombre}
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
          </div>
          <div className="filters-panel__actions">
            <button className="toolbar-button" type="submit">
              Filtrar
            </button>
            <Link className="toolbar-button" href="/facturacion">
              Limpiar
            </Link>
            <a className="toolbar-button" href={`/api/export/facturacion?${exportParams.toString()}`}>
              Exportar CSV
            </a>
          </div>
        </form>
      </article>

      <section className="split-grid split-grid--equal">
        <article className="card card--soft">
          <div className="section-heading">
            <div>
              <h2>Emision mensual por lote</h2>
              <p>Crea facturas para abonados activos que aun no fueron emitidos este mes.</p>
            </div>
          </div>
          <form action={generateMonthlyInvoicesAction} className="form-panel form-panel--dense">
            <div className="field field--readOnly">
              <span>Resultado esperado</span>
              <div className="field__value">
                Generar una factura con detalle por servicio, periodicidad aplicable, cargos tecnicos, subtotal, IVA y total por abonado.
              </div>
            </div>
            <div className="form-actions">
              <SubmitButton
                idleLabel="Generar facturas del mes"
                pendingLabel="Generando facturas..."
              />
            </div>
          </form>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Registrar pago</h2>
              <p>{summary.pagosRegistrados} recibos vigentes cargados en la base.</p>
            </div>
          </div>
          <form action={createPagoAction} className="form-panel">
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
                <span>Operador</span>
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
                <span>Medio de pago</span>
                <select defaultValue="TRANSFERENCIA" name="medioPago" required>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TARJETA">Tarjeta</option>
                </select>
              </label>
              <label className="field">
                <span>Importe</span>
                <input name="importe" placeholder="10000" required type="text" />
              </label>
            </div>
            <div className="form-grid form-grid--2">
              <label className="field">
                <span>Descripcion</span>
                <input
                  name="descripcion"
                  placeholder="Transferencia recibida o cobro en caja"
                  type="text"
                />
              </label>
              <div className="form-actions">
                <SubmitButton idleLabel="Registrar pago" pendingLabel="Registrando pago..." />
              </div>
            </div>
          </form>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Facturas emitidas</h2>
            <p>{facturas.length} comprobantes actualmente visibles.</p>
          </div>
        </div>
        <DataTable
          columns={[
            "Precheck",
            "Clase",
            "Factura",
            "ARCA",
            "Abonado",
            "Titular",
            "IVA receptor",
            "Emision",
            "Mora",
            "Subtotal",
            "IVA",
            "Total",
            "Detalle",
            "Estado",
            "Estado ARCA",
            "Ficha",
          ]}
          rows={invoiceRows}
          emptyMessage="Todavia no hay facturas emitidas en la base."
        />
      </article>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Recibos y pagos</h2>
              <p>{pagos.length} registros de cobranza entre vigentes y anulados.</p>
            </div>
          </div>
          <DataTable
            columns={["Recibo", "Abonado", "Fecha", "Medio", "Operador", "Importe", "Estado", "Gestion"]}
            rows={paymentRows}
            emptyMessage="Todavia no hay pagos registrados."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Cuenta corriente</h2>
              <p>{movimientos.length} movimientos consolidados por abonado.</p>
            </div>
          </div>
          <DataTable
            columns={["Abonado", "Recibo", "Fecha", "Tipo", "Descripcion", "Importe", "Saldo", "Estado"]}
            rows={currentAccountRows}
            emptyMessage="No hay movimientos en cuenta corriente para mostrar."
          />
        </article>
      </section>
    </section>
  );
}
