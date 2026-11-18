<#
  Liquid SKd para Windows: Soulseek + Liquid en tu propia PC.

  Uso (o doble clic en «Liquid SKd.cmd», que abre el menú):
    skd.ps1 instalar      Instala o repara todo. Se puede repetir: no borra tu música ni cambia tu clave.
    skd.ps1 estado        ¿Está en marcha? ¿Soulseek conectado? Dirección y canciones en caché.
    skd.ps1 clave         Copia la clave al portapapeles y muestra la dirección (para pegarlas en Liquid).
    skd.ps1 reiniciar     Reinicia slskd y el puente.
    skd.ps1 registros     Abre la carpeta de registros (si algo falla, mira ahí).
    skd.ps1 desinstalar   Quita el arranque automático y el túnel. Pregunta antes de borrar la música.
    skd.ps1 servicio      (Interno) Lo que corre en segundo plano: mantiene vivos slskd y el puente.

  Qué instala, todo en %LOCALAPPDATA%\LiquidSKd (sin permisos de administrador salvo para instalar Node o Tailscale):
    slskd\      Soulseek sin ventana (https://github.com/slskd/slskd)
    puente\     El puente de Liquid (server.mjs): lo único que habla con Liquid, con tu clave
    musica\     Caché: lo que bajes de Soulseek. Lo que lleve 24 h sin sonar se borra y vuelve a bajar al tocarlo
    datos\      Memoria de canciones (Liquid nunca las pierde aunque se borre el archivo)
  Y una dirección https fija y gratis con Tailscale Funnel: sin abrir puertos del router ni comprar dominio.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('menu', 'instalar', 'estado', 'clave', 'reiniciar', 'registros', 'desinstalar', 'servicio')]
  [string]$Accion = 'menu',
  # Sin Tailscale: Liquid solo podrá usar SKd desde esta misma PC (http://localhost)
  [switch]$SinTunel,
  # Carpeta de la instalación (para pruebas)
  [string]$Carpeta = (Join-Path $env:LOCALAPPDATA 'LiquidSKd')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest va 10 veces más rápido sin barra
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

$PUERTO = 8787
$PUERTO_SLSKD = 5030
$PUERTO_SOULSEEK = 50300
$TAREA = 'Liquid SKd'
$ORIGENES = 'https://lukoffmon.github.io'

$Rutas = @{
  Raiz       = $Carpeta
  Slskd      = Join-Path $Carpeta 'slskd'
  SlskdExe   = Join-Path $Carpeta 'slskd\slskd.exe'
  SlskdYml   = Join-Path $Carpeta 'slskd\slskd.yml'
  Puente     = Join-Path $Carpeta 'puente'
  Server     = Join-Path $Carpeta 'puente\server.mjs'
  Musica     = Join-Path $Carpeta 'musica'
  Incompleto = Join-Path $Carpeta 'incompleto'
  Datos      = Join-Path $Carpeta 'datos'
  Registros  = Join-Path $Carpeta 'registros'
  Config     = Join-Path $Carpeta 'config.json'
  Script     = Join-Path $Carpeta 'skd.ps1'
}

# ---------------------------------------------------------------- utilidades
function Escribir([string]$texto, [string]$color = 'Gray') { Write-Host $texto -ForegroundColor $color }
function Paso([string]$texto) { Write-Host ''; Write-Host "» $texto" -ForegroundColor Cyan }
function Bien([string]$texto) { Write-Host "  ✓ $texto" -ForegroundColor Green }
function Aviso([string]$texto) { Write-Host "  ! $texto" -ForegroundColor Yellow }
function Fallo([string]$texto) { Write-Host "  ✗ $texto" -ForegroundColor Red }

function Preguntar([string]$texto, [bool]$porDefecto = $true) {
  $opciones = if ($porDefecto) { '[S/n]' } else { '[s/N]' }
  $r = Read-Host "  $texto $opciones"
  if ([string]::IsNullOrWhiteSpace($r)) { return $porDefecto }
  return $r.Trim().ToLower().StartsWith('s')
}

