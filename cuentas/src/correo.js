// Envío de correos desde el Gmail dedicado de Liquid Bullet (SMTP con contraseña de aplicación).
// Workers solo bloquea el puerto 25: el 465 (TLS directo) funciona con connect() de cloudflare:sockets.
// Es un módulo intercambiable: si algún día se usa otro remitente, solo cambia enviarCorreo().
import { connect } from 'cloudflare:sockets';

const te = new TextEncoder();
const td = new TextDecoder();

function b64(texto) {
  let s = '';
  for (const b of te.encode(texto)) s += String.fromCharCode(b);
  return btoa(s);
}

const envolver = (texto) => texto.replace(/.{1,76}/g, '$&\r\n');
const asuntoMime = (texto) => `=?UTF-8?B?${b64(texto)}?=`;

// Lector de respuestas SMTP (pueden venir en varias líneas: «250-…» hasta «250 …»)
function lectorSmtp(readable) {
  const reader = readable.getReader();
  let buffer = '';
  return async function respuesta() {
    for (;;) {
      const lineas = buffer.split('\r\n');
      for (let i = 0; i < lineas.length - 1; i++) {
        if (/^\d{3} /.test(lineas[i])) {
          const todo = lineas.slice(0, i + 1);
          buffer = lineas.slice(i + 1).join('\r\n');
          return { codigo: Number(lineas[i].slice(0, 3)), texto: todo.join('\n') };
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('SMTP: conexión cerrada');
      buffer += td.decode(value, { stream: true });
    }
  };
}

async function sesionSmtp(env, para, mensaje) {
  const socket = connect({ hostname: 'smtp.gmail.com', port: 465 }, { secureTransport: 'on', allowHalfOpen: false });
  const writer = socket.writable.getWriter();
  const leer = lectorSmtp(socket.readable);
  const escribir = (linea) => writer.write(te.encode(`${linea}\r\n`));
  const esperar = async (codigos, paso) => {
    const r = await leer();
    if (!codigos.includes(r.codigo)) {
      const error = new Error(`SMTP ${paso}: ${r.codigo} ${r.texto.slice(0, 160)}`);
      error.smtp = r.codigo;
      throw error;
    }
    return r;
  };
  try {
    await esperar([220], 'saludo');
    await escribir('EHLO liquid-cuentas.workers.dev');
    await esperar([250], 'EHLO');
    await escribir('AUTH LOGIN');
    await esperar([334], 'AUTH');
    await escribir(b64(env.SMTP_USER));
    await esperar([334], 'usuario');
    await escribir(b64(String(env.SMTP_PASS).replace(/\s+/g, '')));
    await esperar([235], 'contraseña');
    await escribir(`MAIL FROM:<${env.SMTP_USER}>`);
    await esperar([250], 'MAIL FROM');
    await escribir(`RCPT TO:<${para}>`);
    await esperar([250, 251], 'RCPT TO');
    await escribir('DATA');
    await esperar([354], 'DATA');
    await writer.write(te.encode(`${mensaje}\r\n.\r\n`));
    await esperar([250], 'envío');
    await escribir('QUIT');
  } finally {
    try { await writer.close(); } catch { /* ya cerrado */ }
    try { await socket.close(); } catch { /* ya cerrado */ }
  }
}

function construirMensaje(env, para, { asunto, texto, html, responderA }) {
  const frontera = `liquid-${crypto.randomUUID()}`;
  const dominio = String(env.SMTP_USER).split('@')[1] || 'gmail.com';
  const cabeceras = [
    `From: "Liquid Bullet" <${env.SMTP_USER}>`,
    `To: <${para}>`,
    // Peticiones: «Responder» en el buzón de Lukamon va directo a quien la mandó
    ...(responderA ? [`Reply-To: <${responderA}>`] : []),
    `Subject: ${asuntoMime(asunto)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${dominio}>`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
    `Content-Type: multipart/alternative; boundary="${frontera}"`
  ];
  return [
    ...cabeceras,
    '',
    `--${frontera}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    envolver(b64(texto)),
    `--${frontera}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    envolver(b64(html)),
    `--${frontera}--`
  ].join('\r\n');
}

// Envía con 2 reintentos (1 s y 4 s). Lanza el último error si no se pudo.
export async function enviarCorreo(env, para, contenido) {
  const mensaje = construirMensaje(env, para, contenido);
  let ultimo;
  for (const espera of [0, 1000, 4000]) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      await sesionSmtp(env, para, mensaje);
      return true;
    } catch (error) {
      ultimo = error;
      // Credenciales o destinatario rechazados: reintentar no sirve
      if (error.smtp && [535, 550, 553, 554].includes(error.smtp)) break;
    }
  }
  throw ultimo;
}

