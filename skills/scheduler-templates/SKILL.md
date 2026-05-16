---
name: scheduler-templates
description: Templates predefinidos para automatizaciones recurrentes en pi-scheduler
---

# Scheduler Templates

Templates que el agente puede instanciar para crear automatizaciones recurrentes rapidamente.

## build-project

- **Comando**: `dotnet build`
- **Intervalo**: 60 min
- **Params**: `repoPath` (opcional)
- **Uso**: Compilar proyectos .NET periodicamente

## disk-check

- **Comando**: `Get-PSDrive C | Select-Object Used,Free`
- **Intervalo**: 5 min
- **Uso**: Monitorear espacio en disco

## git-sync

- **Comando**: `git pull`
- **Intervalo**: 30 min
- **Params**: `repoPath` (opcional)
- **Uso**: Mantener repo sincronizado

## npm-test

- **Comando**: `npm test`
- **Intervalo**: 30 min
- **Params**: `repoPath` (opcional)
- **Uso**: Ejecutar tests periodicamente

## backup-logs

```javascript
const fs = require('fs');
const path = require('path');
const srcDir = process.env.LOG_DIR || 'C:/temp/logs';
const backupDir = process.env.BACKUP_DIR || 'C:/temp/backups';
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.log'));
for (const f of files) {
  const src = path.join(srcDir, f);
  const dest = path.join(backupDir, `${Date.now()}-${f}`);
  fs.copyFileSync(src, dest);
  console.log(`Backed up: ${f} -> ${dest}`);
}
console.log(`Backed up ${files.length} files`);
```

- **Intervalo**: 120 min
- **Uso**: Backup periodico de archivos .log

## health-check

```powershell
$cpu = (Get-Counter '\Processor(_Total)\\% Processor Time').CounterSamples.CookedValue
$mem = Get-CimInstance Win32_OperatingSystem | Select-Object @{N='Free';E={[math]::Round($_.FreePhysicalMemory/1MB,2)}},@{N='Total';E={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}}
Write-Output "CPU: $([math]::Round($cpu,2))% | Memory: $($mem.Free)MB / $($mem.Total)MB"
```

- **Intervalo**: 10 min
- **Uso**: Monitoreo basico de CPU y memoria
