# Admin Coop

Sistema inicial para la administracion de una cooperativa de servicios.

## Alcance inicial

- Dashboard operativo con metricas y alertas
- Modulos de socios, abonados, facturacion y reclamos
- Importacion masiva de abonados desde plantilla ODS
- API base para exponer datos del panel
- Esquema Prisma listo para conectar una base real
- Datos mock para avanzar mientras definimos credenciales y migraciones

## Stack

- Next.js (App Router)
- TypeScript
- Prisma
- CSS propio

## Puesta en marcha

1. Instalar dependencias:

```bash
npm install
```

2. Copiar variables de entorno:

```bash
copy .env.example .env
```

3. Generar cliente Prisma, aplicar esquema y cargar semilla:

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

4. Levantar entorno local:

```bash
npm run dev
```

## Base de datos

El proyecto esta preparado para `MySQL` con Prisma. La variable `DATABASE_URL` define el entorno activo.

Si la base remota esta vacia, `npm run prisma:push` crea las tablas y `npm run prisma:seed` carga un juego inicial de datos.

## Produccion Node

El proyecto ya esta preparado para despliegue Node con salida `standalone`.

- Build: `npm run build`
- Inicio standalone: `npm run start:standalone`
- Healthcheck: `/api/health`

Para una guia puntual de Hostinger Node, revisar [HOSTINGER_NODE_DEPLOY.md](C:/Users/Noxi-PC/Documents/AdminCoop/HOSTINGER_NODE_DEPLOY.md).

## Importacion de abonados

La variable `ABONADOS_TEMPLATE_PATH` apunta a la plantilla local `.ods`. El modulo `Importaciones`
lee la primera hoja, toma las columnas `NUMERO DE ABONADO`, `NOMBRE / RAZON SOCIAL`, `DIRECCION`
y `TELEFONO`, y crea socios/abonados nuevos evitando duplicados por numero de abonado.

## Autenticacion inicial

El sistema ahora exige login para ingresar a los modulos internos.

- Usuario admin inicial: `lucia@coop.local`
- Password admin inicial: `AdminCoop2026!`
- Usuario tecnico inicial: `martin@coop.local`
- Password tecnico inicial: `Tecnico2026!`

Permisos actuales:

- `ADMIN`: acceso total
- `CAJA`: socios, abonados, facturacion y reclamos
- `TECNICO`: dashboard y reclamos

Si queres rotar contraseñas iniciales o regenerarlas en usuarios sin clave:

```bash
npm run auth:bootstrap
```
