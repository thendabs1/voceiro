"""Contrato v2: identidades tipadas, evidencia, relaciones y observaciones.

El JSON v1 de los importadores existentes se conserva durante la transición.
Este contrato se exporta por separado y no depende de un proveedor deportivo.
"""

from copy import deepcopy
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import json
from uuid import NAMESPACE_URL, uuid5

from .clasificacion import cargar_catalogo, validar as validar_catalogo
from . import tiempos


COLECCIONES = ('entidades', 'documentos', 'referencias', 'observaciones', 'relaciones',
               'participaciones', 'resultados', 'clasificaciones', 'politicas', 'selecciones')
TIPOS = {'evento', 'agrupacion', 'actividad', 'participante', 'lugar', 'territorio'}
CLASES = {
    'evento': {'encuentro', 'funcion', 'sesion', 'actividad_continua', 'desconocida'},
    'agrupacion': {'circuito', 'competicion', 'edicion', 'fase', 'cuadro', 'ciclo', 'festival', 'coleccion', 'gran_premio'},
    'participante': {'persona', 'equipo', 'pareja', 'club', 'organizacion'},
}
RELACIONES = {
    'es_edicion_de': ({'agrupacion'}, {'agrupacion'}),
    'es_parte_de': ({'agrupacion'}, {'agrupacion'}),
    'pertenece_a': ({'evento', 'actividad'}, {'agrupacion'}),
    'celebracion_de': ({'evento'}, {'actividad'}),
    'compuesta_por': ({'participante'}, {'participante'}),
    'inscrito_en': ({'participante'}, {'agrupacion'}),
    'pertenece_al_club': ({'participante'}, {'participante'}),
    'se_celebra_en': ({'evento', 'agrupacion'}, {'lugar', 'territorio'}),
    'ubicado_en': ({'lugar'}, {'territorio'}),
}
METRICAS = {
    'baloncesto.puntos': ('entero', 'puntos', True),
    'baloncesto.partidos_jugados': ('entero', 'partidos', True),
    'baloncesto.victorias': ('entero', 'partidos', True),
    'baloncesto.derrotas': ('entero', 'partidos', True),
    'baloncesto.puntos_favor': ('entero', 'puntos', True),
    'baloncesto.puntos_contra': ('entero', 'puntos', True),
    'baloncesto.diferencia': ('entero', 'puntos', False),
    'baloncesto.porcentaje_victorias': ('decimal', 'porcentaje', True),
    'tenis.sets_ganados': ('entero', 'sets', True),
    'tenis.juegos': ('entero', 'juegos', True),
    'tenis.puntos_desempate': ('entero', 'puntos', True),
    'carrera.posicion': ('entero', 'posicion', True),
    'carrera.tiempo': ('decimal', 'segundos', True),
}


