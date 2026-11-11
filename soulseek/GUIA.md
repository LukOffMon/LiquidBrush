# Liquid ATK + SKd: Soulseek en tu propio servidor (Oracle Cloud)

Con esto, **Liquid Bullet** busca en **Liquid** (tu biblioteca), en **ATK** (Audius, Internet Archive, Jamendo, Hearthis, Wikimedia) y en **Soulseek**, a la vez y desde el mismo buscador. Lo que pidas de Soulseek se descarga en **tu servidor** y pasa a tu biblioteca: suena desde ahí, se puede descargar al teléfono y cuenta en Stats.

Tu PC **no** tiene que estar encendida: todo vive en un servidor gratis de Oracle Cloud que está encendido 24 horas.

```
Liquid (GitHub Pages, tu teléfono)
   │ https + tu clave
   ▼
Tu servidor de Oracle (gratis, siempre encendido)
   ├─ Caddy    → HTTPS automático (sin comprar dominio: <IP>.sslip.io)
   ├─ Puente   → lo único con lo que habla Liquid: buscar, pedir, progreso, tu biblioteca y el audio
   ├─ slskd    → Soulseek (no se publica a internet)
   └─ musica/  → tus canciones descargadas (hasta ~200 GB)
```

> **Antes de empezar:** mucha música en Soulseek tiene derechos de autor, y las condiciones de Oracle prohíben alojar contenido que los infrinja: si les llega una queja, pueden cerrar la cuenta. Úsalo para tu escucha personal y bajo tu responsabilidad.

---

## Paso 1 · Crear la cuenta de Oracle Cloud (10 min)

1. Entra en **oracle.com/cloud/free** → **Start for free**.
2. Rellena tus datos. Pide una **tarjeta** solo para verificar (no cobra mientras uses lo «Always Free»).
3. **Home Region**: elige la más cercana a ti. **No se puede cambiar después.**
4. Espera el correo de «cuenta lista» y entra en **cloud.oracle.com**.

## Paso 2 · Crear el servidor gratis (10 min)

1. Menú ☰ → **Compute → Instances → Create instance**.
2. **Name**: `liquid-skd`.
3. **Image and shape → Edit**:
   - Image: **Canonical Ubuntu 24.04** (o 22.04).
   - Shape: **Ampere → VM.Standard.A1.Flex** con **2 OCPU y 12 GB** de memoria (aparece «Always Free-eligible»).
   - Si sale *Out of capacity*: prueba otro *Availability domain*, menos OCPU (1 y 6 GB) o vuelve a intentarlo más tarde.
4. **Add SSH keys → Generate a key pair for me → Save private key** (guarda ese archivo `.key`: es tu llave para entrar).
5. **Boot volume**: marca *Specify a custom boot volume size* y pon **150 GB** o más (hasta 200 GB entran en lo gratis). Ahí vivirá tu música.
6. **Create**. Cuando diga *Running*, apunta la **Public IP address** (por ejemplo `158.101.22.33`).

> Para que Oracle no reclame el servidor por «poco uso», en **Billing → Upgrade and Manage Payment** puedes pasar la cuenta a *Pay As You Go*: sigue siendo gratis dentro de los límites de Always Free.

## Paso 3 · Abrir los puertos en Oracle (5 min)

1. En la página de tu instancia → **Primary VNIC → Subnet** → **Security Lists** → la lista por defecto → **Add Ingress Rules**.
2. Añade **tres reglas** (Source CIDR `0.0.0.0/0`, IP Protocol **TCP**):
   - Destination port **80** (para el certificado HTTPS)
   - Destination port **443** (HTTPS: Liquid entra por aquí)
   - Destination port **50300** (Soulseek: para compartir y bajar mejor)

(El cortafuegos interno de Ubuntu lo abre solo el instalador.)

## Paso 4 · Entrar al servidor (2 min)

Opción A, **sin PC**: en la consola de Oracle, arriba a la derecha, el icono **>_ (Cloud Shell)**. Sube ahí tu `.key` (menú ⚙ → Upload) y:

```bash
chmod 600 ~/*.key
ssh -i ~/*.key ubuntu@158.101.22.33      # tu IP pública
```

Opción B, **desde tu PC** (Windows con PowerShell, Mac o Linux): el mismo `ssh -i ruta/a/tu.key ubuntu@TU_IP`.

