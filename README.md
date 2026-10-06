# FlexPos Web

Frontend (Angular 22) del sistema FlexPos. Consume la API de `FlexPos.Backend`.

## Requisitos

- **Node.js 24 LTS** (Angular 22 exige `^22.22.3`, `^24.15.0` o `^26`). Comprueba con `node -v`.
- **npm** (viene con Node).
- La API corriendo en local en `http://localhost:5063` (perfil `http` de `launchSettings.json`).

## Arrancar

```bash
npm install
npm start
```

Abre http://localhost:4200. Las peticiones a `/api` pasan por el proxy de `ng serve`
(`proxy.conf.json`) hacia `http://localhost:5063`, de modo que frontend y API comparten
origen y la cookie del refresh token funciona sin problemas de CORS. Si tu API usa otro
puerto, cámbialo en `proxy.conf.json`.

## Otros comandos

```bash
npm test          # pruebas unitarias (Vitest)
npm run build     # compilación de producción
```

## Estructura

```
src/app/
  core/          sesión, interceptores, guards, layout, notificaciones
  shared/        componentes reutilizables (iconos, logo, campo de contraseña) y páginas de aviso
  features/      un directorio por módulo (autenticacion, inicio, ...)
src/environments/  apiUrl por entorno
docs/api/        contrato de la API (openapi.json y contrato-api.md) que entrega el backend
docs/            prompt de trabajo del frontend
```

## Autenticación

- El access token vive solo en memoria; el refresh token viaja en una cookie `HttpOnly`.
- `refrescar` y `logout` envían `X-Requested-With: XMLHttpRequest`.
- Al recargar la página, la sesión se restaura con la cookie.

## Producción

El frontend queda listo para Render Static Site con [`render.yaml`](render.yaml):

```text
Build Command: npm ci && npm run build
Publish Directory: dist/flexpos-web/browser
```

`src/environments/environment.ts` deja `apiUrl` vacío para que las llamadas usen `/api`.
Render reescribe `/api/*` hacia `https://novabackend-3.onrender.com/api/*` y `/*` hacia
`/index.html` para soportar rutas internas de Angular.

En el backend configure el origen publicado del frontend en `Cors__OrigenesPermitidos__0`.
Si cambia la URL del backend, actualice también la regla `/api/*` de `render.yaml`.

## Estado

- **Fase 0** (base): login, cambio de contraseña, sesión, interceptores, guards por rol, layout.
- **Módulos con el backend ya disponible, construidos:** Clientes, Servicios, Empleados (con horario
  semanal), Usuarios, Configuración (negocio, impuestos, métodos de pago, numeración), Inventario
  (artículos, entradas, salidas y movimientos), Proveedores, Compras y Citas (agenda de día y de semana).
- **Pendientes** (el backend aún no los expone): Ventas, Facturación, Caja, Comisiones y Reportes.
  Mientras tanto muestran una pantalla "pendiente".

## Pantallas de listado

Clientes, Proveedores, Empleados, Servicios, Usuarios, Impuestos, Métodos de pago e Inventario
usan el mismo componente (`shared/crud/lista-crud`), que se configura con un objeto
(`ConfigCrud`): columnas, campos del formulario, URLs y permisos. Para un módulo nuevo parecido,
basta con definir esa configuración.

## Zona horaria

El backend trabaja en UTC; la interfaz muestra y envía en `America/Bogota` (UTC-5, sin horario de
verano). Se cambia en `src/app/core/tiempo/zona.ts`.
