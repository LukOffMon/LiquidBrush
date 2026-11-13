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

Usa las mismas claves que tools/sync_r2.py (R2_<NOMBRE>_ACCESS_KEY_ID / _SECRET_ACCESS_KEY y, donde haga
falta, _ACCOUNT / _BUCKET). Para --apply la clave tiene que poder escribir («Object Read & Write»).
"""
import datetime
import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sync_r2 import BUCKETS, _sign, list_objects  # noqa: E402

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


def fetch(url, byte_range=None):
    headers = {'User-Agent': 'liquid-tools'}
    if byte_range:
        headers['Range'] = f'bytes={byte_range[0]}-{byte_range[1]}'
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=300).read()


def process(name, apply, min_kb):
    cfg = BUCKETS[name]
    prefix = f'R2_{name.upper()}_'
    access, secret = os.environ.get(prefix + 'ACCESS_KEY_ID'), os.environ.get(prefix + 'SECRET_ACCESS_KEY')
    if not (access and secret and cfg['account'] and cfg['bucket']):
        print(f'· {name}: sin clave/cuenta en el entorno, se salta')
        return 0, 0
    keys = [k for k, _ in list_objects(cfg, access, secret) if k.lower().endswith('.mp3')]
    print(f'· {name}: {len(keys)} MP3')

    def one(key):
        url = cfg['public'] + '/' + urllib.parse.quote(key)
        try:
            head = fetch(url, (0, 9))
            if head[:3] != b'ID3':
                return key, 0, 'sin etiqueta'
            first = 10 + synchsafe(head[6:10])
            if first < min_kb * 1024:
                return key, 0, 'ligero'
            if not apply:
                return key, first, 'pendiente'
            data = fetch(url)
            slim = slim_mp3(data)
            if not slim or len(data) - len(slim) < min_kb * 1024:
                return key, 0, 'nada que quitar'
            s3_put(cfg, access, secret, key, slim)
            return key, len(data) - len(slim), 'aligerado'
        except (urllib.error.URLError, OSError, ValueError) as error:
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
    names = args or list(BUCKETS)
    total_files = total_bytes = 0
    for name in names:
        if name not in BUCKETS:
            sys.exit(f'Bucket desconocido: {name}. Opciones: {", ".join(BUCKETS)}')
        files, size = process(name, apply, min_kb)
        total_files += files
        total_bytes += size
    print(json.dumps({'mp3': total_files, 'mb': round(total_bytes / 1_048_576, 1), 'aplicado': apply}, ensure_ascii=False))
    if not apply and total_files:
        print('Para aplicarlo:  python3 tools/r2_slim.py --apply')


if __name__ == '__main__':
    main()
