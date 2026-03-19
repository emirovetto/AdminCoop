"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type LivePayload = {
  generatedAt: string;
  changedChannels?: string[];
  summary?: {
    pagosPendientes: number;
    reclamosAbiertos: number;
    ordenesPendientes: number;
    promesasVigentes: number;
    webhooksConError: number;
  };
};

function getRelevantChannels(pathname: string) {
  if (pathname === "/" || pathname.startsWith("/alertas") || pathname.startsWith("/reportes")) {
    return ["dashboard", "alertas", "abonados", "facturacion", "cobranzas", "reclamos", "ordenes", "comunicaciones", "portal", "pasarelas"];
  }

  if (pathname.startsWith("/abonados")) {
    return ["abonados", "facturacion", "cobranzas", "reclamos", "ordenes", "comunicaciones", "portal", "alertas"];
  }

  if (pathname.startsWith("/facturacion") || pathname.startsWith("/cuentas") || pathname.startsWith("/caja")) {
    return ["facturacion", "cobranzas", "pasarelas", "alertas"];
  }

  if (pathname.startsWith("/cobranzas")) {
    return ["cobranzas", "facturacion", "abonados", "ordenes", "alertas", "pasarelas"];
  }

  if (pathname.startsWith("/reclamos")) {
    return ["reclamos", "ordenes", "abonados", "alertas"];
  }

  if (pathname.startsWith("/ordenes")) {
    return ["ordenes", "abonados", "reclamos", "cobranzas", "alertas"];
  }

  if (pathname.startsWith("/comunicaciones") || pathname.startsWith("/oficina-virtual") || pathname.startsWith("/portal")) {
    return ["comunicaciones", "portal", "abonados", "alertas"];
  }

  if (pathname.startsWith("/pasarelas")) {
    return ["pasarelas", "facturacion", "cobranzas", "alertas"];
  }

  if (pathname.startsWith("/compras") || pathname.startsWith("/stock") || pathname.startsWith("/proveedores")) {
    return ["compras", "alertas"];
  }

  return ["dashboard", "abonados", "facturacion", "cobranzas", "reclamos", "ordenes", "comunicaciones", "portal", "pasarelas", "compras", "alertas"];
}

export function LiveOperationsStatus() {
  const pathname = usePathname();
  const router = useRouter();
  const lastRefreshAtRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [summary, setSummary] = useState<LivePayload["summary"] | null>(null);

  const relevantChannels = useMemo(() => getRelevantChannels(pathname), [pathname]);

  useEffect(() => {
    const source = new EventSource("/api/live/operacion");

    const handlePayload = (payload: LivePayload, refresh: boolean) => {
      setLastSyncAt(payload.generatedAt);
      setSummary(payload.summary ?? null);

      if (!refresh) {
        return;
      }

      const changedChannels = payload.changedChannels ?? [];
      const shouldRefresh =
        changedChannels.length === 0 ||
        changedChannels.some((channel) => relevantChannels.includes(channel));

      if (!shouldRefresh) {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAtRef.current < 5000) {
        return;
      }

      lastRefreshAtRef.current = now;
      startTransition(() => {
        router.refresh();
      });
    };

    source.onopen = () => {
      setConnected(true);
    };

    source.onerror = () => {
      setConnected(false);
    };

    source.addEventListener("snapshot", (event) => {
      setConnected(true);
      handlePayload(JSON.parse(event.data) as LivePayload, false);
    });

    source.addEventListener("activity", (event) => {
      setConnected(true);
      handlePayload(JSON.parse(event.data) as LivePayload, true);
    });

    return () => {
      source.close();
    };
  }, [relevantChannels, router]);

  const statusLabel = connected ? "Tiempo real activo" : "Reconectando";
  const summaryLabel = summary
    ? `${summary.ordenesPendientes} OT, ${summary.reclamosAbiertos} tickets, ${summary.pagosPendientes} pagos pendientes`
    : "Escucha activa de pagos, tickets y cobranzas";

  return (
    <span
      className={`live-pill${connected ? " live-pill--ok" : " live-pill--offline"}`}
      title={lastSyncAt ? `Ultima sincronizacion ${new Date(lastSyncAt).toLocaleTimeString("es-AR")}` : statusLabel}
    >
      <span className="live-pill__dot" />
      <span className="live-pill__copy">
        <strong>{statusLabel}</strong>
        <small>{summaryLabel}</small>
      </span>
    </span>
  );
}