# Clave aleatoria segura, apta para URL
function Nueva-Clave([int]$bytes = 30) {
  $buf = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  return ([Convert]::ToBase64String($buf)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# UTF-8 sin BOM (slskd y Node no quieren BOM)
function Guardar-Texto([string]$ruta, [string]$texto) {
  $dir = Split-Path $ruta -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($ruta, $texto, (New-Object System.Text.UTF8Encoding $false))
}

function Leer-Config {
  if (-not (Test-Path $Rutas.Config)) { return $null }
  return Get-Content $Rutas.Config -Raw -Encoding UTF8 | ConvertFrom-Json
}

# YAML: comillas simples (la única que se escapa es la propia comilla)
function Yaml([string]$v) { return "'" + $v.Replace("'", "''") + "'" }
# Rutas para slskd con barras normales (valen en Windows y no hay que escaparlas)
function RutaYaml([string]$p) { return Yaml ($p.Replace('\', '/')) }

function Recargar-Path {
  $maquina = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$maquina;$usuario"
}

function Hay-Winget { return [bool](Get-Command winget -ErrorAction SilentlyContinue) }

function Version-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return 0 }
  try { $v = (& $node.Source --version) -replace '^v', ''; return [int]($v.Split('.')[0]) } catch { return 0 }
}

function Ruta-Tailscale {
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("$env:ProgramFiles\Tailscale\tailscale.exe", "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

function Estado-Tailscale {
  $ts = Ruta-Tailscale
  if (-not $ts) { return $null }
  try { return (& $ts status --json 2>$null | Out-String | ConvertFrom-Json) } catch { return $null }
}

# Llama al puente local (con la clave si se pide)
function Puente([string]$ruta, $config = $null) {
  $headers = @{}
  if ($config) { $headers['Authorization'] = "Bearer $($config.clave)" }
  return Invoke-RestMethod -Uri "http://127.0.0.1:$PUERTO$ruta" -Headers $headers -TimeoutSec 8
}

# ---------------------------------------------------------------- slskd.yml
function Escribir-SlskdYml($cfg) {
  $compartir = @($cfg.compartir) | Where-Object { $_ }
  $lineasCompartir = ($compartir | ForEach-Object { "    - $(RutaYaml $_)" }) -join "`n"
  $yml = @"
# Lo genera skd.ps1 (Liquid SKd). Si lo editas a mano, ejecuta «skd.ps1 reiniciar».
soulseek:
  username: $(Yaml $cfg.soulseekUsuario)
  password: $(Yaml $cfg.soulseekContrasena)
  listen_port: $PUERTO_SOULSEEK
directories:
  incomplete: $(RutaYaml $Rutas.Incompleto)
  downloads: $(RutaYaml $Rutas.Musica)
shares:
  directories:
$lineasCompartir
web:
  port: $PUERTO_SLSKD
  # Solo desde esta PC: el panel de slskd no se abre a la red de casa (Liquid entra por el puente)
  ip_address: 127.0.0.1
  authentication:
    disabled: false
    username: $(Yaml $cfg.slskdUsuario)
    password: $(Yaml $cfg.slskdContrasena)
    api_keys:
      liquid:
        key: $(Yaml $cfg.slskdApiKey)
        role: readwrite
        cidr: 127.0.0.1/32,::1/128
"@
  Guardar-Texto $Rutas.SlskdYml ($yml -replace "`r`n", "`n")
}

# ---------------------------------------------------------------- instalar
function Instalar {
  Escribir ''
  Escribir '  ╭──────────────────────────────────────────────╮' 'Magenta'
  Escribir '  │   Liquid SKd · Soulseek + Liquid en tu PC    │' 'Magenta'
  Escribir '  ╰──────────────────────────────────────────────╯' 'Magenta'
  Escribir '  Se puede repetir cuando quieras: no borra tu música ni cambia tu clave.'
  Escribir '  Ojo: mucha música de Soulseek tiene derechos de autor. Úsalo para tu escucha personal.' 'DarkGray'

  if (-not [Environment]::Is64BitOperatingSystem) { throw 'Liquid SKd necesita Windows de 64 bits.' }
  foreach ($d in @($Rutas.Raiz, $Rutas.Slskd, $Rutas.Puente, $Rutas.Musica, $Rutas.Incompleto, $Rutas.Datos, $Rutas.Registros)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
  }
  $cfg = Leer-Config
  $nueva = -not $cfg
  if ($nueva) { $cfg = [pscustomobject]@{} }
  # Lo que ya esté corriendo NO se para aquí: primero se pregunta y se baja todo, y solo al copiar
  # los archivos (paso 6) se para un momento. Así, si cierras el instalador a medias, SKd sigue en marcha.
  $nuevoSlskd = $null

  # 1. Node.js (para el puente)
  Paso 'Node.js'
  if ((Version-Node) -ge 20) { Bien "Node $(& node --version) ya está" }
  else {
    if (-not (Hay-Winget)) { throw 'Falta Node.js 20 o más nuevo, y no hay winget para instalarlo. Instálalo desde https://nodejs.org (LTS) y vuelve a ejecutar esto.' }
    Escribir '  Instalando Node.js LTS con winget (puede pedir permiso de administrador)…'
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
    Recargar-Path
    if ((Version-Node) -lt 20) { throw 'No se pudo instalar Node.js. Instálalo desde https://nodejs.org (LTS) y vuelve a ejecutar esto.' }
    Bien "Node $(& node --version) instalado"
  }

  # 2. ¿Soulseek ya abierto en esta PC?
  Paso 'Soulseek'
  $qt = Get-Process -Name 'SoulseekQt', 'Soulseek', 'Nicotine' -ErrorAction SilentlyContinue
  if ($qt) {
    Aviso "Tienes $($qt[0].ProcessName) abierto. Soulseek solo deja UNA sesión por cuenta:"
    Aviso 'si slskd y tu programa usan el mismo usuario, se echan el uno al otro cada pocos segundos.'
    Aviso 'Usa aquí un usuario distinto (se crea solo) o cierra tu programa de Soulseek.'
  } else { Bien 'No hay otro programa de Soulseek abierto' }

  # 3. slskd (Soulseek sin ventana)
  Paso 'slskd'
  if ((Test-Path $Rutas.SlskdExe) -and -not (Preguntar 'slskd ya está instalado. ¿Buscar versión nueva?' $false)) { Bien 'slskd ya está' }
  else {
    Escribir '  Buscando la última versión en GitHub (slskd/slskd)…'
    $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/slskd/slskd/releases/latest' -Headers @{ 'User-Agent' = 'LiquidSKd-instalador' }
    $arq = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    $asset = $rel.assets | Where-Object { $_.name -match "win-$arq\.zip$" } | Select-Object -First 1
    if (-not $asset) { throw "La versión $($rel.tag_name) de slskd no trae paquete para Windows $arq." }
    $zip = Join-Path $env:TEMP $asset.name
    Escribir "  Bajando $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)…"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing -Headers @{ 'User-Agent' = 'LiquidSKd-instalador' }
    $tmp = Join-Path $env:TEMP "slskd-$([guid]::NewGuid().ToString('N'))"
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $exe = Get-ChildItem -Path $tmp -Recurse -Filter 'slskd.exe' | Select-Object -First 1
    if (-not $exe) { throw 'El paquete de slskd no trae slskd.exe.' }
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    # Se copia en el paso 6 (con slskd parado: un .exe en uso no se puede reemplazar)
    $nuevoSlskd = @{ dir = $exe.DirectoryName; tmp = $tmp; version = $rel.tag_name }
    Bien "slskd $($rel.tag_name) bajado"
  }

  # 4. Cuenta de Soulseek y claves
  Paso 'Tu cuenta de Soulseek'
  $pedir = $nueva -or -not $cfg.soulseekUsuario
  if (-not $pedir) { $pedir = -not (Preguntar "Usar la cuenta guardada ($($cfg.soulseekUsuario))?" $true) }
  if ($pedir) {
    Escribir '  Si no tienes cuenta, inventa un usuario y una contraseña: se crea sola la primera vez.' 'DarkGray'
    do { $u = (Read-Host '  Usuario de Soulseek').Trim() } while (-not $u)
    do {
      $seg = Read-Host '  Contraseña de Soulseek' -AsSecureString
      $c = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seg))
    } while (-not $c)
    $cfg | Add-Member -Force soulseekUsuario $u
    $cfg | Add-Member -Force soulseekContrasena $c
  }
  foreach ($k in @('clave', 'slskdApiKey', 'slskdContrasena')) {
    if (-not $cfg.$k) { $cfg | Add-Member -Force $k (Nueva-Clave) }
  }
  if (-not $cfg.slskdUsuario) { $cfg | Add-Member -Force slskdUsuario 'liquid' }
  if (-not $cfg.cacheHoras) { $cfg | Add-Member -Force cacheHoras 24 }
  if (-not $cfg.origenes) { $cfg | Add-Member -Force origenes $ORIGENES }
  if (-not $cfg.compartir) {
    # Compartir algo evita que mucha gente de Soulseek te deje a la cola: por defecto, la propia caché
    $compartir = @($Rutas.Musica)
    Escribir '  En Soulseek se comparte: quien no comparte nada suele quedarse a la cola de los demás.' 'DarkGray'
    $extra = (Read-Host '  ¿Otra carpeta tuya con música para compartir? (Intro para ninguna)').Trim().Trim('"')
    if ($extra -and (Test-Path $extra)) { $compartir += (Resolve-Path $extra).Path }
    elseif ($extra) { Aviso "No existe «$extra»: no se comparte" }
    $cfg | Add-Member -Force compartir $compartir
  }
  Bien "Cuenta: $($cfg.soulseekUsuario)"

  # 5. Dirección pública (https) con Tailscale Funnel
  Paso 'Dirección pública'
  $publico = "http://localhost:$PUERTO"
  if ($SinTunel) { Aviso 'Sin túnel: Liquid podrá usar SKd solo desde esta PC.' }
  else {
    $tsDir = Conectar-Tailscale
    if ($tsDir) { $publico = $tsDir; Bien "Tu dirección: $publico" }
    else { Aviso 'Sin Tailscale por ahora: SKd funcionará solo desde esta PC. Repite «instalar» para activarlo.' }
  }
  $cfg | Add-Member -Force publico $publico
  if ($publico -like 'https://*') { $cfg | Add-Member -Force tunel $true } else { $cfg | Add-Member -Force tunel $false }

  # 6. Archivos
  Paso 'Archivos'
  $repo = Split-Path $PSScriptRoot -Parent
  $server = Join-Path $repo 'puente\server.mjs'
  if (-not (Test-Path $server)) { throw "No encuentro $server. Ejecuta skd.ps1 desde la carpeta soulseek\windows del repositorio." }
  # Ahora sí: se para un momento lo que esté corriendo para reemplazar sus archivos
  Parar-Todo -Silencio
  if ($nuevoSlskd) {
    # Los programas de slskd; su slskd.yml y sus datos (app-dir) no se tocan
    Copy-Item -Path (Join-Path $nuevoSlskd.dir '*') -Destination $Rutas.Slskd -Recurse -Force
    Remove-Item $nuevoSlskd.tmp -Recurse -Force -ErrorAction SilentlyContinue
    Bien "slskd $($nuevoSlskd.version) instalado"
  }
  Copy-Item $server $Rutas.Server -Force
  if ($PSCommandPath -ne $Rutas.Script) { Copy-Item $PSCommandPath $Rutas.Script -Force }
  Guardar-Texto $Rutas.Config ($cfg | ConvertTo-Json -Depth 4)
  Escribir-SlskdYml $cfg
  # Solo tu usuario de Windows puede leer la carpeta (tiene tus contraseñas). La regla va SOLO en la carpeta
  # y lo de dentro la hereda: aplicar (OI)(CI) a cada archivo con /T los dejaba sin ningún permiso, ni para ti.
  Proteger-Carpeta
  Bien "Todo en $($Rutas.Raiz)"

  # 7. Arranque automático al iniciar sesión (sin ventana) y arranque ahora
  Paso 'Arranque automático'
  Registrar-Tarea
  Bien 'Arranca solo al iniciar sesión en Windows (y se levanta solo si algo se cae)'
  Start-ScheduledTask -TaskName $TAREA
  Escribir '  Arrancando slskd y el puente…'
  $ok = $false
  for ($i = 0; $i -lt 40 -and -not $ok; $i++) { Start-Sleep -Milliseconds 750; try { $ok = (Puente '/salud').ok } catch { } }
  if (-not $ok) { Fallo "El puente no arrancó. Mira $($Rutas.Registros)\puente.log"; return }
  Bien 'Puente en marcha'
  $conectado = $false
  for ($i = 0; $i -lt 30 -and -not $conectado; $i++) {
    Start-Sleep -Seconds 1
    try { $conectado = (Puente '/api/estado' $cfg).soulseek } catch { }
  }
  if ($conectado) { Bien 'Soulseek conectado' }
  else { Aviso "Soulseek aún no conecta (usuario o contraseña, o la red). Mira $($Rutas.Registros)\slskd.log" }

  # 8. Energía: si la PC se suspende, SKd se apaga
  Paso 'Energía'
  Escribir '  SKd solo funciona con la PC encendida y despierta. Si se suspende, Liquid sigue con tu biblioteca'
  Escribir '  y con lo descargado al teléfono, pero no podrá buscar ni pedir en Soulseek.'
  if (Preguntar '¿Quitar la suspensión automática mientras esté enchufada? (la pantalla sí se apagará)' $false) {
    powercfg /change standby-timeout-ac 0 | Out-Null
    Bien 'La PC ya no se suspende sola enchufada'
  }

  Mostrar-Clave $cfg
}

function Conectar-Tailscale {
  $ts = Ruta-Tailscale
  if (-not $ts) {
    Escribir '  Tailscale da a tu PC una dirección https fija y gratis, sin abrir puertos del router.'
    if (-not (Preguntar '¿Instalar Tailscale?' $true)) { return $null }
    if (-not (Hay-Winget)) { Aviso 'No hay winget: instálalo desde https://tailscale.com/download y repite.'; return $null }
    winget install --id Tailscale.Tailscale -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
    Recargar-Path
    $ts = Ruta-Tailscale
    if (-not $ts) { Aviso 'Tailscale no quedó instalado.'; return $null }
  }
  $st = Estado-Tailscale
  if (-not $st -or $st.BackendState -ne 'Running') {
    Escribir '  Inicia sesión en Tailscale en la ventana del navegador que se abre (cuenta gratis: Google, Microsoft, GitHub…).'
    & $ts up | Out-Host
    for ($i = 0; $i -lt 120; $i++) { $st = Estado-Tailscale; if ($st -and $st.BackendState -eq 'Running') { break }; Start-Sleep -Seconds 2 }
    if (-not $st -or $st.BackendState -ne 'Running') { Aviso 'No se completó el inicio de sesión de Tailscale.'; return $null }
  }
  Bien "Tailscale conectado ($($st.Self.HostName))"
  # Funnel: https://<tu-pc>.<tu-red>.ts.net → este puente (solo él; slskd sigue cerrado).
  # La primera vez Tailscale muestra un enlace para permitir Funnel en tu cuenta y espera a que lo hagas.
  Escribir '  Activando Tailscale Funnel (si sale un enlace, ábrelo y permite Funnel: es una sola vez)…'
  & $ts funnel --bg $PUERTO | Out-Host
  if ($LASTEXITCODE -ne 0) { Aviso 'Tailscale Funnel no se pudo activar (mira el mensaje de arriba).'; return $null }
  $dns = ($st.Self.DNSName).TrimEnd('.')
  if (-not $dns) { return $null }
  return "https://$dns"
}

function Proteger-Carpeta {
  $yo = "$env:USERDOMAIN\$env:USERNAME"
  & icacls $Rutas.Raiz /inheritance:r /grant:r "${yo}:(OI)(CI)F" /Q 2>&1 | Out-Null
  & icacls (Join-Path $Rutas.Raiz '*') /reset /T /C /Q 2>&1 | Out-Null
  # Comprobación: si no se puede leer la configuración, se deshace (mejor sin restringir que roto)
  try { [void](Get-Content $Rutas.Config -Raw -ErrorAction Stop) }
  catch {
    & icacls $Rutas.Raiz /reset /T /C /Q 2>&1 | Out-Null
    Aviso 'No se pudieron restringir los permisos de la carpeta; se deja como estaba.'
  }
}

function Registrar-Tarea {
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $accion = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$($Rutas.Script)`" servicio"
  $disparador = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  $quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TAREA -Action $accion -Trigger $disparador -Settings $ajustes -Principal $quien `
    -Description 'Liquid SKd: Soulseek + Liquid en esta PC (slskd y el puente de Liquid).' -Force | Out-Null
}

# ---------------------------------------------------------------- servicio (segundo plano)
# Arranca un programa sin ventana; su salida va a <nombre>.log y sus errores a <nombre>.error.log.
# Cada arranque guarda el registro anterior como .1 (así siempre se ve qué pasó la última vez).
function Iniciar-Proceso([string]$exe, [string[]]$argumentos, [string]$log, [string]$dir) {
  $err = $log -replace '\.log$', '.error.log'
  foreach ($f in @($log, $err)) { if (Test-Path $f) { Move-Item $f "$f.1" -Force } }
  $citados = @($argumentos | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } })
  $opciones = @{ FilePath = $exe; WorkingDirectory = $dir; NoNewWindow = $true; PassThru = $true
    RedirectStandardOutput = $log; RedirectStandardError = $err }
  if ($citados.Count) { $opciones.ArgumentList = $citados }
  return Start-Process @opciones
}

function Servicio {
  # Una sola copia del servicio a la vez (si la anterior murió de golpe, su candado queda «abandonado»: vale)
  $mutex = New-Object System.Threading.Mutex($false, 'Local\LiquidSKd-servicio')
  try { if (-not $mutex.WaitOne(0)) { return } } catch [System.Threading.AbandonedMutexException] { }
  $cfg = Leer-Config
  if (-not $cfg) { throw 'Falta config.json: ejecuta «skd.ps1 instalar».' }
  if (-not (Test-Path $Rutas.Registros)) { New-Item -ItemType Directory -Force -Path $Rutas.Registros | Out-Null }
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { Recargar-Path; $node = (Get-Command node).Source }

  # Lo que lee el puente (server.mjs). slskd lee todo de su slskd.yml (carpeta: --app-dir)
  $env:SLSKD_URL = "http://127.0.0.1:$PUERTO_SLSKD"
  $env:SLSKD_API_KEY = $cfg.slskdApiKey
  $env:SLSKD_USERNAME = $cfg.slskdUsuario
  $env:SLSKD_PASSWORD = $cfg.slskdContrasena
  $env:LIQUID_CLAVE = $cfg.clave
  $env:PUBLICO = $cfg.publico
  $env:ORIGENES = $cfg.origenes
  $env:MUSICA_DIR = $Rutas.Musica
  $env:INCOMPLETO_DIR = $Rutas.Incompleto
  $env:DATOS_DIR = $Rutas.Datos
  $env:CACHE_HORAS = [string]$cfg.cacheHoras
  $env:PUERTO = [string]$PUERTO
  $env:HOST = '127.0.0.1'

  $hijos = @{
    slskd  = @{ exe = $Rutas.SlskdExe; args = @('--app-dir', $Rutas.Slskd); dir = $Rutas.Slskd; p = $null; caidas = 0; desde = [datetime]::MinValue }
    puente = @{ exe = $node; args = @($Rutas.Server); dir = $Rutas.Puente; p = $null; caidas = 0; desde = [datetime]::MinValue }
  }
  try {
    while ($true) {
      foreach ($nombre in @('slskd', 'puente')) {
        $h = $hijos[$nombre]
        if ($h.p -and -not $h.p.HasExited) { continue }
        if ($h.p -or $h.caidas) {
          # Si se cae enseguida varias veces, se espera más antes de reintentar (máx. 5 min)
          if (((Get-Date) - $h.desde).TotalSeconds -lt 60) { $h.caidas++ } else { $h.caidas = 0 }
          $espera = [math]::Min(300, [math]::Pow(2, $h.caidas))
          if (((Get-Date) - $h.desde).TotalSeconds -lt $espera) { continue }
        }
        $h.desde = Get-Date
        try { $h.p = Iniciar-Proceso $h.exe $h.args (Join-Path $Rutas.Registros "$nombre.log") $h.dir }
        catch {
          # No se pudo ni lanzar (¿falta el programa?): se apunta y se reintenta con espera creciente
          Add-Content -Path (Join-Path $Rutas.Registros 'servicio.log') -Encoding UTF8 -Value "$(Get-Date -Format s) No arranca $nombre ($($h.exe)): $($_.Exception.Message)"
          $h.caidas++
        }
      }
      Start-Sleep -Seconds 5
    }
  } finally {
    foreach ($h in $hijos.Values) { if ($h.p -and -not $h.p.HasExited) { try { $h.p.Kill() } catch { } } }
    $mutex.ReleaseMutex()
  }
}

# ---------------------------------------------------------------- resto de acciones
function Parar-Todo([switch]$Silencio) {
  try { Stop-ScheduledTask -TaskName $TAREA -ErrorAction Stop } catch { }
  # Lo que pudiera quedar suelto de esta instalación (y solo de esta)
  Get-CimInstance Win32_Process -Filter "Name = 'slskd.exe' OR Name = 'node.exe' OR Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -like "*$($Rutas.Raiz)*") -and $_.ProcessId -ne $PID } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
  if (-not $Silencio) { Bien 'Parado' }
}

function Mostrar-Clave($cfg) {
  if (-not $cfg) { $cfg = Leer-Config }
  if (-not $cfg) { Fallo 'No está instalado: elige «instalar».'; return }
  try { Set-Clipboard -Value $cfg.clave; $copiada = $true } catch { $copiada = $false }
  Escribir ''
  Escribir '  ╭── En Liquid: Ajustes → Liquid ATK → SKd · Soulseek ──' 'Green'
  Escribir "  │  Dirección:  $($cfg.publico)" 'Green'
  Escribir "  │  Clave:      $($cfg.clave)" 'Green'
  Escribir '  ╰───────────────────────────────────────────────────────' 'Green'
  if ($copiada) { Escribir '  (La clave ya está copiada: pégala en Liquid.)' 'DarkGray' }
  if (-not $cfg.tunel) { Aviso 'Sin túnel: esa dirección solo funciona en Liquid abierto en esta misma PC.' }
  Escribir '  No compartas la clave: con ella se puede usar tu Soulseek.' 'DarkGray'
}

function Mostrar-Estado {
  $cfg = Leer-Config
  if (-not $cfg) { Fallo 'No está instalado: elige «instalar».'; return }
  Paso 'Liquid SKd'
  $tarea = Get-ScheduledTask -TaskName $TAREA -ErrorAction SilentlyContinue
  if ($tarea) { Bien "Arranque automático: $($tarea.State)" } else { Fallo 'Sin arranque automático (repite «instalar»)' }
  try {
    $e = Puente '/api/estado' $cfg
    Bien 'Puente en marcha'
    if ($e.soulseek) { Bien 'Soulseek conectado' } else { Fallo "Soulseek sin conexión (mira $($Rutas.Registros)\slskd.log)" }
    Bien "$($e.canciones) canciones en tu biblioteca SKd · $($e.cache.enDisco) en disco ahora"
  } catch { Fallo 'El puente no responde (elige «reiniciar» o mira los registros)' }
  if ($cfg.cacheHoras -gt 0) { Escribir "  Caché: lo que lleve $($cfg.cacheHoras) h sin sonar se borra y vuelve a bajar al tocarlo." }
  $mb = (Get-ChildItem $Rutas.Musica -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB
  Escribir ("  Ocupa: {0:N1} MB en {1}" -f $mb, $Rutas.Musica)
  if ($cfg.tunel) {
    try {
      $r = Invoke-RestMethod -Uri "$($cfg.publico)/salud" -TimeoutSec 10
      if ($r.ok) { Bien "Desde internet: $($cfg.publico) responde" }
    } catch { Fallo "Desde internet no responde $($cfg.publico) (¿Tailscale encendido? «tailscale funnel status»)" }
  } else { Aviso "Sin túnel: solo desde esta PC ($($cfg.publico))" }
}

function Desinstalar {
  Paso 'Desinstalar Liquid SKd'
  Parar-Todo
  try { Unregister-ScheduledTask -TaskName $TAREA -Confirm:$false -ErrorAction Stop; Bien 'Quitado el arranque automático' } catch { }
  $ts = Ruta-Tailscale
  $cfg = Leer-Config
  if ($ts -and $cfg -and $cfg.tunel) {
    & $ts funnel --https=443 off 2>$null | Out-Null
    Bien 'Túnel de Tailscale cerrado (Tailscale sigue instalado; quítalo desde Windows si no lo usas)'
  }
  if (Preguntar "¿Borrar también la carpeta $($Rutas.Raiz) (música en caché, memoria y claves)?" $false) {
    Remove-Item $Rutas.Raiz -Recurse -Force
    Bien 'Carpeta borrada'
  } else { Escribir "  Se queda en $($Rutas.Raiz). Si vuelves a instalar, se reutiliza." }
}

function Menu {
  while ($true) {
    Escribir ''
    Escribir '  Liquid SKd' 'Magenta'
    Escribir '   1  Instalar / reparar'
    Escribir '   2  Estado'
    Escribir '   3  Ver la dirección y copiar la clave'
    Escribir '   4  Reiniciar'
    Escribir '   5  Abrir registros'
    Escribir '   6  Desinstalar'
    Escribir '   0  Salir'
    $o = Read-Host '  Elige'
    try {
      switch ($o) {
        '1' { Instalar }
        '2' { Mostrar-Estado }
        '3' { Mostrar-Clave $null }
        '4' { Parar-Todo; Start-ScheduledTask -TaskName $TAREA; Bien 'Arrancando de nuevo' }
        '5' { Start-Process explorer.exe $Rutas.Registros }
        '6' { Desinstalar }
        '0' { return }
      }
    } catch { Fallo $_.Exception.Message }
  }
}

# Al cargarlo con «. skd.ps1» (tests) solo se definen las funciones
if ($MyInvocation.InvocationName -eq '.') { return }
switch ($Accion) {
  'menu'        { Menu }
  'instalar'    { Instalar }
  'estado'      { Mostrar-Estado }
  'clave'       { Mostrar-Clave $null }
  'reiniciar'   { Parar-Todo; Start-ScheduledTask -TaskName $TAREA; Bien 'Arrancando de nuevo' }
  'registros'   { Start-Process explorer.exe $Rutas.Registros }
  'desinstalar' { Desinstalar }
  'servicio'    { Servicio }
}
