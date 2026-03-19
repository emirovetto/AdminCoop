import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getReportesData } from "@/lib/data";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const { searchParams } = new URL(request.url);

  const {
    abonados,
    facturas,
    reclamos,
    stockCritico,
    compras,
    gestionesCobranza,
    acuerdosPago,
    moraPorAntiguedad,
    productividadTecnica,
    serviciosRentables,
    evolucionMensual,
  } = await getReportesData({
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
    localidad: searchParams.get("localidad") ?? "",
    provincia: searchParams.get("provincia") ?? "",
    servicio: searchParams.get("servicio") ?? "",
    condicionIva: searchParams.get("condicionIva") ?? "",
    deuda: searchParams.get("deuda") ?? "",
    estadoFactura: searchParams.get("estadoFactura") ?? "",
    estadoReclamo: searchParams.get("estadoReclamo") ?? "",
    tecnicoId: searchParams.get("tecnicoId") ?? "",
    cargoFacturable: searchParams.get("cargoFacturable") ?? "",
    proveedor: searchParams.get("proveedor") ?? "",
  });

  const csv = buildCsv(
    ["Bloque", "Referencia", "Descripcion", "Estado", "Fecha", "Importe", "Extra"],
    [
      ...abonados.map((abonado) => [
        "ABONADO",
        abonado.numeroAbonado,
        abonado.razonSocial || [abonado.apellido, abonado.nombre].filter(Boolean).join(" "),
        abonado.estado,
        abonado.fechaAlta.toISOString(),
        abonado.facturas.reduce((sum, factura) => sum + Number(factura.total), 0),
        `${abonado.localidad} / ${abonado.servicios.map((servicio) => servicio.plan).join(" / ")}`,
      ]),
      ...facturas.map((factura) => [
        "FACTURA",
        factura.numero,
        factura.abonado.numeroAbonado,
        factura.estado,
        factura.fechaEmision.toISOString(),
        Number(factura.total),
        factura.detalles.map((detalle) => detalle.descripcion).join(" / "),
      ]),
      ...reclamos.map((reclamo) => [
        "RECLAMO",
        `#${reclamo.id}`,
        reclamo.abonado.numeroAbonado,
        reclamo.estado,
        reclamo.fechaApertura.toISOString(),
        "",
        `${reclamo.abonado.localidad} / ${reclamo.materiales.map((material) => material.material.nombre).join(" / ")}`,
      ]),
      ...stockCritico.map((material) => [
        "STOCK",
        material.codigo,
        material.nombre,
        "CRITICO",
        material.updatedAt.toISOString(),
        Number(material.costoPromedio),
        `Stock ${Number(material.stockActual)} / Minimo ${Number(material.stockMinimo)}`,
      ]),
      ...compras.map((compra) => [
        "COMPRA",
        compra.comprobante ?? `COMPRA-${compra.id}`,
        compra.proveedorRef?.razonSocial ?? compra.proveedor,
        compra.estado,
        compra.fecha.toISOString(),
        Number(compra.total),
        compra.detalles.map((detalle) => `${detalle.material.nombre} x ${Number(detalle.cantidad)}`).join(" / "),
      ]),
      ...gestionesCobranza.map((gestion) => [
        "COBRANZA",
        `GEST-${gestion.id}`,
        gestion.abonado.numeroAbonado,
        gestion.estado,
        gestion.createdAt.toISOString(),
        Number(gestion.compromisoImporte ?? 0),
        `${gestion.canal} / ${gestion.resultado} / ${gestion.usuario.nombre}${
          gestion.compromisoPagoAt ? ` / ${gestion.compromisoPagoAt.toISOString()}` : ""
        }`,
      ]),
      ...acuerdosPago.map((acuerdo) => [
        "PLAN_PAGO",
        acuerdo.numero,
        acuerdo.abonado.numeroAbonado,
        acuerdo.estado,
        acuerdo.fechaAcuerdo.toISOString(),
        Number(acuerdo.totalAcuerdo),
        `${acuerdo.usuario.nombre} / ${acuerdo.cantidadCuotas} cuotas / ${acuerdo.cuotas.filter((cuota) => cuota.estado === "CUMPLIDA").length} cumplidas`,
      ]),
      ...moraPorAntiguedad.map((bucket) => [
        "MORA",
        bucket.label,
        `${bucket.cantidad} facturas`,
        "",
        "",
        bucket.importe,
        "",
      ]),
      ...productividadTecnica.map((item) => [
        "TECNICO",
        item.tecnico,
        `${item.resueltos} resueltos`,
        `${item.abiertos} abiertos`,
        "",
        item.total,
        `${item.materiales} materiales`,
      ]),
      ...serviciosRentables.map((item) => [
        "SERVICIO",
        item.servicio,
        `${item.conceptos} renglones`,
        "",
        "",
        item.importe,
        "",
      ]),
      ...evolucionMensual.map((item) => [
        "EVOLUCION",
        item.label,
        `Facturado ${item.facturado}`,
        `Cobrado ${item.cobrado}`,
        "",
        item.compras,
        "",
      ]),
    ],
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="reportes.csv"',
    },
  });
}
