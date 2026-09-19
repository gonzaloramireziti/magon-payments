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
| `theme` | `MagonPayTheme` | — | Colores, radio y tipografía |
| `labels` | `Partial<MagonPayLabels>` | — | Textos |
| `enforce` | `boolean` | `true` | `false` no bloquea (solo informa por `onStatusChange`) |
| `renderBlocked` | `(ctx) => ReactNode` | — | UI de bloqueo propia |
| `renderLoading` | `() => ReactNode` | — | UI de carga propia |
| `onStatusChange` | `(status) => void` | — | Callback con el estado |

### Hook y componentes

```tsx
import {
  useMagonSubscription,
  PaymentBlockedScreen,
  type MagonSubscriptionStatus,
} from "magon-pay-react";
```

### Tema y textos

```tsx
<MagonPayGate
  clientKey="magon_xxx"
  apiBaseUrl="https://pay.magon.com"
  theme={{ primary: "#0d9488", background: "#0b0b0f", text: "#f8fafc", surface: "#111827" }}
  labels={{ title: "Pago pendiente", payNow: "Transferir" }}
>
  <TuApp />
</MagonPayGate>
```

## Nota de seguridad

El bloqueo del componente es UX. La protección real debe hacerse en el backend de Magon
(validación server-side). La `clientKey` viaja en el front: no es un secreto fuerte.
