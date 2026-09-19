# magon-pay-react

Gate de suscripciones de **Magon** para React. Bloquea el contenido hasta que el cliente pague.
Sin dependencias: solo React + `fetch`.

## Instalar

```bash
npm i magon-pay-react
```

## Usar

```tsx
import { MagonPayGate } from "magon-pay-react";

export default function App() {
  return (
    <MagonPayGate
      clientKey="magon_xxxxxxxx"          // KEY que te da Magon
      apiBaseUrl="https://pay.magon.com"  // backend de Magon
    >
      <TuApp />
    </MagonPayGate>
  );
}
```

Si el backend corre en el mismo dominio, omití `apiBaseUrl`.

### Props

| Prop | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `clientKey` | `string` | — | KEY del cliente (obligatoria) |
| `apiBaseUrl` | `string` | `""` | URL del backend Magon (vacío = mismo origen) |
| `pollIntervalMs` | `number` | `15000` | Re-chequeo del estado mientras está bloqueado |
| `theme` | `MagonPayTheme` | — | Colores, radio y tipografía (tema **oscuro** por defecto) |
| `labels` | `Partial<MagonPayLabels>` | — | Textos |
| `logoSrc` | `string` | — | URL del logo (PNG/SVG). Si no se pasa, usa el logo Magon SVG incluido |
| `logo` | `ReactNode` | — | Logo propio (JSX/SVG), tiene prioridad sobre `logoSrc` |
| `logoAlt` | `string` | `"Magon"` | Texto alternativo del logo |
| `enforce` | `boolean` | `true` | `false` no bloquea (solo informa por `onStatusChange`) |
| `renderBlocked` | `(ctx) => ReactNode` | — | UI de bloqueo propia |
| `renderLoading` | `() => ReactNode` | — | UI de carga propia |
| `onStatusChange` | `(status) => void` | — | Callback con el estado |

### Hook y componentes

```tsx
import {
  useMagonSubscription,
  PaymentBlockedScreen,
  MagonLogo,
  MagonReceipts,
  type MagonSubscriptionStatus,
} from "magon-pay-react";
```

### Comprobantes de pago

```tsx
import { MagonReceipts } from "magon-pay-react";

<MagonReceipts clientKey="magon_xxx" apiBaseUrl="https://pay.magon.com" />
```

Lista las facturas pagas con un botón para descargar el comprobante PDF (lo genera el backend).

### Logo

Por defecto usa un logo **Magon** SVG (blanco, pensado para fondo oscuro). Para usar tu archivo exacto:

```tsx
<MagonPayGate clientKey="magon_xxx" apiBaseUrl="https://pay.magon.com" logoSrc="/logo-magon.png">
  <TuApp />
</MagonPayGate>
```

También podés pasar un SVG/JSX propio:

```tsx
<MagonPayGate clientKey="magon_xxx" logo={<MiLogo />}>
  <TuApp />
</MagonPayGate>
```

Se exporta `MagonLogo` por si querés reutilizarlo:

```tsx
import { MagonLogo } from "magon-pay-react";
<MagonLogo size={64} color="#ffffff" />
```

### Tema y textos

El tema por defecto es oscuro. Para forzar uno claro:

```tsx
<MagonPayGate
  clientKey="magon_xxx"
  apiBaseUrl="https://pay.magon.com"
  theme={{ background: "#f8fafc", surface: "#ffffff", text: "#0f172a", muted: "#64748b", border: "#e2e8f0", primary: "#6d28d9", primaryText: "#ffffff" }}
  labels={{ title: "Pago pendiente", payNow: "Transferir" }}
>
  <TuApp />
</MagonPayGate>
```

## Nota de seguridad

El bloqueo del componente es UX. La protección real debe hacerse en el backend de Magon
(validación server-side). La `clientKey` viaja en el front: no es un secreto fuerte.
