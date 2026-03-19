import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createPortalBulkInteractionAction,
  createPortalInteractionAction,
} from "@/app/actions";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getOficinaVirtualPreview } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

function getDisplayName(abonado: {
  razonSocial?: string | null;
  nombre?: string | null;
  apellido?: string | null;
  numeroAbonado: string;
}) {
  return abonado.razonSocial || [abonado.nombre, abonado.apellido].filter(Boolean).join(" ") || abonado.numeroAbonado;
}

function getPublicationReadState(publicacion: {
  interaccionesPortal: Array<{ tipo: string; leidoAt: Date | null; confirmadoAt: Date | null }>;
  requiereConfirmacion: boolean;
}) {
  const leida = publicacion.interaccionesPortal.some((item) => item.tipo === "LECTURA" && item.leidoAt);
  const confirmada = publicacion.interaccionesPortal.some(
    (item) => item.tipo === "CONFIRMACION" && item.confirmadoAt,
  );

  return { leida, confirmada };
}

function getCommunicationReadState(comunicacion: {
  interaccionesPortal: Array<{ tipo: string; leidoAt: Date | null; confirmadoAt: Date | null }>;
  requiereSeguimiento: boolean;
}) {
  const leida = comunicacion.interaccionesPortal.some((item) => item.tipo === "LECTURA" && item.leidoAt);
  const confirmada = comunicacion.interaccionesPortal.some(
    (item) => item.tipo === "CONFIRMACION" && item.confirmadoAt,
  );

  return { leida, confirmada };
}

