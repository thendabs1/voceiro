"""Construcción de agenda deportiva con evidencia limitada a sus campos."""

from copy import deepcopy
from datetime import date, datetime

from . import nucleo, tiempos
from .clasificacion import cargar_catalogo


def literal(valor, campo='identificador'):
    if isinstance(valor, bool) or not isinstance(valor, (str, int)) or not str(valor).strip():
        raise ValueError('Falta ' + campo + ' de agenda')
    return str(valor).strip()


def temporada(valor):
    year = literal(valor, 'temporada')
    if len(year) != 4 or not year.isdigit() or int(year) == 0:
        raise ValueError('Temporada sin año de cuatro cifras')
    return year


def filas(datos, campo, maximo=2000):
    salida = datos.get(campo) if isinstance(datos, dict) else None
    if not isinstance(salida, list) or len(salida) > maximo or any(not isinstance(f, dict) for f in salida):
        raise ValueError('Lista de agenda inválida: ' + campo)
    return salida


def unicos(datos, campo):
    vistos = set()
    for dato in datos:
        i = literal(dato.get(campo))
        if i in vistos:
            raise ValueError('Identificador de agenda repetido: ' + i)
        vistos.add(i)
        yield dato


def extremo(valor):
    if not valor:
        return tiempos.extremo()
    if not isinstance(valor, str):
        raise ValueError('Fecha de agenda inválida')
    if len(valor) == 10:
        return tiempos.extremo(date.fromisoformat(valor).isoformat())
    tiempos.instante(valor)  # Un instante sin offset no se interpreta en la zona del servidor.
    dt = datetime.fromisoformat(valor)
    return tiempos.extremo(dt.date().isoformat(), dt.time().isoformat(), utc=dt.isoformat())


def intervalo(inicio=None, fin=None, *, exclusivo=None, fin_igual_desconocido=False):
    a, b = extremo(inicio), extremo(fin)
    if fin_igual_desconocido and a == b:
        b = tiempos.extremo()
    return tiempos.validar({'inicio': a, 'fin': b, 'fin_exclusivo': exclusivo,
                           'horario_textual': None})


def dias(inicio=None, fin=None):
    """Días civiles declarados por la fuente; no son horas de comienzo/fin."""
    for valor in (inicio, fin):
        if valor:
            extremo(valor)
    return intervalo(inicio[:10] if inicio else None, fin[:10] if fin else None, exclusivo=False)


def programacion(cuando, estado='desconocido'):
    return {'cuando': cuando, 'programacion': estado, 'ejecucion': 'desconocido'}


def lugar(datos):
    if not datos:
        return None
    if not isinstance(datos, dict):
        raise ValueError('Lugar de agenda inválido')
    direccion = datos.get('address') if isinstance(datos.get('address'), dict) else {}
    pais = datos.get('country') or direccion.get('country')
    if isinstance(pais, dict):
        pais = pais.get('name')
    candidatos = {'id_externo': datos.get('id'),
        'nombre': datos.get('nombre') or datos.get('fullName') or datos.get('displayName') or datos.get('name'),
        'municipio_literal': datos.get('municipio_literal') or datos.get('city') or direccion.get('city'),
        'provincia_literal': datos.get('provincia_literal') or direccion.get('state'),
        'pais_literal': pais}
    return {k: literal(v, k) for k, v in candidatos.items() if v not in (None, '')} or None


class Agenda:
    def __init__(self, anterior, fuente, nombre, url, tema, observado, remoto=False):
        self.c = nucleo.Constructor(anterior)
        catalogo = cargar_catalogo()
        if self.c.n['catalogo']['version'] < catalogo['version']:
            self.c.n['catalogo'] = catalogo
        self.fuente, self.url, self.tema, self.observado = fuente, url, tema, observado
        self.c.n['fuentes'][fuente] = {'nombre': nombre, 'url': url, 'atribucion': nombre,
            'licencia': None, 'condiciones': 'Recogida y publicación periódicas pendientes de activación',
            'modo': 'recogida_manual' if remoto else 'muestra_local', 'capacidades': ['calendario'],
            'alcance': 'agenda_deportiva'}
        self.referencias = {(r['tipo_externo'], nucleo.json_canonico(r['contexto']), r['id_externo']): r
            for r in self.c.n['referencias'].values() if r['proveedor'] == fuente}

    def anterior(self, tipo_externo, externo, contexto=None):
        ref = self.referencias.get((tipo_externo, nucleo.json_canonico(contexto or {}), str(externo)))
        return ref['destino'] if ref else None

    def entidad(self, tipo_externo, externo, tipo, clase, nombre, *, contexto=None,
                bloques=None, url=None, identidad=None):
        externo, nombre = literal(externo), literal(nombre, 'nombre')
        contexto, bloques = contexto or {}, deepcopy(bloques or {})
        nombres = {'und': nombre}
        # Un fragmento por entidad, sin el URL variable de consulta, captura o marcadores.
        doc = self.c.documento(self.fuente, {'tipo_externo': tipo_externo, 'id': externo,
            'contexto': contexto, 'nombres': nombres, 'bloques': bloques}, url=url or self.url,
            clase='extraccion_agenda')
        return self.c.entidad(self.fuente, tipo_externo, externo, contexto, tipo, clase,
            nombres, doc, '/bloques', self.observado, bloques=bloques, identidad=identidad)

    def grupo(self, tipo_externo, externo, clase, nombre, *, padre=None, relacion='es_parte_de',
              contexto=None, codigo=None, identidad=None):
        destino, evidencia = self.entidad(tipo_externo, externo, 'agrupacion', clase, nombre,
            contexto=contexto, bloques={'codigo_consulta': codigo} if codigo else None, identidad=identidad)
        if padre:
            self.c.relacion(relacion, destino, padre, evidencia)
        self.c.tema(destino, self.tema, evidencia, self.fuente + ':agenda-v1')
        return destino

    def evento(self, tipo_externo, externo, clase, nombre, cuando, *, padre=None,
               estado='desconocido', sitio=None, url=None, bloques=None, conservar_fecha=False):
        p = programacion(cuando, estado)
        previo = self.anterior(tipo_externo, externo)
        if conservar_fecha and previo and cuando['inicio']['precision'] == 'desconocida':
            seleccion = nucleo.seleccionar(self.c.n, previo, 'programacion').get('valor')
            if seleccion and seleccion['cuando']['inicio']['precision'] != 'desconocida':
                p['cuando'] = deepcopy(seleccion['cuando'])
        contenido = {**(bloques or {}), 'programacion': p, 'lugar': lugar(sitio),
                     'url_evento': url or self.url}
        destino, evidencia = self.entidad(tipo_externo, externo, 'evento', clase, nombre,
            bloques=contenido, url=url)
        if padre:
            self.c.relacion('pertenece_a', destino, padre, evidencia)
        self.c.tema(destino, self.tema, evidencia, self.fuente + ':agenda-v1')
        return destino, evidencia

    def equipo(self, evento, evidencia, slot, nombre, externo=None, contexto=None):
        participante = None
        if externo is not None:
            participante, _ = self.entidad('equipo', externo, 'participante', 'equipo', nombre,
                                           contexto=contexto)
        self.c.participar(evento, self.fuente + ':' + slot, participante,
                         literal(nombre, 'equipo'), slot, evidencia)

    def terminar(self):
        return self.c.terminar()