def json_canonico(valor):
    return json.dumps(valor, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def identificador(*partes):
    return str(uuid5(NAMESPACE_URL, 'https://voceiro.eu/agenda/v2/' + json_canonico(partes)))


def clave(objetivo):
    return objetivo['tipo'] + ':' + objetivo['id']


def objetivo(tipo, identidad):
    return {'tipo': tipo, 'id': identidad}


def nuevo():
    return {'version': 2, 'catalogo': cargar_catalogo(), 'fuentes': {},
            **{c: {} for c in COLECCIONES}}


def ultimas(n):
    salida, fechas = {}, {}
    for i, o in n['observaciones'].items():
        ref, fecha = o['referencia'], tiempos.instante(o['ultima_observacion'])
        if ref not in fechas or fecha > fechas[ref]:
            fechas[ref], salida[ref] = fecha, {i}
        elif fecha == fechas[ref]:
            salida[ref].add(i)
    return set().union(*salida.values()) if salida else set()


def vigente(n, dato, activas=None):
    return not dato.get('suspendida', False) and bool(
        set(dato['evidencias']) & (ultimas(n) if activas is None else activas))


class Constructor:
    """Construye una copia; el llamante valida antes de persistirla."""

    def __init__(self, anterior=None):
        self.n = deepcopy(anterior) if anterior else nuevo()
        if self.n.get('version') != 2:
            raise ValueError('Versión de núcleo incompatible')
        self._ultima_por_referencia = {}
        for o in self.n['observaciones'].values():
            fecha = tiempos.instante(o['ultima_observacion'])
            ref = o['referencia']
            self._ultima_por_referencia[ref] = max(fecha, self._ultima_por_referencia.get(ref, fecha))

    def documento(self, fuente, contenido, url=None, clase='respuesta'):
        huella = sha256(json_canonico(contenido).encode()).hexdigest()
        i = identificador('documento', fuente, url, huella)
        self.n['documentos'][i] = {'id': i, 'fuente': fuente, 'url': url,
                                  'huella': huella, 'clase': clase, 'contenido': deepcopy(contenido)}
        return i

    def entidad(self, proveedor, tipo_externo, id_externo, contexto, tipo, clase, nombres,
                documento, ruta, observado, bloques=None, identidad=None, referencia=None,
                historico=False):
        tupla = (proveedor, tipo_externo, contexto, id_externo)
        ref = referencia or identificador('referencia', *tupla)
        previa = self.n['referencias'].get(ref)
        destino = previa['destino'] if previa else objetivo(tipo, identidad or identificador('entidad', ref))
        if destino['tipo'] != tipo or (identidad is not None and destino['id'] != identidad):
            raise ValueError('Una referencia no cambia de identidad sin conciliación explícita')
        self.n['referencias'][ref] = {'id': ref, 'proveedor': proveedor, 'tipo_externo': tipo_externo,
                                    'contexto': deepcopy(contexto), 'id_externo': id_externo,
                                    'destino': destino}
        if previa and any(previa[c] != self.n['referencias'][ref][c]
                          for c in ('proveedor', 'tipo_externo', 'contexto', 'id_externo')):
            raise ValueError('Referencia externa reutilizada con otro contexto')
        contenido = {'nombres': deepcopy(nombres), 'clase': clase, **deepcopy(bloques or {})}
        oid = identificador('observacion', ref, documento, ruta, contenido)
        momento = tiempos.instante(observado)
        ultima = self._ultima_por_referencia.get(ref, momento)
        antigua = momento < ultima
        if antigua and not historico:
            raise ValueError('Observación anterior a la última de su referencia')
        self._ultima_por_referencia[ref] = max(ultima, momento)
        previa_o = self.n['observaciones'].get(oid, {})
        self.n['observaciones'][oid] = {'id': oid, 'referencia': ref, 'documento': documento,
            'ruta': ruta, 'observado': previa_o.get('observado', observado),
            'ultima_observacion': max((previa_o.get('ultima_observacion', observado), observado),
                                     key=tiempos.instante), 'bloques': contenido}
        k = clave(destino)
        e = self.n['entidades'].setdefault(k, {**destino, 'clase': clase, 'nombres': {},
                                              'evidencias': [], 'temas': []})
        if e['clase'] != clase:
            raise ValueError('Clase de entidad incompatible con su identidad')
        if not antigua:
            e['nombres'].update(deepcopy(nombres))
        if oid not in e['evidencias']:
            e['evidencias'].append(oid)
        return destino, oid

    def relacion(self, tipo, origen, destino, evidencia, ambito=None):
        i = identificador('relacion', tipo, origen, destino, ambito)
        r = self.n['relaciones'].setdefault(i, {'id': i, 'tipo': tipo,
            'origen': origen, 'destino': destino, 'ambito': ambito, 'evidencias': [], 'suspendida': False})
        if evidencia not in r['evidencias']:
            r['evidencias'].append(evidencia)
        return i

    def participar(self, evento, slot, participante, literal, papel, evidencia, orden=None):
        i = identificador('participacion', evento, slot, participante)
        previa = self.n['participaciones'].get(i, {})
        self.n['participaciones'][i] = {'id': i, 'evento': evento, 'slot': slot,
            'participante': participante, 'literal': literal, 'papel': papel, 'orden': orden,
            'evidencias': list(dict.fromkeys([*previa.get('evidencias', []), evidencia]))}
        return i

    def tema(self, destino, tema, evidencia, correspondencia):
        datos = {'tema': tema, 'evidencias': [evidencia], 'metodo': 'correspondencia_revisada',
                 'correspondencia': correspondencia, 'version_catalogo': self.n['catalogo']['version']}
        e = self.n['entidades'][clave(destino)]
        if datos not in e['temas']:
            e['temas'].append(datos)

    def preferir(self, destino, bloque, referencia, motivo):
        k = identificador('seleccion', destino, bloque)
        self.n['politicas'][k] = {'id': k, 'objetivo': destino, 'bloque': bloque,
            'modo': 'referencia', 'referencia': referencia, 'motivo': motivo}

    def terminar(self):
        recalcular_selecciones(self.n)
        validar(self.n)
        return self.n


def seleccionar(n, destino, bloque, activas=None, candidatas=None):
    """Política por bloque; ninguna prioridad implícita por proveedor o descarga."""
    k = identificador('seleccion', destino, bloque)
    politica = n['politicas'].get(k, {})
    candidatos = {}
    for i in sorted(candidatas if candidatas is not None else ultimas(n) if activas is None else activas):
        o = n['observaciones'][i]
        if n['referencias'][o['referencia']]['destino'] == destino and bloque in o['bloques']:
            candidatos[o['referencia']] = {'valor': o['bloques'][bloque],
                                           'referencia': o['referencia'], 'observacion': i}
    if politica.get('modo') == 'editorial':
        return {**politica['seleccion'], 'conflicto': False, 'motivo': 'editorial'}
    preferida = politica.get('referencia')
    if preferida is not None:
        if preferida not in candidatos:
            raise ValueError('Política sin observación del bloque elegido')
        return {**candidatos[preferida], 'conflicto': False, 'motivo': 'referencia_preferida'}
    valores = {json_canonico(c['valor']) for c in candidatos.values()}
    if len(valores) == 1:
        # Todos coinciden: el orden solo hace reproducible la evidencia representativa.
        return {**candidatos[sorted(candidatos)[0]], 'conflicto': False,
                'motivo': 'coincidencia', 'referencias': sorted(candidatos)}
    anterior = n['selecciones'].get(k, {}).get('seleccion', {})
    return {'valor': deepcopy(anterior.get('valor')), 'referencia': anterior.get('referencia'),
            'observacion': anterior.get('observacion'), 'conflicto': bool(candidatos),
            'motivo': 'sin_politica', 'referencias': sorted(candidatos)}


def recalcular_selecciones(n):
    activas = ultimas(n)
    objetivos, por_objetivo = set(), {}
    for o in n['observaciones'].values():
        d = n['referencias'][o['referencia']]['destino']
        if o['id'] in activas:
            por_objetivo.setdefault(clave(d), []).append(o['id'])
        for bloque in ('programacion', 'lugar', 'resultado', 'clasificacion'):
            if bloque in o['bloques']:
                objetivos.add((d['tipo'], d['id'], bloque))
    for tipo, i, bloque in sorted(objetivos):
        d = objetivo(tipo, i)
        k = identificador('seleccion', d, bloque)
        n['selecciones'][k] = {'id': k, 'objetivo': d, 'bloque': bloque,
                               'seleccion': seleccionar(n, d, bloque, activas, por_objetivo.get(clave(d), []))}


def validar_metricas(metricas):
    if not isinstance(metricas, dict):
        raise ValueError('Métricas inválidas')
    for codigo, valor in metricas.items():
        if codigo not in METRICAS:
            raise ValueError('Métrica sin definición: ' + codigo)
        tipo, _, no_negativo = METRICAS[codigo]
        if tipo == 'entero':
            if type(valor) is not int:
                raise ValueError('La métrica requiere entero')
            numero = valor
        else:
            if not isinstance(valor, str):
                raise ValueError('Los decimales se conservan como cadenas')
            try:
                numero = Decimal(valor)
            except InvalidOperation:
                raise ValueError('Decimal inválido') from None
            if not numero.is_finite():
                raise ValueError('Decimal no finito')
        if no_negativo and numero < 0:
            raise ValueError('Métrica negativa')


def validar(n):
    if n.get('version') != 2 or any(not isinstance(n.get(c), dict) for c in COLECCIONES):
        raise ValueError('Contrato de núcleo incompatible')
    validar_catalogo(n['catalogo'])

    def entidad(d):
        if not d or d.get('tipo') not in TIPOS or clave(d) not in n['entidades']:
            raise ValueError('Destino tipado sin entidad')
        return n['entidades'][clave(d)]

    def evidencias(dato):
        if not dato.get('evidencias') or any(i not in n['observaciones'] for i in dato['evidencias']):
            raise ValueError('Afirmación sin evidencia')

    for k, e in n['entidades'].items():
        if (k != clave(e) or e['tipo'] not in TIPOS or not e['nombres']
                or not all(isinstance(v, str) and v.strip() for v in e['nombres'].values())
                or (e['tipo'] in CLASES and e['clase'] not in CLASES[e['tipo']])):
            raise ValueError('Identidad, clase o nombres inválidos')
        evidencias(e)
        for t in e['temas']:
            evidencias(t)
            if (t['tema'] not in n['catalogo']['conceptos'] or type(t['version_catalogo']) is not int
                    or not 1 <= t['version_catalogo'] <= n['catalogo']['version']):
                raise ValueError('Tema sin catálogo válido')
    for i, d in n['documentos'].items():
        if (d['id'] != i or d['fuente'] not in n['fuentes']
                or d['huella'] != sha256(json_canonico(d['contenido']).encode()).hexdigest()):
            raise ValueError('Documento sin fuente o huella válida')
    tuplas = set()
    for i, r in n['referencias'].items():
        t = json_canonico([r['proveedor'], r['tipo_externo'], r['contexto'], r['id_externo']])
        if (r['id'] != i or t in tuplas or r['proveedor'] not in n['fuentes']
                or not isinstance(r['id_externo'], str) or not r['id_externo']):
            raise ValueError('Referencia externa repetida o inválida')
        tuplas.add(t)
        if r['destino'] is not None:
            entidad(r['destino'])
    por_ref_fecha = {}
    for i, o in n['observaciones'].items():
        if (o['id'] != i or o['referencia'] not in n['referencias']
                or o['documento'] not in n['documentos'] or not o['ruta']):
            raise ValueError('Observación sin procedencia')
        if n['referencias'][o['referencia']]['proveedor'] != n['documentos'][o['documento']]['fuente']:
            raise ValueError('Documento y referencia de fuentes distintas')
        a, b = tiempos.instante(o['observado']), tiempos.instante(o['ultima_observacion'])
        if b < a:
            raise ValueError('Observación anterior a la primera')
        t = (o['referencia'], b)
        hechos = {k: v for k, v in o['bloques'].items()
                  if k in ('programacion', 'lugar', 'resultado', 'clasificacion',
                           'pertenencia', 'equipos', 'agenda')}
        if t in por_ref_fecha and por_ref_fecha[t] != hechos:
            raise ValueError('Observaciones contradictorias en el mismo instante')
        por_ref_fecha[t] = hechos
        p = o['bloques'].get('programacion')
        if p:
            tiempos.validar(p['cuando'])
            if p['programacion'] not in ('programado', 'aplazado', 'cancelado', 'desconocido'):
                raise ValueError('Estado de programación inválido')
            if p['ejecucion'] not in ('sin_empezar', 'en_curso', 'terminado', 'interrumpido', 'desconocido'):
                raise ValueError('Estado de ejecución inválido')
        agenda = o['bloques'].get('agenda')
        if agenda:
            propia = entidad(n['referencias'][o['referencia']]['destino'])
            if propia['tipo'] != 'evento':
                raise ValueError('Programa de agenda sin evento')
            if agenda.get('rol') == 'principal':
                grupo = entidad(agenda.get('grupo'))
                if propia['clase'] != 'actividad_continua' or grupo['clase'] != 'gran_premio':
                    raise ValueError('Cita principal sin gran premio')
            elif agenda.get('rol') == 'sesion':
                principal = entidad(agenda.get('principal'))
                if (propia['clase'] != 'sesion' or principal['tipo'] != 'evento'
                        or principal['clase'] != 'actividad_continua' or not agenda.get('tipo_sesion')):
                    raise ValueError('Sesión sin cita principal válida')
            else:
                raise ValueError('Papel de agenda desconocido')
    padres, unicos, activas = {}, {}, ultimas(n)
    for i, r in n['relaciones'].items():
        a, b = entidad(r['origen']), entidad(r['destino'])
        permitidos = RELACIONES.get(r['tipo'])
        if (r['id'] != i or not permitidos or a['tipo'] not in permitidos[0]
                or b['tipo'] not in permitidos[1] or r['origen'] == r['destino']):
            raise ValueError('Tipos de relación incompatibles')
        evidencias(r)
        if r['ambito'] is not None:
            ambito = entidad(r['ambito'])
            if ambito['tipo'] not in ('evento', 'agrupacion'):
                raise ValueError('Ámbito de relación inválido')
        if r['tipo'] == 'compuesta_por' and (a['clase'] != 'pareja' or b['clase'] != 'persona'
                                                or r['ambito'] is None):
            raise ValueError('Composición sin pareja, persona o ámbito acreditado')
        if (r['tipo'] == 'compuesta_por' and r['ambito']['tipo'] == 'agrupacion'
                and entidad(r['ambito'])['clase'] not in ('edicion', 'fase', 'cuadro')):
            raise ValueError('Composición sin ámbito de edición/fase/cuadro acreditado')
        if r['tipo'] == 'pertenece_al_club' and (a['clase'] != 'equipo' or b['clase'] != 'club'):
            raise ValueError('Pertenencia de equipo y club inválida')
        if r['tipo'] == 'es_edicion_de' and (a['clase'] != 'edicion'
                                            or b['clase'] not in ('competicion', 'ciclo', 'festival')):
            raise ValueError('Edición sin competición/ciclo recurrente')
        if vigente(n, r, activas):
            if r['tipo'] in ('es_edicion_de', 'celebracion_de'):
                t = (clave(r['origen']), r['tipo'])
                if t in unicos and unicos[t] != r['destino']:
                    raise ValueError('Relación con más de un destino permitido')
                unicos[t] = r['destino']
            if r['tipo'] in ('es_edicion_de', 'es_parte_de'):
                padres.setdefault(clave(r['origen']), []).append(clave(r['destino']))
    visitados, pila = set(), set()

    def recorrer(i):
        if i in pila:
            raise ValueError('Ciclo de agrupaciones')
        if i not in visitados:
            pila.add(i)
            for padre in padres.get(i, []):
                recorrer(padre)
            pila.remove(i)
            visitados.add(i)
    for i in padres:
        recorrer(i)
    for i, p in n['participaciones'].items():
        if p['id'] != i or entidad(p['evento'])['tipo'] != 'evento' or not p['slot'] or not p['papel']:
            raise ValueError('Participación sin evento, posición de origen o papel')
        if p['participante'] is not None:
            if entidad(p['participante'])['tipo'] != 'participante':
                raise ValueError('Participante de tipo incorrecto')
        elif not p['literal']:
            raise ValueError('Plaza pendiente sin literal de origen')
        evidencias(p)
    for i, r in n['resultados'].items():
        if r['id'] != i or entidad(r['evento'])['tipo'] != 'evento' or r['observacion'] not in n['observaciones']:
            raise ValueError('Resultado sin evento u observación')
        if r['condicion'] not in ('final', 'provisional', 'rectificado', 'desconocido'):
            raise ValueError('Condición de resultado inválida')
        referencia = n['referencias'][n['observaciones'][r['observacion']]['referencia']]
        if referencia['destino'] != r['evento']:
            raise ValueError('Resultado de una observación ajena al evento')
        vistos = set()
        for linea in r['lineas']:
            p = n['participaciones'].get(linea['participacion'])
            if not p or p['evento'] != r['evento'] or linea['participacion'] in vistos:
                raise ValueError('Resultado con participación ajena o repetida')
            vistos.add(linea['participacion'])
            validar_metricas(linea['metricas'])
        if r.get('ganador') is not None and r['ganador'] not in vistos:
            raise ValueError('Ganador ajeno al resultado')
        parciales = {p['id']: p for p in r['parciales']}
        if len(parciales) != len(r['parciales']):
            raise ValueError('Parcial repetido')
        for p in r['parciales']:
            if not p['id'] or not p['tipo'] or type(p['orden']) is not int or p['orden'] < 1:
                raise ValueError('Parcial sin identidad, tipo u orden válido')
            cadena, padre = {p['id']}, p.get('padre')
            while padre is not None:
                if padre in cadena or padre not in parciales:
                    raise ValueError('Jerarquía de parciales inválida')
                cadena.add(padre)
                padre = parciales[padre].get('padre')
            for linea in p['lineas']:
                if linea['participacion'] not in vistos:
                    raise ValueError('Parcial de participación ajena')
                validar_metricas(linea['metricas'])
    for i, c in n['clasificaciones'].items():
        if (c['id'] != i or entidad(c['ambito'])['tipo'] != 'agrupacion'
                or c['observacion'] not in n['observaciones']):
            raise ValueError('Clasificación sin ámbito u observación')
        referencia = n['referencias'][n['observaciones'][c['observacion']]['referencia']]
        if referencia['destino'] != c['ambito']:
            raise ValueError('Clasificación de una observación ajena al ámbito')
        for fila in c['filas']:
            if fila['participante'] is not None:
                if entidad(fila['participante'])['tipo'] != 'participante':
                    raise ValueError('Fila de clasificación sin participante')
            elif not fila['literal']:
                raise ValueError('Fila pendiente sin literal')
            validar_metricas(fila['metricas'])
    for k, politica in n['politicas'].items():
        entidad(politica['objetivo'])
        if (politica.get('id') != k or not politica.get('motivo')
                or k != identificador('seleccion', politica['objetivo'], politica['bloque'])):
            raise ValueError('Clave de política inválida')
        if politica.get('modo') == 'editorial':
            if not politica.get('decision') or not politica.get('motivo'):
                raise ValueError('Corrección editorial sin decisión documentada')
        elif politica.get('modo') != 'referencia' or politica.get('referencia') not in n['referencias']:
            raise ValueError('Política de fuente inválida')
        elif n['referencias'][politica['referencia']]['destino'] != politica['objetivo']:
            raise ValueError('Política con referencia de otro objetivo')
    for k, s in n['selecciones'].items():
        entidad(s['objetivo'])
        if k != s['id'] or k != identificador('seleccion', s['objetivo'], s['bloque']):
            raise ValueError('Clave de selección inválida')
        if s['bloque'] == 'programacion' and s['seleccion']['valor'] is not None:
            tiempos.validar(s['seleccion']['valor']['cuando'])
    return n


def eventos_alcanzados(n, destino):
    """Expansión de objetivos; no crea ni guarda preferencias personales."""
    validar(n)
    activas = ultimas(n)
    if clave(destino) not in n['entidades']:
        raise ValueError('Objetivo inexistente')
    alcanzados, pendientes = set(), [destino]
    while pendientes:
        d = pendientes.pop()
        k = clave(d)
        if k in alcanzados:
            continue
        alcanzados.add(k)
        for r in n['relaciones'].values():
            if (r['destino'] == d and r['tipo'] in ('es_edicion_de', 'es_parte_de',
                                                    'pertenece_a', 'celebracion_de') and vigente(n, r, activas)):
                pendientes.append(r['origen'])
        for p in n['participaciones'].values():
            if not vigente(n, p, activas):
                continue
            if p['participante'] == d:
                pendientes.append(p['evento'])
            for r in n['relaciones'].values():
                if (r['tipo'] == 'compuesta_por' and r['destino'] == d
                        and r['origen'] == p['participante'] and vigente(n, r, activas)
                        and en_ambito(n, p['evento'], r['ambito'], activas)):
                    pendientes.append(p['evento'])
    return sorted(e['id'] for k, e in n['entidades'].items()
                  if e['tipo'] == 'evento' and k in alcanzados)


def en_ambito(n, evento, ambito, activas=None):
    activas = ultimas(n) if activas is None else activas
    pendientes, vistos = [evento], set()
    while pendientes:
        d = pendientes.pop()
        if d == ambito:
            return True
        if clave(d) in vistos:
            continue
        vistos.add(clave(d))
        pendientes.extend(r['destino'] for r in n['relaciones'].values()
                          if r['origen'] == d and vigente(n, r, activas)
                          and r['tipo'] in ('pertenece_a', 'es_parte_de', 'es_edicion_de'))
    return False


def consultar(n, inicio, fin, tema=None, destino=None, territorio=None, zona='Europe/Madrid'):
    """Lectura común para las futuras vistas de agenda, semana y mes."""
    validar(n)
    activas = ultimas(n)
    if territorio is not None and (clave(territorio) not in n['entidades']
                                   or territorio['tipo'] not in ('territorio', 'lugar')):
        raise ValueError('Filtro de lugar/territorio sin identidad acreditada')
    permitidos = set(eventos_alcanzados(n, destino)) if destino else None
    conexiones = {}
    if territorio:
        for r in n['relaciones'].values():
            if r['tipo'] in ('se_celebra_en', 'ubicado_en', 'pertenece_a', 'es_parte_de', 'es_edicion_de') and vigente(n, r, activas):
                conexiones.setdefault(clave(r['origen']), []).append(r['destino'])

    def en_lugar(evento):
        pendientes, vistos = [evento], set()
        while pendientes:
            d = pendientes.pop()
            if d == territorio:
                return True
            if clave(d) not in vistos:
                vistos.add(clave(d))
                pendientes.extend(conexiones.get(clave(d), ()))
        return False
    hijos = {tema} if tema else set()
    if tema:
        if tema not in n['catalogo']['conceptos']:
            raise ValueError('Tema desconocido')
        while True:
            nuevos = {t for t, v in n['catalogo']['conceptos'].items() if set(v['padres']) & hijos}
            if nuevos <= hijos:
                break
            hijos.update(nuevos)
    salida = []
    for e in n['entidades'].values():
        if e['tipo'] != 'evento' or (permitidos is not None and e['id'] not in permitidos):
            continue
        if territorio is not None and not en_lugar(objetivo('evento', e['id'])):
            continue
        if tema and not any(t['tema'] in hijos and vigente(n, t, activas) for t in e['temas']):
            continue
        s = n['selecciones'].get(identificador('seleccion', objetivo('evento', e['id']), 'programacion'))
        if s and s['seleccion']['valor']:
            c = s['seleccion']['valor']['cuando']
            if tiempos.en_intervalo(c, inicio, fin, zona):
                salida.append({'entidad': deepcopy(e), 'programacion': deepcopy(s['seleccion'])})
    return sorted(salida, key=lambda f: (f['programacion']['valor']['cuando']['inicio']['fecha'] or '',
                                        f['entidad']['id']))