/* ---------- Plantillas (español, con la estética de Liquid Bullet; sin imágenes remotas) ---------- */
const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function marco(titulo, cuerpoHtml) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#0f0d18;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#f4f2fb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0d18;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1a1726;border-radius:20px;padding:28px">
<tr><td style="font-weight:800;font-size:18px;letter-spacing:.02em;color:#9ee7ff">Liquid Bullet</td></tr>
<tr><td style="padding-top:18px;font-size:20px;font-weight:700">${escapar(titulo)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.55;color:#d8d3ea">${cuerpoHtml}</td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#8f88a8">Si no fuiste tú, ignora este correo: nadie puede entrar sin el código.<br>Liquid Bullet · música sin anuncios · <a href="https://lukoffmon.github.io/LiquidBrush/" style="color:#9ee7ff">abrir la app</a></td></tr>
</table></td></tr></table></body></html>`;
}

const MOTIVOS = {
  alta: { asunto: 'Tu código de Liquid Bullet', titulo: 'Confirma tu correo', frase: 'Escribe este código en Liquid Bullet para crear tu cuenta:' },
  recuperar: { asunto: 'Tu código para recuperar Liquid Bullet', titulo: 'Recupera tu contraseña', frase: 'Escribe este código en Liquid Bullet para elegir una contraseña nueva:' },
  'cambiar-correo': { asunto: 'Tu código para cambiar el correo', titulo: 'Confirma tu nuevo correo', frase: 'Escribe este código en Liquid Bullet para usar este correo en tu cuenta:' },
  borrar: { asunto: 'Tu código para borrar la cuenta', titulo: 'Confirma el borrado', frase: 'Escribe este código en Liquid Bullet para programar el borrado de tu cuenta:' },
  prueba: { asunto: 'Prueba de Liquid Bullet', titulo: 'Correo de prueba', frase: 'Si ves esto, el envío de códigos funciona. Código de ejemplo:' }
};

export function correoCodigo(motivo, codigo) {
  const m = MOTIVOS[motivo] || MOTIVOS.alta;
  const separado = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;
  return {
    // El código va en el asunto: se ve sin abrir el correo y es fácil de buscar (también en Spam)
    asunto: `${m.asunto}: ${codigo}`,
    texto: `${m.titulo}\n\n${m.frase}\n\n    ${separado}\n\nCaduca en 10 minutos.\nSi no fuiste tú, ignora este correo.\n\nLiquid Bullet · https://lukoffmon.github.io/LiquidBrush/`,
    html: marco(m.titulo, `${escapar(m.frase)}
<div style="margin:22px 0;padding:18px;border-radius:16px;background:linear-gradient(135deg,#2a2440,#1f1a33);text-align:center;font-size:38px;font-weight:800;letter-spacing:.18em;color:#ffffff">${separado}</div>
Caduca en <b>10 minutos</b>.`)
  };
}

export function correoYaRegistrado() {
  return {
    asunto: 'Alguien intentó crear una cuenta con tu correo',
    texto: 'Alguien intentó crear una cuenta de Liquid Bullet con este correo, pero ya tienes una.\n\nSi fuiste tú, entra con tu contraseña o usa «¿Olvidaste tu contraseña?».\nSi no fuiste tú, no hace falta hacer nada.',
    html: marco('Ya tienes una cuenta', 'Alguien intentó crear una cuenta de Liquid Bullet con este correo, pero ya tienes una.<br><br>Si fuiste tú, <b>entra con tu contraseña</b> o usa «¿Olvidaste tu contraseña?». Si no fuiste tú, no hace falta hacer nada.')
  };
}

