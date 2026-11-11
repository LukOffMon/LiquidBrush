#!/usr/bin/env bash
# Instala Liquid SKd en un servidor Ubuntu (Oracle Cloud Always Free, Raspberry Pi…).
# Uso (en el servidor, dentro de la carpeta soulseek/ del repositorio):
#   bash instalar.sh
# Se puede repetir: no borra tu música ni cambia tus claves.
set -euo pipefail
cd "$(dirname "$0")"

echo "== Liquid SKd: instalación =="

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "· Instalando Docker…"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# 2. Cortafuegos de Ubuntu (las imágenes de Oracle traen iptables cerrado): 80, 443 y 50300
if command -v iptables >/dev/null 2>&1; then
  for puerto in 80 443 50300; do
    if ! sudo iptables -C INPUT -p tcp --dport "$puerto" -j ACCEPT 2>/dev/null; then
      sudo iptables -I INPUT 5 -p tcp --dport "$puerto" -j ACCEPT
      echo "· Abierto el puerto $puerto en el cortafuegos del servidor"
    fi
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save >/dev/null 2>&1 || true
  else sudo apt-get install -y iptables-persistent >/dev/null 2>&1 && sudo netfilter-persistent save >/dev/null 2>&1 || true; fi
fi

# 3. Carpetas (slskd corre como el usuario 1000)
mkdir -p slskd/incomplete musica datos caddy-datos caddy-config
sudo chown -R 1000:1000 slskd musica datos 2>/dev/null || true

# 4. .env con claves aleatorias (solo la primera vez)
aleatorio() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
if [ ! -f .env ]; then
  IP=$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me || echo "")
  DOMINIO_SUGERIDO="${IP//./-}.sslip.io"
  read -r -p "Dirección pública [${DOMINIO_SUGERIDO}]: " DOMINIO
  DOMINIO=${DOMINIO:-$DOMINIO_SUGERIDO}
  cat > .env <<ENV
DOMINIO=${DOMINIO}
LIQUID_CLAVE=$(aleatorio 40)
SLSKD_API_KEY=$(aleatorio 40)
SLSKD_WEB_USUARIO=liquid
SLSKD_WEB_CONTRASENA=$(aleatorio 24)
ORIGENES=https://lukoffmon.github.io
ENV
  chmod 600 .env
  echo "· Creado .env"
fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a

# 5. Configuración de slskd (solo la primera vez: pide tu cuenta de Soulseek)
if [ ! -f slskd/slskd.yml ]; then
  read -r -p "Usuario de Soulseek (si no tienes, inventa uno nuevo): " SLSK_USUARIO
  read -r -s -p "Contraseña de Soulseek: " SLSK_CONTRASENA; echo
  comillas() { printf "'%s'" "${1//\'/\'\'}"; }
  cat > slskd/slskd.yml <<YML
# Generado por instalar.sh
soulseek:
  username: $(comillas "$SLSK_USUARIO")
  password: $(comillas "$SLSK_CONTRASENA")
  listen_port: 50300
directories:
  incomplete: /app/incomplete
  downloads: /musica
shares:
  directories:
    - /musica
web:
  authentication:
    username: $(comillas "$SLSKD_WEB_USUARIO")
    password: $(comillas "$SLSKD_WEB_CONTRASENA")
    api_keys:
      liquid:
        key: $(comillas "$SLSKD_API_KEY")
        cidr: 0.0.0.0/0,::/0
YML
  chmod 600 slskd/slskd.yml
  sudo chown 1000:1000 slskd/slskd.yml 2>/dev/null || true
  echo "· Creado slskd/slskd.yml"
fi

# 6. Arranque
$DOCKER compose pull
$DOCKER compose up -d
echo
echo "== Listo =="
echo "Espera un minuto (el certificado HTTPS tarda) y comprueba: https://${DOMINIO}/salud"
echo
echo "En Liquid: Ajustes → Liquid ATK → SKd · Soulseek"
echo "  Dirección:  https://${DOMINIO}"
echo "  Clave:      ${LIQUID_CLAVE}"
echo
echo "(La clave está también en soulseek/.env de este servidor. No la compartas.)"
