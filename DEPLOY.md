# Deploy en Vercel

Guía para publicar el backend en `https://pay.magon.com` con Vercel + Supabase.

## Arquitectura

```
App del cliente (React / magon-pay-react)
        │  fetch
        ▼
pay.magon.com  (este proyecto Next.js en Vercel)
        │  service role
        ▼
Supabase (Postgres)

GalioPay ──► pay.magon.com/api/webhooks/galiopay ──► Supabase
```

Vercel corre el backend y el dominio `pay.magon.com` apunta ahí. Supabase sólo guarda datos.

## 1. Supabase

1. Crear proyecto en [supabase.com](https://supabase.com).
2. SQL Editor → pegar y ejecutar `supabase/schema.sql`.
3. Anotar de **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`

> La `service_role` va **sólo** en Vercel (servidor). Nunca en el navegador.

## 2. Subir el código a GitHub

```bash
git init
git add .
git commit -m "Magon payments"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/magon-payments.git
git push -u origin main
```

`.env.local` está en `.gitignore`, así que las claves no se suben.

## 3. Importar en Vercel

1. [vercel.com/new](https://vercel.com/new) → *Import Git Repository* → elegir el repo.
2. Framework: **Next.js** (detectado).
3. **No** deployar todavía: primero cargar las variables de entorno.
4. `vercel.json` ya define `buildCommand: npm run build`, que compila el paquete `magon-pay-react` antes de Next.

## 4. Variables de entorno en Vercel

*Settings → Environment Variables* (entorno **Production**, y también Preview si querés):

| Variable | Valor | Secreto |
| --- | --- | --- |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | no |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | **sí** |
| `NEXT_PUBLIC_APP_URL` | `https://pay.magon.com` | no (build) |
| `NEXT_PUBLIC_API_BASE_URL` | `https://pay.magon.com` | no (build) |
| `CORS_ORIGINS` | `*` (o lista separada por coma, p.ej. `https://app.cliente.com,http://localhost:5173`) | no |
| `GALIOPAY_MODE` | `live` (o `mock` para probar) | no |
| `GALIOPAY_API_BASE_URL` | `https://pay.galio.app/api` | no |
| `GALIOPAY_CREATE_PAYMENT_PATH` | `/payment-links` | no |
| `GALIOPAY_CLIENT_ID` | `1772123694780-2d0317b887d70818` | no |
| `GALIOPAY_API_KEY` | `d9c9...` | **sí** |
| `GALIOPAY_AUTH_MODE` | `bearer` (GalioPay: Bearer + `x-client-id`) | no |
| `GALIOPAY_SANDBOX` | `true` para probar, `false` en producción | no |
| `GALIOPAY_WEBHOOK_SECRET` | secreto HMAC de webhook de GalioPay | **sí** |
| `GALIOPAY_WEBHOOK_TOKEN` | token compartido (alternativa) | **sí** |
| `GALIOPAY_CURRENCY` | `ARS` | no |
| `SUBSCRIPTION_DUE_DAY` | `10` | no |
| `SUBSCRIPTION_TIMEZONE` | `America/Argentina/Buenos_Aires` | no |
| `ADMIN_API_KEY` | clave larga aleatoria | **sí** |
| `CRON_SECRET` | clave larga aleatoria | **sí** |

Importante: las `NEXT_PUBLIC_*` se **congelan en el build**. Si las cambiás, hacé *Redeploy*.

## 5. Dominio `pay.magon.com`

1. Vercel → *Settings → Domains* → *Add* → `pay.magon.com`.
2. En el DNS de `magon.com` (donde compraste el dominio) crear:
   - Tipo: `CNAME`
   - Nombre: `pay`
   - Valor: `cname.vercel-dns.com`
   - (Alternativa: `A` → `76.76.21.21`)
3. Esperar la propagación (Vercel emite el certificado HTTPS solo).

Deployar desde Vercel (*Deployments → Redeploy*) una vez cargadas las variables.

## 6. Webhook en GalioPay

Configurar la URL de notificación:

```
https://pay.magon.com/api/webhooks/galiopay
```

- GalioPay firma con HMAC-SHA256 opcional: activala en tu cuenta y cargá el secreto en
  `GALIOPAY_WEBHOOK_SECRET`. El backend valida `X-GalioPay-Signature: v1=...` calculando
  `HMAC_SHA256(timestamp + "." + rawBody)` con `X-GalioPay-Timestamp` (tolerancia 300 s).
- Alternativa: `GALIOPAY_WEBHOOK_TOKEN` (se acepta en `x-galiopay-token`, `Authorization: Bearer`, o `?token=`).
- Idempotencia: se usa `X-GalioPay-Event-Id` (fallback: id + status + fecha del pago).
- En modo `live`, si no configurás ninguno, el webhook se **rechaza** (401) por seguridad.

## 7. Verificar el deploy

```bash
# Estado de suscripción (cliente demo del schema)
curl "https://pay.magon.com/api/subscription/status?key=magon-demo-key"

# Crear un cliente real y obtener su KEY
curl -X POST https://pay.magon.com/api/admin/clients \
  -H "content-type: application/json" \
  -H "x-admin-key: TU_ADMIN_API_KEY" \
  -d '{"name":"Cliente SRL","email":"pagos@cliente.com","monthlyAmount":15000,"currency":"ARS"}'

# Cron manual (Vercel Cron lo llama solo todos los días a las 12:00 UTC)
curl -H "Authorization: Bearer TU_CRON_SECRET" https://pay.magon.com/api/cron/invoices
```

## 8. Cron

`vercel.json` ya registra:

```json
{ "crons": [{ "path": "/api/cron/invoices", "schedule": "0 12 * * *" }] }
```

Vercel envía automáticamente `Authorization: Bearer $CRON_SECRET` a esa ruta. Genera las facturas del
período para todos los clientes activos y marca las vencidas. Es idempotente.

> En plan **Hobby** el cron corre máximo **1 vez por día** (suficiente).

## 9. Integrar el front del cliente

En el proyecto del cliente:

```bash
npm i magon-pay-react        # o npm i ./magon-pay-react-1.0.0.tgz
```

```tsx
import { MagonPayGate } from "magon-pay-react";

<MagonPayGate clientKey="magon_LA_KEY" apiBaseUrl="https://pay.magon.com">
  <App />
</MagonPayGate>
```

## Checklist

- [ ] `supabase/schema.sql` ejecutado
- [ ] Repo en GitHub sin `.env.local`
- [ ] Variables cargadas en Vercel (Production)
- [ ] `pay.magon.com` con CNAME a Vercel y HTTPS activo
- [ ] `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_API_BASE_URL` = `https://pay.magon.com` + Redeploy
- [ ] Webhook de GalioPay apuntando a `/api/webhooks/galiopay`
- [ ] `GALIOPAY_MODE=live` y `GALIOPAY_SANDBOX=false` en producción
- [ ] `/api/cron/invoices` responde OK con el `CRON_SECRET`
- [ ] Cliente de prueba bloqueado antes del pago y desbloqueado después del webhook `approved`