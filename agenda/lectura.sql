-- Proyección regenerable y aditiva. No modifica las tablas del núcleo v4.
CREATE TABLE IF NOT EXISTS agenda_lectura_control (
    id INTEGER PRIMARY KEY CHECK(id=1),
    version INTEGER NOT NULL CHECK(version=1),
    revision TEXT NOT NULL,
    origen_revision INTEGER NOT NULL CHECK(origen_revision>=0),
    datos_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_lectura_eventos (
    id TEXT PRIMARY KEY,
    texto TEXT NOT NULL,
    resultado INTEGER NOT NULL CHECK(resultado IN (0,1)),
    tarjeta_json TEXT NOT NULL,
    detalle_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_lectura_facetas (
    evento TEXT NOT NULL REFERENCES agenda_lectura_eventos(id),
    tipo TEXT NOT NULL,
    valor TEXT NOT NULL,
    PRIMARY KEY(tipo,valor,evento)
);
CREATE INDEX IF NOT EXISTS agenda_lectura_facetas_evento ON agenda_lectura_facetas(evento,tipo,valor);
CREATE TABLE IF NOT EXISTS agenda_lectura_tramos (
    zona TEXT NOT NULL,
    desde TEXT NOT NULL,
    hasta TEXT NOT NULL,
    evento TEXT NOT NULL REFERENCES agenda_lectura_eventos(id),
    PRIMARY KEY(zona,hasta,desde,evento)
);
CREATE INDEX IF NOT EXISTS agenda_lectura_tramos_evento ON agenda_lectura_tramos(evento,zona,desde,hasta);
CREATE TABLE IF NOT EXISTS agenda_lectura_entidades (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    texto TEXT NOT NULL,
    datos_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_lectura_entidades_tipo ON agenda_lectura_entidades(tipo,id);