export default async function OficinaVirtualPreviewPage({ params }: PageProps) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const { id } = await params;
  const abonadoId = Number.parseInt(id, 10);

  if (Number.isNaN(abonadoId)) {
    notFound();
  }

  const abonado = await getOficinaVirtualPreview(abonadoId);

  if (!abonado) {
    notFound();
  }

  const titular = getDisplayName(abonado);
  const deudaAbierta = abonado.facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const reclamosAbiertos = abonado.reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO");
  const publicacionesPendientesLectura = abonado.publicacionesPortal.filter(
    (publicacion) => !getPublicationReadState(publicacion).leida,
  );
  const publicacionesPendientesConfirmacion = abonado.publicacionesPortal.filter(
    (publicacion) => publicacion.requiereConfirmacion && !getPublicationReadState(publicacion).confirmada,
  );
  const comunicacionesPendientesLectura = abonado.comunicaciones.filter(
    (comunicacion) => !getCommunicationReadState(comunicacion).leida,
  );
  const comunicacionesPendientesConfirmacion = abonado.comunicaciones.filter(
    (comunicacion) => comunicacion.requiereSeguimiento && !getCommunicationReadState(comunicacion).confirmada,
  );
  const documentosDisponibles = abonado.facturas.length + abonado.pagos.length;
  const inboxPendiente =
    publicacionesPendientesLectura.length +
    publicacionesPendientesConfirmacion.length +
    comunicacionesPendientesLectura.length +
    comunicacionesPendientesConfirmacion.length;

  return (
    <section className="page-stack">
      <article className="card hero">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Preview cliente</span>
            <h1>Oficina virtual del abonado</h1>
            <p>Dashboard interno del portal cliente con bandeja, documentos, soporte y confirmaciones.</p>
          </div>
          <div className="workspace-action-row">
            <Link className="toolbar-button" href={`/abonados/${abonado.id}?tab=comunicaciones`}>
              Volver a la ficha
            </Link>
            <Link className="toolbar-button" href="/portal">
              Administrar publicaciones
            </Link>
          </div>
        </div>

        <section className="workspace-tiles">
          <article className="workspace-tile">
            <span className="workspace-tile__eyebrow">Abonado</span>
            <h3>{titular}</h3>
            <p>
              {abonado.numeroAbonado} / {abonado.email ?? "Sin email"} / {abonado.telefono ?? "Sin telefono"}
            </p>
          </article>
          <article className="workspace-tile">
            <span className="workspace-tile__eyebrow">Bandeja pendiente</span>
            <h3>{inboxPendiente}</h3>
            <p>Lecturas y confirmaciones aun pendientes dentro del portal.</p>
          </article>
          <article className="workspace-tile">
            <span className="workspace-tile__eyebrow">Deuda abierta</span>
            <h3>{formatCurrency(deudaAbierta)}</h3>
            <p>{abonado.facturas.length} comprobantes disponibles en centro de documentos.</p>
          </article>
          <article className="workspace-tile">
            <span className="workspace-tile__eyebrow">Documentos</span>
            <h3>{documentosDisponibles}</h3>
            <p>Facturas y recibos recientes listos para consultar o imprimir.</p>
          </article>
          <article className="workspace-tile">
            <span className="workspace-tile__eyebrow">Soporte</span>
            <h3>{reclamosAbiertos.length + abonado.ordenesTrabajo.length}</h3>
            <p>Tickets y ordenes visibles para seguimiento del abonado.</p>
          </article>
        </section>

        <div className="workspace-inline-panel">
          <div>
            <strong>Acciones rapidas del portal</strong>
            <p>Prueba masiva de lectura o confirmacion para validar la experiencia del abonado.</p>
          </div>
          <div className="workspace-action-row">
            <form action={createPortalBulkInteractionAction}>
              <input name="abonadoId" type="hidden" value={abonado.id} />
              <input name="scope" type="hidden" value="PUBLICACIONES" />
              <input name="tipo" type="hidden" value="LECTURA" />
              <input name="redirectPath" type="hidden" value={`/oficina-virtual/${abonado.id}`} />
              <SubmitButton idleLabel="Leer novedades" pendingLabel="Aplicando..." />
            </form>
            <form action={createPortalBulkInteractionAction}>
              <input name="abonadoId" type="hidden" value={abonado.id} />
              <input name="scope" type="hidden" value="COMUNICACIONES" />
              <input name="tipo" type="hidden" value="LECTURA" />
              <input name="redirectPath" type="hidden" value={`/oficina-virtual/${abonado.id}`} />
              <SubmitButton idleLabel="Leer mensajes" pendingLabel="Aplicando..." />
            </form>
            <form action={createPortalBulkInteractionAction}>
              <input name="abonadoId" type="hidden" value={abonado.id} />
              <input name="scope" type="hidden" value="PUBLICACIONES" />
              <input name="tipo" type="hidden" value="CONFIRMACION" />
              <input name="redirectPath" type="hidden" value={`/oficina-virtual/${abonado.id}`} />
              <SubmitButton idleLabel="Confirmar avisos" pendingLabel="Aplicando..." />
            </form>
            <form action={createPortalBulkInteractionAction}>
              <input name="abonadoId" type="hidden" value={abonado.id} />
              <input name="scope" type="hidden" value="COMUNICACIONES" />
              <input name="tipo" type="hidden" value="CONFIRMACION" />
              <input name="redirectPath" type="hidden" value={`/oficina-virtual/${abonado.id}`} />
              <SubmitButton idleLabel="Confirmar mensajes" pendingLabel="Aplicando..." />
            </form>
          </div>
        </div>
      </article>

      <section className="workspace-focus-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Inbox del abonado</h2>
              <p>Novedades, mensajes visibles y confirmaciones pendientes dentro de la oficina virtual.</p>
            </div>
          </div>
          <div className="stack-list">
            {abonado.publicacionesPortal.map((publicacion) => {
              const state = getPublicationReadState(publicacion);
              return (
                <article className="stack-list__item" key={`publicacion-${publicacion.id}`}>
                  <div className="workspace-action-row">
                    <strong>{publicacion.titulo}</strong>
                    <StatusPill tone={state.leida ? "success" : "warning"}>
                      {state.leida ? "LEIDA" : "SIN LEER"}
                    </StatusPill>
                    {publicacion.requiereConfirmacion ? (
                      <StatusPill tone={state.confirmada ? "success" : "danger"}>
                        {state.confirmada ? "CONFIRMADA" : "PENDIENTE"}
                      </StatusPill>
                    ) : null}
                  </div>
                  <p>
                    {publicacion.categoria} / {publicacion.destacado ? "Destacada" : "Normal"} /{" "}
                    {formatDateTime(publicacion.createdAt.toISOString())}
                  </p>
                  {publicacion.resumen ? <p>{publicacion.resumen}</p> : null}
                  <p>{publicacion.contenido}</p>
                  <div className="workspace-action-row">
                    {!state.leida ? (
                      <form action={createPortalInteractionAction}>
                        <input name="abonadoId" type="hidden" value={abonado.id} />
                        <input name="publicacionId" type="hidden" value={publicacion.id} />
                        <input name="tipo" type="hidden" value="LECTURA" />
                        <input name="redirectPath" type="hidden" value={`/oficina-virtual/${abonado.id}`} />
                        <button className="toolbar-button" type="submit">
                          Marcar leida
                        </button>
                      </form>
                    ) : null}
                    {publicacion.requiereConfirmacion && !state.confirmada ? (
                      <form action={createPortalInteractionAction}>
                        <input name="abonadoId" type="hidden" value={abonado.id} />
                        <input name="publicacionId" type="hidden" value={publicacion.id} />
                        <input name="tipo" type="hidden" value="CONFIRMACION" />
                        <input name="redirectPath" type="hidden" value={`/oficina-virtual/${abonado.id}`} />
                        <button className="toolbar-button" type="submit">
                          Confirmar aviso
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}

            {abonado.comunicaciones.map((comunicacion) => {
              const state = getCommunicationReadState(comunicacion);
              return (
                <article className="stack-list__item" key={`comunicacion-${comunicacion.id}`}>
                  <div className="workspace-action-row">
                    <strong>{comunicacion.asunto}</strong>
                    <StatusPill tone={state.leida ? "success" : "warning"}>
                      {state.leida ? "LEIDA" : "SIN LEER"}
                    </StatusPill>
                    {comunicacion.requiereSeguimiento ? (
                      <StatusPill tone={state.confirmada ? "success" : "danger"}>
                        {state.confirmada ? "CONFIRMADA" : "PENDIENTE"}
                      </StatusPill>
                    ) : null}
                  </div>
                  <p>
                    {comunicacion.tipo} / {formatDateTime(comunicacion.createdAt.toISOString())}
                  </p>
                  <p>{comunicacion.mensaje}</p>
                  <div className="workspace-action-row">
                    {!state.leida ? (
                      <form action={createPortalInteractionAction}>
                        <input name="abonadoId" type="hidden" value={abonado.id} />
                        <input name="comunicacionId" type="hidden" value={comunicacion.id} />
                        <input name="tipo" type="hidden" value="LECTURA" />
                        <input name="redirectPath" type="hidden" value={`/oficina-virtual/${abonado.id}`} />
                        <button className="toolbar-button" type="submit">
                          Marcar leida
                        </button>
                      </form>
                    ) : null}
                    {comunicacion.requiereSeguimiento && !state.confirmada ? (
                      <form action={createPortalInteractionAction}>
                        <input name="abonadoId" type="hidden" value={abonado.id} />
                        <input name="comunicacionId" type="hidden" value={comunicacion.id} />
                        <input name="tipo" type="hidden" value="CONFIRMACION" />
                        <input name="redirectPath" type="hidden" value={`/oficina-virtual/${abonado.id}`} />
                        <button className="toolbar-button" type="submit">
                          Confirmar mensaje
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}

            {abonado.publicacionesPortal.length === 0 && abonado.comunicaciones.length === 0 ? (
              <article className="stack-list__item">
                <strong>Sin novedades</strong>
                <p>La bandeja del portal no tiene mensajes ni publicaciones activas en este momento.</p>
              </article>
            ) : null}
          </div>
        </article>

        <div className="workspace-side-stack">
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
              <span className="profile-aside__label">Soporte</span>
              <strong>{reclamosAbiertos.length} tickets abiertos</strong>
              <p>{abonado.ordenesTrabajo.length} ordenes operativas visibles.</p>
            </div>
          </article>

          <article className="card card--embedded">
            <div className="section-heading">
              <div>
                <h3>Servicios visibles</h3>
                <p>Contratos y planes que ve el abonado dentro del portal.</p>
              </div>
            </div>
            <div className="stack-list">
              {abonado.servicios.map((servicio) => (
                <article className="stack-list__item" key={servicio.id}>
                  <strong>{servicio.servicioCatalogo?.nombre ?? servicio.plan}</strong>
                  <p>
                    {servicio.estado} / {formatCurrency(Number(servicio.precio))} / contrato{" "}
                    {servicio.numeroContrato ?? "sin numero"}
                  </p>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Centro de documentos</h2>
              <p>Facturas abiertas y recibos recientes con acceso directo.</p>
            </div>
          </div>
          <div className="stack-list">
            {abonado.facturas.length > 0 ? (
              abonado.facturas.map((factura) => (
                <article className="stack-list__item" key={`factura-${factura.id}`}>
                  <div className="workspace-action-row">
                    <strong>{factura.numero}</strong>
                    <StatusPill tone={factura.estado === "VENCIDA" ? "danger" : "warning"}>
                      {factura.estado}
                    </StatusPill>
                  </div>
                  <p>
                    Vence {formatDate(factura.fechaVencimiento.toISOString())} /{" "}
                    {formatCurrency(Number(factura.total))}
                  </p>
                  <div className="workspace-action-row">
                    <Link className="toolbar-button" href={`/facturacion/${factura.id}`}>
                      Ver comprobante
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <article className="stack-list__item">
                <strong>Sin deuda abierta</strong>
                <p>El centro de documentos no tiene facturas pendientes en este momento.</p>
              </article>
            )}
          </div>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Recibos y pagos recientes</h2>
              <p>Historial corto de cobros para consulta del abonado.</p>
            </div>
          </div>
          <div className="stack-list">
            {abonado.pagos.length > 0 ? (
              abonado.pagos.map((pago) => (
                <article className="stack-list__item" key={`pago-${pago.id}`}>
                  <div className="workspace-action-row">
                    <strong>{pago.numeroRecibo ?? `PAGO-${pago.id}`}</strong>
                    <StatusPill tone={pago.estado === "REGISTRADO" ? "success" : "neutral"}>{pago.estado}</StatusPill>
                  </div>
                  <p>
                    {formatDateTime(pago.fecha.toISOString())} / {formatCurrency(Number(pago.importe))}
                  </p>
                  <div className="workspace-action-row">
                    <Link className="toolbar-button" href={`/recibos/${pago.id}`}>
                      Ver recibo
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <article className="stack-list__item">
                <strong>Sin pagos recientes</strong>
                <p>No hay recibos registrados para mostrar en el historial corto.</p>
              </article>
            )}
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Soporte y tickets</h2>
              <p>Seguimiento tecnico visible para el cliente dentro de su oficina virtual.</p>
            </div>
          </div>
          <div className="stack-list">
            {abonado.reclamos.length > 0 ? (
              abonado.reclamos.map((reclamo) => (
                <article className="stack-list__item" key={`reclamo-${reclamo.id}`}>
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
              ))
            ) : (
              <article className="stack-list__item">
                <strong>Sin tickets</strong>
                <p>No hay reclamos recientes cargados para este abonado.</p>
              </article>
            )}
          </div>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Ordenes y trabajos en curso</h2>
              <p>Instalaciones, visitas y operaciones asociadas a los servicios del abonado.</p>
            </div>
          </div>
          <div className="stack-list">
            {abonado.ordenesTrabajo.length > 0 ? (
              abonado.ordenesTrabajo.map((orden) => (
                <article className="stack-list__item" key={`orden-${orden.id}`}>
                  <div className="workspace-action-row">
                    <strong>{orden.tipo}</strong>
                    <StatusPill tone={orden.estado === "EN_CURSO" ? "warning" : "neutral"}>{orden.estado}</StatusPill>
                  </div>
                  <p>
                    {orden.servicio?.servicioCatalogo?.nombre ?? orden.servicio?.plan ?? "Sin servicio"} /{" "}
                    {orden.tecnico?.nombre ?? "Sin tecnico"}
                  </p>
                  <p>
                    {orden.fechaProgramada
                      ? `Programada para ${formatDateTime(orden.fechaProgramada.toISOString())}`
                      : "Sin fecha programada"}
                  </p>
                </article>
              ))
            ) : (
              <article className="stack-list__item">
                <strong>Sin ordenes abiertas</strong>
                <p>El cliente no tiene trabajos operativos visibles en este momento.</p>
              </article>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
