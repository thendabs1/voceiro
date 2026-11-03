"""Fechas civiles e instantes independientes para el contrato v2."""

from datetime import date, datetime, time, timedelta, timezone
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


def hora_local(fecha, hora, zona):
    """Extremo con hora local e instante; None si esa hora no existe o se repite.

    Sin desplazamiento acreditado, una hora del cambio horario no se resuelve
    eligiendo uno: la cita se queda en el día y su texto conserva la hora.
    """
    e = extremo(fecha, hora, zona)
    try:
        validar_extremo(e)
    except ValueError:
        return None
    e['instante'] = datetime.combine(date.fromisoformat(fecha), time.fromisoformat(hora),
                                     ZoneInfo(zona)).isoformat()
    return e


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
    elif (a['fecha'] and b['fecha'] and
          (not a['zona'] or not b['zona'] or a['zona'] == b['zona'])):
        # Distinta precisión no impide demostrar una inversión de días civiles.
        primero, ultimo = date.fromisoformat(a['fecha']), date.fromisoformat(b['fecha'])
        if primero == ultimo and not (exclusivo and b['precision'] == 'fecha'):
            primero = ultimo = None
    if primero is not None and (ultimo < primero or (exclusivo and ultimo == primero)):
        raise ValueError('Fin anterior al inicio o intervalo exclusivo vacío')
    if 'dias_semana' in cuando and (not isinstance(cuando['dias_semana'], list)
            or not cuando['dias_semana'] or any(type(d) is not int or not 0 <= d <= 6
                                               for d in cuando['dias_semana'])):
        raise ValueError('Días de semana inválidos')
    if 'dias_excluidos' in cuando:
        if not isinstance(cuando['dias_excluidos'], list):
            raise ValueError('Días excluidos inválidos')
        for d in cuando['dias_excluidos']:
            date.fromisoformat(d)
    return cuando


def desde_legado(c):
    def convertir(valor):
        if not valor:
            return extremo()
        if c['precision'] == 'dia':
            return extremo(fecha=valor)
        dt = datetime.fromisoformat(valor)
        e = extremo(dt.date().isoformat(), dt.time().isoformat(), c.get('zona'), valor)
        if 'hora_cero_sin_confirmar' in c.get('avisos', ()):
            e['certeza_hora'] = 'provisional'
        return e
    return validar({'inicio': convertir(c.get('inicio')), 'fin': convertir(c.get('fin')),
                    'fin_exclusivo': c.get('fin_exclusivo'), 'horario_textual': c.get('horario_textual')})


def _extremo_visible(e, zona):
    """Cada instante confirmado cambia de zona; cada fecha civil conserva su día."""
    if e['certeza_fecha'] != 'confirmado':
        return None, None
    if e['instante'] and e['certeza_hora'] == 'confirmado':
        local = instante(e['instante']).astimezone(ZoneInfo(zona))
        return local.date(), local.time()
    return (date.fromisoformat(e['fecha']) if e['fecha'] else None,
            time.fromisoformat(e['hora_local'])
            if e['hora_local'] and e['certeza_hora'] == 'confirmado' else None)


def en_intervalo(cuando, inicio, fin, zona='Europe/Madrid'):
    """Ventana de días [inicio, fin); un fin desconocido solo alcanza el día inicial."""
    primero, ultimo = date.fromisoformat(inicio), date.fromisoformat(fin)
    if ultimo <= primero:
        raise ValueError('Ventana de consulta vacía')
    if cuando.get('dias_semana') or cuando.get('dias_excluidos'):
        sin_reglas = {k: v for k, v in cuando.items() if k not in ('dias_semana', 'dias_excluidos')}
        dia = primero
        while dia < ultimo:
            siguiente = dia + timedelta(days=1)
            if (('dias_semana' not in cuando or dia.weekday() in cuando['dias_semana'])
                    and dia.isoformat() not in cuando.get('dias_excluidos', ())
                    and en_intervalo(sin_reglas, dia.isoformat(), siguiente.isoformat(), zona)):
                return True
            dia = siguiente
        return False
    dia, _ = _extremo_visible(cuando['inicio'], zona)
    cierre, hora = _extremo_visible(cuando['fin'], zona)
    if dia is None:
        return False
    if cierre is not None:
        # Medianoche exclusiva es el límite del día; una hora posterior sí solapa.
        termina_despues = cierre > primero or (cierre == primero and hora is not None and hora > time())
        return dia < ultimo and (termina_despues if cuando['fin_exclusivo'] else cierre >= primero)
    return primero <= dia < ultimo
