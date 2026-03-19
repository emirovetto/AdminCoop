import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildAbonadoWhere } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const { searchParams } = new URL(request.url);

  const abonados = await prisma.abonado.findMany({
    where: buildAbonadoWhere({
      q: searchParams.get("q") ?? "",
      estado: searchParams.get("estado") ?? "",
      localidad: searchParams.get("localidad") ?? "",
      provincia: searchParams.get("provincia") ?? "",
      condicionIva: searchParams.get("condicionIva") ?? "",
      servicio: searchParams.get("servicio") ?? "",
      servicioCatalogoId: searchParams.get("servicioCatalogoId") ?? "",
      esSocio: searchParams.get("esSocio") ?? "",
      deuda: searchParams.get("deuda") ?? "",
    }),
    include: {
      servicios: {
        include: {
          servicioCatalogo: true,
        },
      },
      facturas: {
        where: {
          estado: {
            in: ["PENDIENTE", "VENCIDA"],
          },
        },
        select: {
          total: true,
          estado: true,
        },
      },
    },
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }, { numeroAbonado: "asc" }],
  });

  const csv = buildCsv(
    [
      "Numero",
      "Titular",
      "Documento",
      "CUIT",
      "Telefono",
      "Email",
      "Domicilio",
      "Localidad",
      "Provincia",
      "Condicion IVA",
      "Es socio",
      "Estado",
      "Servicios",
      "Deuda abierta",
      "Facturas abiertas",
    ],
    abonados.map((abonado) => [
      abonado.numeroAbonado,
      abonado.razonSocial || [abonado.nombre, abonado.apellido].filter(Boolean).join(" "),
      abonado.documento ?? "",
      abonado.cuit ?? "",
      abonado.telefono ?? "",
      abonado.email ?? "",
      abonado.domicilio,
      abonado.localidad,
      abonado.provincia ?? "",
      abonado.condicionIva,
      abonado.esSocio ? "SI" : "NO",
      abonado.estado,
      abonado.servicios.map((servicio) => servicio.plan).join(" / "),
      abonado.facturas.reduce((sum, factura) => sum + Number(factura.total), 0),
      abonado.facturas.length,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="abonados.csv"',
    },
  });
}
