# medios.py
"""
Catálogo de medios y constantes de configuración para Voceiro.

Este archivo contiene SOLO datos:
  - MEDIA_CATALOG  → catálogo de medios organizado por grupos
  - HEADERS        → cabeceras HTTP para las peticiones
  - GN_LOCALE      → parámetros regionales para Google News RSS
  - KNOWN_FEEDS    → feeds RSS oficiales conocidos (fallback)

Añadir/editar medios NO requiere tocar la lógica de recolector.py.
"""

# ================================================================
# CATÁLOGO DE MEDIOS
# ================================================================
MEDIA_CATALOG = [
    # ============================================================
    # ESPAÑA · NACIONALES GENERALISTAS
    # ============================================================
    { 'group':'España · Nacionales', 'items':[

        # Nativos digitales

        # TV y Radio

        # Agencias
        # Añadir al grupo donde prefieras (o crear grupo 'Agencias internacionales')
        { 'd':'20minutos.es',        'n':'20 Minutos',           'lang':'es', 'type':'diario',  'tags':['generalista','gratuito'] },
        { 'd':'abc.es',              'n':'ABC',                  'lang':'es', 'type':'diario',  'tags':['generalista','nacional','conservador'] },
        { 'd':'ansa.it',        'n':'ANSA',       'lang':'it','type':'agencia','tags':['agencia','italia'] },
        { 'd':'antena3.com',         'n':'Antena 3',             'lang':'es', 'type':'tv',      'tags':['generalista','privado','tv'] },
        { 'd':'cadenaser.com',       'n':'Cadena SER',           'lang':'es', 'type':'radio',   'tags':['generalista','radio'] },  # [SIN-FEED: GN/scraping]
        { 'd':'cambio16.com',         'n':'Cambio16',             'lang':'es','type':'digital','tags':['generalista','digital'] },  # [SIN-FEED: GN/scraping]
        { 'd':'confilegal.com',       'n':'Confilegal',           'lang':'es','type':'digital','tags':['justicia','digital'] },
        { 'd':'cope.es',             'n':'COPE',                 'lang':'es', 'type':'radio',   'tags':['generalista','radio','conservador'] },
        { 'd':'cuartopoder.es',       'n':'Cuarto Poder',         'lang':'es','type':'digital','tags':['generalista','progresista'] },  # [SIN-FEED: GN/scraping]
        { 'd':'cuatro.com',          'n':'Cuatro',               'lang':'es', 'type':'tv',      'tags':['generalista','privado','tv'] },
        { 'd':'diariocritico.com',    'n':'Diario Crítico',       'lang':'es','type':'digital','tags':['generalista','digital'] },
        { 'd':'efe.com',             'n':'Agencia EFE',          'lang':'es', 'type':'agencia', 'tags':['agencia','nacional'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'elboletin.com',        'n':'El Boletín',           'lang':'es','type':'digital','tags':['generalista','digital'] },
        { 'd':'elconfidencial.com',  'n':'El Confidencial',      'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'eldebate.com',        'n':'El Debate',            'lang':'es', 'type':'digital', 'tags':['generalista','digital','conservador'] },
        { 'd':'eldiario.es',         'n':'elDiario.es',          'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'elespanol.com',       'n':'El Español',           'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'elindependiente.com', 'n':'El Independiente',     'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'elmundo.es',          'n':'El Mundo',             'lang':'es', 'type':'diario',  'tags':['generalista','nacional'] },
        { 'd':'elpais.com',          'n':'El País',              'lang':'es', 'type':'diario',  'tags':['generalista','nacional'] },
        { 'd':'elperiodico.com',     'n':'El Periódico',         'lang':'es', 'type':'diario',  'tags':['generalista','nacional','catalan'] },  # [SIN-FEED: GN/scraping]
        { 'd':'elplural.com',        'n':'El Plural',            'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'elsiglodeuropa.es',    'n':'El Siglo de Europa',   'lang':'es','type':'digital','tags':['generalista','digital'] },  # [SIN-FEED: GN/scraping]
        { 'd':'elviejotopo.com',      'n':'El Viejo Topo',        'lang':'es','type':'revista','tags':['cultural','izquierda'] },  # [SIN-FEED: GN/scraping]
        { 'd':'europapress.es',      'n':'Europa Press',         'lang':'es', 'type':'agencia', 'tags':['agencia','nacional'] },
        { 'd':'huffingtonpost.es',   'n':'El HuffPost',          'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'infolibre.es',        'n':'InfoLibre',            'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'larazon.es',          'n':'La Razón',             'lang':'es', 'type':'diario',  'tags':['generalista','nacional','conservador'] },
        { 'd':'lasexta.com',         'n':'La Sexta',             'lang':'es', 'type':'tv',      'tags':['generalista','privado','tv'] },
        { 'd':'lavanguardia.com',    'n':'La Vanguardia',        'lang':'es', 'type':'diario',  'tags':['generalista','nacional','catalan'] },
        { 'd':'libertaddigital.com', 'n':'Libertad Digital',     'lang':'es', 'type':'digital', 'tags':['generalista','digital','liberal'] },
        { 'd':'mientrastanto.org',    'n':'Mientras Tanto',       'lang':'es','type':'revista','tags':['politica','izquierda'] },  # [SIN-FEED: GN/scraping]
        { 'd':'moncloa.com',         'n':'Moncloa',              'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'niusdiario.es',        'n':'Nius',                 'lang':'es','type':'digital','tags':['generalista','digital'] },
        { 'd':'nuevarevista.net',     'n':'Nueva Revista',        'lang':'es','type':'revista','tags':['cultural','ideas'] },  # [SIN-FEED: GN/scraping]
        { 'd':'okdiario.com',        'n':'OK Diario',            'lang':'es', 'type':'digital', 'tags':['generalista','digital','conservador'] },
        { 'd':'ondacero.es',         'n':'Onda Cero',            'lang':'es', 'type':'radio',   'tags':['generalista','radio'] },
        { 'd':'periodistadigital.com','n':'Periodista Digital',   'lang':'es','type':'digital','tags':['generalista','digital'] },
        { 'd':'publico.es',          'n':'Público',              'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },  # [SIN-FEED: GN/scraping]
        { 'd':'que.es',              'n':'Qué!',                 'lang':'es', 'type':'diario',  'tags':['generalista','gratuito'] },
        { 'd':'republica.com',        'n':'Republica.com',        'lang':'es','type':'digital','tags':['generalista','digital'] },
        { 'd':'rtve.es',             'n':'RTVE',                 'lang':'es', 'type':'tv',      'tags':['generalista','publico','tv','radio'] },  # [SIN-FEED: GN/scraping]
        { 'd':'servimedia.es',       'n':'Servimedia',           'lang':'es', 'type':'agencia', 'tags':['agencia','social'] },  # [SIN-FEED: GN/scraping]
        { 'd':'telecinco.es',        'n':'Telecinco',            'lang':'es', 'type':'tv',      'tags':['generalista','privado','tv'] },
        { 'd':'theobjective.com',    'n':'The Objective',        'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'vientosur.info',       'n':'Viento Sur',           'lang':'es','type':'revista','tags':['politica','izquierda'] },
        { 'd':'vozpopuli.com',       'n':'Vozpópuli',            'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },  # [SIN-FEED: GN/scraping]
        { 'd':'politico.eu',        'n':'PoliticoEU',             'lang':'es', 'type':'digital', 'tags':['politica','EU'] },
        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-DNS: DNS: [Errno -5] No address associated with hostname] { 'd':'afp.com',        'n':'AFP',        'lang':'en','type':'agencia','tags':['agencia','internacional'] },
        # [CAÍDO-DNS: DNS: [Errno -5] No address associated with hostname] { 'd':'diario16.com',         'n':'Diario16',             'lang':'es','type':'digital','tags':['generalista','digital'] },
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='dpa.com', port=443): Max retries exceeded with url: / (Caused by NewConnectionError("HTTPSConn] { 'd':'dpa.com',        'n':'DPA',        'lang':'de','type':'agencia','tags':['agencia','alemania'] },
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='kyodonews.net', port=443): Max retries exceeded with url: / (Caused by SSLError(SSLCertVerific] { 'd':'kyodonews.net',  'n':'Kyodo News', 'lang':'en','type':'agencia','tags':['agencia','japon'] },
        # [CAÍDO-HTTP: HTTP 500] { 'd':'periodismohumano.com', 'n':'Periodismo Humano',    'lang':'es','type':'digital','tags':['generalista','social'] },
    ]},

    # ============================================================
    # ESPAÑA · DEPORTIVOS
    # ============================================================
    { 'group':'España · Deportivos', 'items':[
        { 'd':'2playbook.com',       'n':'2Playbook',            'lang':'es', 'type':'deportivo', 'tags':['deportes','negocio'] },  # [SIN-FEED: GN/scraping]
        { 'd':'as.com',              'n':'Diario AS',            'lang':'es', 'type':'deportivo', 'tags':['deportes','futbol'] },
        { 'd':'eldesmarque.com',     'n':'El Desmarque',         'lang':'es', 'type':'deportivo', 'tags':['deportes','digital'] },
        { 'd':'estadiodeportivo.com','n':'Estadio Deportivo',    'lang':'es', 'type':'deportivo', 'tags':['deportes','andalucia'] },
        { 'd':'marca.com',           'n':'Marca',                'lang':'es', 'type':'deportivo', 'tags':['deportes','futbol'] },
        { 'd':'mundodeportivo.com',  'n':'Mundo Deportivo',      'lang':'es', 'type':'deportivo', 'tags':['deportes','futbol','catalan'] },
        { 'd':'palco23.com',         'n':'Palco23',              'lang':'es', 'type':'deportivo', 'tags':['deportes','negocio'] },
        { 'd':'relevo.com',          'n':'Relevo',               'lang':'es', 'type':'deportivo', 'tags':['deportes','digital'] },
        { 'd':'sport.es',            'n':'Sport',                'lang':'es', 'type':'deportivo', 'tags':['deportes','futbol','catalan'] },  # [SIN-FEED: GN/scraping]
        { 'd':'superdeporte.es',     'n':'Superdeporte',         'lang':'es', 'type':'deportivo', 'tags':['deportes','valencia'] },
    ]},

    # ============================================================
    # ESPAÑA · ECONÓMICOS
    # ============================================================
    { 'group':'España · Económicos', 'items':[
        { 'd':'bolsamania.com',      'n':'Bolsamania',           'lang':'es', 'type':'economico', 'tags':['economia','mercados'] },
        { 'd':'brainsre.news',         'n':'Brains RE',             'lang':'es','type':'economico','tags':['economia','inmobiliario'] },
        { 'd':'capitalmadrid.com',     'n':'Capital Madrid',        'lang':'es','type':'economico','tags':['economia','finanzas'] },
        { 'd':'cincodias.com',       'n':'Cinco Días',           'lang':'es', 'type':'economico', 'tags':['economia','negocios'] },
        { 'd':'dirigentesdigital.com', 'n':'Dirigentes Digital',    'lang':'es','type':'economico','tags':['economia','negocios'] },
        { 'd':'economiadigital.es',  'n':'Economía Digital',     'lang':'es', 'type':'economico', 'tags':['economia','digital'] },
        { 'd':'elblogsalmon.com',      'n':'El Blog Salmón',        'lang':'es','type':'economico','tags':['economia','blog'] },
        { 'd':'eleconomista.es',     'n':'El Economista',        'lang':'es', 'type':'economico', 'tags':['economia','negocios'] },  # [SIN-FEED: GN/scraping]
        { 'd':'estrategiasdeinversion.com','n':'Estrategias de Inversión','lang':'es','type':'economico','tags':['economia','inversion'] },
        { 'd':'expansion.com',       'n':'Expansión',            'lang':'es', 'type':'economico', 'tags':['economia','negocios'] },
        { 'd':'finect.com',            'n':'Finect',                'lang':'es','type':'economico','tags':['economia','finanzas'] },
        { 'd':'idealista.com',         'n':'Idealista News',        'lang':'es','type':'economico','tags':['economia','vivienda'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'invertia.com',        'n':'Invertia',             'lang':'es', 'type':'economico', 'tags':['economia','mercados'] },
        { 'd':'libremercado.com',    'n':'Libre Mercado',        'lang':'es', 'type':'economico', 'tags':['economia','liberal'] },
        { 'd':'mercadofinanciero.com', 'n':'Mercado Financiero',    'lang':'es','type':'economico','tags':['economia','mercados'] },  # [SIN-FEED: GN/scraping]

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-HTTP: HTTP 410] { 'd':'lainformacion.com',   'n':'La Información',       'lang':'es', 'type':'digital',   'tags':['economico','digital'] },
    ]},

    # ============================================================
    # ESPAÑA · TECNOLOGÍA
    # ============================================================
    { 'group':'España · Tecnología', 'items':[
        { 'd':'adslzone.net',        'n':'ADSLZone',             'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','internet'] },
        { 'd':'andro4all.com',         'n':'Andro4all',             'lang':'es','type':'tecnologia','tags':['tecnologia','android'] },
        { 'd':'applesfera.com',      'n':'Applesfera',           'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','apple'] },
        { 'd':'computerhoy.com',     'n':'Computer Hoy',         'lang':'es', 'type':'tecnologia', 'tags':['tecnologia'] },
        { 'd':'computerworld.es',      'n':'Computerworld España',  'lang':'es','type':'tecnologia','tags':['tecnologia','empresa'] },
        { 'd':'elandroidelibre.elespanol.com','n':'El Androide Libre','lang':'es','type':'tecnologia','tags':['tecnologia','android'] },
        { 'd':'elchapuzasinformatico.com','n':'El Chapuzas Informático','lang':'es','type':'tecnologia','tags':['tecnologia','hardware'] },
        { 'd':'genbeta.com',         'n':'Genbeta',              'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','software'] },  # [SIN-FEED: GN/scraping]
        { 'd':'hardzone.es',           'n':'HardZone',              'lang':'es','type':'tecnologia','tags':['tecnologia','hardware'] },
        { 'd':'hipertextual.com',    'n':'Hipertextual',         'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','cultura'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'ituser.es',             'n':'IT User',               'lang':'es','type':'tecnologia','tags':['tecnologia','empresa'] },  # [SIN-FEED: GN/scraping]
        { 'd':'muycomputer.com',       'n':'MuyComputer',           'lang':'es','type':'tecnologia','tags':['tecnologia','hardware'] },
        { 'd':'profesionalreview.com', 'n':'Profesional Review',    'lang':'es','type':'tecnologia','tags':['tecnologia','hardware'] },
        { 'd':'silicon.es',            'n':'Silicon',               'lang':'es','type':'tecnologia','tags':['tecnologia','empresa'] },
        { 'd':'teknofilo.com',         'n':'Teknófilo',             'lang':'es','type':'tecnologia','tags':['tecnologia','movil'] },
        { 'd':'xataka.com',          'n':'Xataka',               'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','gadgets'] },
        { 'd':'xatakaciencia.com',     'n':'Xataka Ciencia',        'lang':'es','type':'tecnologia','tags':['ciencia','tecnologia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'xatakamovil.com',       'n':'Xataka Móvil',          'lang':'es','type':'tecnologia','tags':['tecnologia','movil'] },

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='omicrono.com', port=443): Max retries exceeded with url: / (Caused by NewConnectionError("HTTP] { 'd':'omicrono.com',          'n':'Omicrono',              'lang':'es','type':'tecnologia','tags':['tecnologia','ciencia'] },
        # [CAÍDO-DNS: DNS: [Errno -2] Name or service not known] { 'd':'wwhatsnew.com',         'n':'WWWhat\'s New',         'lang':'es','type':'tecnologia','tags':['tecnologia','apps'] },
    ]},
    
    { 'group':'España · Ciencia y Salud', 'items':[
        { 'd':'agenciasinc.es',        'n':'SINC',                'lang':'es','type':'digital','tags':['ciencia','publico'] },  # [SIN-FEED: GN/scraping]
        { 'd':'consalud.es',           'n':'ConSalud',            'lang':'es','type':'digital','tags':['salud'] },
        { 'd':'diariomedico.com',      'n':'Diario Médico',       'lang':'es','type':'digital','tags':['salud','profesional'] },
        { 'd':'muyinteresante.okdiario.com',     'n':'Muy Interesante',     'lang':'es','type':'revista','tags':['ciencia','divulgacion'] },
        { 'd':'nationalgeographic.com.es','n':'National Geographic España','lang':'es','type':'revista','tags':['ciencia','naturaleza'] },
        { 'd':'naukas.com',            'n':'Naukas',              'lang':'es','type':'digital','tags':['ciencia','blog'] },
        { 'd':'quo.es',                'n':'Quo',                 'lang':'es','type':'revista','tags':['ciencia','divulgacion'] },

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='redaccionmedica.com', port=443): Max retries exceeded with url: / (Caused by SSLError(SSLCertV] { 'd':'redaccionmedica.com',   'n':'Redacción Médica',    'lang':'es','type':'digital','tags':['salud','profesional'] },
    ]},
    # ============================================================
    # ESPAÑA · CULTURALES / REVISTAS
    # ============================================================
    { 'group':'España · Culturales', 'items':[
        { 'd':'alternativaseconomicas.coop', 'n':'Alternativas Económicas', 'lang':'es', 'type':'revista', 'tags':['economia','social'] },  # [SIN-FEED: GN/scraping]
        { 'd':'elcritic.cat',          'n':'Crític',               'lang':'ca', 'type':'revista', 'tags':['cultural','investigacion'] },  # [SIN-FEED: GN/scraping]
        { 'd':'ctxt.es',             'n':'CTXT',                 'lang':'es', 'type':'revista', 'tags':['cultural','investigacion'] },  # [SIN-FEED: GN/scraping]
        { 'd':'culturainquieta.com', 'n':'Cultura Inquieta',     'lang':'es', 'type':'revista', 'tags':['cultural'] },
        { 'd':'elsaltodiario.com',   'n':'El Salto',             'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },  # [TIMEOUT: revisar]
        { 'd':'ethic.es',            'n':'Ethic',                'lang':'es', 'type':'revista', 'tags':['cultural','sociedad'] },
        { 'd':'jotdown.es',          'n':'Jot Down',             'lang':'es', 'type':'revista', 'tags':['cultural','entrevistas'] },
        { 'd':'lamarea.com',         'n':'La Marea',             'lang':'es', 'type':'revista', 'tags':['cultural','progresista'] },
        { 'd':'letraslibres.com',    'n':'Letras Libres',        'lang':'es', 'type':'revista', 'tags':['cultural','literatura'] },
        { 'd':'revistamongolia.com', 'n':'Mongolia',             'lang':'es', 'type':'revista', 'tags':['cultural','humor'] },  # [SIN-FEED: GN/scraping]
        { 'd':'yorokobu.es',         'n':'Yorokobu',             'lang':'es', 'type':'revista', 'tags':['cultural','creatividad'] },
        { 'd':'zendalibros.com',     'n':'Zenda Libros',         'lang':'es', 'type':'revista', 'tags':['cultural','libros'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · CATALUÑA
    # ============================================================
    { 'group':'Cataluña', 'items':[
        { 'd':'324.cat',             'n':'324',                  'lang':'ca', 'type':'tv',      'tags':['generalista','tv','publico'] },
        { 'd':'acn.cat',             'n':'Agència Catalana de Notícies', 'lang':'ca', 'type':'agencia', 'tags':['agencia','catalan'] },  # [SIN-FEED: GN/scraping]
        { 'd':'ara.cat',             'n':'Ara',                  'lang':'ca', 'type':'diario',  'tags':['generalista','catalan'] },
        { 'd':'diaridegirona.cat',    'n':'Diari de Girona',      'lang':'ca','type':'diario','tags':['generalista','catalan'] },  # [SIN-FEED: GN/scraping]
        { 'd':'diaridetarragona.com', 'n':'Diari de Tarragona',   'lang':'ca','type':'diario','tags':['generalista','catalan'] },
        { 'd':'directa.cat',          'n':'La Directa',           'lang':'ca','type':'revista','tags':['investigacion','izquierda'] },
        { 'd':'e-noticies.cat',       'n':'e-Notícies',           'lang':'ca','type':'digital','tags':['generalista','catalan'] },
        { 'd':'elmon.cat',           'n':'El Món',               'lang':'ca', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'elnacional.cat',      'n':'El Nacional',          'lang':'ca', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'elpuntavui.cat',      'n':'El Punt Avui',         'lang':'ca', 'type':'diario',  'tags':['generalista','catalan'] },
        { 'd':'naciodigital.cat',    'n':'Nació Digital',        'lang':'ca', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'rac1.cat',            'n':'RAC1',                 'lang':'ca', 'type':'radio',   'tags':['generalista','radio'] },  # [SIN-FEED: GN/scraping]
        { 'd':'regio7.cat',           'n':'Regió7',               'lang':'ca','type':'diario','tags':['generalista','catalan'] },  # [SIN-FEED: GN/scraping]
        { 'd':'reusdigital.cat',      'n':'Reus Digital',         'lang':'ca','type':'digital','tags':['generalista','local'] },
        { 'd':'segre.com',            'n':'Segre',                'lang':'ca','type':'diario','tags':['generalista','catalan'] },
        { 'd':'viaempresa.cat',      'n':'Via Empresa',          'lang':'ca', 'type':'economico', 'tags':['economia'] },
        { 'd':'vilaweb.cat',         'n':'VilaWeb',              'lang':'ca', 'type':'digital', 'tags':['generalista','digital'] },

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-HTTP: ('Connection aborted.', ConnectionResetError(104, 'Connection reset by peer'))] { 'd':'ccma.cat',            'n':'CCMA',                 'lang':'ca', 'type':'tv',      'tags':['generalista','tv','publico'] },
        # [CAÍDO-DNS: DNS: [Errno -2] Name or service not known] { 'd':'laronda.cat',          'n':'La Ronda',             'lang':'ca','type':'digital','tags':['generalista','local'] },
        # [CAÍDO-DNS: DNS: [Errno -3] Temporary failure in name resolution] { 'd':'nacio.cat',            'n':'Nació Digital',        'lang':'ca','type':'digital','tags':['generalista','catalan'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · GALICIA (VERIFICADOS Y AMPLIADOS)
    # ============================================================
    { 'group':'Galicia', 'items':[
        { 'd':'atlantico.net',       'n':'Atlántico',            'lang':'es', 'type':'diario',  'tags':['generalista','galicia','vigo'] },
        { 'd':'campogalego.es',       'n':'Campo Galego',         'lang':'gl','type':'revista','tags':['agro','galicia'] },
        { 'd':'crtvg.gal',           'n':'CRTVG (TVG y Radio Galega)', 'lang':'gl', 'type':'tv', 'tags':['generalista','publico','galicia','radio'] },  # [SIN-FEED: GN/scraping]
        { 'd':'diariodearousa.com',  'n':'Diario de Arousa',     'lang':'es', 'type':'diario',  'tags':['generalista','galicia','arousa'] },
        { 'd':'diariodeferrol.com',  'n':'Diario de Ferrol',     'lang':'es', 'type':'diario',  'tags':['generalista','galicia','ferrol'] },
        { 'd':'diariodepontevedra.es', 'n':'Diario de Pontevedra', 'lang':'es', 'type':'diario', 'tags':['generalista','galicia','pontevedra'] },
        { 'd':'diariodevigo.com',     'n':'Diario de Vigo',       'lang':'es','type':'digital','tags':['generalista','vigo'] },
        { 'd':'dxtcampeon.com',      'n':'DxT Campeón',          'lang':'es', 'type':'deportivo', 'tags':['deportes','galicia','coruña'] },
        { 'd':'elcorreogallego.es',  'n':'El Correo Gallego',    'lang':'es', 'type':'diario',  'tags':['generalista','galicia'] },
        { 'd':'elidealgallego.com',  'n':'El Ideal Gallego',     'lang':'es', 'type':'diario',  'tags':['generalista','galicia','coruña'] },
        { 'd':'elprogreso.es',       'n':'El Progreso',          'lang':'es', 'type':'diario',  'tags':['generalista','galicia','lugo'] },
        { 'd':'farodevigo.es',       'n':'Faro de Vigo',         'lang':'es', 'type':'diario',  'tags':['generalista','galicia'] },
        { 'd':'ferrol360.es',        'n':'Ferrol 360',           'lang':'es', 'type':'digital', 'tags':['generalista','local','ferrol'] },
        { 'd':'galiciaconfidencial.com', 'n':'Galicia Confidencial', 'lang':'gl', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'galiciadigital.com',  'n':'Galicia Digital',      'lang':'es', 'type':'digital', 'tags':['generalista','galicia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'galiciae.com',         'n':'Galiciae',             'lang':'gl','type':'digital','tags':['generalista','galicia'] },
        { 'd':'galiciapress.es',     'n':'Galicia Press',        'lang':'es', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'galiciaunica.es',      'n':'Galicia Única',        'lang':'es','type':'digital','tags':['generalista','galicia'] },
        { 'd':'laopinioncoruna.es',  'n':'La Opinión A Coruña',  'lang':'es', 'type':'diario',  'tags':['generalista','galicia','coruña'] },
        { 'd':'laregion.es',         'n':'La Región',            'lang':'es', 'type':'diario',  'tags':['generalista','galicia','ourense'] },
        { 'd':'lavozdegalicia.es',   'n':'La Voz de Galicia',    'lang':'es', 'type':'diario',  'tags':['generalista','galicia'] },
        { 'd':'metropolitano.gal',   'n':'Metropolitano',        'lang':'es', 'type':'digital', 'tags':['generalista','local','vigo'] },
        { 'd':'mundiario.com',       'n':'Mundiario',            'lang':'es', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'nosdiario.gal',       'n':'Nós Diario',           'lang':'gl', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'pontevedraviva.com',  'n':'Pontevedra Viva',      'lang':'es', 'type':'digital', 'tags':['generalista','local','pontevedra'] },
        { 'd':'praza.gal',           'n':'Praza Pública',        'lang':'gl', 'type':'digital', 'tags':['generalista','galicia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'radiovoz.com',        'n':'Radio Voz',            'lang':'es', 'type':'radio',   'tags':['generalista','privado','galicia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'riazor.org',          'n':'Riazor.org',           'lang':'es', 'type':'deportivo', 'tags':['deportes','galicia','coruña'] },
        { 'd':'vigoe.es',            'n':'Vigoé',                'lang':'es', 'type':'digital', 'tags':['generalista','local','vigo'] },
        { 'd':'ferrolxa.com',   'n':'FerrolXA',     'lang':'gl','type':'digital','tags':['generalista','ferrol'] },  # [TIMEOUT: revisar]

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-DNS: DNS: [Errno -2] Name or service not known] { 'd':'galiciant.com',        'n':'Galicia NT',           'lang':'gl','type':'digital','tags':['generalista','galicia'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · PAÍS VASCO / NAVARRA
    # ============================================================
    { 'group':'País Vasco · Navarra', 'items':[
        { 'd':'berria.eus',          'n':'Berria',               'lang':'eu', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'deia.eus',            'n':'Deia',                 'lang':'es', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'diariodenavarra.es',  'n':'Diario de Navarra',    'lang':'es', 'type':'diario',  'tags':['generalista','navarra'] },
        { 'd':'diariovasco.com',     'n':'Diario Vasco',         'lang':'es', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'eitb.eus',            'n':'EITB',                 'lang':'eu', 'type':'tv',      'tags':['generalista','tv','publico'] },  # [SIN-FEED: GN/scraping]
        { 'd':'elcorreo.com',        'n':'El Correo',            'lang':'es', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'naiz.eus',            'n':'Naiz',                 'lang':'es', 'type':'digital', 'tags':['generalista','euskadi'] },
        { 'd':'noticiasdealava.eus', 'n':'Noticias de Álava',    'lang':'es', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'noticiasdegipuzkoa.eus', 'n':'Noticias de Gipuzkoa', 'lang':'es', 'type':'diario', 'tags':['generalista','euskadi'] },
        { 'd':'noticiasdenavarra.com','n':'Noticias de Navarra',  'lang':'es', 'type':'diario',  'tags':['generalista','navarra'] },  # [TIMEOUT: revisar]
    ]},

    # ============================================================
    # AUTONÓMICOS · ARAGÓN · LA RIOJA · CANTABRIA · ASTURIAS
    # ============================================================
    { 'group':'Norte · Aragón · La Rioja · Cantabria · Asturias', 'items':[
        { 'd':'elcomercio.es',       'n':'El Comercio',          'lang':'es', 'type':'diario',  'tags':['generalista','asturias'] },
        { 'd':'eldiariomontanes.es', 'n':'El Diario Montañés',   'lang':'es', 'type':'diario',  'tags':['generalista','cantabria'] },
        { 'd':'elperiodicodearagon.com', 'n':'El Periódico de Aragón', 'lang':'es', 'type':'diario', 'tags':['generalista','aragon'] },
        { 'd':'heraldo.es',          'n':'Heraldo de Aragón',    'lang':'es', 'type':'diario',  'tags':['generalista','aragon'] },
        { 'd':'larioja.com',         'n':'La Rioja',             'lang':'es', 'type':'diario',  'tags':['generalista','rioja'] },
        { 'd':'lavozdeasturias.es',  'n':'La Voz de Asturias',   'lang':'es', 'type':'digital', 'tags':['generalista','asturias'] },
        { 'd':'lne.es',              'n':'La Nueva España',      'lang':'es', 'type':'diario',  'tags':['generalista','asturias'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · CASTILLA Y LEÓN
    # ============================================================
    { 'group':'Castilla y León', 'items':[
        { 'd':'diariodeleon.es',       'n':'Diario de León',       'lang':'es','type':'diario','tags':['generalista','leon'] },
        { 'd':'diariodevalladolid.es', 'n':'Diario de Valladolid', 'lang':'es','type':'digital','tags':['generalista','valladolid'] },
        { 'd':'elcorreodeburgos.com',  'n':'El Correo de Burgos',  'lang':'es','type':'digital','tags':['generalista','burgos'] },
        { 'd':'eldiadevalladolid.com', 'n':'El Día de Valladolid', 'lang':'es', 'type':'diario', 'tags':['generalista','castillaleon'] },  # [TIMEOUT: revisar]
        { 'd':'elmirondesoria.es',     'n':'El Mirón de Soria',    'lang':'es','type':'digital','tags':['generalista','soria'] },
        { 'd':'elnortedecastilla.es','n':'El Norte de Castilla', 'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        { 'd':'lagacetadesalamanca.es', 'n':'La Gaceta de Salamanca', 'lang':'es', 'type':'diario', 'tags':['generalista','castillaleon'] },
        { 'd':'laopiniondezamora.es','n':'La Opinión de Zamora', 'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        { 'd':'sorianoticias.com',     'n':'Soria Noticias',       'lang':'es','type':'digital','tags':['generalista','soria'] },

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='www.diariodeavila.es', port=443): Read timed out.] { 'd':'diariodeavila.es',    'n':'Diario de Ávila',      'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='www.diariodeburgos.es', port=443): Read timed out.] { 'd':'diariodeburgos.es',   'n':'Diario de Burgos',     'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='www.diariopalentino.es', port=443): Read timed out.] { 'd':'diariopalentino.es',    'n':'Diario Palentino',     'lang':'es','type':'diario','tags':['generalista','paleencia'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · CASTILLA-LA MANCHA
    # ============================================================
    { 'group':'Castilla-La Mancha', 'items':[
        { 'd':'encastillalamancha.es', 'n':'En Castilla-La Mancha', 'lang':'es', 'type':'digital', 'tags':['generalista','clm'] },
        { 'd':'lanzadigital.com',    'n':'Lanza Digital',        'lang':'es', 'type':'digital', 'tags':['generalista','clm'] },
        { 'd':'latribunadealbacete.es', 'n':'La Tribuna de Albacete', 'lang':'es', 'type':'diario', 'tags':['generalista','clm'] },  # [TIMEOUT: revisar]

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='latribunadeciudadreal.es', port=443): Read timed out.] { 'd':'latribunadeciudadreal.es', 'n':'La Tribuna de Ciudad Real', 'lang':'es', 'type':'diario', 'tags':['generalista','clm'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · COMUNIDAD VALENCIANA · MURCIA
    # ============================================================
    { 'group':'Comunidad Valenciana · Murcia', 'items':[
        { 'd':'alicanteplaza.es',      'n':'Alicante Plaza',       'lang':'es','type':'digital','tags':['generalista','alicante'] },
        { 'd':'castellonplaza.com',    'n':'Castellón Plaza',      'lang':'es','type':'digital','tags':['generalista','castellon'] },
        { 'd':'elperiodicomediterraneo.com', 'n':'El Periódico Mediterráneo', 'lang':'es', 'type':'diario', 'tags':['generalista','castellon'] },
        { 'd':'informacion.es',        'n':'Información',          'lang':'es','type':'diario','tags':['generalista','alicante'] },
        { 'd':'laopiniondemurcia.es','n':'La Opinión de Murcia', 'lang':'es', 'type':'diario',  'tags':['generalista','murcia'] },
        { 'd':'lasprovincias.es',    'n':'Las Provincias',       'lang':'es', 'type':'diario',  'tags':['generalista','valencia'] },
        { 'd':'laverdad.es',         'n':'La Verdad',            'lang':'es', 'type':'diario',  'tags':['generalista','murcia'] },
        { 'd':'levante-emv.com',     'n':'Levante-EMV',          'lang':'es', 'type':'diario',  'tags':['generalista','valencia'] },
        { 'd':'murciaeconomia.com',  'n':'Murcia Economía',      'lang':'es', 'type':'economico', 'tags':['economia','murcia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'valenciaactua.es',      'n':'Valencia Actúa',       'lang':'es','type':'digital','tags':['generalista','valencia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'valenciaextra.com',     'n':'Valencia Extra',       'lang':'es','type':'digital','tags':['generalista','valencia'] },
        { 'd':'valenciaplaza.com',   'n':'Valencia Plaza',       'lang':'es', 'type':'digital', 'tags':['economia','valencia'] },

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-DNS: DNS: [Errno -2] Name or service not known] { 'd':'diariocv.es',           'n':'Diario CV',            'lang':'es','type':'digital','tags':['generalista','valencia'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · ANDALUCÍA
    # ============================================================
    { 'group':'Andalucía', 'items':[
        { 'd':'andaluciainformacion.es','n':'Andalucía Información','lang':'es','type':'digital','tags':['generalista','andalucia'] },
        { 'd':'cordopolis.eldiario.es','n':'Cordópolis',           'lang':'es','type':'digital','tags':['generalista','cordoba'] },
        { 'd':'diariocordoba.com',   'n':'Diario Córdoba',       'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'diariodealmeria.es',    'n':'Diario de Almería',    'lang':'es','type':'diario','tags':['generalista','almeria'] },
        { 'd':'diariodecadiz.es',    'n':'Diario de Cádiz',      'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'diariodejerez.es',    'n':'Diario de Jerez',      'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'diariodesevilla.es',  'n':'Diario de Sevilla',    'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'diariosur.es',        'n':'Diario Sur',           'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'elcorreoweb.es',      'n':'El Correo de Andalucía', 'lang':'es', 'type':'digital', 'tags':['generalista','andalucia'] },
        { 'd':'granadadigital.es',     'n':'Granada Digital',      'lang':'es','type':'digital','tags':['generalista','granada'] },
        { 'd':'granadahoy.com',      'n':'Granada Hoy',          'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'huelvaya.es',           'n':'Huelva Ya',            'lang':'es','type':'digital','tags':['generalista','huelva'] },  # [SIN-FEED: GN/scraping]
        { 'd':'ideal.es',            'n':'Ideal',                'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'laopiniondemalaga.es','n':'La Opinión de Málaga', 'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'malagahoy.es',        'n':'Málaga Hoy',           'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'sevillaactualidad.com', 'n':'Sevilla Actualidad',   'lang':'es','type':'digital','tags':['generalista','sevilla'] },

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-DNS: DNS: [Errno -2] Name or service not known] { 'd':'diariodeponiente.es',   'n':'Diario de Poniente',   'lang':'es','type':'digital','tags':['generalista','almeria'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · EXTREMADURA · MADRID
    # ============================================================
    { 'group':'Extremadura · Madrid', 'items':[
        { 'd':'elperiodicoextremadura.com', 'n':'El Periódico Extremadura', 'lang':'es', 'type':'diario', 'tags':['generalista','extremadura'] },
        { 'd':'hoy.es',              'n':'Hoy',                  'lang':'es', 'type':'diario',  'tags':['generalista','extremadura'] },
        { 'd':'madridiario.es',      'n':'Madridiario',          'lang':'es', 'type':'digital', 'tags':['generalista','madrid'] },
        { 'd':'telemadrid.es',       'n':'Telemadrid',           'lang':'es', 'type':'tv',      'tags':['generalista','tv','publico'] },  # [SIN-FEED: GN/scraping]
    ]},

    # ============================================================
    # AUTONÓMICOS · BALEARES · CANARIAS
    # ============================================================
    { 'group':'Baleares · Canarias', 'items':[
        { 'd':'canarias7.es',        'n':'Canarias 7',           'lang':'es', 'type':'diario',  'tags':['generalista','canarias'] },
        { 'd':'diariodeavisos.com',  'n':'Diario de Avisos',     'lang':'es', 'type':'diario',  'tags':['generalista','canarias'] },
        { 'd':'diariodeibiza.es',    'n':'Diario de Ibiza',      'lang':'es', 'type':'diario',  'tags':['generalista','baleares'] },
        { 'd':'diariodemallorca.es', 'n':'Diario de Mallorca',   'lang':'es', 'type':'diario',  'tags':['generalista','baleares'] },
        { 'd':'eldia.es',            'n':'El Día',               'lang':'es', 'type':'diario',  'tags':['generalista','canarias'] },
        { 'd':'laprovincia.es',      'n':'La Provincia',         'lang':'es', 'type':'diario',  'tags':['generalista','canarias'] },
        { 'd':'ultimahora.es',       'n':'Última Hora',          'lang':'es', 'type':'diario',  'tags':['generalista','baleares'] },
    ]},

    # ============================================================
    # INTERNACIONAL · USA / UK
    # ============================================================
    { 'group':'Internacional · USA / UK', 'items':[
        # Añadir al grupo 'Internacional · USA / UK'
        { 'd':'abcnews.com',      'n':'ABC News',             'lang':'en','type':'tv','tags':['generalista','usa'] },  # [REDIRIGE → abcnews.com]
        { 'd':'apnews.com',          'n':'Associated Press',     'lang':'en', 'type':'agencia', 'tags':['agencia','internacional'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'axios.com',           'n':'Axios',                'lang':'en','type':'digital','tags':['politica','usa'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'bbc.com',             'n':'BBC',                  'lang':'en', 'type':'tv',      'tags':['generalista','uk','publico'] },
        { 'd':'bloomberg.com',       'n':'Bloomberg',            'lang':'en', 'type':'economico', 'tags':['economia','internacional'] },
        { 'd':'businessinsider.com', 'n':'Business Insider',     'lang':'en','type':'digital','tags':['economia','usa'] },
        { 'd':'cbsnews.com',         'n':'CBS News',             'lang':'en','type':'tv','tags':['generalista','usa'] },  # [SIN-FEED: GN/scraping]
        { 'd':'cnbc.com',            'n':'CNBC',                 'lang':'en','type':'economico','tags':['economia','usa'] },  # [SIN-FEED: GN/scraping]
        { 'd':'edition.cnn.com',             'n':'CNN',                  'lang':'en', 'type':'tv',      'tags':['generalista','usa','tv'] },  # [REDIRIGE → edition.cnn.com]
        { 'd':'dailymail.co.uk',     'n':'Daily Mail',           'lang':'en','type':'diario','tags':['generalista','uk','tabloide'] },
        { 'd':'economist.com',       'n':'The Economist',        'lang':'en', 'type':'revista', 'tags':['economia','internacional'] },
        { 'd':'foreignaffairs.com',  'n':'Foreign Affairs',      'lang':'en','type':'revista','tags':['internacional','usa'] },
        { 'd':'foreignpolicy.com',   'n':'Foreign Policy',       'lang':'en','type':'revista','tags':['internacional','usa'] },
        { 'd':'foxnews.com',         'n':'Fox News',             'lang':'en','type':'tv','tags':['generalista','usa','conservador'] },
        { 'd':'ft.com',              'n':'Financial Times',      'lang':'en', 'type':'economico', 'tags':['economia','uk'] },
        { 'd':'independent.co.uk',   'n':'The Independent',      'lang':'en', 'type':'digital', 'tags':['generalista','uk'] },
        { 'd':'mirror.co.uk',        'n':'The Mirror',           'lang':'en','type':'diario','tags':['generalista','uk','tabloide'] },  # [SIN-FEED: GN/scraping]
        { 'd':'msnbc.com',           'n':'MSNBC',                'lang':'en','type':'tv','tags':['generalista','usa','progresista'] },
        { 'd':'nbcnews.com',         'n':'NBC News',             'lang':'en','type':'tv','tags':['generalista','usa'] },  # [SIN-FEED: GN/scraping]
        { 'd':'news.sky.com',        'n':'Sky News',             'lang':'en','type':'tv','tags':['generalista','uk'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'newyorker.com',       'n':'The New Yorker',       'lang':'en','type':'revista','tags':['cultural','usa'] },
        { 'd':'npr.org',             'n':'NPR',                  'lang':'en', 'type':'radio',   'tags':['generalista','usa','radio'] },
        { 'd':'nytimes.com',         'n':'The New York Times',   'lang':'en', 'type':'diario',  'tags':['generalista','usa','referencia'] },
        { 'd':'politico.com',        'n':'Politico',             'lang':'en', 'type':'digital', 'tags':['politica','usa'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'reuters.com',         'n':'Reuters',              'lang':'en', 'type':'agencia', 'tags':['agencia','internacional'] },  # [BLOQUEADO: HTTP 401]
        { 'd':'telegraph.co.uk',     'n':'The Telegraph',        'lang':'en', 'type':'diario',  'tags':['generalista','uk'] },  # [BLOQUEADO: HTTP 402]
        { 'd':'theatlantic.com',     'n':'The Atlantic',         'lang':'en','type':'revista','tags':['cultural','usa'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'theguardian.com',     'n':'The Guardian',         'lang':'en', 'type':'diario',  'tags':['generalista','uk'] },
        { 'd':'thetimes.com',        'n':'The Times',            'lang':'en', 'type':'diario',  'tags':['generalista','uk'] },  # [SIN-FEED: GN/scraping]
        { 'd':'time.com',            'n':'Time',                 'lang':'en', 'type':'revista', 'tags':['generalista','usa'] },
        { 'd':'vox.com',             'n':'Vox',                  'lang':'en','type':'digital','tags':['generalista','usa'] },
        { 'd':'washingtonpost.com',  'n':'The Washington Post',  'lang':'en', 'type':'diario',  'tags':['generalista','usa'] },  # [TIMEOUT: revisar]
        { 'd':'wsj.com',             'n':'The Wall Street Journal', 'lang':'en', 'type':'economico', 'tags':['economia','usa'] },  # [BLOQUEADO: HTTP 401]
    ]},

    # ============================================================
    # INTERNACIONAL · FRANCIA, ALEMANIA, ITALIA, PORTUGAL
    # ============================================================
    { 'group':'Internacional · Europa', 'items':[
        # Añadir al grupo 'Internacional · Europa'
        { 'd':'ansa.it',             'n':'ANSA',                 'lang':'it','type':'agencia','tags':['agencia','italia'] },
        { 'd':'corriere.it',         'n':'Corriere della Sera',  'lang':'it', 'type':'diario',  'tags':['generalista','italia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'dw.com',              'n':'Deutsche Welle',       'lang':'de','type':'tv','tags':['generalista','alemania','publico'] },  # [SIN-FEED: GN/scraping]
        { 'd':'euronews.com',        'n':'Euronews',             'lang':'en','type':'tv','tags':['generalista','europa'] },
        { 'd':'expresso.pt',         'n':'Expresso',             'lang':'pt', 'type':'revista', 'tags':['generalista','portugal'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'faz.net',             'n':'FAZ',                  'lang':'de', 'type':'diario',  'tags':['generalista','alemania'] },
        { 'd':'france24.com',        'n':'France 24',            'lang':'fr','type':'tv','tags':['generalista','francia','publico'] },
        { 'd':'ilfattoquotidiano.it','n':'Il Fatto Quotidiano',  'lang':'it','type':'digital','tags':['generalista','italia'] },
        { 'd':'ilmessaggero.it',     'n':'Il Messaggero',        'lang':'it','type':'diario','tags':['generalista','italia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'ilsole24ore.com',     'n':'Il Sole 24 Ore',       'lang':'it', 'type':'economico', 'tags':['economia','italia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'independent.ie',      'n':'Irish Independent',    'lang':'en','type':'diario','tags':['generalista','irlanda'] },
        { 'd':'ionline.sapo.pt',     'n':'Jornal i',             'lang':'pt', 'type':'diario',  'tags':['generalista','portugal'] },
        { 'd':'irishtimes.com',      'n':'The Irish Times',      'lang':'en','type':'diario','tags':['generalista','irlanda'] },  # [SIN-FEED: GN/scraping]
        { 'd':'lalibre.be',          'n':'La Libre Belgique',    'lang':'fr','type':'diario','tags':['generalista','belgica'] },
        { 'd':'lastampa.it',         'n':'La Stampa',            'lang':'it','type':'diario','tags':['generalista','italia'] },
        { 'd':'lefigaro.fr',         'n':'Le Figaro',            'lang':'fr', 'type':'diario',  'tags':['generalista','francia'] },
        { 'd':'lemonde.fr',          'n':'Le Monde',             'lang':'fr', 'type':'diario',  'tags':['generalista','francia'] },
        { 'd':'lesechos.fr',         'n':'Les Échos',            'lang':'fr', 'type':'economico', 'tags':['economia','francia'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'lesoir.be',           'n':'Le Soir',              'lang':'fr','type':'diario','tags':['generalista','belgica'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'liberation.fr',       'n':'Libération',           'lang':'fr', 'type':'diario',  'tags':['generalista','francia'] },
        { 'd':'monde-diplomatique.fr', 'n':'Le Monde Diplomatique', 'lang':'fr', 'type':'revista', 'tags':['generalista','francia'] },
        { 'd':'nrc.nl',              'n':'NRC Handelsblad',      'lang':'nl','type':'diario','tags':['generalista','paisesbajos'] },
        { 'd':'observador.pt',       'n':'Observador',           'lang':'pt', 'type':'digital', 'tags':['generalista','portugal'] },
        { 'd':'publico.pt',          'n':'Público',              'lang':'pt', 'type':'diario',  'tags':['generalista','portugal'] },  # [SIN-FEED: GN/scraping]
        { 'd':'repubblica.it',       'n':'La Repubblica',        'lang':'it', 'type':'diario',  'tags':['generalista','italia'] },
        { 'd':'rfi.fr',              'n':'RFI',                  'lang':'fr','type':'radio','tags':['generalista','francia','publico'] },  # [BLOQUEADO: HTTP 403]
        { 'd':'rte.ie',              'n':'RTÉ',                  'lang':'en','type':'tv','tags':['generalista','irlanda','publico'] },  # [SIN-FEED: GN/scraping]
        { 'd':'spiegel.de',          'n':'Der Spiegel',          'lang':'de', 'type':'revista', 'tags':['generalista','alemania'] },
        { 'd':'standaard.be',        'n':'De Standaard',         'lang':'nl','type':'diario','tags':['generalista','belgica'] },
        { 'd':'sueddeutsche.de',     'n':'Süddeutsche Zeitung',  'lang':'de', 'type':'diario',  'tags':['generalista','alemania'] },
        { 'd':'swissinfo.ch',        'n':'SWI swissinfo.ch',     'lang':'es','type':'digital','tags':['generalista','suiza','publico'] },  # [SIN-FEED: GN/scraping]
        { 'd':'tass.com',            'n':'TASS',                 'lang':'en','type':'agencia','tags':['agencia','rusia'] },  # [SIN-FEED: GN/scraping]
        { 'd':'telegraaf.nl',        'n':'De Telegraaf',         'lang':'nl','type':'diario','tags':['generalista','paisesbajos'] },
        { 'd':'trouw.nl',            'n':'Trouw',                'lang':'nl','type':'diario','tags':['generalista','paisesbajos'] },
        { 'd':'volkskrant.nl',       'n':'de Volkskrant',        'lang':'nl','type':'diario','tags':['generalista','paisesbajos'] },
        { 'd':'zeit.de',             'n':'Die Zeit',             'lang':'de', 'type':'diario',  'tags':['generalista','alemania'] },

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='dpa.com', port=443): Max retries exceeded with url: / (Caused by NewConnectionError("HTTPSConn] { 'd':'dpa.com',             'n':'DPA',                  'lang':'de','type':'agencia','tags':['agencia','alemania'] },
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='kyodonews.net', port=443): Max retries exceeded with url: / (Caused by SSLError(SSLCertVerific] { 'd':'kyodonews.net',       'n':'Kyodo News',           'lang':'en','type':'agencia','tags':['agencia','japon'] },
    ]},

    # ============================================================
    # LATINOAMÉRICA
    # ============================================================
    { 'group':'Latinoamérica', 'items':[
        # Añadir al grupo 'Latinoamérica'
        { 'd':'abc.com.py',           'n':'ABC Color',              'lang':'es','type':'diario','tags':['generalista','paraguay'] },  # [SIN-FEED: GN/scraping]
        { 'd':'biobiochile.cl',       'n':'BioBioChile',            'lang':'es','type':'digital','tags':['generalista','chile'] },  # [TIMEOUT: revisar]
        { 'd':'cartacapital.com.br',  'n':'CartaCapital',           'lang':'pt','type':'revista','tags':['generalista','brasil'] },
        { 'd':'ciperchile.cl',        'n':'CIPER Chile',            'lang':'es','type':'digital','tags':['investigacion','chile'] },
        { 'd':'clarin.com',          'n':'Clarín',               'lang':'es', 'type':'diario',  'tags':['generalista','argentina'] },
        { 'd':'cooperativa.cl',       'n':'Cooperativa',            'lang':'es','type':'radio','tags':['generalista','chile','radio'] },  # [TIMEOUT: revisar]
        { 'd':'diariolibre.com',      'n':'Diario Libre',           'lang':'es','type':'diario','tags':['generalista','republicadominicana'] },
        { 'd':'elcomercio.com',       'n':'El Comercio (EC)',       'lang':'es','type':'diario','tags':['generalista','ecuador'] },
        { 'd':'elcomercio.pe',       'n':'El Comercio',          'lang':'es', 'type':'diario',  'tags':['generalista','peru'] },
        { 'd':'eldeber.com.bo',       'n':'El Deber',               'lang':'es','type':'diario','tags':['generalista','bolivia'] },
        { 'd':'eldesconcierto.cl',    'n':'El Desconcierto',        'lang':'es','type':'digital','tags':['generalista','chile'] },  # [SIN-FEED: GN/scraping]
        { 'd':'elespectador.com',    'n':'El Espectador',        'lang':'es', 'type':'diario',  'tags':['generalista','colombia'] },
        { 'd':'elfaro.net',           'n':'El Faro',                'lang':'es','type':'digital','tags':['investigacion','salvador'] },  # [SIN-FEED: GN/scraping]
        { 'd':'elheraldo.hn',         'n':'El Heraldo',             'lang':'es','type':'diario','tags':['generalista','honduras'] },  # [SIN-FEED: GN/scraping]
        { 'd':'elmostrador.cl',       'n':'El Mostrador',           'lang':'es','type':'digital','tags':['generalista','chile'] },  # [TIMEOUT: revisar]
        { 'd':'elnacional.com',      'n':'El Nacional',          'lang':'es', 'type':'diario',  'tags':['generalista','venezuela'] },
        { 'd':'elnuevoherald.com',    'n':'El Nuevo Herald',        'lang':'es','type':'diario','tags':['generalista','usa','latino'] },  # [TIMEOUT: revisar]
        { 'd':'elobservador.com.uy',  'n':'El Observador',          'lang':'es','type':'diario','tags':['generalista','uruguay'] },  # [SIN-FEED: GN/scraping]
        { 'd':'elpais.com.uy',       'n':'El País (UY)',         'lang':'es', 'type':'diario',  'tags':['generalista','uruguay'] },
        { 'd':'eltiempo.com',        'n':'El Tiempo',            'lang':'es', 'type':'diario',  'tags':['generalista','colombia'] },
        { 'd':'eluniversal.com.mx',  'n':'El Universal',         'lang':'es', 'type':'diario',  'tags':['generalista','mexico'] },  # [SIN-FEED: GN/scraping]
        { 'd':'eluniverso.com',       'n':'El Universo',            'lang':'es','type':'diario','tags':['generalista','ecuador'] },  # [SIN-FEED: GN/scraping]
        { 'd':'estadao.com.br',       'n':'O Estado de S. Paulo',   'lang':'pt','type':'diario','tags':['generalista','brasil'] },  # [SIN-FEED: GN/scraping]
        { 'd':'folha.uol.com.br',    'n':'Folha de S.Paulo',     'lang':'pt', 'type':'diario',  'tags':['generalista','brasil'] },
        { 'd':'g1.globo.com',         'n':'G1',                     'lang':'pt','type':'digital','tags':['generalista','brasil'] },  # [SIN-FEED: GN/scraping]
        { 'd':'gestion.pe',           'n':'Gestión',                'lang':'es','type':'economico','tags':['economia','peru'] },
        { 'd':'infobae.com',         'n':'Infobae',              'lang':'es', 'type':'digital', 'tags':['generalista','argentina'] },
        { 'd':'lanacion.com.ar',     'n':'La Nación',            'lang':'es', 'type':'diario',  'tags':['generalista','argentina'] },
        { 'd':'latercera.com',       'n':'La Tercera',           'lang':'es', 'type':'diario',  'tags':['generalista','chile'] },
        { 'd':'listindiario.com',     'n':'Listín Diario',          'lang':'es','type':'diario','tags':['generalista','republicadominicana'] },
        { 'd':'milenio.com',         'n':'Milenio',              'lang':'es', 'type':'diario',  'tags':['generalista','mexico'] },  # [SIN-FEED: GN/scraping]
        { 'd':'nacion.com',           'n':'La Nación (CR)',         'lang':'es','type':'diario','tags':['generalista','costarica'] },
        { 'd':'oglobo.globo.com',    'n':'O Globo',              'lang':'pt', 'type':'diario',  'tags':['generalista','brasil'] },
        { 'd':'prensalibre.com',      'n':'Prensa Libre',           'lang':'es','type':'diario','tags':['generalista','guatemala'] },
        { 'd':'rpp.pe',               'n':'RPP',                    'lang':'es','type':'radio','tags':['generalista','peru','radio'] },
        { 'd':'telemundo.com',       'n':'Telemundo',            'lang':'es', 'type':'tv',      'tags':['generalista','usa','latino'] },  # [SIN-FEED: GN/scraping]
        { 'd':'ultimahora.com',       'n':'Última Hora (PY)',       'lang':'es','type':'diario','tags':['generalista','paraguay'] },  # [SIN-FEED: GN/scraping]
        { 'd':'veja.abril.com.br',    'n':'Veja',                   'lang':'pt','type':'revista','tags':['generalista','brasil'] },

        # ─── Descartados por auditoría (no eliminar, revisar a mano) ───
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='www.emol.com', port=443): Read timed out.] { 'd':'emol.com',            'n':'Emol',                 'lang':'es', 'type':'digital', 'tags':['generalista','chile'] },
        # [CAÍDO-DNS: DNS: [Errno -2] Name or service not known] { 'd':'laprensa.com.ni',      'n':'La Prensa (NI)',         'lang':'es','type':'diario','tags':['generalista','nicaragua'] },
        # [CAÍDO-HTTP: HTTPSConnectionPool(host='www.lostiempos.com', port=443): Read timed out. (read timeout=8)] { 'd':'lostiempos.com',       'n':'Los Tiempos',            'lang':'es','type':'diario','tags':['generalista','bolivia'] },
        # [CAÍDO-HTTP: HTTP 404] { 'd':'univision.com',       'n':'Univisión',            'lang':'es', 'type':'tv',      'tags':['generalista','usa','latino'] },
    ]},
    { 'group':'Internacional · Asia · África · Oriente Medio', 'items':[
        { 'd':'africanews.com',        'n':'Africanews',           'lang':'en','type':'tv','tags':['generalista','africa'] },
        { 'd':'aljazeera.com',         'n':'Al Jazeera',           'lang':'en','type':'tv','tags':['generalista','oriente medio'] },
        { 'd':'globaltimes.cn',        'n':'Global Times',         'lang':'en','type':'diario','tags':['generalista','china'] },  # [SIN-FEED: GN/scraping]
        { 'd':'haaretz.com',           'n':'Haaretz',              'lang':'en','type':'diario','tags':['generalista','oriente medio'] },  # [SIN-FEED: GN/scraping]
        { 'd':'japantimes.co.jp',      'n':'The Japan Times',      'lang':'en','type':'diario','tags':['generalista','asia','japon'] },
        { 'd':'jpost.com',             'n':'The Jerusalem Post',   'lang':'en','type':'diario','tags':['generalista','oriente medio'] },  # [SIN-FEED: GN/scraping]
        { 'd':'koreaherald.com',       'n':'The Korea Herald',     'lang':'en','type':'diario','tags':['generalista','asia','corea'] },  # [SIN-FEED: GN/scraping]
        { 'd':'mg.co.za',              'n':'Mail & Guardian',      'lang':'en','type':'diario','tags':['generalista','africa','sudafrica'] },
        { 'd':'middleeasteye.net',     'n':'Middle East Eye',      'lang':'en','type':'digital','tags':['generalista','oriente medio'] },
        { 'd':'premiumtimesng.com',    'n':'Premium Times',        'lang':'en','type':'digital','tags':['generalista','africa','nigeria'] },
        { 'd':'scmp.com',              'n':'South China Morning Post','lang':'en','type':'diario','tags':['generalista','asia','china'] },  # [SIN-FEED: GN/scraping]
        { 'd':'straitstimes.com',      'n':'The Straits Times',    'lang':'en','type':'diario','tags':['generalista','asia','singapur'] },  # [SIN-FEED: GN/scraping]
        { 'd':'thehindu.com',          'n':'The Hindu',            'lang':'en','type':'diario','tags':['generalista','india'] },  # [SIN-FEED: GN/scraping]
        { 'd':'timesofindia.indiatimes.com','n':'Times of India',  'lang':'en','type':'diario','tags':['generalista','india'] },  # [SIN-FEED: GN/scraping]
        { 'd':'xinhuanet.com',         'n':'Xinhua',               'lang':'en','type':'agencia','tags':['agencia','china'] },  # [SIN-FEED: GN/scraping]
    ]},
]

# ================================================================
# CABECERAS HTTP
# ================================================================
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
# FEEDS RSS OFICIALES CONOCIDOS (fallback si Google News falla)
# ================================================================
# Solo es necesario rellenar los que fallen. Los que no estén aquí
# caerán directamente al scraping.
KNOWN_FEEDS = {
    # Generado automáticamente por auditar_medios.py
    # 248 feeds verificados (ventana 7 días).
    # Sólo dominios vivos con items recientes.

    # ── Andalucía ──
    'andaluciainformacion.es': 'https://www.andaluciainformacion.es/rss/',
    'cordopolis.eldiario.es': 'https://cordopolis.eldiario.es/rss/',
    'diariocordoba.com': 'https://www.diariocordoba.com/rss/',
    'diariodealmeria.es': 'https://www.diariodealmeria.es/rss/',
    'diariodecadiz.es': 'https://www.diariodecadiz.es/rss/',
    'diariodejerez.es': 'https://www.diariodejerez.es/rss/',
    'diariodesevilla.es': 'https://www.diariodesevilla.es/rss/',
    'diariosur.es': 'https://www.diariosur.es/rss/2.0/?section=',
    'elcorreoweb.es': 'https://www.elcorreoweb.es/rss/',
    'granadadigital.es': 'https://granadadigital.es/feed/',
    'granadahoy.com': 'https://www.granadahoy.com/rss/',
    'ideal.es': 'https://www.ideal.es/rss/2.0/?section=',
    'laopiniondemalaga.es': 'https://www.laopiniondemalaga.es/rss/',
    'malagahoy.es': 'https://www.malagahoy.es/rss/',
    'sevillaactualidad.com': 'https://www.sevillaactualidad.com/feed/',

    # ── Baleares · Canarias ──
    'canarias7.es': 'https://www.canarias7.es/rss/portada.xml',
    'diariodeavisos.com': 'https://www.diariodeavisos.com/rss/',
    'diariodeibiza.es': 'https://www.diariodeibiza.es/rss/',
    'diariodemallorca.es': 'https://www.diariodemallorca.es/rss/',
    'eldia.es': 'https://www.eldia.es/rss/',
    'laprovincia.es': 'https://www.laprovincia.es/rss/',
    'ultimahora.es': 'https://www.ultimahora.es/feed.rss',

    # ── Castilla y León ──
    'diariodeleon.es': 'https://www.diariodeleon.es/rss/home.xml',
    'diariodeleon.es': 'https://www.diariodeleon.es/rss/home.xml',
    'diariodevalladolid.es': 'https://www.diariodevalladolid.es/rss/home.xml',
    'elcorreodeburgos.com': 'https://www.elcorreodeburgos.com/rss/home.xml',
    'elmirondesoria.es': 'https://elmirondesoria.es/?format=feed&type=rss',
    'elnortedecastilla.es': 'https://www.elnortedecastilla.es/rss/2.0/?section=',
    'lagacetadesalamanca.es': 'https://www.lagacetadesalamanca.es/rss/2.0/?section=',
    'laopiniondezamora.es': 'https://www.laopiniondezamora.es/rss/',
    'sorianoticias.com': 'https://sorianoticias.com/rss.xml',

    # ── Castilla-La Mancha ──
    'encastillalamancha.es': 'https://www.encastillalamancha.es/rss/',
    'lanzadigital.com': 'https://www.lanzadigital.com/rss/',

    # ── Cataluña ──
    '324.cat': 'https://api.3cat.cat/noticies?_format=rss&origen=frontal&frontal=n324-portada-noticia&version=2.0',
    'ara.cat': 'https://www.ara.cat/rss/',
    'diaridetarragona.com': 'https://www.diaridetarragona.com/rss/home.xml',
    'directa.cat': 'https://directa.cat/feed/',
    'e-noticies.cat': 'https://e-noticies.cat/rss/cat/politica',
    'elmon.cat': 'https://www.elmon.cat/rss',
    'elnacional.cat': 'https://www.elnacional.cat/uploads/feeds/feed_ca.xml',
    'elpuntavui.cat': 'https://www.elpuntavui.cat/barcelona.feed?type=rss',
    'naciodigital.cat': 'https://www.naciodigital.cat/rss',
    'reusdigital.cat': 'https://reusdigital.cat/rss',
    'segre.com': 'https://www.segre.com/ca/rss/home.xml',
    'viaempresa.cat': 'https://www.viaempresa.cat/uploads/feeds/feed_via-empresa-2024_es.xml',
    'vilaweb.cat': 'https://www.vilaweb.cat/feed/',

    # ── Comunidad Valenciana · Murcia ──
    'alicanteplaza.es': 'https://alicanteplaza.es/rss/',
    'castellonplaza.com': 'https://castellonplaza.com/rss/',
    'elperiodicomediterraneo.com': 'https://www.elperiodicomediterraneo.com/rss/',
    'informacion.es': 'https://www.informacion.es/rss/',
    'informacion.es': 'https://www.informacion.es/rss/',
    'laopiniondemurcia.es': 'https://www.laopiniondemurcia.es/rss/',
    'lasprovincias.es': 'https://www.lasprovincias.es/rss/2.0/?section=',
    'laverdad.es': 'https://www.laverdad.es/rss/2.0/?section=',
    'levante-emv.com': 'https://www.levante-emv.com/rss/',
    'valenciaextra.com': 'https://www.valenciaextra.com/uploads/feeds/feed_valencia-extra_ca.xml',
    'valenciaplaza.com': 'https://valenciaplaza.com/rss',

    # ── España · Ciencia y Salud ──
    'consalud.es': 'https://www.consalud.es/feed/',
    'diariomedico.com': 'https://diariomedico.com/feed/',
    'nationalgeographic.com.es': 'https://www.nationalgeographic.com.es/feeds/rss',
    'naukas.com': 'https://naukas.com/feed/',
    'quo.es': 'https://quo.eldiario.es/feed',

    # ── España · Culturales ──
    'politico.com': 'https://rss.politico.com/politics-news.xml',
    'politico.eu': 'https://politico.eu/rss/',
    'culturainquieta.com': 'https://www.culturainquieta.com/feed/',
    'ethic.es': 'https://www.ethic.es/rss/',
    'jotdown.es': 'https://www.jotdown.es/feed/',
    'lamarea.com': 'https://www.lamarea.com/feed/',
    'letraslibres.com': 'https://letraslibres.com/feed/',
    'yorokobu.es': 'https://www.yorokobu.es/feed/',
    'zendalibros.com': 'https://www.zendalibros.com/rss/',

    # ── España · Deportivos ──
    'as.com': 'https://feeds.as.com/mrss-s/pages/as/site/as.com/portada',
    'eldesmarque.com': 'https://www.eldesmarque.com/rss.xml',
    'estadiodeportivo.com': 'https://www.estadiodeportivo.com/sitemaps/rss.xml',
    'marca.com': 'https://e00-marca.uecdn.es/rss/portada.xml',
    'mundodeportivo.com': 'https://www.mundodeportivo.com/feed/rss/home/',
    'palco23.com': 'https://www.palco23.com/rss.xml',
    'relevo.com': 'https://www.relevo.com/rss/',
    'superdeporte.es': 'https://www.superdeporte.es/rss/',

    # ── España · Económicos ──
    'bolsamania.com': 'https://www.bolsamania.com/rss/generarRss2.php',
    'brainsre.news': 'https://brainsre.news/feed/',
    'capitalmadrid.com': 'https://www.capitalmadrid.com/rss',
    'cincodias.com': 'https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/portada',
    'dirigentesdigital.com': 'https://theofficer.es/feed/',
    'economiadigital.es': 'https://www.economiadigital.es/rss/',
    'elblogsalmon.com': 'https://elblogsalmon.com/atom.xml',
    'estrategiasdeinversion.com': 'https://estrategiasdeinversion.com/feed/',
    'expansion.com': 'https://e00-expansion.uecdn.es/rss/portada.xml',
    'finect.com': 'https://www.finect.com/v4/bff/rss/articles.rss',
    'invertia.com': 'https://www.elespanol.com/rss/invertia/',
    'libremercado.com': 'https://www.libremercado.com/rss.xml',

    # ── España · Nacionales ──
    '20minutos.es': 'https://www.20minutos.es/rss/',
    'abc.es': 'https://www.abc.es/rss/feeds/abc_ultima.xml',
    'ansa.it': 'https://ansa.it/rss.xml',
    'antena3.com': 'https://www.antena3.com/rss/347795.xml',
    'confilegal.com': 'https://confilegal.com/feed/',
    'cope.es': 'https://www.cope.es/api/es/news/rss.xml',
    'cuatro.com': 'https://www.cuatro.com/rss.xml',
    'diariocritico.com': 'https://www.diariocritico.com/rss/ultimasNoticias/',
    'elboletin.com': 'https://www.elboletin.com/feed/',
    'elconfidencial.com': 'https://rss.elconfidencial.com/espana/',
    'eldebate.com': 'https://www.eldebate.com/rss/home.xml',
    'eldiario.es': 'https://www.eldiario.es/rss/',
    'elespanol.com': 'https://www.elespanol.com/rss/',
    'elindependiente.com': 'https://www.elindependiente.com/rss/',
    'elmundo.es': 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml',
    'elpais.com': 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',
    'elplural.com': 'https://www.elplural.com/uploads/feeds/feed_elplural_es.xml',
    'europapress.es': 'https://www.europapress.es/rss/rss.aspx',
    'huffingtonpost.es': 'https://www.huffingtonpost.es/feeds/index.xml',
    'infolibre.es': 'https://www.infolibre.es/rss/',
    'larazon.es': 'https://www.larazon.es/?outputType=xml',
    'lasexta.com': 'https://www.lasexta.com/rss/348128.xml',
    'lavanguardia.com': 'https://www.lavanguardia.com/rss/home.xml',
    'libertaddigital.com': 'https://feeds.feedburner.com/libertaddigital/portada',
    'moncloa.com': 'https://www.moncloa.com/rss/',
    'niusdiario.es': 'https://www.niusdiario.es/rss/',
    'okdiario.com': 'https://okdiario.com/feed/',
    'ondacero.es': 'https://www.ondacero.es/rss/8145.xml',
    'periodistadigital.com': 'https://www.periodistadigital.com/feed/',
    'que.es': 'https://www.que.es/rss/',
    'republica.com': 'https://republica.com/feed',
    'telecinco.es': 'https://www.telecinco.es/rss.xml',
    'theobjective.com': 'https://www.theobjective.com/rss/',
    'vientosur.info': 'https://vientosur.info/feed/',

    # ── España · Tecnología ──
  
    'adslzone.net': 'https://www.adslzone.net/feed/',
    'andro4all.com': 'https://andro4all.com/feed',
    'applesfera.com': 'https://feeds.weblogssl.com/applesfera',
    'computerhoy.com': 'https://computerhoy.20minutos.es/rss/',
    'computerworld.es': 'https://www.computerworld.es/feed/',
    'elandroidelibre.elespanol.com': 'https://www.elespanol.com/rss/elandroidelibre/',
    'elchapuzasinformatico.com': 'https://elchapuzasinformatico.com/feed',
    'hardzone.es': 'https://hardzone.es/feed/',
    'muycomputer.com': 'https://muycomputer.com/feed/',
    'profesionalreview.com': 'https://www.profesionalreview.com/feed/',
    'silicon.es': 'https://silicon.es/feed/',
    'teknofilo.com': 'https://www.teknofilo.com/feed/',
    'xataka.com': 'https://feeds.weblogssl.com/xataka2',
    'xatakamovil.com': 'https://xatakamovil.com/atom.xml',
    'elcritic.cat': 'https://www.elcritic.cat/feed',
    # ── Extremadura · Madrid ──
    'elperiodicoextremadura.com': 'https://www.elperiodicoextremadura.com/rss/',
    'hoy.es': 'https://www.hoy.es/rss/2.0/?section=',
    'madridiario.es': 'https://www.madridiario.es/rss/ultimasNoticias/',

    # ── Galicia ──
    'atlantico.net': 'https://www.atlantico.net/rss/',
    'campogalego.es': 'https://campogalego.es/feed',
    'diariodearousa.com': 'https://www.diariodearousa.com/rss/',
    'diariodeferrol.com': 'https://www.diariodeferrol.com/rss/',
    'diariodepontevedra.es': 'https://www.diariodepontevedra.es/rss/',
    'diariodevigo.com': 'https://diariodevigo.com/feed/',
    'dxtcampeon.com': 'https://www.dxtcampeon.com/rss/',
    'elcorreogallego.es': 'https://www.elcorreogallego.es/rss/',
    'elidealgallego.com': 'https://www.elidealgallego.com/rss/',
    'elprogreso.es': 'https://www.elprogreso.es/rss/',
    'farodevigo.es': 'https://www.farodevigo.es/rss/',
    'ferrol360.es': 'https://www.ferrol360.es/feed/',
    'galiciaconfidencial.com': 'https://www.galiciaconfidencial.com/rss/portada.xml',
    'galiciae.com': 'https://www.galiciae.com/rss/',
    'galiciapress.es': 'https://www.galiciapress.es/rss/portada.xml',
    'galiciaunica.es': 'https://www.galiciaunica.es/feed/',
    'laopinioncoruna.es': 'https://www.laopinioncoruna.es/rss/',
    'laregion.es': 'https://www.laregion.es/rss/',
    'lavozdegalicia.es': 'https://lavozdegalicia.es/index.xml',
    'metropolitano.gal': 'https://metropolitano.gal/feed/',
    'mundiario.com': 'https://www.mundiario.com/rss/',
    'nosdiario.gal': 'https://www.nosdiario.gal/rss/',
    'pontevedraviva.com': 'https://www.pontevedraviva.com/uploads/feeds/feed_pontevedraviva_gl.xml',
    'riazor.org': 'https://www.riazor.org/feed/',
    'vigoe.es': 'https://www.vigoe.es/feed/',

    # ── Internacional · Asia · África · Oriente Medio ──
    'africanews.com': 'https://africanews.com/feed/',
    'aljazeera.com': 'https://aljazeera.com/rss',
    'japantimes.co.jp': 'https://japantimes.co.jp/feed/',
    'mg.co.za': 'https://mg.co.za/atom/',
    'middleeasteye.net': 'https://middleeasteye.net/rss',
    'premiumtimesng.com': 'https://www.premiumtimesng.com/feed',
    'washingtonpost.com': 'https://feeds.washingtonpost.com/rss/national',

    # ── Internacional · Europa ──
    'ansa.it': 'https://ansa.it/rss.xml',
    'euronews.com': 'https://euronews.com/rss',
    'faz.net': 'https://www.faz.net/rss/aktuell/',
    'france24.com': 'https://france24.com/rss',
    'ilfattoquotidiano.it': 'https://www.ilfattoquotidiano.it/feed/',
    'independent.ie': 'https://independent.ie/rss/',
    'ionline.sapo.pt': 'https://sol.iol.pt/rss.xml',
    'lalibre.be': 'https://lalibre.be/rss.xml',
    'lastampa.it': 'https://www.lastampa.it/rss/copertina.xml',
    'lefigaro.fr': 'https://www.lefigaro.fr/rss/figaro_actualites.xml',
    'lemonde.fr': 'https://www.lemonde.fr/rss/une.xml',
    'liberation.fr': 'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml',
    'monde-diplomatique.fr': 'https://www.monde-diplomatique.fr/rss/',
    'nrc.nl': 'https://www.nrc.nl/rss/',
    'observador.pt': 'https://observador.pt/feed/',
    'repubblica.it': 'https://www.repubblica.it/rss/homepage/rss2.0.xml',
    'spiegel.de': 'https://www.spiegel.de/schlagzeilen/tops/index.rss',
    'standaard.be': 'https://standaard.be/rss/',
    'sueddeutsche.de': 'https://rss.sueddeutsche.de/rss/Topthemen',
    'telegraaf.nl': 'https://telegraaf.nl/rss/',
    'trouw.nl': 'https://trouw.nl/rss.xml',
    'volkskrant.nl': 'https://volkskrant.nl/rss.xml',
    'zeit.de': 'https://newsfeed.zeit.de/index',

    # ── Internacional · USA / UK ──
    'bbc.com': 'https://feeds.bbci.co.uk/news/rss.xml',
    'bloomberg.com': 'https://feeds.bloomberg.com/markets/news.rss',
    'businessinsider.com': 'https://www.businessinsider.es/rss/',
    'dailymail.co.uk': 'https://www.dailymail.com/home/index.rss',
    'economist.com': 'https://www.economist.com/the-world-this-week/rss.xml',
    'foreignaffairs.com': 'https://www.foreignaffairs.com/rss.xml',
    'foreignpolicy.com': 'https://foreignpolicy.com/feed/',
    'foxnews.com': 'https://foxnews.com/rss.xml',
    'ft.com': 'https://www.ft.com/?format=rss',
    'independent.co.uk': 'https://www.independent.co.uk/news/rss',
    'msnbc.com': 'https://msnbc.com/feed',
    'newyorker.com': 'https://www.newyorker.com/feed/rss',
    'npr.org': 'https://feeds.npr.org/1001/rss.xml',
    'nytimes.com': 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    'theguardian.com': 'https://www.theguardian.com/world/rss',
    'time.com': 'https://www.time.com/rss/',
    'vox.com': 'https://www.vox.com/rss/index.xml',
    'thehindu.com': 'https://www.thehindu.com/feeder/default.rss',
    # ── Latinoamérica ──
    'cartacapital.com.br': 'https://www.cartacapital.com.br/feed/',
    'ciperchile.cl': 'https://www.ciperchile.cl/feed/',
    'clarin.com': 'https://www.clarin.com/rss/lo-ultimo/',
    'diariolibre.com': 'https://diariolibre.com/rss/economia.xml',
    'elcomercio.com': 'https://elcomercio.com/feed/',
    'elcomercio.pe': 'https://elcomercio.pe/arcio/rss/',
    'eldeber.com.bo': 'https://eldeber.com.bo/feed',
    'elespectador.com': 'https://www.elespectador.com/comments/feed/',
    'elnacional.com': 'https://www.elnacional.com/rss/',
    'elpais.com.uy': 'https://elpais.com.uy/rss',
    'eltiempo.com': 'https://www.eltiempo.com/rss/colombia.xml',
    'folha.uol.com.br': 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',
    'gestion.pe': 'https://gestion.pe/arcio/rss/',
    'infobae.com': 'https://www.infobae.com/arc/outboundfeeds/rss/category/espana/',
    'lanacion.com.ar': 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/',
    'latercera.com': 'https://www.latercera.com/rss/',
    'listindiario.com': 'https://listindiario.com/rss/home.xml',
    'nacion.com': 'https://nacion.com/rss/',
    'oglobo.globo.com': 'https://oglobo.globo.com/rss/oglobo',
    'prensalibre.com': 'https://www.prensalibre.com/web-stories/feed/',
    'rpp.pe': 'https://rpp.pe/feed/',
    'veja.abril.com.br': 'https://veja.abril.com.br/rss/',

    # ── Norte · Aragón · La Rioja · Cantabria · Asturias ──
    'elcomercio.es': 'https://www.elcomercio.es/rss/2.0/?section=',
    'eldiariomontanes.es': 'https://www.eldiariomontanes.es/rss/2.0/?section=',
    'elperiodicodearagon.com': 'https://www.elperiodicodearagon.com/rss/',
    'heraldo.es': 'https://www.heraldo.es/rss/',
    'larioja.com': 'https://www.larioja.com/rss/2.0/?section=',
    'lavozdeasturias.es': 'https://lavozdeasturias.es/index.xml',
    'lne.es': 'https://www.lne.es/rss/',

    # ── País Vasco · Navarra ──
    'berria.eus': 'https://www.berria.eus/uploads/feeds/feed_berria_eu.xml',
    'deia.eus': 'https://www.deia.eus/rss/',
    'diariodenavarra.es': 'https://www.diariodenavarra.es/rss.xml',
    'diariovasco.com': 'https://www.diariovasco.com/rss/2.0/?section=',
    'elcorreo.com': 'https://www.elcorreo.com/rss/2.0/?section=',
    'naiz.eus': 'https://www.naiz.eus/eu/rss/news.rss',
    'noticiasdealava.eus': 'https://www.noticiasdealava.eus/rss/',
    'noticiasdegipuzkoa.eus': 'https://www.noticiasdegipuzkoa.eus/rss/',
}

# ================================================================
# URLs DE LISTADO POR MEDIO
# ================================================================
# Para medios que caen a scraping y cuya home no es buena para
# extraer titulares, indica aquí la URL del listado de "últimas noticias".
# Si un dominio no está aquí, se usa https://dominio
#
# Ejemplo:
#   LISTING_URLS = {
#       'publico.es': 'https://www.publico.es/ultimas-noticias',
#       'eldiario.es': 'https://www.eldiario.es/ultimas-noticias/',
#   }
LISTING_URLS = {
    'publico.es': 'https://www.publico.es/ultimas-noticias',
    # Añade aquí los que necesiten una URL específica.
    # Déjalo vacío si no es necesario — todo sigue funcionando.
}

# ================================================================
# HELPERS (opcionales, útiles para análisis y depuración)
# ================================================================
def todos_los_medios():
    """Devuelve una lista plana de medios con su grupo inyectado."""
    return [{**it, 'grupo': g['group']} for g in MEDIA_CATALOG for it in g['items']]


def total_medios():
    """Cuenta cuántos medios hay en el catálogo."""
    return sum(len(g['items']) for g in MEDIA_CATALOG)
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


# Dominios que SÍ entran por Google News cuando RSS + scraping fallan.
# Verificado empíricamente: cada uno devuelve >1 item en 7d con
# ok_dominio=True desde GH Actions.
GN_FALLBACK_DOMAINS = {
    # Bloqueados desde GH (403) — van por GN
    'cuatro.com',
    'telecinco.es',
    'niusdiario.es',
    'eldesmarque.com',
    'diariocritico.com',
    'elsiglodeuropa.es',
    'capitalmadrid.com',
    'elchapuzasinformatico.com',
    'nationalgeographic.com.es',
    'muyinteresante.okdiario.com',
    'e-noticies.cat',
    'diariodepontevedra.es',
    'elprogreso.es',
    'granadadigital.es',
    'sevillaactualidad.com',
    'madridiario.es',
    'lastampa.it',
    'repubblica.it',
    'france24.com',
    'elnacional.com',
    'cuartopoder.es',
    'investigacionyciencia.es',
    'elcritic.cat',
    'revistamongolia.com',
    'crtvg.gal',
    'radiovoz.com',
    'ferrolxa.com',
    'noticiasdenavarra.com',
    'valenciaactua.es',
    'abcnews.com',
    'edition.cnn.com',   # o cambia el 'd' del medio a 'cnn.com' y ya está en la lista
    # ──  ──
    '2playbook.com',
    'abc.com.py',
    'acn.cat',
    'agenciasinc.es',
    'apnews.com',
    'axios.com',
    'biobiochile.cl',
    'cadenaser.com',
    'cambio16.com',
    'cbsnews.com',
    'cnbc.com',
    'cnn.com',
    'cooperativa.cl',
    'corriere.it',
    'ctxt.es',
    'diaridegirona.cat',
    'dw.com',
    'efe.com',
    'eitb.eus',
    'eldesconcierto.cl',
    'eldiadevalladolid.com',
    'eleconomista.es',
    'elfaro.net',
    'elheraldo.hn',
    'elmostrador.cl',
    'elnuevoherald.com',
    'elobservador.com.uy',
    'elperiodico.com',
    'elsaltodiario.com',
    'eluniversal.com.mx',
    'eluniverso.com',
    'elviejotopo.com',
    'estadao.com.br',
    'expresso.pt',
    'g1.globo.com',
    'galiciadigital.com',
    'globaltimes.cn',
    'haaretz.com',
    'hipertextual.com',
    'huelvaya.es',
    'idealista.com',
    'ilmessaggero.it',
    'ilsole24ore.com',
    'irishtimes.com',
    'ituser.es',
    'jpost.com',
    'koreaherald.com',
    'latribunadealbacete.es',
    'lesechos.fr',
    'lesoir.be',
    'mercadofinanciero.com',
    'mientrastanto.org',
    'milenio.com',
    'mirror.co.uk',
    'murciaeconomia.com',
    'nbcnews.com',
    'news.sky.com',
    'nuevarevista.net',
    'politico.com',
    'publico.es',
    'publico.pt',
    'rac1.cat',
    'regio7.cat',
    'reuters.com',
    'rfi.fr',
    'rte.ie',
    'rtve.es',
    'scmp.com',
    'servimedia.es',
    'sport.es',
    'straitstimes.com',
    'swissinfo.ch',
    'tass.com',
    'telegraph.co.uk',
    'telemadrid.es',
    'telemundo.com',
    'theatlantic.com',
    'thehindu.com',
    'thetimes.com',
    'timesofindia.indiatimes.com',
    'ultimahora.com',
    'vozpopuli.com',
    'washingtonpost.com',
    'wsj.com',
    'xinhuanet.com',
}

# Ajustes de query específicos por dominio (opcional)
GN_QUERY_OVERRIDES = {
    # 'reuters.com': 'site:reuters.com -video',
    # 'eitb.eus': 'site:eitb.eus inurl:noticias',
}


if __name__ == '__main__':
    print(f"Total de grupos: {len(MEDIA_CATALOG)}")
    print(f"Total de medios: {total_medios()}")
    print(f"Feeds RSS conocidos: {len(KNOWN_FEEDS)}")
