import json
import os
from datetime import datetime
import feedparser
import requests
from bs4 import BeautifulSoup
import concurrent.futures

# (Aquí mantienes tu lista MEDIA_CATALOG completa tal cual la tienes)
MEDIA_CATALOG = [
    { 'group':'España · Nacionales', 'items':[
        { 'd':'elpais.com', 'n':'El País', 'lang':'es', 'type':'diario', 'tags':['generalista','nacional'] },
        { 'd':'elmundo.es', 'n':'El Mundo', 'lang':'es', 'type':'diario', 'tags':['generalista','nacional'] },
        { 'd':'eldiario.es', 'n':'elDiario.es', 'lang':'es', 'type':'digital', 'tags':['generalista','digital'] }
    ]}
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
}

def obtener_titular(medio):
    dominio = medio['d']
    nombre = medio['n']
    url = f"https://{dominio}"
    
    # 1. Intentar RSS con timeout rápido
    rutas_rss = [f"{url}/rss", f"{url}/feed", f"{url}/rss.xml"]
    for ruta in rutas_rss:
        try:
            # feedparser no tiene timeout directo limpio, pero podemos usar requests primero
            resp = requests.get(ruta, headers=HEADERS, timeout=3)
            if resp.status_code == 200:
                feed = feedparser.parse(resp.content)
                if feed.entries:
                    return {
                        'medio': nombre,
                        'titular': feed.entries[0].title,
                        'enlace': feed.entries[0].link,
                        'metodo': 'RSS'
                    }
        except:
            continue
            
    # 2. Si no hay RSS, hacer scraping con timeout de 4 segundos
    try:
        respuesta = requests.get(url, headers=HEADERS, timeout=4)
        if respuesta.status_code == 200:
            soup = BeautifulSoup(respuesta.text, 'html.parser')
            for etiqueta in soup.find_all(['h1', 'h2'], limit=10):
                enlace_tag = etiqueta.find('a')
                if enlace_tag and enlace_tag.text.strip():
                    link = enlace_tag.get('href')
                    if not link.startswith('http'):
                        link = url + link if link.startswith('/') else url + '/' + link
                    
                    return {
                        'medio': nombre,
                        'titular': enlace_tag.text.strip(),
                        'enlace': link,
                        'metodo': 'Scraping'
                    }
    except Exception as e:
        pass
        
    return None

def generar_html(resultados):
    os.makedirs('public', exist_ok=True)
    hora_actual = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mis Titulares (Modo Lector)</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                   background-color: #f4f4f9; color: #111; max-width: 800px; margin: 0 auto; padding: 20px; 
                   line-height: 1.6; font-size: 22px; }}
            h1 {{ border-bottom: 2px solid #ccc; padding-bottom: 10px; }}
            .grupo {{ margin-top: 40px; }}
            .grupo-titulo {{ background: #333; color: #fff; padding: 10px; border-radius: 5px; font-size: 24px; }}
            .noticia {{ background: white; padding: 15px; margin-bottom: 15px; border-radius: 8px; 
                       box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
            .medio {{ font-weight: bold; color: #555; font-size: 18px; text-transform: uppercase; }}
            a {{ color: #0056b3; text-decoration: none; font-weight: 600; display: block; margin-top: 5px; }}
            a:hover {{ text-decoration: underline; background-color: #e6f2ff; }}
            .fecha {{ font-size: 16px; color: #666; margin-bottom: 30px; }}
        </style>
    </head>
    <body>
        <h1>Resumen de Prensa</h1>
        <div class="fecha">Última actualización: {hora_actual}</div>
    """
    
    for grupo_data in MEDIA_CATALOG:
        nombre_grupo = grupo_data['group']
        medios_del_grupo = [m['n'] for m in grupo_data['items']]
        titulares_grupo = [r for r in resultados if r and r['medio'] in medios_del_grupo]
        
        if titulares_grupo:
            html += f'<div class="grupo"><div class="grupo-titulo">{nombre_grupo}</div>'
            for t in titulares_grupo:
                html += f"""
                <div class="noticia">
                    <div class="medio">{t['medio']}</div>
                    <a href="{t['enlace']}" target="_blank" rel="noopener">{t['titular']}</a>
                </div>
                """
            html += '</div>'
            
    html += "</body></html>"
    
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(html)

if __name__ == "__main__":
    print("Iniciando recolección de titulares...")
    lista_plana_medios = [item for grupo in MEDIA_CATALOG for item in grupo['items']]
    
    resultados_finales = []
    # Usar max_workers más alto y timeout estricto para que vuele
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        resultados = executor.map(obtener_titular, lista_plana_medios)
        for r in resultados:
            if r:
                print(f"Obtenido: {r['medio']} ({r['metodo']})")
                resultados_finales.append(r)
                
    print(f"Total obtenidos: {len(resultados_finales)}")
    generar_html(resultados_finales)
    print("HTML generado con éxito en public/index.html")
