import { ModuleCard } from "@/components/dashboard/module-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { StatusPill } from "@/components/shared/status-pill";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = searchParams ? await searchParams : undefined;
  const error = typeof params?.error === "string" ? params.error : undefined;
  const data = await getDashboardData();
  const operationalBoards = [
    {
      title: "Finanzas y recupero",
      eyebrow: "Circuito comercial",
      items: [
        {
          label: "Pendiente de cobro",
          value: formatCurrency(data.facturacionPendiente),
          detail: "Deuda abierta entre facturas pendientes y vencidas.",
        },
        {
          label: "Cobranza consolidada",
          value: formatCurrency(data.cobranzaDelMes),
          detail: "Ingresos acreditados dentro del periodo actual.",
        },
        {
          label: "Promesas vencidas",
          value: String(data.promesasVencidas),
          detail: "Seguimientos que requieren accion inmediata.",
        },
      ],
    },
    {
      title: "Operacion tecnica",
      eyebrow: "Campo y soporte",
      items: [
        {
          label: "Reclamos abiertos",
          value: String(data.reclamosAbiertos),
          detail: "Tickets aun pendientes de cierre tecnico.",
        },
        {
          label: "Servicios activos",
          value: String(data.serviciosActivos),
          detail: "Contratos habilitados para soporte y facturacion.",
        },
        {
          label: "Materiales activos",
          value: String(data.materialesActivos),
          detail: "Catalogo utilizable en stock, reclamos y compras.",
        },
      ],
    },
    {
      title: "Control y seguimiento",
      eyebrow: "Capa administrativa",
      items: [
        {
          label: "Facturas del mes",
          value: String(data.facturasDelMes),
          detail: "Comprobantes emitidos en el ciclo actual.",
        },
        {
          label: "Facturas vencidas",
          value: String(data.facturasVencidas),
          detail: "Comprobantes con mora que impactan en caja.",
        },
        {
          label: "Gestiones proximas",
          value: String(data.proximasGestiones),
          detail: "Contactos comerciales programados para seguimiento.",
        },
      ],
    },
  ];

  return (
    <section className="page-grid">
      <FeedbackBanner message={error} tone="error" />

      <section className="hero card hero--dashboard">
        <div className="hero__main">
          <span className="eyebrow">Centro de control</span>
          <h1>Operacion diaria clara, moderna y preparada para escala real.</h1>
          <p>
            El sistema concentra la gestion comercial, tecnica y administrativa en una sola
            interfaz conectada a tu base MySQL y organizada para decisiones rapidas.
          </p>
          <div className="hero__chips">
            <span className="hero-chip">Ciclo actual: {data.cicloActual}</span>
            <span className="hero-chip">Facturas del mes: {data.facturasDelMes}</span>
            <span className="hero-chip">Importaciones: {data.importacionesRecientes}</span>
            <span className="hero-chip">Promesas vencidas: {data.promesasVencidas}</span>
            <StatusPill tone="success">Base online</StatusPill>
          </div>
        </div>

        <div className="hero__panel">
          <div className="hero-panel__card">
            <span className="hero-panel__label">Cobranza consolidada</span>
            <strong>{formatCurrency(data.cobranzaDelMes)}</strong>
            <p>Ingresos acreditados en cuenta corriente durante el periodo visible.</p>
          </div>
          <div className="hero-panel__grid">
            <div>
              <span>Facturas vencidas</span>
              <strong>{data.facturasVencidas}</strong>
            </div>
            <div>
              <span>Reclamos abiertos</span>
              <strong>{data.reclamosAbiertos}</strong>
            </div>
          </div>
          <div className="hero-panel__grid">
            <div>
              <span>Socios activos</span>
              <strong>{data.sociosActivos}</strong>
            </div>
            <div>
              <span>Abonados activos</span>
              <strong>{data.abonadosActivos}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard
          label="Socios activos"
          value={String(data.sociosActivos)}
          detail="Padron vigente para la atencion cotidiana."
        />
        <StatCard
          label="Abonados activos"
          value={String(data.abonadosActivos)}
          detail="Clientes con servicio actualmente habilitado."
          tone="accent"
        />
        <StatCard
          label="Pendiente de cobro"
          value={formatCurrency(data.facturacionPendiente)}
          detail="Monto acumulado entre facturas pendientes y vencidas."
          tone="warning"
        />
        <StatCard
          label="Servicios activos"
          value={String(data.serviciosActivos)}
          detail="Planes operativos listos para facturacion y soporte."
        />
        <StatCard
          label="Materiales activos"
          value={String(data.materialesActivos)}
          detail="Catalogo listo para stock, reclamos y cargos tecnicos."
          tone="accent"
        />
        {["ADMIN", "CAJA"].includes(user.rol) ? (
          <StatCard
            label="Promesas vencidas"
            value={String(data.promesasVencidas)}
            detail="Compromisos de pago que requieren seguimiento inmediato."
            tone="warning"
          />
        ) : null}
        {["ADMIN", "CAJA"].includes(user.rol) ? (
          <StatCard
            label="Cuotas vencidas"
            value={String(data.cuotasAcuerdoVencidas)}
            detail="Cuotas en mora dentro de acuerdos de pago vigentes."
            tone="warning"
          />
        ) : null}
        {["ADMIN", "CAJA"].includes(user.rol) ? (
          <StatCard
            label="Gestiones proximas"
            value={String(data.proximasGestiones)}
            detail="Contactos comerciales programados dentro del periodo actual."
            tone="accent"
          />
        ) : null}
      </section>

      <section className="board-grid">
        {operationalBoards.map((board) => (
          <article className="card board-panel" key={board.title}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{board.eyebrow}</span>
                <h2>{board.title}</h2>
              </div>
            </div>
            <div className="console-list">
              {board.items.map((item) => (
                <div className="console-list__item" key={item.label}>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="modules-grid">
        <ModuleCard
          title="Socios"
          description="Padron central con estado, contacto y trazabilidad para administracion diaria."
          href="/socios"
          footer="Altas y mantenimiento"
          badge="Padron"
        />
        <ModuleCard
          title="Abonados"
          description="Relacion socio-servicio por domicilio, localidad, plan y estado operativo."
          href="/abonados"
          footer="Servicios y planes"
          badge="Servicios"
        />
        <ModuleCard
          title="Facturacion"
          description="Pagos, cuenta corriente y emision mensual por lote desde una sola vista."
          href="/facturacion"
          footer="Caja y cobranzas"
          badge="Finanzas"
        />
        {["ADMIN", "CAJA"].includes(user.rol) ? (
          <ModuleCard
            title="Cobranzas"
            description="Bandeja diaria con promesas vencidas, acuerdos y proximas acciones."
            href="/cobranzas"
            footer="Seguimiento comercial"
            badge="Recupero"
          />
        ) : null}
        {["ADMIN", "CAJA"].includes(user.rol) ? (
          <ModuleCard
            title="Caja"
            description="Recibos, anulaciones controladas, cierres diarios y arqueo operativo."
            href="/caja"
            footer="Tesoreria diaria"
            badge="Caja"
          />
        ) : null}
        <ModuleCard
          title="Reclamos"
          description="Mesa tecnica con prioridades, asignaciones y estados listos para seguimiento."
          href="/reclamos"
          footer="Soporte tecnico"
          badge="SLA"
        />
        <ModuleCard
          title="Alertas"
          description="Bandeja unificada con urgencias de cobranzas, stock, ordenes, reclamos y ARCA."
          href="/alertas"
          footer="Seguimiento operativo"
          badge="Prioridad"
        />
        <ModuleCard
          title="Stock"
          description="Materiales, consumos en reclamos y control de inventario con alertas de minimo."
          href="/stock"
          footer="Inventario tecnico"
          badge="Insumos"
        />
        <ModuleCard
          title="Reportes"
          description="Cruce de facturacion, reclamos, stock y compras con filtros para control operativo."
          href="/reportes"
          footer="Control y analisis"
          badge="BI"
        />
        {user.rol === "ADMIN" ? (
          <ModuleCard
            title="Compras"
            description="Ingreso de materiales, proveedor, comprobante y costo vinculado a stock."
            href="/compras"
            footer="Abastecimiento"
            badge="Compras"
          />
        ) : null}
        {user.rol === "ADMIN" ? (
          <ModuleCard
            title="Usuarios"
            description="Control de accesos internos, perfiles y restablecimiento de contrasenas."
            href="/usuarios"
            footer="Seguridad interna"
            badge="Admin"
          />
        ) : null}
        {user.rol === "ADMIN" ? (
          <ModuleCard
            title="Importaciones"
            description="Entrada masiva desde plantilla ODS con historial de corridas y omisiones."
            href="/importaciones"
            footer="Carga inicial"
            badge="Batch"
          />
        ) : null}
        {user.rol === "ADMIN" ? (
          <ModuleCard
            title="Configuracion"
            description="Catalogo global de servicios, condicion IVA y base emisora para facturacion."
            href="/configuracion"
            footer="Motor fiscal"
            badge="ARCA"
          />
        ) : null}
      </section>

      <section className="split-grid">
        <article className="card card--soft">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Foco inmediato</span>
              <h2>Siguientes cierres de producto</h2>
            </div>
          </div>
          <div className="task-list">
            {data.tasks.map((task) => (
              <div key={task.title} className="task-item">
                <span className={`task-item__tag task-item__tag--${task.kind}`}>{task.kind}</span>
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card card--dark">
          <div className="section-heading section-heading--light">
            <div>
              <span className="eyebrow">Cobertura</span>
              <h2>Mapa funcional activo</h2>
              <p>Base operativa lista para seguir acercandose a un sistema ISP integral.</p>
            </div>
          </div>
          <ul className="check-list check-list--light">
            <li>Abonados, socios y contratos multi-servicio.</li>
            <li>Cobranzas, acuerdos, caja y recibos.</li>
            <li>Tickets, ordenes de trabajo y materiales.</li>
            <li>Stock, compras y proveedores integrados.</li>
            <li>Facturacion, ajustes y preparacion ARCA.</li>
            <li>Reportes, alertas, auditoria y usuarios.</li>
            <li>Importaciones y seguimiento sobre MySQL real.</li>
          </ul>
        </article>
      </section>
    </section>
  );
}
