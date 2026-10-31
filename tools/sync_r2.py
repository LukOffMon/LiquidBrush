#!/usr/bin/env python3
"""Genera las listas de canciones (musica/<bucket>.json) leyendo los buckets de Cloudflare R2.

Cada bucket está en una cuenta distinta de Cloudflare, así que cada uno usa su propia clave
de API de R2 (solo lectura basta). Las claves se leen de variables de entorno, nunca del código:

    R2_PEPPER_ACCESS_KEY_ID / R2_PEPPER_SECRET_ACCESS_KEY   -> liquidpepper4db
    R2_SALT_ACCESS_KEY_ID   / R2_SALT_SECRET_ACCESS_KEY     -> liquidsaltdb5
    R2_BRUSH3_ACCESS_KEY_ID / R2_BRUSH3_SECRET_ACCESS_KEY   -> liquidbrush3db3

Uso:
    python3 tools/sync_r2.py            # todos los buckets que tengan clave
    python3 tools/sync_r2.py salt       # solo uno

Cada carpeta del bucket es una playlist ("album"). Del nombre del archivo se saca el título y
el artista: "001 - Artista - Título.mp3" o "001 - Título.mp3". La duración se calcula leyendo
solo el principio de cada MP3 por la URL pública. Las filas que ya existían conservan lo que se
haya editado a mano (título, artista, letra…); las de archivos borrados del bucket se quitan.
Después hay que regenerar el catálogo con  python3 tools/build_catalog.py
"""
import datetime
import hashlib
import hmac
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BUCKETS = {
    'pepper': {
        'bucket': 'liquidpepper4db',
        'account': 'e83bc201faf7e2be209c608a963cbaf3',
        'public': 'https://pub-cb798ce2901a49a6a6363d57fbd5ee19.r2.dev',
    },
    'salt': {
        'bucket': 'liquidsaltdb5',
        'account': '5b71115472f054c0e95c4bb1426f557c',
        'public': 'https://pub-b05e243e7441423f9c4a25dfe8411da3.r2.dev',
    },
    'brush3': {
        'bucket': 'liquidbrush3db3',
        'account': 'e48ecb806d0540b03083e254b4bae3fc',
        'public': 'https://pub-342aee3eb054410cb02224940f684884.r2.dev',
    },
}
AUDIO_EXT = ('.mp3', '.m4a', '.ogg', '.wav', '.flac')


# ---------- S3 (firma SigV4, sin dependencias) ----------
def _sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def s3_get(account, access_key, secret_key, bucket, params):
    host = f'{account}.r2.cloudflarestorage.com'
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date, date = now.strftime('%Y%m%dT%H%M%SZ'), now.strftime('%Y%m%d')
    query = '&'.join(f'{urllib.parse.quote(k, safe="-_.~")}={urllib.parse.quote(str(v), safe="-_.~")}'
                     for k, v in sorted(params.items()))
    payload_hash = hashlib.sha256(b'').hexdigest()
    headers = f'host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n'
    signed = 'host;x-amz-content-sha256;x-amz-date'
    canonical = f'GET\n/{bucket}\n{query}\n{headers}\n{signed}\n{payload_hash}'
    scope = f'{date}/auto/s3/aws4_request'
    to_sign = f'AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}'
    key = _sign(_sign(_sign(_sign(('AWS4' + secret_key).encode(), date), 'auto'), 's3'), 'aws4_request')
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(f'https://{host}/{bucket}?{query}', headers={
        'x-amz-date': amz_date,
        'x-amz-content-sha256': payload_hash,
        'Authorization': f'AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed}, Signature={signature}',
    })
    return urllib.request.urlopen(req, timeout=60).read()


def list_objects(cfg, access_key, secret_key):
    ns = '{http://s3.amazonaws.com/doc/2006-03-01/}'
    objects, token = [], None
    while True:
        params = {'list-type': '2', 'max-keys': '1000'}
        if token:
            params['continuation-token'] = token
        root = ET.fromstring(s3_get(cfg['account'], access_key, secret_key, cfg['bucket'], params))
        for item in root.iter(f'{ns}Contents'):
            objects.append((item.findtext(f'{ns}Key'), int(item.findtext(f'{ns}Size') or 0)))
        if root.findtext(f'{ns}IsTruncated') != 'true':
            return objects
        token = root.findtext(f'{ns}NextContinuationToken')


