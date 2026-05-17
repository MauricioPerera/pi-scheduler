# pi-scheduler

Sistema de scheduling persistente para agentes de IA, inspirado en la filosofia de local-scheduler-mcp pero disenado nativamente para el ecosistema [pi](https://github.com/earendil-works/pi).

## Filosofia

Un agente de IA no deberia solo responder preguntas; deberia poder **asumir responsabilidades recurrentes en nombre del usuario**, de forma observable, reversible y segura.

## Estructura

```
pi-scheduler/
├── packages/
│   ├── scheduler-core/     # Motor de scheduling puro (zero deps opcionales)
│   ├── scheduler-ext/      # Extension pi-coding-agent (TUI, comandos slash, eventos)
│   └── scheduler-daemon/   # Proceso standalone (daemon companion opcional)
├── specs/                  # Especificaciones tecnicas
└── skills/                 # Ejemplo de skill-template
```

## Diferencias con local-scheduler-mcp

| Aspecto | local-scheduler-mcp | pi-scheduler |
|---|---|---|
| Transporte | MCP stdio | Directo (AgentTool, EventBus) |
| Notificaciones | JSONL + webhook + loggingMessage | AgentEvent + ExtensionUIContext.notify() |
| Templates | JSON en disco | Skills de pi (SKILL.md + frontmatter) |
| Persistencia | Map en memoria + JSON atomico | Igual, pero adaptado a lifecycle de sesion pi |
| Proceso | Servidor MCP standalone | Subsistema del runtime pi (o daemon companion opcional) |

## Paquetes

| Paquete | Version | Descripcion |
|---|---|---|
| [`pi-scheduler-core`](packages/scheduler-core) | 0.2.6 | Motor puro, zero dependencies |
| [`pi-scheduler-ext`](packages/scheduler-ext) | 0.2.3 | Extension pi-coding-agent |
| [`pi-scheduler-daemon`](packages/scheduler-daemon) | 0.2.4 | Daemon standalone |

## Licencia

MIT
