"""Proyección temática reproducible; preserva los registros y su observación."""

from copy import deepcopy
import json
from pathlib import Path
import unicodedata


RUTA_CATALOGO = Path(__file__).resolve().parent.parent / 'shared' / 'catalogo-tematico.json'


def _literal(valor):
    return unicodedata.normalize('NFC', valor).strip().casefold()


def validar(catalogo):
    if type(catalogo.get('version')) is not int or catalogo['version'] < 1:
        raise ValueError('Versión de catálogo temático inválida')
    conceptos = catalogo['conceptos']
    visitados, activos = set(), set()

    def visitar(tema):
        if tema not in conceptos:
            raise ValueError(f'Tema padre sin definir: {tema}')
        if tema in activos:
            raise ValueError('Ciclo en el catálogo temático')
        if tema in visitados:
            return
        datos = conceptos[tema]
        if (not datos.get('nombres') or not all(isinstance(n, str) and n.strip()
                for n in datos['nombres'].values()) or not isinstance(datos.get('padres'), list)):
            raise ValueError(f'Tema sin nombres o padres válidos: {tema}')
        activos.add(tema)
        for padre in datos['padres']:
            visitar(padre)
        activos.remove(tema)
        visitados.add(tema)

    for tema in conceptos:
        visitar(tema)
    ids = set()
    for regla in catalogo['correspondencias']:
        if (not regla.get('id') or regla['id'] in ids or regla.get('tema') not in conceptos
                or regla.get('criterio') not in ('nombre_grupo', 'id_grupo')
                or not regla.get('fuente') or not regla.get('tipo_grupo')
                or not regla.get('evidencia') or not isinstance(regla.get('valores'), list)
                or not regla['valores'] or not all(isinstance(v, str) and v.strip() for v in regla['valores'])):
            raise ValueError('Correspondencia temática inválida')
        ids.add(regla['id'])
    return catalogo


def cargar_catalogo():
    return validar(json.loads(RUTA_CATALOGO.read_text(encoding='utf-8')))


def aplicar(calendario, catalogo=None):
    """Recalcula solo clasificación; una etiqueta desconocida no inventa un tema.

    La evidencia apunta al registro y al grupo declarado por ese registro,
    nunca al título ni a nombres agregados de otro proveedor o traducción.
    """
    catalogo = cargar_catalogo() if catalogo is None else validar(catalogo)
    anterior = calendario.get('clasificacion')
    if anterior:
        if anterior.get('version') != 1:
            raise ValueError('Versión de clasificación incompatible')
        previo = anterior['catalogo']
        if previo != catalogo and catalogo['version'] <= previo['version']:
            raise ValueError('Un cambio de catálogo necesita una versión mayor')
        if previo['conceptos'].keys() - catalogo['conceptos'].keys():
            raise ValueError('No se eliminan IDs temáticos')
    nuevo = deepcopy(calendario)
    asignaciones = {}
    for evento in nuevo['eventos']:
        evidencias = []
        for ref in evento['registros']:
            registro = nuevo['registros'][ref]
            grupos = registro.get('grupos', {})
            for regla in catalogo['correspondencias']:
                if registro['fuente'] != regla['fuente']:
                    continue
                for identificador in registro['datos'].get('grupos', []):
                    grupo = grupos.get(identificador, {})
                    if grupo.get('tipo') != regla['tipo_grupo']:
                        continue
                    if regla['criterio'] == 'id_grupo':
                        valores = [identificador] if identificador in regla['valores'] else []
                    else:
                        buscados = {_literal(v) for v in regla['valores']}
                        valores = sorted({v for v in grupo.get('nombres', {}).values()
                                          if _literal(v) in buscados})
                    for valor in valores:
                        evidencias.append({'tema': regla['tema'], 'correspondencia': regla['id'],
                            'version': catalogo['version'], 'registro': ref,
                            'grupo': identificador, 'valor': valor})
        if evidencias:
            asignaciones[evento['id']] = evidencias
    nuevo['clasificacion'] = {'version': 1, 'catalogo': deepcopy(catalogo),
                              'asignaciones': asignaciones}
    return nuevo


def temas_de(calendario, evento, incluir_padres=True):
    """Temas directos o cierre de antecesores, sin modificar las asignaciones."""
    clasificacion = calendario.get('clasificacion', {})
    conceptos = clasificacion.get('catalogo', {}).get('conceptos', {})
    temas = {e['tema'] for e in clasificacion.get('asignaciones', {}).get(evento, [])}
    pendientes = list(temas) if incluir_padres else []
    while pendientes:
        for padre in conceptos[pendientes.pop()]['padres']:
            if padre not in temas:
                temas.add(padre)
                pendientes.append(padre)
    return sorted(temas)
