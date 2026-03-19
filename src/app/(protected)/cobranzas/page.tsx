import Link from "next/link";
import {
  createCorteMoraAction,
  updateAcuerdoPagoCuotaEstadoAction,
  updateGestionCobranzaEstadoAction,
} from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getSeguimientoCobranzaData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

function getAbonadoDisplayName(abonado: {
  razonSocial?: string | null;
  apellido?: string | null;
  nombre?: string | null;
}) {
  return abonado.razonSocial || [abonado.apellido, abonado.nombre].filter(Boolean).join(" ") || "-";
}

export default async function CobranzasPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    localidad: getQueryValue(params, "localidad"),
    operadorId: getQueryValue(params, "operadorId"),
    horizonte: getQueryValue(params, "horizonte") || "7",
  };

  const {
    promesasVencidas,
    promesasPorVencer,
    proximasGestiones,
    cuotasVencidas,
    cuotasPorVencer,
    candidatosCorte,
    operadores,
    summary,
  } = await getSeguimientoCobranzaData(filters);

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const returnPath = `/cobranzas${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  const promesasVencidasRows = promesasVencidas.map((gestion) => [
    gestion.abonado.numeroAbonado,
    getAbonadoDisplayName(gestion.abonado),
    gestion.usuario.nombre,
    gestion.factura?.numero ?? "-",
    formatDate(gestion.compromisoPagoAt!.toISOString()),
    formatCurrency(Number(gestion.compromisoImporte ?? 0)),
    <StatusPill key={`estado-pv-${gestion.id}`} tone="warning">
      {gestion.estado}
    </StatusPill>,
    <div className="stack-list" key={`pv-${gestion.id}`}>
      <form action={updateGestionCobranzaEstadoAction} className="inline-form">
        <input name="gestionId" type="hidden" value={gestion.id} />
        <input name="abonadoId" type="hidden" value={gestion.abonadoId} />
        <input name="estado" type="hidden" value="CUMPLIDA" />
        <input name="redirectPath" type="hidden" value={returnPath} />
        <SubmitButton idleLabel="Cumplida" pendingLabel="Guardando..." />
      </form>
      <form action={updateGestionCobranzaEstadoAction} className="inline-form">
        <input name="gestionId" type="hidden" value={gestion.id} />
        <input name="abonadoId" type="hidden" value={gestion.abonadoId} />
        <input name="estado" type="hidden" value="INCUMPLIDA" />
        <input name="redirectPath" type="hidden" value={returnPath} />
        <SubmitButton idleLabel="Incumplida" pendingLabel="Guardando..." />
      </form>
      <Link className="toolbar-button" href={`/cuentas/${gestion.abonadoId}`}>
        Ver cuenta
      </Link>
    </div>,
  ]);

  const promesasPorVencerRows = promesasPorVencer.map((gestion) => [
    gestion.abonado.numeroAbonado,
    getAbonadoDisplayName(gestion.abonado),
    gestion.usuario.nombre,
    formatDate(gestion.compromisoPagoAt!.toISOString()),
    formatCurrency(Number(gestion.compromisoImporte ?? 0)),
    <StatusPill key={`pp-${gestion.id}`} tone="warning">
      PROMESA_VIGENTE
    </StatusPill>,
    <Link className="toolbar-button" href={`/cuentas/${gestion.abonadoId}`} key={`pp-link-${gestion.id}`}>
      Ver cuenta
    </Link>,
  ]);

  const cuotasVencidasRows = cuotasVencidas.map((cuota) => [
    cuota.acuerdoPago.numero,
    cuota.acuerdoPago.abonado.numeroAbonado,
    getAbonadoDisplayName(cuota.acuerdoPago.abonado),
    cuota.numeroCuota,
    formatDate(cuota.fechaVencimiento.toISOString()),
    formatCurrency(Number(cuota.importe)),
    cuota.acuerdoPago.usuario.nombre,
    <div className="stack-list" key={`cv-${cuota.id}`}>
      <form action={updateAcuerdoPagoCuotaEstadoAction} className="inline-form">
        <input name="acuerdoId" type="hidden" value={cuota.acuerdoPago.id} />
        <input name="cuotaId" type="hidden" value={cuota.id} />
        <input name="abonadoId" type="hidden" value={cuota.acuerdoPago.abonadoId} />
        <input name="estado" type="hidden" value="CUMPLIDA" />
        <input name="redirectPath" type="hidden" value={returnPath} />
        <SubmitButton idleLabel="Cumplida" pendingLabel="Guardando..." />
      </form>
      <form action={updateAcuerdoPagoCuotaEstadoAction} className="inline-form">
        <input name="acuerdoId" type="hidden" value={cuota.acuerdoPago.id} />
        <input name="cuotaId" type="hidden" value={cuota.id} />
        <input name="abonadoId" type="hidden" value={cuota.acuerdoPago.abonadoId} />
        <input name="estado" type="hidden" value="INCUMPLIDA" />
        <input name="redirectPath" type="hidden" value={returnPath} />
        <SubmitButton idleLabel="Incumplida" pendingLabel="Guardando..." />
      </form>
      <Link className="toolbar-button" href={`/cuentas/${cuota.acuerdoPago.abonadoId}`}>
        Ver cuenta
      </Link>
    </div>,
  ]);

  const cuotasPorVencerRows = cuotasPorVencer.map((cuota) => [
    cuota.acuerdoPago.numero,
    cuota.acuerdoPago.abonado.numeroAbonado,
    cuota.numeroCuota,
    formatDate(cuota.fechaVencimiento.toISOString()),
    formatCurrency(Number(cuota.importe)),
    cuota.acuerdoPago.usuario.nombre,
  ]);

  const proximasGestionesRows = proximasGestiones.map((gestion) => [
    gestion.abonado.numeroAbonado,
    getAbonadoDisplayName(gestion.abonado),
    gestion.usuario.nombre,
    gestion.canal,
    formatDate(gestion.proximaGestionAt!.toISOString()),
    gestion.resultado,
    <Link className="toolbar-button" href={`/cuentas/${gestion.abonadoId}`} key={`pg-${gestion.id}`}>
      Abrir ficha
    </Link>,
  ]);

  const candidatosCorteRows = candidatosCorte.map((abonado) => [
    abonado.numeroAbonado,
    getAbonadoDisplayName(abonado),
    abonado.localidad || "-",
    String(abonado.facturas.length),
    formatCurrency(abonado.deudaVencida),
    abonado.serviciosActivosSinCorte
      .map((servicio) => servicio.servicioCatalogo?.nombre ?? servicio.plan)
      .join(" / "),
    abonado.promesaVigente ? (
      <StatusPill key={`promesa-corte-${abonado.id}`} tone="warning">
        PROMESA_VIGENTE
      </StatusPill>
    ) : (
      <StatusPill key={`sin-promesa-corte-${abonado.id}`} tone="danger">
        SIN_PROMESA
      </StatusPill>
    ),
    <div className="stack-list" key={`corte-${abonado.id}`}>
      <form action={createCorteMoraAction} className="inline-form">
        <input name="abonadoId" type="hidden" value={abonado.id} />
        <input name="redirectPath" type="hidden" value={returnPath} />
        <SubmitButton idleLabel="Generar corte" pendingLabel="Generando..." />
      </form>
      <Link className="toolbar-button" href={`/cuentas/${abonado.id}`}>
        Ver cuenta
      </Link>
    </div>,
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Bandeja diaria</span>
            <h1>Seguimiento de cobranzas</h1>
            <p>
              Prioriza promesas vencidas, acuerdos en mora y acciones de corte desde una sola vista
              operativa pensada para trabajo diario.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Monto promesas vencidas</span>
              <strong>{formatCurrency(summary.montoPromesasVencidas)}</strong>
              <p>Compromisos ya vencidos que requieren accion inmediata.</p>
            </article>
            <article className="metric-card">
              <span>Monto cuotas vencidas</span>
              <strong>{formatCurrency(summary.montoCuotasVencidas)}</strong>
              <p>Deuda comprometida dentro de planes activos.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <section className="stats-grid stats-grid--ops">
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Promesas vencidas</span>
          <strong className="stat-card__value">{summary.promesasVencidas}</strong>
          <p className="stat-card__detail">Contactos que no cumplieron el compromiso asumido.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Promesas por vencer</span>
          <strong className="stat-card__value">{summary.promesasPorVencer}</strong>
          <p className="stat-card__detail">Compromisos dentro del horizonte de trabajo visible.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Cuotas vencidas</span>
          <strong className="stat-card__value">{summary.cuotasVencidas}</strong>
          <p className="stat-card__detail">Cuotas impagas dentro de acuerdos vigentes.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Cuotas por vencer</span>
          <strong className="stat-card__value">{summary.cuotasPorVencer}</strong>
          <p className="stat-card__detail">Vencimientos proximos para seguimiento preventivo.</p>
        </article>
        <article className="card stat-card">
          <span className="stat-card__label">Proximas gestiones</span>
          <strong className="stat-card__value">{summary.proximasGestiones}</strong>
          <p className="stat-card__detail">Recordatorios operativos dentro del horizonte filtrado.</p>
        </article>
        <article className="card stat-card stat-card--warning">
          <span className="stat-card__label">Candidatos a corte</span>
          <strong className="stat-card__value">{summary.candidatosCorte}</strong>
          <p className="stat-card__detail">Abonados con deuda vencida y servicios activos sin OT abierta.</p>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Filtros de trabajo</h2>
            <p>Acota la bandeja por abonado, localidad, operador y horizonte de seguimiento.</p>
          </div>
          <a className="toolbar-button" href={`/api/export/cobranzas?${exportParams.toString()}`}>
            Exportar CSV
          </a>
        </div>
        <form className="filters-panel">
          <div className="filters-panel__grid">
            <label className="field">
              <span>Busqueda</span>
              <input defaultValue={filters.q} name="q" placeholder="Abonado, telefono o email" type="search" />
            </label>
            <label className="field">
              <span>Localidad</span>
              <input defaultValue={filters.localidad} name="localidad" type="text" />
            </label>
            <label className="field">
              <span>Operador</span>
              <select defaultValue={filters.operadorId} name="operadorId">
                <option value="">Todos</option>
                {operadores.map((operador) => (
                  <option key={operador.id} value={operador.id}>
                    {operador.nombre}
                  </option>
                ))}
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
          </div>
          <div className="filters-panel__actions">
            <button className="toolbar-button" type="submit">
              Filtrar
            </button>
            <Link className="toolbar-button" href="/cobranzas">
              Limpiar
            </Link>
          </div>
        </form>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Candidatos a corte por mora</h2>
            <p>{candidatosCorte.length} abonados listos para generar ordenes de corte desde cobranzas.</p>
          </div>
        </div>
        <DataTable
          columns={[
            "Abonado",
            "Titular",
            "Localidad",
            "Facturas vencidas",
            "Deuda vencida",
            "Servicios activos",
            "Promesa",
            "Acciones",
          ]}
          rows={candidatosCorteRows}
          emptyMessage="No hay abonados candidatos a corte en este corte."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Promesas vencidas</h2>
            <p>{promesasVencidas.length} compromisos ya incumplidos.</p>
          </div>
        </div>
        <DataTable
          columns={["Abonado", "Titular", "Operador", "Factura", "Compromiso", "Importe", "Estado", "Acciones"]}
          rows={promesasVencidasRows}
          emptyMessage="No hay promesas vencidas en este corte."
        />
      </article>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Cuotas vencidas</h2>
              <p>{cuotasVencidas.length} cuotas en mora dentro de acuerdos activos.</p>
            </div>
          </div>
          <DataTable
            columns={["Acuerdo", "Abonado", "Titular", "Cuota", "Vencimiento", "Importe", "Operador", "Acciones"]}
            rows={cuotasVencidasRows}
            emptyMessage="No hay cuotas vencidas para este corte."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Proximas gestiones</h2>
              <p>{proximasGestiones.length} contactos programados dentro del horizonte elegido.</p>
            </div>
          </div>
          <DataTable
            columns={["Abonado", "Titular", "Operador", "Canal", "Fecha", "Resultado", "Ficha"]}
            rows={proximasGestionesRows}
            emptyMessage="No hay proximas gestiones programadas."
          />
        </article>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Promesas por vencer</h2>
              <p>{promesasPorVencer.length} compromisos dentro del horizonte de trabajo.</p>
            </div>
          </div>
          <DataTable
            columns={["Abonado", "Titular", "Operador", "Fecha", "Importe", "Estado", "Ficha"]}
            rows={promesasPorVencerRows}
            emptyMessage="No hay promesas proximas a vencer."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Cuotas por vencer</h2>
              <p>{cuotasPorVencer.length} cuotas proximas para seguimiento preventivo.</p>
            </div>
          </div>
          <DataTable
            columns={["Acuerdo", "Abonado", "Cuota", "Vencimiento", "Importe", "Operador"]}
            rows={cuotasPorVencerRows}
            emptyMessage="No hay cuotas proximas a vencer."
          />
        </article>
      </section>
    </section>
  );
}
