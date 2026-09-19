# Magon Payments

Pasarela de suscripciones de **Magon** construida con **Next.js + Supabase** y **GalioPay**.
Cada cliente tiene un monto mensual fijo, **vence el día 10** y se **bloquea desde el 11** hasta que pague.

Incluye un componente React (`<MagonPayGate>`) sin dependencias externas, integrable en cualquier proyecto.

## Cómo funciona

1. Magon define un cliente en el backend y obtiene una **KEY** (`client_key`).
2. El front integra esa KEY en `<MagonPayGate clientKey="...">`.
3. El componente consulta `GET /api/subscription/status?key=...`:
   - Si está al día → renderiza `children`.
   - Si debe o está vencido → muestra la pantalla de pago y **bloquea el contenido**.
4. El pago se genera con `POST /api/payments/create` (adapter GalioPay).
5. GalioPay notifica a `POST /api/webhooks/galiopay`, que marca la factura como pagada (idempotente).
6. Con la factura paga se puede descargar el **comprobante PDF** (`GET /api/receipts`).

Regla de facturación (`src/lib/subscription/period.ts`) — **siempre contra factura**:

- El servicio de un mes se paga al mes siguiente. Ej: el servicio de **agosto** (período `2026-08`)
  vence el **10 de septiembre** (`due_date = 2026-09-10`).
- Del día 1 al 10: se permite el acceso (la factura del mes anterior vence ese día).
- Desde el **11**: **bloqueado** si la factura vencida sigue impaga.
- Facturas de meses anteriores impagas mantienen el bloqueo hasta regularizar todo
  (el pago se asigna FIFO a las facturas más antiguas).
- `clients.start_period` (`YYYY-MM`) define el primer período facturable; si es `null` se usa el mes de alta.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar valores
npm run dev                  # http://localhost:3000
```

### 1. Supabase

1. Crear proyecto en Supabase.
2. SQL Editor → ejecutar `supabase/schema.sql`.
3. Copiar `Project URL` y `service_role key` a `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

> Si ya tenías la base creada antes del cambio de ciclo de facturación, ejecutá también
> `supabase/migrations/001_billing_cycle.sql` (agrega `start_period` y hace el backfill).

> El backend usa la **service role key** (solo servidor). Las tablas tienen RLS activado sin políticas, así que `anon`/`authenticated` no acceden a nada.

### 2. Variables de entorno

Ver `.env.example`. Las claves relevantes:

| Variable | Descripción |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Credenciales de Supabase (servidor) |
| `NEXT_PUBLIC_API_BASE_URL` | URL pública del backend que consume el componente |
| `CORS_ORIGINS` | Orígenes permitidos (`*` o lista separada por coma) para la API |
| `GALIOPAY_MODE` | `mock` (dev) o `live` |
| `GALIOPAY_API_BASE_URL` | URL base de la API de GalioPay |
| `GALIOPAY_CREATE_PAYMENT_PATH` | Endpoint de creación de pagos |
| `GALIOPAY_CLIENT_ID`, `GALIOPAY_API_KEY` | Credenciales de GalioPay |
| `GALIOPAY_AUTH_MODE` | `bearer` \| `header` \| `basic` \| `body` |
| `GALIOPAY_WEBHOOK_SECRET` / `GALIOPAY_WEBHOOK_TOKEN` | Verificación del webhook |
| `SUBSCRIPTION_DUE_DAY` | Día de vencimiento (10) |
| `ADMIN_API_KEY` | Protege la API interna (`x-admin-key`) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Credenciales del panel `/admin` |
| `ADMIN_SESSION_SECRET` | Firma la sesión del panel (opcional) |
| `CRON_SECRET` | Protege el cron de facturas |

Con `GALIOPAY_MODE=mock` no se llama a la API real: `/api/payments/create` devuelve un checkout simulado
(`/mock-checkout`) y podés aprobar el pago con el botón "Simular transferencia aprobada".

### 3. GalioPay

