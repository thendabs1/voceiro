-- Base dedicada al calendario. Los JSON conservan el contrato y los originales;
-- las columnas y relaciones permiten consultar sin recorrer todos los documentos.
CREATE TABLE IF NOT EXISTS agenda_esquema (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0)
);
CREATE TABLE IF NOT EXISTS agenda_estado (
    clave TEXT PRIMARY KEY,
    valor_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_fuentes (
    id TEXT PRIMARY KEY,
    datos_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_regiones (
    id TEXT PRIMARY KEY,
    datos_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_grupos (
    id TEXT PRIMARY KEY,
    datos_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_eventos (
    id TEXT PRIMARY KEY,
    precision TEXT NOT NULL CHECK (precision IN ('dia', 'hora', 'desconocida')),
    inicio TEXT,
    fin TEXT,
    estado TEXT NOT NULL,
    datos_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_eventos_inicio ON agenda_eventos(precision, inicio);
CREATE TABLE IF NOT EXISTS agenda_evento_region (
    evento TEXT NOT NULL REFERENCES agenda_eventos(id),
    region TEXT NOT NULL REFERENCES agenda_regiones(id),
    PRIMARY KEY (evento, region)
);
CREATE INDEX IF NOT EXISTS agenda_region_eventos ON agenda_evento_region(region, evento);
CREATE TABLE IF NOT EXISTS agenda_evento_grupo (
    evento TEXT NOT NULL REFERENCES agenda_eventos(id),
    grupo TEXT NOT NULL REFERENCES agenda_grupos(id),
    PRIMARY KEY (evento, grupo)
);
CREATE INDEX IF NOT EXISTS agenda_grupo_eventos ON agenda_evento_grupo(grupo, evento);
CREATE TABLE IF NOT EXISTS agenda_registros (
    ref TEXT PRIMARY KEY,
    fuente TEXT NOT NULL REFERENCES agenda_fuentes(id),
    evento TEXT NOT NULL REFERENCES agenda_eventos(id),
    primera_recogida TEXT NOT NULL,
    ultima_recogida TEXT NOT NULL,
    datos_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_registros_evento ON agenda_registros(evento);
CREATE TABLE IF NOT EXISTS agenda_vinculos (
    ref TEXT PRIMARY KEY,
    evento TEXT NOT NULL REFERENCES agenda_eventos(id)
);
CREATE TABLE IF NOT EXISTS agenda_recogidas (
    id INTEGER PRIMARY KEY,
    observado TEXT NOT NULL,
    consultas_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_revisiones (
    id INTEGER PRIMARY KEY,
    ref TEXT NOT NULL REFERENCES agenda_registros(ref),
    recogida INTEGER NOT NULL REFERENCES agenda_recogidas(id),
    anterior_json TEXT,
    nuevo_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_revisiones_registro ON agenda_revisiones(ref, id);
