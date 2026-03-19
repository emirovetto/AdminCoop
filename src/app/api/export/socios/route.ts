import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getSociosData } from "@/lib/data";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA"]);
  const { searchParams } = new URL(request.url);
  const socios = await getSociosData(searchParams.get("q") ?? "");

  const csv = buildCsv(
    ["Apellido", "Nombre", "DNI", "Email", "Telefono", "Estado", "Fecha alta"],
    socios.map((socio) => [
      socio.apellido,
      socio.nombre,
      socio.dni,
      socio.email ?? "",
      socio.telefono ?? "",
      socio.estado,
      socio.fechaAlta.toISOString(),
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="socios.csv"',
    },
  });
}
