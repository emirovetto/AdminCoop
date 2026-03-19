"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarProps = {
  role: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
};

const items = [
  { href: "/", label: "Dashboard", short: "CTR", description: "Resumen operativo general", section: "GENERAL" },
  { href: "/alertas", label: "Alertas", short: "ALT", description: "Prioridades diarias y seguimiento cruzado", section: "GENERAL" },
  { href: "/reportes", label: "Reportes", short: "RPT", description: "Indicadores, filtros y exportacion", section: "GENERAL" },
  { href: "/socios", label: "Socios", short: "SOC", description: "Padron y administracion", section: "CLIENTES" },
  {
    href: "/abonados",
    label: "Abonados",
    short: "ABO",
    description: "Servicios, planes y domicilios",
    section: "CLIENTES",
  },
  {
    href: "/ordenes",
    label: "Ordenes",
    short: "OT",
    description: "Instalaciones, cortes y visitas",
    section: "OPERACION",
  },
  {
    href: "/facturacion",
    label: "Facturacion",
    short: "CAJ",
    description: "Cobros, cuenta corriente y emision",
    section: "FINANZAS",
  },
  {
    href: "/cuentas",
    label: "Cuentas",
    short: "CC",
    description: "Extractos, deuda y saldos",
    section: "FINANZAS",
    roles: ["ADMIN", "CAJA"],
  },
  {
    href: "/cobranzas",
    label: "Cobranzas",
    short: "CBR",
    description: "Promesas, acuerdos y seguimiento diario",
    section: "FINANZAS",
    roles: ["ADMIN", "CAJA"],
  },
  {
    href: "/caja",
    label: "Caja",
    short: "RCB",
    description: "Recibos, cierres y arqueo diario",
    section: "FINANZAS",
    roles: ["ADMIN", "CAJA"],
  },
  {
    href: "/pasarelas",
    label: "Pasarelas",
    short: "PAY",
    description: "Cobro online, webhooks y automatizaciones",
    section: "FINANZAS",
    roles: ["ADMIN", "CAJA"],
  },
  {
    href: "/reclamos",
    label: "Reclamos",
    short: "SLA",
    description: "Tickets y atencion tecnica",
    section: "OPERACION",
  },
  {
    href: "/comunicaciones",
    label: "Comunicaciones",
    short: "COM",
    description: "Mensajeria, avisos y oficina virtual",
    section: "OPERACION",
  },
  {
    href: "/portal",
    label: "Portal",
    short: "WEB",
    description: "Publicaciones y contenido del abonado",
    section: "OPERACION",
  },
  {
    href: "/stock",
    label: "Stock",
    short: "INV",
    description: "Materiales, movimientos y consumos",
    section: "OPERACION",
    roles: ["ADMIN", "TECNICO"],
  },
  {
    href: "/compras",
    label: "Compras",
    short: "CMP",
    description: "Ingresos de materiales y costos",
    section: "OPERACION",
    roles: ["ADMIN"],
  },
  {
    href: "/proveedores",
    label: "Proveedores",
    short: "PRV",
    description: "Padron fiscal y abastecimiento",
    section: "OPERACION",
    roles: ["ADMIN"],
  },
  {
    href: "/usuarios",
    label: "Usuarios",
    short: "ADM",
    description: "Accesos y seguridad interna",
    section: "ADMINISTRACION",
    roles: ["ADMIN"],
  },
  {
    href: "/auditoria",
    label: "Auditoria",
    short: "LOG",
    description: "Trazabilidad de acciones sensibles",
    section: "ADMINISTRACION",
    roles: ["ADMIN"],
  },
  {
    href: "/importaciones",
    label: "Importaciones",
    short: "BAT",
    description: "Carga masiva e historial",
    section: "ADMINISTRACION",
    roles: ["ADMIN"],
  },
  {
    href: "/configuracion",
    label: "Configuracion",
    short: "CFG",
    description: "Servicios e impuestos",
    section: "ADMINISTRACION",
    roles: ["ADMIN"],
  },
];

export function Sidebar({ role, collapsed, mobileOpen, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const visibleItems = items.filter((item) => !item.roles || item.roles.includes(role));
  const sections = [
    { key: "GENERAL", label: "General" },
    { key: "CLIENTES", label: "Clientes" },
    { key: "FINANZAS", label: "Finanzas" },
    { key: "OPERACION", label: "Operacion" },
    { key: "ADMINISTRACION", label: "Administracion" },
  ];
  const roleLabel =
    {
      ADMIN: "Administrador",
      CAJA: "Caja",
      TECNICO: "Tecnico",
    }[role] ?? role;

  return (
    <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}${mobileOpen ? " sidebar--mobile-open" : ""}`}>
      <div className="sidebar__main">
        <div className="sidebar__brand">
          <div className="sidebar__brand-row">
            <span className="sidebar__brand-mark">AC</span>
            <div className="sidebar__brand-copy">
              <span className="sidebar__eyebrow">Sistema cooperativo</span>
              <h1>Admin Coop</h1>
              <p>Operacion, cobranza y soporte con una interfaz mas limpia y enfocada en tareas reales.</p>
            </div>
          </div>
        </div>

        <section className="sidebar__status">
          <span className="sidebar__status-label">Sesion activa</span>
          <strong>{roleLabel}</strong>
          <p>Conectado a la base operativa y a los modulos centrales del sistema.</p>
        </section>

        <nav className="sidebar__nav">
          {sections.map((section) => {
            const sectionItems = visibleItems.filter((item) => item.section === section.key);

            if (sectionItems.length === 0) {
              return null;
            }

            return (
              <div className="sidebar__section" key={section.key}>
                <span className="sidebar__section-label">{section.label}</span>
                <div className="sidebar__section-links">
                  {sectionItems.map((item) => {
                    const active = pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar__link${active ? " sidebar__link--active" : ""}`}
                        onClick={onNavigate}
                        title={item.label}
                      >
                        <span className="sidebar__link-indicator" />
                        <span className="sidebar__link-copy">
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                        <span className="sidebar__link-tag">{item.short}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="sidebar__footer">
        <span className="sidebar__footer-label">Estado del sistema</span>
        <strong>Operacion online</strong>
        <p>Panel interno, sesiones protegidas y datos sincronizados con MySQL.</p>
      </div>
    </aside>
  );
}