export function correoBienvenida(nombre) {
  const hola = nombre ? `Hola, ${nombre}` : 'Hola';
  return {
    asunto: 'Tu música ya está a salvo',
    texto: `${hola}:\n\nTu cuenta de Liquid Bullet está lista. Tus favoritas, playlists y lo que escuchas te siguen a cualquier dispositivo.\n\nTres trucos:\n· Selección rápida (Inicio): toca una canción y sigue con su radio.\n· Lab: recetas de un toque y mezclas a medida.\n· Descarga playlists para escuchar sin internet.\n\nConoce todo lo que trae: https://lukoffmon.github.io/LiquidBrush/review.html`,
    html: marco(hola, `Tu cuenta de Liquid Bullet está lista. Tus favoritas, playlists y lo que escuchas te siguen a cualquier dispositivo.<br><br>
<b>Tres trucos:</b><br>· <b>Selección rápida</b> (Inicio): toca una canción y sigue con su radio.<br>· <b>Lab</b>: recetas de un toque y mezclas a medida.<br>· <b>Descarga</b> playlists para escuchar sin internet.<br><br>
<a href="https://lukoffmon.github.io/LiquidBrush/review.html" style="color:#9ee7ff">Conoce todo lo que trae</a>`)
  };
}

export function correoClaveCambiada() {
  return {
    asunto: 'Se cambió tu contraseña de Liquid Bullet',
    texto: 'La contraseña de tu cuenta de Liquid Bullet acaba de cambiar y cerramos tus otras sesiones.\n\nSi no fuiste tú, usa «¿Olvidaste tu contraseña?» en la app para recuperarla.',
    html: marco('Tu contraseña cambió', 'La contraseña de tu cuenta de Liquid Bullet acaba de cambiar y cerramos tus otras sesiones.<br><br>Si <b>no fuiste tú</b>, usa «¿Olvidaste tu contraseña?» en la app para recuperarla.')
  };
}

/* ---------- Peticiones de canciones (buscador → «¿No encontraste lo que buscabas?») ---------- */
const filaHtml = (etiqueta, valor) => valor
  ? `<tr><td style="padding:6px 12px 6px 0;color:#8f88a8;white-space:nowrap;vertical-align:top">${escapar(etiqueta)}</td><td style="padding:6px 0;color:#f4f2fb">${escapar(valor).replace(/\n/g, '<br>')}</td></tr>`
  : '';

// Para Lukamon: llega al buzón oficial con «Responder a» = correo de quien pide
export function correoPeticionAdmin(p) {
  const que = [p.cancion, p.artista].filter(Boolean).join(' — ') || p.busqueda || 'Sin título';
  const datos = [
    ['Ticket', p.ticket], ['Canción', p.cancion], ['Artista', p.artista], ['Buscó', p.busqueda], ['Mensaje', p.mensaje],
    ['Correo', `${p.correo}${p.verificado ? ' (cuenta verificada)' : ' (sin cuenta: no verificado)'}`], ['Dispositivo', p.dispositivo]
  ];
  return {
    asunto: `Petición ${p.ticket} · ${que}`.slice(0, 140),
    responderA: p.correo,
    texto: `Nueva petición en Liquid Bullet\n\n${datos.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nPulsa «Responder» para contestarle directamente a ${p.correo}.`,
    html: marco(`Petición ${p.ticket}`, `Alguien quiere esta canción en Liquid:
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:15px">${datos.map(([k, v]) => filaHtml(k, v)).join('')}</table>
Pulsa <b>Responder</b> para contestarle directamente a <b>${escapar(p.correo)}</b>.`)
  };
}

// Para quien pide (solo con cuenta verificada: así nadie puede usar el formulario para escribirle a otro)
export function correoPeticionRecibida(p) {
  const que = [p.cancion, p.artista].filter(Boolean).join(' — ') || p.busqueda || 'tu canción';
  return {
    asunto: `Recibimos tu petición ${p.ticket}`,
    texto: `¡Gracias por ayudar a que Liquid crezca!\n\nRecibimos tu petición ${p.ticket}: ${que}.\nLukamon la lee personalmente y te responderá desde officiallukamon@gmail.com. Cuando la canción llegue, saldrá en «Música nueva» de las novedades.\n\nLiquid Bullet · https://lukoffmon.github.io/LiquidBrush/`,
    html: marco('¡Petición recibida!', `Recibimos tu petición <b>${escapar(p.ticket)}</b>:<br>
<div style="margin:18px 0;padding:16px;border-radius:16px;background:linear-gradient(135deg,#2a2440,#1f1a33);font-size:17px;font-weight:700;color:#ffffff">${escapar(que)}</div>
Lukamon la lee personalmente y te responderá desde <b>officiallukamon@gmail.com</b>. Cuando la canción llegue, saldrá en «Música nueva» de las novedades.`)
  };
}
