import Link from "next/link";
import {
  confirmPagoExternoAction,
  createPagoExternoAction,
  createPasarelaPagoAction,
  registerWebhookPasarelaAction,
  reprocessWebhookPasarelaAction,
  runAutomationCycleAction,
  updatePasarelaPagoAction,
  updateReglaAutomatizacionAction,
} from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getPasarelasData } from "@/lib/data";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

function getAbonadoDisplayName(abonado: {
  numeroAbonado: string;
  razonSocial?: string | null;
  apellido?: string | null;
  nombre?: string | null;
}) {
  return abonado.razonSocial || [abonado.apellido, abonado.nombre].filter(Boolean).join(" ") || abonado.numeroAbonado;
}

export default async function PasarelasPage({ searchParams }: PageProps) {
  const user = await requireRole(["ADMIN", "CAJA"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const preselectedAbonado = getQueryValue(params, "abonadoId");
  const preselectedFactura = getQueryValue(params, "facturaId");

  const { pasarelas, pagosExternos, webhooks, regla, summary, providers, modes, abonados, ejecuciones } =
    await getPasarelasData();

  const pagosRows = pagosExternos.map((pagoExterno) => [
    formatDateTime(pagoExterno.createdAt.toISOString()),
    pagoExterno.referenciaInterna,
    pagoExterno.pasarela.nombre,
    `${pagoExterno.abonado.numeroAbonado} - ${getAbonadoDisplayName(pagoExterno.abonado)}`,
    pagoExterno.factura?.numero ?? "Cuenta general",
    formatCurrency(Number(pagoExterno.importe)),
    <StatusPill
      key={`estado-ext-${pagoExterno.id}`}
      tone={
        pagoExterno.estado === "ACREDITADO"
          ? "success"
          : ["RECHAZADO", "ANULADO", "EXPIRADO"].includes(pagoExterno.estado)
            ? "danger"
            : "warning"
      }
    >
      {pagoExterno.estado}
    </StatusPill>,
    <div className="workspace-action-row" key={`acciones-ext-${pagoExterno.id}`}>
      {pagoExterno.checkoutUrl ? (
        <a className="toolbar-button" href={pagoExterno.checkoutUrl} rel="noreferrer" target="_blank">
          Checkout
        </a>
      ) : null}
      {pagoExterno.pago?.numeroRecibo ? (
        <Link className="toolbar-button" href={`/recibos/${pagoExterno.pago.id}`}>
          {pagoExterno.pago.numeroRecibo}
        </Link>
      ) : null}
      {!["ACREDITADO", "ANULADO"].includes(pagoExterno.estado) ? (
        <form action={confirmPagoExternoAction}>
          <input name="pagoExternoId" type="hidden" value={pagoExterno.id} />
          <input name="estado" type="hidden" value="ACREDITADO" />
          <input name="redirectPath" type="hidden" value="/pasarelas" />
          <SubmitButton idleLabel="Acreditar" pendingLabel="Procesando..." />
        </form>
      ) : null}
      {!["RECHAZADO", "ACREDITADO", "ANULADO"].includes(pagoExterno.estado) ? (
        <form action={confirmPagoExternoAction}>
          <input name="pagoExternoId" type="hidden" value={pagoExterno.id} />
          <input name="estado" type="hidden" value="RECHAZADO" />
          <input name="redirectPath" type="hidden" value="/pasarelas" />
          <SubmitButton idleLabel="Rechazar" pendingLabel="Actualizando..." />
        </form>
      ) : null}
    </div>,
  ]);

  const webhookRows = webhooks.map((webhook) => [
    formatDateTime(webhook.createdAt.toISOString()),
    webhook.pasarela.nombre,
    webhook.tipoEvento,
    webhook.referenciaExterna ?? webhook.pagoExterno?.referenciaInterna ?? "-",
    <StatusPill
      key={`webhook-${webhook.id}`}
      tone={webhook.estado === "ERROR" ? "danger" : webhook.estado === "PROCESADO" ? "success" : "warning"}
    >
      {webhook.estado}
    </StatusPill>,
    webhook.firmaValida === null ? "-" : webhook.firmaValida ? "SI" : "NO",
    <div className="workspace-action-row" key={`webhook-actions-${webhook.id}`}>
      {webhook.pagoExterno ? (
        <Link className="toolbar-button" href={`/abonados/${webhook.pagoExterno.abonadoId}?tab=finanzas`}>
          Ver abonado
        </Link>
      ) : null}
      <form action={reprocessWebhookPasarelaAction}>
        <input name="webhookId" type="hidden" value={webhook.id} />
        <input name="redirectPath" type="hidden" value="/pasarelas" />
        <SubmitButton idleLabel="Reprocesar" pendingLabel="Procesando..." />
      </form>
    </div>,
  ]);
  const ejecucionesRows = ejecuciones.map((ejecucion) => [
    formatDateTime(ejecucion.createdAt.toISOString()),
    ejecucion.codigo,
    ejecucion.origen,
    <StatusPill
      key={`ejecucion-${ejecucion.id}`}
      tone={ejecucion.estado === "OK" ? "success" : ejecucion.estado === "SKIPPED" ? "warning" : "danger"}
    >
      {ejecucion.estado}
    </StatusPill>,
    String(ejecucion.cortesGenerados),
    String(ejecucion.reconexionesGeneradas),
    ejecucion.resumen,
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro section-intro--finance">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Cobro digital y automatizaciones</span>
            <h1>Pasarelas de pago y reglas operativas</h1>
            <p>
              Configura gateways, genera pagos online, audita webhooks y valida cuando corresponde
              cortar o reconectar servicios automaticamente.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Pasarelas activas</span>
              <strong>{summary.pasarelasActivas}</strong>
              <p>Canales listos para generar referencias y checkout.</p>
            </article>
            <article className="metric-card">
              <span>Pagos pendientes</span>
              <strong>{summary.pagosPendientes}</strong>
              <p>Intenciones aun no acreditadas o en proceso.</p>
            </article>
            <article className="metric-card">
              <span>Acreditados</span>
              <strong>{summary.pagosAcreditados}</strong>
              <p>Pagos online ya conciliados contra cuenta corriente.</p>
            </article>
            <article className="metric-card">
              <span>Webhooks con error</span>
              <strong>{summary.webhooksConError}</strong>
              <p>Eventos externos que requieren revision manual.</p>
            </article>
          </div>
        </div>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Regla base de automatizacion</h2>
              <p>Valida deuda, promesas, acuerdos y pagos acreditados antes de cortar o reconectar.</p>
            </div>
            <form action={runAutomationCycleAction}>
              <input name="redirectPath" type="hidden" value="/pasarelas" />
              <SubmitButton idleLabel="Ejecutar ciclo ahora" pendingLabel="Ejecutando..." />
            </form>
          </div>
          <form action={updateReglaAutomatizacionAction} className="form-panel">
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Nombre</span>
                <input defaultValue={regla?.nombre ?? ""} name="nombre" required type="text" />
              </label>
              <label className="field">
                <span>Facturas vencidas minimas</span>
                <input
                  defaultValue={String(regla?.minFacturasVencidasParaCorte ?? 1)}
                  min="1"
                  name="minFacturasVencidasParaCorte"
                  required
                  type="number"
                />
              </label>
              <label className="field">
                <span>Dias de gracia</span>
                <input defaultValue={String(regla?.diasGraciaCorte ?? 0)} min="0" name="diasGraciaCorte" required type="number" />
              </label>
              <label className="field">
                <span>Monto minimo deuda</span>
                <input defaultValue={String(Number(regla?.montoMinimoCorte ?? 0))} name="montoMinimoCorte" required type="text" />
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Regla activa</span>
                <div className="field__value">
                  <input defaultChecked={regla?.activa ?? true} name="activa" type="checkbox" value="SI" />
                </div>
              </label>
              <label className="field">
                <span>Requiere pago acreditado</span>
                <div className="field__value">
                  <input
                    defaultChecked={regla?.requierePagoAcreditado ?? true}
                    name="requierePagoAcreditado"
                    type="checkbox"
                    value="SI"
                  />
                </div>
              </label>
              <label className="field">
                <span>Bloquear con promesa vigente</span>
                <div className="field__value">
                  <input
                    defaultChecked={regla?.bloquearConPromesaVigente ?? true}
                    name="bloquearConPromesaVigente"
                    type="checkbox"
                    value="SI"
                  />
                </div>
              </label>
              <label className="field">
                <span>Bloquear con acuerdo vigente</span>
                <div className="field__value">
                  <input
                    defaultChecked={regla?.bloquearConAcuerdoVigente ?? true}
                    name="bloquearConAcuerdoVigente"
                    type="checkbox"
                    value="SI"
                  />
                </div>
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Reconectar con saldo cero</span>
                <div className="field__value">
                  <input defaultChecked={regla?.reactivarConSaldoCero ?? true} name="reactivarConSaldoCero" type="checkbox" value="SI" />
                </div>
              </label>
              <label className="field">
                <span>Reconectar con pago confirmado</span>
                <div className="field__value">
                  <input
                    defaultChecked={regla?.reactivarConPagoConfirmado ?? true}
                    name="reactivarConPagoConfirmado"
                    type="checkbox"
                    value="SI"
                  />
                </div>
              </label>
              <label className="field">
                <span>Generar corte automatico</span>
                <div className="field__value">
                  <input
                    defaultChecked={regla?.generarOrdenCorteAutomatica ?? false}
                    name="generarOrdenCorteAutomatica"
                    type="checkbox"
                    value="SI"
                  />
                </div>
              </label>
              <label className="field">
                <span>Generar reconexion automatica</span>
                <div className="field__value">
                  <input
                    defaultChecked={regla?.generarOrdenReconexionAutomatica ?? false}
                    name="generarOrdenReconexionAutomatica"
                    type="checkbox"
                    value="SI"
                  />
                </div>
              </label>
            </div>
            <label className="field">
              <span>Observaciones</span>
              <textarea defaultValue={regla?.observaciones ?? ""} name="observaciones" rows={3} />
            </label>
            <div className="form-actions">
              <SubmitButton idleLabel="Guardar regla" pendingLabel="Guardando..." />
            </div>
          </form>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Nuevo pago online</h2>
              <p>Genera una referencia de cobro y deja lista la conciliacion posterior.</p>
            </div>
          </div>
          <form action={createPagoExternoAction} className="form-panel">
            <input name="redirectPath" type="hidden" value="/pasarelas" />
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Abonado</span>
                <select defaultValue={preselectedAbonado} name="abonadoId" required>
                  <option value="">Seleccionar abonado</option>
                  {abonados.map((abonado) => (
                    <option key={abonado.id} value={abonado.id}>
                      {abonado.numeroAbonado} - {getAbonadoDisplayName(abonado)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Factura asociada</span>
                <input defaultValue={preselectedFactura} name="facturaId" placeholder="Opcional / ID interna" type="text" />
              </label>
              <label className="field">
                <span>Pasarela</span>
                <select defaultValue="" name="pasarelaId" required>
                  <option value="">Seleccionar pasarela</option>
                  {pasarelas.filter((item) => item.activa).map((pasarela) => (
                    <option key={pasarela.id} value={pasarela.id}>
                      {pasarela.nombre} / {pasarela.proveedor} / {pasarela.modo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Importe</span>
                <input name="importe" placeholder="15000" required type="text" />
              </label>
            </div>
            <label className="field">
              <span>Descripcion</span>
              <input name="descripcion" placeholder="Link de pago para deuda o comprobante" type="text" />
            </label>
            <div className="form-actions">
              <SubmitButton idleLabel="Generar pago online" pendingLabel="Generando..." />
            </div>
          </form>
        </article>
      </section>

      <section className="split-grid split-grid--equal">
        <article className="card card--embedded">
          <div className="section-heading">
            <div>
              <h2>Endpoints operativos</h2>
              <p>Listos para cron externo, webhooks reales y pruebas automáticas.</p>
            </div>
          </div>
          <div className="stack-list">
            <article className="stack-list__item">
              <strong>Ciclo automatizado</strong>
              <p>
                <code>/api/automatizaciones/ciclo</code> con <code>x-automation-token</code>
              </p>
            </article>
            <article className="stack-list__item">
              <strong>Webhook por pasarela</strong>
              <p>
                <code>/api/webhooks/pasarelas/[CODIGO]</code> con <code>x-webhook-token</code>
              </p>
            </article>
          </div>
        </article>

        <article className="card card--embedded">
          <div className="section-heading">
            <div>
              <h2>Secuencia sugerida</h2>
              <p>Orden recomendado para pasar de esta base técnica a integración productiva.</p>
            </div>
          </div>
          <div className="stack-list">
            <article className="stack-list__item">
              <strong>1. Cargar credenciales finales</strong>
              <p>Completar URL de checkout, webhook y token del proveedor.</p>
            </article>
            <article className="stack-list__item">
              <strong>2. Validar cobros</strong>
              <p>Probar referencias, webhook y conciliación contra recibos internos.</p>
            </article>
            <article className="stack-list__item">
              <strong>3. Programar el motor</strong>
              <p>Invocar el ciclo con cron del hosting o un scheduler externo seguro.</p>
            </article>
          </div>
        </article>
      </section>

      {user.rol === "ADMIN" ? (
        <section className="split-grid split-grid--equal">
          <article className="card">
            <div className="section-heading">
              <div>
                <h2>Nueva pasarela</h2>
                <p>Configuracion base para Mercado Pago u otros proveedores futuros.</p>
              </div>
            </div>
            <form action={createPasarelaPagoAction} className="form-panel">
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Codigo</span>
                  <input name="codigo" placeholder="MP-COOP" required type="text" />
                </label>
                <label className="field">
                  <span>Nombre</span>
                  <input name="nombre" placeholder="Mercado Pago Cooperativa" required type="text" />
                </label>
                <label className="field">
                  <span>Proveedor</span>
                  <select defaultValue="MERCADO_PAGO" name="proveedor" required>
                    {providers.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Modo</span>
                  <select defaultValue="PRUEBA" name="modo" required>
                    {modes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Checkout base URL</span>
                  <input name="checkoutBaseUrl" placeholder="https://..." type="text" />
                </label>
                <label className="field">
                  <span>Webhook path</span>
                  <input name="webhookPath" placeholder="/api/webhooks/mercadopago" type="text" />
                </label>
                <label className="field">
                  <span>Public key</span>
                  <input name="publicKey" placeholder="APP_USR..." type="text" />
                </label>
                <label className="field">
                  <span>Secret key visible</span>
                  <input name="secretKeyMasked" placeholder="TOKEN ENMASCARADO" type="text" />
                </label>
              </div>
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Activa</span>
                  <div className="field__value">
                    <input defaultChecked name="activa" type="checkbox" value="SI" />
                  </div>
                </label>
                <label className="field">
                  <span>Confirmacion automatica</span>
                  <div className="field__value">
                    <input name="confirmacionAutomatica" type="checkbox" value="SI" />
                  </div>
                </label>
                <label className="field">
                  <span>Permite corte automatico</span>
                  <div className="field__value">
                    <input name="permiteCorteAutomatico" type="checkbox" value="SI" />
                  </div>
                </label>
                <label className="field">
                  <span>Permite reconexion automatica</span>
                  <div className="field__value">
                    <input name="permiteReconexionAutomatica" type="checkbox" value="SI" />
                  </div>
                </label>
              </div>
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Requiere validacion manual</span>
                  <div className="field__value">
                    <input defaultChecked name="requiereValidacionManual" type="checkbox" value="SI" />
                  </div>
                </label>
                <label className="field">
                  <span>Orden</span>
                  <input defaultValue="0" min="0" name="orden" type="number" />
                </label>
                <label className="field field--span-2">
                  <span>Observaciones</span>
                  <input name="observaciones" placeholder="Notas internas o consideraciones del proveedor" type="text" />
                </label>
              </div>
              <div className="form-actions">
                <SubmitButton idleLabel="Crear pasarela" pendingLabel="Creando..." />
              </div>
            </form>
          </article>

          <article className="card">
            <div className="section-heading">
              <div>
                <h2>Webhooks de prueba</h2>
                <p>Auditoria para integrar luego firmas y endpoints reales sin improvisar.</p>
              </div>
            </div>
            <form action={registerWebhookPasarelaAction} className="form-panel">
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Pasarela</span>
                  <select defaultValue="" name="pasarelaId" required>
                    <option value="">Seleccionar</option>
                    {pasarelas.map((pasarela) => (
                      <option key={pasarela.id} value={pasarela.id}>
                        {pasarela.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Pago externo</span>
                  <select defaultValue="" name="pagoExternoId">
                    <option value="">Sin asociar</option>
                    {pagosExternos.slice(0, 20).map((pagoExterno) => (
                      <option key={pagoExterno.id} value={pagoExterno.id}>
                        {pagoExterno.referenciaInterna}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Tipo de evento</span>
                  <input defaultValue="payment.updated" name="tipoEvento" required type="text" />
                </label>
                <label className="field">
                  <span>Referencia externa</span>
                  <input name="referenciaExterna" placeholder="ID externo del proveedor" type="text" />
                </label>
              </div>
              <div className="form-grid form-grid--4">
                <label className="field">
                  <span>Estado</span>
                  <select defaultValue="RECIBIDO" name="estado">
                    <option value="RECIBIDO">RECIBIDO</option>
                    <option value="VALIDADO">VALIDADO</option>
                    <option value="PROCESADO">PROCESADO</option>
                    <option value="ERROR">ERROR</option>
                  </select>
                </label>
                <label className="field">
                  <span>Firma valida</span>
                  <div className="field__value">
                    <input name="firmaValida" type="checkbox" value="SI" />
                  </div>
                </label>
              </div>
              <label className="field">
                <span>Payload JSON</span>
                <textarea
                  defaultValue={'{"event":"payment.updated","source":"manual-test"}'}
                  name="payloadJson"
                  required
                  rows={6}
                />
              </label>
              <div className="form-actions">
                <SubmitButton idleLabel="Registrar webhook" pendingLabel="Guardando..." />
              </div>
            </form>
          </article>
        </section>
      ) : null}

      {user.rol === "ADMIN" ? (
        <div className="task-list">
          {pasarelas.map((pasarela) => (
            <article className="card card--embedded" key={pasarela.id}>
              <div className="section-heading">
                <div>
                  <h2>{pasarela.nombre}</h2>
                  <p>
                    {pasarela.codigo} / {pasarela.proveedor} / {pasarela.modo}
                  </p>
                </div>
                <div className="hero__chips">
                  <StatusPill tone={pasarela.activa ? "success" : "warning"}>
                    {pasarela.activa ? "ACTIVA" : "INACTIVA"}
                  </StatusPill>
                  <span className="hero-chip">{pasarela.pagosExternos.length} refs recientes</span>
                </div>
              </div>
              <form action={updatePasarelaPagoAction} className="form-panel">
                <input name="pasarelaId" type="hidden" value={pasarela.id} />
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Codigo</span>
                    <input defaultValue={pasarela.codigo} name="codigo" required type="text" />
                  </label>
                  <label className="field">
                    <span>Nombre</span>
                    <input defaultValue={pasarela.nombre} name="nombre" required type="text" />
                  </label>
                  <label className="field">
                    <span>Proveedor</span>
                    <select defaultValue={pasarela.proveedor} name="proveedor" required>
                      {providers.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Modo</span>
                    <select defaultValue={pasarela.modo} name="modo" required>
                      {modes.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Checkout base URL</span>
                    <input defaultValue={pasarela.checkoutBaseUrl ?? ""} name="checkoutBaseUrl" type="text" />
                  </label>
                  <label className="field">
                    <span>Webhook path</span>
                    <input defaultValue={pasarela.webhookPath ?? ""} name="webhookPath" type="text" />
                  </label>
                  <label className="field">
                    <span>Public key</span>
                    <input defaultValue={pasarela.publicKey ?? ""} name="publicKey" type="text" />
                  </label>
                  <label className="field">
                    <span>Secret key visible</span>
                    <input defaultValue={pasarela.secretKeyMasked ?? ""} name="secretKeyMasked" type="text" />
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Activa</span>
                    <div className="field__value">
                      <input defaultChecked={pasarela.activa} name="activa" type="checkbox" value="SI" />
                    </div>
                  </label>
                  <label className="field">
                    <span>Confirmacion automatica</span>
                    <div className="field__value">
                      <input
                        defaultChecked={pasarela.confirmacionAutomatica}
                        name="confirmacionAutomatica"
                        type="checkbox"
                        value="SI"
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>Permite corte automatico</span>
                    <div className="field__value">
                      <input
                        defaultChecked={pasarela.permiteCorteAutomatico}
                        name="permiteCorteAutomatico"
                        type="checkbox"
                        value="SI"
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>Permite reconexion automatica</span>
                    <div className="field__value">
                      <input
                        defaultChecked={pasarela.permiteReconexionAutomatica}
                        name="permiteReconexionAutomatica"
                        type="checkbox"
                        value="SI"
                      />
                    </div>
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Requiere validacion manual</span>
                    <div className="field__value">
                      <input
                        defaultChecked={pasarela.requiereValidacionManual}
                        name="requiereValidacionManual"
                        type="checkbox"
                        value="SI"
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>Orden</span>
                    <input defaultValue={String(pasarela.orden)} min="0" name="orden" type="number" />
                  </label>
                  <label className="field field--span-2">
                    <span>Observaciones</span>
                    <input defaultValue={pasarela.observaciones ?? ""} name="observaciones" type="text" />
                  </label>
                </div>
                <div className="form-actions">
                  <SubmitButton idleLabel="Guardar pasarela" pendingLabel="Guardando..." />
                </div>
              </form>
            </article>
          ))}
        </div>
      ) : null}

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Pagos online recientes</h2>
              <p>Conciliacion, estados externos y trazabilidad hacia recibos internos.</p>
            </div>
          </div>
          <DataTable
            columns={["Fecha", "Referencia", "Pasarela", "Abonado", "Factura", "Importe", "Estado", "Acciones"]}
            rows={pagosRows}
            emptyMessage="Aun no hay pagos online generados."
          />
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Eventos webhook</h2>
              <p>Historial de eventos externos para pruebas, auditoria y futura integracion real.</p>
            </div>
          </div>
          <DataTable
            columns={["Fecha", "Pasarela", "Evento", "Referencia", "Estado", "Firma valida", "Acciones"]}
            rows={webhookRows}
            emptyMessage="Todavia no hay webhooks registrados."
          />
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Ejecuciones del motor</h2>
            <p>Historial de corridas manuales para auditar cortes y reconexiones automáticas.</p>
          </div>
        </div>
        <DataTable
          columns={["Fecha", "Regla", "Origen", "Estado", "Cortes", "Reconexiones", "Resumen"]}
          rows={ejecucionesRows}
          emptyMessage="Todavia no hay ejecuciones registradas."
        />
      </article>
    </section>
  );
}
