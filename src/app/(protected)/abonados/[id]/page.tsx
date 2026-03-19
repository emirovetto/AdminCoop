import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createAcuerdoPagoAction,
  createComunicacionAbonadoAction,
  createGestionCobranzaAction,
  createPagoAction,
  createReclamoAction,
  createServicioOrdenRapidaAction,
  contractServicioAction,
  updateComunicacionEstadoAction,
  updateAbonadoAction,
  updateServicioContratoAction,
} from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { renderCommunicationTemplate } from "@/lib/comunicaciones";
import { SERVICE_CATEGORIES } from "@/lib/domain";
import { getAbonadoProfile, getAbonadosFormData } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime, formatDecimal } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const ABONADO_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "gestion", label: "Gestion" },
  { id: "servicios", label: "Servicios" },
  { id: "finanzas", label: "Finanzas" },
  { id: "soporte", label: "Tickets" },
  { id: "ordenes", label: "Ordenes" },
  { id: "comunicaciones", label: "Comunicaciones" },
] as const;

type AbonadoTabId = (typeof ABONADO_TABS)[number]["id"];

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

function getDisplayName(abonado: {
  razonSocial?: string | null;
  nombre?: string | null;
  apellido?: string | null;
  numeroAbonado: string;
}) {
  return abonado.razonSocial || [abonado.nombre, abonado.apellido].filter(Boolean).join(" ") || abonado.numeroAbonado;
}

