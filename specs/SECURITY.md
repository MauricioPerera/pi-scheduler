# Modelo de Seguridad

## Filosofia

Confianza con guardarrailes. El sistema asume que el usuario es legitimo pero puede ser impreciso, y que el LLM puede generar comandos peligrosos por error.

No es un sandbox completo (no hay containers, seccomp, ni aislamiento de proceso). En su lugar, previene los accidentes obvios mediante capas progresivas de validacion.

## Cinco Capas de Seguridad

### 1. Blocklist de Comandos

Patrones peligrosos bloqueados en command:

`
rm -rf /
rm -rf /*
rm -rf ~
del /f /s /q
rmdir /s /q
format
diskpart
mkfs
curl ... | sh
wget ... | sh
| bash
| cmd
| powershell
shutdown /s
shutdown -h
reg delete
`

Implementacion: alidateCommand(command) hace .toLowerCase().includes() contra la lista de patrones.

### 2. Blocklist de Scripts

Patrones peligrosos en scripts inline (JS, Python, PowerShell):

`
rm -rf /
rm -rf /*
format
diskpart
mkfs
Remove-Item -Recurse -Force C:
Format-Volume
Clear-Disk
Remove-Computer
fs.rmdirSync
os.system
shutil.rmtree
subprocess.call
dd if=/dev/zero
`

Implementacion: alidateScript(script, scriptType).

### 3. Allowlist de Directorios (CWD)

Solo los siguientes directorios y sus subdirectorios estan permitidos como cwd:

- Directorio home del usuario
- ~/.pi (o $CODEX_HOME/.codex si aplica)
- C:/temp
- C:/tmp
- Directorios adicionales via SCHEDULER_ALLOWED_DIRS (semicolon-separated)

Implementacion: alidateCwd(cwd) hace path.resolve() + startsWith() contra la allowlist.

### 4. Hardening de Interpolacion

Los valores pasados a ${key} en templates deben coincidir con:

`egex
^[a-zA-Z0-9_\\-/: .~]+$
`

Caracteres rechazados:
- Metacaracteres shell: ;, |, &, $, `  `, ', "
- Control: \n, \r, \t
- Escapes: \\

Implementacion: alidateInterpolationValue(v) con regex whitelist.

### 5. Parametros Requeridos

Los templates pueden declarar equiredParams. Si falta alguno, se retorna error antes de ejecutar nada. No se envia ${key} literal al shell.

`	ypescript
const template = {
  id: 'deploy-app',
  command: 'cd  && npm run deploy',
  requiredParams: ['repoPath']
};

// Esto falla ANTES de ejecutar:
scheduler.instantiateTemplate('deploy-app', { params: {} });
// Error: Missing required params: repoPath
`

## Validacion de Tasks

`	ypescript
function validateTask(args: TaskArgs): ValidationResult {
  const cmdResult = validateCommand(args.command);
  if (!cmdResult.ok) return cmdResult;
  const scriptResult = validateScript(args.script, args.scriptType);
  if (!scriptResult.ok) return scriptResult;
  const cwdResult = validateCwd(args.cwd);
  if (!cwdResult.ok) return cwdResult;
  return { ok: true };
}
`

## Timeout y Control de Procesos

- Ejecuciones de automation: timeout 120s.
- Ejecuciones de task: timeout configurable, default 300s (5 min).
- AbortSignal: si el usuario cancela o la sesion muere, los procesos hijos se matan via AbortController.

## Encriptacion (Futuro / Opcional)

Si las automations contienen credenciales (API keys, tokens), el estado en disco puede encriptarse usando AES-GCM. Esto NO esta en el core inicial; se anade como capa de adapter si se necesita.

`	ypescript
// Concepto futuro
const scheduler = Scheduler.create({
  dataDir: '~/.pi/scheduler',
  encryption: {
    password: process.env.SCHEDULER_ENCRYPTION_KEY,
    salt: 'pi-scheduler-v1'
  }
});
`

## Reglas para Desarrolladores de Extensiones

- NUNCA ejecutar val() sobre output del LLM.
- NUNCA pasar strings de usuario directamente a child_process sin validar.
- Siempre usar path.resolve() antes de comparar paths.
- Las notificaciones NUNCA deben incluir stdout completo si contiene secretos. Filtrar via regex antes de persistir.
