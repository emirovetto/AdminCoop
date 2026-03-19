import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getAuditoriaData } from "@/lib/data";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN"]);
  const { searchParams } = new URL(request.url);
  const { eventos } = await getAuditoriaData({
    q: searchParams.get("q") ?? "",
    modulo: searchParams.get("modulo") ?? "",
    actorId: searchParams.get("actorId") ?? "",
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  const csv = buildCsv(
    ["Fecha", "Modulo", "Accion", "Entidad", "Entidad ID", "Actor", "Email actor", "Descripcion", "Detalle"],
    eventos.map((evento) => [
      evento.createdAt.toISOString(),
      evento.modulo,
      evento.accion,
      evento.entidadTipo,
      evento.entidadId ?? "",
      evento.actor?.nombre ?? "Sistema",
      evento.actor?.email ?? "",
      evento.descripcion,
      evento.detalleJson ?? "",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="auditoria.csv"',
    },
  });
}
