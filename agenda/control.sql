-- Control operativo aditivo. Comparte la base, no la revisión pública del núcleo.
CREATE TABLE IF NOT EXISTS agenda_control_esquema (
    id INTEGER PRIMARY KEY CHECK(id=1),
    version INTEGER NOT NULL CHECK(version=1),
    revision INTEGER NOT NULL CHECK(revision>=0)
);
CREATE TABLE IF NOT EXISTS agenda_temporadas (
    id TEXT PRIMARY KEY,
    coleccion TEXT NOT NULL,
    referencia TEXT NOT NULL,
    estado TEXT NOT NULL CHECK(estado IN ('anunciada','activa','en_cierre','cerrada','pausada')),
    proxima_revision TEXT,
    revision INTEGER NOT NULL CHECK(revision>=0),
    datos_json TEXT NOT NULL,
    UNIQUE(coleccion,referencia)
);
CREATE INDEX IF NOT EXISTS agenda_temporadas_revision ON agenda_temporadas(estado,proxima_revision);
CREATE TABLE IF NOT EXISTS agenda_pasadas (
    id TEXT PRIMARY KEY,
    temporada TEXT REFERENCES agenda_temporadas(id),
    proveedor TEXT NOT NULL,
    estado TEXT NOT NULL CHECK(estado IN ('en_curso','completa','parcial','fallida','interrumpida','contraste')),
    iniciada TEXT NOT NULL,
    lease_hasta TEXT NOT NULL,
    datos_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_pasadas_temporada ON agenda_pasadas(temporada,iniciada);
CREATE TABLE IF NOT EXISTS agenda_cobertura (
    temporada TEXT NOT NULL REFERENCES agenda_temporadas(id),
    proveedor TEXT NOT NULL,
    unidad TEXT NOT NULL,
    recurso TEXT NOT NULL,
    comprobado TEXT NOT NULL,
    pasada TEXT NOT NULL REFERENCES agenda_pasadas(id),
    datos_json TEXT NOT NULL,
    PRIMARY KEY(temporada,proveedor,unidad,recurso)
);
CREATE TABLE IF NOT EXISTS agenda_control_eventos (
    temporada TEXT NOT NULL REFERENCES agenda_temporadas(id),
    evento TEXT NOT NULL,
    proveedor TEXT NOT NULL,
    unidad TEXT NOT NULL,
    comprobado TEXT NOT NULL,
    datos_json TEXT NOT NULL,
    PRIMARY KEY(temporada,evento)
);
CREATE INDEX IF NOT EXISTS agenda_control_eventos_unidad ON agenda_control_eventos(temporada,proveedor,unidad);
CREATE TABLE IF NOT EXISTS agenda_control_consumo (
    proveedor TEXT NOT NULL,
    periodo TEXT NOT NULL,
    peticiones INTEGER NOT NULL CHECK(peticiones>=0),
    datos_json TEXT NOT NULL,
    PRIMARY KEY(proveedor,periodo)
);
CREATE TABLE IF NOT EXISTS agenda_descubrimientos (
    coleccion TEXT PRIMARY KEY,
    proxima_revision TEXT NOT NULL,
    datos_json TEXT NOT NULL
);
