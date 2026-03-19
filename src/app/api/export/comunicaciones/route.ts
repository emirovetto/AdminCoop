import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getComunicacionesData } from "@/lib/data";
import { buildCsv } from "@/lib/utils";

function getAbonadoDisplayName(abonado: {
  numeroAbonado: string;
  razonSocial?: string | null;
  apellido?: string | null;
  nombre?: string | null;
}) {
  return abonado.razonSocial || [abonado.apellido, abonado.nombre].filter(Boolean).join(" ") || abonado.numeroAbonado;
}

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const { searchParams } = new URL(request.url);
  const { comunicaciones } = await getComunicacionesData({
    q: searchParams.get("q") ?? "",
    abonadoId: searchParams.get("abonadoId") ?? "",
    canal: searchParams.get("canal") ?? "",
    tipo: searchParams.get("tipo") ?? "",
    estado: searchParams.get("estado") ?? "",
    oficinaVirtual: searchParams.get("oficinaVirtual") ?? "",
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  const csv = buildCsv(
    ["Fecha", "Numero abonado", "Titular", "Canal", "Tipo", "Asunto", "Estado", "Oficina virtual", "Operador", "Mensaje"],
    comunicaciones.map((comunicacion) => [
      comunicacion.createdAt.toISOString(),
      comunicacion.abonado.numeroAbonado,
      getAbonadoDisplayName(comunicacion.abonado),
      comunicacion.canal,
      comunicacion.tipo,
      comunicacion.asunto,
      comunicacion.estado,
      comunicacion.visibleOficinaVirtual ? "SI" : "NO",
      comunicacion.usuario.nombre,
      comunicacion.mensaje,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="comunicaciones.csv"',
    },
  });
}