Integración ya implementada contra la API real ([docs](https://pay.galio.app/docs/api/introduccion)):

- Base: `https://pay.galio.app/api`, endpoint `POST /payment-links` (`GALIOPAY_CREATE_PAYMENT_PATH=/payment-links`).
- Auth: `Authorization: Bearer {API_KEY}` + `x-client-id: {CLIENT_ID}` (`GALIOPAY_AUTH_MODE=bearer`).
- Se crea un **payment link** con `items`, `referenceId`, `notificationUrl` y `backUrl`; la respuesta `url` es la pasarela.
- El `backUrl` de éxito/fallo apunta a la **app del cliente**: el componente envía `returnUrl` con su URL actual.
  Si no se envía, se usa `https://TU-DOMINIO/pago` (página neutral del backend).
- `GALIOPAY_SANDBOX=true` crea links de prueba (solo aplica con `GALIOPAY_MODE=live`).

El webhook entiende el payload de GalioPay (`approved` y `refunded`) y valida la firma opcional
`X-GalioPay-Signature: v1=HMAC_SHA256(timestamp + "." + rawBody)` con `GALIOPAY_WEBHOOK_SECRET`,
usando `X-GalioPay-Event-Id` para idempotencia:

```json
{
  "id": "699f004c01b956cd4250aa77",
  "paymentMethodId": "TRANSFER",
  "amount": 1000,
  "netAmount": 970,
  "moneyReleaseDate": "2026-02-25T14:10:00.000Z",
  "status": "approved",
  "currency": "ARS",
  "date": "2026-02-25T13:59:40.406Z",
  "referenceId": "test-ref-1234567890"
}
```

En GalioPay configurá la URL del webhook (o se envía como `notificationUrl` al crear el link):

```
https://TU-DOMINIO/api/webhooks/galiopay
```

> Monto mínimo de GalioPay: `$100`. Si un cliente tiene `monthlyAmount` menor, la creación del link falla.

```json
{
  "id": "699f004c01b956cd4250aa77",
  "paymentMethodId": "TRANSFER",
  "amount": 1000,
  "netAmount": 970,
  "moneyReleaseDate": "2026-02-25T14:10:00.000Z",
  "status": "approved",
  "currency": "ARS",
  "date": "2026-02-25T13:59:40.406Z",
  "referenceId": "test-ref-1234567890"
}
```

En GalioPay configurá la URL del webhook:

```
https://TU-DOMINIO/api/webhooks/galiopay
```

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/subscription/status?key=KEY` | Estado de la suscripción (usado por el componente) |
| `POST` | `/api/payments/create` | Crea el pago. Body `{ "clientKey": "..." }` |
| `POST` | `/api/webhooks/galiopay` | Webhook de GalioPay (idempotente) |
| `GET/POST/PATCH` | `/api/admin/clients` | Alta/edición de clientes (sesión del panel o `x-admin-key`) |
| `POST` | `/api/admin/payments` | Confirma un pago manual (efectivo/transferencia externa) |
| `POST` | `/api/admin/login` \| `/logout` | Sesión del panel `/admin` |
| `GET/POST` | `/api/cron/invoices` | Genera facturas del período y marca vencidas (`x-cron-secret`) |
| `GET` | `/api/receipts?key=KEY&invoiceId=...` | Comprobante de pago en PDF (factura paga) |
| `GET` | `/api/protected` | Ejemplo de recurso protegido por suscripción |
| `POST` | `/api/mock/pay` | Solo en modo mock: simula webhook aprobado |

## Panel de administración (`/admin`)

UI sencilla para cargar/editar clientes, ver la **deuda** de cada uno y **confirmar pagos manuales**
(para quien paga por fuera de GalioPay).

1. Configurá en el servidor: `ADMIN_USERNAME`, `ADMIN_PASSWORD` (y opcional `ADMIN_SESSION_SECRET`).
   Si no definís `ADMIN_PASSWORD`, se usa `ADMIN_API_KEY`.
2. Entrá a `https://TU-DOMINIO/admin` e iniciá sesión. La sesión va en una cookie HttpOnly firmada (12 h).
3. Podés: crear cliente (con `start_period`), editarlo, y confirmar pago seleccionando facturas
   impagas + medio de pago + nota. Queda registrado como pago `provider = manual`.

### Definir un cliente (API)

```bash
curl -X POST http://localhost:3000/api/admin/clients \
  -H "content-type: application/json" \
  -H "x-admin-key: TU_ADMIN_API_KEY" \
  -d '{ "name": "Cliente SRL", "email": "pagos@cliente.com", "monthlyAmount": 15000, "currency": "ARS" }'
```

La respuesta incluye `client_key`. Para rotarla: `PATCH` con `{ "id": "...", "rotateKey": true }`.

## Cómo integrar en otro proyecto

El gate es el paquete **`magon-pay-react`** (código en `packages/react/`). Solo depende de React
(`fetch` + inline styles), así que sirve en Next, Vite, CRA, Remix, etc.

### A) Desde npm (si lo publicás)

```bash
npm i magon-pay-react
```

Para publicarlo: `npm login && npm --workspace magon-pay-react publish --access public`.

### B) Desde el tarball (sin publicar, recomendado)

```bash
npm run pack:react          # genera magon-pay-react-1.0.0.tgz en la raíz
```

En el proyecto del cliente:

```bash
npm i /ruta/a/magon-pay-react-1.0.0.tgz
```

### C) Desde GitHub

Subí el `.tgz` como asset de un **Release** e instalalo por URL:

```bash
npm i https://github.com/TU-USUARIO/magon-payments/releases/download/v1.0.0/magon-pay-react-1.0.0.tgz
```

O publicá `packages/react` como repo propio e instalá `npm i github:TU-USUARIO/magon-pay-react`.

Guía completa de publicación (tarball, git subtree, npm registry): [`PUBLICAR.md`](./PUBLICAR.md).

### Uso

```tsx
import { MagonPayGate } from "magon-pay-react";

export default function App() {
  return (
    <MagonPayGate
      clientKey="magon_xxxxxxxx"          // KEY del cliente definida por Magon
      apiBaseUrl="https://pay.magon.com"  // backend de Magon
      pollIntervalMs={15000}              // re-chequeo mientras está bloqueado
      theme={{ primary: "#6d28d9" }}
      labels={{ title: "Suscripción pendiente" }}
    >
      <TuApp />
    </MagonPayGate>
  );
}
```

### Instrucción lista para pegarle a una IA

```
Integrá el gate de suscripciones de Magon en este proyecto React:
1. Instalá el paquete: `npm i magon-pay-react`
   (o desde el archivo: `npm i ./magon-pay-react-1.0.0.tgz`).
2. Envolvé el componente raíz de la app:
   import { MagonPayGate } from "magon-pay-react";
   <MagonPayGate clientKey="AQUI_LA_KEY" apiBaseUrl="https://pay.magon.com">
     <App />
   </MagonPayGate>
3. No agregues estilos ni dependencias extra: el gate trae su propia UI y se bloquea solo.
4. Si el backend de Magon está en el mismo dominio, omití apiBaseUrl.
5. Para personalizar, usá las props `theme` y `labels`.
```

Props principales:

| Prop | Tipo | Descripción |
| --- | --- | --- |
| `clientKey` | `string` | KEY del cliente (obligatoria) |
| `apiBaseUrl` | `string` | URL del backend; vacío = mismo origen |
| `pollIntervalMs` | `number` | Frecuencia de re-chequeo (default 15000) |
| `returnUrl` | `string` | A dónde vuelve GalioPay tras pagar. Por defecto, la página actual del cliente |
| `showLoadingScreen` | `boolean` | Verifica de fondo; el gate solo aparece si está vencida (default `false`) |
| `blockOnError` | `boolean` | Bloquear si falla la consulta (default `false`) |
| `theme` | `MagonPayTheme` | Colores, radio y tipografía (tema **oscuro** por defecto) |
| `labels` | `Partial<MagonPayLabels>` | Textos (i18n) |
| `logoSrc` | `string` | URL del logo; por defecto `https://magon.tech/assets/logos/logo.png` |
| `logo` | `ReactNode` | Logo propio (prioridad sobre `logoSrc`) |
| `logoAlt` | `string` | Alt del logo (default `"Magon"`) |
| `enforce` | `boolean` | `false` renderiza siempre `children` (default `true`) |
| `renderBlocked` | `(ctx) => ReactNode` | UI de bloqueo personalizada |
| `renderLoading` | `() => ReactNode` | UI de carga personalizada |
| `onStatusChange` | `(status) => void` | Callback con el estado actualizado |

También se exporta el hook `useMagonSubscription()`, la pantalla `PaymentBlockedScreen`, el logo
`MagonLogo` y el componente de comprobantes `MagonReceipts`.

### Comprobantes de pago (PDF)

`MagonReceipts` lista las facturas pagas y ofrece el comprobante descargable:

```tsx
import { MagonReceipts } from "magon-pay-react";

<MagonReceipts
  clientKey="magon_xxxx"
  apiBaseUrl="https://api-magonpayments.magonservices.cloud"
/>
```

El PDF (blanco y negro) lo genera el backend en `GET /api/receipts?key=...&invoiceId=...`, con el
desglose del servicio de software (hosting, base de datos, dominio, mantenimiento funcional, soporte).
Los textos del comprobante se editan en `src/lib/receipts/config.ts`.

## Seguridad (importante)

- El bloqueo del componente es **UX**: vive en el navegador y puede evadirse editando el JS.
- La protección real va en el **backend**. Usá `requireActiveSubscription(clientKey)` en tus rutas:

```ts
import { requireActiveSubscription } from "@/lib/guards/requireSubscription";

export async function GET(request: Request) {
  const key = request.headers.get("x-magon-client-key");
  await requireActiveSubscription(key!); // lanza 402/404 si no está al día
  return Response.json({ data: "contenido protegido" });
}
```

- La `client_key` viaja en el front, así que tratala como token de integración: no es un secreto fuerte.
  Recomendado: restringir CORS/dominios, rate limiting y rotar la KEY si se filtra.
- Nunca expongas `SUPABASE_SERVICE_ROLE_KEY` ni `GALIOPAY_API_KEY` en el cliente.

## Deploy

Guía completa en [`DEPLOY.md`](./DEPLOY.md). Resumen:

- El backend se despliega en **Vercel** y `pay.magon.com` apunta ahí.
- **Supabase** es solo la base de datos (no recibe el webhook).
- GalioPay notifica a `https://pay.magon.com/api/webhooks/galiopay`.
- `vercel.json` incluye el build del paquete React y el cron diario de `/api/cron/invoices`.

## Scripts

```bash
npm run dev         # desarrollo (compila el paquete React y levanta Next)
npm run build       # build de producción
npm start           # servir build
npm run typecheck   # tsc --noEmit
npm run build:react # compila solo el paquete magon-pay-react
npm run pack:react  # genera el .tgz instalable del paquete
```
