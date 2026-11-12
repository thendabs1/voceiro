"""Revisiones de coincidencias y envío explícito de incidencias a GitHub."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess

from . import almacen, atletismo_coincidencias as coincidencias


def marcador(clave):
    return '<!-- voceiro:atletismo:' + clave + ' -->'


def sede(e):
    sitio = e.get('lugar') or {}
    return sitio.get('municipio_literal') or sitio.get('city') or sitio.get('nombre') or 'sin dato'


def huella(caso):
    """Lo que usa el comparador, con su resultado: si cambia, el caso vuelve a revisión.

    Sin fechas de recogida ni de modificación de la fuente."""
    # Veredicto y revisión son decisiones sobre los datos, no datos: registrar una
    # conciliación nueva no devuelve a revisión un caso ya cerrado.
    comparacion = {k: v for k, v in (caso.get('comparacion') or {}).items()
                   if k not in ('veredicto', 'revision_identidad')}
    datos = {'motivo': caso['motivo'], 'comparacion': comparacion or caso.get('comparacion'), 'citas': [
        # Con el ID estable: una renumeración no son datos nuevos ni reabre lo revisado.
        {k: e.get(k) for k in ('fuente', 'nombre', 'inicio', 'fin', 'url', 'lugar')} | {'id': coincidencias.id_estable(e)}
        | {'modalidades': sorted(coincidencias.modalidades(e)), 'enlaces': sorted(coincidencias.enlaces(e)),
           'alcance': coincidencias.alcance(e), 'dias': sorted(coincidencias.dias(e))}
        for e in caso['citas']]}
    return sha256(json.dumps(datos, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]


def marcador_huella(valor):
    return '<!-- voceiro:atletismo-huella:' + valor + ' -->'


def cuerpo(caso):
    lineas = [marcador(caso['clave']), marcador_huella(huella(caso)),
              'La comparación automática solicita revisar estas referencias de atletismo.',
              '', 'Motivo: ' + caso['motivo'], '']
    for e in caso['citas']:
        lineas += [f"- Fuente e ID: {e['fuente']} / {e['id']}",
                   f"  Nombre: {e['nombre']}", f"  Fechas: {e['inicio']} — {e['fin']}",
                   '  Sede: ' + sede(e),
                   '  Ficha: ' + (e.get('url') or 'sin enlace'), '']
    lineas += ['Comparación:', '```json', json.dumps(caso['comparacion'], ensure_ascii=False, indent=2), '```', '',
               'Decidir si es la misma cita, citas distintas o una relación entre conjunto y partes. '
               'Registrar la decisión en las correspondencias de atletismo o conciliar las identidades existentes. '
               'Cerrar este issue no fusiona datos ni borra observaciones; si cambian los datos comparados, se comentan y se reabre.']
    return '\n'.join(lineas)


def _gh(argumentos, entrada=None):
    return subprocess.run(['gh', *argumentos], input=entrada, check=True,
                          capture_output=True, text=True, encoding='utf-8', timeout=120).stdout


def enviar(casos, repo, limite=5):
    """Un issue por par estable de IDs, incluidos los casos ya cerrados.

    Si cambian los datos comparados, se comentan los nuevos y un issue cerrado
    se reabre; el cuerpo conserva lo escrito a mano y solo cambia su huella.
    Uno anterior sin huella solo la recibe. Usa listado paginado, no el buscador de GitHub (puede tardar en indexar).
    Una escritura con resultado incierto falla sin reintentar; la siguiente
    pasada vuelve a consultar los issues antes de enviar nada.
    """
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not 1 <= limite <= 20:
        raise ValueError('Repositorio o límite de issues inválido')
    if not casos:
        return {'creados': [], 'existentes': [], 'pendientes': 0}
    paginas = json.loads(_gh(['api', '--paginate', '--slurp',
                             f'repos/{repo}/issues?state=all&per_page=100']))
    existentes = {}
    for pagina in paginas:
        for issue in pagina:
            if 'pull_request' in issue:
                continue
            texto = issue.get('body') or ''
            previa = re.search(r'<!-- voceiro:atletismo-huella:([a-f0-9]{24}) -->', texto)
            for clave in re.findall(r'<!-- voceiro:atletismo:([a-f0-9]{24}) -->', texto):
                existentes[clave] = {'url': issue['html_url'], 'numero': issue.get('number'), 'cuerpo': texto,
                                     'cerrado': issue.get('state') == 'closed', 'huella': previa and previa[1]}
    creados, reutilizados, reabiertos, pendientes, escrituras = [], [], [], 0, 0
    for caso in casos:
        clave = caso['clave']
        if clave in existentes and existentes[clave]['huella'] == huella(caso):
            reutilizados.append(existentes[clave]['url'])
        elif escrituras >= limite:
            pendientes += 1
        elif clave in existentes:
            e, nueva = existentes[clave], marcador_huella(huella(caso))
            ruta = f"repos/{repo}/issues/{int(e['numero'])}"
            if e['huella']:
                # Datos nuevos en un comentario; el cuerpo solo cambia de huella.
                _gh(['api', '--method', 'POST', ruta + '/comments', '--input', '-'],
                    json.dumps({'body': 'Han cambiado los datos comparados.\n\n' + cuerpo(caso)}, ensure_ascii=False))
                datos = {'body': e['cuerpo'].replace(marcador_huella(e['huella']), nueva)}
                if e['cerrado']:
                    datos['state'] = 'open'
            else:
                datos = {'body': e['cuerpo'].rstrip() + '\n\n' + nueva}
            _gh(['api', '--method', 'PATCH', ruta, '--input', '-'], json.dumps(datos, ensure_ascii=False))
            (reabiertos if 'state' in datos else reutilizados).append(e['url'])
            existentes[clave] = {**e, 'huella': huella(caso), 'cuerpo': datos['body'],
                                 'cerrado': e['cerrado'] and 'state' not in datos}
            escrituras += 1
        else:
            # JSON por stdin y argumentos separados: ningún texto de las fuentes
            # se interpreta como shell, opciones de gh o plantilla de comandos.
            titulo = 'Atletismo: revisar coincidencia — ' + re.sub(r'\s+', ' ', caso['citas'][0]['nombre'])[:140]
            respuesta = json.loads(_gh(['api', '--method', 'POST', f'repos/{repo}/issues', '--input', '-'],
                                      json.dumps({'title': titulo, 'body': cuerpo(caso)}, ensure_ascii=False)))
            existentes[clave] = {'url': respuesta['html_url'], 'numero': respuesta.get('number'),
                                 'cuerpo': cuerpo(caso), 'cerrado': False, 'huella': huella(caso)}
            creados.append(respuesta['html_url'])
            escrituras += 1
    return {'creados': creados, 'existentes': reutilizados, 'reabiertos': reabiertos, 'pendientes': pendientes}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    origen = ap.add_mutually_exclusive_group(required=True)
    origen.add_argument('--nucleo', help='Exportación local v2')
    origen.add_argument('--db', help='Base SQLite dedicada')
    origen.add_argument('--turso', action='store_true')
    ap.add_argument('--salida', help='Informe local de incidencias')
    ap.add_argument('--issues', action='store_true', help='Crear issues para los casos nuevos (requiere gh autenticado)')
    ap.add_argument('--repo', help='OWNER/REPO para los issues')
    ap.add_argument('--limite', type=int, default=5)
    args = ap.parse_args(argv)
    if args.issues and not args.repo:
        ap.error('--issues requiere --repo')
    if args.nucleo:
        n = json.loads(Path(args.nucleo).read_text(encoding='utf-8'))
    elif args.turso:
        from .turso import abrir
        n = (abrir().cargar() or {}).get('nucleo')
    else:
        with almacen.abrir(args.db) as db:
            n = (almacen.cargar(db) or {}).get('nucleo')
    casos = coincidencias.incidencias(n)
    informe = {'version': 1, 'casos': casos}
    if args.salida:
        Path(args.salida).write_text(json.dumps(informe, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if args.issues:
        informe['issues'] = enviar(casos, args.repo, args.limite)
    print(json.dumps({'incidencias': len(casos), **({'issues': informe['issues']} if args.issues else {})}, ensure_ascii=False))


if __name__ == '__main__':
    main()
