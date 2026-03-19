import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildComprasWhere } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN"]);
  const { searchParams } = new URL(request.url);

  const compras = await prisma.compra.findMany({
    where: buildComprasWhere({
      q: searchParams.get("q") ?? "",
      proveedor: searchParams.get("proveedor") ?? "",
      proveedorId: searchParams.get("proveedorId") ?? "",
      materialId: searchParams.get("materialId") ?? "",
      estado: searchParams.get("estado") ?? "",
      desde: searchParams.get("desde") ?? "",
      hasta: searchParams.get("hasta") ?? "",
    }),
    include: {
      proveedorRef: true,
      detalles: {
        include: {
          material: true,
        },
      },
    },
    orderBy: { fecha: "desc" },
  });

  const csv = buildCsv(
    [
      "Fecha",
      "Proveedor",
      "CUIT",
      "Condicion IVA",
      "Comprobante",
      "Estado",
      "Total",
      "Detalle",
      "Observaciones",
      "Motivo anulacion",
      "Fecha anulacion",
    ],
    compras.map((compra) => [
      compra.fecha.toISOString(),
      compra.proveedorRef?.razonSocial ?? compra.proveedor,
      compra.proveedorRef?.cuit ?? "",
      compra.proveedorRef?.condicionIva ?? "",
      compra.comprobante ?? "",
      compra.estado,
      Number(compra.total),
      compra.detalles
        .map((detalle) => `${detalle.material.codigo} ${detalle.material.nombre} x ${Number(detalle.cantidad)}`)
        .join(" / "),
      compra.observaciones ?? "",
      compra.motivoAnulacion ?? "",
      compra.anuladoAt?.toISOString() ?? "",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="compras.csv"',
    },
  });
}
