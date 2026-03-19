import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const existingAbonados = await prisma.abonado.count();
  if (existingAbonados > 0) {
    console.log("Seed omitida: la base ya contiene datos.");
    return;
  }

  const [admin, tecnico] = await prisma.$transaction([
    prisma.usuario.create({
      data: {
        nombre: "Lucia Mendez",
        email: "lucia@coop.local",
        rol: "ADMIN",
        passwordHash: hashPassword(process.env.DEFAULT_ADMIN_PASSWORD || "AdminCoop2026!"),
      },
    }),
    prisma.usuario.create({
      data: {
        nombre: "Martin Sosa",
        email: "martin@coop.local",
        rol: "TECNICO",
        passwordHash: hashPassword("Tecnico2026!"),
      },
    }),
  ]);

  const configuracion = await prisma.configuracionFacturacion.create({
    data: {
      razonSocial: "Cooperativa de Servicios Integrados",
      cuit: "30-71555555-1",
      condicionIvaEmisor: "RESPONSABLE_INSCRIPTO",
      puntoVenta: "0001",
      provincia: "Formosa",
      ingresosBrutos: "901-123456-7",
    },
  });

  const catalogo = await prisma.$transaction([
    prisma.servicioCatalogo.create({
      data: {
        codigo: "INT-300",
        nombre: "Internet Fibra 300 MB",
        categoria: "INTERNET",
        precioBase: 28500,
        periodicidad: "MENSUAL",
        condicionIva: "GRAVADO",
        alicuotaIva: 21,
      },
    }),
    prisma.servicioCatalogo.create({
      data: {
        codigo: "TV-DIGITAL",
        nombre: "TV Digital Plus",
        categoria: "TV",
        precioBase: 11900,
        periodicidad: "MENSUAL",
        condicionIva: "GRAVADO",
        alicuotaIva: 21,
      },
    }),
    prisma.servicioCatalogo.create({
      data: {
        codigo: "AGUA-HOGAR",
        nombre: "Agua Potable Hogar",
        categoria: "AGUA_POTABLE",
        precioBase: 8400,
        periodicidad: "MENSUAL",
        condicionIva: "GRAVADO",
        alicuotaIva: 21,
      },
    }),
  ]);

  const socio = await prisma.socio.create({
    data: {
      nombre: "Ana",
      apellido: "Ruiz",
      dni: "28111222",
      email: "ana.ruiz@coop.local",
      telefono: "3704-555101",
    },
  });

  const abonado = await prisma.abonado.create({
    data: {
      socioId: socio.id,
      esSocio: true,
      numeroAbonado: "AB-1001",
      nombre: "Ana",
      apellido: "Ruiz",
      documento: "28111222",
      tipoDocumento: "DNI",
      telefono: "3704-555101",
      email: "ana.ruiz@coop.local",
      domicilio: "Belgrano 145",
      localidad: "Formosa",
      provincia: "Formosa",
      codigoPostal: "3600",
      condicionFiscal: "Residencial",
      condicionIva: "CONSUMIDOR_FINAL",
      servicios: {
        create: [
          {
            servicioCatalogoId: catalogo[0].id,
            tipo: catalogo[0].categoria,
            plan: catalogo[0].nombre,
            precio: catalogo[0].precioBase,
          },
          {
            servicioCatalogoId: catalogo[1].id,
            tipo: catalogo[1].categoria,
            plan: catalogo[1].nombre,
            precio: catalogo[1].precioBase,
          },
          {
            servicioCatalogoId: catalogo[2].id,
            tipo: catalogo[2].categoria,
            plan: catalogo[2].nombre,
            precio: catalogo[2].precioBase,
          },
        ],
      },
    },
    include: {
      servicios: {
        include: {
          servicioCatalogo: true,
        },
      },
    },
  });

  const subtotal = abonado.servicios.reduce((sum, servicio) => sum + Number(servicio.precio), 0);
  const totalIva = abonado.servicios.reduce(
    (sum, servicio) =>
      sum + (Number(servicio.precio) * Number(servicio.servicioCatalogo?.alicuotaIva ?? 0)) / 100,
    0,
  );
  const total = subtotal + totalIva;

  const factura = await prisma.factura.create({
    data: {
      abonadoId: abonado.id,
      numero: "FAC-202603-0001",
      fechaEmision: new Date("2026-03-01"),
      fechaVencimiento: new Date("2026-03-15"),
      subtotal,
      totalIva,
      total,
      estado: "PENDIENTE",
      condicionIvaEmisor: configuracion.condicionIvaEmisor,
      condicionIvaReceptor: abonado.condicionIva,
      detalles: {
        create: abonado.servicios.map((servicio) => {
          const subtotalLinea = Number(servicio.precio);
          const ivaAlicuota = Number(servicio.servicioCatalogo?.alicuotaIva ?? 0);
          const ivaImporte = (subtotalLinea * ivaAlicuota) / 100;

          return {
            servicioId: servicio.id,
            descripcion: servicio.plan,
            cantidad: 1,
            precioUnitario: subtotalLinea,
            subtotal: subtotalLinea,
            ivaAlicuota,
            ivaImporte,
            totalLinea: subtotalLinea + ivaImporte,
          };
        }),
      },
    },
  });

  await prisma.$transaction([
    prisma.cuentaCorriente.create({
      data: {
        abonadoId: abonado.id,
        facturaId: factura.id,
        tipo: "DEBITO",
        importe: total,
        saldo: total,
        fecha: new Date("2026-03-01"),
        descripcion: "Emision factura marzo 2026",
      },
    }),
    prisma.pago.create({
      data: {
        abonadoId: abonado.id,
        importe: 10000,
        medioPago: "TRANSFERENCIA",
        fecha: new Date("2026-03-10"),
        usuarioId: admin.id,
      },
    }),
    prisma.reclamo.create({
      data: {
        abonadoId: abonado.id,
        tecnicoId: tecnico.id,
        tipoServicio: "INTERNET",
        descripcion: "Intermitencia en la fibra durante horarios pico.",
        prioridad: "ALTA",
        estado: "EN_PROCESO",
        fechaApertura: new Date("2026-03-12T09:30:00"),
      },
    }),
  ]);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
