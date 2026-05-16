# Filosofia de Diseno

## Vision

Un agente de IA no deberia ser solo reactivo. Debe poder **asumir responsabilidades recurrentes** en nombre del usuario, con la misma confianza con la que un humano delega una tarea a un asistente confiable.

El scheduler no es un cron job. Es un **sistema de intencion persistente**.

## Principios

### 1. Persistencia sin Daemonizacion

Las intenciones del usuario sobreviven al proceso, pero no requieren privilegios de sistema ni un servicio residente. El estado se guarda en archivos JSON atomicos (Map + tomicWrite) que cualquier instancia del agente puede leer al reiniciar.

### 2. Observabilidad por Defecto

Toda ejecucion genera una notificacion. No hay ejecucion silenciosa. Las notificaciones son:
- **Append-only** (JSONL con rotacion automatica)
- **Multicanal** (eventos del agente, UI, webhook opcional)
- **Acknowledgeable** (el usuario marca hasta donde ya leyo)

### 3. Templates como Limitacion Creativa

Los templates no son atajos. Son **vocabulario compartido** entre el usuario y el agente. Cuando el usuario dice "checa el disco", el agente no inventa un comando; mapea a una intencion conocida con parametros validados.

### 4. Seguridad en Capas con Degradacion Elegante

No es un sandbox completo (eso romperia la utilidad local). Es una **red de guardarrailes progresivos**:
1. Blocklist de comandos peligrosos
2. Blocklist de patrones en scripts
3. Allowlist de directorios de trabajo
4. Whitelist de caracteres en interpolacion de templates
5. Validacion de parametros requeridos

### 5. Dualidad de Tiempo

- **One-shot** (un_task): "Haz esto y avisame cuando termines." Trabajo pesado, asincronico, finito.
- **Recurring** (create_automation): "Haz esto siempre." Responsabilidad delegada, el scheduler es el ejecutor.

### 6. Agnosticismo de Runtime

El core (scheduler-core) no conoce a pi, MCP, ni a ningun framework. Es un motor TypeScript puro. La integracion con pi (scheduler-ext) es una capa thin que traduce eventos y expone tools/comandos.

### 7. Simplicidad Radical

"Los datos son simples, la logica es simple, no compliques la infraestructura."

No SQLite, no LevelDB, no js-doc-store en el core. Un Map, un SetInterval, y JSON en disco son suficientes para el problema.

## Diferencias con local-scheduler-mcp

| local-scheduler-mcp | pi-scheduler |
|---|---|
| Proceso MCP standalone | Subsistema del runtime pi (o daemon companion) |
| Notificaciones via JSONL + webhook + MCP logging | AgentEvent + ExtensionUIContext |
| Templates JSON en disco | Skills de pi (Markdown + frontmatter) |
| Validacion Zod en server.js | Validacion typebox en AgentTool schema |
| Zod schemas | Type.Object de typebox |
| Tick loop en proceso separado | Tick loop en el mismo event loop (con cuidado de no bloquear) |

## Decisiones Arquitectonicas

### Por que no js-doc-store en el core

El estado del scheduler es pequeno y plano:
- Decenas de automations
- Cientos de notificaciones (con rotacion)
- Unos pocos tasks one-shot

Un Map de JavaScript es la estructura correcta. Agregar una base de datos documental seria over-engineering. Ver specs/ARCHITECTURE.md#persistencia.

### Por que no MCP

MCP es un protocolo de interproceso. En pi, las tools viven en el mismo proceso. No necesitamos JSON-RPC ni stdio transport. Las tools se registran directamente en el Agent via AgentTool con schemas de typebox.

### Por que dos paquetes

Separacion de poderes:
- **core**: Tiene el poder de ejecucion (exec, fs, timers). Es el "hacer".
- **ext**: Tiene el poder de decision y UI. Es el "saber y mostrar".

Esto permite que el core se testee sin instanciar pi, y que la extension se reemplace si la API de pi cambia.
