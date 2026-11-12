"""Vigilancia de la pasada: un issue cuando un paso tolerado falla seguido.

`pasada` anota en agenda_estado (`vigilancia:<paso>`) los fallos consecutivos de
cada paso tolerado y su recuperación; el paso es el grupo de reloj o la CLI.
Con UMBRAL fallos seguidos se abre un issue por paso, o se reabre el suyo; al
recuperarse se comenta y se cierra. El cuerpo se actualiza en silencio y solo se
comenta un error distinto. El repositorio es público: el mensaje se publica sin
consultas de URL ni cadenas con aspecto de clave.
"""
import argparse
from hashlib import sha256
import json
import re
import subprocess

UMBRAL = 2


def marcador(paso):
    return '<!-- voceiro:vigilancia:' + paso + ' -->'


def limpiar(texto):
    # Sin consulta ni fragmento: ahí van claves (apikey, token) de algunas fuentes.
    texto = re.sub(r'(https?://[^\s?#"\'<>]+)[?#][^\s"\'<>]*', r'\1', texto)
    texto = re.sub(r'[A-Za-z0-9_+=-]{32,}', '[oculto]', texto)
    return texto.replace('```', "'''")[:600]


def huella(texto):
    return sha256(limpiar(texto).encode()).hexdigest()[:12]


def cuerpo(paso, e):
    return '\n'.join([
        marcador(paso), '<!-- voceiro:vigilancia-error:' + huella(e.get('mensaje', '')) + ' -->',
        f"El paso `{paso}` de la pasada del calendario lleva {e['errores']} fallos seguidos "
        f"(desde {e['desde']}; último, {e['ultimo_error']}).", '',
        'Último error:', '```', limpiar(e.get('mensaje', '')), '```', '',
        'Lo guardado antes se conserva (agenda/pasada.py). Este issue se comenta y se cierra solo '
        'cuando el paso vuelve a funcionar; si falla otra vez, se reabre.'])


def _gh(argumentos, entrada=None):
    return subprocess.run(['gh', *argumentos], input=entrada, check=True,
                          capture_output=True, text=True, encoding='utf-8', timeout=120).stdout


def revisar(estados, repo, umbral=UMBRAL):
    """Abre, actualiza, reabre o cierra un issue por paso; devuelve lo hecho."""
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or umbral < 1:
        raise ValueError('Repositorio o umbral de vigilancia inválido')
    hecho = {'abiertos': [], 'actualizados': [], 'reabiertos': [], 'cerrados': []}
    pendientes = {p: e for p, e in estados.items() if e.get('errores', 0) >= umbral or e.get('errores') == 0}
    if not pendientes:
        return hecho
    existentes = {}
    for pagina in json.loads(_gh(['api', '--paginate', '--slurp', f'repos/{repo}/issues?state=all&per_page=100'])):
        for issue in pagina:
            texto = issue.get('body') or ''
            m = re.search(r'<!-- voceiro:vigilancia:([A-Za-z0-9_.-]+) -->', texto)
            if 'pull_request' in issue or not m:
                continue
            previa = existentes.get(m[1])
            # Si hubiera dos, manda el más reciente.
            if previa is None or issue['number'] > previa['numero']:
                existentes[m[1]] = {'numero': issue['number'], 'url': issue['html_url'], 'cuerpo': texto,
                                    'cerrado': issue.get('state') == 'closed'}

    def enviar(metodo, ruta, datos):
        return json.loads(_gh(['api', '--method', metodo, f'repos/{repo}/{ruta}', '--input', '-'],
                              json.dumps(datos, ensure_ascii=False)) or '{}')

    for paso, e in sorted(pendientes.items()):
        issue = existentes.get(paso)
        if e['errores'] == 0:
            if issue and not issue['cerrado']:
                ruta = f"issues/{issue['numero']}"
                enviar('POST', ruta + '/comments', {'body': f"Recuperado el {e['recuperado']} tras {e['fallos']} fallos seguidos."})
                enviar('PATCH', ruta, {'state': 'closed', 'state_reason': 'completed'})
                hecho['cerrados'].append(issue['url'])
            continue
        nuevo = cuerpo(paso, e)
        if issue is None:
            r = enviar('POST', 'issues', {'title': f'Calendario: el paso {paso} falla seguido', 'body': nuevo})
            hecho['abiertos'].append(r['html_url'])
            continue
        if issue['cuerpo'] == nuevo and not issue['cerrado']:
            continue
        ruta = f"issues/{issue['numero']}"
        if issue['cerrado']:
            enviar('POST', ruta + '/comments', {'body': 'Vuelve a fallar.'})
        elif huella(e.get('mensaje', '')) not in issue['cuerpo']:
            enviar('POST', ruta + '/comments', {'body': 'Cambia el error:\n```\n' + limpiar(e.get('mensaje', '')) + '\n```'})
        enviar('PATCH', ruta, {'body': nuevo, 'state': 'open'})
        hecho['reabiertos' if issue['cerrado'] else 'actualizados'].append(issue['url'])
    return hecho


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--turso', action='store_true', required=True)
    ap.add_argument('--issues', action='store_true', help='Abrir/cerrar issues (requiere gh autenticado)')
    ap.add_argument('--repo', help='OWNER/REPO para los issues')
    ap.add_argument('--umbral', type=int, default=UMBRAL)
    args = ap.parse_args(argv)
    if args.issues and not args.repo:
        ap.error('--issues requiere --repo')
    from .control import Repositorio
    from .turso import abrir
    estados = Repositorio(remoto=abrir()).vigilancias()
    salida = {'fallando': {p: e['errores'] for p, e in estados.items() if e.get('errores')}}
    if args.issues:
        salida['issues'] = revisar(estados, args.repo, args.umbral)
    print(json.dumps(salida, ensure_ascii=False))


if __name__ == '__main__':
    main()
