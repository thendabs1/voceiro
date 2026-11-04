"""Contrato del bloque `atletismo` v2: qué acredita cada fuente de un registro.

Todo es opcional y se valida solo si está presente: los adaptadores lo adoptan
uno a uno y lo que no se lee no se inventa. Cada dimensión es independiente y
«desconocido» es un valor legítimo, no una igualdad con nada.

La evidencia dice dónde consta el dato, nunca cuándo se leyó: el núcleo identifica
una observación por su contenido y ya guarda sus fechas, así que una fecha de
lectura dentro del bloque crearía una observación nueva en cada pasada.
"""
from datetime import date
from urllib.parse import urlsplit

ALCANCES = ('reunion', 'titulo', 'titulos', 'sesion', 'jornada', 'serie', 'juegos', 'publicacion', 'desconocido')
ESTADOS = ('programado', 'aplazado', 'suspendido', 'suspension_parcial', 'cancelado', 'desconocido')
PRECISIONES = ('dia', 'mes', 'desconocida')
RELACIONES = ('propio', 'reflejo', 'desconocido')
ACTIVIDADES = ('competicion', 'control', 'tecnificacion', 'desconocida')
ROLES = ('normas', 'reglamento', 'informacion_tecnica', 'horario', 'inscritos', 'resultados',
         'clasificacion', 'circular', 'acta', 'otro')
CLASES_SERIE = ('circuito', 'ciclo', 'coleccion')
EVIDENCIA = {'superficie', 'url', 'localizador', 'literal'}


def _fallo(campo, motivo):
    raise ValueError(f'Bloque de atletismo: {campo} {motivo}')


def _texto(campo, valor):
    if not isinstance(valor, str) or not valor.strip():
        _fallo(campo, 'debe ser texto no vacío')


def _url(campo, valor):
    _texto(campo, valor)
    try:
        partes = urlsplit(valor)
        partes.port  # Lanza ValueError si el puerto no es válido.
        valida = (partes.scheme == 'https' and partes.hostname and not (partes.username or partes.password)
                  and not any(c.isspace() for c in valor))
    except ValueError:
        valida = False
    if not valida:
        _fallo(campo, 'debe ser una URL https sin credenciales')


def _claves(campo, valor, admitidas, obligatorias=()):
    if not isinstance(valor, dict):
        _fallo(campo, 'debe ser un objeto')
    if sobran := set(valor) - set(admitidas):
        _fallo(campo, f'tiene claves desconocidas: {sorted(sobran)}')
    if faltan := set(obligatorias) - set(valor):
        _fallo(campo, f'no tiene {sorted(faltan)}')


def _textos(campo, valor, claves):
    for k in claves:
        if k in valor:
            _texto(f'{campo}.{k}', valor[k])


def _opcion(campo, valor, opciones):
    if valor not in opciones:
        _fallo(campo, f'tiene un valor desconocido: {valor!r}')


def _evidencia(campo, valor):
    _claves(campo, valor, EVIDENCIA, ('superficie', 'url'))
    _texto(campo + '.superficie', valor['superficie'])
    _url(campo + '.url', valor['url'])
    _textos(campo, valor, ('localizador', 'literal'))


def _acreditado(campo, valor, exigida):
    if 'evidencia' in valor:
        _evidencia(campo + '.evidencia', valor['evidencia'])
    elif exigida:
        _fallo(campo, 'necesita evidencia')


def _lista(campo, valor):
    if not isinstance(valor, list):
        _fallo(campo, 'debe ser una lista')
    return [(f'{campo}[{i}]', x) for i, x in enumerate(valor)]


def _alcance(v):
    _claves('alcance', v, {'tipo', 'literal', 'evidencia'}, ('tipo',))
    _opcion('alcance.tipo', v['tipo'], ALCANCES)
    _textos('alcance', v, ('literal',))
    _acreditado('alcance', v, v['tipo'] != 'desconocido')


