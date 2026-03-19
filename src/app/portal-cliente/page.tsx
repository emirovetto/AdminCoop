import Link from "next/link";
import {
  createPortalClientBulkInteractionAction,
  createPortalClientInteractionAction,
  createPortalSupportRequestAction,
  portalChangePasswordAction,
  portalLogoutAction,
} from "@/app/actions";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requirePortalSession } from "@/lib/auth";
import { getOficinaVirtualPreview } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TabKey = "resumen" | "inbox" | "documentos" | "soporte" | "servicios" | "seguridad";

function getDisplayName(abonado: {
  razonSocial?: string | null;
  nombre?: string | null;
  apellido?: string | null;
  numeroAbonado: string;
}) {
  return abonado.razonSocial || [abonado.nombre, abonado.apellido].filter(Boolean).join(" ") || abonado.numeroAbonado;
}

function wasRead(interacciones: Array<{ tipo: string; leidoAt: Date | null }>) {
  return interacciones.some((item) => item.tipo === "LECTURA" && item.leidoAt);
}

function wasConfirmed(interacciones: Array<{ tipo: string; confirmadoAt: Date | null }>) {
  return interacciones.some((item) => item.tipo === "CONFIRMACION" && item.confirmadoAt);
}

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

function getActiveTab(rawTab: string): TabKey {
  const validTabs: TabKey[] = ["resumen", "inbox", "documentos", "soporte", "servicios", "seguridad"];
  return validTabs.includes(rawTab as TabKey) ? (rawTab as TabKey) : "resumen";
}

function buildTabHref(tab: TabKey) {
  return `/portal-cliente?tab=${tab}`;
}

