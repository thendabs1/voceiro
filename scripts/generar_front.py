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
    for carpeta in ('busqueda', 'sync', 'tema', 'tiempo'):
        carpeta_shared = raiz / 'shared' / carpeta
        if carpeta_shared.is_dir():
            for ruta in sorted(carpeta_shared.glob('*.js')):
                modulos[f'{carpeta}/{ruta.name}'] = ruta
    fuentes = {rel: ruta.read_text(encoding='utf-8') for rel, ruta in modulos.items()}

    # Versión común: Pages puede cachear un módulo antiguo mientras llega el
    # HTML nuevo. El hash en cada import evita mezclar versiones.
    h = hashlib.sha256()
    for rel in sorted(fuentes):
        h.update(rel.encode())
        h.update(fuentes[rel].encode())
    version = h.hexdigest()[:10]
    rx_import = re.compile(r"""((?:from|import)\s*\(?\s*['"])(\.{1,2}/[^'"?]+\.js)(['"])""")
    def versionar(codigo):
        return rx_import.sub(lambda m: f'{m.group(1)}{m.group(2)}?v={version}{m.group(3)}', codigo)

    (public / 'index.html').write_text(versionar(html), encoding='utf-8')
    for rel, fuente in fuentes.items():
        destino = public / rel
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(versionar(fuente), encoding='utf-8')


if __name__ == '__main__':
    generar_html()
