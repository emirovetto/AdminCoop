import type {
  Abonado,
  Factura,
  MovimientoCuenta,
  Pago,
  Reclamo,
  Servicio,
  Socio,
  Usuario,
} from "@/lib/types";

export const socios: Socio[] = [
  {
    id: 1,
    nombre: "Ana",
    apellido: "Ruiz",
    dni: "28111222",
    email: "ana.ruiz@coop.local",
    telefono: "3704-555101",
    fechaAlta: "2024-02-10",
    estado: "ACTIVO",
  },
  {
    id: 2,
    nombre: "Carlos",
    apellido: "Benitez",
    dni: "30555444",
    email: "carlos.benitez@coop.local",
    telefono: "3704-555102",
    fechaAlta: "2023-11-20",
    estado: "ACTIVO",
  },
  {
    id: 3,
    nombre: "Marta",
    apellido: "Gimenez",
    dni: "26777888",
    email: "marta.gimenez@coop.local",
    telefono: "3704-555103",
    fechaAlta: "2024-07-03",
    estado: "SUSPENDIDO",
  },
];

export const abonados: Abonado[] = [
  {
    id: 1,
    socioId: 1,
    numeroAbonado: "AB-1001",
    domicilio: "Belgrano 145",
    localidad: "Formosa",
    estado: "ACTIVO",
    fechaAlta: "2024-02-10",
  },
  {
    id: 2,
    socioId: 2,
    numeroAbonado: "AB-1002",
    domicilio: "Saavedra 520",
    localidad: "Clorinda",
    estado: "ACTIVO",
    fechaAlta: "2023-11-20",
  },
  {
    id: 3,
    socioId: 3,
    numeroAbonado: "AB-1003",
    domicilio: "Sarmiento 98",
    localidad: "Pirane",
    estado: "SUSPENDIDO",
    fechaAlta: "2024-07-03",
  },
];

export const servicios: Servicio[] = [
  {
    id: 1,
    abonadoId: 1,
    tipo: "INTERNET",
    plan: "Fibra 300 MB",
    precio: 28500,
    estado: "ACTIVO",
    fechaAlta: "2024-02-10",
  },
  {
    id: 2,
    abonadoId: 1,
    tipo: "TV",
    plan: "Digital Plus",
    precio: 11900,
    estado: "ACTIVO",
    fechaAlta: "2024-02-10",
  },
  {
    id: 3,
    abonadoId: 2,
    tipo: "INTERNET",
    plan: "Fibra 150 MB",
    precio: 19800,
    estado: "ACTIVO",
    fechaAlta: "2023-11-20",
  },
  {
    id: 4,
    abonadoId: 3,
    tipo: "TELEFONIA",
    plan: "Linea Hogar",
    precio: 8400,
    estado: "PAUSADO",
    fechaAlta: "2024-07-03",
  },
];

export const facturas: Factura[] = [
  {
    id: 1,
    abonadoId: 1,
    numero: "FAC-2026-0001",
    fechaEmision: "2026-03-01",
    fechaVencimiento: "2026-03-15",
    total: 40400,
    estado: "PENDIENTE",
  },
  {
    id: 2,
    abonadoId: 2,
    numero: "FAC-2026-0002",
    fechaEmision: "2026-03-01",
    fechaVencimiento: "2026-03-15",
    total: 19800,
    estado: "PAGADA",
  },
  {
    id: 3,
    abonadoId: 3,
    numero: "FAC-2026-0003",
    fechaEmision: "2026-02-01",
    fechaVencimiento: "2026-02-15",
    total: 8400,
    estado: "VENCIDA",
  },
];

export const movimientosCuenta: MovimientoCuenta[] = [
  {
    id: 1,
    abonadoId: 1,
    facturaId: 1,
    tipo: "DEBITO",
    importe: 40400,
    saldo: 30400,
    fecha: "2026-03-01",
    descripcion: "Factura marzo 2026",
  },
  {
    id: 2,
    abonadoId: 1,
    facturaId: null,
    tipo: "CREDITO",
    importe: 10000,
    saldo: 30400,
    fecha: "2026-03-10",
    descripcion: "Pago parcial por transferencia",
  },
  {
    id: 3,
    abonadoId: 3,
    facturaId: 3,
    tipo: "DEBITO",
    importe: 8400,
    saldo: 8400,
    fecha: "2026-02-01",
    descripcion: "Factura febrero 2026",
  },
];

export const usuarios: Usuario[] = [
  {
    id: 1,
    nombre: "Lucia Mendez",
    email: "lucia@coop.local",
    rol: "ADMIN",
    activo: true,
  },
  {
    id: 2,
    nombre: "Pedro Acosta",
    email: "pedro@coop.local",
    rol: "CAJA",
    activo: true,
  },
  {
    id: 3,
    nombre: "Martin Sosa",
    email: "martin@coop.local",
    rol: "TECNICO",
    activo: true,
  },
];

export const pagos: Pago[] = [
  {
    id: 1,
    abonadoId: 1,
    importe: 10000,
    medioPago: "TRANSFERENCIA",
    fecha: "2026-03-10",
    usuarioId: 2,
  },
  {
    id: 2,
    abonadoId: 2,
    importe: 19800,
    medioPago: "EFECTIVO",
    fecha: "2026-03-05",
    usuarioId: 2,
  },
];

export const reclamos: Reclamo[] = [
  {
    id: 1,
    abonadoId: 1,
    tecnicoId: 3,
    tipoServicio: "INTERNET",
    descripcion: "Intermitencia durante horarios pico.",
    prioridad: "ALTA",
    estado: "EN_PROCESO",
    fechaApertura: "2026-03-12T09:30:00",
    fechaCierre: null,
  },
  {
    id: 2,
    abonadoId: 2,
    tecnicoId: 3,
    tipoServicio: "TV",
    descripcion: "Canales sin senal en sector norte.",
    prioridad: "MEDIA",
    estado: "ABIERTO",
    fechaApertura: "2026-03-14T18:10:00",
    fechaCierre: null,
  },
  {
    id: 3,
    abonadoId: 3,
    tecnicoId: null,
    tipoServicio: "TELEFONIA",
    descripcion: "No hay tono desde hace 24 horas.",
    prioridad: "ALTA",
    estado: "RESUELTO",
    fechaApertura: "2026-03-01T08:00:00",
    fechaCierre: "2026-03-01T15:20:00",
  },
];
