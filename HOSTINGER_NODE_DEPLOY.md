# Deploy en Hostinger

Guia operativa para publicar `AdminCoop` en un entorno Hostinger con soporte real de `Node.js`.

## Estado verificado el 19 de marzo de 2026

- El host entregado para archivos fue `srv1896-files.hstgr.io`.
- La IP resuelta desde esta sesion fue `193.203.175.234`.
- `Puerto 22`: no accesible desde esta sesion.
- La documentacion oficial de Hostinger para este tipo de acceso indica `SFTP/SSH` por `65002`, no `22`.
- Con estas credenciales y esta ruta (`/files/public_html/coopplus/`) lo que tenemos parece ser el espacio clasico de archivos/public_html.

## Importante

Esta aplicacion **no es un sitio estatico**. Usa:

- `Next.js` con render del lado servidor
- `Server Actions`
- `Prisma`
- `MySQL`
- autenticacion por cookie del servidor

Por eso **no alcanza con subir archivos a `public_html`**. Para funcionar online de verdad, la app necesita un runtime `Node.js`.

## Entorno correcto para publicar

Necesitamos uno de estos escenarios:

1. `Hostinger Web App / Node.js Hosting`
2. `VPS Hostinger`
3. otro hosting con soporte `Node.js`

Si el plan actual de Hostinger ya incluye despliegue de aplicaciones Node desde panel, ese es el camino correcto.

## Configuracion del proyecto ya preparada

El proyecto ya quedo listo para despliegue Node:

- `output: "standalone"` en `next.config.ts`
- `start:standalone` en `package.json`
- `build:hostinger` en `package.json`
- `engines.node = 22.x`
- endpoint de salud en `/api/health`

## Paquete listo para Hostinger Node Apps

Se puede generar un paquete deployable con:

```bash
npm run build:hostinger
```

Eso deja una carpeta lista en:

```bash
deploy/hostinger-node
```

El arranque del paquete generado es:

```bash
node server.js
```

## Variables de entorno necesarias

Minimas:

- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_NAME`

Opcionales:

- `ABONADOS_TEMPLATE_PATH`

## Comandos recomendados en Hostinger Node App

### Build command

```bash
npm install && npm run prisma:generate && npm run build
```

### Start command

```bash
npm run start:standalone
```

Si el panel Node App permite subir un build ya preparado en lugar de compilar remoto, usar el contenido de `deploy/hostinger-node` y arrancar con:

```bash
node server.js
```

## Paso de base de datos

Una sola vez al desplegar por primera vez o cuando cambie el schema:

```bash
npx prisma db push
```

No conviene ejecutar `seed` en produccion salvo que se busque cargar datos de ejemplo.

## Verificacion post deploy

1. Abrir `/api/health`
2. Verificar que responda:

```json
{
  "ok": true,
  "app": "AdminCoop",
  "database": "ok"
}
```

3. Probar:

- `/login`
- `/portal-cliente/login`
- una pagina autenticada interna
- una pagina autenticada del portal cliente

## Siguiente paso recomendado

Si el panel actual solo expone `public_html` y SFTP, necesitamos:

- acceso al panel de `Web App / Node.js`
- o un `VPS`
- o un repositorio Git para conectar despliegue continuo al servicio Node adecuado

## Referencias oficiales

- Hostinger SFTP/SSH: `65002`
- Hostinger Web App / Node.js Hosting

Antes de publicar definitivamente, conviene confirmar desde hPanel si este plan permite crear una aplicacion `Node.js` o si solo ofrece hosting tradicional de archivos.
