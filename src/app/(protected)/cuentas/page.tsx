import Link from "next/link";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { requireRole } from "@/lib/auth";
import { IVA_CONDITIONS } from "@/lib/domain";
import { getCuentaCorrienteData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function CuentaCorrientePage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    abonadoId: getQueryValue(params, "abonadoId"),
    tipo: getQueryValue(params, "tipo"),
    localidad: getQueryValue(params, "localidad"),
    condicionIva: getQueryValue(params, "condicionIva"),
    vigencia: getQueryValue(params, "vigencia"),
    desde: getQueryValue(params, "desde"),
    hasta: getQueryValue(params, "hasta"),
  };

  const { movimientos, abonados, resumenAbonados, summary } = await getCuentaCorrienteData(filters);

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const resumenRows = resumenAbonados.map((item) => [
    item.numeroAbonado,
    item.titular,
    item.localidad,
    item.condicionIva,
    formatCurrency(item.debitos),
    formatCurrency(item.creditos),
    <StatusPill
      key={`saldo-${item.abonadoId}`}
      tone={item.saldo > 0 ? "warning" : item.saldo < 0 ? "info" : "success"}
    >
      {formatCurrency(item.saldo)}
    </StatusPill>,
    `${item.movimientos} mov. / ${item.anulados} anulados`,
    <div className="stack-list" key={`abonado-${item.abonadoId}`}>
      <Link className="toolbar-button" href={`/cuentas/${item.abonadoId}`}>
        Ver extracto
      </Link>
      <Link className="toolbar-button" href={`/abonados/${item.abonadoId}`}>
        Ver ficha
      </Link>
    </div>,
  ]);

  const movimientosRows = movimientos.map((movimiento) => {
    const titular =
      movimiento.abonado.razonSocial ||
      [movimiento.abonado.apellido, movimiento.abonado.nombre].filter(Boolean).join(" ") ||
      movimiento.abonado.numeroAbonado;
    const referencia = movimiento.factura?.numero ?? movimiento.pago?.numeroRecibo ?? `MOV-${movimiento.id}`;

    return [
      formatDate(movimiento.fecha.toISOString()),
      movimiento.abonado.numeroAbonado,
      titular,
      <StatusPill
        key={`tipo-${movimiento.id}`}
        tone={movimiento.tipo === "DEBITO" ? "warning" : "success"}
      >
        {movimiento.tipo}
      </StatusPill>,
      referencia,
      movimiento.descripcion,
      formatCurrency(Number(movimiento.importe)),
      <StatusPill
        key={`vigencia-${movimiento.id}`}
        tone={movimiento.anuladoAt ? "danger" : "neutral"}
      >
        {movimiento.anuladoAt ? "ANULADO" : "VIGENTE"}
      </StatusPill>,
      movimiento.factura ? (
        <Link className="toolbar-button" href={`/facturacion/${movimiento.factura.id}`} key={`fact-${movimiento.id}`}>
          Ver factura
        </Link>
      ) : movimiento.pago ? (
        <Link className="toolbar-button" href={`/recibos/${movimiento.pago.id}`} key={`rec-${movimiento.id}`}>
          Ver recibo
        </Link>
      ) : (
        "-"
      ),
    ];
  });

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Cobranzas y deuda</span>
            <h1>Cuenta corriente consolidada</h1>
            <p>
              Revisa debitos, creditos, saldos a favor y deuda visible por abonado sin entrar a cada
              modulo. Ideal para seguimiento, conciliacion y exportacion administrativa.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Saldo neto visible</span>
              <strong>{formatCurrency(summary.saldoNeto)}</strong>
              <p>Debitos menos creditos vigentes dentro del filtro aplicado.</p>
            </article>
            <article className="metric-card">
              <span>Abonados con saldo</span>
              <strong>{summary.abonadosConSaldo}</strong>
              <p>Abonados con deuda visible en esta consulta.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <section className="stats-grid stats-grid--3">
        <article className="card stat-card">
          <span className="stat-card__label">Movimientos visibles</span>
          <strong className="stat-card__value">{summary.movimientosVisibles}</strong>
          <p className="stat-card__detail">Debitos y creditos encontrados con el filtro actual.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Debitos</span>
          <strong className="stat-card__value">{formatCurrency(summary.debitos)}</strong>
          <p className="stat-card__detail">Cargos vigentes registrados en cuenta corriente.</p>
        </article>
        <article className="card stat-card stat-card--accent">
          <span className="stat-card__label">Creditos</span>
          <strong className="stat-card__value">{formatCurrency(summary.creditos)}</strong>
          <p className="stat-card__detail">Pagos y notas de credito vigentes aplicados.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Anulados</span>
          <strong className="stat-card__value">{summary.movimientosAnulados}</strong>
          <p className="stat-card__detail">Movimientos visibles fuera de vigencia.</p>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros del extracto</h2>
            <p>Busca por abonado, recibo, factura, localidad, tipo o vigencia.</p>
          </div>
          <a className="toolbar-button" href={`/api/export/cuentas?${exportParams.toString()}`}>
            Exportar CSV
          </a>
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda general</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="Abonado, factura, recibo o descripcion"
                type="search"
              />
            </label>
            <label className="field">
              <span>Abonado</span>
              <select defaultValue={filters.abonadoId} name="abonadoId">
                <option value="">Todos</option>
                {abonados.map((abonado) => (
                  <option key={abonado.id} value={abonado.id}>
                    {abonado.numeroAbonado} -{" "}
                    {abonado.razonSocial ||
                      [abonado.apellido, abonado.nombre].filter(Boolean).join(" ") ||
                      "Sin titular"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo</span>
              <select defaultValue={filters.tipo} name="tipo">
                <option value="">Todos</option>
                <option value="DEBITO">Debito</option>
                <option value="CREDITO">Credito</option>
              </select>
            </label>
            <label className="field">
              <span>Vigencia</span>
              <select defaultValue={filters.vigencia} name="vigencia">
                <option value="">Todas</option>
                <option value="VIGENTE">Vigentes</option>
                <option value="ANULADO">Anulados</option>
              </select>
            </label>
            <label className="field">
              <span>Localidad</span>
              <input defaultValue={filters.localidad} name="localidad" type="text" />
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
              <Link className="toolbar-button" href="/cuentas">
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
              <h2>Resumen por abonado</h2>
              <p>{resumenAbonados.length} cuentas visibles para seguimiento y gestion.</p>
            </div>
          </div>
          <DataTable
            columns={[
              "Abonado",
              "Titular",
              "Localidad",
              "IVA",
              "Debitos",
              "Creditos",
              "Saldo",
              "Movimientos",
              "Acciones",
            ]}
            rows={resumenRows}
            emptyMessage="No hay cuentas para mostrar con este filtro."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Extracto de movimientos</h2>
              <p>{movimientos.length} asientos visibles con trazabilidad de factura o recibo.</p>
            </div>
          </div>
          <DataTable
            columns={[
              "Fecha",
              "Abonado",
              "Titular",
              "Tipo",
              "Referencia",
              "Descripcion",
              "Importe",
              "Vigencia",
              "Relacion",
            ]}
            rows={movimientosRows}
            emptyMessage="No hay movimientos para mostrar con este filtro."
          />
        </article>
      </section>
    </section>
  );
}
