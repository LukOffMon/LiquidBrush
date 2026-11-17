#!/usr/bin/env python3
"""Quita la portada incrustada de los MP3 de R2 para que la música empiece a sonar antes.

Por qué: muchos MP3 llevan su carátula DENTRO del archivo, al principio (etiqueta ID3, marco APIC). En
una muestra de los 6 buckets ocupaba de 30 KB a casi 2 MB. El reproductor tiene que descargar todo eso
antes del primer segundo de audio: con datos móviles, una canción podía tardar varios segundos en
arrancar y a veces se quedaba en silencio. La app no usa esas carátulas (las suyas están en covers/),
ni el título o el artista de dentro del MP3 (salen del nombre del archivo), así que no se pierde nada.

De paso, cada MP3 se vuelve a subir con «Cache-Control» para que el teléfono guarde lo que ya
escuchaste y no lo descargue otra vez al repetir una canción.

El audio NO se toca: se reescribe solo la etiqueta del principio. La ruta (y la URL) de cada archivo
sigue igual, así que playlists, favoritas y descargas no cambian.

    python3 tools/r2_slim.py                 # solo mira: cuántos MP3 tienen portada y cuánto se ahorra
    python3 tools/r2_slim.py salt            # lo mismo, solo un bucket
    python3 tools/r2_slim.py --apply         # quita las portadas y sube los MP3 ligeros
    python3 tools/r2_slim.py --apply --min 64   # solo los que tengan más de 64 KB de etiqueta (por defecto 32)
    python3 tools/r2_slim.py --kbps 160         # mira cuánto se ahorra pasando a 160 kbps
    python3 tools/r2_slim.py --kbps 160 --apply # recodifica a 160 kbps (y quita la portada de paso)

--kbps (necesita ffmpeg): los MP3 a 320 kbps pesan ~8 MB por canción. A 160 kbps pesan menos de la
mitad: la canción arranca antes con datos móviles y gasta la mitad de datos; en el móvil y con
auriculares la diferencia apenas se nota. Solo se tocan los que pasan del límite por más de un 15 %, así
que se puede repetir sin volver a convertir nada. Cada archivo se comprueba antes de subirlo (misma
duración, ±1 s) y después (R2 sirve el archivo nuevo entero). La URL no cambia. Las canciones que ya
descargaste en el teléfono siguen sonando con su copia de antes.

Usa las mismas claves que tools/sync_r2.py (R2_<NOMBRE>_ACCESS_KEY_ID / _SECRET_ACCESS_KEY y, donde haga
falta, _ACCOUNT / _BUCKET). Para --apply la clave tiene que poder escribir («Object Read & Write»).
"""
import datetime
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sync_r2 import BUCKETS, _sign, list_objects, s3_get  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
# Con --kbps: solo se recodifica lo que pase de ese valor por más de un 15 % (lo ya convertido se salta)
KBPS_MARGIN = 1.15

CACHE_CONTROL = 'public, max-age=2592000'  # 30 días
# Marcos de la etiqueta que se quitan: carátula, objetos y datos privados (pesan y nadie los usa)
HEAVY_FRAMES = {b'APIC', b'PIC', b'GEOB', b'PRIV', b'MCDI', b'NCON'}


def synchsafe(data):
    return (data[0] << 21) | (data[1] << 14) | (data[2] << 7) | data[3]


def to_synchsafe(n):
    return bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])


def tag_length(head):
    """Bytes que ocupan las etiquetas ID3v2 del principio (puede haber varias seguidas)."""
    total = 0
    while head[total:total + 3] == b'ID3' and len(head) >= total + 10:
        flags = head[total + 5]
        size = synchsafe(head[total + 6:total + 10])
        total += 10 + size + (10 if flags & 0x10 else 0)
    return total


def slim_tag(tag):
    """Devuelve la etiqueta sin los marcos pesados. Si no se puede leer con seguridad, ninguna etiqueta
    (el audio suena igual: la app no usa nada de dentro del MP3)."""
    major, flags = tag[3], tag[5]
    if major not in (3, 4) or flags & 0x80 or flags & 0x40:
        return b''  # desincronizada o con cabecera extendida: más seguro quitarla entera
    size = synchsafe(tag[6:10])
    body = tag[10:10 + size]
    kept = []
    pos = 0
    while pos + 10 <= len(body):
        frame_id = body[pos:pos + 4]
        if frame_id[0] == 0:  # relleno
            break
        raw = body[pos + 4:pos + 8]
        frame_size = synchsafe(raw) if major == 4 else int.from_bytes(raw, 'big')
        if frame_size <= 0 or pos + 10 + frame_size > len(body):
            return b''
        if frame_id not in HEAVY_FRAMES:
            kept.append(body[pos:pos + 10 + frame_size])
        pos += 10 + frame_size
    if not kept:
        return b''
    new_body = b''.join(kept)
    return b'ID3' + bytes([major, 0, 0]) + to_synchsafe(len(new_body)) + new_body


