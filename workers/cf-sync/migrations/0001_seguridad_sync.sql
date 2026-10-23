-- Aplicar antes de desplegar los dos servidores. No borra bloques existentes.
-- filas_v2 no se mezcla con los incrementos manuales de versiones antiguas.
INSERT OR IGNORE INTO estado (clave, valor)
SELECT 'filas_v2', COUNT(*) FROM sync;

CREATE TABLE IF NOT EXISTS revocados (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS sync_impedir_revocado
BEFORE INSERT ON sync
WHEN EXISTS (SELECT 1 FROM revocados WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'sync_revocado');
END;

CREATE TRIGGER IF NOT EXISTS sync_contar_alta
AFTER INSERT ON sync
BEGIN
  UPDATE estado SET valor = valor + 1 WHERE clave = 'filas_v2';
END;

CREATE TRIGGER IF NOT EXISTS sync_contar_baja
AFTER DELETE ON sync
BEGIN
  UPDATE estado SET valor = valor - 1 WHERE clave = 'filas_v2';
END;

-- Una marca solo se inserta mediante SELECT de una fila cuyo token coincide.
-- El borrado y la marca son indivisibles; DELETE repetidos no crean marcas.
CREATE TRIGGER IF NOT EXISTS sync_revocar
AFTER INSERT ON revocados
BEGIN
  DELETE FROM sync WHERE id = NEW.id AND token_hash = NEW.token_hash;
END;

-- Esta vista vacía es una entrada de escritura, no almacena una relación IP–código.
-- Toda la operación ocurre dentro de la sentencia INSERT y se revierte completa
-- si falla. Funciona igual por binding de D1 y por su API HTTP.
CREATE VIEW IF NOT EXISTS sync_crear AS
SELECT NULL AS id, NULL AS token_hash, NULL AS datos, NULL AS ahora,
       NULL AS ip, NULL AS dia, NULL AS max_altas, NULL AS max_filas
WHERE 0;

CREATE TRIGGER IF NOT EXISTS sync_crear_atomico
INSTEAD OF INSERT ON sync_crear
BEGIN
  SELECT RAISE(ABORT, 'sync_revocado')
    WHERE EXISTS (SELECT 1 FROM revocados WHERE id = NEW.id);
  SELECT RAISE(ABORT, 'sync_existe')
    WHERE EXISTS (SELECT 1 FROM sync WHERE id = NEW.id);
  SELECT RAISE(ABORT, 'sync_altas')
    WHERE COALESCE((SELECT n FROM altas WHERE ip = NEW.ip AND dia = NEW.dia), 0) >= NEW.max_altas;
  SELECT RAISE(ABORT, 'sync_lleno')
    WHERE COALESCE((SELECT valor FROM estado WHERE clave = 'filas_v2'), NEW.max_filas) >= NEW.max_filas;
  INSERT INTO sync (id, token_hash, version, datos, creado, actualizado, accedido)
    VALUES (NEW.id, NEW.token_hash, 1, NEW.datos, NEW.ahora, NEW.ahora, NEW.ahora);
  INSERT INTO altas (ip, dia, n) VALUES (NEW.ip, NEW.dia, 1)
    ON CONFLICT(ip, dia) DO UPDATE SET n = n + 1;
END;
