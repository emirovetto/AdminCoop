import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildFacturacionFilters } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA"]);
  const { searchParams } = new URL(request.url);
  const { facturaWhere, pagoWhere, cuentaWhere } = buildFacturacionFilters({
    q: searchParams.get("q") ?? "",
    estado: searchParams.get("estado") ?? "",
    medioPago: searchParams.get("medioPago") ?? "",
    abonadoId: searchParams.get("abonadoId") ?? "",
    localidad: searchParams.get("localidad") ?? "",
    condicionIva: searchParams.get("condicionIva") ?? "",
    servicioCatalogoId: searchParams.get("servicioCatalogoId") ?? "",
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  const [facturas, pagos, movimientos] = await Promise.all([
    prisma.factura.findMany({
      where: facturaWhere,
      include: {
        abonado: true,
        detalles: true,
      },
      orderBy: [{ fechaEmision: "desc" }, { numero: "desc" }],
    }),
    prisma.pago.findMany({
      where: pagoWhere,
      include: {
        abonado: true,
        usuario: true,
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.cuentaCorriente.findMany({
      where: cuentaWhere,
      include: {
        abonado: true,
      },
      orderBy: { fecha: "desc" },
    }),
  ]);

  const csv = buildCsv(
    [
      "Tipo",
      "Clase",
      "Referencia",
      "ARCA",
      "Abonado",
      "Fecha",
      "Estado/Medio",
      "Resultado ARCA",
      "Subtotal",
      "IVA",
      "Total/Importe",
      "Detalle",
    ],
    [
      ...facturas.map((factura) => [
        "FACTURA",
        factura.tipoAjuste ?? "FACTURA",
        factura.numero,
        `${factura.puntoVentaArca ?? ""}-${factura.tipoComprobanteArca}`,
        factura.abonado.numeroAbonado,
        factura.fechaEmision.toISOString(),
        factura.estado,
        factura.resultadoArca,
        Number(factura.subtotal),
        Number(factura.totalIva),
        Number(factura.total),
        factura.detalles.map((detalle) => detalle.descripcion).join(" / "),
      ]),
      ...pagos.map((pago) => [
        "PAGO",
        "RECIBO",
        pago.numeroRecibo ?? `PAGO-${pago.id}`,
        "",
        pago.abonado.numeroAbonado,
        pago.fecha.toISOString(),
        `${pago.medioPago} / ${pago.estado}`,
        "",
        "",
        "",
        Number(pago.importe),
        `${pago.usuario.nombre}${pago.motivoAnulacion ? ` / ${pago.motivoAnulacion}` : ""}`,
      ]),
      ...movimientos.map((movimiento) => [
        "CUENTA_CORRIENTE",
        "MOVIMIENTO",
        `MOV-${movimiento.id}`,
        "",
        movimiento.abonado.numeroAbonado,
        movimiento.fecha.toISOString(),
        movimiento.tipo,
        "",
        "",
        "",
        Number(movimiento.importe),
        movimiento.descripcion,
      ]),
    ],
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="facturacion.csv"',
    },
  });
}