def slim_mp3(data):
    """MP3 con las etiquetas del principio aligeradas. Devuelve None si no hay nada que quitar."""
    start = tag_length(data)
    if not start:
        return None
    tags = b''
    pos = 0
    while pos < start:
        flags = data[pos + 5]
        size = synchsafe(data[pos + 6:pos + 10])
        tags += slim_tag(data[pos:pos + 10 + size])
        pos += 10 + size + (10 if flags & 0x10 else 0)
    audio = data[start:]
    # Comprobación: tras la etiqueta tiene que empezar un fotograma MP3 (0xFFE…)
    if len(audio) < 2 or audio[0] != 0xFF or (audio[1] & 0xE0) != 0xE0:
        return None
    return tags + audio


def s3_put(cfg, access_key, secret_key, key, body):
    host = f"{cfg['account']}.r2.cloudflarestorage.com"
    path = '/' + cfg['bucket'] + '/' + urllib.parse.quote(key, safe='/-_.~')
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date, date = now.strftime('%Y%m%dT%H%M%SZ'), now.strftime('%Y%m%d')
    payload_hash = hashlib.sha256(body).hexdigest()
    headers = {
        'cache-control': CACHE_CONTROL,
        'content-type': 'audio/mpeg',
        'host': host,
        'x-amz-content-sha256': payload_hash,
        'x-amz-date': amz_date,
    }
    signed = ';'.join(sorted(headers))
    canonical_headers = ''.join(f'{k}:{headers[k]}\n' for k in sorted(headers))
    canonical = f'PUT\n{path}\n\n{canonical_headers}\n{signed}\n{payload_hash}'
    scope = f'{date}/auto/s3/aws4_request'
    to_sign = f'AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}'
    signing = _sign(_sign(_sign(_sign(('AWS4' + secret_key).encode(), date), 'auto'), 's3'), 'aws4_request')
    signature = hmac.new(signing, to_sign.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(f'https://{host}{path}', data=body, method='PUT', headers={
        **{k: v for k, v in headers.items() if k != 'host'},
        'Authorization': f'AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed}, Signature={signature}',
    })
    urllib.request.urlopen(req, timeout=300).read()


def probe(path):
    """Duración (s) y kbps del audio, leídos con ffprobe."""
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
                          'format=duration,bit_rate', '-of', 'json', str(path)],
                         capture_output=True, text=True, check=True).stdout
    fmt = json.loads(out).get('format', {})
    return float(fmt.get('duration') or 0), float(fmt.get('bit_rate') or 0) / 1000


def transcode(data, kbps):
    """El MP3 recodificado a <kbps> CBR, sin etiquetas (ni portada). Devuelve (bytes, kbps de antes).

    Comprueba que el resultado dure lo mismo (±1 s) y empiece por un fotograma MP3: si no, ValueError
    y la canción no se toca."""
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / 'in.mp3', Path(tmp) / 'out.mp3'
        src.write_bytes(data)
        before, before_kbps = probe(src)
        if before <= 0:
            raise ValueError('no se pudo leer la duración')
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(src), '-map', '0:a:0',
                        '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', '-map_metadata', '-1',
                        '-id3v2_version', '0', '-write_id3v1', '0', '-write_xing', '1', str(dst)],
                       capture_output=True, check=True)
        out = dst.read_bytes()
        after, _ = probe(dst)
    if abs(after - before) > 1:
        raise ValueError(f'la duración cambió ({before:.1f} s → {after:.1f} s)')
    if len(out) < 2 or out[0] != 0xFF or (out[1] & 0xE0) != 0xE0:
        raise ValueError('el resultado no empieza por audio MP3')
    return out, before_kbps


def list_durations(name):
    """Duración de cada canción (por su ruta en el bucket), de musica/<name>.json."""
    path = ROOT / 'musica' / f'{name}.json'
    out = {}
    if not path.exists():
        return out
    for row in json.loads(path.read_text(encoding='utf-8')):
        parts = str(row.get('duration') or '').split(':')
        if row.get('src') and all(p.isdigit() for p in parts) and len(parts) in (2, 3):
            secs = 0
            for p in parts:
                secs = secs * 60 + int(p)
            if secs:
                out[row['src']] = secs
    return out


