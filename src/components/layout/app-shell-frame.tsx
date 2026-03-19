"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

type AppShellFrameProps = {
  user: {
    nombre: string;
    rol: string;
  };
  children: ReactNode;
};

const STORAGE_KEY = "admincoop.sidebar.collapsed";

export function AppShellFrame({ user, children }: AppShellFrameProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "true" || saved === "false") {
        setSidebarCollapsed(saved === "true");
      }
    } catch {
      // Ignore storage issues and keep sensible defaults.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // Ignore storage issues.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1080px)");
    const syncLayout = () => {
      if (!mediaQuery.matches) {
        setMobileOpen(false);
      }
    };

    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  const handleToggleSidebar = () => {
    if (window.innerWidth <= 1080) {
      setMobileOpen((value) => !value);
      return;
    }

    setSidebarCollapsed((value) => !value);
  };

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " app-shell--collapsed" : ""}${
        mobileOpen ? " app-shell--mobile-open" : ""
      }`}
    >
      <button
        aria-hidden={!mobileOpen}
        className="app-shell__backdrop"
        onClick={() => setMobileOpen(false)}
        tabIndex={mobileOpen ? 0 : -1}
        type="button"
      />
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
        role={user.rol}
      />
      <main className="main-panel">
        <Topbar
          onToggleSidebar={handleToggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          user={user}
        />
        {children}
      </main>
    </div>
  );
}
