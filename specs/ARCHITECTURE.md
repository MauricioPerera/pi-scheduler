# Arquitectura del Sistema

## Diagrama de Componentes

`
+-------------------+     +-------------------+
|  pi-coding-agent  |     |   Otras apps      |
|   (TUI / CLI)     |     |   (CLI scripts)   |
+---------+---------+     +---------+---------+
          |                         |
          v                         v
+-------------------+     +-------------------+
|  scheduler-ext    |     |  scheduler-core   |
|  (Extension pi)   |     |  (Motor puro)     |
|                   |     |                   |
|  - Comandos slash |     |  - Tick loop      |
|  - Tools (AgentTool)|   |  - Persistence    |
|  - Event handlers |     |  - Security       |
|  - UI notify()    |     |  - Templates      |
|  - Skills loader  |     |  - Notifications  |
+---------+---------+     +---------+---------+
          |                         |
          +-----------+-------------+
                      |
                      v
            +-------------------+
            |   File System     |
            |   ~/.pi/scheduler/|
            +-------------------+
`

## scheduler-core

### Modulos

`
src/
├── index.ts              # Public API
├── types.ts              # Interfaces y tipos
├── store.ts              # DocStore (Map + atomic write)
├── tick.ts               # Tick loop (setInterval)
├── executor.ts           # Exec de comandos/scripts
├── security.ts           # Validacion de comandos, scripts, cwd
├── templates.ts          # Built-in templates + interpolacion
├── notifications.ts      # JSONL append-only + ack
└── utils.ts              # Helpers (atomicWrite, generateId, etc.)
`

### Ciclo de Vida

1. **Inicializacion**: Scheduler.create(options) lee estado de disco, carga templates, inicia tick loop.
2. **Tick** (cada 30s): Itera automations, ejecuta las vencidas via child_process, guarda logs, emite notificaciones.
3. **Ejecucion de task**: unTask() crea un proceso hijo, trackea estado, guarda resultado.
4. **Shutdown**: scheduler.stop() detiene el tick loop, hace lush() de estado.

### Persistencia

- utomations.json: Array de Automation. Atomic write via .tmp + enameSync.
- 	asks.json: Array de Task. Mismo patron atomico.
- 
otifications.jsonl: Append-only log. Rota a >512KB manteniendo ultimas 250 lineas.
- config.json: Webhook URL y settings.
- 	emplates.json: Custom template overrides (opcional).

### Estado en Memoria

`	ypescript
interface SchedulerState {
  automations: Map<string, Automation>;  // O(1) lookup
  tasks: Map<string, Task>;              // O(1) lookup
  config: SchedulerConfig;
  lastAck: number;                       // Timestamp ultimo ack de notificaciones
}
`

No hay indices complejos. Con <100 automations y <1000 tasks, un Map es optimo.

### Concurrencia

- El tick loop corre en el mismo event loop. No usa worker_threads.
- Cada ejecucion de comando usa child_process (proceso separado del OS).
- El estado se bloquea implicitamente porque Node.js es single-threaded. Las operaciones son sincronicas en memoria + async en disco (atomic write).

## scheduler-ext

### Modulos

`
src/
├── index.ts              # Entry point de la extension
├── extension.ts          # ExtensionFactory y registro
├── tools.ts              # AgentTool definitions para pi
├── commands.ts           # Comandos slash (/scheduler list, /scheduler delete)
├── notifications-ui.ts   # Conexion de notificaciones a ExtensionUIContext
├── skill-loader.ts       # Carga templates como skills de pi
└── types.ts              # Tipos especificos de la extension
`

### Registro en pi

`	ypescript
// En la extension
export const schedulerExtension: ExtensionFactory = (ctx) => {
  const scheduler = Scheduler.create({ dataDir: ctx.agentDir + '/scheduler' });

  ctx.registerTool(createAutomationTool(scheduler));
  ctx.registerTool(runTaskTool(scheduler));
  ctx.registerTool(listAutomationsTool(scheduler));
  // ... etc

  ctx.registerCommand({
    name: '/scheduler',
    description: 'Manage scheduled automations',
    handler: schedulerCommandHandler(scheduler, ctx.ui),
  });

  ctx.on('session_start', () => {
    scheduler.start();
  });

  ctx.on('session_shutdown', () => {
    scheduler.stop();
  });
};
`

### Integracion con Skills

Los templates se definen como skills de pi en ~/.pi/agent/skills/scheduler-templates/:

`markdown
---
name: scheduler-templates
description: Templates predefinidos para automatizaciones recurrentes
---

## Templates

### build-project
- **Comando**: dotnet build
- **Intervalo**: 60 min
- **Uso**: Compilar proyectos .NET periodicamente

### disk-check
- **Comando**: Get-PSDrive C | Select-Object Used,Free
- **Intervalo**: 5 min
- **Uso**: Monitorear espacio en disco

### git-sync
- **Comando**: git pull
- **Intervalo**: 30 min
- **Uso**: Mantener repo sincronizado
`

La extension parsea este skill en tiempo de carga y registra los templates en el scheduler core.

## Flujo de Datos

### Crear una automation

`
Usuario: "Compila este proyecto cada hora"
        |
        v
Agente pi (LLM) -> llama a tool create_automation
        |
        v
scheduler-ext -> valida args -> llama a scheduler-core
        |
        v
scheduler-core -> security.validateTask() -> store.addAutomation() -> atomicWrite()
        |
        v
scheduler-core -> notifica: "Automation creada: {id}"
        |
        v
scheduler-ext -> ctx.ui.notify() -> renderiza en TUI
`

### Tick de ejecucion

`
scheduler-core tick loop (cada 30s)
        |
        v
Chequea automations con nextRun <= now
        |
        v
Para cada automation vencida:
  - Actualiza nextRun
  - Ejecuta comando via child_process
  - Recibe stdout/stderr/exitCode
  - Guarda log
  - Crea notificacion (append a JSONL)
        |
        v
scheduler-ext (si esta activa) -> ctx.ui.notify()
Webhook (si configurado) -> POST HTTP
`

## Escalabilidad Futura (Opcional)

### Capa de Analytics

Si en algun momento se necesitan queries complejas sobre miles de ejecuciones historicas:

`
scheduler-core (estado operativo)  -->  scheduler-analytics (js-doc-store)
         |                                        |
    automaciones activas                    logs historicos
    tasks actuales                          indices en automationId, timestamp
    notificaciones JSONL                    aggregation pipeline
`

El core sigue siendo simple. La capa analytics es opcional y solo se activa si el usuario lo solicita.

### Daemon Companion

Si se necesita que las automaciones sigan corriendo despues de cerrar pi:

`
pi-coding-agent (TUI cerrada)
        |
        v
pi-scheduler-daemon (proceso Node.js separado)
        |
        v
Lee ~/.pi/scheduler/automations.json
Ejecuta tick loop independiente
Escribe notificaciones a JSONL
        |
        v
Cuando pi se reinicia -> lee notificaciones pendientes
`

El daemon seria un wrapper thin alrededor de scheduler-core que corre como proceso de fondo.