def fetch(url, byte_range=None):
    headers = {'User-Agent': 'liquid-tools'}
    if byte_range:
        headers['Range'] = f'bytes={byte_range[0]}-{byte_range[1]}'
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=300).read()


def public_size(url):
    """Tamaño total del archivo público (por Content-Range) y sus 10 primeros bytes."""
    req = urllib.request.Request(url, headers={'User-Agent': 'liquid-tools', 'Range': 'bytes=0-9', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=60) as response:
        head = response.read()
        total = (response.headers.get('Content-Range') or '').rpartition('/')[2]
    return (int(total) if total.isdigit() else -1), head


def parse_pasted(text):
    """Lo que se copia de Cloudflare al crear la clave de R2, pegado tal cual en un solo secreto (R2_<NOMBRE>):
    la Access Key ID (32 caracteres), la Secret Access Key (64) y la dirección del punto de acceso
    (https://<cuenta>.r2.cloudflarestorage.com, a veces con /<bucket>). El orden y el resto del texto dan igual."""
    out = {}
    url = re.search(r'https://([0-9a-f]{32})\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com(?:/([A-Za-z0-9._-]+))?', text)
    if url:
        out['account'] = url.group(1)
        if url.group(2):
            out['bucket'] = url.group(2)
        text = text.replace(url.group(0), ' ')
    for token in re.findall(r'[0-9a-f]+', text):
        if len(token) == 64:
            out.setdefault('secret', token)
        elif len(token) == 32:
            out.setdefault('access', token)
    return out


def list_buckets(account, access, secret):
    root = ET.fromstring(s3_get(account, access, secret, '', {}))
    return [el.text for el in root.iter() if el.tag.endswith('Name') and el.text]


def credentials(name, cfg):
    """(cfg completo, access, secret) o un motivo para saltarse el bucket."""
    prefix = f'R2_{name.upper()}_'
    access, secret = os.environ.get(prefix + 'ACCESS_KEY_ID'), os.environ.get(prefix + 'SECRET_ACCESS_KEY')
    cfg = dict(cfg)
    pasted = parse_pasted(os.environ.get(f'R2_{name.upper()}', ''))
    access, secret = access or pasted.get('access'), secret or pasted.get('secret')
    cfg['account'] = pasted.get('account') or cfg['account']
    cfg['bucket'] = pasted.get('bucket') or cfg['bucket']
    if not (access and secret):
        return None, 'sin clave en el entorno'
    if not cfg['account']:
        return None, 'falta la dirección https://….r2.cloudflarestorage.com (pégala junto a la clave)'
    if not cfg['bucket']:
        # La clave «para todos los buckets» deja ver cuáles hay: si solo hay uno, es ese
        try:
            names = list_buckets(cfg['account'], access, secret)
        except (urllib.error.URLError, OSError, ET.ParseError) as error:
            return None, f'no se pudo ver qué bucket es ({error}); pega también la dirección con /<bucket>'
        if len(names) != 1:
            return None, f'hay {len(names)} buckets en esa cuenta ({", ".join(names)}): pega la dirección con /<bucket>'
        cfg['bucket'] = names[0]
    return (cfg, access, secret), ''


def process(name, apply, min_kb, kbps=0):
    found, why = credentials(name, BUCKETS[name])
    if not found:
        print(f'· {name}: {why}, se salta')
        return 0, 0
    cfg, access, secret = found
    durations = list_durations(name) if kbps else {}
    sizes = {k: s for k, s in list_objects(cfg, access, secret) if k.lower().endswith('.mp3')}
    keys = list(sizes)
    print(f'· {name}: {len(keys)} MP3')

    def reencode(key, url, head):
        """--kbps: recodifica si pasa del límite. None si no hace falta (sigue el aligerado normal)."""
        tag = 10 + synchsafe(head[6:10]) if head[:3] == b'ID3' else 0
        secs = durations.get(key)
        est = (sizes[key] - tag) * 8 / secs / 1000 if secs and sizes[key] else 0
        if est and est <= kbps * KBPS_MARGIN:
            return None
        if not apply:
            if not est:
                return key, 0, 'pendiente (sin duración en la lista: se mira al aplicar)'
            return key, max(0, sizes[key] - int(secs * kbps * 125)), f'pendiente {est:.0f}→{kbps} kbps'
        data = fetch(url)
        if sizes[key] and len(data) != sizes[key]:
            return key, 0, f'error: descarga incompleta ({len(data)} de {sizes[key]} bytes), no se toca'
        new, before_kbps = transcode(data, kbps)
        if before_kbps and before_kbps <= kbps * KBPS_MARGIN:
            return None
        if len(new) >= len(data) * 0.9:
            return key, 0, 'nada que ganar'
        s3_put(cfg, access, secret, key, new)
        total, new_head = public_size(url)
        if total != len(new) or new_head != new[:10]:
            return key, 0, f'error: tras subir, R2 da {total} bytes (esperados {len(new)}): revísalo'
        return key, len(data) - len(new), f'{est or before_kbps:.0f}→{kbps} kbps'

    def one(key):
        url = cfg['public'] + '/' + urllib.parse.quote(key)
        try:
            head = fetch(url, (0, 9))
            if kbps:
                result = reencode(key, url, head)
                if result:
                    return result
            if head[:3] != b'ID3':
                return key, 0, 'sin etiqueta'
            first = 10 + synchsafe(head[6:10])
            if first < min_kb * 1024:
                return key, 0, 'ligero'
            if not apply:
                return key, first, 'pendiente'
            data = fetch(url)
            # Una descarga cortada a medias NUNCA se sube: reemplazaría la canción por un trozo
            if sizes[key] and len(data) != sizes[key]:
                return key, 0, f'error: descarga incompleta ({len(data)} de {sizes[key]} bytes), no se toca'
            slim = slim_mp3(data)
            if not slim or len(data) - len(slim) < min_kb * 1024:
                return key, 0, 'nada que quitar'
            # El audio tiene que seguir idéntico, byte a byte
            if slim[tag_length(slim):] != data[tag_length(data):]:
                return key, 0, 'error: el audio no coincide, no se toca'
            s3_put(cfg, access, secret, key, slim)
            # Comprobación final: lo que sirve R2 ya es el archivo ligero y entero
            total, new_head = public_size(url)
            if total != len(slim) or new_head != slim[:10]:
                return key, 0, f'error: tras subir, R2 da {total} bytes (esperados {len(slim)}): revísalo'
            return key, len(data) - len(slim), 'aligerado'
        except (urllib.error.URLError, OSError, ValueError, subprocess.CalledProcessError) as error:
            return key, 0, f'error: {error}'

    saved = done = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        for key, size, status in pool.map(one, keys):
            if size:
                saved += size
                done += 1
                print(f'   {status:10} {size // 1024:6} KB  {key}')
            elif status.startswith('error'):
                print(f'   {status}  {key}')
    if kbps:
        verb = 'convertidos o aligerados' if apply else 'que se pueden convertir o aligerar'
        print(f'  {name}: {done} MP3 {verb}, {saved / 1_048_576:.1f} MB menos en total')
    else:
        verb = 'aligerados' if apply else 'con portada que se puede quitar'
        print(f'  {name}: {done} MP3 {verb}, {saved / 1_048_576:.1f} MB menos antes del primer segundo')
    return done, saved


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply = '--apply' in sys.argv
    min_kb = 32
    if '--min' in sys.argv:
        min_kb = int(sys.argv[sys.argv.index('--min') + 1])
        args = [a for a in args if a != str(min_kb)]
    kbps = 0
    if '--kbps' in sys.argv:
        kbps = int(sys.argv[sys.argv.index('--kbps') + 1])
        args = [a for a in args if a != str(kbps)]
        if not 64 <= kbps <= 320:
            sys.exit('--kbps tiene que estar entre 64 y 320 (recomendado: 160)')
        if not (shutil.which('ffmpeg') and shutil.which('ffprobe')):
            sys.exit('--kbps necesita ffmpeg y ffprobe instalados (p. ej. «brew install ffmpeg» o «sudo apt install ffmpeg»)')
    names = args or list(BUCKETS)
    total_files = total_bytes = 0
    for name in names:
        if name not in BUCKETS:
            sys.exit(f'Bucket desconocido: {name}. Opciones: {", ".join(BUCKETS)}')
        files, size = process(name, apply, min_kb, kbps)
        total_files += files
        total_bytes += size
    print(json.dumps({'mp3': total_files, 'mb': round(total_bytes / 1_048_576, 1), 'kbps': kbps or None, 'aplicado': apply}, ensure_ascii=False))
    if not apply and total_files:
        print(f'Para aplicarlo:  python3 tools/r2_slim.py{f" --kbps {kbps}" if kbps else ""} --apply')


if __name__ == '__main__':
    main()
