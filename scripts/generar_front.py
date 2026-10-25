"""Genera el front estático sin ejecutar la cosecha de titulares."""

import hashlib
import os
import re
from pathlib import Path


def generar_html(fecha=None, total=None, raiz=None):
    # Si fallan los tests del buscador durante la cosecha, conservar el front.
    if os.environ.get('VOCEIRO_FRONT_CONGELADO') == '1':
        print('[front] tests en rojo: se mantiene el front anterior')
        return
    raiz = Path(raiz) if raiz else Path(__file__).resolve().parents[1]
    html = (raiz / 'plantilla.html').read_text(encoding='utf-8')
    if ('{{FECHA}}' in html and fecha is None) or ('{{TOTAL}}' in html and total is None):
        raise ValueError('La plantilla requiere fecha y total de una cosecha')
    if fecha is not None:
        html = html.replace('{{FECHA}}', fecha)
    if total is not None:
        html = html.replace('{{TOTAL}}', str(total))
    public = raiz / 'public'
    public.mkdir(exist_ok=True)

    # Los módulos compartidos viajan con el HTML en Pages.
    modulos = {'parser.js': raiz / 'shared/parser.js'}
    for carpeta in ('busqueda', 'sync', 'tema', 'tiempo', 'calendario', 'territorios'):
        carpeta_shared = raiz / 'shared' / carpeta
        if carpeta_shared.is_dir():
            for ruta in sorted(carpeta_shared.glob('*.js')):
                modulos[f'{carpeta}/{ruta.name}'] = ruta
    fuentes = {rel: ruta.read_text(encoding='utf-8') for rel, ruta in modulos.items()}

    # Como en el lector, las piezas de la interfaz se ensamblan en orden
    # dentro de un único módulo: conservan su ámbito y su orden de arranque.
    # Los diccionarios sí son módulos independientes, uno por idioma.
    front = raiz / 'front'
    fuentes['app.js'] = (
        '// Generado por scripts/generar_front.py desde front/app/*.js. No editar.\n'
        + ''.join(ruta.read_text(encoding='utf-8')
                  for ruta in sorted((front / 'app').glob('*.js')))
    )
    fuentes['estilos.css'] = (
        (raiz / 'shared/tema/paleta.css').read_text(encoding='utf-8')
        + ''.join(ruta.read_text(encoding='utf-8')
                  for ruta in sorted((front / 'estilos').glob('*.css')))
    )
    for ruta in sorted((front / 'idiomas').glob('*.js')):
        fuentes[f'idiomas/{ruta.name}'] = ruta.read_text(encoding='utf-8')

    for ruta in sorted((front / 'vendor').glob('*')):
        if ruta.is_file():
            fuentes[f'vendor/{ruta.name}'] = ruta.read_text(encoding='utf-8')

    # Versión común: Pages puede cachear un módulo antiguo mientras llega el
    # HTML nuevo. El hash en cada import y en los enlaces a JS/CSS evita
    # mezclar versiones, también si solo cambian estilos o traducciones.
    h = hashlib.sha256()
    for rel in sorted(fuentes):
        h.update(rel.encode())
        h.update(fuentes[rel].encode())
    version = h.hexdigest()[:10]
    rx_import = re.compile(r"""((?:from|import)\s*\(?\s*['"])(\.{1,2}/[^'"?]+\.js)(['"])""")
    def versionar(codigo):
        return rx_import.sub(lambda m: f'{m.group(1)}{m.group(2)}?v={version}{m.group(3)}', codigo)

    html = re.sub(r'''((?:src|href)=['"])(\./(?:app\.js|estilos\.css))(['"])''',
                  lambda m: f'{m.group(1)}{m.group(2)}?v={version}{m.group(3)}', html)
    for rel, fuente in fuentes.items():
        destino = public / rel
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(versionar(fuente), encoding='utf-8')
    (public / 'index.html').write_text(versionar(html), encoding='utf-8')


if __name__ == '__main__':
    generar_html()
