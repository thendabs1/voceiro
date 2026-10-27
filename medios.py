# medios.py
"""
Catálogo de medios y constantes de configuración para Voceiro.

Este archivo contiene SOLO datos:
  - MEDIA_CATALOG  → catálogo de medios organizado por grupos
  - HEADERS        → cabeceras HTTP para las peticiones
  - GN_LOCALE      → parámetros regionales para Google News RSS

Añadir/editar medios NO requiere tocar la lógica de recolector.py.
"""

# ================================================================
# CATÁLOGO DE MEDIOS
# ================================================================
# 'fuentes': lista ORDENADA de cómo se obtienen los titulares del medio.
# El recolector las prueba en orden y se queda con la primera que trae
# al menos MIN_ITEMS_FUENTE titulares (si ninguna llega, con la que más
# trajo). No hay fallback implícito: lo que no está en la lista no se
# prueba. Un medio sin 'fuentes' usa [('scrape',)].
#
#   ('rss', url)              feed RSS/Atom
#   ('rss', url, 'relay')     ídem, pedido a través del relay de Deno
#   ('sitemap', url)          sitemap de Google News (news:title + fecha)
#   ('sitemap', url, 'relay')
#   ('wp',)                   API REST de WordPress (/wp-json/wp/v2/posts)
#   ('scrape',)               scraping de la home
#   ('scrape', url)           scraping de un listado concreto
#   ('scrape', url, 'relay')  ídem, pedido a través del relay de Deno
#   ('scrape', url, 'noverify') ídem, sin verificar el certificado TLS
#   ('gn',)                   búsqueda site:dominio en Google News
#   ('gn', query)             ídem con operadores extra en la query
MEDIA_CATALOG = [
    # ═══════════════════════════════════════════════════════════════
    # DEPORTES
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Deportes', 'items':[
        { 'd':'2playbook.com','n':'2Playbook','type':'digital','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','negocio'],
          'fuentes':[('rss', 'https://www.2playbook.com/uploads/feeds/feed_2playbook_es.xml'), ('scrape',), ('gn',)] },
        { 'd':'as.com','n':'Diario AS','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','futbol'],
          'fuentes':[('rss', 'https://feeds.as.com/mrss-s/pages/as/site/as.com/portada'), ('scrape',)] },
        { 'd':'eldesmarque.com','n':'El Desmarque','type':'digital','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','digital'],
          'fuentes':[('rss', 'https://www.eldesmarque.com/rss.xml'), ('scrape',), ('gn',)] },
        { 'd':'estadiodeportivo.com','n':'Estadio Deportivo','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','andalucia'],
          'fuentes':[('rss', 'https://www.estadiodeportivo.com/sitemaps/rss.xml'), ('scrape',)] },
        { 'd':'marca.com','n':'Marca','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','futbol'],
          'fuentes':[('rss', 'https://e00-marca.uecdn.es/rss/portada.xml'), ('scrape',)] },
        { 'd':'mundodeportivo.com','n':'Mundo Deportivo','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','futbol','catalan'],
          'fuentes':[('rss', 'https://www.mundodeportivo.com/feed/rss/home/'), ('scrape',)] },
        { 'd':'palco23.com','n':'Palco23','type':'digital','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','negocio'],
          'fuentes':[('rss', 'https://www.palco23.com/rss.xml'), ('scrape',)] },
        { 'd':'relevo.com','n':'Relevo','type':'digital','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','digital'],
          'fuentes':[('rss', 'https://www.relevo.com/rss/'), ('scrape',)] },
        { 'd':'sport.es','n':'Sport','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','futbol','catalan'],
          'fuentes':[('sitemap', 'https://www.sport.es/es/sitemapNews.xml'), ('scrape',), ('gn',)] },
        { 'd':'superdeporte.es','n':'Superdeporte','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','valencia'],
          'fuentes':[('rss', 'https://www.superdeporte.es/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # ECONOMÍA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Economía', 'items':[
        { 'd':'bolsamania.com','n':'Bolsamania','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','mercados'],
          'fuentes':[('rss', 'https://www.bolsamania.com/rss/generarRss2.php'), ('scrape',)] },
        # Fuera (21-10-2026): el feed y la portada devuelven un 202 antibots que pide JS; por Google News solo salen titulares de unas 50 h.
        # { 'd':'brainsre.news','n':'Brains RE','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','inmobiliario'],
        #   'fuentes':[('rss', 'https://brainsre.news/feed/'), ('scrape',)] },
        { 'd':'capitalmadrid.com','n':'Capital Madrid','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','finanzas'],
          'fuentes':[('gn',)] },
        { 'd':'cincodias.com','n':'Cinco Días','type':'diario','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','negocios'],
          'fuentes':[('rss', 'https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/portada'), ('scrape',)] },
        { 'd':'theofficer.es','n':'The Officer','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','negocios'],
          'fuentes':[('rss', 'https://theofficer.es/feed/'), ('scrape',)] },
        { 'd':'economiadigital.es','n':'Economía Digital','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','digital'],
          'fuentes':[('rss', 'https://www.economiadigital.es/rss/'), ('scrape',)] },
        { 'd':'elblogsalmon.com','n':'El Blog Salmón','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','blog'],
          'fuentes':[('rss', 'https://elblogsalmon.com/atom.xml'), ('scrape',)] },
        { 'd':'eleconomista.es','n':'El Economista','type':'diario','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','negocios'],
          'fuentes':[('sitemap', 'https://www.eleconomista.es/sitemap_news_ssl.php'), ('scrape',), ('gn',)] },
        { 'd':'estrategiasdeinversion.com','n':'Estrategias de Inversión','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','inversion'],
          'fuentes':[('rss', 'https://estrategiasdeinversion.com/feed/'), ('scrape',)] },
        { 'd':'expansion.com','n':'Expansión','type':'diario','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','negocios'],
          'fuentes':[('rss', 'https://e00-expansion.uecdn.es/rss/portada.xml'), ('scrape',)] },
        { 'd':'finect.com','n':'Finect','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','finanzas'],
          'fuentes':[('rss', 'https://www.finect.com/v4/bff/rss/articles.rss'), ('scrape',)] },
        { 'd':'idealista.com','n':'Idealista News','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','vivienda'],
          'fuentes':[('rss', 'https://www.idealista.com/news/rss/v2/latest-news.xml', 'relay'), ('gn',)] },
        { 'd':'invertia.com','n':'Invertia','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','mercados'],
          'fuentes':[('rss', 'https://www.elespanol.com/rss/invertia/'), ('scrape',)] },
        { 'd':'libremercado.com','n':'Libre Mercado','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','liberal'],
          'fuentes':[('rss', 'https://www.libremercado.com/rss.xml'), ('scrape',)] },
        { 'd':'mercadofinanciero.com','n':'Mercado Financiero','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','mercados'],
          'fuentes':[('gn',), ('scrape',)] },
        { 'd':'murciaeconomia.com','n':'Murcia Economía','type':'digital','sector':'economia','ambito':'regional','region':'murcia','pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','murcia'],
          'fuentes':[('gn',)] },
        { 'd':'valenciaplaza.com','n':'Valencia Plaza','type':'digital','sector':'economia','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','valencia'],
          'fuentes':[('rss', 'https://valenciaplaza.com/rss'), ('scrape',)] },
        { 'd':'viaempresa.cat','n':'Via Empresa','type':'digital','sector':'economia','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['economia'],
          'fuentes':[('rss', 'https://www.viaempresa.cat/uploads/feeds/feed_via-empresa-2024_es.xml'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # TECNOLOGÍA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Tecnología', 'items':[
        { 'd':'adslzone.net','n':'ADSLZone','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','internet'],
          'fuentes':[('rss', 'https://www.adslzone.net/feed/'), ('scrape',)] },
        { 'd':'andro4all.com','n':'Andro4all','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','android'],
          'fuentes':[('rss', 'https://andro4all.com/feed'), ('scrape',)] },
        { 'd':'applesfera.com','n':'Applesfera','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','apple'],
          'fuentes':[('rss', 'https://feeds.weblogssl.com/applesfera'), ('scrape',)] },
        { 'd':'computerhoy.com','n':'Computer Hoy','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia'],
          'fuentes':[('rss', 'https://computerhoy.20minutos.es/rss/'), ('scrape',)] },
        { 'd':'computerworld.es','n':'Computerworld España','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','empresa'],
          'fuentes':[('rss', 'https://www.computerworld.es/feed/'), ('scrape',)] },
        { 'd':'elandroidelibre.elespanol.com','n':'El Androide Libre','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','android'],
          'fuentes':[('rss', 'https://www.elespanol.com/rss/elandroidelibre/'), ('scrape',)] },
        { 'd':'elchapuzasinformatico.com','n':'El Chapuzas Informático','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','hardware'],
          'fuentes':[('rss', 'https://elchapuzasinformatico.com/feed', 'relay'), ('gn',)] },
        { 'd':'genbeta.com','n':'Genbeta','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','software'],
          'fuentes':[('rss', 'https://feeds.weblogssl.com/genbeta'), ('scrape',)] },
        { 'd':'hardzone.es','n':'HardZone','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','hardware'],
          'fuentes':[('rss', 'https://hardzone.es/feed/'), ('scrape',)] },
        { 'd':'hipertextual.com','n':'Hipertextual','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','cultura'],
          'fuentes':[('gn',)] },
        { 'd':'ituser.es','n':'IT User','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','empresa'],
          # La portada requiere www y no trae hora: GN sigue siendo la primera opción.
          'fuentes':[('gn',), ('scrape', 'https://www.ituser.es/')] },
        { 'd':'muycomputer.com','n':'MuyComputer','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','hardware'],
          'fuentes':[('rss', 'https://www.muycomputer.com/feed/'), ('scrape',)] },
        { 'd':'profesionalreview.com','n':'Profesional Review','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','hardware'],
          'fuentes':[('rss', 'https://www.profesionalreview.com/feed/'), ('scrape',)] },
        { 'd':'silicon.es','n':'Silicon','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','empresa'],
          'fuentes':[('rss', 'https://silicon.es/feed/'), ('scrape',)] },
        { 'd':'teknofilo.com','n':'Teknófilo','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','movil'],
          'fuentes':[('rss', 'https://www.teknofilo.com/feed/'), ('scrape',)] },
        { 'd':'xataka.com','n':'Xataka','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','gadgets'],
          'fuentes':[('rss', 'https://feeds.weblogssl.com/xataka2'), ('scrape',)] },
        { 'd':'xatakaciencia.com','n':'Xataka Ciencia','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','tecnologia'],
          'fuentes':[('rss', 'https://feeds.weblogssl.com/xatakaciencia'), ('scrape',)] },
        { 'd':'xatakamovil.com','n':'Xataka Móvil','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','movil'],
          'fuentes':[('rss', 'https://xatakamovil.com/atom.xml'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # CIENCIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Ciencia', 'items':[
        { 'd':'agenciasinc.es','n':'SINC','type':'digital','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','publico'],
          # La portada ya se puede extraer, pero no trae fechas: conservar la hora de GN.
          'fuentes':[('gn',), ('scrape',)] },
        { 'd':'consalud.es','n':'ConSalud','type':'digital','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['salud'],
          'fuentes':[('rss', 'https://www.consalud.es/feed/'), ('scrape',)] },
        { 'd':'diariomedico.com','n':'Diario Médico','type':'digital','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['salud','profesional'],
          'fuentes':[('rss', 'https://diariomedico.com/feed/'), ('scrape',)] },
        { 'd':'muyinteresante.okdiario.com','n':'Muy Interesante','type':'revista','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','divulgacion'],
          'fuentes':[('wp',), ('scrape',), ('gn',)] },
        { 'd':'nationalgeographic.com.es','n':'National Geographic España','type':'revista','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','naturaleza'],
          'fuentes':[('rss', 'https://www.nationalgeographic.com.es/feeds/rss'), ('scrape',), ('gn',)] },
        { 'd':'naukas.com','n':'Naukas','type':'digital','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','blog'],
          'fuentes':[('rss', 'https://naukas.com/feed/'), ('scrape',)] },
        { 'd':'quo.es','n':'Quo','type':'revista','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','divulgacion'],
          'fuentes':[('rss', 'https://quo.eldiario.es/feed'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # CULTURA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Cultura', 'items':[
        { 'd':'alternativaseconomicas.coop','n':'Alternativas Económicas','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','social'],
          'fuentes':[('scrape',)] },
        { 'd':'elcritic.cat','n':'Crític','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['ca'],'lang_principal':'ca','tags':['cultural','investigacion'],
          'fuentes':[('rss', 'https://www.elcritic.cat/feed'), ('scrape',), ('gn',)] },
        { 'd':'ctxt.es','n':'CTXT','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','investigacion'],
          'fuentes':[('gn',)] },
        { 'd':'culturainquieta.com','n':'Cultura Inquieta','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural'],
          'fuentes':[('rss', 'https://www.culturainquieta.com/feed/'), ('scrape',)] },
        { 'd':'elsaltodiario.com','n':'El Salto','type':'digital','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'],
          'fuentes':[('rss', 'https://www.elsaltodiario.com/general/feed'), ('scrape',), ('gn',)] },
        { 'd':'ethic.es','n':'Ethic','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','sociedad'],
          'fuentes':[('rss', 'https://www.ethic.es/rss/'), ('scrape',)] },
        { 'd':'jotdown.es','n':'Jot Down','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','entrevistas'],
          'fuentes':[('rss', 'https://www.jotdown.es/feed/'), ('scrape',)] },
        { 'd':'lamarea.com','n':'La Marea','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','progresista'],
          'fuentes':[('rss', 'https://www.lamarea.com/feed/'), ('scrape',)] },
        { 'd':'letraslibres.com','n':'Letras Libres','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','literatura'],
          'fuentes':[('rss', 'https://letraslibres.com/feed/'), ('scrape',)] },
        { 'd':'revistamongolia.com','n':'Mongolia','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','humor'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'yorokobu.es','n':'Yorokobu','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','creatividad'],
          'fuentes':[('rss', 'https://www.yorokobu.es/feed/'), ('scrape',)] },
        { 'd':'zendalibros.com','n':'Zenda Libros','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','libros'],
          'fuentes':[('rss', 'https://www.zendalibros.com/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # NACIONAL
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Nacional', 'items':[
        { 'd':'20minutos.es','n':'20 Minutos','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','gratuito'],
          'fuentes':[('rss', 'https://www.20minutos.es/rss/'), ('scrape',)] },
        { 'd':'abc.es','n':'ABC','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional','conservador'],
          'fuentes':[('rss', 'https://www.abc.es/rss/feeds/abc_ultima.xml'), ('scrape',)] },
        { 'd':'antena3.com','n':'Antena 3','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','tv'],
          'fuentes':[('rss', 'https://www.antena3.com/rss/347795.xml'), ('scrape',)] },
        { 'd':'cadenaser.com','n':'Cadena SER','type':'radio','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','radio'],
          'fuentes':[('rss', 'https://cadenaser.com/arc/outboundfeeds/rss/?outputType=xml'), ('scrape',), ('gn',)] },
        { 'd':'cambio16.com','n':'Cambio16','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('wp',), ('scrape',), ('gn',)] },
        { 'd':'confilegal.com','n':'Confilegal','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['justicia','digital'],
          'fuentes':[('rss', 'https://confilegal.com/feed/'), ('scrape',)] },
        { 'd':'cope.es','n':'COPE','type':'radio','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','radio','conservador'],
          'fuentes':[('rss', 'https://www.cope.es/api/es/news/rss.xml'), ('scrape',)] },
        { 'd':'cuatro.com','n':'Cuatro','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','tv'],
          'fuentes':[('rss', 'https://www.cuatro.com/rss.xml'), ('scrape',), ('gn',)] },
        { 'd':'diariocritico.com','n':'Diario Crítico','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.diariocritico.com/rss/ultimasNoticias/', 'relay'), ('gn',)] },
        { 'd':'efe.com','n':'Agencia EFE','type':'agencia','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['agencia','nacional'],
          'fuentes':[('gn',)] },
        { 'd':'elboletin.com','n':'El Boletín','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.elboletin.com/feed/'), ('scrape',)] },
        { 'd':'elconfidencial.com','n':'El Confidencial','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://rss.elconfidencial.com/espana/'), ('scrape',)] },
        { 'd':'eldebate.com','n':'El Debate','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','conservador'],
          'fuentes':[('rss', 'https://www.eldebate.com/rss/home.xml'), ('scrape',)] },
        { 'd':'eldiario.es','n':'elDiario.es','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'],
          'fuentes':[('rss', 'https://www.eldiario.es/rss/'), ('scrape',)] },
        { 'd':'elespanol.com','n':'El Español','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.elespanol.com/rss/'), ('scrape',)] },
        { 'd':'elindependiente.com','n':'El Independiente','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.elindependiente.com/rss/'), ('scrape',)] },
        { 'd':'elmundo.es','n':'El Mundo','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional'],
          'fuentes':[('rss', 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml'), ('scrape',)] },
        { 'd':'elpais.com','n':'El País','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional'],
          'fuentes':[('rss', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'), ('scrape',)] },
        { 'd':'elperiodico.com','n':'El Periódico','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional','catalan'],
          'fuentes':[('sitemap', 'https://www.elperiodico.com/es/sitemapNews.xml'), ('scrape',), ('gn',)] },
        { 'd':'elplural.com','n':'El Plural','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'],
          'fuentes':[('rss', 'https://www.elplural.com/uploads/feeds/feed_elplural_es.xml'), ('scrape',)] },
        # Fuera (21-10-2026): el medio está parado; el último artículo del feed es de julio de 2023.
        # { 'd':'elsiglodeuropa.es','n':'El Siglo de Europa','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
        #   'fuentes':[('scrape', 'https://elsiglodeuropa.es', 'relay'), ('gn',)] },
        { 'd':'elviejotopo.com','n':'El Viejo Topo','type':'revista','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','izquierda'],
          'fuentes':[('rss', 'https://www.elviejotopo.com/feed/'), ('scrape',), ('gn',)] },
        { 'd':'europapress.es','n':'Europa Press','type':'agencia','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['agencia','nacional'],
          'fuentes':[('rss', 'https://www.europapress.es/rss/rss.aspx'), ('scrape',)] },
        { 'd':'huffingtonpost.es','n':'El HuffPost','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'],
          'fuentes':[('rss', 'https://www.huffingtonpost.es/feeds/index.xml'), ('scrape',)] },
        { 'd':'infolibre.es','n':'InfoLibre','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'],
          'fuentes':[('rss', 'https://www.infolibre.es/rss/'), ('scrape',)] },
        { 'd':'larazon.es','n':'La Razón','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional','conservador'],
          'fuentes':[('rss', 'https://www.larazon.es/?outputType=xml'), ('scrape',)] },
        { 'd':'lasexta.com','n':'La Sexta','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','tv'],
          'fuentes':[('rss', 'https://www.lasexta.com/rss/348128.xml'), ('scrape',)] },
        { 'd':'lavanguardia.com','n':'La Vanguardia','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional','catalan'],
          'fuentes':[('rss', 'https://www.lavanguardia.com/rss/home.xml'), ('scrape',)] },
        { 'd':'libertaddigital.com','n':'Libertad Digital','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','liberal'],
          'fuentes':[('rss', 'https://feeds.feedburner.com/libertaddigital/portada'), ('scrape',)] },
        { 'd':'mientrastanto.org','n':'Mientras Tanto','type':'revista','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['politica','izquierda'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'moncloa.com','n':'Moncloa','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.moncloa.com/rss/'), ('scrape',)] },
        { 'd':'nuevarevista.net','n':'Nueva Revista','type':'revista','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','ideas'],
          'fuentes':[('rss', 'https://www.nuevarevista.net/feed/'), ('scrape',), ('gn',)] },
        { 'd':'okdiario.com','n':'OK Diario','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','conservador'],
          'fuentes':[('rss', 'https://okdiario.com/feed/'), ('scrape',)] },
        { 'd':'ondacero.es','n':'Onda Cero','type':'radio','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','radio'],
          'fuentes':[('rss', 'https://www.ondacero.es/rss/8145.xml'), ('scrape',)] },
        { 'd':'periodistadigital.com','n':'Periodista Digital','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.periodistadigital.com/feed/'), ('scrape',)] },
        { 'd':'publico.es','n':'Público','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'],
          'fuentes':[('scrape', 'https://www.publico.es/ultimas-noticias'), ('gn',)] },
        { 'd':'que.es','n':'Qué!','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','gratuito'],
          'fuentes':[('rss', 'https://www.que.es/rss/'), ('scrape',)] },
        { 'd':'republica.com','n':'Republica.com','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://republica.com/feed'), ('scrape',)] },
        { 'd':'rtve.es','n':'RTVE','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','publico','tv','radio'],
          'fuentes':[('scrape', 'https://www.rtve.es/noticias/'), ('gn',)] },
        { 'd':'servimedia.es','n':'Servimedia','type':'agencia','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['agencia','social'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'telecinco.es','n':'Telecinco','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','tv'],
          'fuentes':[('rss', 'https://www.telecinco.es/rss.xml'), ('scrape',), ('gn',)] },
        { 'd':'theobjective.com','n':'The Objective','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.theobjective.com/rss/'), ('scrape',)] },
        { 'd':'vientosur.info','n':'Viento Sur','type':'revista','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['politica','izquierda'],
          'fuentes':[('rss', 'https://vientosur.info/feed/'), ('scrape',)] },
        { 'd':'vozpopuli.com','n':'Vozpópuli','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'],
          'fuentes':[('sitemap', 'https://www.vozpopuli.com/sitemaps/google-news.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · ANDALUCÍA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Andalucía', 'items':[
        { 'd':'andaluciainformacion.es','n':'Andalucía Información','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.andaluciainformacion.es/rss/'), ('scrape',)] },
        { 'd':'cordopolis.eldiario.es','n':'Cordópolis','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','cordoba'],
          'fuentes':[('rss', 'https://cordopolis.eldiario.es/rss/'), ('scrape',)] },
        { 'd':'diariocordoba.com','n':'Diario Córdoba','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.diariocordoba.com/rss/'), ('scrape',)] },
        { 'd':'diariodealmeria.es','n':'Diario de Almería','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','almeria'],
          'fuentes':[('rss', 'https://www.diariodealmeria.es/rss/'), ('scrape',)] },
        { 'd':'diariodecadiz.es','n':'Diario de Cádiz','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.diariodecadiz.es/rss/'), ('scrape',)] },
        { 'd':'diariodejerez.es','n':'Diario de Jerez','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.diariodejerez.es/rss/'), ('scrape',)] },
        { 'd':'diariodesevilla.es','n':'Diario de Sevilla','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.diariodesevilla.es/rss/'), ('scrape',)] },
        { 'd':'diariosur.es','n':'Diario Sur','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.diariosur.es/rss/2.0/?section='), ('scrape',)] },
        { 'd':'elcorreoweb.es','n':'El Correo de Andalucía','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.elcorreoweb.es/rss/'), ('scrape',)] },
        { 'd':'granadadigital.es','n':'Granada Digital','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','granada'],
          'fuentes':[('gn',)] },
        { 'd':'granadahoy.com','n':'Granada Hoy','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.granadahoy.com/rss/'), ('scrape',)] },
        { 'd':'huelvaya.es','n':'Huelva Ya','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','huelva'],
          'fuentes':[('sitemap', 'https://huelvaya.es/sitemap-news.xml'), ('scrape',), ('gn',)] },
        { 'd':'ideal.es','n':'Ideal','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.ideal.es/rss/2.0/?section='), ('scrape',)] },
        { 'd':'laopiniondemalaga.es','n':'La Opinión de Málaga','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.laopiniondemalaga.es/rss/'), ('scrape',)] },
        { 'd':'malagahoy.es','n':'Málaga Hoy','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'],
          'fuentes':[('rss', 'https://www.malagahoy.es/rss/'), ('scrape',)] },
        { 'd':'sevillaactualidad.com','n':'Sevilla Actualidad','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','sevilla'],
          'fuentes':[('rss', 'https://www.sevillaactualidad.com/feed/', 'relay'), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · ARAGÓN
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Aragón', 'items':[
        { 'd':'elperiodicodearagon.com','n':'El Periódico de Aragón','type':'diario','sector':'generalista','ambito':'regional','region':'aragon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','aragon'],
          'fuentes':[('rss', 'https://www.elperiodicodearagon.com/rss/'), ('scrape',)] },
        { 'd':'heraldo.es','n':'Heraldo de Aragón','type':'diario','sector':'generalista','ambito':'regional','region':'aragon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','aragon'],
          'fuentes':[('rss', 'https://www.heraldo.es/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · ASTURIAS
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Asturias', 'items':[
        { 'd':'elcomercio.es','n':'El Comercio','type':'diario','sector':'generalista','ambito':'regional','region':'asturias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','asturias'],
          'fuentes':[('rss', 'https://www.elcomercio.es/rss/2.0/?section='), ('scrape',)] },
        { 'd':'lavozdeasturias.es','n':'La Voz de Asturias','type':'digital','sector':'generalista','ambito':'regional','region':'asturias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','asturias'],
          'fuentes':[('rss', 'https://lavozdeasturias.es/index.xml'), ('scrape',)] },
        { 'd':'lne.es','n':'La Nueva España','type':'diario','sector':'generalista','ambito':'regional','region':'asturias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','asturias'],
          'fuentes':[('rss', 'https://www.lne.es/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · BALEARES
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Baleares', 'items':[
        { 'd':'diariodeibiza.es','n':'Diario de Ibiza','type':'diario','sector':'generalista','ambito':'regional','region':'baleares','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','baleares'],
          'fuentes':[('rss', 'https://www.diariodeibiza.es/rss/'), ('scrape',)] },
        { 'd':'diariodemallorca.es','n':'Diario de Mallorca','type':'diario','sector':'generalista','ambito':'regional','region':'baleares','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','baleares'],
          'fuentes':[('rss', 'https://www.diariodemallorca.es/rss/'), ('scrape',)] },
        { 'd':'ultimahora.es','n':'Última Hora','type':'diario','sector':'generalista','ambito':'regional','region':'baleares','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','baleares'],
          'fuentes':[('rss', 'https://www.ultimahora.es/feed.rss'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CANARIAS
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Canarias', 'items':[
        { 'd':'canarias7.es','n':'Canarias 7','type':'diario','sector':'generalista','ambito':'regional','region':'canarias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','canarias'],
          'fuentes':[('rss', 'https://www.canarias7.es/rss/portada.xml'), ('scrape',)] },
        { 'd':'diariodeavisos.com','n':'Diario de Avisos','type':'diario','sector':'generalista','ambito':'regional','region':'canarias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','canarias'],
          'fuentes':[('rss', 'https://www.diariodeavisos.com/rss/'), ('scrape',)] },
        { 'd':'eldia.es','n':'El Día','type':'diario','sector':'generalista','ambito':'regional','region':'canarias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','canarias'],
          'fuentes':[('rss', 'https://www.eldia.es/rss/'), ('scrape',)] },
        { 'd':'laprovincia.es','n':'La Provincia','type':'diario','sector':'generalista','ambito':'regional','region':'canarias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','canarias'],
          'fuentes':[('rss', 'https://www.laprovincia.es/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CANTABRIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Cantabria', 'items':[
        { 'd':'eldiariomontanes.es','n':'El Diario Montañés','type':'diario','sector':'generalista','ambito':'regional','region':'cantabria','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','cantabria'],
          'fuentes':[('rss', 'https://www.eldiariomontanes.es/rss/2.0/?section='), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CASTILLA-LA MANCHA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Castilla-La Mancha', 'items':[
        { 'd':'encastillalamancha.es','n':'En Castilla-La Mancha','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-la-mancha','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','clm'],
          'fuentes':[('rss', 'https://www.encastillalamancha.es/rss/'), ('scrape',)] },
        { 'd':'lanzadigital.com','n':'Lanza Digital','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-la-mancha','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','clm'],
          'fuentes':[('rss', 'https://www.lanzadigital.com/rss/'), ('scrape',)] },
        { 'd':'latribunadealbacete.es','n':'La Tribuna de Albacete','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-la-mancha','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','clm'],
          'fuentes':[('sitemap', 'https://www.latribunadealbacete.es/sitemap.news.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CASTILLA Y LEÓN
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Castilla y León', 'items':[
        { 'd':'diariodeleon.es','n':'Diario de León','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','leon'],
          'fuentes':[('rss', 'https://www.diariodeleon.es/rss/home.xml'), ('scrape',)] },
        { 'd':'diariodevalladolid.es','n':'Diario de Valladolid','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valladolid'],
          'fuentes':[('rss', 'https://www.diariodevalladolid.es/rss/home.xml'), ('scrape',)] },
        { 'd':'elcorreodeburgos.com','n':'El Correo de Burgos','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','burgos'],
          'fuentes':[('rss', 'https://www.elcorreodeburgos.com/rss/home.xml'), ('scrape',)] },
        { 'd':'eldiadevalladolid.com','n':'El Día de Valladolid','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castillaleon'],
          'fuentes':[('sitemap', 'https://www.eldiadevalladolid.com/sitemap.news.xml'), ('scrape',), ('gn',)] },
        { 'd':'elmirondesoria.es','n':'El Mirón de Soria','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','soria'],
          'fuentes':[('rss', 'https://elmirondesoria.es/?format=feed&type=rss'), ('scrape',)] },
        { 'd':'elnortedecastilla.es','n':'El Norte de Castilla','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castillaleon'],
          'fuentes':[('rss', 'https://www.elnortedecastilla.es/rss/2.0/?section='), ('scrape',)] },
        { 'd':'lagacetadesalamanca.es','n':'La Gaceta de Salamanca','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castillaleon'],
          'fuentes':[('rss', 'https://www.lagacetadesalamanca.es/rss/2.0/?section='), ('scrape',)] },
        { 'd':'laopiniondezamora.es','n':'La Opinión de Zamora','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castillaleon'],
          'fuentes':[('rss', 'https://www.laopiniondezamora.es/rss/'), ('scrape',)] },
        { 'd':'sorianoticias.com','n':'Soria Noticias','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','soria'],
          'fuentes':[('rss', 'https://sorianoticias.com/rss.xml'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CATALUÑA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Cataluña', 'items':[
        { 'd':'324.cat','n':'324','type':'tv','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','tv','publico'],
          'fuentes':[('rss', 'https://api.3cat.cat/noticies?_format=rss&origen=frontal&frontal=n324-portada-noticia&version=2.0'), ('scrape',)] },
        { 'd':'acn.cat','n':'Agència Catalana de Notícies','type':'agencia','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['agencia','catalan'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'ara.cat','n':'Ara','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'],
          'fuentes':[('rss', 'https://www.ara.cat/rss/'), ('scrape',)] },
        { 'd':'diaridegirona.cat','n':'Diari de Girona','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'],
          'fuentes':[('rss', 'https://www.diaridegirona.cat/rss/'), ('scrape',), ('gn',)] },
        { 'd':'diaridetarragona.com','n':'Diari de Tarragona','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'],
          'fuentes':[('rss', 'https://www.diaridetarragona.com/rss/home.xml'), ('scrape',)] },
        { 'd':'directa.cat','n':'La Directa','type':'revista','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['investigacion','izquierda'],
          'fuentes':[('rss', 'https://directa.cat/feed/'), ('scrape',)] },
        { 'd':'e-noticies.cat','n':'e-Notícies','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'],
          'fuentes':[('gn',)] },
        { 'd':'elmon.cat','n':'El Món','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.elmon.cat/rss'), ('scrape',)] },
        { 'd':'elnacional.cat','n':'El Nacional','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.elnacional.cat/uploads/feeds/feed_ca.xml'), ('scrape',)] },
        { 'd':'elpuntavui.cat','n':'El Punt Avui','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'],
          'fuentes':[('rss', 'https://www.elpuntavui.cat/barcelona.feed?type=rss'), ('scrape',)] },
        { 'd':'naciodigital.cat','n':'Nació Digital','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.naciodigital.cat/rss'), ('scrape',)] },
        { 'd':'rac1.cat','n':'RAC1','type':'radio','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','radio'],
          'fuentes':[('gn',), ('scrape',)] },
        { 'd':'regio7.cat','n':'Regió7','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'],
          'fuentes':[('rss', 'https://www.regio7.cat/rss/'), ('scrape',), ('gn',)] },
        { 'd':'reusdigital.cat','n':'Reus Digital','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','local'],
          'fuentes':[('rss', 'https://reusdigital.cat/rss'), ('scrape',)] },
        { 'd':'segre.com','n':'Segre','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'],
          'fuentes':[('rss', 'https://www.segre.com/ca/rss/home.xml'), ('scrape',)] },
        { 'd':'vilaweb.cat','n':'VilaWeb','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca','es'],'lang_principal':'ca','tags':['generalista','digital'],
          'fuentes':[('rss', 'https://www.vilaweb.cat/feed/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · COMUNIDAD VALENCIANA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Comunidad Valenciana', 'items':[
        { 'd':'alicanteplaza.es','n':'Alicante Plaza','type':'digital','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','alicante'],
          'fuentes':[('rss', 'https://alicanteplaza.es/rss/'), ('scrape',)] },
        { 'd':'castellonplaza.com','n':'Castellón Plaza','type':'digital','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castellon'],
          'fuentes':[('rss', 'https://castellonplaza.com/rss/'), ('scrape',)] },
        { 'd':'elperiodicomediterraneo.com','n':'El Periódico Mediterráneo','type':'diario','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castellon'],
          'fuentes':[('rss', 'https://www.elperiodicomediterraneo.com/rss/'), ('scrape',)] },
        { 'd':'informacion.es','n':'Información','type':'diario','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','alicante'],
          'fuentes':[('rss', 'https://www.informacion.es/rss/'), ('scrape',)] },
        { 'd':'lasprovincias.es','n':'Las Provincias','type':'diario','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valencia'],
          'fuentes':[('rss', 'https://www.lasprovincias.es/rss/2.0/?section='), ('scrape',)] },
        { 'd':'levante-emv.com','n':'Levante-EMV','type':'diario','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valencia'],
          'fuentes':[('rss', 'https://www.levante-emv.com/rss/'), ('scrape',)] },
        { 'd':'valenciaextra.com','n':'Valencia Extra','type':'digital','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valencia'],
          'fuentes':[('rss', 'https://www.valenciaextra.com/uploads/feeds/feed_valencia-extra_ca.xml'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · EXTREMADURA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Extremadura', 'items':[
        { 'd':'elperiodicoextremadura.com','n':'El Periódico Extremadura','type':'diario','sector':'generalista','ambito':'regional','region':'extremadura','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','extremadura'],
          'fuentes':[('rss', 'https://www.elperiodicoextremadura.com/rss/'), ('scrape',)] },
        { 'd':'hoy.es','n':'Hoy','type':'diario','sector':'generalista','ambito':'regional','region':'extremadura','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','extremadura'],
          'fuentes':[('rss', 'https://www.hoy.es/rss/2.0/?section='), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · GALICIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Galicia', 'items':[
        { 'd':'atlantico.net','n':'Atlántico','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','vigo'],
          'fuentes':[('rss', 'https://www.atlantico.net/rss/'), ('scrape',)] },
        { 'd':'campogalego.es','n':'Campo Galego','type':'revista','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['agro','galicia'],
          'fuentes':[('rss', 'https://campogalego.es/feed'), ('scrape',)] },
        { 'd':'crtvg.gal','n':'CRTVG (TVG y Radio Galega)','type':'tv','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','publico','galicia','radio'],
          # El servidor no manda la cadena intermedia del certificado
          'fuentes':[('scrape', 'https://crtvg.gal', 'noverify'), ('gn',)] },
        { 'd':'diariodearousa.com','n':'Diario de Arousa','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','arousa'],
          'fuentes':[('rss', 'https://www.diariodearousa.com/rss/'), ('scrape',)] },
        { 'd':'diariodeferrol.com','n':'Diario de Ferrol','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','ferrol'],
          'fuentes':[('rss', 'https://www.diariodeferrol.com/rss/'), ('scrape',)] },
        { 'd':'diariodepontevedra.es','n':'Diario de Pontevedra','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','pontevedra'],
          'fuentes':[('rss', 'https://www.diariodepontevedra.es/rss/', 'relay'), ('gn',)] },
        { 'd':'diariodevigo.com','n':'Diario de Vigo','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','vigo'],
          'fuentes':[('rss', 'https://diariodevigo.com/feed/'), ('scrape',)] },
        { 'd':'dxtcampeon.com','n':'DxT Campeón','type':'digital','sector':'deportes','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','galicia','coruña'],
          'fuentes':[('rss', 'https://www.dxtcampeon.com/rss/'), ('scrape',)] },
        { 'd':'elcorreogallego.es','n':'El Correo Gallego','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.elcorreogallego.es/rss/'), ('scrape',)] },
        { 'd':'elidealgallego.com','n':'El Ideal Gallego','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','coruña'],
          'fuentes':[('rss', 'https://www.elidealgallego.com/rss/'), ('scrape',)] },
        { 'd':'elprogreso.es','n':'El Progreso','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','lugo'],
          'fuentes':[('rss', 'https://www.elprogreso.es/rss/', 'relay'), ('gn',)] },
        { 'd':'farodevigo.es','n':'Faro de Vigo','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.farodevigo.es/rss/'), ('scrape',)] },
        { 'd':'ferrol360.es','n':'Ferrol 360','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','local','ferrol'],
          'fuentes':[('rss', 'https://www.ferrol360.es/feed/', 'relay'), ('gn',)] },
        { 'd':'ferrolxa.com','n':'FerrolXA','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','ferrol'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'galiciaconfidencial.com','n':'Galicia Confidencial','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.galiciaconfidencial.com/rss/portada.xml'), ('scrape',)] },
        { 'd':'galiciadigital.com','n':'Galicia Digital','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.galiciadigital.com/_feed/index.rss'), ('scrape',), ('gn',)] },
        { 'd':'galiciae.com','n':'Galiciae','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.galiciae.com/rss/'), ('scrape',)] },
        { 'd':'galiciapress.es','n':'Galicia Press','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.galiciapress.es/rss/portada.xml'), ('scrape',)] },
        { 'd':'galiciaunica.es','n':'Galicia Única','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.galiciaunica.es/feed/'), ('scrape',)] },
        { 'd':'laopinioncoruna.es','n':'La Opinión A Coruña','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','coruña'],
          'fuentes':[('rss', 'https://www.laopinioncoruna.es/rss/'), ('scrape',)] },
        { 'd':'laregion.es','n':'La Región','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','ourense'],
          'fuentes':[('rss', 'https://www.laregion.es/rss/'), ('scrape',)] },
        { 'd':'lavozdegalicia.es','n':'La Voz de Galicia','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://lavozdegalicia.es/index.xml'), ('scrape',)] },
        { 'd':'metropolitano.gal','n':'Metropolitano','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','local','vigo'],
          'fuentes':[('rss', 'https://metropolitano.gal/feed/'), ('scrape',)] },
        { 'd':'mundiario.com','n':'Mundiario','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.mundiario.com/rss/'), ('scrape',)] },
        { 'd':'nosdiario.gal','n':'Nós Diario','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','galicia'],
          'fuentes':[('rss', 'https://www.nosdiario.gal/rss/'), ('scrape',)] },
        { 'd':'pontevedraviva.com','n':'Pontevedra Viva','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','local','pontevedra'],
          'fuentes':[('rss', 'https://www.pontevedraviva.com/uploads/feeds/feed_pontevedraviva_gl.xml'), ('scrape',)] },
        { 'd':'praza.gal','n':'Praza Pública','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','galicia'],
          'fuentes':[('scrape',)] },
        { 'd':'radiovoz.com','n':'Radio Voz','type':'radio','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','galicia'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'riazor.org','n':'Riazor.org','type':'digital','sector':'deportes','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','galicia','coruña'],
          'fuentes':[('rss', 'https://www.riazor.org/feed/'), ('scrape',)] },
        { 'd':'vigoe.es','n':'Vigoé','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','local','vigo'],
          'fuentes':[('rss', 'https://www.vigoe.es/feed/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · LA RIOJA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · La Rioja', 'items':[
        { 'd':'larioja.com','n':'La Rioja','type':'diario','sector':'generalista','ambito':'regional','region':'la-rioja','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','rioja'],
          'fuentes':[('rss', 'https://www.larioja.com/rss/2.0/?section='), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · MADRID
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Madrid', 'items':[
        { 'd':'madridiario.es','n':'Madridiario','type':'digital','sector':'generalista','ambito':'regional','region':'madrid','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','madrid'],
          'fuentes':[('rss', 'https://www.madridiario.es/rss/ultimasNoticias/'), ('scrape',), ('gn',)] },
        { 'd':'telemadrid.es','n':'Telemadrid','type':'tv','sector':'generalista','ambito':'regional','region':'madrid','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','tv','publico'],
          'fuentes':[('sitemap', 'https://www.telemadrid.es/sitemap_google_news.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · MURCIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Murcia', 'items':[
        { 'd':'laopiniondemurcia.es','n':'La Opinión de Murcia','type':'diario','sector':'generalista','ambito':'regional','region':'murcia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','murcia'],
          'fuentes':[('rss', 'https://www.laopiniondemurcia.es/rss/'), ('scrape',)] },
        { 'd':'laverdad.es','n':'La Verdad','type':'diario','sector':'generalista','ambito':'regional','region':'murcia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','murcia'],
          'fuentes':[('rss', 'https://www.laverdad.es/rss/2.0/?section='), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · NAVARRA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Navarra', 'items':[
        { 'd':'diariodenavarra.es','n':'Diario de Navarra','type':'diario','sector':'generalista','ambito':'regional','region':'navarra','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','navarra'],
          'fuentes':[('rss', 'https://www.diariodenavarra.es/rss.xml'), ('scrape',)] },
        { 'd':'noticiasdenavarra.com','n':'Noticias de Navarra','type':'diario','sector':'generalista','ambito':'regional','region':'navarra','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','navarra'],
          'fuentes':[('rss', 'https://www.noticiasdenavarra.com/rss/'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · PAÍS VASCO
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · País Vasco', 'items':[
        { 'd':'berria.eus','n':'Berria','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['eu'],'lang_principal':'eu','tags':['generalista','euskadi'],
          'fuentes':[('rss', 'https://www.berria.eus/uploads/feeds/feed_berria_eu.xml'), ('scrape',)] },
        { 'd':'deia.eus','n':'Deia','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'],
          'fuentes':[('rss', 'https://www.deia.eus/rss/'), ('scrape',)] },
        { 'd':'diariovasco.com','n':'Diario Vasco','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'],
          'fuentes':[('rss', 'https://www.diariovasco.com/rss/2.0/?section='), ('scrape',)] },
        { 'd':'eitb.eus','n':'EITB','type':'tv','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['eu'],'lang_principal':'eu','tags':['generalista','tv','publico'],
          'fuentes':[('scrape', 'https://orain.eus/eu/'), ('gn',)] },
        { 'd':'elcorreo.com','n':'El Correo','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'],
          'fuentes':[('rss', 'https://www.elcorreo.com/rss/2.0/?section='), ('scrape',)] },
        { 'd':'naiz.eus','n':'Naiz','type':'digital','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'],
          'fuentes':[('rss', 'https://www.naiz.eus/eu/rss/news.rss'), ('scrape',)] },
        { 'd':'noticiasdealava.eus','n':'Noticias de Álava','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'],
          'fuentes':[('rss', 'https://www.noticiasdealava.eus/rss/'), ('scrape',)] },
        { 'd':'noticiasdegipuzkoa.eus','n':'Noticias de Gipuzkoa','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'],
          'fuentes':[('rss', 'https://www.noticiasdegipuzkoa.eus/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ALEMANIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Alemania', 'items':[
        { 'd':'dw.com','n':'Deutsche Welle','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania','publico'],
          'fuentes':[('rss', 'https://rss.dw.com/xml/rss-de-all'), ('scrape',), ('gn',)] },
        { 'd':'faz.net','n':'FAZ','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania'],
          'fuentes':[('rss', 'https://www.faz.net/rss/aktuell/'), ('scrape',)] },
        { 'd':'spiegel.de','n':'Der Spiegel','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania'],
          'fuentes':[('rss', 'https://www.spiegel.de/schlagzeilen/tops/index.rss'), ('scrape',)] },
        { 'd':'sueddeutsche.de','n':'Süddeutsche Zeitung','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania'],
          'fuentes':[('rss', 'https://rss.sueddeutsche.de/rss/Topthemen'), ('scrape',)] },
        { 'd':'zeit.de','n':'Die Zeit','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania'],
          'fuentes':[('rss', 'https://newsfeed.zeit.de/index'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ARGENTINA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Argentina', 'items':[
        { 'd':'clarin.com','n':'Clarín','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'argentina','langs':['es'],'lang_principal':'es','tags':['generalista','argentina'],
          'fuentes':[('rss', 'https://www.clarin.com/rss/lo-ultimo/'), ('scrape',)] },
        { 'd':'infobae.com','n':'Infobae','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'argentina','langs':['es'],'lang_principal':'es','tags':['generalista','argentina'],
          'fuentes':[('rss', 'https://www.infobae.com/arc/outboundfeeds/rss/category/espana/'), ('scrape',)] },
        { 'd':'lanacion.com.ar','n':'La Nación','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'argentina','langs':['es'],'lang_principal':'es','tags':['generalista','argentina'],
          'fuentes':[('rss', 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · BOLIVIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Bolivia', 'items':[
        { 'd':'eldeber.com.bo','n':'El Deber','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'bolivia','langs':['es'],'lang_principal':'es','tags':['generalista','bolivia'],
          'fuentes':[('rss', 'https://eldeber.com.bo/feed'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · BRASIL
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Brasil', 'items':[
        { 'd':'cartacapital.com.br','n':'CartaCapital','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'],
          'fuentes':[('rss', 'https://www.cartacapital.com.br/feed/'), ('scrape',)] },
        { 'd':'estadao.com.br','n':'O Estado de S. Paulo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'folha.uol.com.br','n':'Folha de S.Paulo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'],
          'fuentes':[('rss', 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml'), ('scrape',)] },
        { 'd':'g1.globo.com','n':'G1','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'],
          'fuentes':[('rss', 'https://g1.globo.com/rss/g1/'), ('scrape',), ('gn',)] },
        { 'd':'oglobo.globo.com','n':'O Globo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'],
          'fuentes':[('rss', 'https://oglobo.globo.com/rss/oglobo'), ('scrape',)] },
        { 'd':'veja.abril.com.br','n':'Veja','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'],
          'fuentes':[('rss', 'https://veja.abril.com.br/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · BÉLGICA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Bélgica', 'items':[
        { 'd':'lalibre.be','n':'La Libre Belgique','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'belgica','langs':['fr'],'lang_principal':'fr','tags':['generalista','belgica'],
          'fuentes':[('rss', 'https://lalibre.be/rss.xml'), ('scrape',)] },
        { 'd':'lesoir.be','n':'Le Soir','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'belgica','langs':['fr'],'lang_principal':'fr','tags':['generalista','belgica'],
          'fuentes':[('sitemap', 'https://www.lesoir.be/sites/default/files/sitemaps/plus_lesoir_be/sitemapnews-0.xml'), ('scrape',), ('gn',)] },
        { 'd':'politico.eu','n':'PoliticoEU','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'belgica','langs':['es'],'lang_principal':'es','tags':['politica','EU'],
          'fuentes':[('rss', 'https://politico.eu/rss/', 'relay')] },
        { 'd':'standaard.be','n':'De Standaard','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'belgica','langs':['nl'],'lang_principal':'nl','tags':['generalista','belgica'],
          'fuentes':[('rss', 'https://standaard.be/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · CATAR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Catar', 'items':[
        { 'd':'aljazeera.com','n':'Al Jazeera','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'qatar','langs':['en'],'lang_principal':'en','tags':['generalista','oriente medio'],
          'fuentes':[('rss', 'https://aljazeera.com/rss'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · CHILE
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Chile', 'items':[
        { 'd':'biobiochile.cl','n':'BioBioChile','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile'],
          'fuentes':[('rss', 'https://feeds.feedburner.com/radiobiobio/NNeJ'), ('scrape',), ('gn',)] },
        { 'd':'ciperchile.cl','n':'CIPER Chile','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['investigacion','chile'],
          'fuentes':[('rss', 'https://www.ciperchile.cl/feed/'), ('scrape',)] },
        { 'd':'cooperativa.cl','n':'Cooperativa','type':'radio','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile','radio'],
          'fuentes':[('sitemap', 'https://www.cooperativa.cl/noticias/sitemap_news.xml'), ('scrape',), ('gn',)] },
        { 'd':'eldesconcierto.cl','n':'El Desconcierto','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile'],
          'fuentes':[('sitemap', 'https://eldesconcierto.cl/sitemap-news.xml'), ('scrape',), ('gn',)] },
        { 'd':'elmostrador.cl','n':'El Mostrador','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile'],
          'fuentes':[('sitemap', 'https://www.elmostrador.cl/sitemap_news.xml'), ('scrape',), ('gn',)] },
        { 'd':'latercera.com','n':'La Tercera','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile'],
          'fuentes':[('rss', 'https://www.latercera.com/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · CHINA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · China', 'items':[
        { 'd':'globaltimes.cn','n':'Global Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'china','langs':['en'],'lang_principal':'en','tags':['generalista','china'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'scmp.com','n':'South China Morning Post','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'china','langs':['en'],'lang_principal':'en','tags':['generalista','asia','china'],
          'fuentes':[('rss', 'https://www.scmp.com/rss/91/feed/'), ('scrape',), ('gn',)] },
        { 'd':'xinhuanet.com','n':'Xinhua','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'china','langs':['en'],'lang_principal':'en','tags':['agencia','china'],
          'fuentes':[('scrape', 'https://english.news.cn/'), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · COLOMBIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Colombia', 'items':[
        { 'd':'elespectador.com','n':'El Espectador','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'colombia','langs':['es'],'lang_principal':'es','tags':['generalista','colombia'],
          'fuentes':[('sitemap', 'https://www.elespectador.com/arc/outboundfeeds/news-sitemap/?outputType=xml'), ('scrape',)] },
        { 'd':'eltiempo.com','n':'El Tiempo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'colombia','langs':['es'],'lang_principal':'es','tags':['generalista','colombia'],
          'fuentes':[('rss', 'https://www.eltiempo.com/rss/colombia.xml'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · COREA DEL SUR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Corea del Sur', 'items':[
        { 'd':'koreaherald.com','n':'The Korea Herald','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'corea-del-sur','langs':['en'],'lang_principal':'en','tags':['generalista','asia','corea'],
          'fuentes':[('rss', 'https://www.koreaherald.com/rss/newsAll'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · COSTA RICA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Costa Rica', 'items':[
        { 'd':'nacion.com','n':'La Nación (CR)','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'costa-rica','langs':['es'],'lang_principal':'es','tags':['generalista','costarica'],
          'fuentes':[('rss', 'https://nacion.com/rss/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · EE.UU.
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · EE.UU.', 'items':[
        { 'd':'abcnews.com','n':'ABC News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'],
          'fuentes':[('rss', 'https://abcnews.go.com/abcnews/topstories'), ('scrape',), ('gn',)] },
        { 'd':'apnews.com','n':'Associated Press','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['agencia','internacional'],
          'fuentes':[('sitemap', 'https://apnews.com/news-sitemap-content.xml', 'relay'), ('gn',)] },
        { 'd':'axios.com','n':'Axios','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['politica','usa'],
          'fuentes':[('rss', 'https://api.axios.com/feed/'), ('scrape',), ('gn',)] },
        { 'd':'bloomberg.com','n':'Bloomberg','type':'digital','sector':'economia','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['economia','internacional'],
          'fuentes':[('rss', 'https://feeds.bloomberg.com/markets/news.rss'), ('scrape',)] },
        { 'd':'businessinsider.com','n':'Business Insider','type':'digital','sector':'economia','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['economia','usa'],
          'fuentes':[('rss', 'https://www.businessinsider.es/rss/'), ('scrape',)] },
        { 'd':'cbsnews.com','n':'CBS News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'],
          'fuentes':[('rss', 'https://www.cbsnews.com/latest/rss/main'), ('scrape',), ('gn',)] },
        { 'd':'cnbc.com','n':'CNBC','type':'tv','sector':'economia','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['economia','usa'],
          'fuentes':[('rss', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'), ('scrape',), ('gn',)] },
        { 'd':'edition.cnn.com','n':'CNN','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','tv'],
          'fuentes':[('sitemap', 'https://www.cnn.com/sitemap/news.xml'), ('scrape',), ('gn',)] },
        { 'd':'elnuevoherald.com','n':'El Nuevo Herald','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['es'],'lang_principal':'es','tags':['generalista','usa','latino'],
          'fuentes':[('rss', 'https://feeds.mcclatchy.com/elnuevoherald/stories'), ('scrape',), ('gn',)] },
        { 'd':'foreignaffairs.com','n':'Foreign Affairs','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['internacional','usa'],
          'fuentes':[('rss', 'https://www.foreignaffairs.com/rss.xml'), ('scrape',)] },
        { 'd':'foreignpolicy.com','n':'Foreign Policy','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['internacional','usa'],
          'fuentes':[('rss', 'https://foreignpolicy.com/feed/'), ('scrape',)] },
        { 'd':'foxnews.com','n':'Fox News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','conservador'],
          'fuentes':[('rss', 'https://foxnews.com/rss.xml'), ('scrape',)] },
        { 'd':'msnbc.com','n':'MSNBC','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','progresista'],
          'fuentes':[('rss', 'https://msnbc.com/feed'), ('scrape',)] },
        { 'd':'nbcnews.com','n':'NBC News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'],
          'fuentes':[('rss', 'https://feeds.nbcnews.com/nbcnews/public/news'), ('scrape',), ('gn',)] },
        { 'd':'newyorker.com','n':'The New Yorker','type':'revista','sector':'cultura','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['cultural','usa'],
          'fuentes':[('rss', 'https://www.newyorker.com/feed/rss'), ('scrape',)] },
        { 'd':'npr.org','n':'NPR','type':'radio','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','radio'],
          'fuentes':[('rss', 'https://feeds.npr.org/1001/rss.xml'), ('scrape',)] },
        { 'd':'nytimes.com','n':'The New York Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','referencia'],
          'fuentes':[('rss', 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml'), ('scrape',)] },
        { 'd':'politico.com','n':'Politico','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['politica','usa'],
          'fuentes':[('rss', 'https://rss.politico.com/politics-news.xml', 'relay'), ('gn',)] },
        { 'd':'telemundo.com','n':'Telemundo','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['es'],'lang_principal':'es','tags':['generalista','usa','latino'],
          'fuentes':[('sitemap', 'https://www.telemundo.com/sitemap/telemundo/sitemap-news'), ('scrape',), ('gn',)] },
        { 'd':'theatlantic.com','n':'The Atlantic','type':'revista','sector':'cultura','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['cultural','usa'],
          'fuentes':[('rss', 'https://www.theatlantic.com/feed/all/'), ('scrape',), ('gn',)] },
        { 'd':'time.com','n':'Time','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'],
          'fuentes':[('rss', 'https://www.time.com/rss/'), ('scrape',)] },
        { 'd':'vox.com','n':'Vox','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'],
          'fuentes':[('rss', 'https://www.vox.com/rss/index.xml'), ('scrape',)] },
        { 'd':'washingtonpost.com','n':'The Washington Post','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'],
          'fuentes':[('rss', 'https://feeds.washingtonpost.com/rss/national', 'relay'), ('gn',)] },
        { 'd':'wsj.com','n':'The Wall Street Journal','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['economia','usa'],
          'fuentes':[('sitemap', 'https://www.wsj.com/wsjsitemaps/wsj_google_news.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ECUADOR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Ecuador', 'items':[
        { 'd':'elcomercio.com','n':'El Comercio (EC)','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'ecuador','langs':['es'],'lang_principal':'es','tags':['generalista','ecuador'],
          'fuentes':[('rss', 'https://elcomercio.com/feed/'), ('scrape',)] },
        { 'd':'eluniverso.com','n':'El Universo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'ecuador','langs':['es'],'lang_principal':'es','tags':['generalista','ecuador'],
          'fuentes':[('rss', 'https://www.eluniverso.com/arc/outboundfeeds/rss/?outputType=xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · EL SALVADOR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · El Salvador', 'items':[
        { 'd':'elfaro.net','n':'El Faro','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'el-salvador','langs':['es'],'lang_principal':'es','tags':['investigacion','salvador'],
          # elfaro.net solo redirige con JavaScript a esta portada.
          'fuentes':[('scrape', 'https://beta.elfaro.net/es/?from=elfaro_main'), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · FRANCIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Francia', 'items':[
        { 'd':'euronews.com','n':'Euronews','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['en'],'lang_principal':'en','tags':['generalista','europa'],
          'fuentes':[('rss', 'https://euronews.com/rss'), ('scrape',)] },
        { 'd':'france24.com','n':'France 24','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia','publico'],
          'fuentes':[('rss', 'https://france24.com/rss'), ('scrape',), ('gn',)] },
        { 'd':'lefigaro.fr','n':'Le Figaro','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia'],
          'fuentes':[('rss', 'https://www.lefigaro.fr/rss/figaro_actualites.xml'), ('scrape',)] },
        { 'd':'lemonde.fr','n':'Le Monde','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia'],
          'fuentes':[('rss', 'https://www.lemonde.fr/rss/une.xml'), ('scrape',)] },
        { 'd':'lesechos.fr','n':'Les Échos','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['economia','francia'],
          'fuentes':[('sitemap', 'https://www.lesechos.fr/sitemap_news.xml'), ('scrape',), ('gn',)] },
        { 'd':'liberation.fr','n':'Libération','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia'],
          'fuentes':[('rss', 'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml'), ('scrape',)] },
        { 'd':'monde-diplomatique.fr','n':'Le Monde Diplomatique','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia'],
          'fuentes':[('rss', 'https://www.monde-diplomatique.fr/rss/'), ('scrape',)] },
        { 'd':'rfi.fr','n':'RFI','type':'radio','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia','publico'],
          'fuentes':[('rss', 'https://www.rfi.fr/fr/rss'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · GUATEMALA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Guatemala', 'items':[
        { 'd':'prensalibre.com','n':'Prensa Libre','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'guatemala','langs':['es'],'lang_principal':'es','tags':['generalista','guatemala'],
          'fuentes':[('rss', 'https://www.prensalibre.com/feed/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · HONDURAS
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Honduras', 'items':[
        { 'd':'elheraldo.hn','n':'El Heraldo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'honduras','langs':['es'],'lang_principal':'es','tags':['generalista','honduras'],
          # Los encabezados envueltos en enlaces no traen hora en la portada.
          'fuentes':[('gn',), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · INDIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · India', 'items':[
        { 'd':'thehindu.com','n':'The Hindu','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'india','langs':['en'],'lang_principal':'en','tags':['generalista','india'],
          'fuentes':[('rss', 'https://www.thehindu.com/feeder/default.rss'), ('scrape',), ('gn',)] },
        { 'd':'timesofindia.indiatimes.com','n':'Times of India','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'india','langs':['en'],'lang_principal':'en','tags':['generalista','india'],
          'fuentes':[('rss', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · IRLANDA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Irlanda', 'items':[
        { 'd':'independent.ie','n':'Irish Independent','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'irlanda','langs':['en'],'lang_principal':'en','tags':['generalista','irlanda'],
          'fuentes':[('rss', 'https://independent.ie/rss/'), ('scrape',)] },
        { 'd':'irishtimes.com','n':'The Irish Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'irlanda','langs':['en'],'lang_principal':'en','tags':['generalista','irlanda'],
          'fuentes':[('rss', 'https://www.irishtimes.com/arc/outboundfeeds/rss/?outputType=xml'), ('scrape',), ('gn',)] },
        { 'd':'rte.ie','n':'RTÉ','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'irlanda','langs':['en'],'lang_principal':'en','tags':['generalista','irlanda','publico'],
          'fuentes':[('rss', 'https://www.rte.ie/feeds/rss/?index=/news/'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ISRAEL
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Israel', 'items':[
        { 'd':'haaretz.com','n':'Haaretz','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'israel','langs':['en'],'lang_principal':'en','tags':['generalista','oriente medio'],
          'fuentes':[('rss', 'https://www.haaretz.com/srv/haaretz-latest-headlines'), ('scrape',), ('gn',)] },
        { 'd':'jpost.com','n':'The Jerusalem Post','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'israel','langs':['en'],'lang_principal':'en','tags':['generalista','oriente medio'],
          'fuentes':[('rss', 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ITALIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Italia', 'items':[
        { 'd':'ansa.it','n':'ANSA','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['agencia','italia'],
          'fuentes':[('rss', 'https://ansa.it/rss.xml'), ('scrape',)] },
        { 'd':'corriere.it','n':'Corriere della Sera','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'],
          'fuentes':[('scrape',), ('gn',)] },
        { 'd':'ilfattoquotidiano.it','n':'Il Fatto Quotidiano','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'],
          'fuentes':[('rss', 'https://www.ilfattoquotidiano.it/feed/'), ('scrape',)] },
        { 'd':'ilmessaggero.it','n':'Il Messaggero','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'],
          'fuentes':[('sitemap', 'https://www.ilmessaggero.it/?sez=XML&p=MapNews'), ('scrape',), ('gn',)] },
        { 'd':'ilsole24ore.com','n':'Il Sole 24 Ore','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['economia','italia'],
          'fuentes':[('rss', 'https://www.ilsole24ore.com/rss/homepage.xml'), ('scrape',), ('gn',)] },
        { 'd':'lastampa.it','n':'La Stampa','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'],
          'fuentes':[('rss', 'https://www.lastampa.it/rss/copertina.xml'), ('scrape',), ('gn',)] },
        { 'd':'repubblica.it','n':'La Repubblica','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'],
          'fuentes':[('rss', 'https://www.repubblica.it/rss/homepage/rss2.0.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · JAPÓN
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Japón', 'items':[
        { 'd':'japantimes.co.jp','n':'The Japan Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'japon','langs':['en'],'lang_principal':'en','tags':['generalista','asia','japon'],
          'fuentes':[('rss', 'https://japantimes.co.jp/feed/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · MÉXICO
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · México', 'items':[
        { 'd':'eluniversal.com.mx','n':'El Universal','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'mexico','langs':['es'],'lang_principal':'es','tags':['generalista','mexico'],
          'fuentes':[('rss', 'https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml'), ('scrape',), ('gn',)] },
        { 'd':'milenio.com','n':'Milenio','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'mexico','langs':['es'],'lang_principal':'es','tags':['generalista','mexico'],
          'fuentes':[('scrape', 'https://www.milenio.com', 'relay'), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · NIGERIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Nigeria', 'items':[
        { 'd':'premiumtimesng.com','n':'Premium Times','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'nigeria','langs':['en'],'lang_principal':'en','tags':['generalista','africa','nigeria'],
          'fuentes':[('rss', 'https://www.premiumtimesng.com/feed'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · PAÍSES BAJOS
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Países Bajos', 'items':[
        { 'd':'nrc.nl','n':'NRC Handelsblad','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paises-bajos','langs':['nl'],'lang_principal':'nl','tags':['generalista','paisesbajos'],
          'fuentes':[('rss', 'https://www.nrc.nl/rss/'), ('scrape',)] },
        { 'd':'telegraaf.nl','n':'De Telegraaf','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paises-bajos','langs':['nl'],'lang_principal':'nl','tags':['generalista','paisesbajos'],
          'fuentes':[('rss', 'https://telegraaf.nl/rss/'), ('scrape',)] },
        { 'd':'trouw.nl','n':'Trouw','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paises-bajos','langs':['nl'],'lang_principal':'nl','tags':['generalista','paisesbajos'],
          'fuentes':[('rss', 'https://trouw.nl/rss.xml'), ('scrape',)] },
        { 'd':'volkskrant.nl','n':'de Volkskrant','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paises-bajos','langs':['nl'],'lang_principal':'nl','tags':['generalista','paisesbajos'],
          'fuentes':[('rss', 'https://volkskrant.nl/rss.xml'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · PARAGUAY
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Paraguay', 'items':[
        { 'd':'abc.com.py','n':'ABC Color','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paraguay','langs':['es'],'lang_principal':'es','tags':['generalista','paraguay'],
          'fuentes':[('rss', 'https://www.abc.com.py/arc/outboundfeeds/rss/?outputType=xml'), ('scrape',), ('gn',)] },
        { 'd':'ultimahora.com','n':'Última Hora (PY)','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paraguay','langs':['es'],'lang_principal':'es','tags':['generalista','paraguay'],
          'fuentes':[('sitemap', 'https://www.ultimahora.com/news-sitemap-content.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · PERÚ
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Perú', 'items':[
        { 'd':'elcomercio.pe','n':'El Comercio','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'peru','langs':['es'],'lang_principal':'es','tags':['generalista','peru'],
          'fuentes':[('rss', 'https://elcomercio.pe/arcio/rss/'), ('scrape',)] },
        { 'd':'gestion.pe','n':'Gestión','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'peru','langs':['es'],'lang_principal':'es','tags':['economia','peru'],
          'fuentes':[('rss', 'https://gestion.pe/arcio/rss/'), ('scrape',)] },
        { 'd':'rpp.pe','n':'RPP','type':'radio','sector':'generalista','ambito':'internacional','region':None,'pais':'peru','langs':['es'],'lang_principal':'es','tags':['generalista','peru','radio'],
          'fuentes':[('rss', 'https://rpp.pe/feed/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · PORTUGAL
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Portugal', 'items':[
        { 'd':'expresso.pt','n':'Expresso','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'portugal','langs':['pt'],'lang_principal':'pt','tags':['generalista','portugal'],
          'fuentes':[('sitemap', 'https://expresso.pt/sitemap/news.xml'), ('scrape',), ('gn',)] },
        { 'd':'sol.iol.pt','n':'SOL','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'portugal','langs':['pt'],'lang_principal':'pt','tags':['generalista','portugal'],
          'fuentes':[('rss', 'https://sol.iol.pt/rss.xml'), ('scrape',)] },
        { 'd':'observador.pt','n':'Observador','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'portugal','langs':['pt'],'lang_principal':'pt','tags':['generalista','portugal'],
          'fuentes':[('rss', 'https://observador.pt/feed/'), ('scrape',)] },
        { 'd':'publico.pt','n':'Público','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'portugal','langs':['pt'],'lang_principal':'pt','tags':['generalista','portugal'],
          'fuentes':[('sitemap', 'https://publico.pt/sitemaps/news.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · REINO UNIDO
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Reino Unido', 'items':[
        { 'd':'bbc.com','n':'BBC','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk','publico'],
          'fuentes':[('rss', 'https://feeds.bbci.co.uk/news/rss.xml'), ('scrape',)] },
        { 'd':'dailymail.co.uk','n':'Daily Mail','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk','tabloide'],
          'fuentes':[('rss', 'https://www.dailymail.com/home/index.rss'), ('scrape',)] },
        { 'd':'economist.com','n':'The Economist','type':'revista','sector':'economia','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['economia','internacional'],
          'fuentes':[('rss', 'https://www.economist.com/the-world-this-week/rss.xml'), ('scrape',)] },
        { 'd':'ft.com','n':'Financial Times','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['economia','uk'],
          'fuentes':[('rss', 'https://www.ft.com/?format=rss'), ('scrape',)] },
        { 'd':'independent.co.uk','n':'The Independent','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'],
          'fuentes':[('rss', 'https://www.independent.co.uk/news/rss'), ('scrape',)] },
        { 'd':'middleeasteye.net','n':'Middle East Eye','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','oriente medio'],
          'fuentes':[('rss', 'https://middleeasteye.net/rss'), ('scrape',)] },
        { 'd':'mirror.co.uk','n':'The Mirror','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk','tabloide'],
          'fuentes':[('sitemap', 'https://www.mirror.co.uk/map_news.xml'), ('scrape',), ('gn',)] },
        { 'd':'news.sky.com','n':'Sky News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'],
          'fuentes':[('scrape', 'https://news.sky.com', 'relay'), ('gn',)] },
        { 'd':'reuters.com','n':'Reuters','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['agencia','internacional'],
          'fuentes':[('sitemap', 'https://www.reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml'), ('scrape',), ('gn',)] },
        { 'd':'telegraph.co.uk','n':'The Telegraph','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'],
          'fuentes':[('rss', 'https://www.telegraph.co.uk/rss.xml'), ('scrape',), ('gn',)] },
        { 'd':'theguardian.com','n':'The Guardian','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'],
          'fuentes':[('rss', 'https://www.theguardian.com/world/rss'), ('scrape',)] },
        { 'd':'thetimes.com','n':'The Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'],
          'fuentes':[('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · REPÚBLICA DOMINICANA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · República Dominicana', 'items':[
        { 'd':'diariolibre.com','n':'Diario Libre','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'republica-dominicana','langs':['es'],'lang_principal':'es','tags':['generalista','republicadominicana'],
          'fuentes':[('rss', 'https://diariolibre.com/rss/economia.xml'), ('scrape',)] },
        { 'd':'listindiario.com','n':'Listín Diario','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'republica-dominicana','langs':['es'],'lang_principal':'es','tags':['generalista','republicadominicana'],
          'fuentes':[('rss', 'https://listindiario.com/rss/home.xml'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · RUSIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Rusia', 'items':[
        { 'd':'tass.com','n':'TASS','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'rusia','langs':['en'],'lang_principal':'en','tags':['agencia','rusia'],
          'fuentes':[('rss', 'https://tass.com/rss/v2.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · SINGAPUR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Singapur', 'items':[
        { 'd':'straitstimes.com','n':'The Straits Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'singapur','langs':['en'],'lang_principal':'en','tags':['generalista','asia','singapur'],
          'fuentes':[('sitemap', 'https://www.straitstimes.com/googlenews.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · SUDÁFRICA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Sudáfrica', 'items':[
        { 'd':'mg.co.za','n':'Mail & Guardian','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'sudafrica','langs':['en'],'lang_principal':'en','tags':['generalista','africa','sudafrica'],
          'fuentes':[('rss', 'https://mg.co.za/atom/'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · SUIZA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Suiza', 'items':[
        { 'd':'swissinfo.ch','n':'SWI swissinfo.ch','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'suiza','langs':['es'],'lang_principal':'es','tags':['generalista','suiza','publico'],
          'fuentes':[('sitemap', 'https://www.swissinfo.ch/spa/sitemap-news.xml'), ('scrape',), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · URUGUAY
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Uruguay', 'items':[
        { 'd':'elobservador.com.uy','n':'El Observador','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'uruguay','langs':['es'],'lang_principal':'es','tags':['generalista','uruguay'],
          'fuentes':[('sitemap', 'https://www.elobservador.com.uy/sitemap-news.xml'), ('scrape',), ('gn',)] },
        { 'd':'elpais.com.uy','n':'El País (UY)','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'uruguay','langs':['es'],'lang_principal':'es','tags':['generalista','uruguay'],
          'fuentes':[('rss', 'https://elpais.com.uy/rss'), ('scrape',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · VENEZUELA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Venezuela', 'items':[
        { 'd':'elnacional.com','n':'El Nacional','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'venezuela','langs':['es'],'lang_principal':'es','tags':['generalista','venezuela'],
          'fuentes':[('rss', 'https://www.elnacional.com/rss/', 'relay'), ('gn',)] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ÁFRICA (pan-regional)
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · África', 'items':[
        { 'd':'africanews.com','n':'Africanews','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'africa','langs':['en'],'lang_principal':'en','tags':['generalista','africa','panafricano'],
          'fuentes':[('rss', 'https://africanews.com/feed/'), ('scrape',)] },
    ]},
]


# ================================================================
# HELPERS
# ================================================================
SECTOR_DISPLAY = {
    'deportes':'Deportes', 'economia':'Economía', 'tecnologia':'Tecnología',
    'ciencia':'Ciencia', 'cultura':'Cultura',
}
REGION_DISPLAY = {
    'andalucia':'Andalucía','aragon':'Aragón','asturias':'Asturias',
    'baleares':'Baleares','canarias':'Canarias','cantabria':'Cantabria',
    'castilla-la-mancha':'Castilla-La Mancha','castilla-y-leon':'Castilla y León',
    'cataluna':'Cataluña','ceuta':'Ceuta','comunidad-valenciana':'Comunidad Valenciana',
    'extremadura':'Extremadura','galicia':'Galicia','la-rioja':'La Rioja',
    'madrid':'Madrid','melilla':'Melilla','murcia':'Murcia','navarra':'Navarra',
    'pais-vasco':'País Vasco',
}
COUNTRY_DISPLAY = {
    'eeuu':'EE.UU.','reino-unido':'Reino Unido','francia':'Francia',
    'alemania':'Alemania','italia':'Italia','portugal':'Portugal',
    'irlanda':'Irlanda','belgica':'Bélgica','paises-bajos':'Países Bajos',
    'suiza':'Suiza','rusia':'Rusia','china':'China','japon':'Japón',
    'india':'India','mexico':'México','argentina':'Argentina','brasil':'Brasil',
    'chile':'Chile','colombia':'Colombia','peru':'Perú','venezuela':'Venezuela',
    'uruguay':'Uruguay','ecuador':'Ecuador','bolivia':'Bolivia',
    'paraguay':'Paraguay','costa-rica':'Costa Rica','guatemala':'Guatemala',
    'honduras':'Honduras','el-salvador':'El Salvador',
    'republica-dominicana':'República Dominicana',
    'sudafrica':'Sudáfrica','nigeria':'Nigeria','israel':'Israel',
    'qatar':'Catar','corea-del-sur':'Corea del Sur','singapur':'Singapur',
    'africa':'África',
}



# ================================================================
# CABECERAS HTTP
# ================================================================
# NO añadir Accept-Encoding, Sec-Fetch-* ni DNT: rompen muchos feeds
# y hacen que requests no pueda descomprimir Brotli.
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
}

# ================================================================
# GOOGLE NEWS · locales por idioma
# ================================================================
# Mapeo: idioma del medio → (hl, gl, ceid) para la URL de Google News
GN_LOCALE = {
    'es': ('es',    'ES', 'ES:es'),
    'ca': ('ca',    'ES', 'ES:ca'),
    'gl': ('gl',    'ES', 'ES:gl'),
    'eu': ('eu',    'ES', 'ES:eu'),
    'en': ('en-US', 'US', 'US:en'),
    'fr': ('fr',    'FR', 'FR:fr'),
    'de': ('de',    'DE', 'DE:de'),
    'it': ('it',    'IT', 'IT:it'),
    'pt': ('pt-PT', 'PT', 'PT:pt-150'),
}

# ================================================================
# HELPERS (opcionales, útiles para análisis y depuración)
# ================================================================
from urllib.parse import quote_plus
def google_news_url(domain, lang='es', extra_q=None):
    """
    Construye la URL del RSS de búsqueda de Google News para un dominio.
    extra_q: string opcional con operadores adicionales.
    """
    hl, gl, ceid = GN_LOCALE.get(lang, GN_LOCALE['es'])
    q = f"site:{domain}"
    if extra_q:
        q = f"{q} {extra_q}"
    return (
        f"https://news.google.com/rss/search?"
        f"q={quote_plus(q)}&hl={hl}&gl={gl}&ceid={ceid}"
    )

def categoria_de(m):
    """(categoría, subcategoría) estructuradas; la subcategoría puede ser None.
    Es la única fuente del literal de grupo, que se conserva tal cual porque los
    modos guardados lo usan como identidad."""
    s = m['sector']; a = m['ambito']
    if s != 'generalista':
        return SECTOR_DISPLAY.get(s, s.replace('-', ' ').title()), None
    if a == 'nacional':
        return 'Nacional', None
    if a == 'regional':
        return 'Regional', REGION_DISPLAY.get(m['region'], m['region'])
    if a == 'internacional':
        return 'Internacional', COUNTRY_DISPLAY.get(m['pais'], m['pais'])
    return 'Otros', None


def _derivar_grupo(m):
    """Deriva el nombre del grupo («Categoría · Subcategoría») a partir de categoria_de."""
    categoria, sub = categoria_de(m)
    return f"{categoria} · {sub}" if sub else categoria


def todos_los_medios():
    """Aplana el catálogo y deriva el grupo."""
    return [
        {**it, 'grupo': _derivar_grupo(it), 'lang': it['lang_principal']}
        for g in MEDIA_CATALOG for it in g['items']
    ]


def total_medios():
    return sum(len(g['items']) for g in MEDIA_CATALOG)


# Campos opcionales de emisor (ver shared/territorios/relacionador.md): ningún
# medio actual los lleva. Ausentes, el territorio sigue saliendo de region/ambito.
#   clase      naturaleza del emisor; ausente = 'medio'
#   sede       [{'estado', 'territorio', 'funcion'?, 'evidencias'}]
#   cobertura  {'estado', 'territorios': [...], 'candidatos'?, 'evidencias'}
CLASES = {'medio', 'club', 'web_aficion', 'federacion', 'administracion', 'universidad',
          'institucion_cultural', 'asociacion', 'colegio_profesional', 'blog', 'newsletter'}
ESTADOS_TERRITORIO = {'resuelto', 'pendiente', 'conflicto'}
FUNCIONES_SEDE = {'editorial', 'social'}


def _ids_validos(x):
    return isinstance(x, list) and all(isinstance(t, str) and t for t in x)


from shared.territorios import evidencia_valida  # noqa: E402 (solo stdlib; sin dependencia circular)


def problemas_forma_emisor(it):
    """Defectos de forma de clase/sede/cobertura; nunca lanza. Las identidades se
    comprueban contra el catálogo territorial en shared.territorios.problemas_territoriales."""
    d, fallos = it['d'], []
    clase = it.get('clase', 'medio')
    if not isinstance(clase, str) or clase not in CLASES:
        fallos.append(f"{d}: clase {clase!r} fuera de {sorted(CLASES)}")
    sedes, cobertura = it.get('sede'), it.get('cobertura')
    if sedes is not None and not isinstance(sedes, list):
        fallos.append(f"{d}: sede debe ser una lista")
    bloques = [('sede', s, 'territorio') for s in sedes] if isinstance(sedes, list) else []
    if cobertura is not None:
        bloques.append(('cobertura', cobertura, 'territorios'))
    for nombre, b, clave in bloques:
        estado = b.get('estado') if isinstance(b, dict) else None
        if not isinstance(estado, str) or estado not in ESTADOS_TERRITORIO:
            fallos.append(f"{d}: {nombre} sin estado válido {sorted(ESTADOS_TERRITORIO)}")
            continue
        valor = b.get(clave)
        if clave == 'territorio':
            if valor is not None and not (isinstance(valor, str) and valor):
                fallos.append(f"{d}: sede con territorio no válido {valor!r}")
            ids = [valor] if valor else []
            funcion = b.get('funcion', 'editorial')
            if not isinstance(funcion, str) or funcion not in FUNCIONES_SEDE:
                fallos.append(f"{d}: sede con función {funcion!r} fuera de {sorted(FUNCIONES_SEDE)}")
        else:
            if valor is not None and not _ids_validos(valor):
                fallos.append(f"{d}: cobertura con territorios no válidos {valor!r}")
            ids = valor if _ids_validos(valor) else []
        evidencias = b.get('evidencias')
        if evidencias is not None and not (isinstance(evidencias, list) and all(map(evidencia_valida, evidencias))):
            fallos.append(f"{d}: {nombre} con evidencias mal formadas (cada una: url o doc, y dato)")
        if estado == 'resuelto' and not (ids and evidencias):
            fallos.append(f"{d}: {nombre} resuelta sin {clave} o sin evidencias")
        if estado != 'resuelto' and ids:
            fallos.append(f"{d}: {nombre} {estado} no puede declarar {clave}")
        candidatos = b.get('candidatos')
        if candidatos is not None and not _ids_validos(candidatos):
            fallos.append(f"{d}: {nombre} con candidatos no válidos {candidatos!r}")
    return fallos


def _validar_catalogo():
    """Verifica consistencia del catálogo. Imprime warnings."""
    import warnings
    TIPOS = {'diario', 'digital', 'radio', 'tv', 'agencia', 'revista'}
    SECTORES = {'generalista', 'deportes', 'economia', 'tecnologia', 'cultura', 'ciencia'}
    AMBITOS = {'nacional', 'regional', 'internacional'}
    vistos = set()
    for it in todos_los_medios():
        d = it['d']
        if d in vistos:
            warnings.warn(f"Dominio duplicado: {d}")
        vistos.add(d)
        if it['type'] not in TIPOS:
            warnings.warn(f"{d}: type '{it['type']}' fuera de {TIPOS}")
        if it['sector'] not in SECTORES:
            warnings.warn(f"{d}: sector '{it['sector']}' fuera de {SECTORES}")
        if it['ambito'] not in AMBITOS:
            warnings.warn(f"{d}: ambito '{it['ambito']}' fuera de {AMBITOS}")
        a, r, p = it['ambito'], it.get('region'), it.get('pais')
        if a == 'regional' and not r:
            warnings.warn(f"{d}: regional sin region")
        if a == 'internacional' and not p:
            warnings.warn(f"{d}: internacional sin pais")
        if a == 'nacional' and (r or p):
            warnings.warn(f"{d}: nacional con region/pais")
        if it['lang_principal'] not in it['langs']:
            warnings.warn(f"{d}: lang_principal '{it['lang_principal']}' no está en langs {it['langs']}")
        for fallo in problemas_forma_emisor(it):
            warnings.warn(fallo)
        for f in fuentes_de(it):
            if _fuente_invalida(f):
                warnings.warn(f"{d}: fuente mal formada {f!r}")


# Aridad válida por tipo de fuente (sin contar el tipo): (mín, máx)
_ARIDAD_FUENTE = {'rss': (1, 2), 'sitemap': (1, 2), 'wp': (0, 0),
                  'scrape': (0, 2), 'gn': (0, 1)}


def _fuente_invalida(f):
    if not isinstance(f, tuple) or not f or f[0] not in _ARIDAD_FUENTE:
        return True
    lo, hi = _ARIDAD_FUENTE[f[0]]
    args = f[1:]
    if not lo <= len(args) <= hi:
        return True
    if f[0] in ('rss', 'sitemap') or (f[0] == 'scrape' and args):
        if not str(args[0]).startswith('http'):
            return True
        opciones = ('relay', 'noverify') if f[0] == 'scrape' else ('relay',)
        if len(args) == 2 and args[1] not in opciones:
            return True
    return False


def fuentes_de(medio):
    """Fuentes del medio en orden; por defecto, scraping de la home."""
    return medio.get('fuentes') or [('scrape',)]


_validar_catalogo()

if __name__ == '__main__':
    print(f"Total de grupos: {len(MEDIA_CATALOG)}")
    print(f"Total de medios: {total_medios()}")
    from collections import Counter
    primeras = Counter(fuentes_de(m)[0][0] for m in todos_los_medios())
    print(f"Primera fuente por tipo: {dict(primeras)}")
