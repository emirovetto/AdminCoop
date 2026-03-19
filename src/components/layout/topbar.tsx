"use client";

import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { LiveOperationsStatus } from "@/components/live/live-operations-status";
import { SubmitButton } from "@/components/shared/submit-button";

type TopbarProps = {
  user: {
    nombre: string;
    rol: string;
  };
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

const routeMeta = [
  {
    match: /^\/$/,
    eyebrow: "Centro operativo",
    title: "Tablero ejecutivo de la cooperativa",
    subtitle: "Una vista clara para controlar operacion, recaudacion, soporte y alertas en un solo entorno.",
  },
  {
    match: /^\/abonados\/\d+$/,
    eyebrow: "Ficha del abonado",
    title: "Workspace comercial, tecnico y financiero",
    subtitle: "Gestion integral del abonado con servicios, deuda, soporte, ordenes y comunicaciones en una sola consola.",
  },
  {
    match: /^\/abonados/,
    eyebrow: "Clientes y contratos",
    title: "Abonados, domicilios y servicios",
    subtitle: "Administra la relacion comercial completa, los contratos activos y el historial de cada abonado.",
  },
  {
    match: /^\/facturacion/,
    eyebrow: "Motor fiscal",
    title: "Facturacion, comprobantes y cuenta corriente",
    subtitle: "Emision, seguimiento de deuda, pagos y salida fiscal preparados para operar sin friccion.",
  },
  {
    match: /^\/reclamos/,
    eyebrow: "Operacion tecnica",
    title: "Reclamos, tickets y cierres de campo",
    subtitle: "Seguimiento tecnico con materiales, diagnosticos y trazabilidad por abonado.",
  },
  {
    match: /^\/ordenes/,
    eyebrow: "Agenda de campo",
    title: "Ordenes de trabajo e instalaciones",
    subtitle: "Coordina visitas, cortes, reconexiones y mantenimiento desde una vista pensada para operar.",
  },
  {
    match: /^\/cobranzas/,
    eyebrow: "Recupero comercial",
    title: "Seguimiento diario de cobranzas",
    subtitle: "Promesas, acuerdos y cuotas vencidas con acciones rapidas listas para gestionar.",
  },
  {
    match: /^\/pasarelas/,
    eyebrow: "Cobro digital",
    title: "Pasarelas, pagos online y automatizaciones",
    subtitle: "Gestiona gateways, conciliacion externa y reglas que gobiernan corte y reconexion.",
  },
  {
    match: /^\/comunicaciones/,
    eyebrow: "Mensajeria operativa",
    title: "Comunicaciones, avisos y oficina virtual",
    subtitle: "Registra mensajes por abonado y deja lista la salida a email, WhatsApp y portal cliente.",
  },
  {
    match: /^\/portal/,
    eyebrow: "Portal cliente",
    title: "Publicaciones y contenido de oficina virtual",
    subtitle: "Gestiona avisos generales y segmentados para que el abonado vea informacion util dentro de su portal.",
  },
  {
    match: /^\/oficina-virtual\/\d+$/,
    eyebrow: "Portal cliente",
    title: "Preview de oficina virtual",
    subtitle: "Revision interna de la experiencia que vera el abonado en su oficina virtual.",
  },
  {
    match: /^\/alertas/,
    eyebrow: "Prioridades del dia",
    title: "Alertas operativas y control cruzado",
    subtitle: "Consolida lo urgente de cobranzas, stock, ordenes, reclamos y ARCA en una sola bandeja.",
  },
];

export function Topbar({ user, sidebarCollapsed, onToggleSidebar }: TopbarProps) {
  const pathname = usePathname();
  const today = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const meta = routeMeta.find((item) => item.match.test(pathname)) ?? routeMeta[0];

  return (
    <header className="topbar">
      <div className="topbar__lead">
        <button
          aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Ocultar menu lateral"}
          className="shell-toggle"
          onClick={onToggleSidebar}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar__copy">
          <span className="topbar__eyebrow">{meta.eyebrow}</span>
          <h2>{meta.title}</h2>
          <p className="topbar__subtitle">{meta.subtitle}</p>
          <form action="/abonados" className="topbar-search" method="get">
            <input
              aria-label="Buscar abonado"
              name="q"
              placeholder="Buscar abonado por numero, nombre, documento, telefono o email"
              type="search"
            />
            <button type="submit">Buscar abonado</button>
          </form>
        </div>
      </div>
      <div className="topbar__meta">
        <div className="topbar__meta-group">
          <span className="topbar__meta-note">{today}</span>
          <span className="pill pill--soft">
            {user.nombre} / {user.rol}
          </span>
        </div>
        <div className="topbar__meta-group">
          <LiveOperationsStatus />
          <span className="pill">Base remota activa</span>
          <form action={logoutAction}>
            <SubmitButton
              idleLabel="Cerrar sesion"
              pendingLabel="Saliendo..."
              className="secondary-button"
            />
          </form>
        </div>
      </div>
    </header>
  );
}
