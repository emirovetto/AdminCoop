import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildCuentaCorrienteWhere } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA"]);
  const { searchParams } = new URL(request.url);

  const movimientos = await prisma.cuentaCorriente.findMany({
    where: buildCuentaCorrienteWhere({
      q: searchParams.get("q") ?? "",
      abonadoId: searchParams.get("abonadoId") ?? "",
      tipo: searchParams.get("tipo") ?? "",
      localidad: searchParams.get("localidad") ?? "",
      condicionIva: searchParams.get("condicionIva") ?? "",
      vigencia: searchParams.get("vigencia") ?? "",
      desde: searchParams.get("desde") ?? "",
      hasta: searchParams.get("hasta") ?? "",
    }),
    include: {
      abonado: true,
      factura: {
        select: {
          numero: true,
        },
      },
      pago: {
        select: {
          numeroRecibo: true,
          estado: true,
        },
      },
    },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
  });

  const csv = buildCsv(
    [
      "Fecha",
      "Abonado",
      "Titular",
      "Localidad",
      "Condicion IVA",
      "Tipo",
      "Referencia",
      "Importe",
      "Vigencia",
      "Descripcion",
    ],
    movimientos.map((movimiento) => [
      movimiento.fecha.toISOString(),
      movimiento.abonado.numeroAbonado,
      movimiento.abonado.razonSocial ||
        [movimiento.abonado.apellido, movimiento.abonado.nombre].filter(Boolean).join(" "),
      movimiento.abonado.localidad,
      movimiento.abonado.condicionIva,
      movimiento.tipo,
      movimiento.factura?.numero ?? movimiento.pago?.numeroRecibo ?? `MOV-${movimiento.id}`,
      Number(movimiento.importe),
      movimiento.anuladoAt ? "ANULADO" : movimiento.pago?.estado ?? "VIGENTE",
      movimiento.descripcion,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cuenta-corriente.csv"',
    },
  });
}
