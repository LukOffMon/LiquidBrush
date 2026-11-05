// Cifrado de las cuentas: todo con WebCrypto (incluido en Workers, sin dependencias).
//
// Contraseñas en dos fases (ver docs/Liquid-Bullet-Cuentas-Plan.pdf, sección 7.1):
//   1) el navegador estira la contraseña: claveCliente = PBKDF2-SHA256(contraseña, SHA-256("liquidbullet:v1:" + correo), 600.000)
//   2) el Worker guarda PBKDF2-SHA256(HMAC-SHA256(PIMIENTA, claveCliente), salServidor, 10.000)
// Así la contraseña nunca sale del dispositivo y el Worker cabe en el tiempo de CPU del plan gratuito.

const te = new TextEncoder();

export const ITERACIONES_SERVIDOR = 10000;
export const VERSION_CLAVE = 1;

export function bytesAleatorios(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function aB64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64url(texto) {
  const s = String(texto).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const bytesDe = (dato) => (typeof dato === 'string' ? te.encode(dato) : new Uint8Array(dato));

export async function sha256(dato) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytesDe(dato)));
}

async function claveHmac(secreto) {
  return crypto.subtle.importKey('raw', bytesDe(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function hmac(secreto, dato) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await claveHmac(secreto), bytesDe(dato)));
}

// Comparación en tiempo constante (no deja adivinar por cuánto tarda)
export function iguales(a, b) {
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// claveCliente (32 bytes en base64url, ya estirada en el navegador) → hash para guardar
export async function hashClave(pimienta, claveCliente, sal) {
  const conPimienta = await hmac(pimienta, claveCliente);
  const material = await crypto.subtle.importKey('raw', conPimienta, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES_SERVIDOR }, material, 256);
  return new Uint8Array(bits);
}

// Código de 6 dígitos sin sesgo (se descartan los valores que no reparten por igual)
export function codigoSeisDigitos() {
  const limite = Math.floor(0xffffffff / 1000000) * 1000000;
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n < limite) return String(n % 1000000).padStart(6, '0');
  }
}

export async function hashCodigo(pimienta, codigo, correo, motivo) {
  return hmac(pimienta, `${codigo}|${correo}|${motivo}`);
}

// Pase de acceso: base64url(JSON).base64url(HMAC) — se valida sin leer D1
export async function firmarPase(secreto, datos) {
  const cuerpo = aB64url(te.encode(JSON.stringify(datos)));
  const firma = aB64url(await hmac(secreto, cuerpo));
  return `${cuerpo}.${firma}`;
}

export async function leerPase(secreto, pase) {
  const [cuerpo, firma] = String(pase || '').split('.');
  if (!cuerpo || !firma) return null;
  let esperada;
  try {
    esperada = await hmac(secreto, cuerpo);
    if (!iguales(esperada, deB64url(firma))) return null;
    const datos = JSON.parse(new TextDecoder().decode(deB64url(cuerpo)));
    if (!datos || typeof datos.e !== 'number' || datos.e < Math.floor(Date.now() / 1000)) return null;
    return datos;
  } catch {
    return null;
  }
}
