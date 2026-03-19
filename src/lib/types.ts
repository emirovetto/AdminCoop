export type EstadoBase = "ACTIVO" | "INACTIVO" | "SUSPENDIDO";

export type Socio = {
  id: number;
  nombre: string;
  apellido: string;
  dni: string;
  email: string;
  telefono: string;
  fechaAlta: string;
  estado: EstadoBase;
};

export type Servicio = {
  id: number;
  abonadoId: number;
  tipo: "INTERNET" | "TV" | "TELEFONIA";
  plan: string;
  precio: number;
  estado: "ACTIVO" | "PAUSADO";
  fechaAlta: string;
};

export type Abonado = {
  id: number;
  socioId: number;
  numeroAbonado: string;
  domicilio: string;
  localidad: string;
  estado: EstadoBase;
  fechaAlta: string;
};

export type Factura = {
  id: number;
  abonadoId: number;
  numero: string;
  fechaEmision: string;
  fechaVencimiento: string;
  total: number;
  estado: "PENDIENTE" | "PAGADA" | "VENCIDA";
};

export type Pago = {
  id: number;
  abonadoId: number;
  importe: number;
  medioPago: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA";
  fecha: string;
  usuarioId: number;
};

export type Reclamo = {
  id: number;
  abonadoId: number;
  tecnicoId: number | null;
  tipoServicio: "INTERNET" | "TV" | "TELEFONIA";
  descripcion: string;
  prioridad: "BAJA" | "MEDIA" | "ALTA";
  estado: "ABIERTO" | "EN_PROCESO" | "RESUELTO";
  fechaApertura: string;
  fechaCierre: string | null;
};

export type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol: "ADMIN" | "CAJA" | "TECNICO";
  activo: boolean;
};

export type MovimientoCuenta = {
  id: number;
  abonadoId: number;
  facturaId: number | null;
  tipo: "DEBITO" | "CREDITO";
  importe: number;
  saldo: number;
  fecha: string;
  descripcion: string;
};
