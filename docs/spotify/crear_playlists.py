#!/usr/bin/env python3
"""Crea en tu Spotify las 8 playlists de 99 canciones (los .txt de esta misma carpeta).

Funciona con cuenta gratis (no hace falta Premium). Solo usa Python 3 estándar: no hay que
instalar nada. Cada .txt tiene una canción por línea: «Artista - Canción».

    python crear_playlists.py              # crea las 8 playlists
    python crear_playlists.py --prueba     # solo lee los .txt y dice qué haría (sin Spotify)
    python crear_playlists.py --rehacer    # vuelve a crear las que ya existen con el mismo nombre

La primera vez pide el «Client ID» de tu app de Spotify (developer.spotify.com) y abre el
navegador para que inicies sesión. Nada sale de tu computadora salvo hacia Spotify.
"""
import base64
import hashlib
import http.server
import json
import os
import re
import secrets
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

CARPETA = Path(__file__).resolve().parent
PUERTO = 8888
REDIRECCION = f'http://127.0.0.1:{PUERTO}/callback'
PERMISOS = 'playlist-modify-private playlist-modify-public playlist-read-private'
CONFIG = CARPETA / '.spotify-client-id'
NOMBRES = {
    '1-hip-hop-dorado': ('Liquid · Hip Hop Dorado', 'Rap icónico de los 90 y 2000: OutKast, Biggie, 2Pac, Nas, Dr. Dre, Tribe, MF DOOM.'),
    '2-seda-clasica': ('Liquid · Seda Clásica', 'R&B y neo soul de los 90 y 2000: Aaliyah, TLC, Destiny\'s Child, Usher, D\'Angelo, Erykah Badu.'),
    '3-pop-global': ('Liquid · Pop Global', 'Pop icónico: Beyoncé, Lady Gaga, Dua Lipa, Bruno Mars, Taylor Swift, Rihanna, Britney.'),
    '4-euforia-total': ('Liquid · Euforia Total', 'EDM y house icónico: Avicii, Daft Punk, Disclosure, Swedish House Mafia, Calvin Harris.'),
    '5-latino-de-oro': ('Liquid · Latino de Oro', 'Pop latino de oro: Ricky Martin, Shakira, Juan Luis Guerra, Selena, Maná, Juanes, Thalía.'),
    '6-reggaeton-de-oro': ('Liquid · Reggaetón de Oro', 'Himnos del reggaetón: Daddy Yankee, Don Omar, Calle 13, Wisin & Yandel, Bad Bunny, KAROL G.'),
    '7-rock-en-espanol-esencial': ('Liquid · Rock en Español Esencial', 'Caifanes, Héroes del Silencio, Soda Stereo, Café Tacvba, Molotov, Los Fabulosos Cadillacs.'),
    '8-disco-y-funk': ('Liquid · Disco y Funk', 'Chic, Donna Summer, Earth, Wind & Fire, Sister Sledge, Prince, Stevie Wonder, ABBA.'),
}


# ---------- Utilidades ----------
def normalizar(texto):
    texto = re.sub(r'\(.*?\)|\[.*?\]', '', str(texto))
    texto = unicodedata.normalize('NFD', texto).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', texto).strip()


def leer_listas():
    listas = []
    for archivo in sorted(CARPETA.glob('*.txt')):
        if archivo.stem not in NOMBRES:
            continue
        canciones = []
        for linea in archivo.read_text(encoding='utf-8').splitlines():
            if ' - ' not in linea.strip():
                continue
            artista, titulo = linea.split(' - ', 1)
            canciones.append((artista.strip(), titulo.strip()))
        nombre, descripcion = NOMBRES[archivo.stem]
        listas.append({'archivo': archivo.name, 'nombre': nombre, 'descripcion': descripcion, 'canciones': canciones})
    return listas


# ---------- Inicio de sesión (OAuth con PKCE: no hace falta «Client Secret») ----------
def pedir_client_id():
    if CONFIG.exists():
        guardado = CONFIG.read_text(encoding='utf-8').strip()
        if guardado:
            return guardado
    print('\nPega el «Client ID» de tu app de Spotify (developer.spotify.com → tu app → Settings).')
    client_id = input('Client ID: ').strip()
    if not re.fullmatch(r'[0-9a-fA-F]{32}', client_id):
        sys.exit('Ese Client ID no parece válido: son 32 letras y números. Vuelve a intentarlo.')
    CONFIG.write_text(client_id, encoding='utf-8')
    return client_id