## Paso 5 · Instalar Liquid SKd (5 min)

Ya dentro del servidor, copia y pega:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/LukOffMon/LiquidBrush.git
cd LiquidBrush/soulseek
bash instalar.sh
```

El instalador:
- instala Docker y abre los puertos 80, 443 y 50300 en el cortafuegos de Ubuntu;
- te propone la dirección pública (`158-101-22-33.sslip.io`; pulsa Intro para aceptarla);
- te pide tu **usuario y contraseña de Soulseek** (si no tienes cuenta, inventa un usuario y una contraseña: se crea sola la primera vez);
- genera las claves secretas y arranca todo.

Al final te enseña algo así (**guárdalo**):

```
En Liquid: Ajustes → Liquid ATK → SKd · Soulseek
  Dirección:  https://158-101-22-33.sslip.io
  Clave:      Xk3…(40 caracteres)
```

Comprueba en el navegador que `https://158-101-22-33.sslip.io/salud` responde `{"ok":true,"nombre":"Liquid SKd"}` (la primera vez el certificado puede tardar un minuto).

## Paso 6 · Conectar Liquid (1 min)

1. Abre Liquid → **Ajustes → Liquid ATK** (ATK viene encendido).
2. En **SKd · Soulseek** pega la **Dirección** y la **Clave** → **Conectar**.
3. Debe decir «Conectado · Soulseek en línea». La marca pasa a **Liquid ATK +SKd**.

La clave se guarda solo en ese navegador. En otro dispositivo, repite este paso.

## Paso 7 · Usarlo

- **Buscar**: escribe como siempre. Si Liquid no lo tiene, en «Más allá de Liquid» salen los resultados de ATK y de Soulseek (etiqueta **SKd**, con formato y calidad: «MP3 · 320 kbps»). Lo que ya está en tu biblioteca no se repite.
- **Pedir**: toca un resultado SKd → «Pidiendo… / Bajando 40 %». Cuando llega a tu servidor, **entra en tu biblioteca y suena**. Si cierras la app, el pedido sigue y te avisa al volver.
- **Escuchar**: tus canciones de SKd están en la Biblioteca, en tus playlists, se pueden descargar al teléfono (suenan sin conexión aunque el servidor esté apagado) y cuentan en Stats.

---

## Mantenimiento

Desde el servidor, en `LiquidBrush/soulseek`:

| Qué | Comando |
|---|---|
| Ver si todo está en marcha | `docker compose ps` |
| Ver qué pasa (errores) | `docker compose logs -f --tail 50` |
| Actualizar Liquid SKd | `git pull && docker compose pull && docker compose up -d` |
| Reiniciar | `docker compose restart` |
| Ver la clave otra vez | `grep LIQUID_CLAVE .env` |
| Cambiar la clave | edita `LIQUID_CLAVE` en `.env` y `docker compose up -d` (y vuelve a conectar Liquid) |
| Cuánto espacio queda | `df -h /` |

Tu música está en `LiquidBrush/soulseek/musica/`. Puedes subir ahí tus propios MP3 (por ejemplo con `scp`) y aparecen en Liquid solos.

## Si algo falla

- **Liquid dice «No responde»**: comprueba `https://TU-DIRECCION/salud`. Si no abre, revisa el Paso 3 (puertos 80 y 443) y `docker compose logs caddy`.
- **«Soulseek sin conexión»**: usuario o contraseña de Soulseek incorrectos, o el usuario ya existe con otra contraseña. Edita `slskd/slskd.yml` y `docker compose restart slskd`.
- **Las descargas se quedan «en cola»**: es normal a veces (la otra persona tiene cola o se desconectó). Prueba otra copia del mismo tema. Abrir el puerto 50300 (Paso 3) ayuda mucho.
- **«La clave no es correcta»**: copia de nuevo `LIQUID_CLAVE` de `.env` (sin espacios).

## Seguridad

- Liquid nunca ve tu contraseña de Soulseek ni la clave de slskd: solo la **clave del puente**.
- slskd no está abierto a internet (solo el puerto de Soulseek para compartir).
- Si crees que alguien tiene tu clave, cámbiala (tabla de arriba).

## Sin Oracle

Funciona igual en una **Raspberry Pi** o cualquier Linux con Docker en tu casa: mismos pasos desde el 5, abriendo (o redirigiendo en tu router) los puertos 80, 443 y 50300.
