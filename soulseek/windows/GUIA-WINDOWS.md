# Liquid SKd en tu PC con Windows

Soulseek + Liquid, todo en tu propia computadora: sin servidor en la nube, sin tarjeta, sin Docker y sin abrir puertos del router.

```
Liquid (GitHub Pages, en tu teléfono o tu PC)
   │ https + tu clave
   ▼
Tailscale Funnel → https://tu-pc.tu-red.ts.net   (dirección fija y gratis)
   ▼
Tu PC
   ├─ Puente   → lo único con lo que habla Liquid (solo escucha en 127.0.0.1)
   ├─ slskd    → Soulseek sin ventana (su panel tampoco sale de tu PC)
   └─ musica\  → caché: lo que lleve 24 h sin sonar se borra solo
```

> Mucha música de Soulseek tiene derechos de autor. Úsalo para tu escucha personal y bajo tu responsabilidad.

## ¿Tiene que estar la PC encendida?

**Sí, para la parte de Soulseek.**

- **PC encendida y despierta:** buscas en Soulseek, pides canciones y escuchas las de SKd desde cualquier sitio.
- **PC apagada o suspendida:** Liquid sigue con su biblioteca, ATK y todo lo que hayas **descargado al teléfono**. Solo SKd dice «No responde» hasta que la vuelvas a encender.

Consejos:
- Descarga al teléfono las canciones de SKd que te gusten: suenan siempre, aunque la PC esté apagada o la caché ya las haya borrado.
- El instalador ofrece quitar la suspensión automática mientras esté enchufada (la pantalla sí se apaga).
- Al encender la PC e iniciar sesión, SKd arranca solo y sin ventanas.

## Instalar (10 minutos)

