-- Liquid · v97: playlists colaborativas y Blends (como Spotify)
-- Una playlist colaborativa la editan todos sus miembros; un Blend mezcla el gusto de 2 a 10 personas.
-- Quien entra lo hace con el enlace de invitación (el id: 16 caracteres aleatorios, imposible de adivinar).
-- Al borrar una cuenta se van sus membresías; si era la dueña de una colaborativa, la playlist se borra para todos.

CREATE TABLE compartidas (
  id           TEXT    PRIMARY KEY,            -- 12 bytes aleatorios en base64url (16 caracteres)
  dueno        BLOB    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre       TEXT    NOT NULL,
  canciones    TEXT    NOT NULL DEFAULT '[]', -- JSON: [{ "i": id de canción, "p": quién la añadió, "t": fecha }]
  rev          INTEGER NOT NULL DEFAULT 1,     -- sube con cada cambio (control de concurrencia y «¿hay algo nuevo?»)
  creada       INTEGER NOT NULL,
  actualizada  INTEGER NOT NULL
) STRICT;
CREATE INDEX compartidas_dueno ON compartidas(dueno);

CREATE TABLE compartidas_miembros (
  lista        TEXT    NOT NULL REFERENCES compartidas(id) ON DELETE CASCADE,
  usuario      BLOB    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  unido        INTEGER NOT NULL,
  PRIMARY KEY (lista, usuario)
) STRICT, WITHOUT ROWID;
CREATE INDEX compartidas_miembros_usuario ON compartidas_miembros(usuario);

CREATE TABLE blends (
  id           TEXT    PRIMARY KEY,
  creada       INTEGER NOT NULL,
  actualizado  INTEGER NOT NULL
) STRICT;

CREATE TABLE blends_miembros (
  blend        TEXT    NOT NULL REFERENCES blends(id) ON DELETE CASCADE,
  usuario      BLOB    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  gusto        TEXT    NOT NULL,               -- JSON: { "t": [ids de canciones], "a": [claves de artistas] }
  unido        INTEGER NOT NULL,
  actualizado  INTEGER NOT NULL,
  PRIMARY KEY (blend, usuario)
) STRICT, WITHOUT ROWID;
CREATE INDEX blends_miembros_usuario ON blends_miembros(usuario);