def iniciar_sesion(client_id):
    verificador = base64.urlsafe_b64encode(secrets.token_bytes(64)).rstrip(b'=').decode()
    reto = base64.urlsafe_b64encode(hashlib.sha256(verificador.encode()).digest()).rstrip(b'=').decode()
    estado = secrets.token_urlsafe(16)
    recibido = {}

    class Receptor(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 (nombre que exige http.server)
            datos = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if self.path.startswith('/callback'):
                recibido.update({k: v[0] for k, v in datos.items()})
                ok = 'code' in recibido and recibido.get('state') == estado
                texto = ('Listo: ya puedes cerrar esta pestaña y volver a la ventana del script.' if ok
                         else 'No se pudo iniciar sesión. Vuelve a la ventana del script.')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(f'<h2 style="font-family:sans-serif">{texto}</h2>'.encode())
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *args):
            pass

    try:
        servidor = http.server.HTTPServer(('127.0.0.1', PUERTO), Receptor)
    except OSError:
        sys.exit(f'El puerto {PUERTO} está ocupado. Cierra otros programas que lo usen y vuelve a intentarlo.')
    hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
    hilo.start()
    url = 'https://accounts.spotify.com/authorize?' + urllib.parse.urlencode({
        'client_id': client_id, 'response_type': 'code', 'redirect_uri': REDIRECCION, 'scope': PERMISOS,
        'code_challenge_method': 'S256', 'code_challenge': reto, 'state': estado,
    })
    print('\nSe abrirá el navegador para que inicies sesión en Spotify y aceptes.')
    print('Si no se abre solo, copia este enlace en el navegador:\n' + url + '\n')
    webbrowser.open(url)
    limite = time.time() + 300
    while 'code' not in recibido and 'error' not in recibido and time.time() < limite:
        time.sleep(0.3)
    servidor.shutdown()
    if 'error' in recibido:
        sys.exit(f'Spotify rechazó el inicio de sesión: {recibido["error"]}.')
    if 'code' not in recibido or recibido.get('state') != estado:
        sys.exit('No llegó la respuesta de Spotify en 5 minutos. Vuelve a ejecutar el script.')
    respuesta = peticion('POST', 'https://accounts.spotify.com/api/token', formulario={
        'grant_type': 'authorization_code', 'code': recibido['code'], 'redirect_uri': REDIRECCION,
        'client_id': client_id, 'code_verifier': verificador,
    })
    return respuesta['access_token']


# ---------- API de Spotify ----------
def peticion(metodo, url, token=None, cuerpo=None, formulario=None):
    for intento in range(6):
        cabeceras = {}
        datos = None
        if token:
            cabeceras['Authorization'] = f'Bearer {token}'
        if cuerpo is not None:
            datos = json.dumps(cuerpo).encode()
            cabeceras['Content-Type'] = 'application/json'
        if formulario is not None:
            datos = urllib.parse.urlencode(formulario).encode()
            cabeceras['Content-Type'] = 'application/x-www-form-urlencoded'
        req = urllib.request.Request(url, data=datos, headers=cabeceras, method=metodo)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                texto = r.read().decode() or '{}'
                return json.loads(texto)
        except urllib.error.HTTPError as error:
            if error.code == 429:  # demasiadas peticiones: Spotify dice cuánto esperar
                espera = int(error.headers.get('Retry-After') or 3) + 1
                print(f'   (Spotify pide esperar {espera} s…)')
                time.sleep(espera)
                continue
            if error.code >= 500 and intento < 5:
                time.sleep(2 + intento * 2)
                continue
            detalle = error.read().decode(errors='ignore')[:300]
            if error.code == 403:
                sys.exit(f'Spotify respondió 403 (sin permiso). Revisa que tu correo de Spotify esté en «User Management» '
                         f'de tu app en developer.spotify.com.\nDetalle: {detalle}')
            raise SystemExit(f'Error {error.code} de Spotify en {url}\n{detalle}')
        except urllib.error.URLError as error:
            if intento < 5:
                time.sleep(2 + intento * 2)
                continue
            raise SystemExit(f'Sin conexión con Spotify: {error}')
    raise SystemExit('Spotify no respondió tras varios intentos. Vuelve a ejecutar el script más tarde.')


