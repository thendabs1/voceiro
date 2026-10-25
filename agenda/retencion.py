"""Informe previo de caducidad. No borra entidades ni modifica el almacén.

Los candidatos necesitan después un plan transaccional de dependencias y
protección frente a reimportaciones; la ausencia en una recogida no caduca nada.
"""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import nucleo, tiempos


DIAS_EVENTOS_PUNTUALES = 45


def planificar(n, ahora):
    """Selecciona citas con final acreditado y sin vínculos deportivos.

    Los extremos civiles inclusivos terminan al acabar su día. Sin zona
    acreditada se concede un día adicional para no anticipar la caducidad.
    Las observaciones en conflicto, fechas pendientes e intervalos se conservan.
    """
    nucleo.validar(n)
    momento = tiempos.instante(ahora)
    activas = nucleo.ultimas(n)
    programaciones = {nucleo.clave(s['objetivo']): s['seleccion'] for s in n['selecciones'].values()
                      if s['bloque'] == 'programacion'}
    protecciones = {nucleo.clave(r['evento']) for r in n['resultados'].values()}
    protecciones.update(nucleo.clave(p['evento']) for p in n['participaciones'].values())
    protecciones.update(nucleo.clave(r['ambito']) for r in n['relaciones'].values() if r['ambito'])
    pendientes = [k for k, e in n['entidades'].items()
                  if e['clase'] in ('circuito', 'competicion', 'edicion', 'fase', 'cuadro')]
    hijos = {}
    for r in n['relaciones'].values():
        if r['tipo'] in ('pertenece_a', 'es_edicion_de', 'es_parte_de', 'celebracion_de'):
            hijos.setdefault(nucleo.clave(r['destino']), []).append(nucleo.clave(r['origen']))
    while pendientes:
        k = pendientes.pop()
        if k not in protecciones:
            protecciones.add(k)
            pendientes.extend(hijos.get(k, ()))

    def deportivo(tema, vistos=None):
        vistos = set() if vistos is None else vistos
        if tema in vistos:
            return False
        vistos.add(tema)
        return tema == 'deportes' or any(deportivo(p, vistos) for p in n['catalogo']['conceptos'][tema]['padres'])

    candidatos = []
    for k, e in n['entidades'].items():
        if e['tipo'] != 'evento' or k in protecciones or e['clase'] not in ('funcion', 'sesion', 'desconocida'):
            continue
        if any(deportivo(t['tema']) for t in e['temas']):
            continue
        s = programaciones.get(k)
        if not s or s['conflicto'] or not s['valor'] or s['observacion'] not in activas:
            continue
        p = s['valor']
        c = p['cuando']
        a, b = c['inicio'], c['fin']
        if (p.get('programacion') == 'aplazado' or p.get('modalidad') == 'intervalo'
                or c.get('dias_semana') or c.get('restricciones_pendientes')
                or a['certeza_fecha'] != 'confirmado' or b['certeza_fecha'] != 'confirmado'
                or not a['fecha'] or not b['fecha'] or a['fecha'] != b['fecha']):
            continue
        if b['instante'] and b['certeza_hora'] == 'confirmado':
            caduca = tiempos.instante(b['instante']) + timedelta(days=DIAS_EVENTOS_PUNTUALES)
            vencido, desde = momento >= caduca, caduca.isoformat()
        else:
            # Fin civil inclusivo: no se cuenta su día como uno ya transcurrido.
            margen = 0 if c['fin_exclusivo'] else 1
            caduca = date.fromisoformat(b['fecha']) + timedelta(days=DIAS_EVENTOS_PUNTUALES + margen)
            if b['zona']:
                hoy = momento.astimezone(ZoneInfo(b['zona'])).date()
            else:
                hoy = momento.date() - timedelta(days=1)
            vencido, desde = hoy >= caduca, caduca.isoformat()
        if vencido:
            candidatos.append({'evento': e['id'], 'caducidad': desde})
    return {'dias_eventos_puntuales': DIAS_EVENTOS_PUNTUALES, 'evaluado': ahora,
            'modo': 'informe_sin_borrado', 'candidatos': sorted(candidatos, key=lambda e: e['evento'])}


def main():
    import argparse
    import json
    from pathlib import Path
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('archivo', type=Path, help='Exportación del núcleo o calendario completo')
    p.add_argument('--ahora', default=datetime.now(timezone.utc).isoformat())
    args = p.parse_args()
    datos = json.loads(args.archivo.read_text(encoding='utf-8'))
    print(json.dumps(planificar(datos.get('nucleo', datos), args.ahora), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
