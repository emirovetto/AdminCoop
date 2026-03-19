import type { ReactNode } from "react";

type StatusPillProps = {
  children: ReactNode;
  tone?: "default" | "neutral" | "success" | "warning" | "danger" | "info";
};

export function StatusPill({ children, tone = "default" }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}
