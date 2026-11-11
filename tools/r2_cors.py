#!/usr/bin/env python3
"""Activa CORS en los buckets de Cloudflare R2 para que la música se pueda DESCARGAR en iPhone/iPad.

Por qué hace falta: para guardar un MP3 y escucharlo sin conexión, la app tiene que poder leerlo, y un
navegador solo deja leer archivos de otro servidor si ese servidor lo permite (cabecera CORS
«Access-Control-Allow-Origin»). Sin ella, Android guarda una copia «opaca» que sí suena, pero Safari
(iPhone/iPad) no puede: por eso en iOS no se podía descargar nada. También hace falta para el ecualizador.

    python3 tools/r2_cors.py            # comprueba cada bucket por su URL pública (no necesita claves)
    python3 tools/r2_cors.py --apply    # aplica la política CORS a cada bucket que tenga clave

--apply usa las mismas variables de entorno que tools/sync_r2.py (R2_<NOMBRE>_ACCESS_KEY_ID y
R2_<NOMBRE>_SECRET_ACCESS_KEY, más R2_<NOMBRE>_ACCOUNT / _BUCKET donde haga falta). La clave tiene que
poder cambiar la configuración del bucket («Admin Read & Write»); una de solo lectura no basta.

Sin claves, en el panel de Cloudflare: R2 → cada bucket → Settings → CORS Policy → Add CORS policy →
pegar el JSON que imprime  python3 tools/r2_cors.py --json  → Save. Hay que hacerlo en los 6 buckets.
"""
import base64
import datetime
import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sync_r2 import BUCKETS, _sign  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = 'https://lukoffmon.github.io'

# Lectura pública desde cualquier web (los MP3 ya son públicos): GET y HEAD, con Range para adelantar
POLICY = [{
    'AllowedOrigins': ['*'],
    'AllowedMethods': ['GET', 'HEAD'],
    'AllowedHeaders': ['Range'],
    'ExposeHeaders': ['Content-Length', 'Content-Range', 'Content-Type', 'Accept-Ranges', 'ETag'],
    'MaxAgeSeconds': 86400,
}]


def policy_xml():
    rules = []
    for rule in POLICY:
        parts = [f'<AllowedOrigin>{o}</AllowedOrigin>' for o in rule['AllowedOrigins']]
        parts += [f'<AllowedMethod>{m}</AllowedMethod>' for m in rule['AllowedMethods']]
        parts += [f'<AllowedHeader>{h}</AllowedHeader>' for h in rule['AllowedHeaders']]
        parts += [f'<ExposeHeader>{h}</ExposeHeader>' for h in rule['ExposeHeaders']]
        parts.append(f'<MaxAgeSeconds>{rule["MaxAgeSeconds"]}</MaxAgeSeconds>')
        rules.append('<CORSRule>' + ''.join(parts) + '</CORSRule>')
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' + ''.join(rules) + '</CORSConfiguration>').encode()


def put_cors(account, access_key, secret_key, bucket):
    body = policy_xml()
    host = f'{account}.r2.cloudflarestorage.com'
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date, date = now.strftime('%Y%m%dT%H%M%SZ'), now.strftime('%Y%m%d')
    payload_hash = hashlib.sha256(body).hexdigest()
    md5 = base64.b64encode(hashlib.md5(body).digest()).decode()
    headers = f'content-md5:{md5}\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n'
    signed = 'content-md5;host;x-amz-content-sha256;x-amz-date'
    canonical = f'PUT\n/{bucket}\ncors=\n{headers}\n{signed}\n{payload_hash}'
    scope = f'{date}/auto/s3/aws4_request'
    to_sign = f'AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}'
    key = _sign(_sign(_sign(_sign(('AWS4' + secret_key).encode(), date), 'auto'), 's3'), 'aws4_request')
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(f'https://{host}/{bucket}?cors=', data=body, method='PUT', headers={
        'Content-MD5': md5,
        'Content-Type': 'application/xml',
        'x-amz-date': amz_date,
        'x-amz-content-sha256': payload_hash,
        'Authorization': f'AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed}, Signature={signature}',
    })
    return urllib.request.urlopen(req, timeout=60).status


def sample_url(name, public):
    rows = json.loads((ROOT / 'musica' / f'{name}.json').read_text(encoding='utf-8'))
    if not rows:
        return None
    src = rows[0]['src']
    return f'{public}/{"/".join(urllib.parse.quote(p) for p in src.split("/"))}'


def check(name, public):
    url = sample_url(name, public)
    if not url:
        return 'sin canciones'
    req = urllib.request.Request(url, method='HEAD', headers={'Origin': ORIGIN, 'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            allowed = response.headers.get('Access-Control-Allow-Origin')
    except urllib.error.HTTPError as error:
        return f'error HTTP {error.code}'
    except Exception as error:  # noqa: BLE001 — red
        return f'sin respuesta ({error})'
    return f'OK ({allowed})' if allowed in ('*', ORIGIN) else 'FALTA CORS: en iPhone/iPad no se puede descargar'


def main():
    if '--json' in sys.argv:
        print(json.dumps(POLICY, indent=2))
        return
    apply = '--apply' in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for name, cfg in BUCKETS.items():
        if only and name not in only:
            continue
        if apply:
            prefix = f'R2_{name.upper()}_'
            access, secret = os.environ.get(prefix + 'ACCESS_KEY_ID'), os.environ.get(prefix + 'SECRET_ACCESS_KEY')
            if not (access and secret and cfg['account'] and cfg['bucket']):
                print(f'· {name}: sin clave o sin cuenta/bucket en el entorno, se salta')
            else:
                try:
                    put_cors(cfg['account'], access, secret, cfg['bucket'])
                    print(f'· {name}: política CORS aplicada')
                except urllib.error.HTTPError as error:
                    detail = error.read().decode(errors='replace')[:200]
                    print(f'· {name}: no se pudo aplicar (HTTP {error.code}). ¿La clave es «Admin Read & Write»? {detail}')
        print(f'  {name}: {check(name, cfg["public"])}')


if __name__ == '__main__':
    main()