export default async function PortalClientePage({ searchParams }: PageProps) {
  const session = await requirePortalSession();
  const abonado = await getOficinaVirtualPreview(session.id);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const activeTab = getActiveTab(getQueryValue(params, "tab"));

  if (!abonado) {
    return null;
  }

  const titular = getDisplayName(abonado);
  const deudaAbierta = abonado.facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const unreadPublicaciones = abonado.publicacionesPortal.filter(
    (publicacion) => !wasRead(publicacion.interaccionesPortal),
  );
  const pendingPublicationConfirmations = abonado.publicacionesPortal.filter(
    (publicacion) => publicacion.requiereConfirmacion && !wasConfirmed(publicacion.interaccionesPortal),
  );
  const unreadComunicaciones = abonado.comunicaciones.filter(
    (comunicacion) => !wasRead(comunicacion.interaccionesPortal),
  );
  const pendingCommunicationConfirmations = abonado.comunicaciones.filter(
    (comunicacion) => comunicacion.requiereSeguimiento && !wasConfirmed(comunicacion.interaccionesPortal),
  );
  const openReclamos = abonado.reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO");
  const openOrders = abonado.ordenesTrabajo.filter((orden) =>
    ["PENDIENTE", "ASIGNADA", "EN_CURSO"].includes(orden.estado),
  );
  const documentCount = abonado.facturas.length + abonado.pagos.length;
  const inboxPending =
    unreadPublicaciones.length +
    unreadComunicaciones.length +
    pendingPublicationConfirmations.length +
    pendingCommunicationConfirmations.length;
  const serviceOptions = Array.from(
    new Set(
      abonado.servicios
        .map((servicio) => servicio.servicioCatalogo?.nombre ?? servicio.plan ?? servicio.tipo)
        .filter(Boolean),
    ),
  );
  const supportServiceOptions = serviceOptions.length > 0 ? serviceOptions : ["GENERAL"];
  const tabs: Array<{ key: TabKey; label: string; badge?: number }> = [
    { key: "resumen", label: "Resumen" },
    { key: "inbox", label: "Bandeja", badge: inboxPending },
    { key: "documentos", label: "Documentos", badge: documentCount },
    { key: "soporte", label: "Soporte", badge: openReclamos.length + openOrders.length },
    { key: "servicios", label: "Servicios", badge: abonado.servicios.length },
    { key: "seguridad", label: "Acceso" },
  ];

  return (
    <section className="page-stack" style={{ padding: "24px", maxWidth: "1480px", margin: "0 auto" }}>
      <article className="card subscriber-header subscriber-header--compact">
        <div className="subscriber-header__main">
          <div className="subscriber-header__identity">
            <div className="subscriber-header__avatar">{titular.slice(0, 1).toUpperCase()}</div>
            <div className="subscriber-header__copy">
              <span className="eyebrow">Oficina virtual</span>
              <h1>{titular}</h1>
              <p>
                {abonado.numeroAbonado} / {abonado.email ?? "Sin email"} /{" "}
                {abonado.telefono ?? "Sin telefono"}
              </p>
            </div>
          </div>
          <div className="subscriber-header__actions">
            <Link className="toolbar-button" href={buildTabHref("documentos")}>
              Ver documentos
            </Link>
            <Link className="toolbar-button" href={buildTabHref("soporte")}>
              Crear ticket
            </Link>
            <form action={portalLogoutAction}>
              <button className="toolbar-button toolbar-button--primary" type="submit">
                Cerrar sesion
              </button>
            </form>
          </div>
        </div>

        <div className="subscriber-header__badges">
          <StatusPill tone={deudaAbierta > 0 ? "warning" : "success"}>
            {deudaAbierta > 0 ? `Saldo abierto ${formatCurrency(deudaAbierta)}` : "Cuenta al dia"}
          </StatusPill>
          <StatusPill tone={inboxPending > 0 ? "warning" : "success"}>
            {inboxPending > 0 ? `${inboxPending} pendientes en bandeja` : "Bandeja al dia"}
          </StatusPill>
          <StatusPill tone={openReclamos.length > 0 ? "warning" : "neutral"}>
            {openReclamos.length} tickets abiertos
          </StatusPill>
          <StatusPill tone={openOrders.length > 0 ? "warning" : "neutral"}>
            {openOrders.length} ordenes en curso
          </StatusPill>
        </div>

        <nav className="workspace-tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              className={`workspace-tabs__link${activeTab === tab.key ? " is-active" : ""}`}
              href={buildTabHref(tab.key)}
            >
              {tab.label}
              {typeof tab.badge === "number" ? ` (${tab.badge})` : ""}
            </Link>
          ))}
        </nav>
      </article>

      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <div className="record-layout">
        <div className="record-main">
          {activeTab === "resumen" ? (
            <section className="workspace-section workspace-section--padded">
              <section className="workspace-tiles">
                <article className="workspace-tile">
                  <span className="workspace-tile__eyebrow">Cuenta</span>
                  <h3>{formatCurrency(deudaAbierta)}</h3>
                  <p>{abonado.facturas.length} comprobantes pendientes o vencidos.</p>
                </article>
                <article className="workspace-tile">
                  <span className="workspace-tile__eyebrow">Servicios</span>
                  <h3>{abonado.servicios.length}</h3>
                  <p>Contratos visibles dentro de tu cuenta.</p>
                </article>
                <article className="workspace-tile">
                  <span className="workspace-tile__eyebrow">Bandeja</span>
                  <h3>{inboxPending}</h3>
                  <p>Lecturas y confirmaciones aun pendientes.</p>
                </article>
                <article className="workspace-tile">
                  <span className="workspace-tile__eyebrow">Soporte</span>
                  <h3>{openReclamos.length + openOrders.length}</h3>
                  <p>Tickets y ordenes operativas asociadas a tu cuenta.</p>
                </article>
              </section>

              <section className="workspace-focus-grid">
                <article className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Resumen de novedades</h2>
                      <p>Vista rapida de lo mas reciente en tu bandeja.</p>
                    </div>
                    <div className="toolbar__actions">
                      <Link className="toolbar-button" href={buildTabHref("inbox")}>
                        Abrir bandeja
                      </Link>
                    </div>
                  </div>
                  <div className="stack-list">
                    {abonado.publicacionesPortal.slice(0, 3).map((publicacion) => (
                      <article className="stack-list__item" key={`summary-pub-${publicacion.id}`}>
                        <div className="workspace-action-row">
                          <strong>{publicacion.titulo}</strong>
                          <StatusPill tone={wasRead(publicacion.interaccionesPortal) ? "success" : "warning"}>
                            {wasRead(publicacion.interaccionesPortal) ? "LEIDA" : "SIN LEER"}
                          </StatusPill>
                        </div>
                        <p>{publicacion.resumen ?? publicacion.categoria}</p>
                      </article>
                    ))}
                    {abonado.comunicaciones.slice(0, 2).map((comunicacion) => (
                      <article className="stack-list__item" key={`summary-msg-${comunicacion.id}`}>
                        <div className="workspace-action-row">
                          <strong>{comunicacion.asunto}</strong>
                          <StatusPill tone={wasRead(comunicacion.interaccionesPortal) ? "success" : "warning"}>
                            {wasRead(comunicacion.interaccionesPortal) ? "LEIDA" : "SIN LEER"}
                          </StatusPill>
                        </div>
                        <p>{formatDateTime(comunicacion.createdAt.toISOString())}</p>
                      </article>
                    ))}
                    {abonado.publicacionesPortal.length === 0 && abonado.comunicaciones.length === 0 ? (
                      <article className="stack-list__item">
                        <strong>Sin novedades</strong>
                        <p>No tenes mensajes pendientes en este momento.</p>
                      </article>
                    ) : null}
                  </div>
                </article>

                <div className="workspace-side-stack">
                  <article className="card card--embedded">
                    <div className="section-heading">
                      <div>
                        <h3>Documentos recientes</h3>
                        <p>Ultimos comprobantes disponibles.</p>
                      </div>
                    </div>
                    <div className="stack-list">
                      {abonado.facturas.slice(0, 3).map((factura) => (
                        <article className="stack-list__item" key={`summary-fac-${factura.id}`}>
                          <strong>{factura.numero}</strong>
                          <p>
                            {formatDate(factura.fechaVencimiento.toISOString())} /{" "}
                            {formatCurrency(Number(factura.total))}
                          </p>
                        </article>
                      ))}
                      {abonado.pagos.slice(0, 2).map((pago) => (
                        <article className="stack-list__item" key={`summary-pay-${pago.id}`}>
                          <strong>{pago.numeroRecibo ?? `REC-${pago.id}`}</strong>
                          <p>{formatDateTime(pago.fecha.toISOString())}</p>
                        </article>
                      ))}
                    </div>
                  </article>

                  <article className="card card--embedded">
                    <div className="section-heading">
                      <div>
                        <h3>Estado tecnico</h3>
                        <p>Seguimiento rapido de servicios y soporte.</p>
                      </div>
                    </div>
                    <div className="stack-list">
                      {abonado.servicios.slice(0, 4).map((servicio) => (
                        <article className="stack-list__item" key={`summary-svc-${servicio.id}`}>
                          <strong>{servicio.servicioCatalogo?.nombre ?? servicio.plan}</strong>
                          <p>{servicio.estado}</p>
                        </article>
                      ))}
                      {abonado.servicios.length === 0 ? (
                        <article className="stack-list__item">
                          <strong>Sin servicios visibles</strong>
                          <p>Todavia no hay contratos disponibles en esta cuenta.</p>
                        </article>
                      ) : null}
                    </div>
                  </article>
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "inbox" ? (
            <section className="workspace-section workspace-section--padded">
              <article className="card">
                <div className="section-heading">
                  <div>
                    <h2>Bandeja del portal</h2>
                    <p>Novedades, avisos y comunicaciones visibles dentro de tu oficina virtual.</p>
                  </div>
                </div>

                <div className="workspace-inline-panel">
                  <div>
                    <strong>Acciones masivas</strong>
                    <p>Resuelve rapido lecturas y confirmaciones sin entrar mensaje por mensaje.</p>
                  </div>
                  <div className="workspace-action-row">
                    <form action={createPortalClientBulkInteractionAction}>
                      <input name="scope" type="hidden" value="PUBLICACIONES" />
                      <input name="tipo" type="hidden" value="LECTURA" />
                      <input name="redirectPath" type="hidden" value={buildTabHref("inbox")} />
                      <SubmitButton idleLabel="Leer avisos" pendingLabel="Aplicando..." />
                    </form>
                    <form action={createPortalClientBulkInteractionAction}>
                      <input name="scope" type="hidden" value="COMUNICACIONES" />
                      <input name="tipo" type="hidden" value="LECTURA" />
                      <input name="redirectPath" type="hidden" value={buildTabHref("inbox")} />
                      <SubmitButton idleLabel="Leer mensajes" pendingLabel="Aplicando..." />
                    </form>
                    <form action={createPortalClientBulkInteractionAction}>
                      <input name="scope" type="hidden" value="PUBLICACIONES" />
                      <input name="tipo" type="hidden" value="CONFIRMACION" />
                      <input name="redirectPath" type="hidden" value={buildTabHref("inbox")} />
                      <SubmitButton idleLabel="Confirmar avisos" pendingLabel="Aplicando..." />
                    </form>
                    <form action={createPortalClientBulkInteractionAction}>
                      <input name="scope" type="hidden" value="COMUNICACIONES" />
                      <input name="tipo" type="hidden" value="CONFIRMACION" />
                      <input name="redirectPath" type="hidden" value={buildTabHref("inbox")} />
                      <SubmitButton idleLabel="Confirmar mensajes" pendingLabel="Aplicando..." />
                    </form>
                  </div>
                </div>

                <div className="stack-list">
                  {abonado.publicacionesPortal.map((publicacion) => (
                    <article className="stack-list__item" key={`pub-${publicacion.id}`}>
                      <div className="workspace-action-row">
                        <strong>{publicacion.titulo}</strong>
                        <StatusPill tone={wasRead(publicacion.interaccionesPortal) ? "success" : "warning"}>
                          {wasRead(publicacion.interaccionesPortal) ? "LEIDA" : "SIN LEER"}
                        </StatusPill>
                        {publicacion.requiereConfirmacion ? (
                          <StatusPill tone={wasConfirmed(publicacion.interaccionesPortal) ? "success" : "danger"}>
                            {wasConfirmed(publicacion.interaccionesPortal) ? "CONFIRMADA" : "PENDIENTE"}
                          </StatusPill>
                        ) : null}
                      </div>
                      <p>{publicacion.resumen ?? publicacion.categoria}</p>
                      <p>{publicacion.contenido}</p>
                      <div className="workspace-action-row">
                        {!wasRead(publicacion.interaccionesPortal) ? (
                          <form action={createPortalClientInteractionAction}>
                            <input name="publicacionId" type="hidden" value={publicacion.id} />
                            <input name="tipo" type="hidden" value="LECTURA" />
                            <button className="toolbar-button" type="submit">
                              Marcar leida
                            </button>
                          </form>
                        ) : null}
                        {publicacion.requiereConfirmacion &&
                        !wasConfirmed(publicacion.interaccionesPortal) ? (
                          <form action={createPortalClientInteractionAction}>
                            <input name="publicacionId" type="hidden" value={publicacion.id} />
                            <input name="tipo" type="hidden" value="CONFIRMACION" />
                            <button className="toolbar-button" type="submit">
                              Confirmar aviso
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  ))}

                  {abonado.comunicaciones.map((comunicacion) => (
                    <article className="stack-list__item" key={`msg-${comunicacion.id}`}>
                      <div className="workspace-action-row">
                        <strong>{comunicacion.asunto}</strong>
                        <StatusPill tone={wasRead(comunicacion.interaccionesPortal) ? "success" : "warning"}>
                          {wasRead(comunicacion.interaccionesPortal) ? "LEIDA" : "SIN LEER"}
                        </StatusPill>
                        {comunicacion.requiereSeguimiento ? (
                          <StatusPill tone={wasConfirmed(comunicacion.interaccionesPortal) ? "success" : "danger"}>
                            {wasConfirmed(comunicacion.interaccionesPortal) ? "CONFIRMADA" : "PENDIENTE"}
                          </StatusPill>
                        ) : null}
                      </div>
                      <p>{formatDateTime(comunicacion.createdAt.toISOString())}</p>
                      <p>{comunicacion.mensaje}</p>
                      <div className="workspace-action-row">
                        {!wasRead(comunicacion.interaccionesPortal) ? (
                          <form action={createPortalClientInteractionAction}>
                            <input name="comunicacionId" type="hidden" value={comunicacion.id} />
                            <input name="tipo" type="hidden" value="LECTURA" />
                            <button className="toolbar-button" type="submit">
                              Marcar leida
                            </button>
                          </form>
                        ) : null}
                        {comunicacion.requiereSeguimiento &&
                        !wasConfirmed(comunicacion.interaccionesPortal) ? (
                          <form action={createPortalClientInteractionAction}>
                            <input name="comunicacionId" type="hidden" value={comunicacion.id} />
                            <input name="tipo" type="hidden" value="CONFIRMACION" />
                            <button className="toolbar-button" type="submit">
                              Confirmar mensaje
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  ))}

                  {abonado.publicacionesPortal.length === 0 && abonado.comunicaciones.length === 0 ? (
                    <article className="stack-list__item">
                      <strong>Sin novedades</strong>
                      <p>No hay publicaciones ni mensajes activos para tu cuenta.</p>
                    </article>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "documentos" ? (
            <section className="workspace-section workspace-section--padded">
              <section className="split-grid">
                <article className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Facturas pendientes</h2>
                      <p>Comprobantes disponibles para consulta o impresion.</p>
                    </div>
                  </div>
                  <div className="stack-list">
                    {abonado.facturas.map((factura) => (
                      <article className="stack-list__item" key={`doc-fac-${factura.id}`}>
                        <div className="workspace-action-row">
                          <strong>{factura.numero}</strong>
                          <StatusPill tone={factura.estado === "VENCIDA" ? "danger" : "warning"}>
                            {factura.estado}
                          </StatusPill>
                        </div>
                        <p>
                          Emision {formatDate(factura.fechaEmision.toISOString())} / vence{" "}
                          {formatDate(factura.fechaVencimiento.toISOString())}
                        </p>
                        <p>{formatCurrency(Number(factura.total))}</p>
                        <div className="workspace-action-row">
                          <Link className="toolbar-button" href={`/portal-cliente/facturas/${factura.id}`}>
                            Ver factura
                          </Link>
                        </div>
                      </article>
                    ))}
                    {abonado.facturas.length === 0 ? (
                      <article className="stack-list__item">
                        <strong>Sin facturas abiertas</strong>
                        <p>No hay comprobantes pendientes o vencidos para mostrar.</p>
                      </article>
                    ) : null}
                  </div>
                </article>

                <article className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Recibos recientes</h2>
                      <p>Pagos registrados y comprobantes de cobranza.</p>
                    </div>
                  </div>
                  <div className="stack-list">
                    {abonado.pagos.map((pago) => (
                      <article className="stack-list__item" key={`doc-rec-${pago.id}`}>
                        <div className="workspace-action-row">
                          <strong>{pago.numeroRecibo ?? `REC-${pago.id}`}</strong>
                          <StatusPill tone={pago.estado === "REGISTRADO" ? "success" : "neutral"}>
                            {pago.estado}
                          </StatusPill>
                        </div>
                        <p>
                          {formatDateTime(pago.fecha.toISOString())} /{" "}
                          {formatCurrency(Number(pago.importe))}
                        </p>
                        <div className="workspace-action-row">
                          <Link className="toolbar-button" href={`/portal-cliente/recibos/${pago.id}`}>
                            Ver recibo
                          </Link>
                        </div>
                      </article>
                    ))}
                    {abonado.pagos.length === 0 ? (
                      <article className="stack-list__item">
                        <strong>Sin recibos recientes</strong>
                        <p>No hay pagos registrados para mostrar en tu oficina virtual.</p>
                      </article>
                    ) : null}
                  </div>
                </article>
              </section>
            </section>
          ) : null}

          {activeTab === "soporte" ? (
            <section className="workspace-section workspace-section--padded">
              <section className="split-grid">
                <article className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Crear ticket</h2>
                      <p>Genera una solicitud tecnica o administrativa desde el portal.</p>
                    </div>
                  </div>
                  <form action={createPortalSupportRequestAction} className="form-panel">
                    <label className="field">
                      <span>Servicio</span>
                      <select defaultValue={supportServiceOptions[0]} name="tipoServicio" required>
                        {supportServiceOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Descripcion</span>
                      <textarea
                        name="descripcion"
                        placeholder="Describi el problema, pedido o consulta"
                        required
                        rows={6}
                      />
                    </label>
                    <div className="form-actions">
                      <SubmitButton idleLabel="Enviar ticket" pendingLabel="Enviando..." />
                    </div>
                  </form>
                </article>

                <article className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Tickets y seguimiento</h2>
                      <p>Historial visible de reclamos y estado operativo.</p>
                    </div>
                  </div>
                  <div className="stack-list">
                    {abonado.reclamos.map((reclamo) => (
                      <article className="stack-list__item" key={`tk-${reclamo.id}`}>
                        <div className="workspace-action-row">
                          <strong>Ticket #{reclamo.id}</strong>
                          <StatusPill tone={reclamo.estado === "RESUELTO" ? "success" : "warning"}>
                            {reclamo.estado}
                          </StatusPill>
                        </div>
                        <p>
                          {reclamo.tipoServicio} / {formatDateTime(reclamo.fechaApertura.toISOString())}
                        </p>
                        <p>{reclamo.descripcion}</p>
                      </article>
                    ))}
                    {abonado.reclamos.length === 0 ? (
                      <article className="stack-list__item">
                        <strong>Sin tickets</strong>
                        <p>Todavia no hay reclamos o solicitudes registradas en tu cuenta.</p>
                      </article>
                    ) : null}
                  </div>
                </article>
              </section>

              <article className="card">
                <div className="section-heading">
                  <div>
                    <h2>Ordenes de trabajo</h2>
                    <p>Seguimiento de instalaciones, visitas tecnicas, cortes y reconexiones.</p>
                  </div>
                </div>
                <div className="stack-list">
                  {abonado.ordenesTrabajo.map((orden) => (
                    <article className="stack-list__item" key={`ot-${orden.id}`}>
                      <div className="workspace-action-row">
                        <strong>{orden.tipo}</strong>
                        <StatusPill tone={orden.estado === "EN_CURSO" ? "warning" : "neutral"}>
                          {orden.estado}
                        </StatusPill>
                      </div>
                      <p>
                        {orden.tecnico?.nombre ?? "Tecnico a definir"} /{" "}
                        {orden.fechaProgramada
                          ? formatDateTime(orden.fechaProgramada.toISOString())
                          : "Sin fecha programada"}
                      </p>
                    </article>
                  ))}
                  {abonado.ordenesTrabajo.length === 0 ? (
                    <article className="stack-list__item">
                      <strong>Sin ordenes abiertas</strong>
                      <p>No hay visitas ni trabajos pendientes sobre tus servicios.</p>
                    </article>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "servicios" ? (
            <section className="workspace-section workspace-section--padded">
              <section className="split-grid">
                <article className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Servicios contratados</h2>
                      <p>Estado comercial y tecnico de cada contrato visible en tu cuenta.</p>
                    </div>
                  </div>
                  <div className="stack-list">
                    {abonado.servicios.map((servicio) => (
                      <article className="stack-list__item" key={`svc-${servicio.id}`}>
                        <div className="workspace-action-row">
                          <strong>{servicio.servicioCatalogo?.nombre ?? servicio.plan}</strong>
                          <StatusPill
                            tone={
                              servicio.estado === "ACTIVO"
                                ? "success"
                                : servicio.estado === "SUSPENDIDO"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {servicio.estado}
                          </StatusPill>
                        </div>
                        <p>
                          {formatCurrency(Number(servicio.precio))} / contrato{" "}
                          {servicio.numeroContrato ?? "sin numero"}
                        </p>
                      </article>
                    ))}
                    {abonado.servicios.length === 0 ? (
                      <article className="stack-list__item">
                        <strong>Sin servicios activos</strong>
                        <p>No hay contratos visibles dentro de esta cuenta.</p>
                      </article>
                    ) : null}
                  </div>
                </article>

                <article className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Actividad operativa</h2>
                      <p>Ordenes y tickets relacionados con tus servicios.</p>
                    </div>
                  </div>
                  <div className="stack-list">
                    {openOrders.map((orden) => (
                      <article className="stack-list__item" key={`svc-ot-${orden.id}`}>
                        <strong>{orden.tipo}</strong>
                        <p>
                          {orden.servicio?.servicioCatalogo?.nombre ??
                            orden.servicio?.plan ??
                            "Servicio general"}{" "}
                          / {orden.estado}
                        </p>
                      </article>
                    ))}
                    {openOrders.length === 0 ? (
                      <article className="stack-list__item">
                        <strong>Sin actividad pendiente</strong>
                        <p>No hay ordenes abiertas sobre tus servicios en este momento.</p>
                      </article>
                    ) : null}
                  </div>
                </article>
              </section>
            </section>
          ) : null}

          {activeTab === "seguridad" ? (
            <section className="workspace-section workspace-section--padded">
              <article className="card">
                <div className="section-heading">
                  <div>
                    <h2>Acceso y seguridad</h2>
                    <p>Actualiza la contrasena de ingreso a tu oficina virtual cuando lo necesites.</p>
                  </div>
                </div>
                <form action={portalChangePasswordAction} className="form-panel">
                  <div className="form-grid form-grid--3">
                    <label className="field">
                      <span>Contrasena actual</span>
                      <input name="currentPassword" required type="password" />
                    </label>
                    <label className="field">
                      <span>Nueva contrasena</span>
                      <input name="newPassword" required type="password" />
                    </label>
                    <label className="field">
                      <span>Confirmar nueva contrasena</span>
                      <input name="confirmPassword" required type="password" />
                    </label>
                  </div>
                  <div className="form-actions">
                    <SubmitButton idleLabel="Actualizar contrasena" pendingLabel="Actualizando..." />
                  </div>
                </form>
              </article>
            </section>
          ) : null}
        </div>

        <aside className="record-side workspace-side-stack">
          <article className="card profile-aside">
            <div className="profile-aside__header">
              <div className="profile-aside__avatar">{titular.slice(0, 1).toUpperCase()}</div>
              <div>
                <h2>{titular}</h2>
                <p>
                  {abonado.numeroAbonado} / {abonado.condicionIva}
                </p>
              </div>
            </div>
            <div className="profile-aside__group">
              <span className="profile-aside__label">Cuenta</span>
              <strong>{formatCurrency(deudaAbierta)}</strong>
              <p>{abonado.facturas.length} facturas pendientes o vencidas.</p>
            </div>
            <div className="profile-aside__group">
              <span className="profile-aside__label">Contacto</span>
              <strong>{abonado.telefono ?? "Sin telefono"}</strong>
              <p>{abonado.email ?? "Sin email"}</p>
            </div>
            <div className="profile-aside__group">
              <span className="profile-aside__label">Domicilio</span>
              <strong>{abonado.domicilio}</strong>
              <p>
                {abonado.localidad}
                {abonado.provincia ? `, ${abonado.provincia}` : ""}
              </p>
            </div>
          </article>

          <article className="card card--embedded">
            <div className="section-heading">
              <div>
                <h3>Accesos rapidos</h3>
                <p>Atajos para moverte dentro del portal cliente.</p>
              </div>
            </div>
            <div className="workspace-action-row">
              <Link className="toolbar-button" href={buildTabHref("inbox")}>
                Bandeja
              </Link>
              <Link className="toolbar-button" href={buildTabHref("documentos")}>
                Documentos
              </Link>
              <Link className="toolbar-button" href={buildTabHref("soporte")}>
                Soporte
              </Link>
              <Link className="toolbar-button" href={buildTabHref("servicios")}>
                Servicios
              </Link>
            </div>
          </article>

          <article className="card card--embedded">
            <div className="section-heading">
              <div>
                <h3>Estado del portal</h3>
                <p>Seguimiento rapido del uso de tu oficina virtual.</p>
              </div>
            </div>
            <div className="stack-list">
              <article className="stack-list__item">
                <strong>{unreadPublicaciones.length + unreadComunicaciones.length} elementos sin leer</strong>
                <p>Mensajes y publicaciones pendientes de lectura.</p>
              </article>
              <article className="stack-list__item">
                <strong>
                  {pendingPublicationConfirmations.length + pendingCommunicationConfirmations.length} confirmaciones
                </strong>
                <p>Avisos o comunicaciones que todavia requieren accion.</p>
              </article>
              <article className="stack-list__item">
                <strong>{documentCount} documentos</strong>
                <p>Facturas abiertas y recibos recientes disponibles.</p>
              </article>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