def _temporalidad(v, inicio, fin):
    _claves('temporalidad', v, {'texto', 'dias', 'precision', 'estado', 'estado_literal', 'evidencia'}, ('evidencia',))
    _evidencia('temporalidad.evidencia', v['evidencia'])
    _textos('temporalidad', v, ('texto', 'estado_literal'))
    if 'precision' in v:
        _opcion('temporalidad.precision', v['precision'], PRECISIONES)
    if 'estado' in v:
        _opcion('temporalidad.estado', v['estado'], ESTADOS)
    dias = v.get('dias', [])
    for campo, dia in _lista('temporalidad.dias', dias):
        try:
            valido = date.fromisoformat(dia).isoformat() == dia
        except (TypeError, ValueError):
            valido = False
        if not valido:
            _fallo(campo, 'debe ser una fecha ISO')
        if not inicio <= dia <= fin:
            _fallo(campo, 'queda fuera de los días de la cita')
    if dias != sorted(set(dias)):
        _fallo('temporalidad.dias', 'debe ir ordenada y sin repetidos')


def _fuente(v):
    _claves('fuente', v, {'relacion', 'de', 'evidencia'}, ('relacion',))
    _opcion('fuente.relacion', v['relacion'], RELACIONES)
    _textos('fuente', v, ('de',))
    _acreditado('fuente', v, v['relacion'] != 'desconocido')


def _actividad(v):
    _claves('actividad', v, {'valor', 'escolar', 'evidencia'}, ('valor',))
    _opcion('actividad.valor', v['valor'], ACTIVIDADES)
    if 'escolar' in v and not isinstance(v['escolar'], bool):
        _fallo('actividad.escolar', 'debe ser booleano')
    _acreditado('actividad', v, v['valor'] != 'desconocida' or v.get('escolar', False))


def _titulos(v):
    for campo, t in _lista('titulos', v):
        _claves(campo, t, {'literal', 'evidencia'}, ('literal', 'evidencia'))
        _texto(campo + '.literal', t['literal'])
        _evidencia(campo + '.evidencia', t['evidencia'])


def _documentos(v):
    # `rol` aún es opcional: FGA publica hoy {nombre, url} y lo añadirá su adaptador.
    for campo, d in _lista('documentos', v):
        _claves(campo, d, {'url', 'nombre', 'rol', 'alcance_literal', 'hash', 'evidencia'}, ('url',))
        _url(campo + '.url', d['url'])
        _textos(campo, d, ('nombre', 'alcance_literal', 'hash'))
        if 'rol' in d:
            _opcion(campo + '.rol', d['rol'], ROLES)
        _acreditado(campo, d, 'rol' in d)


def _pertenencias(v):
    for campo, p in _lista('pertenencias', v):
        _claves(campo, p, {'padre_nativo', 'clase', 'evidencia'}, ('padre_nativo', 'evidencia'))
        _texto(campo + '.padre_nativo', p['padre_nativo'])
        if 'clase' in p:
            _opcion(campo + '.clase', p['clase'], CLASES_SERIE)
        _evidencia(campo + '.evidencia', p['evidencia'])


def validar(metadatos, inicio, fin):
    """Rechaza lo mal formado; `inicio` y `fin` son los días ISO de la cita."""
    for clave, comprobar in (('alcance', _alcance), ('fuente', _fuente), ('actividad', _actividad),
                             ('titulos', _titulos), ('documentos', _documentos), ('pertenencias', _pertenencias)):
        if clave in metadatos:
            comprobar(metadatos[clave])
    if 'temporalidad' in metadatos:
        _temporalidad(metadatos['temporalidad'], inicio, fin)


def titulares(variantes):
    """`fuente:relacion` por variante publicada, sin decidir qué se muestra."""
    return sorted({f"{v['procedencia']['fuente']}:{(v['valor'].get('fuente') or {}).get('relacion', 'desconocido')}"
                   for v in variantes})


def actividades(variantes):
    """Unión de lo acreditado; «desconocida» no filtra ni contradice."""
    valores = {(v['valor'].get('actividad') or {}).get('valor') for v in variantes}
    return [a for a in ACTIVIDADES if a in valores and a != 'desconocida']
