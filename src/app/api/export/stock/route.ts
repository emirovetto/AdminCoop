import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildStockWhere } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "TECNICO"]);
  const { searchParams } = new URL(request.url);

  const materiales = await prisma.material.findMany({
    where: buildStockWhere({
      q: searchParams.get("q") ?? "",
      categoria: searchParams.get("categoria") ?? "",
      bajoStock: searchParams.get("bajoStock") ?? "",
    }),
    orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
  });

  const filtrados =
    searchParams.get("bajoStock") === "SI"
      ? materiales.filter((material) => Number(material.stockActual) <= Number(material.stockMinimo))
      : materiales;

  const csv = buildCsv(
    [
      "Codigo",
      "Material",
      "Categoria",
      "Unidad",
      "Stock Actual",
      "Stock Minimo",
      "Costo Promedio",
      "Precio Facturable",
      "IVA",
      "Facturable",
      "Activo",
    ],
    filtrados.map((material) => [
      material.codigo,
      material.nombre,
      material.categoria,
      material.unidad,
      Number(material.stockActual),
      Number(material.stockMinimo),
      Number(material.costoPromedio),
      Number(material.precioFacturable ?? 0),
      Number(material.ivaAlicuota),
      material.facturable ? "SI" : "NO",
      material.activo ? "SI" : "NO",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stock.csv"',
    },
  });
}
