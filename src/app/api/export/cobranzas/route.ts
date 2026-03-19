import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getSeguimientoCobranzaData } from "@/lib/data";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA"]);
  const { searchParams } = new URL(request.url);

  const {
    promesasVencidas,
    promesasPorVencer,
    proximasGestiones,
    cuotasVencidas,
    cuotasPorVencer,
    candidatosCorte,
  } = await getSeguimientoCobranzaData({
    q: searchParams.get("q") ?? "",
    localidad: searchParams.get("localidad") ?? "",
    operadorId: searchParams.get("operadorId") ?? "",
    horizonte: searchParams.get("horizonte") ?? "7",
  });

  const csv = buildCsv(
    ["Bloque", "Abonado", "Titular", "Operador", "Referencia", "Fecha", "Importe", "Detalle"],
    [
      ...promesasVencidas.map((item) => [
        "PROMESA_VENCIDA",
        item.abonado.numeroAbonado,
        item.abonado.razonSocial || [item.abonado.apellido, item.abonado.nombre].filter(Boolean).join(" "),
        item.usuario.nombre,
        item.factura?.numero ?? "",
        item.compromisoPagoAt?.toISOString() ?? "",
        Number(item.compromisoImporte ?? 0),
        `${item.canal} / ${item.resultado}`,
      ]),
      ...promesasPorVencer.map((item) => [
        "PROMESA_POR_VENCER",
        item.abonado.numeroAbonado,
        item.abonado.razonSocial || [item.abonado.apellido, item.abonado.nombre].filter(Boolean).join(" "),
        item.usuario.nombre,
        item.factura?.numero ?? "",
        item.compromisoPagoAt?.toISOString() ?? "",
        Number(item.compromisoImporte ?? 0),
        `${item.canal} / ${item.resultado}`,
      ]),
      ...proximasGestiones.map((item) => [
        "PROXIMA_GESTION",
        item.abonado.numeroAbonado,
        item.abonado.razonSocial || [item.abonado.apellido, item.abonado.nombre].filter(Boolean).join(" "),
        item.usuario.nombre,
        item.factura?.numero ?? "",
        item.proximaGestionAt?.toISOString() ?? "",
        "",
        `${item.canal} / ${item.resultado}`,
      ]),
      ...cuotasVencidas.map((item) => [
        "CUOTA_VENCIDA",
        item.acuerdoPago.abonado.numeroAbonado,
        item.acuerdoPago.abonado.razonSocial ||
          [item.acuerdoPago.abonado.apellido, item.acuerdoPago.abonado.nombre].filter(Boolean).join(" "),
        item.acuerdoPago.usuario.nombre,
        `${item.acuerdoPago.numero} / Cuota ${item.numeroCuota}`,
        item.fechaVencimiento.toISOString(),
        Number(item.importe),
        item.estado,
      ]),
      ...cuotasPorVencer.map((item) => [
        "CUOTA_POR_VENCER",
        item.acuerdoPago.abonado.numeroAbonado,
        item.acuerdoPago.abonado.razonSocial ||
          [item.acuerdoPago.abonado.apellido, item.acuerdoPago.abonado.nombre].filter(Boolean).join(" "),
        item.acuerdoPago.usuario.nombre,
        `${item.acuerdoPago.numero} / Cuota ${item.numeroCuota}`,
        item.fechaVencimiento.toISOString(),
        Number(item.importe),
        item.estado,
      ]),
      ...candidatosCorte.map((item) => [
        "CANDIDATO_CORTE",
        item.numeroAbonado,
        item.razonSocial || [item.apellido, item.nombre].filter(Boolean).join(" "),
        "",
        `${item.facturas.length} facturas vencidas / ${item.serviciosActivosSinCorte.length} servicios`,
        item.facturas[0]?.fechaVencimiento?.toISOString() ?? "",
        Number(item.deudaVencida),
        [
          item.localidad ? `Localidad: ${item.localidad}` : "",
          `Servicios: ${item.serviciosActivosSinCorte
            .map((servicio) => servicio.servicioCatalogo?.nombre ?? servicio.plan)
            .join(" / ")}`,
          item.promesaVigente ? "Promesa vigente" : "Sin promesa vigente",
        ]
          .filter(Boolean)
          .join(" | "),
      ]),
    ],
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="seguimiento-cobranzas.csv"',
    },
  });
}
