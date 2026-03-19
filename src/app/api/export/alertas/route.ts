import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getAlertasOperativasData } from "@/lib/data";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "CAJA", "TECNICO"]);
  const { searchParams } = new URL(request.url);

  const { promesasVencidas, cuotasVencidas, cortesMora, stockCritico, reclamosCriticos, ordenesDemoradas, alertasArca } =
    await getAlertasOperativasData({
      q: searchParams.get("q") ?? "",
      categoria: searchParams.get("categoria") ?? "",
      severidad: searchParams.get("severidad") ?? "",
      horizonte: searchParams.get("horizonte") ?? "7",
    });

  const csv = buildCsv(
    ["Categoria", "Severidad", "Referencia", "Abonado", "Titular", "Fecha", "Importe", "Detalle"],
    [
      ...promesasVencidas.map((item) => [
        "COBRANZAS_PROMESA",
        item.severidad,
        item.gestion.factura?.numero ?? `GESTION-${item.gestion.id}`,
        item.gestion.abonado.numeroAbonado,
        item.gestion.abonado.razonSocial ||
          [item.gestion.abonado.apellido, item.gestion.abonado.nombre].filter(Boolean).join(" "),
        item.gestion.compromisoPagoAt?.toISOString() ?? item.gestion.createdAt.toISOString(),
        Number(item.gestion.compromisoImporte ?? 0),
        `${item.gestion.usuario.nombre} / ${item.gestion.resultado}`,
      ]),
      ...cuotasVencidas.map((item) => [
        "COBRANZAS_CUOTA",
        item.severidad,
        `${item.cuota.acuerdoPago.numero} / Cuota ${item.cuota.numeroCuota}`,
        item.cuota.acuerdoPago.abonado.numeroAbonado,
        item.cuota.acuerdoPago.abonado.razonSocial ||
          [item.cuota.acuerdoPago.abonado.apellido, item.cuota.acuerdoPago.abonado.nombre].filter(Boolean).join(" "),
        item.cuota.fechaVencimiento.toISOString(),
        Number(item.cuota.importe),
        item.cuota.acuerdoPago.usuario.nombre,
      ]),
      ...cortesMora.map((item) => [
        "COBRANZAS_CORTE",
        item.severidad,
        `${item.corte.facturas.length} facturas vencidas`,
        item.corte.numeroAbonado,
        item.corte.razonSocial || [item.corte.apellido, item.corte.nombre].filter(Boolean).join(" "),
        item.corte.facturas[0]?.fechaVencimiento?.toISOString() ?? "",
        Number(item.corte.deudaVencida),
        [
          item.corte.localidad ? `Localidad ${item.corte.localidad}` : "",
          `Servicios ${item.corte.serviciosActivosSinCorte
            .map((servicio) => servicio.servicioCatalogo?.nombre ?? servicio.plan)
            .join(" / ")}`,
          item.corte.promesaVigente ? "Promesa vigente" : "Sin promesa",
        ]
          .filter(Boolean)
          .join(" / "),
      ]),
      ...stockCritico.map((item) => [
        "STOCK",
        item.severidad,
        item.material.codigo,
        "",
        item.material.nombre,
        item.material.updatedAt.toISOString(),
        Number(item.material.stockActual),
        `Minimo ${Number(item.material.stockMinimo)} / ${item.material.categoria}`,
      ]),
      ...reclamosCriticos.map((item) => [
        "RECLAMOS",
        item.severidad,
        `RECL-${item.reclamo.id}`,
        item.reclamo.abonado.numeroAbonado,
        item.reclamo.abonado.razonSocial ||
          [item.reclamo.abonado.apellido, item.reclamo.abonado.nombre].filter(Boolean).join(" "),
        item.reclamo.fechaApertura.toISOString(),
        "",
        `${item.reclamo.tipoServicio} / ${item.reclamo.prioridad} / ${item.reclamo.estado}`,
      ]),
      ...ordenesDemoradas.map((item) => [
        "ORDENES",
        item.severidad,
        `OT-${item.orden.id}`,
        item.orden.abonado.numeroAbonado,
        item.orden.abonado.razonSocial ||
          [item.orden.abonado.apellido, item.orden.abonado.nombre].filter(Boolean).join(" "),
        item.orden.fechaProgramada?.toISOString() ?? item.orden.createdAt.toISOString(),
        "",
        `${item.orden.tipo} / ${item.orden.estado} / ${item.orden.tecnico?.nombre ?? "Sin asignar"}`,
      ]),
      ...alertasArca.map((item) => [
        "ARCA",
        item.severidad,
        item.factura.numero,
        item.factura.abonado.numeroAbonado,
        item.factura.abonado.razonSocial ||
          [item.factura.abonado.apellido, item.factura.abonado.nombre].filter(Boolean).join(" "),
        item.factura.fechaEmision.toISOString(),
        Number(item.factura.total),
        item.precheck.issues.join(" | ") || item.factura.resultadoArca,
      ]),
    ],
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="alertas-operativas.csv"',
    },
  });
}
