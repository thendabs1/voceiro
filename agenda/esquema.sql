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
-- Índices derivados de la clasificación común, independiente del proveedor.
CREATE TABLE IF NOT EXISTS agenda_temas (
    id TEXT PRIMARY KEY,
    datos_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_tema_padres (
    tema TEXT NOT NULL REFERENCES agenda_temas(id),
    padre TEXT NOT NULL REFERENCES agenda_temas(id),
    PRIMARY KEY (tema, padre),
    CHECK (tema <> padre)
);
CREATE INDEX IF NOT EXISTS agenda_tema_hijos ON agenda_tema_padres(padre, tema);
CREATE TABLE IF NOT EXISTS agenda_evento_tema (
    evento TEXT NOT NULL REFERENCES agenda_eventos(id),
    tema TEXT NOT NULL REFERENCES agenda_temas(id),
    evidencias_json TEXT NOT NULL,
    PRIMARY KEY (evento, tema)
);
CREATE INDEX IF NOT EXISTS agenda_tema_eventos ON agenda_evento_tema(tema, evento);
CREATE TABLE IF NOT EXISTS agenda_clasificacion_revisiones (
    id INTEGER PRIMARY KEY,
    modificado TEXT NOT NULL,
    anterior_json TEXT,
    nuevo_json TEXT NOT NULL
);
-- Núcleo v2. Las tablas anteriores conservan el piloto y toda su auditoría.
CREATE TABLE IF NOT EXISTS agenda_entidades (
    tipo TEXT NOT NULL,
    id TEXT NOT NULL,
    clase TEXT NOT NULL,
    datos_json TEXT NOT NULL,
    PRIMARY KEY (tipo, id),
    CHECK (tipo IN ('evento','agrupacion','actividad','participante','lugar','territorio'))
);
CREATE TABLE IF NOT EXISTS agenda_documentos (
    id TEXT PRIMARY KEY,
    fuente TEXT NOT NULL,
    datos_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agenda_referencias (
    id TEXT PRIMARY KEY,
    proveedor TEXT NOT NULL,
    tipo_externo TEXT NOT NULL,
    contexto_json TEXT NOT NULL,
    id_externo TEXT NOT NULL,
    tipo_destino TEXT,
    destino TEXT,
    datos_json TEXT NOT NULL,
    UNIQUE (proveedor, tipo_externo, contexto_json, id_externo),
    FOREIGN KEY (tipo_destino, destino) REFERENCES agenda_entidades(tipo, id),
    CHECK ((tipo_destino IS NULL) = (destino IS NULL))
);
CREATE INDEX IF NOT EXISTS agenda_referencias_destino ON agenda_referencias(tipo_destino, destino);
CREATE TABLE IF NOT EXISTS agenda_observaciones (
    id TEXT PRIMARY KEY,
    referencia TEXT NOT NULL REFERENCES agenda_referencias(id),
    documento TEXT NOT NULL REFERENCES agenda_documentos(id),
    observado TEXT NOT NULL,
    ultima_observacion TEXT NOT NULL,
    datos_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_observaciones_ref ON agenda_observaciones(referencia, ultima_observacion);
CREATE TABLE IF NOT EXISTS agenda_relaciones (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    origen_tipo TEXT NOT NULL,
    origen TEXT NOT NULL,
    destino_tipo TEXT NOT NULL,
    destino TEXT NOT NULL,
    ambito_tipo TEXT,
    ambito TEXT,
    datos_json TEXT NOT NULL,
    FOREIGN KEY (origen_tipo, origen) REFERENCES agenda_entidades(tipo, id),
    FOREIGN KEY (destino_tipo, destino) REFERENCES agenda_entidades(tipo, id),
    FOREIGN KEY (ambito_tipo, ambito) REFERENCES agenda_entidades(tipo, id),
    CHECK ((ambito_tipo IS NULL) = (ambito IS NULL))
);
CREATE INDEX IF NOT EXISTS agenda_relaciones_destino ON agenda_relaciones(destino_tipo, destino, tipo);
CREATE TABLE IF NOT EXISTS agenda_participaciones (
    id TEXT PRIMARY KEY,
    evento_tipo TEXT NOT NULL CHECK (evento_tipo = 'evento'),
    evento TEXT NOT NULL,
    participante_tipo TEXT CHECK (participante_tipo = 'participante'),
    participante TEXT,
    datos_json TEXT NOT NULL,
    FOREIGN KEY (evento_tipo, evento) REFERENCES agenda_entidades(tipo, id),
    FOREIGN KEY (participante_tipo, participante) REFERENCES agenda_entidades(tipo, id),
    CHECK ((participante_tipo IS NULL) = (participante IS NULL))
);
CREATE INDEX IF NOT EXISTS agenda_participaciones_persona ON agenda_participaciones(participante, evento);
CREATE TABLE IF NOT EXISTS agenda_resultados (
    id TEXT PRIMARY KEY,
    evento_tipo TEXT NOT NULL CHECK (evento_tipo = 'evento'),
    evento TEXT NOT NULL,
    observacion TEXT NOT NULL REFERENCES agenda_observaciones(id),
    datos_json TEXT NOT NULL,
    FOREIGN KEY (evento_tipo, evento) REFERENCES agenda_entidades(tipo, id)
);
CREATE TABLE IF NOT EXISTS agenda_clasificaciones (
    id TEXT PRIMARY KEY,
    ambito_tipo TEXT NOT NULL CHECK (ambito_tipo = 'agrupacion'),
    ambito TEXT NOT NULL,
    observacion TEXT NOT NULL REFERENCES agenda_observaciones(id),
    datos_json TEXT NOT NULL,
    FOREIGN KEY (ambito_tipo, ambito) REFERENCES agenda_entidades(tipo, id)
);
CREATE TABLE IF NOT EXISTS agenda_nucleo_politicas (
    id TEXT PRIMARY KEY,
    objetivo_tipo TEXT NOT NULL,
    objetivo TEXT NOT NULL,
    bloque TEXT NOT NULL,
    datos_json TEXT NOT NULL,
    FOREIGN KEY (objetivo_tipo, objetivo) REFERENCES agenda_entidades(tipo, id),
    UNIQUE (objetivo_tipo, objetivo, bloque)
);
CREATE TABLE IF NOT EXISTS agenda_nucleo_selecciones (
    id TEXT PRIMARY KEY,
    objetivo_tipo TEXT NOT NULL,
    objetivo TEXT NOT NULL,
    bloque TEXT NOT NULL,
    datos_json TEXT NOT NULL,
    FOREIGN KEY (objetivo_tipo, objetivo) REFERENCES agenda_entidades(tipo, id),
    UNIQUE (objetivo_tipo, objetivo, bloque)
);
CREATE TABLE IF NOT EXISTS agenda_tiempos (
    tipo TEXT NOT NULL,
    objetivo TEXT NOT NULL,
    inicio_fecha TEXT,
    inicio_instante TEXT,
    fin_fecha TEXT,
    fin_instante TEXT,
    datos_json TEXT NOT NULL,
    PRIMARY KEY (tipo, objetivo),
    FOREIGN KEY (tipo, objetivo) REFERENCES agenda_entidades(tipo, id)
);
CREATE INDEX IF NOT EXISTS agenda_tiempos_civil ON agenda_tiempos(tipo, inicio_fecha, fin_fecha);
CREATE INDEX IF NOT EXISTS agenda_tiempos_utc ON agenda_tiempos(tipo, inicio_instante, fin_instante);
