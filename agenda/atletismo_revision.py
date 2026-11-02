"""Revisiones de coincidencias y envío explícito de incidencias a GitHub."""
import argparse
import json
from pathlib import Path
import re
import subprocess

from . import almacen, atletismo_coincidencias as coincidencias


def marcador(clave):
    return '<!-- voceiro:atletismo:' + clave + ' -->'


def cuerpo(caso):
    lineas = [marcador(caso['clave']),
              'La comparación automática solicita revisar estas referencias de atletismo.',
              '', 'Motivo: ' + caso['motivo'], '']
    for e in caso['citas']:
        sitio = e.get('lugar') or {}
        lineas += [f"- Fuente e ID: {e['fuente']} / {e['id']}",
                   f"  Nombre: {e['nombre']}", f"  Fechas: {e['inicio']} — {e['fin']}",
                   '  Sede: ' + (sitio.get('municipio_literal') or sitio.get('city') or sitio.get('nombre') or 'sin dato'),
                   '  Ficha: ' + (e.get('url') or 'sin enlace'), '']
    lineas += ['Comparación:', '```json', json.dumps(caso['comparacion'], ensure_ascii=False, indent=2), '```', '',
               'Decidir si es la misma cita, citas distintas o una relación entre conjunto y partes. '
               'Registrar la decisión en las correspondencias de atletismo o conciliar las identidades existentes. '
               'Cerrar este issue no fusiona datos ni borra observaciones.']
    return '\n'.join(lineas)


def _gh(argumentos, entrada=None):
    return subprocess.run(['gh', *argumentos], input=entrada, check=True,
                          capture_output=True, text=True, encoding='utf-8', timeout=120).stdout


def enviar(casos, repo, limite=5):
    """Un issue por par estable de IDs, incluidos los casos ya cerrados.

    Usa listado paginado, no el buscador de GitHub (puede tardar en indexar).
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
            for clave in re.findall(r'<!-- voceiro:atletismo:([a-f0-9]{24}) -->', issue.get('body') or ''):
                existentes[clave] = issue['html_url']
    creados, reutilizados, pendientes = [], [], 0
    for caso in casos:
        clave = caso['clave']
        if clave in existentes:
            reutilizados.append(existentes[clave])
        elif len(creados) >= limite:
            pendientes += 1
        else:
            # JSON por stdin y argumentos separados: ningún texto de las fuentes
            # se interpreta como shell, opciones de gh o plantilla de comandos.
            titulo = 'Atletismo: revisar coincidencia — ' + re.sub(r'\s+', ' ', caso['citas'][0]['nombre'])[:140]
            respuesta = json.loads(_gh(['api', '--method', 'POST', f'repos/{repo}/issues', '--input', '-'],
                                      json.dumps({'title': titulo, 'body': cuerpo(caso)}, ensure_ascii=False)))
            existentes[clave] = respuesta['html_url']
            creados.append(respuesta['html_url'])
    return {'creados': creados, 'existentes': reutilizados, 'pendientes': pendientes}


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
