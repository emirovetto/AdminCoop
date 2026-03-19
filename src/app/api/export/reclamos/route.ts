import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildReclamoWhere } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const { searchParams } = new URL(request.url);

  const reclamos = await prisma.reclamo.findMany({
    where: buildReclamoWhere({
      q: searchParams.get("q") ?? "",
      estado: searchParams.get("estado") ?? "",
      prioridad: searchParams.get("prioridad") ?? "",
      tecnicoId: searchParams.get("tecnicoId") ?? "",
      abonadoId: searchParams.get("abonadoId") ?? "",
      tipoServicio: searchParams.get("tipoServicio") ?? "",
      localidad: searchParams.get("localidad") ?? "",
      cargoFacturable: searchParams.get("cargoFacturable") ?? "",
      desde: searchParams.get("desde") ?? "",
      hasta: searchParams.get("hasta") ?? "",
    }),
    include: {
      abonado: true,
      tecnico: true,
      materiales: {
        include: {
          material: true,
        },
      },
    },
    orderBy: [{ fechaApertura: "desc" }, { prioridad: "desc" }],
  });

  const csv = buildCsv(
    [
      "Ticket",
      "Abonado",
      "Localidad",
      "Servicio",
      "Prioridad",
      "Estado",
      "Tecnico",
      "Apertura",
      "Cierre",
      "Descripcion",
      "Diagnostico",
      "Resolucion",
      "Materiales",
      "Pendiente facturacion",
    ],
    reclamos.map((reclamo) => [
      reclamo.id,
      reclamo.abonado.numeroAbonado,
      reclamo.abonado.localidad,
      reclamo.tipoServicio,
      reclamo.prioridad,
      reclamo.estado,
      reclamo.tecnico?.nombre ?? "",
      reclamo.fechaApertura.toISOString(),
      reclamo.fechaCierre?.toISOString() ?? "",
      reclamo.descripcion,
      reclamo.diagnosticoCierre ?? "",
      reclamo.resolucionCierre ?? "",
      reclamo.materiales
        .map((material) => `${material.material.nombre} x ${Number(material.cantidad)}`)
        .join(" / "),
      reclamo.materiales.some((material) => material.facturarProximaFactura && !material.facturado) ? "SI" : "NO",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="reclamos.csv"',
    },
  });
}