function getWhatsappHref(phone: string | null | undefined) {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `https://wa.me/${digits.startsWith("54") ? digits : `54${digits}`}`;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function AbonadoDetailPage({ params, searchParams }: PageProps) {
  const user = await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(resolvedSearchParams, "ok");
  const error = getQueryValue(resolvedSearchParams, "error");
  const activeTabInput = getQueryValue(resolvedSearchParams, "tab");
  const selectedTemplateInput = getQueryValue(resolvedSearchParams, "template");
  const { id } = await params;
  const abonadoId = Number.parseInt(id, 10);

  if (Number.isNaN(abonadoId)) {
    notFound();
  }

  const [abonado, formData] = await Promise.all([getAbonadoProfile(abonadoId), getAbonadosFormData()]);

  if (!abonado) {
    notFound();
  }

  const returnPath = `/abonados/${abonado.id}`;
  const tabPath = (tab: AbonadoTabId) => `${returnPath}?tab=${tab}`;
  const activeTab = ABONADO_TABS.some((tab) => tab.id === activeTabInput)
    ? (activeTabInput as AbonadoTabId)
    : "resumen";
  const selectedTemplateId = Number.parseInt(selectedTemplateInput, 10);

  const titular = getDisplayName(abonado);
  const whatsappHref = getWhatsappHref(abonado.telefono);
  const facturasAbiertas = abonado.facturas.filter((factura) => ["PENDIENTE", "VENCIDA"].includes(factura.estado));
  const facturasVencidas = facturasAbiertas.filter((factura) => factura.estado === "VENCIDA");
  const saldoActual = abonado.movimientos[0] ? Number(abonado.movimientos[0].saldo) : 0;
  const deudaAbierta = facturasAbiertas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const pagosVigentes = abonado.pagos.filter((pago) => pago.estado === "REGISTRADO");
  const reclamosAbiertos = abonado.reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO");
  const ordenesAbiertas = abonado.ordenesTrabajo.filter((orden) =>
    ["PENDIENTE", "ASIGNADA", "EN_CURSO"].includes(orden.estado),
  );
  const promesasVigentes = abonado.gestionesCobranza.filter((gestion) => gestion.estado === "PROMESA_VIGENTE");
  const acuerdosVigentes = abonado.acuerdosPago.filter((acuerdo) => acuerdo.estado === "VIGENTE");
  const cargosPendientes = abonado.reclamos.reduce(
    (sum, reclamo) =>
      sum +
      reclamo.materiales.filter((material) => material.facturarProximaFactura && !material.facturado).length,
    0,
  );
  const ingresoMensual = abonado.servicios.reduce((sum, servicio) => {
    const precioUnitario = Number(servicio.precio) - Number(servicio.bonificacion);
    return sum + precioUnitario * Number(servicio.cantidad);
  }, 0);
  const uniqueServiceCategories = Array.from(
    new Set(
      abonado.servicios
        .map((servicio) => servicio.servicioCatalogo?.categoria ?? servicio.tipo)
        .filter(Boolean),
    ),
  );
  const serviceTypeOptions = Array.from(new Set([...SERVICE_CATEGORIES, ...uniqueServiceCategories])).sort();
  const latestFactura = abonado.facturas[0];
  const latestPago = abonado.pagos[0];
  const latestReclamo = abonado.reclamos[0];
  const latestOrden = abonado.ordenesTrabajo[0];
  const selectedCommunicationTemplate = Number.isNaN(selectedTemplateId)
    ? null
    : formData.communicationTemplates.find((template) => template.id === selectedTemplateId) ?? null;
  const communicationPreview = selectedCommunicationTemplate
    ? {
        canal: selectedCommunicationTemplate.canal,
        tipo: selectedCommunicationTemplate.tipo,
        prioridad: selectedCommunicationTemplate.prioridadDefault,
        asunto: renderCommunicationTemplate(selectedCommunicationTemplate.asuntoTemplate, abonado, {
          deudaAbierta,
          facturasAbiertas: facturasAbiertas.length,
          facturasVencidas: facturasVencidas.length,
          serviciosActivos: abonado.servicios.filter((servicio) => servicio.estado === "ACTIVO").length,
        }),
        mensaje: renderCommunicationTemplate(selectedCommunicationTemplate.mensajeTemplate, abonado, {
          deudaAbierta,
          facturasAbiertas: facturasAbiertas.length,
          facturasVencidas: facturasVencidas.length,
          serviciosActivos: abonado.servicios.filter((servicio) => servicio.estado === "ACTIVO").length,
        }),
      }
    : null;
  const openOrdersByService = new Map(
    abonado.servicios.map((servicio) => [
      servicio.id,
      abonado.ordenesTrabajo.filter(
        (orden) =>
          orden.servicioId === servicio.id && ["PENDIENTE", "ASIGNADA", "EN_CURSO"].includes(orden.estado),
      ).length,
    ]),
  );

  const serviciosRows = abonado.servicios.map((servicio) => [
    servicio.numeroContrato ?? "-",
    servicio.servicioCatalogo?.categoria ?? servicio.tipo,
    servicio.servicioCatalogo?.nombre ?? servicio.plan,
    formatCurrency(Number(servicio.precio)),
    formatDecimal(Number(servicio.cantidad)),
    formatCurrency(Number(servicio.bonificacion)),
    <StatusPill key={`fact-${servicio.id}`} tone={servicio.facturable ? "info" : "warning"}>
      {servicio.facturable ? "FACTURABLE" : "INTERNO"}
    </StatusPill>,
    <StatusPill
      key={`servicio-${servicio.id}`}
      tone={
        servicio.estado === "ACTIVO"
          ? "success"
          : servicio.estado === "PENDIENTE_INSTALACION"
            ? "warning"
            : "danger"
      }
    >
      {servicio.estado}
    </StatusPill>,
  ]);

  const reclamosRows = abonado.reclamos.map((reclamo) => [
    `#${reclamo.id}`,
    reclamo.tipoServicio,
    <StatusPill
      key={`prioridad-${reclamo.id}`}
      tone={reclamo.prioridad === "ALTA" ? "danger" : reclamo.prioridad === "MEDIA" ? "warning" : "info"}
    >
      {reclamo.prioridad}
    </StatusPill>,
    <StatusPill
      key={`estado-${reclamo.id}`}
      tone={
        reclamo.estado === "RESUELTO" ? "success" : reclamo.estado === "EN_PROCESO" ? "info" : "warning"
      }
    >
      {reclamo.estado}
    </StatusPill>,
    reclamo.tecnico?.nombre ?? "Sin asignar",
    formatDateTime(reclamo.fechaApertura.toISOString()),
    reclamo.descripcion,
    reclamo.resolucionCierre ?? reclamo.diagnosticoCierre ?? "-",
  ]);

  const facturasRows = abonado.facturas.map((factura) => [
    factura.numero,
    formatDate(factura.fechaEmision.toISOString()),
    formatDate(factura.fechaVencimiento.toISOString()),
    formatCurrency(Number(factura.total)),
    factura.detalles.map((detalle) => detalle.descripcion).join(" / "),
    <StatusPill
      key={`factura-${factura.id}`}
      tone={factura.estado === "PAGADA" ? "success" : factura.estado === "VENCIDA" ? "danger" : "warning"}
    >
      {factura.estado}
    </StatusPill>,
    <Link className="toolbar-button" href={`/facturacion/${factura.id}`} key={`factura-link-${factura.id}`}>
      Ver comprobante
    </Link>,
  ]);

  const pagosRows = abonado.pagos.map((pago) => [
    formatDateTime(pago.fecha.toISOString()),
    pago.numeroRecibo ?? "-",
    pago.medioPago,
    formatCurrency(Number(pago.importe)),
    pago.usuario.nombre,
    <StatusPill key={`pago-${pago.id}`} tone={pago.estado === "ANULADO" ? "danger" : "success"}>
      {pago.estado}
    </StatusPill>,
  ]);

  const movimientosRows = abonado.movimientos.map((movimiento) => [
    formatDateTime(movimiento.fecha.toISOString()),
    movimiento.tipo,
    movimiento.descripcion,
    formatCurrency(Number(movimiento.importe)),
    formatCurrency(Number(movimiento.saldo)),
  ]);

  const gestionesRows = abonado.gestionesCobranza.map((gestion) => [
    formatDateTime(gestion.createdAt.toISOString()),
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
              : "info"
      }
    >
      {gestion.estado}
    </StatusPill>,
    gestion.factura?.numero ?? "-",
    gestion.compromisoPagoAt ? formatDate(gestion.compromisoPagoAt.toISOString()) : "-",
    gestion.proximaGestionAt ? formatDate(gestion.proximaGestionAt.toISOString()) : "-",
    gestion.usuario.nombre,
  ]);

  const acuerdosRows = abonado.acuerdosPago.map((acuerdo) => [
    acuerdo.numero,
    formatDate(acuerdo.fechaAcuerdo.toISOString()),
    formatCurrency(Number(acuerdo.totalAcuerdo)),
    `${acuerdo.cuotas.filter((cuota) => cuota.estado === "PENDIENTE").length}/${acuerdo.cantidadCuotas}`,
    acuerdo.factura?.numero ?? "-",
    acuerdo.usuario.nombre,
    <StatusPill
      key={`acuerdo-${acuerdo.id}`}
      tone={
        acuerdo.estado === "CUMPLIDO"
          ? "success"
          : acuerdo.estado === "INCUMPLIDO"
            ? "danger"
            : acuerdo.estado === "ANULADO"
              ? "danger"
              : "warning"
      }
    >
      {acuerdo.estado}
    </StatusPill>,
  ]);

  const materialesRows = abonado.reclamos.flatMap((reclamo) =>
    reclamo.materiales.map((material) => [
      `#${reclamo.id}`,
      material.material.nombre,
      formatDecimal(Number(material.cantidad)),
      formatCurrency(Number(material.costoUnitario)),
      formatCurrency(Number(material.precioFacturable ?? 0)),
      material.facturarProximaFactura ? "SI" : "NO",
      material.facturado ? "SI" : "NO",
      formatDateTime(material.createdAt.toISOString()),
    ]),
  );

  const ordenesRows = abonado.ordenesTrabajo.map((orden) => [
    `#${orden.id}`,
    orden.tipo,
    orden.servicio?.servicioCatalogo?.nombre ?? orden.servicio?.plan ?? "-",
    orden.reclamoId ? `Reclamo #${orden.reclamoId}` : "-",
    <StatusPill
      key={`orden-${orden.id}`}
      tone={
        orden.estado === "RESUELTA"
          ? "success"
          : orden.estado === "EN_CURSO"
            ? "info"
            : orden.estado === "CANCELADA"
              ? "danger"
              : "warning"
      }
    >
      {orden.estado}
    </StatusPill>,
    orden.tecnico?.nombre ?? "Sin asignar",
    orden.fechaProgramada ? formatDate(orden.fechaProgramada.toISOString()) : "-",
    orden.resolucion ?? orden.motivo,
  ]);

  const comunicacionesRows = abonado.comunicaciones.map((comunicacion) => [
    formatDateTime(comunicacion.createdAt.toISOString()),
    comunicacion.canal,
    comunicacion.tipo,
    comunicacion.asunto,
    <StatusPill
      key={`com-status-${comunicacion.id}`}
      tone={
        comunicacion.estado === "ENVIADA"
          ? "success"
          : comunicacion.estado === "ERROR"
            ? "danger"
            : comunicacion.estado === "ARCHIVADA"
              ? "neutral"
              : "warning"
      }
    >
      {comunicacion.estado}
    </StatusPill>,
    comunicacion.visibleOficinaVirtual ? "SI" : "NO",
    comunicacion.usuario.nombre,
  ]);

  const panelContent = (() => {
    switch (activeTab) {
      case "resumen":
        return (
          <article className="card workspace-section workspace-section--padded">
            <div className="section-heading">
              <div>
                <h2>Tablero del abonado</h2>
                <p>Vista operativa concentrada del estado comercial, tecnico y financiero.</p>
              </div>
            </div>

            <section className="stats-grid stats-grid--3">
              <article className="card stat-card">
                <span className="stat-card__label">Saldo actual</span>
                <strong className="stat-card__value">{formatCurrency(saldoActual)}</strong>
                <p className="stat-card__detail">Ultimo saldo consolidado en cuenta corriente.</p>
              </article>
              <article className="card stat-card stat-card--warning">
                <span className="stat-card__label">Facturas abiertas</span>
                <strong className="stat-card__value">{facturasAbiertas.length}</strong>
                <p className="stat-card__detail">{facturasVencidas.length} vencidas y pendientes de recupero.</p>
              </article>
              <article className="card stat-card">
                <span className="stat-card__label">Ingreso mensual</span>
                <strong className="stat-card__value">{formatCurrency(ingresoMensual)}</strong>
                <p className="stat-card__detail">Base estimada de servicios facturables activos.</p>
              </article>
              <article className="card stat-card">
                <span className="stat-card__label">Servicios</span>
                <strong className="stat-card__value">{abonado.servicios.length}</strong>
                <p className="stat-card__detail">Contratos registrados para este abonado.</p>
              </article>
              <article className="card stat-card stat-card--warning">
                <span className="stat-card__label">Tickets abiertos</span>
                <strong className="stat-card__value">{reclamosAbiertos.length}</strong>
                <p className="stat-card__detail">{cargosPendientes} cargos tecnicos pendientes de facturar.</p>
              </article>
              <article className="card stat-card">
                <span className="stat-card__label">Ordenes abiertas</span>
                <strong className="stat-card__value">{ordenesAbiertas.length}</strong>
                <p className="stat-card__detail">
                  {promesasVigentes.length} promesas y {acuerdosVigentes.length} acuerdos vigentes.
                </p>
              </article>
            </section>

            <section className="split-grid split-grid--equal">
              <article className="card card--embedded">
                <div className="section-heading">
                  <div>
                    <h3>Estado comercial</h3>
                    <p>Lectura rapida para cobranza, soporte y administracion.</p>
                  </div>
                </div>
                <div className="stack-list">
                  <article className="stack-list__item">
                    <strong>Condicion fiscal</strong>
                    <p>
                      {abonado.condicionIva}
                      {abonado.condicionFiscal ? ` / ${abonado.condicionFiscal}` : ""}
                    </p>
                  </article>
                  <article className="stack-list__item">
                    <strong>Cuenta</strong>
                    <p>
                      Deuda abierta {formatCurrency(deudaAbierta)}. Ultimo saldo {formatCurrency(saldoActual)}.
                    </p>
                  </article>
                  <article className="stack-list__item">
                    <strong>Cobranza</strong>
                    <p>
                      {promesasVigentes.length} promesas vigentes, {acuerdosVigentes.length} planes activos y{" "}
                      {pagosVigentes.length} pagos registrados.
                    </p>
                  </article>
                  <article className="stack-list__item">
                    <strong>Operacion</strong>
                    <p>
                      {abonado.servicios.length} servicios / {ordenesAbiertas.length} OT abiertas /{" "}
                      {reclamosAbiertos.length} tickets activos.
                    </p>
                  </article>
                </div>
              </article>

              <article className="card card--embedded">
                <div className="section-heading">
                  <div>
                    <h3>Actividad reciente</h3>
                    <p>Ultimos movimientos visibles dentro del historial del abonado.</p>
                  </div>
                </div>
                <div className="stack-list">
                  <article className="stack-list__item">
                    <strong>Ultima factura</strong>
                    <p>
                      {latestFactura
                        ? `${latestFactura.numero} emitida ${formatDate(latestFactura.fechaEmision.toISOString())} por ${formatCurrency(Number(latestFactura.total))}`
                        : "Sin facturas emitidas."}
                    </p>
                  </article>
                  <article className="stack-list__item">
                    <strong>Ultimo pago</strong>
                    <p>
                      {latestPago
                        ? `${formatCurrency(Number(latestPago.importe))} registrado el ${formatDateTime(latestPago.fecha.toISOString())}`
                        : "Sin pagos registrados."}
                    </p>
                  </article>
                  <article className="stack-list__item">
                    <strong>Ultimo ticket</strong>
                    <p>
                      {latestReclamo
                        ? `#${latestReclamo.id} ${latestReclamo.estado} desde ${formatDateTime(latestReclamo.fechaApertura.toISOString())}`
                        : "Sin tickets en historial."}
                    </p>
                  </article>
                  <article className="stack-list__item">
                    <strong>Ultima orden</strong>
                    <p>
                      {latestOrden
                        ? `#${latestOrden.id} ${latestOrden.tipo} ${latestOrden.estado}`
                        : "Sin ordenes de trabajo registradas."}
                    </p>
                  </article>
                </div>
              </article>
            </section>
          </article>
        );
      case "gestion":
        return (
          <article className="card workspace-section workspace-section--padded">
            <div className="section-heading">
              <div>
                <h2>Gestion integral</h2>
                <p>Actualiza la ficha, registra cobranzas y abre tickets sin salir del panel del abonado.</p>
              </div>
            </div>

            {user.rol !== "TECNICO" ? (
              <div className="workspace-focus-grid">
                <article className="form-panel form-panel--primary">
                  <div className="section-heading">
                    <div>
                      <h3>Ficha general</h3>
                      <p>Datos comerciales, fiscales, de contacto y localizacion del abonado.</p>
                    </div>
                  </div>
                  <form action={updateAbonadoAction}>
                    <input name="abonadoId" type="hidden" value={abonado.id} />
                    <input name="redirectPath" type="hidden" value={tabPath("gestion")} />
                    <div className="form-grid form-grid--4">
                      <label className="field">
                        <span>Numero abonado</span>
                        <input defaultValue={abonado.numeroAbonado} name="numeroAbonado" required type="text" />
                      </label>
                      <label className="field">
                        <span>Nombre</span>
                        <input defaultValue={abonado.nombre ?? ""} name="nombre" type="text" />
                      </label>
                      <label className="field">
                        <span>Apellido</span>
                        <input defaultValue={abonado.apellido ?? ""} name="apellido" type="text" />
                      </label>
                      <label className="field">
                        <span>Razon social</span>
                        <input defaultValue={abonado.razonSocial ?? ""} name="razonSocial" type="text" />
                      </label>
                    </div>
                    <div className="form-grid form-grid--4">
                      <label className="field">
                        <span>Documento</span>
                        <input defaultValue={abonado.documento ?? ""} name="documento" type="text" />
                      </label>
                      <label className="field">
                        <span>Tipo documento</span>
                        <input defaultValue={abonado.tipoDocumento ?? "DNI"} name="tipoDocumento" type="text" />
                      </label>
                      <label className="field">
                        <span>CUIT</span>
                        <input defaultValue={abonado.cuit ?? ""} name="cuit" type="text" />
                      </label>
                      <label className="field">
                        <span>Estado</span>
                        <select defaultValue={abonado.estado} name="estado">
                          <option value="ACTIVO">Activo</option>
                          <option value="SUSPENDIDO">Suspendido</option>
                          <option value="BAJA">Baja</option>
                        </select>
                      </label>
                    </div>
                    <div className="form-grid form-grid--4">
                      <label className="field">
                        <span>Telefono</span>
                        <input defaultValue={abonado.telefono ?? ""} name="telefono" type="text" />
                      </label>
                      <label className="field">
                        <span>Email</span>
                        <input defaultValue={abonado.email ?? ""} name="email" type="email" />
                      </label>
                      <label className="field">
                        <span>Condicion IVA</span>
                        <select defaultValue={abonado.condicionIva} name="condicionIva" required>
                          {formData.ivaConditions.map((condition) => (
                            <option key={condition} value={condition}>
                              {condition}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Condicion fiscal</span>
                        <input defaultValue={abonado.condicionFiscal ?? ""} name="condicionFiscal" type="text" />
                      </label>
                    </div>
                    <div className="form-grid form-grid--4">
                      <label className="field field--span-2">
                        <span>Domicilio</span>
                        <input defaultValue={abonado.domicilio} name="domicilio" required type="text" />
                      </label>
                      <label className="field">
                        <span>Localidad</span>
                        <input defaultValue={abonado.localidad} name="localidad" required type="text" />
                      </label>
                      <label className="field">
                        <span>Provincia</span>
                        <input defaultValue={abonado.provincia ?? ""} name="provincia" type="text" />
                      </label>
                    </div>
                    <div className="form-grid form-grid--4">
                      <label className="field">
                        <span>Codigo postal</span>
                        <input defaultValue={abonado.codigoPostal ?? ""} name="codigoPostal" type="text" />
                      </label>
                      <label className="field">
                        <span>Socio asociado</span>
                        <select defaultValue={abonado.socioId ?? ""} name="socioId">
                          <option value="">Sin asociar</option>
                          {formData.socios.map((socio) => (
                            <option key={socio.id} value={socio.id}>
                              {[socio.apellido, socio.nombre].filter(Boolean).join(", ")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Es socio</span>
                        <div className="field__value">
                          <input defaultChecked={abonado.esSocio} name="esSocio" type="checkbox" value="SI" />
                        </div>
                      </label>
                    </div>
                    <label className="field">
                      <span>Observaciones</span>
                      <textarea defaultValue={abonado.observaciones ?? ""} name="observaciones" rows={3} />
                    </label>
                    <div className="form-actions">
                      <SubmitButton idleLabel="Guardar ficha" pendingLabel="Guardando..." />
                    </div>
                  </form>
                </article>

                <div className="workspace-side-stack">
                  <article className="form-panel">
                    <div className="section-heading">
                      <div>
                        <h3>Registrar pago</h3>
                        <p>Genera recibo y aplica el importe sobre deuda abierta o saldo a favor.</p>
                      </div>
                    </div>
                    <form action={createPagoAction}>
                      <input name="abonadoId" type="hidden" value={abonado.id} />
                      <input name="usuarioId" type="hidden" value={user.id} />
                      <input name="redirectPath" type="hidden" value={tabPath("gestion")} />
                      <div className="form-grid">
                        <label className="field">
                          <span>Medio de pago</span>
                          <select defaultValue="TRANSFERENCIA" name="medioPago" required>
                            {formData.paymentMethods.map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Importe</span>
                          <input name="importe" placeholder="25000" required type="text" />
                        </label>
                        <label className="field">
                          <span>Descripcion</span>
                          <input name="descripcion" placeholder="Cobro en caja o transferencia" type="text" />
                        </label>
                      </div>
                      <div className="form-actions">
                        <SubmitButton idleLabel="Registrar pago" pendingLabel="Registrando..." />
                      </div>
                    </form>
                  </article>

                  <article className="form-panel">
                    <div className="section-heading">
                      <div>
                        <h3>Gestion de cobranza</h3>
                        <p>Registra contacto, promesa de pago y proxima accion desde la misma ficha.</p>
                      </div>
                    </div>
                    <form action={createGestionCobranzaAction}>
                      <input name="abonadoId" type="hidden" value={abonado.id} />
                      <input name="redirectPath" type="hidden" value={tabPath("gestion")} />
                      <div className="form-grid">
                        <label className="field">
                          <span>Canal</span>
                          <select defaultValue="TELEFONO" name="canal" required>
                            {formData.collectionChannels.map((channel) => (
                              <option key={channel} value={channel}>
                                {channel}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Resultado</span>
                          <select defaultValue="CONTACTADO" name="resultado" required>
                            {formData.collectionOutcomes.map((outcome) => (
                              <option key={outcome} value={outcome}>
                                {outcome}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Factura asociada</span>
                          <select defaultValue="" name="facturaId">
                            <option value="">Sin asociar</option>
                            {facturasAbiertas.map((factura) => (
                              <option key={factura.id} value={factura.id}>
                                {factura.numero} - {formatCurrency(Number(factura.total))}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Compromiso de pago</span>
                          <input name="compromisoPagoAt" type="date" />
                        </label>
                        <label className="field">
                          <span>Importe comprometido</span>
                          <input name="compromisoImporte" placeholder="15000" type="text" />
                        </label>
                        <label className="field">
                          <span>Proxima gestion</span>
                          <input name="proximaGestionAt" type="date" />
                        </label>
                      </div>
                      <label className="field">
                        <span>Detalle</span>
                        <textarea name="detalle" placeholder="Resumen de la gestion realizada" rows={3} />
                      </label>
                      <div className="form-actions">
                        <SubmitButton idleLabel="Guardar gestion" pendingLabel="Guardando..." />
                      </div>
                    </form>
                  </article>

                  <div className="workspace-quick-grid">
                    <article className="form-panel">
                      <div className="section-heading">
                        <div>
                          <h3>Plan de pago</h3>
                          <p>Formaliza un acuerdo administrativo de regularizacion.</p>
                        </div>
                      </div>
                      <form action={createAcuerdoPagoAction}>
                        <input name="abonadoId" type="hidden" value={abonado.id} />
                        <input name="redirectPath" type="hidden" value={tabPath("gestion")} />
                        <div className="form-grid">
                          <label className="field">
                            <span>Factura asociada</span>
                            <select defaultValue="" name="facturaId">
                              <option value="">Cuenta general</option>
                              {facturasAbiertas.map((factura) => (
                                <option key={factura.id} value={factura.id}>
                                  {factura.numero} - {formatCurrency(Number(factura.total))}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Total acuerdo</span>
                            <input
                              defaultValue={deudaAbierta > 0 ? String(deudaAbierta) : ""}
                              name="totalAcuerdo"
                              required
                              type="text"
                            />
                          </label>
                          <label className="field">
                            <span>Cantidad cuotas</span>
                            <input defaultValue="3" name="cantidadCuotas" required type="number" />
                          </label>
                          <label className="field">
                            <span>Primer vencimiento</span>
                            <input defaultValue={toDateInputValue(new Date())} name="primerVencimiento" required type="date" />
                          </label>
                          <label className="field">
                            <span>Descripcion</span>
                            <input name="descripcion" placeholder="Acuerdo especial de regularizacion" type="text" />
                          </label>
                          <label className="field">
                            <span>Observaciones</span>
                            <input name="observaciones" placeholder="Condiciones del acuerdo" type="text" />
                          </label>
                        </div>
                        <div className="form-actions">
                          <SubmitButton idleLabel="Crear plan de pago" pendingLabel="Creando..." />
                        </div>
                      </form>
                    </article>

                    <article className="form-panel">
                      <div className="section-heading">
                        <div>
                          <h3>Abrir ticket</h3>
                          <p>Registra un reclamo tecnico o administrativo en el historial.</p>
                        </div>
                      </div>
                      <form action={createReclamoAction}>
                        <input name="abonadoId" type="hidden" value={abonado.id} />
                        <input name="redirectPath" type="hidden" value={tabPath("gestion")} />
                        <div className="form-grid">
                          <label className="field">
                            <span>Servicio</span>
                            <select defaultValue={serviceTypeOptions[0] ?? "INTERNET"} name="tipoServicio" required>
                              {serviceTypeOptions.map((serviceType) => (
                                <option key={serviceType} value={serviceType}>
                                  {serviceType}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Prioridad</span>
                            <select defaultValue="MEDIA" name="prioridad" required>
                              {formData.ticketPriorities.map((priority) => (
                                <option key={priority} value={priority}>
                                  {priority}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Tecnico</span>
                            <select defaultValue="" name="tecnicoId">
                              <option value="">Asignar luego</option>
                              {formData.tecnicos.map((tecnico) => (
                                <option key={tecnico.id} value={tecnico.id}>
                                  {tecnico.nombre}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="field">
                          <span>Descripcion</span>
                          <textarea name="descripcion" placeholder="Detalle del reclamo o solicitud" required rows={3} />
                        </label>
                        <div className="form-actions">
                          <SubmitButton idleLabel="Crear ticket" pendingLabel="Registrando..." />
                        </div>
                      </form>
                    </article>
                  </div>
                </div>
              </div>
            ) : (
              <article className="card card--embedded">
                <p>Tu perfil tecnico puede consultar la ficha, tickets, ordenes y comunicaciones de este abonado.</p>
              </article>
            )}
          </article>
        );
      case "servicios":
        return (
          <article className="card workspace-section workspace-section--padded">
            <div className="section-heading">
              <div>
                <h2>Servicios y contratos</h2>
                <p>Contratacion, configuracion y acciones operativas sobre cada servicio del abonado.</p>
              </div>
            </div>

            <DataTable
              columns={["Contrato", "Categoria", "Servicio", "Precio", "Cantidad", "Bonificacion", "Uso", "Estado"]}
              rows={serviciosRows}
              emptyMessage="Este abonado todavia no tiene servicios asociados."
            />

            {user.rol !== "TECNICO" ? (
              <article className="form-panel">
                <div className="section-heading">
                  <div>
                    <h3>Contratar nuevo servicio</h3>
                    <p>Agrega contratos para que impacten en soporte, ordenes y facturacion.</p>
                  </div>
                </div>
                <form action={contractServicioAction}>
                  <input name="abonadoId" type="hidden" value={abonado.id} />
                  <input name="redirectPath" type="hidden" value={tabPath("servicios")} />
                  <div className="form-grid form-grid--4">
                    <label className="field">
                      <span>Servicio global</span>
                      <select defaultValue="" name="servicioCatalogoId" required>
                        <option value="">Seleccionar servicio</option>
                        {formData.catalogoServicios.map((servicio) => (
                          <option key={servicio.id} value={servicio.id}>
                            {servicio.categoria} - {servicio.nombre} ({formatCurrency(Number(servicio.precioBase))})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Numero contrato</span>
                      <input name="numeroContrato" placeholder="Opcional" type="text" />
                    </label>
                    <label className="field">
                      <span>Precio</span>
                      <input name="precio" placeholder="28500" required type="text" />
                    </label>
                    <label className="field">
                      <span>Cantidad</span>
                      <input defaultValue="1" name="cantidad" type="text" />
                    </label>
                  </div>
                  <div className="form-grid form-grid--4">
                    <label className="field">
                      <span>Bonificacion</span>
                      <input defaultValue="0" name="bonificacion" type="text" />
                    </label>
                    <label className="field">
                      <span>Facturable</span>
                      <select defaultValue="SI" name="facturable">
                        <option value="SI">Si</option>
                        <option value="NO">No</option>
                      </select>
                    </label>
                    <label className="field field--span-2">
                      <span>Observaciones</span>
                      <input name="observaciones" placeholder="Alta, promo, zona o instalacion" type="text" />
                    </label>
                  </div>
                  <div className="form-actions">
                    <SubmitButton idleLabel="Contratar servicio" pendingLabel="Contratando..." />
                  </div>
                </form>
              </article>
            ) : null}

            {user.rol !== "TECNICO" && abonado.servicios.length > 0 ? (
              <div className="task-list">
                {abonado.servicios.map((servicio) => (
                  <article className="form-panel" key={servicio.id}>
                    <form action={updateServicioContratoAction}>
                      <input name="servicioId" type="hidden" value={servicio.id} />
                      <input name="abonadoId" type="hidden" value={abonado.id} />
                      <input name="redirectPath" type="hidden" value={tabPath("servicios")} />
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">Contrato</span>
                          <h3>{servicio.servicioCatalogo?.nombre ?? servicio.plan}</h3>
                          <p>{servicio.numeroContrato ?? "Sin numero de contrato"}.</p>
                        </div>
                        <div className="hero__chips">
                          <StatusPill tone={servicio.estado === "ACTIVO" ? "success" : "warning"}>
                            {servicio.estado}
                          </StatusPill>
                          <span className="hero-chip">{openOrdersByService.get(servicio.id) ?? 0} OT abiertas</span>
                        </div>
                      </div>
                      <div className="form-grid form-grid--4">
                        <label className="field">
                          <span>Numero contrato</span>
                          <input defaultValue={servicio.numeroContrato ?? ""} name="numeroContrato" type="text" />
                        </label>
                        <label className="field">
                          <span>Precio</span>
                          <input defaultValue={String(Number(servicio.precio))} name="precio" required type="text" />
                        </label>
                        <label className="field">
                          <span>Cantidad</span>
                          <input defaultValue={String(Number(servicio.cantidad))} name="cantidad" required type="text" />
                        </label>
                        <label className="field">
                          <span>Bonificacion</span>
                          <input defaultValue={String(Number(servicio.bonificacion))} name="bonificacion" type="text" />
                        </label>
                      </div>
                      <div className="form-grid form-grid--4">
                        <label className="field">
                          <span>Estado</span>
                          <select defaultValue={servicio.estado} name="estado">
                            <option value="PENDIENTE_INSTALACION">Pendiente instalacion</option>
                            <option value="ACTIVO">Activo</option>
                            <option value="SUSPENDIDO">Suspendido</option>
                            <option value="BAJA">Baja</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Facturable</span>
                          <div className="field__value">
                            <input defaultChecked={servicio.facturable} name="facturable" type="checkbox" value="SI" />
                          </div>
                        </label>
                        <label className="field field--span-2">
                          <span>Observaciones</span>
                          <input defaultValue={servicio.observaciones ?? ""} name="observaciones" type="text" />
                        </label>
                      </div>
                      <div className="form-actions">
                        <SubmitButton idleLabel="Guardar contrato" pendingLabel="Guardando..." />
                      </div>
                    </form>

                    <div className="section-heading">
                      <div>
                        <h3>Acciones operativas</h3>
                        <p>Instalacion, corte, reconexion, baja o visita tecnica desde esta ficha.</p>
                      </div>
                    </div>
                    <div className="workspace-action-row">
                      {servicio.estado === "PENDIENTE_INSTALACION" ? (
                        <form action={createServicioOrdenRapidaAction}>
                          <input name="abonadoId" type="hidden" value={abonado.id} />
                          <input name="servicioId" type="hidden" value={servicio.id} />
                          <input name="tipo" type="hidden" value="INSTALACION" />
                          <input name="redirectPath" type="hidden" value={tabPath("servicios")} />
                          <SubmitButton idleLabel="Crear instalacion" pendingLabel="Creando..." />
                        </form>
                      ) : null}
                      {servicio.estado === "ACTIVO" ? (
                        <>
                          <form action={createServicioOrdenRapidaAction}>
                            <input name="abonadoId" type="hidden" value={abonado.id} />
                            <input name="servicioId" type="hidden" value={servicio.id} />
                            <input name="tipo" type="hidden" value="CORTE" />
                            <input name="redirectPath" type="hidden" value={tabPath("servicios")} />
                            <SubmitButton idleLabel="Solicitar corte" pendingLabel="Creando..." />
                          </form>
                          <form action={createServicioOrdenRapidaAction}>
                            <input name="abonadoId" type="hidden" value={abonado.id} />
                            <input name="servicioId" type="hidden" value={servicio.id} />
                            <input name="tipo" type="hidden" value="BAJA" />
                            <input name="redirectPath" type="hidden" value={tabPath("servicios")} />
                            <SubmitButton idleLabel="Solicitar baja" pendingLabel="Creando..." />
                          </form>
                        </>
                      ) : null}
                      {servicio.estado === "SUSPENDIDO" ? (
                        <form action={createServicioOrdenRapidaAction}>
                          <input name="abonadoId" type="hidden" value={abonado.id} />
                          <input name="servicioId" type="hidden" value={servicio.id} />
                          <input name="tipo" type="hidden" value="RECONEXION" />
                          <input name="redirectPath" type="hidden" value={tabPath("servicios")} />
                          <SubmitButton idleLabel="Solicitar reconexion" pendingLabel="Creando..." />
                        </form>
                      ) : null}
                      {servicio.estado !== "BAJA" ? (
                        <>
                          <form action={createServicioOrdenRapidaAction}>
                            <input name="abonadoId" type="hidden" value={abonado.id} />
                            <input name="servicioId" type="hidden" value={servicio.id} />
                            <input name="tipo" type="hidden" value="VISITA_TECNICA" />
                            <input name="redirectPath" type="hidden" value={tabPath("servicios")} />
                            <SubmitButton idleLabel="Visita tecnica" pendingLabel="Creando..." />
                          </form>
                          <form action={createServicioOrdenRapidaAction}>
                            <input name="abonadoId" type="hidden" value={abonado.id} />
                            <input name="servicioId" type="hidden" value={servicio.id} />
                            <input name="tipo" type="hidden" value="MANTENIMIENTO" />
                            <input name="redirectPath" type="hidden" value={tabPath("servicios")} />
                            <SubmitButton idleLabel="Mantenimiento" pendingLabel="Creando..." />
                          </form>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </article>
        );
      case "finanzas":
        return (
          <article className="card workspace-section workspace-section--padded">
            <div className="section-heading">
              <div>
                <h2>Finanzas y cobranzas</h2>
                <p>Facturacion, pagos, cuenta corriente, recupero y acuerdos del abonado.</p>
              </div>
            </div>

            <section className="workspace-tiles">
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Deuda abierta</span>
                <h3>{formatCurrency(deudaAbierta)}</h3>
                <p>{facturasVencidas.length} facturas vencidas y {facturasAbiertas.length} abiertas.</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Pagos registrados</span>
                <h3>{pagosVigentes.length}</h3>
                <p>Recibos vigentes con impacto real en cuenta corriente.</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Gestiones</span>
                <h3>{abonado.gestionesCobranza.length}</h3>
                <p>{promesasVigentes.length} promesas vigentes y seguimiento en curso.</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Acuerdos</span>
                <h3>{abonado.acuerdosPago.length}</h3>
                <p>{acuerdosVigentes.length} planes vigentes para regularizacion.</p>
              </article>
            </section>

            <section className="split-grid">
              <article className="card card--embedded">
                <div className="section-heading">
                  <div>
                    <h3>Facturas</h3>
                    <p>{abonado.facturas.length} comprobantes emitidos.</p>
                  </div>
                </div>
                <DataTable
                  columns={["Factura", "Emision", "Vencimiento", "Total", "Detalle", "Estado", "Ficha"]}
                  rows={facturasRows}
                  emptyMessage="No hay facturas emitidas para este abonado."
                />
              </article>

              <article className="card card--embedded">
                <div className="section-heading">
                  <div>
                    <h3>Pagos registrados</h3>
                    <p>{abonado.pagos.length} movimientos de cobro en el historial.</p>
                  </div>
                </div>
                <DataTable
                  columns={["Fecha", "Recibo", "Medio", "Importe", "Operador", "Estado"]}
                  rows={pagosRows}
                  emptyMessage="No hay pagos cargados para este abonado."
                />
              </article>
            </section>

            <section className="split-grid">
              <article className="card card--embedded">
                <div className="section-heading">
                  <div>
                    <h3>Cuenta corriente</h3>
                    <p>{abonado.movimientos.length} movimientos registrados en el extracto.</p>
                  </div>
                </div>
                <DataTable
                  columns={["Fecha", "Tipo", "Descripcion", "Importe", "Saldo"]}
                  rows={movimientosRows}
                  emptyMessage="No hay movimientos en cuenta corriente para este abonado."
                />
              </article>

              <article className="card card--embedded">
                <div className="section-heading">
                  <div>
                    <h3>Gestiones y acuerdos</h3>
                    <p>{abonado.gestionesCobranza.length} gestiones y {abonado.acuerdosPago.length} acuerdos historicos.</p>
                  </div>
                </div>
                <div className="workspace-table-stack">
                  <DataTable
                    columns={["Fecha", "Canal", "Resultado", "Estado", "Factura", "Compromiso", "Proxima", "Operador"]}
                    rows={gestionesRows}
                    emptyMessage="No hay gestiones de cobranza registradas."
                  />
                  <DataTable
                    columns={["Acuerdo", "Fecha", "Total", "Pendientes", "Factura", "Operador", "Estado"]}
                    rows={acuerdosRows}
                    emptyMessage="No hay acuerdos de pago registrados."
                  />
                </div>
              </article>
            </section>
          </article>
        );
      case "soporte":
        return (
          <article className="card workspace-section workspace-section--padded">
            <div className="section-heading">
              <div>
                <h2>Tickets e historial tecnico</h2>
                <p>Reclamos, resoluciones, materiales y cargos asociados al soporte del abonado.</p>
              </div>
            </div>

            <section className="workspace-tiles">
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Tickets activos</span>
                <h3>{reclamosAbiertos.length}</h3>
                <p>{abonado.reclamos.length} reclamos acumulados en el historial.</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Cargos tecnicos</span>
                <h3>{cargosPendientes}</h3>
                <p>Materiales pendientes de pasar a proxima factura.</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Tecnico reciente</span>
                <h3>{latestReclamo?.tecnico?.nombre ?? "Sin asignar"}</h3>
                <p>Ultimo tecnico vinculado a tickets de este abonado.</p>
              </article>
            </section>

            <section className="split-grid">
              <article className="card card--embedded">
                <div className="section-heading">
                  <div>
                    <h3>Reclamos</h3>
                    <p>{abonado.reclamos.length} tickets dentro del historial del abonado.</p>
                  </div>
                </div>
                <DataTable
                  columns={["Ticket", "Servicio", "Prioridad", "Estado", "Tecnico", "Apertura", "Descripcion", "Cierre"]}
                  rows={reclamosRows}
                  emptyMessage="No hay reclamos en el historial del abonado."
                />
              </article>

              <article className="card card--embedded">
                <div className="section-heading">
                  <div>
                    <h3>Materiales e insumos</h3>
                    <p>Todo lo consumido en reclamos y su estado de facturacion.</p>
                  </div>
                </div>
                <DataTable
                  columns={["Ticket", "Material", "Cantidad", "Costo", "Precio factura", "Proxima factura", "Facturado", "Fecha"]}
                  rows={materialesRows}
                  emptyMessage="Todavia no hay materiales asociados a reclamos de este abonado."
                />
              </article>
            </section>
          </article>
        );
      case "ordenes":
        return (
          <article className="card workspace-section workspace-section--padded">
            <div className="section-heading">
              <div>
                <h2>Ordenes de trabajo</h2>
                <p>Instalaciones, cortes, reconexiones y visitas tecnicas vinculadas a este abonado.</p>
              </div>
            </div>

            <section className="workspace-tiles">
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Pendientes</span>
                <h3>{abonado.ordenesTrabajo.filter((orden) => orden.estado === "PENDIENTE").length}</h3>
                <p>Ordenes aun no asignadas ni ejecutadas.</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">En curso</span>
                <h3>{abonado.ordenesTrabajo.filter((orden) => ["ASIGNADA", "EN_CURSO"].includes(orden.estado)).length}</h3>
                <p>Trabajos activos o ya tomados por tecnico.</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Resueltas</span>
                <h3>{abonado.ordenesTrabajo.filter((orden) => orden.estado === "RESUELTA").length}</h3>
                <p>Historial ya cerrado sobre este abonado.</p>
              </article>
            </section>

            <DataTable
              columns={["OT", "Tipo", "Servicio", "Reclamo", "Estado", "Tecnico", "Programada", "Resultado"]}
              rows={ordenesRows}
              emptyMessage="Este abonado todavia no tiene ordenes de trabajo registradas."
            />
          </article>
        );
      case "comunicaciones":
        return (
          <article className="card workspace-section workspace-section--padded">
            <div className="section-heading">
              <div>
                <h2>Comunicaciones</h2>
                <p>Registro centralizado de email, WhatsApp, avisos internos y oficina virtual.</p>
              </div>
            </div>

            <section className="workspace-tiles">
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Email</span>
                <h3>{abonado.email ?? "Sin email cargado"}</h3>
                <p>{abonado.email ? "Canal disponible para avisos y comprobantes." : "Falta cargar email del abonado."}</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">WhatsApp</span>
                <h3>{abonado.telefono ?? "Sin telefono cargado"}</h3>
                <p>{whatsappHref ? "Canal listo para mensajeria rapida." : "Falta normalizar telefono del abonado."}</p>
              </article>
              <article className="workspace-tile">
                <span className="workspace-tile__eyebrow">Historial</span>
                <h3>{abonado.comunicaciones.length}</h3>
                <p>{abonado.comunicaciones.filter((item) => item.visibleOficinaVirtual).length} visibles en oficina virtual.</p>
              </article>
            </section>

            <section className="workspace-focus-grid">
              <article className="form-panel form-panel--primary">
                <div className="section-heading">
                  <div>
                    <h3>Nueva comunicacion</h3>
                    <p>Registra la notificacion para el abonado y dejala lista para envio o seguimiento.</p>
                  </div>
                </div>
                {formData.communicationTemplates.length > 0 ? (
                  <div className="workspace-inline-panel">
                    <div>
                      <span className="eyebrow">Plantillas</span>
                      <h3>{selectedCommunicationTemplate?.nombre ?? "Redaccion manual"}</h3>
                      <p>
                        {selectedCommunicationTemplate
                          ? `${selectedCommunicationTemplate.codigo} / ${selectedCommunicationTemplate.canal} / ${selectedCommunicationTemplate.tipo}`
                          : "Selecciona una plantilla para precargar asunto, mensaje y defaults."}
                      </p>
                    </div>
                    <form method="get">
                      <input name="tab" type="hidden" value="comunicaciones" />
                      <div className="workspace-action-row">
                        <select defaultValue={selectedCommunicationTemplate ? String(selectedCommunicationTemplate.id) : ""} name="template">
                          <option value="">Redaccion manual</option>
                          {formData.communicationTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.codigo} - {template.nombre}
                            </option>
                          ))}
                        </select>
                        <button className="toolbar-button" type="submit">
                          Aplicar plantilla
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
                <form action={createComunicacionAbonadoAction}>
                  <input name="abonadoId" type="hidden" value={abonado.id} />
                  <input name="redirectPath" type="hidden" value={tabPath("comunicaciones")} />
                  <input name="origenModulo" type="hidden" value="ABONADOS" />
                  <input
                    name="plantillaId"
                    type="hidden"
                    value={selectedCommunicationTemplate ? String(selectedCommunicationTemplate.id) : ""}
                  />
                  <div className="form-grid form-grid--4">
                    <label className="field">
                      <span>Canal</span>
                      <select defaultValue={communicationPreview?.canal ?? "EMAIL"} name="canal" required>
                        {formData.communicationChannels.map((channel) => (
                          <option key={channel} value={channel}>
                            {channel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Tipo</span>
                      <select defaultValue={communicationPreview?.tipo ?? "AVISO_GENERAL"} name="tipo" required>
                        {formData.communicationTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Estado</span>
                      <select defaultValue="REGISTRADA" name="estado" required>
                        {formData.communicationStates.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Prioridad</span>
                      <select defaultValue={communicationPreview?.prioridad ?? "NORMAL"} name="prioridad" required>
                        {formData.communicationPriorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {formData.communicationTemplates.length > 0 ? (
                    <div className="workspace-action-row">
                      <Link className="toolbar-button" href={tabPath("comunicaciones")}>
                        Redaccion manual
                      </Link>
                      {formData.communicationTemplates.slice(0, 4).map((template) => (
                        <Link
                          className="toolbar-button"
                          href={`${tabPath("comunicaciones")}&template=${template.id}`}
                          key={template.id}
                        >
                          {template.codigo}
                        </Link>
                      ))}
                      <Link className="toolbar-button" href="/comunicaciones">
                        Ver todas las plantillas
                      </Link>
                    </div>
                  ) : null}
                  <div className="form-grid form-grid--2">
                    <label className="field">
                      <span>Asunto</span>
                      <input
                        defaultValue={communicationPreview?.asunto ?? ""}
                        name="asunto"
                        placeholder="Aviso de facturacion, gestion o soporte"
                        required
                        type="text"
                      />
                    </label>
                    <label className="field">
                      <span>Programada para</span>
                      <input name="programadaAt" type="datetime-local" />
                    </label>
                  </div>
                  <label className="field">
                    <span>Mensaje</span>
                    <textarea
                      defaultValue={communicationPreview?.mensaje ?? ""}
                      name="mensaje"
                      placeholder="Contenido de la comunicacion"
                      required
                      rows={6}
                    />
                  </label>
                  <div className="form-grid form-grid--2">
                    <label className="field">
                      <span>Visible en oficina virtual</span>
                      <div className="field__value">
                        <input
                          defaultChecked={selectedCommunicationTemplate?.visibleOficinaVirtualDefault ?? false}
                          name="visibleOficinaVirtual"
                          type="checkbox"
                          value="SI"
                        />
                      </div>
                    </label>
                    <label className="field">
                      <span>Requiere seguimiento</span>
                      <div className="field__value">
                        <input
                          defaultChecked={selectedCommunicationTemplate?.requiereSeguimientoDefault ?? false}
                          name="requiereSeguimiento"
                          type="checkbox"
                          value="SI"
                        />
                      </div>
                    </label>
                  </div>
                  <div className="form-actions">
                    <SubmitButton idleLabel="Registrar comunicacion" pendingLabel="Guardando..." />
                  </div>
                </form>
              </article>

              <div className="workspace-side-stack">
                <article className="card card--embedded">
                  <div className="section-heading">
                    <div>
                      <h3>Acciones rapidas</h3>
                      <p>Atajos directos por canal disponible.</p>
                    </div>
                  </div>
                    <div className="workspace-action-row">
                      {abonado.email ? (
                        <a className="toolbar-button" href={`mailto:${abonado.email}`}>
                          Redactar email
                        </a>
                      ) : null}
                      {whatsappHref ? (
                        <a className="toolbar-button" href={whatsappHref} rel="noreferrer" target="_blank">
                          Abrir WhatsApp
                        </a>
                      ) : null}
                      <Link className="toolbar-button" href={`/oficina-virtual/${abonado.id}`}>
                        Preview oficina virtual
                      </Link>
                      <Link className="toolbar-button" href="/comunicaciones">
                        Ver modulo global
                      </Link>
                  </div>
                </article>

                <article className="card card--embedded">
                  <div className="section-heading">
                    <div>
                      <h3>Variables de plantilla</h3>
                      <p>Campos dinamicos disponibles para email, WhatsApp y oficina virtual.</p>
                    </div>
                  </div>
                  <div className="stack-list">
                    {[
                      "{{abonado_titular}}",
                      "{{abonado_numero}}",
                      "{{abonado_email}}",
                      "{{abonado_telefono}}",
                      "{{abonado_localidad}}",
                      "{{deuda_abierta}}",
                      "{{facturas_abiertas}}",
                      "{{facturas_vencidas}}",
                      "{{servicios_activos}}",
                      "{{fecha_hoy}}",
                    ].map((variable) => (
                      <article className="stack-list__item" key={variable}>
                        <strong>{variable}</strong>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="card card--embedded">
                  <div className="section-heading">
                    <div>
                      <h3>Historial reciente</h3>
                      <p>Ultimos registros de comunicacion sobre este abonado.</p>
                    </div>
                  </div>
                  <DataTable
                    columns={["Fecha", "Canal", "Tipo", "Asunto", "Estado", "Oficina virtual", "Operador"]}
                    rows={comunicacionesRows}
                    emptyMessage="Todavia no hay comunicaciones registradas para este abonado."
                  />
                </article>

                {abonado.comunicaciones.slice(0, 3).map((comunicacion) => (
                  <article className="card card--embedded" key={comunicacion.id}>
                    <div className="section-heading">
                      <div>
                        <h3>{comunicacion.asunto}</h3>
                        <p>
                          {comunicacion.canal} / {comunicacion.tipo} / {formatDateTime(comunicacion.createdAt.toISOString())}
                        </p>
                      </div>
                    </div>
                    <p>{comunicacion.mensaje}</p>
                    <div className="workspace-action-row">
                      {["REGISTRADA", "PROGRAMADA", "ERROR"].includes(comunicacion.estado) ? (
                        <form action={updateComunicacionEstadoAction}>
                          <input name="comunicacionId" type="hidden" value={comunicacion.id} />
                          <input name="estado" type="hidden" value="ENVIADA" />
                          <input name="redirectPath" type="hidden" value={tabPath("comunicaciones")} />
                          <SubmitButton idleLabel="Marcar enviada" pendingLabel="Actualizando..." />
                        </form>
                      ) : null}
                      {comunicacion.estado !== "ARCHIVADA" ? (
                        <form action={updateComunicacionEstadoAction}>
                          <input name="comunicacionId" type="hidden" value={comunicacion.id} />
                          <input name="estado" type="hidden" value="ARCHIVADA" />
                          <input name="redirectPath" type="hidden" value={tabPath("comunicaciones")} />
                          <SubmitButton idleLabel="Archivar" pendingLabel="Actualizando..." />
                        </form>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </article>
        );
    }
  })();

  return (
    <section className="page-stack">
      <FeedbackBanner message={ok} tone="success" />
      <FeedbackBanner message={error} tone="error" />

      <article className="card subscriber-header subscriber-header--compact">
        <div className="subscriber-header__main">
          <div className="subscriber-header__identity">
            <div className="subscriber-header__avatar">{titular.slice(0, 1).toUpperCase()}</div>
            <div className="subscriber-header__copy">
              <span className="eyebrow">Ficha integral del abonado</span>
              <h1>{titular}</h1>
              <p>
                {abonado.numeroAbonado} - {abonado.domicilio}, {abonado.localidad}
                {abonado.provincia ? `, ${abonado.provincia}` : ""}.
              </p>
            </div>
          </div>
          <div className="subscriber-header__actions">
            <Link className="toolbar-button" href="/abonados">
              Volver
            </Link>
            <Link className="toolbar-button" href={`/cuentas/${abonado.id}`}>
              Cuenta
            </Link>
            <Link className="toolbar-button" href={`/facturacion?q=${abonado.numeroAbonado}`}>
              Facturacion
            </Link>
          </div>
        </div>
        <div className="subscriber-header__badges">
          <StatusPill tone={abonado.estado === "ACTIVO" ? "success" : "warning"}>{abonado.estado}</StatusPill>
          <span className="hero-chip">{abonado.condicionIva}</span>
          <span className="hero-chip">{abonado.esSocio ? "Es socio" : "No socio"}</span>
          <span className="hero-chip">{abonado.servicios.length} servicios</span>
          <span className="hero-chip">{facturasAbiertas.length} facturas abiertas</span>
          <span className="hero-chip">{reclamosAbiertos.length} tickets activos</span>
        </div>
      </article>

      <nav className="workspace-tabs" aria-label="Secciones del abonado">
        {ABONADO_TABS.map((tab) => (
          <Link
            key={tab.id}
            className={tab.id === activeTab ? "workspace-tabs__link is-active" : "workspace-tabs__link"}
            href={tabPath(tab.id)}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className="record-layout">
        <div className="record-main">{panelContent}</div>

        <aside className="record-side">
          <article className="card profile-aside">
            <div className="profile-aside__header">
              <div className="profile-aside__avatar">{titular.slice(0, 1).toUpperCase()}</div>
              <div>
                <h2>{titular}</h2>
                <p>Codigo {abonado.numeroAbonado}</p>
                <StatusPill tone={abonado.estado === "ACTIVO" ? "success" : "warning"}>{abonado.estado}</StatusPill>
              </div>
            </div>

            <div className="profile-aside__group">
              <span className="profile-aside__label">Direccion</span>
              <strong>{abonado.domicilio}</strong>
              <p>
                {abonado.localidad}
                {abonado.provincia ? `, ${abonado.provincia}` : ""}
              </p>
            </div>

            <div className="profile-aside__group">
              <span className="profile-aside__label">Contacto</span>
              <strong>{abonado.telefono ?? "Sin telefono"}</strong>
              <p>{abonado.email ?? "Sin email"}</p>
            </div>

            <div className="profile-aside__group">
              <span className="profile-aside__label">Cuenta</span>
              <strong>{formatCurrency(deudaAbierta)}</strong>
              <p>
                {facturasVencidas.length} vencidas / saldo corriente {formatCurrency(saldoActual)}
              </p>
            </div>

            <div className="profile-aside__nav">
              <Link className="toolbar-button" href={tabPath("gestion")}>
                Gestion
              </Link>
              <Link className="toolbar-button" href={tabPath("servicios")}>
                Servicios
              </Link>
              <Link className="toolbar-button" href={tabPath("finanzas")}>
                Finanzas
              </Link>
              <Link className="toolbar-button" href={tabPath("soporte")}>
                Tickets
              </Link>
            </div>
          </article>
        </aside>
      </section>
    </section>
  );
}
