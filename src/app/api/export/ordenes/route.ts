import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getOrdenesTrabajoData } from "@/lib/data";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const { searchParams } = new URL(request.url);
  const { ordenes } = await getOrdenesTrabajoData({
    q: searchParams.get("q") ?? "",
    estado: searchParams.get("estado") ?? "",
    tipo: searchParams.get("tipo") ?? "",
    tecnicoId: searchParams.get("tecnicoId") ?? "",
    abonadoId: searchParams.get("abonadoId") ?? "",
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  const csv = buildCsv(
    [
      "OT",
      "Tipo",
      "Estado",
      "Fecha solicitud",
      "Fecha programada",
      "Fecha cierre",
      "Abonado",
      "Tecnico",
      "Servicio",
      "Reclamo",
      "Motivo",
      "Detalle",
      "Resolucion",
      "Cargo facturable",
    ],
    ordenes.map((orden) => [
      orden.id,
      orden.tipo,
      orden.estado,
      orden.fechaSolicitud.toISOString(),
      orden.fechaProgramada?.toISOString() ?? "",
      orden.fechaCierre?.toISOString() ?? "",
      orden.abonado.numeroAbonado,
      orden.tecnico?.nombre ?? "",
      orden.servicio?.plan ?? "",
      orden.reclamoId ? `#${orden.reclamoId}` : "",
      orden.motivo,
      orden.detalle ?? "",
      orden.resolucion ?? "",
      orden.cargoFacturable ? "SI" : "NO",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ordenes-trabajo.csv"',
    },
  });
}
