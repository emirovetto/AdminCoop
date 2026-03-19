import { abonados, facturas, movimientosCuenta, reclamos, servicios, socios } from "@/lib/mock-data";

export function getDashboardMetrics() {
  const facturacionPendiente = facturas
    .filter((factura) => factura.estado !== "PAGADA")
    .reduce((sum, factura) => sum + factura.total, 0);

  const cobranzaDelMes = movimientosCuenta
    .filter((movimiento) => movimiento.tipo === "CREDITO")
    .reduce((sum, movimiento) => sum + movimiento.importe, 0);

  return {
    sociosActivos: socios.filter((socio) => socio.estado === "ACTIVO").length,
    abonadosActivos: abonados.filter((abonado) => abonado.estado === "ACTIVO").length,
    serviciosActivos: servicios.filter((servicio) => servicio.estado === "ACTIVO").length,
    reclamosAbiertos: reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO").length,
    facturacionPendiente,
    cobranzaDelMes,
  };
}

export function getUpcomingTasks() {
  return [
    {
      title: "Configurar conexion a base productiva",
      detail: "Falta definir motor, host, credenciales y estrategia de migracion.",
      kind: "bloqueante",
    },
    {
      title: "Importador de plantilla de abonados",
      detail: "Usar la planilla ODS existente para alta masiva y validaciones.",
      kind: "siguiente",
    },
    {
      title: "Cierre de reclamos SLA alto",
      detail: "Hay 2 reclamos con prioridad alta para seguir durante esta semana.",
      kind: "operativo",
    },
  ] as const;
}
