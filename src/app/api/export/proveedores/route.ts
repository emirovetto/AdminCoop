import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getProveedoresData } from "@/lib/data";
import { buildCsv } from "@/lib/utils";

export async function GET(request: Request) {
  await requireRole(["ADMIN"]);
  const { searchParams } = new URL(request.url);
  const { proveedores } = await getProveedoresData({
    q: searchParams.get("q") ?? "",
    condicionIva: searchParams.get("condicionIva") ?? "",
    activo: searchParams.get("activo") ?? "",
    localidad: searchParams.get("localidad") ?? "",
  });

  const csv = buildCsv(
    [
      "Razon social",
      "Nombre fantasia",
      "CUIT",
      "Condicion IVA",
      "Email",
      "Telefono",
      "Direccion",
      "Localidad",
      "Provincia",
      "Activo",
      "Observaciones",
    ],
    proveedores.map((proveedor) => [
      proveedor.razonSocial,
      proveedor.nombreFantasia ?? "",
      proveedor.cuit ?? "",
      proveedor.condicionIva,
      proveedor.email ?? "",
      proveedor.telefono ?? "",
      proveedor.direccion ?? "",
      proveedor.localidad ?? "",
      proveedor.provincia ?? "",
      proveedor.activo ? "SI" : "NO",
      proveedor.observaciones ?? "",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="proveedores.csv"',
    },
  });
}