1. Descarga el repositorio (**Code → Download ZIP** en GitHub) y descomprímelo, o `git clone https://github.com/LukOffMon/LiquidBrush.git`.
2. Entra en `soulseek\windows` y haz **doble clic en `Liquid SKd.cmd`** → elige **1 · Instalar**.
3. El instalador hace todo y pregunta lo justo:
   - **Node.js:** si falta, lo instala con `winget` (puede pedir permiso de administrador una vez).
   - **Soulseek abierto:** avisa si tienes SoulseekQt u otro abierto. Soulseek solo deja **una sesión por cuenta**: usa aquí un usuario distinto o cierra el otro programa.
   - **slskd:** baja la última versión oficial de [github.com/slskd/slskd](https://github.com/slskd/slskd) (unos 56 MB).
   - **Tu cuenta de Soulseek:** si no tienes, inventa usuario y contraseña (se crea sola). La contraseña no se ve al escribirla.
   - **Compartir:** quien no comparte nada en Soulseek suele quedarse a la cola de los demás. Se comparte la caché y, si quieres, una carpeta tuya.
   - **Tailscale:** lo instala, abre el navegador para que entres (cuenta gratis con Google, Microsoft o GitHub) y, la primera vez, muestra un enlace para **permitir Funnel**. Ábrelo y actívalo.
   - **Arranque automático:** una tarea de Windows lo arranca al iniciar sesión, sin ventanas, y lo levanta solo si algo se cae.
4. Al final verás esto (la clave ya queda copiada):

```
  ╭── En Liquid: Ajustes → Liquid ATK → SKd · Soulseek ──
  │  Dirección:  https://tu-pc.tu-red.ts.net
  │  Clave:      Xk3…(40 caracteres)
  ╰───────────────────────────────────────────────────────
```

5. En Liquid: **Ajustes → Liquid ATK → SKd · Soulseek** → pega la dirección y la clave → **Conectar**. Debe decir «Conectado · Soulseek en línea».

Todo queda en `%LOCALAPPDATA%\LiquidSKd`. Solo tu usuario de Windows puede leer esa carpeta, porque guarda tus contraseñas.

## Cómo funciona la caché de 24 horas

- **Pedir:** pides una canción en Liquid → se baja a tu PC → **empieza a sonar con el primer trozo**, sin esperar al archivo entero.
- **Carrera entre copias:** se pide a las **dos mejores copias a la vez** (más rápidas y con hueco libre primero). Gana la que empiece antes y la otra se cancela. Si ninguna arranca en 15 s, se prueba una tercera.
- **Borrado:** si una canción pasa **24 h sin sonar, su archivo se borra**. Lo que pusiste tú a mano en `musica\` nunca se borra.
- **No se pierde nada:** la canción sigue en tu biblioteca, tus playlists y tus favoritas. Al tocarla otra vez se vuelve a pedir a Soulseek y suena. Si Soulseek tarda más de unos 25 s, Liquid pasa a la siguiente, pero la descarga sigue y la próxima vez ya estará.
- **Descargas al teléfono:** lo que descargues al teléfono desde Liquid se queda en ese teléfono, aunque la PC esté apagada o la caché lo haya borrado.

Para cambiar las horas, edita `cacheHoras` en `%LOCALAPPDATA%\LiquidSKd\config.json` (0 = no borrar nunca) y elige **4 · Reiniciar**.

## SKd para todos los que tengan cuenta

Tu SKd lo puede usar **cualquiera con cuenta de Liquid**, sin tu clave y sin configurar nada:

- **Sin cuenta, nada.** Liquid manda el pase de la cuenta (dura 15 min) y el puente lo comprueba con el servicio de cuentas. El puente nunca ve contraseñas ni guarda correos: solo una huella del correo para contar el cupo.
- **5 canciones nuevas al día por cuenta**, y como mucho 100 al día entre todos, para proteger tu PC. Pedir una canción que ya está en tu PC (porque alguien la pidió antes) no gasta cupo.
- **Lo que pongas tú a mano** en `musica\` y **la gestión** solo son para ti, con tu clave.
- El audio sale por **tu subida de internet**: si muchas personas escuchan a la vez, lo notarás.
- **Tu PC reparte esa música** a quien use Liquid. Ten en cuenta que mucha tiene derechos de autor.

Para cerrarlo a los demás, pon `"abierto": false` en `%LOCALAPPDATA%\LiquidSKd\config.json` y elige **4 · Reiniciar**.

## La sección SKd de la Biblioteca

En **Biblioteca** aparece el filtro **SKd**, con todo lo que hay en tu servidor. Todos lo ven, y tú, con tu dirección y tu clave puestas en Ajustes, ves además dos botones en cada canción:

- **Fijar → «Se queda»**: no se borra de tu PC nunca, ni a las 24 h ni por el tope de disco.
- **Quitar**: se borra de tu PC y desaparece de SKd para todos.

## Orden, portadas y espacio en tu PC

- Cada canción se guarda como `musica\Artista\Álbum\Título.ext`. Las carpetas genéricas de quien la compartía («musica», «mp3»…) no cuentan como álbum.
- **Portadas automáticas:** primero la que trae el propio archivo y, si no trae, se busca en iTunes por artista y título. Se guardan en `datos\portadas`.
- **Tope de 20 GB.** Si se pasa, se borra primero lo menos escuchado (nunca lo fijado). Se cambia con `discoMaxGB` en `config.json`.

## El menú (doble clic en `Liquid SKd.cmd`)

| Opción | Para qué |
|---|---|
| 1 · Instalar / reparar | La primera vez o si algo se rompió. Se puede repetir: no borra tu música ni cambia tu clave |
| 2 · Estado | ¿En marcha? ¿Soulseek conectado? ¿Responde desde internet? ¿Cuánto ocupa? |
| 3 · Ver la dirección y copiar la clave | Para conectar otro dispositivo |
| 4 · Reiniciar | Si algo va raro |
| 5 · Abrir registros | `puente.log`, `slskd.log`, `servicio.log` y sus `.error.log` |
| 6 · Desinstalar | Quita el arranque y el túnel; pregunta antes de borrar la carpeta |

También desde PowerShell: `.\skd.ps1 estado`, `.\skd.ps1 clave`, etc.

## Para otras personas

Cada persona instala **su propio** Liquid SKd en **su** PC, con **su** cuenta de Soulseek y de Tailscale, y pega **su** dirección y clave en **su** Liquid. Nadie comparte claves ni PC.

## Si algo falla

- **Liquid dice «No responde».** ¿Está la PC encendida y despierta? Mira el menú → **2 · Estado**. Si dice «Desde internet no responde», abre Tailscale (el icono junto al reloj) y comprueba que esté conectado.
- **«Soulseek sin conexión».** Puede ser el usuario o la contraseña, que el usuario ya exista con otra contraseña, o que la cuenta esté abierta en otro programa. Repite **1 · Instalar** y cambia la cuenta.
- **Las descargas se quedan «en cola».** La otra persona tiene cola o se desconectó. Prueba otro resultado. Compartir una carpeta con música ayuda mucho.
- **Windows pregunta por el cortafuegos para slskd.** Permite **redes privadas**: es el puerto de Soulseek para que otras personas te pasen música.
- **Sin Tailscale** (`.\skd.ps1 instalar -SinTunel`): SKd solo funciona en Liquid abierto en esta misma PC (`http://localhost:8787`).
