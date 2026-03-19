import Link from "next/link";
import { closeCajaAction, openCajaAction } from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getCajaData } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function CajaPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    fecha: getQueryValue(params, "fecha"),
  };

  const { cierreActual, cierres, pagos, usuarios, summary } = await getCajaData(filters);

  const pagosRows = pagos.map((pago) => [
    pago.numeroRecibo ?? `PAGO-${pago.id}`,
    formatDateTime(pago.fecha.toISOString()),
    pago.abonado.numeroAbonado,
    pago.abonado.razonSocial || [pago.abonado.apellido, pago.abonado.nombre].filter(Boolean).join(" ") || "-",
    pago.medioPago,
    formatCurrency(Number(pago.importe)),
    <StatusPill key={`pago-${pago.id}`} tone={pago.estado === "ANULADO" ? "danger" : "success"}>
      {pago.estado}
    </StatusPill>,
    <Link className="toolbar-button" href={`/recibos/${pago.id}`} key={`recibo-${pago.id}`}>
      Ver recibo
    </Link>,
  ]);

  const cierresRows = cierres.map((cierre) => [
    formatDate(cierre.fecha.toISOString()),
    <StatusPill key={`caja-${cierre.id}`} tone={cierre.estado === "ABIERTA" ? "warning" : "success"}>
      {cierre.estado}
    </StatusPill>,
    formatCurrency(Number(cierre.saldoInicial)),
    formatCurrency(Number(cierre.ingresosSistema)),
    cierre.totalDeclarado ? formatCurrency(Number(cierre.totalDeclarado)) : "-",
    cierre.diferencia ? formatCurrency(Number(cierre.diferencia)) : "-",
    cierre.usuarioApertura.nombre,
    cierre.usuarioCierre?.nombre ?? "-",
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Tesoreria diaria</span>
            <h1>Caja, recibos y cierres</h1>
            <p>
              Controla la jornada de cobranza, valida recibos emitidos, compara el sistema contra
              lo declarado y deja arqueo diario con diferencia registrada.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Ingresos sistema</span>
              <strong>{formatCurrency(summary.ingresosSistema)}</strong>
              <p>Total de pagos vigentes en la fecha filtrada.</p>
            </article>
            <article className="metric-card">
              <span>Recibos vigentes</span>
              <strong>{summary.pagosRegistrados}</strong>
              <p>{summary.pagosAnulados} anulados dentro del mismo dia.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <section className="stats-grid stats-grid--3">
        <article className="card stat-card">
          <span className="stat-card__label">Fecha operativa</span>
          <strong className="stat-card__value">{formatDate(summary.fecha.toISOString())}</strong>
          <p className="stat-card__detail">Base del arqueo y los movimientos visibles.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Efectivo</span>
          <strong className="stat-card__value">{formatCurrency(summary.efectivoSistema)}</strong>
          <p className="stat-card__detail">Cobrado en efectivo y no anulado.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Transferencias</span>
          <strong className="stat-card__value">{formatCurrency(summary.transferenciaSistema)}</strong>
          <p className="stat-card__detail">Ingresos bancarios registrados.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Tarjetas</span>
          <strong className="stat-card__value">{formatCurrency(summary.tarjetaSistema)}</strong>
          <p className="stat-card__detail">Cobros con posnet o tarjeta.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Caja actual</span>
          <strong className="stat-card__value">{cierreActual ? "ABIERTA" : "SIN APERTURA"}</strong>
          <p className="stat-card__detail">Estado operativo del dia visible.</p>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtro diario</h2>
            <p>Podes revisar cierres y recibos de otra fecha sin salir del modulo.</p>
          </div>
          <Link className="toolbar-button" href="/facturacion">
            Ir a facturacion
          </Link>
        </div>
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Fecha</span>
              <input defaultValue={filters.fecha} name="fecha" type="date" />
            </label>
            <div className="toolbar__actions">
              <button className="toolbar-button" type="submit">
                Filtrar
              </button>
              <a className="toolbar-button" href="/caja">
                Hoy
              </a>
            </div>
          </div>
        </form>
      </article>

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Apertura o cierre</h2>
              <p>Solo una caja abierta por fecha. El cierre contrasta lo declarado con el sistema.</p>
            </div>
          </div>

          {!cierreActual ? (
            <form action={openCajaAction} className="form-panel">
              <div className="form-grid form-grid--2">
                <label className="field">
                  <span>Saldo inicial</span>
                  <input defaultValue="0" name="saldoInicial" required type="text" />
                </label>
                <label className="field">
                  <span>Observaciones apertura</span>
                  <input name="observacionesApertura" type="text" />
                </label>
              </div>
              <div className="form-actions">
                <SubmitButton idleLabel="Abrir caja" pendingLabel="Abriendo..." />
              </div>
            </form>
          ) : (
            <form action={closeCajaAction} className="form-panel">
              <input name="cajaId" type="hidden" value={cierreActual.id} />
              <div className="form-grid form-grid--4">
                <div className="field field--readOnly">
                  <span>Saldo inicial</span>
                  <div className="field__value">{formatCurrency(Number(cierreActual.saldoInicial))}</div>
                </div>
                <div className="field field--readOnly">
                  <span>Ingresos sistema</span>
                  <div className="field__value">{formatCurrency(summary.ingresosSistema)}</div>
                </div>
                <div className="field field--readOnly">
                  <span>Apertura</span>
                  <div className="field__value">{formatDateTime(cierreActual.aperturaAt.toISOString())}</div>
                </div>
                <div className="field field--readOnly">
                  <span>Abierta por</span>
                  <div className="field__value">{cierreActual.usuarioApertura.nombre}</div>
                </div>
              </div>
              <div className="form-grid form-grid--3">
                <label className="field">
                  <span>Efectivo declarado</span>
                  <input defaultValue={String(summary.efectivoSistema)} name="efectivoDeclarado" required type="text" />
                </label>
                <label className="field">
                  <span>Transferencia declarada</span>
                  <input
                    defaultValue={String(summary.transferenciaSistema)}
                    name="transferenciaDeclarada"
                    required
                    type="text"
                  />
                </label>
                <label className="field">
                  <span>Tarjeta declarada</span>
                  <input defaultValue={String(summary.tarjetaSistema)} name="tarjetaDeclarada" required type="text" />
                </label>
              </div>
              <label className="field">
                <span>Observaciones cierre</span>
                <textarea name="observacionesCierre" rows={3} />
              </label>
              <div className="form-actions">
                <SubmitButton idleLabel="Cerrar caja" pendingLabel="Cerrando..." />
              </div>
            </form>
          )}
        </article>

        <article className="card card--soft">
          <div className="section-heading">
            <div>
              <h2>Operadores disponibles</h2>
              <p>Usuarios habilitados para registrar movimientos o cierres.</p>
            </div>
          </div>
          <div className="task-list">
            {usuarios.map((usuario) => (
              <div className="task-item" key={usuario.id}>
                <span className="task-item__tag task-item__tag--operativo">{usuario.rol}</span>
                <div>
                  <strong>{usuario.nombre}</strong>
                  <p>Puede operar pagos y caja segun el rol asignado.</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Recibos del dia</h2>
              <p>{pagos.length} movimientos de caja en la fecha filtrada.</p>
            </div>
          </div>
          <DataTable
            columns={["Recibo", "Fecha", "Abonado", "Titular", "Medio", "Importe", "Estado", "Ficha"]}
            rows={pagosRows}
            emptyMessage="No hay recibos para la fecha seleccionada."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Historial de cierres</h2>
              <p>Ultimos 30 movimientos de apertura y cierre guardados.</p>
            </div>
          </div>
          <DataTable
            columns={["Fecha", "Estado", "Saldo inicial", "Ingresos sistema", "Total declarado", "Diferencia", "Apertura", "Cierre"]}
            rows={cierresRows}
            emptyMessage="Todavia no hay cierres registrados."
          />
        </article>
      </section>
    </section>
  );
}
