import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createAcuerdoPagoAction,
  createGestionCobranzaAction,
  updateAcuerdoPagoCuotaEstadoAction,
  updateGestionCobranzaEstadoAction,
} from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { PrintButton } from "@/components/shared/print-button";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import {
  COLLECTION_CHANNELS,
  COLLECTION_OUTCOMES,
  COLLECTION_STATES,
} from "@/lib/domain";
import { getCuentaCorrienteProfile } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime, getDaysOverdue } from "@/lib/utils";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function CuentaCorrienteProfilePage({ params }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const { id } = await params;
  const abonadoId = Number.parseInt(id, 10);

  if (Number.isNaN(abonadoId)) {
    notFound();
  }

  const profile = await getCuentaCorrienteProfile(abonadoId);
  if (!profile) {
    notFound();
  }

  const { abonado, summary, usuariosCobranza } = profile;
  const titular =
    abonado.razonSocial ||
    [abonado.apellido, abonado.nombre].filter(Boolean).join(" ") ||
    abonado.numeroAbonado;

  const facturasRows = abonado.facturas.map((factura) => [
    factura.numero,
    formatDate(factura.fechaEmision.toISOString()),
    formatDate(factura.fechaVencimiento.toISOString()),
    factura.estado === "VENCIDA" ? `${getDaysOverdue(factura.fechaVencimiento.toISOString())} dias` : "-",
    formatCurrency(Number(factura.total)),
    <StatusPill key={`estado-${factura.id}`} tone={factura.estado === "VENCIDA" ? "danger" : "warning"}>
      {factura.estado}
    </StatusPill>,
    <Link className="toolbar-button" href={`/facturacion/${factura.id}`} key={`factura-${factura.id}`}>
      Ver factura
    </Link>,
  ]);

  const pagosRows = abonado.pagos.map((pago) => [
    pago.numeroRecibo ?? `PAGO-${pago.id}`,
    formatDateTime(pago.fecha.toISOString()),
    pago.medioPago,
    pago.usuario.nombre,
    formatCurrency(Number(pago.importe)),
    <Link className="toolbar-button" href={`/recibos/${pago.id}`} key={`recibo-${pago.id}`}>
      Ver recibo
    </Link>,
  ]);

  const movimientosRows = abonado.movimientos
    .slice()
    .reverse()
    .map((movimiento) => [
      formatDateTime(movimiento.fecha.toISOString()),
      <StatusPill
        key={`tipo-${movimiento.id}`}
        tone={movimiento.tipo === "DEBITO" ? "warning" : "success"}
      >
        {movimiento.tipo}
      </StatusPill>,
      movimiento.factura?.numero ?? movimiento.pago?.numeroRecibo ?? `MOV-${movimiento.id}`,
      movimiento.descripcion,
      formatCurrency(Number(movimiento.importe)),
      formatCurrency(Number(movimiento.saldo)),
      <StatusPill key={`vigencia-${movimiento.id}`} tone={movimiento.anuladoAt ? "danger" : "neutral"}>
        {movimiento.anuladoAt ? "ANULADO" : "VIGENTE"}
      </StatusPill>,
    ]);

  const gestionesRows = abonado.gestionesCobranza.map((gestion) => [
    formatDateTime(gestion.createdAt.toISOString()),
    gestion.usuario.nombre,
    gestion.canal,
    gestion.resultado,
    <StatusPill
      key={`estado-gestion-${gestion.id}`}
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
    gestion.factura?.numero ?? "-",
    gestion.compromisoPagoAt
      ? `${formatDate(gestion.compromisoPagoAt.toISOString())} / ${formatCurrency(Number(gestion.compromisoImporte ?? 0))}`
      : "-",
    gestion.proximaGestionAt ? formatDate(gestion.proximaGestionAt.toISOString()) : "-",
    gestion.detalle ?? "-",
    ["CUMPLIDA", "INCUMPLIDA", "CERRADA"].includes(gestion.estado) ? (
      "Cerrada"
    ) : (
      <div className="stack-list" key={`acciones-gestion-${gestion.id}`}>
        <form action={updateGestionCobranzaEstadoAction} className="inline-form">
          <input name="gestionId" type="hidden" value={gestion.id} />
          <input name="abonadoId" type="hidden" value={abonado.id} />
          <input name="estado" type="hidden" value="CUMPLIDA" />
          <SubmitButton idleLabel="Cumplida" pendingLabel="Guardando..." />
        </form>
        <form action={updateGestionCobranzaEstadoAction} className="inline-form">
          <input name="gestionId" type="hidden" value={gestion.id} />
          <input name="abonadoId" type="hidden" value={abonado.id} />
          <input name="estado" type="hidden" value="INCUMPLIDA" />
          <SubmitButton idleLabel="Incumplida" pendingLabel="Guardando..." />
        </form>
      </div>
    ),
  ]);

  const acuerdosRows = abonado.acuerdosPago.map((acuerdo) => {
    const cuotasCumplidas = acuerdo.cuotas.filter((cuota) => cuota.estado === "CUMPLIDA").length;
    const cuotasPendientes = acuerdo.cuotas.filter((cuota) => cuota.estado === "PENDIENTE");
    const siguienteCuota = cuotasPendientes[0] ?? acuerdo.cuotas[acuerdo.cuotas.length - 1];

    return [
      acuerdo.numero,
      formatDate(acuerdo.fechaAcuerdo.toISOString()),
      acuerdo.usuario.nombre,
      acuerdo.factura?.numero ?? "-",
      formatCurrency(Number(acuerdo.totalAcuerdo)),
      `${cuotasCumplidas}/${acuerdo.cantidadCuotas} cumplidas`,
      siguienteCuota ? formatDate(siguienteCuota.fechaVencimiento.toISOString()) : "-",
      <StatusPill
        key={`estado-acuerdo-${acuerdo.id}`}
        tone={
          acuerdo.estado === "CUMPLIDO"
            ? "success"
            : acuerdo.estado === "INCUMPLIDO"
              ? "danger"
              : acuerdo.estado === "ANULADO"
                ? "neutral"
                : "warning"
        }
      >
        {acuerdo.estado}
      </StatusPill>,
      acuerdo.descripcion ?? acuerdo.observaciones ?? "-",
    ];
  });

  const cuotasRows = abonado.acuerdosPago.flatMap((acuerdo) =>
    acuerdo.cuotas.map((cuota) => [
      acuerdo.numero,
      `Cuota ${cuota.numeroCuota}`,
      formatDate(cuota.fechaVencimiento.toISOString()),
      formatCurrency(Number(cuota.importe)),
      <StatusPill
        key={`estado-cuota-${cuota.id}`}
        tone={
          cuota.estado === "CUMPLIDA"
            ? "success"
            : cuota.estado === "INCUMPLIDA"
              ? "danger"
              : cuota.fechaVencimiento < new Date()
                ? "warning"
                : "neutral"
        }
      >
        {cuota.estado === "PENDIENTE" && cuota.fechaVencimiento < new Date() ? "VENCIDA" : cuota.estado}
      </StatusPill>,
      cuota.observaciones ?? "-",
      cuota.estado === "CUMPLIDA" || acuerdo.estado === "ANULADO" ? (
        "Sin acciones"
      ) : (
        <div className="stack-list" key={`acciones-cuota-${cuota.id}`}>
          <form action={updateAcuerdoPagoCuotaEstadoAction} className="inline-form">
            <input name="acuerdoId" type="hidden" value={acuerdo.id} />
            <input name="cuotaId" type="hidden" value={cuota.id} />
            <input name="abonadoId" type="hidden" value={abonado.id} />
            <input name="estado" type="hidden" value="CUMPLIDA" />
            <SubmitButton idleLabel="Cumplida" pendingLabel="Guardando..." />
          </form>
          <form action={updateAcuerdoPagoCuotaEstadoAction} className="inline-form">
            <input name="acuerdoId" type="hidden" value={acuerdo.id} />
            <input name="cuotaId" type="hidden" value={cuota.id} />
            <input name="abonadoId" type="hidden" value={abonado.id} />
            <input name="estado" type="hidden" value="INCUMPLIDA" />
            <SubmitButton idleLabel="Incumplida" pendingLabel="Guardando..." />
          </form>
        </div>
      ),
    ]),
  );

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Extracto individual</span>
            <h1>{titular}</h1>
            <p>
              Abonado {abonado.numeroAbonado}. Este extracto resume deuda, saldo a favor,
              vencimientos y movimientos administrativos para consulta e impresion.
            </p>
            <div className="hero__chips">
              <StatusPill tone={abonado.estado === "ACTIVO" ? "success" : "warning"}>{abonado.estado}</StatusPill>
              <span className="hero-chip">{abonado.condicionIva}</span>
              <span className="hero-chip">{abonado.localidad}</span>
              <span className="hero-chip">{abonado.servicios.length} servicios</span>
            </div>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card metric-card--dark">
              <span>Saldo actual</span>
              <strong>{formatCurrency(summary.saldoActual)}</strong>
              <p>{summary.saldoActual > 0 ? "Deuda visible" : "Saldo compensado o a favor"}.</p>
            </article>
            <article className="metric-card">
              <span>Vencido</span>
              <strong>{formatCurrency(summary.vencido)}</strong>
              <p>{summary.facturasAbiertas} facturas abiertas visibles.</p>
            </article>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Resumen de cobranzas</h2>
            <p>Estado global del abonado para seguimiento comercial y administrativo.</p>
          </div>
          <div className="toolbar__actions">
            <a className="toolbar-button" href={`/api/export/cuentas?abonadoId=${abonado.id}`}>
              Exportar CSV
            </a>
            <PrintButton label="Imprimir extracto" />
            <Link className="toolbar-button" href="/cuentas">
              Volver
            </Link>
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <div className="field field--readOnly">
            <span>Debitos vigentes</span>
            <div className="field__value">{formatCurrency(summary.debitos)}</div>
          </div>
          <div className="field field--readOnly">
            <span>Creditos vigentes</span>
            <div className="field__value">{formatCurrency(summary.creditos)}</div>
          </div>
          <div className="field field--readOnly">
            <span>Movimientos</span>
            <div className="field__value">
              {summary.movimientos} total / {summary.movimientosAnulados} anulados
            </div>
          </div>
          <div className="field field--readOnly">
            <span>Contacto</span>
            <div className="field__value">{abonado.telefono ?? abonado.email ?? "-"}</div>
          </div>
          <div className="field field--readOnly">
            <span>Gestiones</span>
            <div className="field__value">
              {summary.gestionesCobranza} total / {summary.promesasVigentes} promesas / {summary.promesasVencidas} vencidas
            </div>
          </div>
          <div className="field field--readOnly">
            <span>Planes</span>
            <div className="field__value">
              {summary.acuerdosPago} total / {summary.acuerdosVigentes} vigentes / {summary.cuotasVencidas} cuotas vencidas
            </div>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Registrar gestion de cobranza</h2>
            <p>Deja trazabilidad de contacto, promesa de pago y proxima accion sobre la cuenta.</p>
          </div>
        </div>
        <form action={createGestionCobranzaAction} className="form-panel">
          <input name="abonadoId" type="hidden" value={abonado.id} />
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Operador</span>
              <select defaultValue="" disabled>
                <option value="">{usuariosCobranza.map((usuario) => usuario.nombre).join(" / ")}</option>
              </select>
            </label>
            <label className="field">
              <span>Factura vinculada</span>
              <select defaultValue="" name="facturaId">
                <option value="">Sin vincular</option>
                {abonado.facturas.map((factura) => (
                  <option key={factura.id} value={factura.id}>
                    {factura.numero} - {formatCurrency(Number(factura.total))}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Canal</span>
              <select defaultValue="TELEFONO" name="canal" required>
                {COLLECTION_CHANNELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Resultado</span>
              <select defaultValue="CONTACTADO" name="resultado" required>
                {COLLECTION_OUTCOMES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estado</span>
              <select defaultValue="" name="estado">
                <option value="">Automatico segun compromiso</option>
                {COLLECTION_STATES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Promesa de pago</span>
              <input name="compromisoPagoAt" type="date" />
            </label>
            <label className="field">
              <span>Importe comprometido</span>
              <input name="compromisoImporte" placeholder="25000" type="text" />
            </label>
            <label className="field">
              <span>Proxima gestion</span>
              <input name="proximaGestionAt" type="date" />
            </label>
          </div>
          <label className="field">
            <span>Detalle</span>
            <textarea name="detalle" placeholder="Resumen del contacto, acuerdo o motivo de mora." rows={3} />
          </label>
          <div className="form-actions">
            <SubmitButton idleLabel="Registrar gestion" pendingLabel="Guardando..." />
          </div>
        </form>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Registrar plan de pago</h2>
            <p>Crea un acuerdo con cuotas mensuales para formalizar el recupero de deuda.</p>
          </div>
        </div>
        <form action={createAcuerdoPagoAction} className="form-panel">
          <input name="abonadoId" type="hidden" value={abonado.id} />
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Factura vinculada</span>
              <select defaultValue="" name="facturaId">
                <option value="">Sin vincular</option>
                {abonado.facturas.map((factura) => (
                  <option key={`plan-${factura.id}`} value={factura.id}>
                    {factura.numero} - {formatCurrency(Number(factura.total))}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Monto total</span>
              <input name="totalAcuerdo" placeholder="60000" required type="text" />
            </label>
            <label className="field">
              <span>Cantidad de cuotas</span>
              <input defaultValue="3" max="36" min="1" name="cantidadCuotas" required type="number" />
            </label>
            <label className="field">
              <span>Primer vencimiento</span>
              <input name="primerVencimiento" required type="date" />
            </label>
            <label className="field">
              <span>Descripcion</span>
              <input name="descripcion" placeholder="Plan de regularizacion deuda vencida" type="text" />
            </label>
            <label className="field">
              <span>Observaciones</span>
              <input name="observaciones" placeholder="Acordado por telefono" type="text" />
            </label>
          </div>
          <div className="form-actions">
            <SubmitButton idleLabel="Crear plan" pendingLabel="Generando..." />
          </div>
        </form>
      </article>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Facturas abiertas</h2>
              <p>{abonado.facturas.length} comprobantes pendientes o vencidos.</p>
            </div>
          </div>
          <DataTable
            columns={["Factura", "Emision", "Vencimiento", "Mora", "Total", "Estado", "Relacion"]}
            rows={facturasRows}
            emptyMessage="No hay facturas abiertas para este abonado."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Ultimos pagos</h2>
              <p>{abonado.pagos.length} recibos registrados recientemente.</p>
            </div>
          </div>
          <DataTable
            columns={["Recibo", "Fecha", "Medio", "Operador", "Importe", "Relacion"]}
            rows={pagosRows}
            emptyMessage="No hay pagos registrados para este abonado."
          />
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Planes de pago</h2>
            <p>{abonado.acuerdosPago.length} acuerdos formales registrados para este abonado.</p>
          </div>
        </div>
        <DataTable
          columns={["Numero", "Fecha", "Operador", "Factura", "Monto", "Cuotas", "Proximo vencimiento", "Estado", "Detalle"]}
          rows={acuerdosRows}
          emptyMessage="No hay planes de pago registrados para este abonado."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Cuotas comprometidas</h2>
            <p>{abonado.acuerdosPago.reduce((sum, acuerdo) => sum + acuerdo.cuotas.length, 0)} cuotas visibles para seguimiento.</p>
          </div>
        </div>
        <DataTable
          columns={["Acuerdo", "Cuota", "Vencimiento", "Importe", "Estado", "Observaciones", "Acciones"]}
          rows={cuotasRows}
          emptyMessage="No hay cuotas registradas para este abonado."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Bitacora de cobranzas</h2>
            <p>{abonado.gestionesCobranza.length} gestiones registradas para seguimiento de deuda y compromisos.</p>
          </div>
        </div>
        <DataTable
          columns={[
            "Fecha",
            "Operador",
            "Canal",
            "Resultado",
            "Estado",
            "Factura",
            "Compromiso",
            "Proxima accion",
            "Detalle",
            "Acciones",
          ]}
          rows={gestionesRows}
          emptyMessage="No hay gestiones de cobranza registradas para este abonado."
        />
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Extracto cronologico</h2>
            <p>{abonado.movimientos.length} movimientos administrativos y financieros registrados.</p>
          </div>
        </div>
        <DataTable
          columns={["Fecha", "Tipo", "Referencia", "Descripcion", "Importe", "Saldo", "Vigencia"]}
          rows={movimientosRows}
          emptyMessage="No hay movimientos para este abonado."
        />
      </article>
    </section>
  );
}
