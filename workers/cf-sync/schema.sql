-- Sincronización de Voceiro (D1 voceiro-sync).
-- Base inicial: wrangler d1 execute voceiro-sync --remote --file schema.sql
-- Después: wrangler d1 migrations apply voceiro-sync --remote

-- Un bloque cifrado por código. id y token salen del código en el
-- navegador; aquí solo se guarda la huella del token.
CREATE TABLE IF NOT EXISTS sync (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL,
  version     INTEGER NOT NULL,
  datos       BLOB NOT NULL,
  creado      INTEGER NOT NULL,
  actualizado INTEGER NOT NULL,
  accedido    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_accedido ON sync(accedido);

-- Códigos nuevos por IP (huella, nunca la IP) y día.
CREATE TABLE IF NOT EXISTS altas (
  ip  TEXT NOT NULL,
  dia TEXT NOT NULL,
  n   INTEGER NOT NULL,
  PRIMARY KEY (ip, dia)
) WITHOUT ROWID;

-- Contadores: 'filas' evita contar la tabla en cada alta.
CREATE TABLE IF NOT EXISTS estado (
  clave TEXT PRIMARY KEY,
  valor INTEGER NOT NULL
) WITHOUT ROWID;
INSERT OR IGNORE INTO estado (clave, valor) VALUES ('filas', 0);
