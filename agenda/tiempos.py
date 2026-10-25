"""Fechas civiles e instantes independientes para el contrato v2."""

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo


def instante(valor):
    dt = datetime.fromisoformat(valor)
    if dt.utcoffset() is None:
        raise ValueError('El instante necesita desplazamiento UTC')
    return dt.astimezone(timezone.utc)


def extremo(fecha=None, hora=None, zona=None, utc=None, certeza='confirmado'):
    return {'fecha': fecha, 'hora_local': hora, 'zona': zona, 'instante': utc,
            'precision': 'hora' if hora or utc else 'fecha' if fecha else 'desconocida',
            'certeza_fecha': certeza if fecha or utc else 'desconocida',
            'certeza_hora': certeza if hora or utc else 'desconocida'}


def validar_extremo(e):
    if e['precision'] not in ('fecha', 'hora', 'desconocida'):
        raise ValueError('Precisión temporal inválida')
    for campo in ('certeza_fecha', 'certeza_hora'):
        if e[campo] not in ('confirmado', 'provisional', 'desconocida'):
            raise ValueError('Certeza temporal inválida')
    fecha = date.fromisoformat(e['fecha']) if e['fecha'] else None
    hora = time.fromisoformat(e['hora_local']) if e['hora_local'] else None
    if hora and (hora.tzinfo is not None or fecha is None):
        raise ValueError('Una hora local necesita fecha y no lleva desplazamiento')
    utc = instante(e['instante']) if e['instante'] else None
    if e['precision'] != ('hora' if hora or utc else 'fecha' if fecha else 'desconocida'):
        raise ValueError('Precisión incompatible con los extremos')
    if e['zona']:
        zona = ZoneInfo(e['zona'])
        if fecha and hora:
            civil = datetime.combine(fecha, hora)
            posibles = {civil.replace(tzinfo=zona, fold=f).astimezone(timezone.utc)
                        for f in (0, 1)
                        if civil.replace(tzinfo=zona, fold=f).astimezone(timezone.utc)
                        .astimezone(zona).replace(tzinfo=None) == civil}
            if not posibles or (utc is None and len(posibles) != 1):
                raise ValueError('Hora local inexistente o ambigua sin desplazamiento acreditado')
            if utc is not None and utc not in posibles:
                raise ValueError('Instante y fecha local discrepantes')
    elif fecha and hora and utc:
        # Sin zona nominal, el desplazamiento del instante debe acreditar esa hora civil.
        original = datetime.fromisoformat(e['instante'])
        if original.date() != fecha or original.time() != hora:
            raise ValueError('Instante y fecha local discrepantes')
    return e


def validar(cuando):
    a, b = (validar_extremo(cuando[c]) for c in ('inicio', 'fin'))
    exclusivo = cuando['fin_exclusivo']
    if exclusivo is not None and not isinstance(exclusivo, bool):
        raise ValueError('Fin exclusivo inválido')
    campos = ('instante',) if a['instante'] and b['instante'] else ('fecha', 'hora_local')
    primero = ultimo = None
    if campos == ('instante',):
        primero, ultimo = instante(a['instante']), instante(b['instante'])
    elif a['fecha'] and b['fecha'] and a['precision'] == b['precision']:
        if a['precision'] == 'fecha':
            primero, ultimo = date.fromisoformat(a['fecha']), date.fromisoformat(b['fecha'])
        elif a['zona'] == b['zona'] and not a['instante'] and not b['instante']:
            primero = datetime.fromisoformat(a['fecha'] + 'T' + a['hora_local'])
            ultimo = datetime.fromisoformat(b['fecha'] + 'T' + b['hora_local'])
    if primero is not None and (ultimo < primero or (exclusivo and ultimo == primero)):
        raise ValueError('Fin anterior al inicio o intervalo exclusivo vacío')
    return cuando


def desde_legado(c):
    def convertir(valor):
        if not valor:
            return extremo()
        if c['precision'] == 'dia':
            return extremo(fecha=valor)
        dt = datetime.fromisoformat(valor)
        return extremo(dt.date().isoformat(), dt.time().isoformat(), c.get('zona'), valor)
    return validar({'inicio': convertir(c.get('inicio')), 'fin': convertir(c.get('fin')),
                    'fin_exclusivo': c.get('fin_exclusivo'), 'horario_textual': None})


def en_intervalo(cuando, inicio, fin, zona='Europe/Madrid'):
    """Ventana de días [inicio, fin); un fin desconocido solo alcanza el día inicial."""
    primero, ultimo = date.fromisoformat(inicio), date.fromisoformat(fin)
    if ultimo <= primero:
        raise ValueError('Ventana de consulta vacía')
    a, b = cuando['inicio'], cuando['fin']
    if a['certeza_fecha'] != 'confirmado':
        return False
    if a['instante'] and a['certeza_hora'] == 'confirmado':
        z = ZoneInfo(zona)
        comienzo = instante(a['instante'])
        desde = datetime.combine(primero, time(), z)
        hasta = datetime.combine(ultimo, time(), z)
        if b['instante'] and b['certeza_fecha'] == 'confirmado' and b['certeza_hora'] == 'confirmado':
            cierre = instante(b['instante'])
            return comienzo < hasta and (cierre > desde if cuando['fin_exclusivo'] else cierre >= desde)
        return primero <= comienzo.astimezone(z).date() < ultimo
    if not a['fecha']:
        return False
    dia = date.fromisoformat(a['fecha'])
    if b['fecha'] and b['certeza_fecha'] == 'confirmado':
        cierre = date.fromisoformat(b['fecha'])
        # Un fin con hora durante el primer día de ventana sí solapa, incluso si es exclusivo.
        termina_despues = cierre > primero or (cierre == primero and bool(b['hora_local']))
        return dia < ultimo and (termina_despues if cuando['fin_exclusivo'] else cierre >= primero)
    return primero <= dia < ultimo
