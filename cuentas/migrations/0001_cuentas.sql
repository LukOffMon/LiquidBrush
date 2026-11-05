-- Cuentas de Liquid Bullet · esquema inicial (D1 / SQLite)
-- Fechas en segundos Unix; ids, hashes y sales en BLOB (la mitad que en hexadecimal).
-- Solo datos de la cuenta: lo de la música de cada persona vive en R2 (bucket liquid-cuentas).

CREATE TABLE usuarios (
  id           BLOB    PRIMARY KEY,            -- 16 bytes aleatorios
  correo       TEXT    NOT NULL,               -- lower(trim(correo))
  confirmado   INTEGER NOT NULL DEFAULT 0,     -- fecha de confirmación (0 = sin confirmar)
  clave_hash   BLOB    NOT NULL,               -- 32 bytes
  clave_sal    BLOB    NOT NULL,               -- 16 bytes
  clave_ver    INTEGER NOT NULL DEFAULT 1,     -- versión del esquema de hash
  nombre       TEXT,
  avatar       TEXT,                           -- 'inicial:#ff7ad9' | 'fondo:07'
  creado       INTEGER NOT NULL,
  actualizado  INTEGER NOT NULL,
  borrar_el    INTEGER                         -- borrado programado (7 días) o NULL
) STRICT;
CREATE UNIQUE INDEX usuarios_correo ON usuarios(correo);
CREATE INDEX usuarios_borrar ON usuarios(borrar_el) WHERE borrar_el IS NOT NULL;

CREATE TABLE sesiones (
  id           BLOB    PRIMARY KEY,            -- 16 bytes
  usuario      BLOB    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  familia      BLOB    NOT NULL,               -- todas las renovaciones de un mismo inicio de sesión
  token_hash   BLOB    NOT NULL,               -- SHA-256 del token de renovación vigente
  token_previo BLOB,                           -- SHA-256 del anterior: si vuelve a usarse, robo → se revoca la familia
  dispositivo  TEXT,                           -- 'Android · Chrome'
  creada       INTEGER NOT NULL,
  vista        INTEGER NOT NULL,               -- se actualiza como mucho 1 vez por hora
  caduca       INTEGER NOT NULL,
  revocada     INTEGER                         -- fecha o NULL
) STRICT;
CREATE UNIQUE INDEX sesiones_token ON sesiones(token_hash);
CREATE INDEX sesiones_previo ON sesiones(token_previo) WHERE token_previo IS NOT NULL;
CREATE INDEX sesiones_usuario ON sesiones(usuario, caduca);
CREATE INDEX sesiones_familia ON sesiones(familia);

CREATE TABLE codigos (
  correo       TEXT    NOT NULL,
  motivo       TEXT    NOT NULL CHECK (motivo IN ('alta', 'recuperar', 'cambiar-correo', 'borrar')),
  codigo_hash  BLOB    NOT NULL,               -- HMAC(pimienta, código|correo|motivo)
  datos        TEXT,                           -- alta pendiente: hash, sal y nombre (JSON)
  intentos     INTEGER NOT NULL DEFAULT 0,
  enviado      INTEGER NOT NULL,               -- último envío (1 reenvío por minuto)
  envios       INTEGER NOT NULL DEFAULT 1,     -- envíos en la ventana de 1 hora
  ventana      INTEGER NOT NULL,               -- inicio de esa ventana
  caduca       INTEGER NOT NULL,
  PRIMARY KEY (correo, motivo)                 -- un código vivo por motivo
) STRICT, WITHOUT ROWID;
CREATE INDEX codigos_caduca ON codigos(caduca);

CREATE TABLE passkeys (
  id           BLOB    PRIMARY KEY,            -- id de credencial WebAuthn
  usuario      BLOB    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  clave_publica BLOB   NOT NULL,
  contador     INTEGER NOT NULL DEFAULT 0,
  nombre       TEXT,
  creada       INTEGER NOT NULL,
  usada        INTEGER
) STRICT, WITHOUT ROWID;
CREATE INDEX passkeys_usuario ON passkeys(usuario);

CREATE TABLE actividad (
  usuario      BLOB    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha        INTEGER NOT NULL,
  tipo         TEXT    NOT NULL,               -- 'alta','entrada','clave','correo','dispositivo','passkey','borrado'
  dispositivo  TEXT
) STRICT;
CREATE INDEX actividad_usuario ON actividad(usuario, fecha DESC);

-- Contadores con caducidad (p. ej. correos enviados hoy: tope propio por debajo del de Gmail)
CREATE TABLE contadores (
  clave        TEXT    PRIMARY KEY,
  valor        INTEGER NOT NULL,
  caduca       INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
