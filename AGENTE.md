# Agente de tickets (Claude + GitHub)

Cómo se resuelve un ticket del tablero con Claude, de punta a punta.

## 1. Análisis: ¿directo o necesita decisión?

En el ticket → pestaña **Agente** → **Analizar con Claude**. Solo el responsable del ticket.

- **Con tu plan** (por defecto): copiás el prompt, lo pegás en claude.ai o Claude Code y pegás la
  respuesta de vuelta. No usa la API.
- **Con tu API key** (menú ▾): automático, se cobra en la key de Anthropic que cada uno carga en
  avatar → **Mis integraciones**. La suscripción de Claude no sirve para esto: la API se paga aparte.

Si quedan preguntas (negocio, técnicas o para el cliente), se responden ahí mismo y pasan a
**Decisiones tomadas**, que van en el prompt y quedan en la actividad del ticket.

## 2. Resolverlo en GitHub

En la misma pestaña → **Mandar a GitHub**: crea un issue en el repo del cliente con el prompt del
ticket (sin los datos de contacto del cliente) y menciona a `@claude`. La GitHub Action de Claude Code lo
trabaja con la suscripción de quien lo mandó:

- Si tiene dudas, las deja en el issue con el formato del análisis: al tocar **Actualizar** en el panel
  aparecen como preguntas del ticket. Al responderlas desde el panel se comentan en el issue y Claude sigue.
- Si no, pushea una rama `claude/issue-<n>-…`. El panel la muestra con un botón **Crear PR** (contra la
  rama por defecto del repo, con `Closes #<n>`).

### Puesta en marcha (una vez)

**Por usuario:**
1. Token de GitHub *fine-grained* con acceso a los repos de los clientes — permisos *Issues*,
   *Pull requests* y *Contents* (lectura y escritura) — en avatar → **Mis integraciones**.
2. En una terminal: `claude setup-token` (con la cuenta de tu suscripción). Genera el token para la Action.

**Por repo de cliente:**
1. Cargar el repo en el panel: Clientes → Editar → **Repositorios de GitHub** (`owner/nombre`).
2. Copiar [`agent/claude.yml`](agent/claude.yml) a `.github/workflows/claude.yml` y mergearlo en la rama por defecto.
3. Instalar la GitHub App de Claude en el repo: https://github.com/apps/claude (o desde Claude Code: `/install-github-app`).
4. En *Settings → Secrets and variables → Actions*, un secreto por persona: `CLAUDE_TOKEN_<USUARIO_DE_GITHUB>`
   con el token de `claude setup-token`. Así cada uno usa su plan. Opcional: `CLAUDE_CODE_OAUTH_TOKEN` como
   general para quien no tenga el suyo. Los nombres de secreto no admiten `-`: si tu usuario de GitHub lo
   tiene, usá el general.

Los tokens nunca se pegan en el panel ni en el chat: van solo en los secretos de GitHub.
