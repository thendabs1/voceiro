"""Integración de registros de agenda, independiente de sus proveedores."""

from copy import deepcopy
from datetime import date, datetime
from uuid import NAMESPACE_URL, uuid5


VERSION = 1


def clave(fuente, identificador):
    return f'{fuente}:{identificador}'


def validar_cuando(cuando):
    """Una fecha sin hora no se convierte en medianoche ni en publicación."""
    precision = cuando['precision']
    if precision not in ('dia', 'hora', 'desconocida'):
        raise ValueError('Precisión de celebración desconocida')
    if cuando.get('fin_exclusivo') is not None and not isinstance(cuando['fin_exclusivo'], bool):
        raise ValueError('Semántica del fin inválida')
    inicio, fin = cuando.get('inicio'), cuando.get('fin')
    if not inicio:
        if precision != 'desconocida' or fin:
            raise ValueError('Celebración sin inicio')
        return
    if precision == 'desconocida':
        raise ValueError('Inicio con precisión desconocida')
    parsear = date.fromisoformat if precision == 'dia' else datetime.fromisoformat
    primero = parsear(inicio)
    if precision == 'hora' and (primero.tzinfo is None or not cuando.get('zona')):
        raise ValueError('Una hora necesita zona y desplazamiento UTC')
    if fin:
        ultimo = parsear(fin)
        if precision == 'hora' and ultimo.tzinfo is None:
            raise ValueError('Fin sin desplazamiento UTC')
        # Comparar instantes también durante el cambio de horario.
        if ultimo < primero:
            raise ValueError('Fin anterior al inicio')


def integrar(anterior, registros, fuentes, observado, consultas=()):
    """Integra una pasada completa sin borrar los ausentes ni inferir cancelación.

    Los adaptadores entregan datos comunes y conservan el registro original.
    Solo se concilian identidades mediante equivalencias explícitas de la fuente.
    Un conflicto entre dos IDs internos existentes exige revisión, no una fusión.
    """
    if datetime.fromisoformat(observado).tzinfo is None:
        raise ValueError('La recogida necesita desplazamiento UTC')
    if anterior and anterior.get('version') != VERSION:
        raise ValueError('Versión de calendario incompatible')
    calendario = deepcopy(anterior) if anterior else {
        'version': VERSION, 'fuentes': {}, 'regiones': {}, 'grupos': {},
        'registros': {}, 'vinculos': {}, 'eventos': [],
    }
    calendario['actualizado'] = observado
    calendario['consultas'] = list(consultas)
    calendario['fuentes'].update(deepcopy(fuentes))
    vistos = set()
    for registro in registros:
        fuente = registro['fuente']
        if fuente not in calendario['fuentes']:
            raise ValueError(f'Fuente sin definir: {fuente}')
        ref = clave(fuente, registro['id_externo'])
        if ref in vistos:
            raise ValueError(f'Registro repetido en la pasada: {ref}')
        vistos.add(ref)
        datos = registro['datos']
        validar_cuando(datos['cuando'])
        if not datos.get('titulos'):
            raise ValueError(f'Evento sin título: {ref}')
        alias = {ref, *(clave(fuente, i) for i in registro.get('equivalentes', []))}
        existentes = {calendario['vinculos'][a] for a in alias
                      if a in calendario['vinculos']}
        if len(existentes) > 1:
            raise ValueError(f'Equivalencia entre eventos ya separados: {ref}')
        identidad = next(iter(existentes)) if existentes else str(uuid5(
            NAMESPACE_URL, 'https://voceiro.eu/agenda/' + min(alias)))
        calendario['vinculos'].update({a: identidad for a in alias})
        previo = calendario['registros'].get(ref, {})
        calendario['registros'][ref] = {
            **deepcopy(registro), 'evento': identidad,
            'primera_recogida': previo.get('primera_recogida', observado),
            'ultima_recogida': observado,
        }
        for campo in ('regiones', 'grupos'):
            for identificador, entidad in registro.get(campo, {}).items():
                anterior_entidad = calendario[campo].get(identificador, {})
                calendario[campo][identificador] = {
                    **deepcopy(entidad), 'nombres': {
                        **anterior_entidad.get('nombres', {}),
                        **entidad.get('nombres', {}),
                    },
                }

    por_evento = {}
    for ref, registro in calendario['registros'].items():
        por_evento.setdefault(registro['evento'], []).append((ref, registro))
    eventos = []
    for identidad, filas in sorted(por_evento.items()):
        # Elección estable y explícita, sin mezclar horarios de fichas diferentes.
        filas.sort(key=lambda f: f[0])
        principal, registro = filas[0]
        datos = deepcopy(registro['datos'])
        titulos = {}
        for _, fila in reversed(filas):
            titulos.update(fila['datos']['titulos'])
        datos['titulos'] = titulos
        conflictos = [campo for campo in ('cuando', 'estado', 'lugar')
                      if any(fila['datos'].get(campo) != datos.get(campo)
                             for _, fila in filas[1:])]
        evento = {'id': identidad, **datos, 'datos_de': principal,
                  'registros': [ref for ref, _ in filas], 'conflictos': conflictos}
        for campo in ('regiones', 'grupos', 'relaciones'):
            valores = []
            for _, fila in filas:
                for valor in fila['datos'].get(campo, []):
                    if valor not in valores:
                        valores.append(deepcopy(valor))
            evento[campo] = valores
        for campo in ('regiones', 'grupos'):
            if any(i not in calendario[campo] for i in evento[campo]):
                raise ValueError(f'Referencia de {campo} sin definir: {identidad}')
        eventos.append(evento)
    calendario['eventos'] = eventos
    return calendario
