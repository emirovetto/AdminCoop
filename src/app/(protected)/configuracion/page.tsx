import {
  createMaterialAction,
  createServicioCatalogoAction,
  updateMaterialAction,
  updateBillingConfigAction,
  updateServicioCatalogoAction,
} from "@/app/actions";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { DataTable } from "@/components/shared/data-table";
import { buildArcaConnectionPrecheck, buildWsaaLoginTicketRequestPreview, getArcaServiceUrls } from "@/lib/arca";
import { requireRole } from "@/lib/auth";
import { getConfiguracionFacturacionData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = typeof params?.ok === "string" ? params.ok : undefined;
  const error = typeof params?.error === "string" ? params.error : undefined;
  const {
    configuracion,
    servicios,
    materiales,
    ivaConditions,
    arcaEnvironments,
    arcaInvoiceTypes,
    arcaConceptTypes,
    arcaCurrencies,
    arcaWsServices,
  } = await getConfiguracionFacturacionData();
  const arcaUrls = getArcaServiceUrls(configuracion?.ambienteArca);
  const arcaConnectionPrecheck = buildArcaConnectionPrecheck(configuracion);
  const wsaaPreview = buildWsaaLoginTicketRequestPreview(configuracion);

  const rows = servicios.map((servicio) => [
    servicio.codigo,
    servicio.nombre,
    servicio.categoria,
    formatCurrency(Number(servicio.precioBase)),
    `${Number(servicio.alicuotaIva)}%`,
    servicio.periodicidad,
    <StatusPill key={`servicio-${servicio.id}`} tone={servicio.activo ? "success" : "warning"}>
      {servicio.activo ? "ACTIVO" : "INACTIVO"}
    </StatusPill>,
    formatDate(servicio.createdAt.toISOString()),
  ]);

  const materialRows = materiales.map((material) => [
    material.codigo,
    material.nombre,
    material.categoria,
    material.unidad,
    formatCurrency(Number(material.precioFacturable ?? 0)),
    `${Number(material.ivaAlicuota)}%`,
    <StatusPill key={`material-${material.id}`} tone={material.activo ? "success" : "warning"}>
      {material.activo ? "ACTIVO" : "INACTIVO"}
    </StatusPill>,
    formatDate(material.createdAt.toISOString()),
  ]);

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Motor fiscal</span>
            <h1>Configuracion de facturacion y servicios</h1>
            <p>
              Desde aca se define la base emisora y el catalogo global de servicios que luego usa
              el sistema para componer facturas por abonado.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Servicios globales</span>
              <strong>{servicios.length}</strong>
              <p>Catalogo disponible para altas y facturacion.</p>
            </article>
            <article className="metric-card">
              <span>Materiales</span>
              <strong>{materiales.length}</strong>
              <p>Insumos listos para stock, reclamos y cargos futuros.</p>
            </article>
            <article className="metric-card">
              <span>ARCA</span>
              <strong>{configuracion?.arcaHabilitado ? "Activo" : "Preparado"}</strong>
              <p>{configuracion?.ambienteArca ?? "HOMOLOGACION"} / punto de venta {configuracion?.puntoVenta ?? "0001"}.</p>
            </article>
            <article className="metric-card">
              <span>Conexion ARCA</span>
              <strong>{arcaConnectionPrecheck.status}</strong>
              <p>{arcaConnectionPrecheck.issues.length} observaciones de integracion pendientes.</p>
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
              <h2>Datos fiscales del emisor</h2>
              <p>Configuracion base adaptable a requisitos de ARCA y facturacion local.</p>
            </div>
          </div>
          <form action={updateBillingConfigAction} className="form-panel">
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Razon social</span>
                <input
                  defaultValue={configuracion?.razonSocial ?? ""}
                  name="razonSocial"
                  required
                  type="text"
                />
              </label>
              <label className="field">
                <span>CUIT</span>
                <input defaultValue={configuracion?.cuit ?? ""} name="cuit" required type="text" />
              </label>
              <label className="field">
                <span>Condicion IVA emisor</span>
                <select defaultValue={configuracion?.condicionIvaEmisor ?? "RESPONSABLE_INSCRIPTO"} name="condicionIvaEmisor" required>
                  {ivaConditions.map((condition) => (
                    <option key={condition} value={condition}>
                      {condition}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Punto de venta</span>
                <input
                  defaultValue={configuracion?.puntoVenta ?? "0001"}
                  name="puntoVenta"
                  required
                  type="text"
                />
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Provincia</span>
                <input defaultValue={configuracion?.provincia ?? ""} name="provincia" type="text" />
              </label>
              <label className="field">
                <span>Ingresos brutos</span>
                <input
                  defaultValue={configuracion?.ingresosBrutos ?? ""}
                  name="ingresosBrutos"
                  type="text"
                />
              </label>
              <label className="field">
                <span>Inicio de actividad</span>
                <input
                  defaultValue={
                    configuracion?.inicioActividad
                      ? configuracion.inicioActividad.toISOString().slice(0, 10)
                      : ""
                  }
                  name="inicioActividad"
                  type="date"
                />
              </label>
              <label className="field">
                <span>Notas legales</span>
                <input defaultValue={configuracion?.notasLegales ?? ""} name="notasLegales" type="text" />
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Ambiente ARCA</span>
                <select defaultValue={configuracion?.ambienteArca ?? "HOMOLOGACION"} name="ambienteArca" required>
                  {arcaEnvironments.map((environment) => (
                    <option key={environment} value={environment}>
                      {environment}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tipo comp. por defecto</span>
                <select defaultValue={configuracion?.tipoComprobanteDefault ?? "011"} name="tipoComprobanteDefault" required>
                  {arcaInvoiceTypes.map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.code} - {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Concepto por defecto</span>
                <select defaultValue={configuracion?.conceptoArcaDefault ?? "2"} name="conceptoArcaDefault" required>
                  {arcaConceptTypes.map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.code} - {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Moneda por defecto</span>
                <select defaultValue={configuracion?.monedaCodigoDefault ?? "PES"} name="monedaCodigoDefault" required>
                  {arcaCurrencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} - {currency.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Servicio AFIP/ARCA</span>
                <select defaultValue={configuracion?.arcaWsService ?? "wsfe"} name="arcaWsService" required>
                  {arcaWsServices.map((service) => (
                    <option key={service.code} value={service.code}>
                      {service.code} - {service.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>CUIT representada</span>
                <input defaultValue={configuracion?.cuitRepresentadaArca ?? ""} name="cuitRepresentadaArca" type="text" />
              </label>
              <label className="field">
                <span>Alias certificado</span>
                <input defaultValue={configuracion?.aliasCertificadoArca ?? ""} name="aliasCertificadoArca" type="text" />
              </label>
              <label className="field">
                <span>Ruta certificado</span>
                <input defaultValue={configuracion?.certificadoRutaArca ?? ""} name="certificadoRutaArca" type="text" />
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Ruta clave privada</span>
                <input defaultValue={configuracion?.clavePrivadaRutaArca ?? ""} name="clavePrivadaRutaArca" type="text" />
              </label>
              <label className="field">
                <span>ARCA habilitado</span>
                <div className="field__value">
                  <input defaultChecked={configuracion?.arcaHabilitado ?? false} name="arcaHabilitado" type="checkbox" value="SI" />
                </div>
              </label>
              <label className="field">
                <span>Observaciones ARCA</span>
                <input defaultValue={configuracion?.observacionesArca ?? ""} name="observacionesArca" type="text" />
              </label>
              <div className="field field--readOnly">
                <span>Estado actual</span>
                <div className="field__value">
                  {configuracion?.arcaHabilitado
                    ? `Listo para integrar WSAA/WSFEv1 en ${configuracion?.ambienteArca ?? "HOMOLOGACION"}`
                    : "Configurado para uso interno hasta activar integracion"}
                </div>
              </div>
            </div>
            <div className="form-actions">
              <SubmitButton idleLabel="Guardar configuracion" pendingLabel="Guardando..." />
            </div>
          </form>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Nuevo servicio global</h2>
              <p>Define como factura cada servicio para reutilizarlo en todos los abonados.</p>
            </div>
          </div>
          <form action={createServicioCatalogoAction} className="form-panel">
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Codigo</span>
                <input name="codigo" placeholder="AGUA-HOGAR" required type="text" />
              </label>
              <label className="field">
                <span>Nombre</span>
                <input name="nombre" placeholder="Agua Potable Hogar" required type="text" />
              </label>
              <label className="field">
                <span>Categoria</span>
                <select defaultValue="INTERNET" name="categoria" required>
                  <option value="INTERNET">Internet</option>
                  <option value="TV">TV</option>
                  <option value="AGUA_POTABLE">Agua potable</option>
                  <option value="TELEFONIA">Telefonia</option>
                  <option value="IPTV">IPTV</option>
                  <option value="NICHOS">Nichos</option>
                  <option value="OTROS">Otros</option>
                </select>
              </label>
              <label className="field">
                <span>Periodicidad</span>
                <select defaultValue="MENSUAL" name="periodicidad" required>
                  <option value="MENSUAL">Mensual</option>
                  <option value="BIMESTRAL">Bimestral</option>
                  <option value="TRIMESTRAL">Trimestral</option>
                  <option value="UNICO">Unico</option>
                </select>
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Precio base</span>
                <input name="precioBase" placeholder="28500" required type="text" />
              </label>
              <label className="field">
                <span>Alicuota IVA</span>
                <input name="alicuotaIva" placeholder="21" required type="text" />
              </label>
              <label className="field">
                <span>Condicion IVA</span>
                <select defaultValue="GRAVADO" name="condicionIva" required>
                  <option value="GRAVADO">Gravado</option>
                  <option value="EXENTO">Exento</option>
                  <option value="NO_GRAVADO">No gravado</option>
                </select>
              </label>
              <label className="field">
                <span>Descripcion</span>
                <input name="descripcion" placeholder="Detalle opcional" type="text" />
              </label>
            </div>
            <div className="form-actions">
              <SubmitButton idleLabel="Crear servicio" pendingLabel="Creando..." />
            </div>
          </form>
        </article>
      </section>

      <section className="split-grid split-grid--equal">
        <article className="card card--soft">
          <div className="section-heading">
            <div>
              <h2>Preparacion ARCA</h2>
              <p>Checklist para que facturacion cargue certificados y habilite la emision real luego.</p>
            </div>
            <StatusPill
              tone={
                arcaConnectionPrecheck.status === "LISTA"
                  ? "success"
                  : arcaConnectionPrecheck.status === "OBSERVADA"
                    ? "warning"
                    : "neutral"
              }
            >
              {arcaConnectionPrecheck.status}
            </StatusPill>
          </div>
          {arcaConnectionPrecheck.issues.length > 0 ? (
            <ul className="check-list">
              {arcaConnectionPrecheck.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <ul className="check-list">
              <li>Conexion preparada para cargar certificado y autenticar WSAA.</li>
              <li>Servicio WSFEv1 listo para solicitar CAE cuando se habilite el personal.</li>
              <li>Usar la ficha del comprobante para revisar el precheck antes de emitir.</li>
            </ul>
          )}
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Endpoints oficiales</h2>
              <p>URLs que usara la integracion cuando se conecte WSAA y WSFEv1.</p>
            </div>
          </div>
          <div className="field field--readOnly">
            <span>WSAA</span>
            <div className="field__value field__value--multiline">{arcaUrls.wsaa}</div>
          </div>
          <div className="field field--readOnly">
            <span>WSAA WSDL</span>
            <div className="field__value field__value--multiline">{arcaUrls.wsaaWsdl}</div>
          </div>
          <div className="field field--readOnly">
            <span>WSFEv1</span>
            <div className="field__value field__value--multiline">{arcaUrls.wsfev1}</div>
          </div>
          <div className="field field--readOnly">
            <span>WSFEv1 WSDL</span>
            <div className="field__value field__value--multiline">{arcaUrls.wsfev1Wsdl}</div>
          </div>
          <div className="code-panel">
            <pre>{wsaaPreview}</pre>
          </div>
        </article>
      </section>

      <section className="split-grid split-grid--equal">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Nuevo material facturable</h2>
              <p>Catalogo central para stock, soporte tecnico y cargos en proxima factura.</p>
            </div>
          </div>
          <form action={createMaterialAction} className="form-panel">
            <input name="redirectTo" type="hidden" value="/configuracion" />
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Codigo</span>
                <input name="codigo" placeholder="ONT-HUAWEI" required type="text" />
              </label>
              <label className="field">
                <span>Nombre</span>
                <input name="nombre" placeholder="ONU Huawei HG8245" required type="text" />
              </label>
              <label className="field">
                <span>Categoria</span>
                <input name="categoria" placeholder="Red / Instalacion / Cementerio" required type="text" />
              </label>
              <label className="field">
                <span>Unidad</span>
                <input defaultValue="UN" name="unidad" type="text" />
              </label>
            </div>
            <div className="form-grid form-grid--4">
              <label className="field">
                <span>Stock minimo</span>
                <input defaultValue="0" name="stockMinimo" required type="text" />
              </label>
              <label className="field">
                <span>Precio facturable</span>
                <input name="precioFacturable" placeholder="45000" type="text" />
              </label>
              <label className="field">
                <span>Alicuota IVA</span>
                <input defaultValue="21" name="ivaAlicuota" required type="text" />
              </label>
              <label className="field">
                <span>Facturable</span>
                <div className="field__value">
                  <input defaultChecked name="facturable" type="checkbox" value="SI" />
                </div>
              </label>
            </div>
            <label className="field">
              <span>Observaciones</span>
              <textarea name="observaciones" placeholder="Notas internas sobre uso o facturacion" rows={3} />
            </label>
            <div className="form-actions">
              <SubmitButton idleLabel="Crear material" pendingLabel="Creando..." />
            </div>
          </form>
        </article>

        <article className="card card--soft">
          <div className="section-heading">
            <div>
              <h2>Reglas que ya impactan</h2>
              <p>Esta configuracion ya alimenta operaciones reales en el resto del sistema.</p>
            </div>
          </div>
          <ul className="check-list">
            <li>Un abonado puede contratar multiples servicios desde su ficha.</li>
            <li>Cada servicio contratado compone la factura mensual de manera independiente.</li>
            <li>Los materiales usados en reclamos pueden pasar a la proxima factura.</li>
            <li>Stock y compras actualizan costos para soporte y facturacion tecnica.</li>
          </ul>
        </article>
      </section>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Catalogo global de servicios</h2>
            <p>{servicios.length} servicios disponibles para componer facturas y altas.</p>
          </div>
        </div>
        <DataTable
          columns={["Codigo", "Servicio", "Categoria", "Precio base", "IVA", "Periodo", "Estado", "Alta"]}
          rows={rows}
          emptyMessage="Todavia no hay servicios configurados."
        />
      </article>

      {servicios.length > 0 ? (
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Mantenimiento de servicios globales</h2>
              <p>Edita precio, IVA, periodicidad y estado del catalogo sin tocar la base a mano.</p>
            </div>
          </div>
          <div className="task-list">
            {servicios.map((servicio) => (
              <form action={updateServicioCatalogoAction} className="form-panel" key={`edit-servicio-${servicio.id}`}>
                <input name="servicioId" type="hidden" value={servicio.id} />
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Servicio global</span>
                    <h3>{servicio.nombre}</h3>
                    <p>{servicio.codigo}</p>
                  </div>
                  <StatusPill tone={servicio.activo ? "success" : "warning"}>
                    {servicio.activo ? "ACTIVO" : "INACTIVO"}
                  </StatusPill>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Codigo</span>
                    <input defaultValue={servicio.codigo} name="codigo" required type="text" />
                  </label>
                  <label className="field">
                    <span>Nombre</span>
                    <input defaultValue={servicio.nombre} name="nombre" required type="text" />
                  </label>
                  <label className="field">
                    <span>Categoria</span>
                    <select defaultValue={servicio.categoria} name="categoria" required>
                      <option value="INTERNET">Internet</option>
                      <option value="TV">TV</option>
                      <option value="AGUA_POTABLE">Agua potable</option>
                      <option value="TELEFONIA">Telefonia</option>
                      <option value="IPTV">IPTV</option>
                      <option value="NICHOS">Nichos</option>
                      <option value="OTROS">Otros</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Periodicidad</span>
                    <select defaultValue={servicio.periodicidad} name="periodicidad" required>
                      <option value="MENSUAL">Mensual</option>
                      <option value="BIMESTRAL">Bimestral</option>
                      <option value="TRIMESTRAL">Trimestral</option>
                      <option value="UNICO">Unico</option>
                    </select>
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Precio base</span>
                    <input defaultValue={String(Number(servicio.precioBase))} name="precioBase" required type="text" />
                  </label>
                  <label className="field">
                    <span>Alicuota IVA</span>
                    <input defaultValue={String(Number(servicio.alicuotaIva))} name="alicuotaIva" required type="text" />
                  </label>
                  <label className="field">
                    <span>Condicion IVA</span>
                    <select defaultValue={servicio.condicionIva} name="condicionIva" required>
                      <option value="GRAVADO">Gravado</option>
                      <option value="EXENTO">Exento</option>
                      <option value="NO_GRAVADO">No gravado</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Activo</span>
                    <select defaultValue={servicio.activo ? "SI" : "NO"} name="activo">
                      <option value="SI">Si</option>
                      <option value="NO">No</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Descripcion</span>
                  <textarea defaultValue={servicio.descripcion ?? ""} name="descripcion" rows={3} />
                </label>
                <div className="form-actions">
                  <SubmitButton idleLabel="Guardar servicio" pendingLabel="Guardando..." />
                </div>
              </form>
            ))}
          </div>
        </article>
      ) : null}

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Catalogo de materiales</h2>
            <p>{materiales.length} materiales disponibles para compras, stock y reclamos.</p>
          </div>
        </div>
        <DataTable
          columns={["Codigo", "Material", "Categoria", "Unidad", "Precio", "IVA", "Estado", "Alta"]}
          rows={materialRows}
          emptyMessage="Todavia no hay materiales configurados."
        />
      </article>

      {materiales.length > 0 ? (
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Mantenimiento de materiales</h2>
              <p>Control de categoria, unidad, IVA, precio y disponibilidad del catalogo tecnico.</p>
            </div>
          </div>
          <div className="task-list">
            {materiales.map((material) => (
              <form action={updateMaterialAction} className="form-panel" key={`edit-material-${material.id}`}>
                <input name="materialId" type="hidden" value={material.id} />
                <input name="redirectTo" type="hidden" value="/configuracion" />
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Material</span>
                    <h3>{material.nombre}</h3>
                    <p>{material.codigo}</p>
                  </div>
                  <StatusPill tone={material.activo ? "success" : "warning"}>
                    {material.activo ? "ACTIVO" : "INACTIVO"}
                  </StatusPill>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Codigo</span>
                    <input defaultValue={material.codigo} name="codigo" required type="text" />
                  </label>
                  <label className="field">
                    <span>Nombre</span>
                    <input defaultValue={material.nombre} name="nombre" required type="text" />
                  </label>
                  <label className="field">
                    <span>Categoria</span>
                    <input defaultValue={material.categoria} name="categoria" required type="text" />
                  </label>
                  <label className="field">
                    <span>Unidad</span>
                    <input defaultValue={material.unidad} name="unidad" type="text" />
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Stock minimo</span>
                    <input defaultValue={String(Number(material.stockMinimo))} name="stockMinimo" required type="text" />
                  </label>
                  <label className="field">
                    <span>Precio facturable</span>
                    <input defaultValue={material.precioFacturable ? String(Number(material.precioFacturable)) : ""} name="precioFacturable" type="text" />
                  </label>
                  <label className="field">
                    <span>Alicuota IVA</span>
                    <input defaultValue={String(Number(material.ivaAlicuota))} name="ivaAlicuota" required type="text" />
                  </label>
                  <label className="field">
                    <span>Facturable</span>
                    <select defaultValue={material.facturable ? "SI" : "NO"} name="facturable">
                      <option value="SI">Si</option>
                      <option value="NO">No</option>
                    </select>
                  </label>
                </div>
                <div className="form-grid form-grid--4">
                  <label className="field">
                    <span>Activo</span>
                    <select defaultValue={material.activo ? "SI" : "NO"} name="activo">
                      <option value="SI">Si</option>
                      <option value="NO">No</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Observaciones</span>
                    <textarea defaultValue={material.observaciones ?? ""} name="observaciones" rows={3} />
                  </label>
                  <div className="form-actions">
                    <SubmitButton idleLabel="Guardar material" pendingLabel="Guardando..." />
                  </div>
                </div>
              </form>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
