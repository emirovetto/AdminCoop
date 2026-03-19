import Link from "next/link";
import { createAbonadoAction, toggleAbonadoStatusAction } from "@/app/actions";
import { DataTable } from "@/components/shared/data-table";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { SubmitButton } from "@/components/shared/submit-button";
import { requireRole } from "@/lib/auth";
import { getAbonadosData, getAbonadosFormData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function AbonadosPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "CAJA"]);
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");
  const filters = {
    q: getQueryValue(params, "q"),
    estado: getQueryValue(params, "estado"),
    localidad: getQueryValue(params, "localidad"),
    provincia: getQueryValue(params, "provincia"),
    condicionIva: getQueryValue(params, "condicionIva"),
    telefono: getQueryValue(params, "telefono"),
    email: getQueryValue(params, "email"),
    documento: getQueryValue(params, "documento"),
    servicio: getQueryValue(params, "servicio"),
    servicioCatalogoId: getQueryValue(params, "servicioCatalogoId"),
    estadoServicio: getQueryValue(params, "estadoServicio"),
    esSocio: getQueryValue(params, "esSocio"),
    deuda: getQueryValue(params, "deuda"),
    reclamos: getQueryValue(params, "reclamos"),
    ordenes: getQueryValue(params, "ordenes"),
  };
  const [abonados, formData] = await Promise.all([getAbonadosData(filters), getAbonadosFormData()]);
  const activos = abonados.filter((abonado) => abonado.estado === "ACTIVO").length;
  const serviciosActivos = abonados.reduce((sum, abonado) => sum + abonado.servicios.length, 0);
  const conDeuda = abonados.filter((abonado) => abonado.facturas.length > 0).length;
  const ingresoMensual = abonados.reduce(
    (sum, abonado) =>
      sum +
      abonado.servicios.reduce(
        (sub, servicio) =>
          sub +
          Number(servicio.precio) * Number(servicio.cantidad) +
          (Number(servicio.servicioCatalogo?.alicuotaIva ?? 0) * Number(servicio.precio)) / 100,
        0,
      ),
    0,
  );

  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const rows = abonados.map((abonado) => {
    const serviciosAbonado = abonado.servicios;
    const titular =
      abonado.razonSocial ||
      [abonado.apellido, abonado.nombre].filter(Boolean).join(", ") ||
      abonado.numeroAbonado;
    const deudaAbierta = abonado.facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
    const facturasAbiertas = abonado.facturas.length;

    return [
      <Link href={`/abonados/${abonado.id}`} key={`perfil-${abonado.id}`}>
        {abonado.numeroAbonado}
      </Link>,
      titular,
      abonado.documento ?? abonado.cuit ?? "-",
      abonado.telefono ?? abonado.email ?? "-",
      abonado.localidad,
      abonado.condicionIva,
      serviciosAbonado.map((servicio) => servicio.plan).join(" / ") || "Sin servicios",
      formatCurrency(
        serviciosAbonado.reduce((sum, servicio) => {
          const base = Number(servicio.precio) * Number(servicio.cantidad);
          const iva = (base * Number(servicio.servicioCatalogo?.alicuotaIva ?? 0)) / 100;
          return sum + base + iva;
        }, 0),
      ),
      formatCurrency(deudaAbierta),
      facturasAbiertas,
      `${abonado.reclamos.length} abiertos`,
      formatDate(abonado.fechaAlta.toISOString()),
      <StatusPill
        key={`estado-${abonado.id}`}
        tone={abonado.estado === "ACTIVO" ? "success" : "warning"}
      >
        {abonado.estado}
      </StatusPill>,
      <div className="list-inline" key={`acciones-${abonado.id}`}>
        <Link className="toolbar-button" href={`/abonados/${abonado.id}`}>
          Ver ficha
        </Link>
        <form action={toggleAbonadoStatusAction}>
          <input name="abonadoId" type="hidden" value={abonado.id} />
          <button className="table-action table-action--neutral" type="submit">
            {abonado.estado === "ACTIVO" ? "Suspender" : "Reactivar"}
          </button>
        </form>
      </div>,
    ];
  });

  return (
    <section className="page-stack">
      <article className="card section-intro">
        <div className="section-intro__layout">
          <div className="section-intro__copy">
            <span className="eyebrow">Operacion comercial</span>
            <h1>Abonados y servicios</h1>
            <p>
              El abonado pasa a ser la entidad principal del sistema, con ficha completa, socio
              opcional, multiples servicios y trazabilidad tecnica.
            </p>
          </div>
          <div className="section-intro__stats">
            <article className="metric-card">
              <span>Abonados activos</span>
              <strong>{activos}</strong>
              <p>Servicios habilitados para el ciclo actual.</p>
            </article>
            <article className="metric-card">
              <span>Ingreso mensual estimado</span>
              <strong>{formatCurrency(ingresoMensual)}</strong>
              <p>{serviciosActivos} servicios visibles en el filtro actual.</p>
            </article>
            <article className="metric-card">
              <span>Con deuda</span>
              <strong>{conDeuda}</strong>
              <p>Abonados con pendiente o vencido dentro del filtro aplicado.</p>
            </article>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <h2>Base de abonados</h2>
            <p>{abonados.length} abonados visibles y {serviciosActivos} servicios registrados.</p>
          </div>
        </div>
        <FeedbackBanner message={ok} tone="success" />
        <FeedbackBanner message={error} tone="error" />
        <form className="toolbar">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Busqueda general</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="Numero, titular, CUIT, documento, domicilio"
                type="search"
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select defaultValue={filters.estado} name="estado">
                <option value="">Todos</option>
                <option value="ACTIVO">Activo</option>
                <option value="SUSPENDIDO">Suspendido</option>
              </select>
            </label>
            <label className="field">
              <span>Condicion IVA</span>
              <select defaultValue={filters.condicionIva} name="condicionIva">
                <option value="">Todas</option>
                {formData.ivaConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Es socio</span>
              <select defaultValue={filters.esSocio} name="esSocio">
                <option value="">Todos</option>
                <option value="SI">Si</option>
                <option value="NO">No</option>
              </select>
            </label>
            <label className="field">
              <span>Deuda</span>
              <select defaultValue={filters.deuda} name="deuda">
                <option value="">Todas</option>
                <option value="CON_DEUDA">Con deuda</option>
                <option value="CON_VENCIDA">Con vencida</option>
                <option value="AL_DIA">Al dia</option>
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Documento / CUIT</span>
              <input defaultValue={filters.documento} name="documento" placeholder="DNI o CUIT" type="text" />
            </label>
            <label className="field">
              <span>Telefono</span>
              <input defaultValue={filters.telefono} name="telefono" placeholder="Celular o fijo" type="text" />
            </label>
            <label className="field">
              <span>Email</span>
              <input defaultValue={filters.email} name="email" placeholder="correo@cliente.com" type="text" />
            </label>
            <label className="field">
              <span>Localidad</span>
              <input defaultValue={filters.localidad} name="localidad" type="text" />
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Provincia</span>
              <input defaultValue={filters.provincia} name="provincia" type="text" />
            </label>
            <label className="field">
              <span>Servicio</span>
              <input
                defaultValue={filters.servicio}
                name="servicio"
                placeholder="Internet, TV, Agua o plan"
                type="text"
              />
            </label>
            <label className="field">
              <span>Servicio global</span>
              <select defaultValue={filters.servicioCatalogoId} name="servicioCatalogoId">
                <option value="">Todos</option>
                {formData.catalogoServicios.map((servicio) => (
                  <option key={servicio.id} value={servicio.id}>
                    {servicio.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estado servicio</span>
              <select defaultValue={filters.estadoServicio} name="estadoServicio">
                <option value="">Todos</option>
                <option value="PENDIENTE_INSTALACION">Pendiente instalacion</option>
                <option value="ACTIVO">Activo</option>
                <option value="SUSPENDIDO">Suspendido</option>
                <option value="BAJA">Baja</option>
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Reclamos</span>
              <select defaultValue={filters.reclamos} name="reclamos">
                <option value="">Todos</option>
                <option value="ABIERTOS">Con abiertos</option>
                <option value="SIN_RECLAMOS">Sin reclamos</option>
              </select>
            </label>
            <label className="field">
              <span>Ordenes</span>
              <select defaultValue={filters.ordenes} name="ordenes">
                <option value="">Todas</option>
                <option value="ABIERTAS">Con abiertas</option>
                <option value="SIN_ABIERTAS">Sin abiertas</option>
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--1">
            <div className="toolbar__actions">
              <button className="toolbar-button" type="submit">
                Filtrar
              </button>
              <Link className="toolbar-button" href="/abonados">
                Limpiar
              </Link>
              <a className="toolbar-button" href={`/api/export/abonados?${exportParams.toString()}`}>
                Exportar CSV
              </a>
            </div>
          </div>
        </form>
        <form action={createAbonadoAction} className="form-panel">
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Numero abonado</span>
              <input name="numeroAbonado" placeholder="AB-1004" required type="text" />
            </label>
            <label className="field">
              <span>Nombre</span>
              <input name="nombre" placeholder="Juan" type="text" />
            </label>
            <label className="field">
              <span>Apellido</span>
              <input name="apellido" placeholder="Perez" type="text" />
            </label>
            <label className="field">
              <span>Razon social</span>
              <input name="razonSocial" placeholder="Empresa SA" type="text" />
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Documento</span>
              <input name="documento" placeholder="28111222" type="text" />
            </label>
            <label className="field">
              <span>Tipo documento</span>
              <select defaultValue="DNI" name="tipoDocumento">
                <option value="DNI">DNI</option>
                <option value="CUIT">CUIT</option>
                <option value="PASAPORTE">Pasaporte</option>
              </select>
            </label>
            <label className="field">
              <span>CUIT</span>
              <input name="cuit" placeholder="20-12345678-9" type="text" />
            </label>
            <label className="field">
              <span>Condicion IVA</span>
              <select defaultValue="CONSUMIDOR_FINAL" name="condicionIva" required>
                {formData.ivaConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Telefono</span>
              <input name="telefono" placeholder="3704-555101" type="text" />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" placeholder="cliente@correo.com" type="email" />
            </label>
            <label className="field">
              <span>Condicion fiscal</span>
              <input name="condicionFiscal" placeholder="Exento / Publico / Privado" type="text" />
            </label>
            <label className="field">
              <span>Es socio</span>
              <div className="field__value">
                <input name="esSocio" type="checkbox" value="SI" />
              </div>
            </label>
          </div>
          <div className="form-grid form-grid--4">
            <label className="field">
              <span>Socio asociado</span>
              <select defaultValue="" name="socioId">
                <option value="">Sin asociar</option>
                {formData.socios.map((socio) => (
                  <option key={socio.id} value={socio.id}>
                    {socio.apellido}, {socio.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Domicilio</span>
              <input name="domicilio" placeholder="Belgrano 145" required type="text" />
            </label>
            <label className="field">
              <span>Localidad</span>
              <input name="localidad" placeholder="Formosa" required type="text" />
            </label>
            <label className="field">
              <span>Provincia</span>
              <input name="provincia" placeholder="Formosa" type="text" />
            </label>
          </div>
          <div className="form-grid form-grid--3">
            <label className="field">
              <span>Codigo postal</span>
              <input name="codigoPostal" placeholder="3600" type="text" />
            </label>
            <label className="field">
              <span>Servicios iniciales</span>
              <select multiple name="servicioCatalogoIds" size={4}>
                {formData.catalogoServicios.map((servicio) => (
                  <option key={servicio.id} value={servicio.id}>
                    {servicio.categoria} - {servicio.nombre} ({formatCurrency(Number(servicio.precioBase))})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Observaciones</span>
              <textarea name="observaciones" placeholder="Notas comerciales o tecnicas" rows={4} />
            </label>
          </div>
          <div className="form-actions">
            <SubmitButton idleLabel="Crear abonado" pendingLabel="Creando abonado..." />
          </div>
        </form>
        <DataTable
          columns={[
            "Numero",
            "Titular",
            "Documento/CUIT",
            "Contacto",
            "Localidad",
            "IVA",
            "Servicios",
            "Importe",
            "Deuda",
            "Facturas abiertas",
            "Reclamos",
            "Alta",
            "Estado",
            "Acciones",
          ]}
          rows={rows}
          emptyMessage="No hay abonados que coincidan con la busqueda actual."
        />
      </article>
    </section>
  );
}
