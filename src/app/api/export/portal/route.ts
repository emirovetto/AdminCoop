import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getPortalData } from "@/lib/data";

function escapeCsv(value: string | number | boolean | null | undefined) {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const { searchParams } = new URL(request.url);
  const { publicaciones } = await getPortalData({
    q: searchParams.get("q") ?? "",
    abonadoId: searchParams.get("abonadoId") ?? "",
    categoria: searchParams.get("categoria") ?? "",
    estado: searchParams.get("estado") ?? "",
    destacado: searchParams.get("destacado") ?? "",
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  const header = [
    "Fecha",
    "Destino",
    "Categoria",
    "Titulo",
    "Estado",
    "Prioridad",
    "Destacada",
    "Visible desde",
    "Visible hasta",
    "Resumen",
  ];

  const rows = publicaciones.map((publicacion) => [
    publicacion.createdAt.toISOString(),
    publicacion.abonado ? `${publicacion.abonado.numeroAbonado}` : "GENERAL",
    publicacion.categoria,
    publicacion.titulo,
    publicacion.estado,
    publicacion.prioridad,
    publicacion.destacado ? "SI" : "NO",
    publicacion.visibleDesde?.toISOString() ?? "",
    publicacion.visibleHasta?.toISOString() ?? "",
    publicacion.resumen ?? "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="portal.csv"',
    },
  });
}
