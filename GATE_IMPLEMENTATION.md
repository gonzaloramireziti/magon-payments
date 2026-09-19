# Implementación del gate de pago (Magon)

Guía para integrar el bloqueo por suscripción de Magon en cualquier proyecto **React**.

## Requisitos

- React 18 o superior (Next, Vite, CRA, Remix, etc.).
- Una **KEY de cliente** que te da Magon.
- Backend de Magon desplegado en `https://api-magonpayments.magonservices.cloud`.

## 1. Instalar

```bash
npm i https://github.com/gonzaloramireziti/magon-payments/releases/download/v1.1.0/magon-pay-react-1.1.0.tgz
```

## 2. Implementar

Envolvé la app (o solo la parte que querés bloquear) con `<MagonPayGate>`:

```tsx
import { MagonPayGate } from "magon-pay-react";

export default function App() {
  return (
    <MagonPayGate
      clientKey="magon_LA_KEY"
      apiBaseUrl="https://api-magonpayments.magonservices.cloud"
    >
      <TuApp />
    </MagonPayGate>
  );
}
```

Eso es todo. Si el cliente está al día ve `<TuApp />`; si debe o está vencido, aparece la pantalla de pago
y el contenido queda bloqueado hasta que pague.

> **Importante:** la verificación de la suscripción es **de fondo**. **Nunca** se muestra una pantalla de
> "Consultando suscripción" en cada recarga: la app se renderiza normal y el gate **solo aparece si la
> suscripción está efectivamente vencida**. La consulta corre en segundo plano y, mientras está bloqueado,
> se reintenta cada `pollIntervalMs`. No agregues pantallas de carga propias para esta verificación.

## 3. Props

| Prop | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `clientKey` | `string` | — | **Obligatoria**. KEY del cliente. |
| `apiBaseUrl` | `string` | `""` | URL del backend de Magon. Vacío = mismo origen. |
| `pollIntervalMs` | `number` | `15000` | Cada cuánto re-chequea el estado mientras está bloqueado. |
| `returnUrl` | `string` | página actual | A dónde vuelve GalioPay tras pagar. |
| `showLoadingScreen` | `boolean` | `false` | Si `true`, muestra pantalla de carga mientras consulta. Por defecto **no** (verifica de fondo). |
| `blockOnError` | `boolean` | `false` | Si `true`, bloquea cuando falla la consulta. Por defecto deja pasar (el backend igual protege). |
| `theme` | `object` | tema oscuro | Colores, radio, tipografía. |
| `labels` | `object` | español | Textos. |
| `logoSrc` | `string` | `https://magon.tech/assets/logos/logo.png` | URL de tu logo (PNG/SVG). |
| `logo` | `ReactNode` | — | Logo propio en JSX (prioridad sobre `logoSrc`). |
| `enforce` | `boolean` | `true` | `false` no bloquea (solo informa por `onStatusChange`). |
| `renderBlocked` | `(ctx) => ReactNode` | — | UI de bloqueo propia. |
| `renderLoading` | `() => ReactNode` | — | UI de carga propia. |
| `onStatusChange` | `(status) => void` | — | Callback con el estado actualizado. |

## 4. Comprobantes de pago

Lista las facturas pagas con botón para descargar el PDF:

```tsx
import { MagonReceipts } from "magon-pay-react";

<MagonReceipts
  clientKey="magon_LA_KEY"
  apiBaseUrl="https://api-magonpayments.magonservices.cloud"
/>
```

## 5. Personalización

```tsx
<MagonPayGate
  clientKey="magon_LA_KEY"
  apiBaseUrl="https://api-magonpayments.magonservices.cloud"
  logoSrc="/logo-magon.png"
  theme={{ primary: "#ffffff", background: "#08080b", surface: "#121216" }}
  labels={{ title: "Suscripción pendiente", payNow: "Pagar ahora" }}
>
  <TuApp />
</MagonPayGate>
```

Para tema claro, pasá `theme` con `background`, `surface`, `text`, `muted`, `border`, `primary`, `primaryText`.

Si no pasás `logoSrc` ni `logo`, se usa por defecto `https://magon.tech/assets/logos/logo.png`.

## 6. Next.js

El paquete ya incluye `"use client"`, así que podés importarlo directo. Si necesitás `useMagonSubscription`
en un archivo propio, agregá `"use client"` arriba.

```tsx
"use client";
import { MagonPayGate } from "magon-pay-react";
```

## 7. Notas

- **El bloqueo del componente es UX.** La protección real está en el backend de Magon
  (`requireActiveSubscription`). La `clientKey` viaja en el front: no es un secreto fuerte.
- El pago se abre en la pasarela de GalioPay y, al terminar, vuelve a la página actual
  (`returnUrl`). El estado se acredita por webhook y el gate lo detecta por polling.
- Facturación: el servicio de un mes vence el **10 del mes siguiente**; se bloquea desde el **11** si no está pago.

## 8. Actualizar versión

Cambiá la versión en la URL de instalación y reinstalá:

```bash
npm i https://github.com/gonzaloramireziti/magon-payments/releases/download/v1.1.0/magon-pay-react-1.1.0.tgz
```

## Problemas comunes

- **"Falta clientKey"**: no se pasó `clientKey` (o llegó vacío).
- **Error de CORS**: el backend de Magon debe permitir el origen de tu app (`CORS_ORIGINS`).
- **Sigue bloqueado tras pagar**: el webhook puede demorar unos segundos; el gate reintenta solo.
- **No aparece el bloqueo**: revisá que `clientKey` sea la correcta y `apiBaseUrl` apunte al backend.
