# Publicar e instalar `magon-pay-react`

Guía para publicar el paquete React del gate de suscripciones de Magon y consumirlo con `npm i`.

El paquete vive en `packages/react/` y solo depende de React (`peerDependency >=18`). Ya incluye la
directiva `"use client"` y su build (ESM + CJS + tipos) se genera automáticamente con el script `prepare`.

## Resumen de opciones

| Opción | Comando en el proyecto cliente | Requiere |
| --- | --- | --- |
| **A. Release tarball (recomendada)** | `npm i https://github.com/USER/REPO/releases/download/vX.Y.Z/magon-pay-react-X.Y.Z.tgz` | repo en GitHub + un Release |
| **B. Repo dedicado** | `npm i github:USER/magon-pay-react` | repo separado (se genera del monorepo) |
| **C. Registro npm** | `npm i magon-pay-react` | cuenta en npmjs.com |

---

## Versionado

Antes de publicar, subí la versión en `packages/react/package.json` (formato semver):

```json
{ "name": "magon-pay-react", "version": "1.0.0" }
```

---

## Opción A — GitHub Release (tarball listo)

El tarball ya viene compilado, así que el cliente no necesita compilar nada.

```bash
# 1. Subir el código
git add .
git commit -m "magon-pay-react v1.0.0"
git push

# 2. Generar el .tgz
npm run pack:react        # crea magon-pay-react-1.0.0.tgz en la raíz

# 3. Crear el Release y adjuntar el tarball (con GitHub CLI)
gh release create v1.0.0 magon-pay-react-1.0.0.tgz \
  --title "magon-pay-react v1.0.0" \
  --notes "Primera versión del gate de suscripciones Magon"
```

Sin `gh`: en GitHub → **Releases → Draft a new release** → tag `v1.0.0` → arrastrar
`magon-pay-react-1.0.0.tgz` → **Publish release**.

El cliente instala con la URL del asset:

```bash
npm i https://github.com/TU-USUARIO/magon-payments/releases/download/v1.0.0/magon-pay-react-1.0.0.tgz
```

> Para npm en Windows/PowerShell, la URL entre comillas dobles.

---

## Opción B — Repo dedicado con `git subtree`

Genera un repo propio para `packages/react` sin duplicar el código fuente. Al instalar, npm ejecuta
`prepare` y compila el paquete automáticamente.

```bash
# 1. Crear el repo vacío en GitHub: TU-USUARIO/magon-pay-react

# 2. Extraer la subcarpeta a una rama y empujarla
git subtree split --prefix=packages/react -b react-pkg
git remote add pkg git@github.com:TU-USUARIO/magon-pay-react.git
git push pkg react-pkg:main

# 3. (Recomendado) taguear una versión para instalaciones reproducibles
git tag -a v1.0.0 -m "magon-pay-react v1.0.0" react-pkg
git push pkg v1.0.0
```

El cliente instala:

```bash
npm i github:TU-USUARIO/magon-pay-react           # última versión de main
npm i github:TU-USUARIO/magon-pay-react#v1.0.0    # versión fija (recomendado)
```

Cada vez que cambies el paquete:

```bash
git subtree split --prefix=packages/react -b react-pkg   # re-genera
git push pkg react-pkg:main --force                      # actualiza main
```

---

## Opción C — Registro npm (público)

```bash
npm login
npm --workspace magon-pay-react publish --access public
```

El cliente instala:

```bash
npm i magon-pay-react
```

Para actualizar: subí la versión y volvé a publicar. También podés automatizar con un workflow
que corra `npm publish` al crear un tag `v*`.

---

## Verificar la publicación

```bash
# Opción C
npm view magon-pay-react version

# Cualquier opción: verificar resolución en el cliente
node -e "console.log(require.resolve('magon-pay-react'))"
```

Con TypeScript, los tipos salen de `dist/index.d.ts` (incluidos en el paquete).

---

## Integrar en el proyecto del cliente

```tsx
import { MagonPayGate } from "magon-pay-react";

export default function App() {
  return (
    <MagonPayGate
      clientKey="magon_LA_KEY"              // KEY del cliente (definida por Magon)
      apiBaseUrl="https://pay.magon.com"    // backend de Magon
      pollIntervalMs={15000}
      theme={{ primary: "#6d28d9" }}
    >
      <TuApp />
    </MagonPayGate>
  );
}
```

Instrucción lista para una IA:

```
Integrá el gate de suscripciones de Magon:
1. Instalá el paquete (`npm i magon-pay-react` o la URL del tarball/`github:`).
2. Envolvé el componente raíz:
   import { MagonPayGate } from "magon-pay-react";
   <MagonPayGate clientKey="AQUI_LA_KEY" apiBaseUrl="https://pay.magon.com"><App /></MagonPayGate>
3. No agregues estilos ni dependencias: el gate trae su UI y se bloquea solo.
```

---

## Notas

- El paquete es UI: **no reemplaza** la validación server-side. La protección real está en el backend
  (`requireActiveSubscription`). La `clientKey` viaja en el front, no es un secreto fuerte.
- Si usás la Opción B/C, no hace falta commitear `dist/`: se genera con `prepare`/`prepack`.
- Para la Opción A, el `.tgz` se genera con `npm run pack:react` y **no** se versiona en git (está en `.gitignore`).