import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";

export async function GET() {
  await requireUser();
  const data = await getDashboardData();
  return NextResponse.json({
    metrics: {
      sociosActivos: data.sociosActivos,
      abonadosActivos: data.abonadosActivos,
      serviciosActivos: data.serviciosActivos,
      reclamosAbiertos: data.reclamosAbiertos,
      facturacionPendiente: data.facturacionPendiente,
      cobranzaDelMes: data.cobranzaDelMes,
    },
    tasks: data.tasks,
  });
}