# ---------- Duración de un MP3 leyendo solo su principio ----------
BITRATES = {  # (versión, capa) -> kbps
    (1, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (2, 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
RATES = {1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000]}


def mp3_duration(head, total_size):
    pos = 0
    if head[:3] == b'ID3':
        size = head[6] << 21 | head[7] << 14 | head[8] << 7 | head[9]
        pos = 10 + size + (10 if head[5] & 0x10 else 0)
    while pos + 4 <= len(head):
        if head[pos] == 0xFF and head[pos + 1] & 0xE0 == 0xE0:
            b1, b2, b3 = head[pos + 1], head[pos + 2], head[pos + 3]
            ver = {3: 1, 2: 2, 0: 25}.get((b1 >> 3) & 3)
            layer = (b1 >> 1) & 3
            bi, ri = b2 >> 4, (b2 >> 2) & 3
            if ver and layer == 1 and 0 < bi < 15 and ri < 3:
                kbps = BITRATES[(1 if ver == 1 else 2, 3)][bi]
                rate = RATES[ver][ri]
                spf = 1152 if ver == 1 else 576
                mono = (b3 >> 6) == 3
                side = (17 if mono else 32) if ver == 1 else (9 if mono else 17)
                x = pos + 4 + side
                tag = head[x:x + 4]
                if tag in (b'Xing', b'Info') and head[x + 7] & 1:
                    frames = int.from_bytes(head[x + 8:x + 12], 'big')
                    return frames * spf / rate
                if head[pos + 36:pos + 40] == b'VBRI':
                    frames = int.from_bytes(head[pos + 50:pos + 54], 'big')
                    return frames * spf / rate
                return (total_size - pos) * 8 / (kbps * 1000)
        pos += 1
    return None


def fmt(seconds):
    if not seconds:
        return ''
    s = int(round(seconds))
    return f'{s // 60}:{s % 60:02d}'


def duration_of(public, key, size):
    if not key.lower().endswith('.mp3'):
        return ''
    url = f'{public}/{"/".join(urllib.parse.quote(p) for p in key.split("/"))}'
    try:
        req = urllib.request.Request(url, headers={'Range': 'bytes=0-262143', 'User-Agent': 'Mozilla/5.0'})
        head = urllib.request.urlopen(req, timeout=60).read()
        if head[:3] == b'ID3':  # carátula grande dentro del ID3: se pide hasta pasar la etiqueta
            tag = 10 + (head[6] << 21 | head[7] << 14 | head[8] << 7 | head[9])
            if tag + 4096 > len(head):
                req = urllib.request.Request(url, headers={'Range': f'bytes=0-{tag + 65535}', 'User-Agent': 'Mozilla/5.0'})
                head = urllib.request.urlopen(req, timeout=60).read()
        return fmt(mp3_duration(head, size))
    except Exception as error:  # noqa: BLE001 — una canción sin duración no detiene el resto
        print(f'  sin duración: {key} ({error})')
        return ''


# ---------- Filas ----------
def parse_name(key):
    folder, _, file = key.rpartition('/')
    stem = re.sub(r'\.[^.]+$', '', file)
    stem = re.sub(r'^\d+\s*[-.]\s*', '', stem).strip()
    parts = [p.strip() for p in stem.split(' - ')]
    artist, title = (parts[0], ' - '.join(parts[1:])) if len(parts) > 1 else ('', stem)
    return folder.split('/')[0] if folder else '', artist, title or stem


def slug(text):
    text = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode()
    text = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
    return text[:60] or 'x'


def make_id(key):
    return f'{slug(key)}-{hashlib.sha1(key.encode()).hexdigest()[:6]}'


def sync(name):
    cfg = BUCKETS[name]
    prefix = f'R2_{name.upper()}_'
    access, secret = os.environ.get(prefix + 'ACCESS_KEY_ID'), os.environ.get(prefix + 'SECRET_ACCESS_KEY')
    if not access or not secret:
        print(f'{name}: falta {prefix}ACCESS_KEY_ID / {prefix}SECRET_ACCESS_KEY, se salta')
        return
    objects = sorted((k, s) for k, s in list_objects(cfg, access, secret) if k.lower().endswith(AUDIO_EXT))
    path = ROOT / 'musica' / f'{name}.json'
    old = {row.get('src'): row for row in json.loads(path.read_text())} if path.exists() else {}
    todo = [(k, s) for k, s in objects if not (old.get(k) or {}).get('duration')]
    with ThreadPoolExecutor(8) as pool:
        durations = dict(zip([k for k, _ in todo], pool.map(lambda o: duration_of(cfg['public'], *o), todo)))
    rows = []
    for key, _ in objects:
        album, artist, title = parse_name(key)
        row = old.get(key) or {'id': make_id(key), 'title': title, 'artist': artist, 'album': album, 'src': key}
        if not row.get('duration'):
            row['duration'] = durations.get(key, '')
        rows.append(row)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
    albums = {}
    for r in rows:
        albums[r['album']] = albums.get(r['album'], 0) + 1
    print(f'{name} ({cfg["bucket"]}): {len(rows)} canciones · ' + ', '.join(f'{a or "(raíz)"} {n}' for a, n in albums.items()))


if __name__ == '__main__':
    for bucket_name in (sys.argv[1:] or BUCKETS):
        sync(bucket_name)
