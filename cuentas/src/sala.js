// Liquid · v98: salas en tiempo real (Durable Object con WebSockets en modo hibernación).
//   cuenta:<usuario>  Liquid Connect: los dispositivos de una misma cuenta se ven y se mandan órdenes
//                     (reproducir, pausar, siguiente, anterior, ir al segundo) y comparten lo que suena.
//   jam:<CÓDIGO>      Jam: quien la crea es el anfitrión; los invitados (con cuenta) siguen lo que suena en
//                     su propio dispositivo y le mandan canciones a su cola.
// El Worker ya comprobó la sesión: aquí llegan el usuario, su nombre y el dispositivo en cabeceras internas.
// Solo se reenvían mensajes pequeños y conocidos; nada de esto se guarda salvo el último «estado» y el anfitrión.
/* global WebSocketPair */
import { DurableObject } from 'cloudflare:workers';

const MAX_MENSAJE = 4096;
const MAX_CONEXIONES = { cuenta: 10, jam: 30 };
const TIPOS = new Set(['estado', 'orden', 'anadir', 'ping']);
// poner: «sigue tú con esta canción en este segundo» (pasar lo que suena a otro dispositivo)
const ACCIONES = new Set(['play', 'pause', 'next', 'prev', 'seek', 'poner']);
const idCancion = (id) => typeof id === 'string' && /^[\w:./~%-]{1,200}$/.test(id);

export class Sala extends DurableObject {
  // POST /crear (Jam): guarda quién es el anfitrión. GET con Upgrade: websocket: entra en la sala.
  async fetch(request) {
    const url = new URL(request.url);
    const tipo = request.headers.get('X-Sala-Tipo');
    const usuario = request.headers.get('X-Usuario') || '';
    if (url.pathname === '/crear' && request.method === 'POST') {
      await this.ctx.storage.put('anfitrion', usuario);
      await this.ctx.storage.put('creada', Date.now());
      return new Response('ok');
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket', { status: 426 });
    if (tipo === 'jam') {
      const creada = await this.ctx.storage.get('creada');
      // Un Jam dura como mucho 12 horas
      if (!creada || Date.now() - creada > 12 * 3600 * 1000) return new Response('no_encontrado', { status: 404 });
    }
    if (this.ctx.getWebSockets().length >= (MAX_CONEXIONES[tipo] || 10)) return new Response('llena', { status: 409 });

    const anfitrion = tipo === 'jam' && (await this.ctx.storage.get('anfitrion')) === usuario;
    const par = new WebSocketPair();
    const [cliente, servidor] = Object.values(par);
    const yo = {
      id: crypto.randomUUID().slice(0, 8),
      u: usuario,
      nombre: (request.headers.get('X-Nombre') || 'Alguien').slice(0, 40),
      disp: (request.headers.get('X-Dispositivo') || 'Dispositivo').slice(0, 60),
      anfitrion,
      tipo
    };
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment(yo);
    servidor.send(JSON.stringify({ t: 'bienvenida', yo: yo.id, anfitrion, estado: (await this.ctx.storage.get('estado')) || null, miembros: this.miembros() }));
    this.difundir({ t: 'miembros', miembros: this.miembros() }, servidor);
    return new Response(null, { status: 101, webSocket: cliente, headers: { 'Sec-WebSocket-Protocol': 'liquid' } });
  }

  miembros() {
    return this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment()).filter(Boolean)
      .map(({ id, nombre, disp, anfitrion }) => ({ id, nombre, disp, anfitrion }));
  }

  difundir(mensaje, excepto = null) {
    const texto = JSON.stringify(mensaje);
    this.ctx.getWebSockets().forEach((ws) => { if (ws !== excepto) { try { ws.send(texto); } catch { /* ya cerrado */ } } });
  }

  async webSocketMessage(ws, texto) {
    if (typeof texto !== 'string' || texto.length > MAX_MENSAJE) return;
    let m;
    try { m = JSON.parse(texto); } catch { return; }
    if (!m || !TIPOS.has(m.t)) return;
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if (m.t === 'ping') { ws.send('{"t":"pong"}'); return; }

    if (m.t === 'estado') {
      // En un Jam solo el anfitrión dice qué suena; en tu cuenta, cualquiera de tus dispositivos
      if (yo.tipo === 'jam' && !yo.anfitrion) return;
      const estado = {
        de: yo.id, disp: yo.disp,
        track: idCancion(m.track) ? m.track : null,
        pos: Math.max(0, Number(m.pos) || 0), sonando: Boolean(m.sonando), at: Date.now(),
        cola: Array.isArray(m.cola) ? m.cola.filter(idCancion).slice(0, 30) : []
      };
      await this.ctx.storage.put('estado', estado);
      this.difundir({ t: 'estado', ...estado }, ws);
      return;
    }

    if (m.t === 'orden') {
      // Liquid Connect: solo entre dispositivos de la misma cuenta
      if (yo.tipo !== 'cuenta' || !ACCIONES.has(m.accion)) return;
      const destino = this.ctx.getWebSockets().find((x) => x.deserializeAttachment()?.id === m.a);
      if (!destino) return;
      destino.send(JSON.stringify({
        t: 'orden', de: yo.id, disp: yo.disp, accion: m.accion, pos: Math.max(0, Number(m.pos) || 0),
        ...(m.accion === 'poner' && idCancion(m.track) ? { track: m.track, cola: Array.isArray(m.cola) ? m.cola.filter(idCancion).slice(0, 100) : [] } : {})
      }));
      return;
    }

    if (m.t === 'anadir') {
      // Jam: los invitados mandan canciones a la cola del anfitrión
      if (yo.tipo !== 'jam' || !idCancion(m.id)) return;
      this.ctx.getWebSockets().forEach((x) => {
        const otro = x.deserializeAttachment();
        if (otro?.anfitrion) x.send(JSON.stringify({ t: 'anadir', id: m.id, siguiente: Boolean(m.siguiente), de: yo.nombre }));
      });
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'adiós'); } catch { /* ya cerrado */ }
    this.difundir({ t: 'miembros', miembros: this.miembros().filter((x) => x.id !== ws.deserializeAttachment()?.id) }, ws);
  }

  async webSocketError(ws) {
    this.difundir({ t: 'miembros', miembros: this.miembros().filter((x) => x.id !== ws.deserializeAttachment()?.id) }, ws);
  }
}