def buscar(token, artista, titulo):
    artista_n = normalizar(artista)
    titulo_n = normalizar(titulo)
    consultas = [f'track:{titulo} artist:{artista}', f'{titulo} {artista}']
    for consulta in consultas:
        url = 'https://api.spotify.com/v1/search?' + urllib.parse.urlencode(
            {'q': consulta, 'type': 'track', 'limit': 10, 'market': 'from_token'})
        items = peticion('GET', url, token).get('tracks', {}).get('items', [])

        def puntos(item):
            artistas = [normalizar(a['name']) for a in item.get('artists', [])]
            nombre = normalizar(item.get('name', ''))
            p = 0
            if any(artista_n == a or artista_n in a or a in artista_n for a in artistas if a):
                p += 3
            if nombre == titulo_n:
                p += 3
            elif titulo_n and (titulo_n in nombre or nombre in titulo_n):
                p += 2
            if re.search(r'\b(karaoke|tribute|cover|instrumental|8 ?bit|lullaby)\b', item.get('name', '').lower()):
                p -= 4
            return p + item.get('popularity', 0) / 100

        candidatos = sorted(items, key=puntos, reverse=True)
        if candidatos and puntos(candidatos[0]) >= 5:
            return candidatos[0]
    return None


def mis_playlists(token):
    nombres = {}
    url = 'https://api.spotify.com/v1/me/playlists?limit=50'
    while url:
        datos = peticion('GET', url, token)
        for p in datos.get('items', []) or []:
            if p:
                nombres[p['name']] = p['id']
        url = datos.get('next')
    return nombres


def crear_playlist(token, usuario, nombre, descripcion):
    return peticion('POST', f'https://api.spotify.com/v1/users/{urllib.parse.quote(usuario)}/playlists', token,
                    cuerpo={'name': nombre, 'description': descripcion, 'public': False})


def agregar(token, playlist_id, uris):
    for i in range(0, len(uris), 100):
        peticion('POST', f'https://api.spotify.com/v1/playlists/{playlist_id}/tracks', token, cuerpo={'uris': uris[i:i + 100]})


# ---------- Programa ----------
def main():
    listas = leer_listas()
    if len(listas) != 8:
        sys.exit(f'Encontré {len(listas)} de los 8 archivos .txt. Deja este script en la misma carpeta que los .txt.')
    print(f'Encontré 8 listas con {sum(len(l["canciones"]) for l in listas)} canciones en total.')
    if '--prueba' in sys.argv:
        for l in listas:
            print(f'  {l["nombre"]}: {len(l["canciones"])} canciones (primera: {l["canciones"][0][0]} - {l["canciones"][0][1]})')
        print('Prueba terminada: no se conectó a Spotify.')
        return

    token = iniciar_sesion(pedir_client_id())
    yo = peticion('GET', 'https://api.spotify.com/v1/me', token)
    print(f'\nSesión iniciada como {yo.get("display_name") or yo["id"]}. Creando playlists…')
    existentes = mis_playlists(token)
    informe = []
    for l in listas:
        if l['nombre'] in existentes and '--rehacer' not in sys.argv:
            print(f'\n· «{l["nombre"]}» ya existe en tu Spotify: la salto (usa --rehacer para crearla de nuevo).')
            continue
        print(f'\n· {l["nombre"]}')
        uris, faltan = [], []
        for n, (artista, titulo) in enumerate(l['canciones'], 1):
            pista = buscar(token, artista, titulo)
            if pista and pista['uri'] not in uris:
                uris.append(pista['uri'])
            elif not pista:
                faltan.append(f'{artista} - {titulo}')
            print(f'\r   buscando {n}/{len(l["canciones"])} · encontradas {len(uris)}', end='', flush=True)
        playlist = crear_playlist(token, yo['id'], l['nombre'], l['descripcion'])
        agregar(token, playlist['id'], uris)
        enlace = playlist.get('external_urls', {}).get('spotify', '')
        print(f'\n   Lista creada con {len(uris)} canciones: {enlace}')
        if faltan:
            print(f'   No encontradas en tu país ({len(faltan)}): ' + '; '.join(faltan))
        informe.append(f'{l["nombre"]}: {len(uris)} canciones · {enlace}' + (f'\n  No encontradas: {"; ".join(faltan)}' if faltan else ''))
        time.sleep(1)
    if informe:
        (CARPETA / 'resultado.txt').write_text('\n'.join(informe) + '\n', encoding='utf-8')
        print(f'\n¡Listo! Abre Spotify: tus playlists están en «Tu biblioteca». Resumen guardado en {CARPETA / "resultado.txt"}')
    else:
        print('\nNo había nada que crear.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nCancelado.')
