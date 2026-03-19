import type { ReactNode } from "react";
import { AppShellFrame } from "@/components/layout/app-shell-frame";
import { requireUser } from "@/lib/auth";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const user = await requireUser();

  return <AppShellFrame user={user}>{children}</AppShellFrame>;
}
