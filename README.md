# pi-scheduler

[![CI](https://github.com/MauricioPerera/pi-scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/MauricioPerera/pi-scheduler/actions/workflows/ci.yml)

Sistema de scheduling persistente para agentes de IA, inspirado en la filosofia de local-scheduler-mcp pero disenado nativamente para el ecosistema [pi](https://github.com/earendil-works/pi).

## Filosofia

Un agente de IA no deberia solo responder preguntas; deberia poder **asumir responsabilidades recurrentes en nombre del usuario**, de forma observable, reversible y segura.

## Estructura

```
pi-scheduler/
├── packages/
│   ├── scheduler-core/     # Motor de scheduling puro (zero dependencies)
│   ├── scheduler-ext/      # Extension pi-coding-agent (15 tools, slash command, subagent executor)
│   └── scheduler-daemon/   # Proceso standalone (daemon companion opcional)
├── scripts/
│   └── release.mjs         # Script de release coordinado
├── specs/                  # Especificaciones tecnicas
└── skills/                 # Templates de ejemplo (Playwright, scheduler)
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
| [`pi-scheduler-core`](packages/scheduler-core) | 0.3.3 | Motor puro, zero dependencies |
| [`pi-scheduler-ext`](packages/scheduler-ext) | 0.3.3 | Extension pi-coding-agent |
| [`pi-scheduler-daemon`](packages/scheduler-daemon) | 0.3.3 | Daemon standalone |

## Licencia

MIT
