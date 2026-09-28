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
        { 'd':'elpais.com',          'n':'El País',              'lang':'es', 'type':'diario',  'tags':['generalista','nacional'] },
        { 'd':'elmundo.es',          'n':'El Mundo',             'lang':'es', 'type':'diario',  'tags':['generalista','nacional'] },
        { 'd':'abc.es',              'n':'ABC',                  'lang':'es', 'type':'diario',  'tags':['generalista','nacional','conservador'] },
        { 'd':'lavanguardia.com',    'n':'La Vanguardia',        'lang':'es', 'type':'diario',  'tags':['generalista','nacional','catalan'] },
        { 'd':'elperiodico.com',     'n':'El Periódico',         'lang':'es', 'type':'diario',  'tags':['generalista','nacional','catalan'] },
        { 'd':'larazon.es',          'n':'La Razón',             'lang':'es', 'type':'diario',  'tags':['generalista','nacional','conservador'] },
        { 'd':'20minutos.es',        'n':'20 Minutos',           'lang':'es', 'type':'diario',  'tags':['generalista','gratuito'] },
        { 'd':'que.es',              'n':'Qué!',                 'lang':'es', 'type':'diario',  'tags':['generalista','gratuito'] },

        # Nativos digitales
        { 'd':'elconfidencial.com',  'n':'El Confidencial',      'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'eldiario.es',         'n':'elDiario.es',          'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'elespanol.com',       'n':'El Español',           'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'publico.es',          'n':'Público',              'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'vozpopuli.com',       'n':'Vozpópuli',            'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'okdiario.com',        'n':'OK Diario',            'lang':'es', 'type':'digital', 'tags':['generalista','digital','conservador'] },
        { 'd':'huffingtonpost.es',   'n':'El HuffPost',          'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'elplural.com',        'n':'El Plural',            'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'infolibre.es',        'n':'InfoLibre',            'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'eldebate.com',        'n':'El Debate',            'lang':'es', 'type':'digital', 'tags':['generalista','digital','conservador'] },
        { 'd':'theobjective.com',    'n':'The Objective',        'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'libertaddigital.com', 'n':'Libertad Digital',     'lang':'es', 'type':'digital', 'tags':['generalista','digital','liberal'] },
        { 'd':'elindependiente.com', 'n':'El Independiente',     'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'moncloa.com',         'n':'Moncloa',              'lang':'es', 'type':'digital', 'tags':['generalista','digital'] },

        # TV y Radio
        { 'd':'rtve.es',             'n':'RTVE',                 'lang':'es', 'type':'tv',      'tags':['generalista','publico','tv','radio'] },
        { 'd':'antena3.com',         'n':'Antena 3',             'lang':'es', 'type':'tv',      'tags':['generalista','privado','tv'] },
        { 'd':'telecinco.es',        'n':'Telecinco',            'lang':'es', 'type':'tv',      'tags':['generalista','privado','tv'] },
        { 'd':'lasexta.com',         'n':'La Sexta',             'lang':'es', 'type':'tv',      'tags':['generalista','privado','tv'] },
        { 'd':'cuatro.com',          'n':'Cuatro',               'lang':'es', 'type':'tv',      'tags':['generalista','privado','tv'] },
        { 'd':'cadenaser.com',       'n':'Cadena SER',           'lang':'es', 'type':'radio',   'tags':['generalista','radio'] },
        { 'd':'cope.es',             'n':'COPE',                 'lang':'es', 'type':'radio',   'tags':['generalista','radio','conservador'] },
        { 'd':'ondacero.es',         'n':'Onda Cero',            'lang':'es', 'type':'radio',   'tags':['generalista','radio'] },

        # Agencias
        { 'd':'europapress.es',      'n':'Europa Press',         'lang':'es', 'type':'agencia', 'tags':['agencia','nacional'] },
        { 'd':'efe.com',             'n':'Agencia EFE',          'lang':'es', 'type':'agencia', 'tags':['agencia','nacional'] },
        { 'd':'servimedia.es',       'n':'Servimedia',           'lang':'es', 'type':'agencia', 'tags':['agencia','social'] },
        { 'd':'colpisa.com',         'n':'Agencia Colpisa',      'lang':'es', 'type':'agencia', 'tags':['agencia','nacional'] },
    ]},

    # ============================================================
    # ESPAÑA · DEPORTIVOS
    # ============================================================
    { 'group':'España · Deportivos', 'items':[
        { 'd':'marca.com',           'n':'Marca',                'lang':'es', 'type':'deportivo', 'tags':['deportes','futbol'] },
        { 'd':'as.com',              'n':'Diario AS',            'lang':'es', 'type':'deportivo', 'tags':['deportes','futbol'] },
        { 'd':'mundodeportivo.com',  'n':'Mundo Deportivo',      'lang':'es', 'type':'deportivo', 'tags':['deportes','futbol','catalan'] },
        { 'd':'sport.es',            'n':'Sport',                'lang':'es', 'type':'deportivo', 'tags':['deportes','futbol','catalan'] },
        { 'd':'superdeporte.es',     'n':'Superdeporte',         'lang':'es', 'type':'deportivo', 'tags':['deportes','valencia'] },
        { 'd':'estadiodeportivo.com','n':'Estadio Deportivo',    'lang':'es', 'type':'deportivo', 'tags':['deportes','andalucia'] },
        { 'd':'eldesmarque.com',     'n':'El Desmarque',         'lang':'es', 'type':'deportivo', 'tags':['deportes','digital'] },
        { 'd':'relevo.com',          'n':'Relevo',               'lang':'es', 'type':'deportivo', 'tags':['deportes','digital'] },
        { 'd':'palco23.com',         'n':'Palco23',              'lang':'es', 'type':'deportivo', 'tags':['deportes','negocio'] },
        { 'd':'2playbook.com',       'n':'2Playbook',            'lang':'es', 'type':'deportivo', 'tags':['deportes','negocio'] },
    ]},

    # ============================================================
    # ESPAÑA · ECONÓMICOS
    # ============================================================
    { 'group':'España · Económicos', 'items':[
        { 'd':'expansion.com',       'n':'Expansión',            'lang':'es', 'type':'economico', 'tags':['economia','negocios'] },
        { 'd':'cincodias.com',       'n':'Cinco Días',           'lang':'es', 'type':'economico', 'tags':['economia','negocios'] },
        { 'd':'eleconomista.es',     'n':'El Economista',        'lang':'es', 'type':'economico', 'tags':['economia','negocios'] },
        { 'd':'economiadigital.es',  'n':'Economía Digital',     'lang':'es', 'type':'economico', 'tags':['economia','digital'] },
        { 'd':'lainformacion.com',   'n':'La Información',       'lang':'es', 'type':'digital',   'tags':['economico','digital'] },
        { 'd':'libremercado.com',    'n':'Libre Mercado',        'lang':'es', 'type':'economico', 'tags':['economia','liberal'] },
        { 'd':'invertia.com',        'n':'Invertia',             'lang':'es', 'type':'economico', 'tags':['economia','mercados'] },
        { 'd':'bolsamania.com',      'n':'Bolsamania',           'lang':'es', 'type':'economico', 'tags':['economia','mercados'] },
    ]},

    # ============================================================
    # ESPAÑA · TECNOLOGÍA
    # ============================================================
    { 'group':'España · Tecnología', 'items':[
        { 'd':'xataka.com',          'n':'Xataka',               'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','gadgets'] },
        { 'd':'genbeta.com',         'n':'Genbeta',              'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','software'] },
        { 'd':'applesfera.com',      'n':'Applesfera',           'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','apple'] },
        { 'd':'computerhoy.com',     'n':'Computer Hoy',         'lang':'es', 'type':'tecnologia', 'tags':['tecnologia'] },
        { 'd':'hipertextual.com',    'n':'Hipertextual',         'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','cultura'] },
        { 'd':'adslzone.net',        'n':'ADSLZone',             'lang':'es', 'type':'tecnologia', 'tags':['tecnologia','internet'] },
    ]},

    # ============================================================
    # ESPAÑA · CULTURALES / REVISTAS
    # ============================================================
    { 'group':'España · Culturales', 'items':[
        { 'd':'jotdown.es',          'n':'Jot Down',             'lang':'es', 'type':'revista', 'tags':['cultural','entrevistas'] },
        { 'd':'elcultural.com',      'n':'El Cultural',          'lang':'es', 'type':'revista', 'tags':['cultural'] },
        { 'd':'zendalibros.com',     'n':'Zenda Libros',         'lang':'es', 'type':'revista', 'tags':['cultural','libros'] },
        { 'd':'letraslibres.com',    'n':'Letras Libres',        'lang':'es', 'type':'revista', 'tags':['cultural','literatura'] },
        { 'd':'ethic.es',            'n':'Ethic',                'lang':'es', 'type':'revista', 'tags':['cultural','sociedad'] },
        { 'd':'yorokobu.es',         'n':'Yorokobu',             'lang':'es', 'type':'revista', 'tags':['cultural','creatividad'] },
        { 'd':'elsaltodiario.com',   'n':'El Salto',             'lang':'es', 'type':'digital', 'tags':['generalista','digital','progresista'] },
        { 'd':'lamarea.com',         'n':'La Marea',             'lang':'es', 'type':'revista', 'tags':['cultural','progresista'] },
        { 'd':'ctxt.es',             'n':'CTXT',                 'lang':'es', 'type':'revista', 'tags':['cultural','investigacion'] },
        { 'd':'alternativaseconomicas.coop', 'n':'Alternativas Económicas', 'lang':'es', 'type':'revista', 'tags':['economia','social'] },
        { 'd':'revistamongolia.com', 'n':'Mongolia',             'lang':'es', 'type':'revista', 'tags':['cultural','humor'] },
        { 'd':'critic.cat',          'n':'Crític',               'lang':'ca', 'type':'revista', 'tags':['cultural','investigacion'] },
        { 'd':'culturainquieta.com', 'n':'Cultura Inquieta',     'lang':'es', 'type':'revista', 'tags':['cultural'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · CATALUÑA
    # ============================================================
    { 'group':'Cataluña', 'items':[
        { 'd':'elpuntavui.cat',      'n':'El Punt Avui',         'lang':'ca', 'type':'diario',  'tags':['generalista','catalan'] },
        { 'd':'ara.cat',             'n':'Ara',                  'lang':'ca', 'type':'diario',  'tags':['generalista','catalan'] },
        { 'd':'naciodigital.cat',    'n':'Nació Digital',        'lang':'ca', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'vilaweb.cat',         'n':'VilaWeb',              'lang':'ca', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'elnacional.cat',      'n':'El Nacional',          'lang':'ca', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'elmon.cat',           'n':'El Món',               'lang':'ca', 'type':'digital', 'tags':['generalista','digital'] },
        { 'd':'324.cat',             'n':'324',                  'lang':'ca', 'type':'tv',      'tags':['generalista','tv','publico'] },
        { 'd':'ccma.cat',            'n':'CCMA',                 'lang':'ca', 'type':'tv',      'tags':['generalista','tv','publico'] },
        { 'd':'rac1.cat',            'n':'RAC1',                 'lang':'ca', 'type':'radio',   'tags':['generalista','radio'] },
        { 'd':'viaempresa.cat',      'n':'Via Empresa',          'lang':'ca', 'type':'economico', 'tags':['economia'] },
        { 'd':'acn.cat',             'n':'Agència Catalana de Notícies', 'lang':'ca', 'type':'agencia', 'tags':['agencia','catalan'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · GALICIA (VERIFICADOS Y AMPLIADOS)
    # ============================================================
    { 'group':'Galicia', 'items':[
        { 'd':'lavozdegalicia.es',   'n':'La Voz de Galicia',    'lang':'es', 'type':'diario',  'tags':['generalista','galicia'] },
        { 'd':'farodevigo.es',       'n':'Faro de Vigo',         'lang':'es', 'type':'diario',  'tags':['generalista','galicia'] },
        { 'd':'elcorreogallego.es',  'n':'El Correo Gallego',    'lang':'es', 'type':'diario',  'tags':['generalista','galicia'] },
        { 'd':'laregion.es',         'n':'La Región',            'lang':'es', 'type':'diario',  'tags':['generalista','galicia','ourense'] },
        { 'd':'elprogreso.es',       'n':'El Progreso',          'lang':'es', 'type':'diario',  'tags':['generalista','galicia','lugo'] },
        { 'd':'laopinioncoruna.es',  'n':'La Opinión A Coruña',  'lang':'es', 'type':'diario',  'tags':['generalista','galicia','coruña'] },
        { 'd':'elidealgallego.com',  'n':'El Ideal Gallego',     'lang':'es', 'type':'diario',  'tags':['generalista','galicia','coruña'] },
        { 'd':'diariodepontevedra.es', 'n':'Diario de Pontevedra', 'lang':'es', 'type':'diario', 'tags':['generalista','galicia','pontevedra'] },
        { 'd':'atlantico.net',       'n':'Atlántico',            'lang':'es', 'type':'diario',  'tags':['generalista','galicia','vigo'] },
        { 'd':'diariodeferrol.com',  'n':'Diario de Ferrol',     'lang':'es', 'type':'diario',  'tags':['generalista','galicia','ferrol'] },
        { 'd':'diariodearousa.com',  'n':'Diario de Arousa',     'lang':'es', 'type':'diario',  'tags':['generalista','galicia','arousa'] },
        { 'd':'galiciaconfidencial.com', 'n':'Galicia Confidencial', 'lang':'gl', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'nosdiario.gal',       'n':'Nós Diario',           'lang':'gl', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'praza.gal',           'n':'Praza Pública',        'lang':'gl', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'galiciapress.es',     'n':'Galicia Press',        'lang':'es', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'mundiario.com',       'n':'Mundiario',            'lang':'es', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'galiciadigital.com',  'n':'Galicia Digital',      'lang':'es', 'type':'digital', 'tags':['generalista','galicia'] },
        { 'd':'pontevedraviva.com',  'n':'Pontevedra Viva',      'lang':'es', 'type':'digital', 'tags':['generalista','local','pontevedra'] },
        { 'd':'vigoe.es',            'n':'Vigoé',                'lang':'es', 'type':'digital', 'tags':['generalista','local','vigo'] },
        { 'd':'metropolitano.gal',   'n':'Metropolitano',        'lang':'es', 'type':'digital', 'tags':['generalista','local','vigo'] },
        { 'd':'ferrol360.es',        'n':'Ferrol 360',           'lang':'es', 'type':'digital', 'tags':['generalista','local','ferrol'] },
        { 'd':'dxtcampeon.com',      'n':'DxT Campeón',          'lang':'es', 'type':'deportivo', 'tags':['deportes','galicia','coruña'] },
        { 'd':'riazor.org',          'n':'Riazor.org',           'lang':'es', 'type':'deportivo', 'tags':['deportes','galicia','coruña'] },
        { 'd':'crtvg.gal',           'n':'CRTVG (TVG y Radio Galega)', 'lang':'gl', 'type':'tv', 'tags':['generalista','publico','galicia','radio'] },
        { 'd':'radiovoz.com',        'n':'Radio Voz',            'lang':'es', 'type':'radio',   'tags':['generalista','privado','galicia'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · PAÍS VASCO / NAVARRA
    # ============================================================
    { 'group':'País Vasco · Navarra', 'items':[
        { 'd':'elcorreo.com',        'n':'El Correo',            'lang':'es', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'diariovasco.com',     'n':'Diario Vasco',         'lang':'es', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'deia.eus',            'n':'Deia',                 'lang':'es', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'noticiasdegipuzkoa.eus', 'n':'Noticias de Gipuzkoa', 'lang':'es', 'type':'diario', 'tags':['generalista','euskadi'] },
        { 'd':'noticiasdealava.eus', 'n':'Noticias de Álava',    'lang':'es', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'naiz.eus',            'n':'Naiz',                 'lang':'es', 'type':'digital', 'tags':['generalista','euskadi'] },
        { 'd':'berria.eus',          'n':'Berria',               'lang':'eu', 'type':'diario',  'tags':['generalista','euskadi'] },
        { 'd':'eitb.eus',            'n':'EITB',                 'lang':'eu', 'type':'tv',      'tags':['generalista','tv','publico'] },
        { 'd':'diariodenavarra.es',  'n':'Diario de Navarra',    'lang':'es', 'type':'diario',  'tags':['generalista','navarra'] },
        { 'd':'noticiasdenavarra.es','n':'Noticias de Navarra',  'lang':'es', 'type':'diario',  'tags':['generalista','navarra'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · ARAGÓN · LA RIOJA · CANTABRIA · ASTURIAS
    # ============================================================
    { 'group':'Norte · Aragón · La Rioja · Cantabria · Asturias', 'items':[
        { 'd':'heraldo.es',          'n':'Heraldo de Aragón',    'lang':'es', 'type':'diario',  'tags':['generalista','aragon'] },
        { 'd':'elperiodicodearagon.com', 'n':'El Periódico de Aragón', 'lang':'es', 'type':'diario', 'tags':['generalista','aragon'] },
        { 'd':'larioja.com',         'n':'La Rioja',             'lang':'es', 'type':'diario',  'tags':['generalista','rioja'] },
        { 'd':'eldiariomontanes.es', 'n':'El Diario Montañés',   'lang':'es', 'type':'diario',  'tags':['generalista','cantabria'] },
        { 'd':'lne.es',              'n':'La Nueva España',      'lang':'es', 'type':'diario',  'tags':['generalista','asturias'] },
        { 'd':'elcomercio.es',       'n':'El Comercio',          'lang':'es', 'type':'diario',  'tags':['generalista','asturias'] },
        { 'd':'lavozdeasturias.es',  'n':'La Voz de Asturias',   'lang':'es', 'type':'digital', 'tags':['generalista','asturias'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · CASTILLA Y LEÓN
    # ============================================================
    { 'group':'Castilla y León', 'items':[
        { 'd':'elnortedecastilla.es','n':'El Norte de Castilla', 'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        { 'd':'diariodeleon.es',     'n':'Diario de León',       'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        { 'd':'diariodeburgos.es',   'n':'Diario de Burgos',     'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        { 'd':'laopiniondezamora.es','n':'La Opinión de Zamora', 'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        { 'd':'lagacetadesalamanca.es', 'n':'La Gaceta de Salamanca', 'lang':'es', 'type':'diario', 'tags':['generalista','castillaleon'] },
        { 'd':'diariodeavila.es',    'n':'Diario de Ávila',      'lang':'es', 'type':'diario',  'tags':['generalista','castillaleon'] },
        { 'd':'eldiadevalladolid.com', 'n':'El Día de Valladolid', 'lang':'es', 'type':'diario', 'tags':['generalista','castillaleon'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · CASTILLA-LA MANCHA
    # ============================================================
    { 'group':'Castilla-La Mancha', 'items':[
        { 'd':'lanzadigital.com',    'n':'Lanza Digital',        'lang':'es', 'type':'digital', 'tags':['generalista','clm'] },
        { 'd':'latribunadealbacete.es', 'n':'La Tribuna de Albacete', 'lang':'es', 'type':'diario', 'tags':['generalista','clm'] },
        { 'd':'latribunadeciudadreal.es', 'n':'La Tribuna de Ciudad Real', 'lang':'es', 'type':'diario', 'tags':['generalista','clm'] },
        { 'd':'encastillalamancha.es', 'n':'En Castilla-La Mancha', 'lang':'es', 'type':'digital', 'tags':['generalista','clm'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · COMUNIDAD VALENCIANA · MURCIA
    # ============================================================
    { 'group':'Comunidad Valenciana · Murcia', 'items':[
        { 'd':'lasprovincias.es',    'n':'Las Provincias',       'lang':'es', 'type':'diario',  'tags':['generalista','valencia'] },
        { 'd':'levante-emv.com',     'n':'Levante-EMV',          'lang':'es', 'type':'diario',  'tags':['generalista','valencia'] },
        { 'd':'informacion.es',      'n':'Información',          'lang':'es', 'type':'diario',  'tags':['generalista','alicante'] },
        { 'd':'elperiodicomediterraneo.com', 'n':'El Periódico Mediterráneo', 'lang':'es', 'type':'diario', 'tags':['generalista','castellon'] },
        { 'd':'valenciaplaza.com',   'n':'Valencia Plaza',       'lang':'es', 'type':'digital', 'tags':['economia','valencia'] },
        { 'd':'laverdad.es',         'n':'La Verdad',            'lang':'es', 'type':'diario',  'tags':['generalista','murcia'] },
        { 'd':'laopiniondemurcia.es','n':'La Opinión de Murcia', 'lang':'es', 'type':'diario',  'tags':['generalista','murcia'] },
        { 'd':'murciaeconomia.com',  'n':'Murcia Economía',      'lang':'es', 'type':'economico', 'tags':['economia','murcia'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · ANDALUCÍA
    # ============================================================
    { 'group':'Andalucía', 'items':[
        { 'd':'diariosur.es',        'n':'Diario Sur',           'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'diariodesevilla.es',  'n':'Diario de Sevilla',    'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'ideal.es',            'n':'Ideal',                'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'laopiniondemalaga.es','n':'La Opinión de Málaga', 'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'malagahoy.es',        'n':'Málaga Hoy',           'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'diariocordoba.com',   'n':'Diario Córdoba',       'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'granadahoy.com',      'n':'Granada Hoy',          'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'diariodecadiz.es',    'n':'Diario de Cádiz',      'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'diariodejerez.es',    'n':'Diario de Jerez',      'lang':'es', 'type':'diario',  'tags':['generalista','andalucia'] },
        { 'd':'elcorreoweb.es',      'n':'El Correo de Andalucía', 'lang':'es', 'type':'digital', 'tags':['generalista','andalucia'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · EXTREMADURA · MADRID
    # ============================================================
    { 'group':'Extremadura · Madrid', 'items':[
        { 'd':'hoy.es',              'n':'Hoy',                  'lang':'es', 'type':'diario',  'tags':['generalista','extremadura'] },
        { 'd':'elperiodicoextremadura.com', 'n':'El Periódico Extremadura', 'lang':'es', 'type':'diario', 'tags':['generalista','extremadura'] },
        { 'd':'madridiario.es',      'n':'Madridiario',          'lang':'es', 'type':'digital', 'tags':['generalista','madrid'] },
        { 'd':'telemadrid.es',       'n':'Telemadrid',           'lang':'es', 'type':'tv',      'tags':['generalista','tv','publico'] },
    ]},

    # ============================================================
    # AUTONÓMICOS · BALEARES · CANARIAS
    # ============================================================
    { 'group':'Baleares · Canarias', 'items':[
        { 'd':'diariodemallorca.es', 'n':'Diario de Mallorca',   'lang':'es', 'type':'diario',  'tags':['generalista','baleares'] },
        { 'd':'ultimahora.es',       'n':'Última Hora',          'lang':'es', 'type':'diario',  'tags':['generalista','baleares'] },
        { 'd':'diariodeibiza.es',    'n':'Diario de Ibiza',      'lang':'es', 'type':'diario',  'tags':['generalista','baleares'] },
        { 'd':'canarias7.es',        'n':'Canarias 7',           'lang':'es', 'type':'diario',  'tags':['generalista','canarias'] },
        { 'd':'laprovincia.es',      'n':'La Provincia',         'lang':'es', 'type':'diario',  'tags':['generalista','canarias'] },
        { 'd':'eldia.es',            'n':'El Día',               'lang':'es', 'type':'diario',  'tags':['generalista','canarias'] },
        { 'd':'diariodeavisos.com',  'n':'Diario de Avisos',     'lang':'es', 'type':'diario',  'tags':['generalista','canarias'] },
    ]},

    # ============================================================
    # INTERNACIONAL · USA / UK
    # ============================================================
    { 'group':'Internacional · USA / UK', 'items':[
        { 'd':'nytimes.com',         'n':'The New York Times',   'lang':'en', 'type':'diario',  'tags':['generalista','usa','referencia'] },
        { 'd':'washingtonpost.com',  'n':'The Washington Post',  'lang':'en', 'type':'diario',  'tags':['generalista','usa'] },
        { 'd':'wsj.com',             'n':'The Wall Street Journal', 'lang':'en', 'type':'economico', 'tags':['economia','usa'] },
        { 'd':'theguardian.com',     'n':'The Guardian',         'lang':'en', 'type':'diario',  'tags':['generalista','uk'] },
        { 'd':'thetimes.com',        'n':'The Times',            'lang':'en', 'type':'diario',  'tags':['generalista','uk'] },
        { 'd':'telegraph.co.uk',     'n':'The Telegraph',        'lang':'en', 'type':'diario',  'tags':['generalista','uk'] },
        { 'd':'independent.co.uk',   'n':'The Independent',      'lang':'en', 'type':'digital', 'tags':['generalista','uk'] },
        { 'd':'bbc.com',             'n':'BBC',                  'lang':'en', 'type':'tv',      'tags':['generalista','uk','publico'] },
        { 'd':'cnn.com',             'n':'CNN',                  'lang':'en', 'type':'tv',      'tags':['generalista','usa','tv'] },
        { 'd':'reuters.com',         'n':'Reuters',              'lang':'en', 'type':'agencia', 'tags':['agencia','internacional'] },
        { 'd':'apnews.com',          'n':'Associated Press',     'lang':'en', 'type':'agencia', 'tags':['agencia','internacional'] },
        { 'd':'bloomberg.com',       'n':'Bloomberg',            'lang':'en', 'type':'economico', 'tags':['economia','internacional'] },
        { 'd':'ft.com',              'n':'Financial Times',      'lang':'en', 'type':'economico', 'tags':['economia','uk'] },
        { 'd':'economist.com',       'n':'The Economist',        'lang':'en', 'type':'revista', 'tags':['economia','internacional'] },
        { 'd':'time.com',            'n':'Time',                 'lang':'en', 'type':'revista', 'tags':['generalista','usa'] },
        { 'd':'politico.com',        'n':'Politico',             'lang':'en', 'type':'digital', 'tags':['politica','usa'] },
        { 'd':'npr.org',             'n':'NPR',                  'lang':'en', 'type':'radio',   'tags':['generalista','usa','radio'] },
    ]},

    # ============================================================
    # INTERNACIONAL · FRANCIA, ALEMANIA, ITALIA, PORTUGAL
    # ============================================================
    { 'group':'Internacional · Europa', 'items':[
        { 'd':'lemonde.fr',          'n':'Le Monde',             'lang':'fr', 'type':'diario',  'tags':['generalista','francia'] },
        { 'd':'lefigaro.fr',         'n':'Le Figaro',            'lang':'fr', 'type':'diario',  'tags':['generalista','francia'] },
        { 'd':'liberation.fr',       'n':'Libération',           'lang':'fr', 'type':'diario',  'tags':['generalista','francia'] },
        { 'd':'lesechos.fr',         'n':'Les Échos',            'lang':'fr', 'type':'economico', 'tags':['economia','francia'] },
        { 'd':'monde-diplomatique.fr', 'n':'Le Monde Diplomatique', 'lang':'fr', 'type':'revista', 'tags':['generalista','francia'] },
        { 'd':'zeit.de',             'n':'Die Zeit',             'lang':'de', 'type':'diario',  'tags':['generalista','alemania'] },
        { 'd':'spiegel.de',          'n':'Der Spiegel',          'lang':'de', 'type':'revista', 'tags':['generalista','alemania'] },
        { 'd':'faz.net',             'n':'FAZ',                  'lang':'de', 'type':'diario',  'tags':['generalista','alemania'] },
        { 'd':'sueddeutsche.de',     'n':'Süddeutsche Zeitung',  'lang':'de', 'type':'diario',  'tags':['generalista','alemania'] },
        { 'd':'corriere.it',         'n':'Corriere della Sera',  'lang':'it', 'type':'diario',  'tags':['generalista','italia'] },
        { 'd':'repubblica.it',       'n':'La Repubblica',        'lang':'it', 'type':'diario',  'tags':['generalista','italia'] },
        { 'd':'ilsole24ore.com',     'n':'Il Sole 24 Ore',       'lang':'it', 'type':'economico', 'tags':['economia','italia'] },
        { 'd':'publico.pt',          'n':'Público',              'lang':'pt', 'type':'diario',  'tags':['generalista','portugal'] },
        { 'd':'expresso.pt',         'n':'Expresso',             'lang':'pt', 'type':'revista', 'tags':['generalista','portugal'] },
        { 'd':'observador.pt',       'n':'Observador',           'lang':'pt', 'type':'digital', 'tags':['generalista','portugal'] },
        { 'd':'ionline.sapo.pt',     'n':'Jornal i',             'lang':'pt', 'type':'diario',  'tags':['generalista','portugal'] },
    ]},

    # ============================================================
    # LATINOAMÉRICA
    # ============================================================
    { 'group':'Latinoamérica', 'items':[
        { 'd':'eluniversal.com.mx',  'n':'El Universal',         'lang':'es', 'type':'diario',  'tags':['generalista','mexico'] },
        { 'd':'milenio.com',         'n':'Milenio',              'lang':'es', 'type':'diario',  'tags':['generalista','mexico'] },
        { 'd':'clarin.com',          'n':'Clarín',               'lang':'es', 'type':'diario',  'tags':['generalista','argentina'] },
        { 'd':'lanacion.com.ar',     'n':'La Nación',            'lang':'es', 'type':'diario',  'tags':['generalista','argentina'] },
        { 'd':'infobae.com',         'n':'Infobae',              'lang':'es', 'type':'digital', 'tags':['generalista','argentina'] },
        { 'd':'eltiempo.com',        'n':'El Tiempo',            'lang':'es', 'type':'diario',  'tags':['generalista','colombia'] },
        { 'd':'elespectador.com',    'n':'El Espectador',        'lang':'es', 'type':'diario',  'tags':['generalista','colombia'] },
        { 'd':'elcomercio.pe',       'n':'El Comercio',          'lang':'es', 'type':'diario',  'tags':['generalista','peru'] },
        { 'd':'latercera.com',       'n':'La Tercera',           'lang':'es', 'type':'diario',  'tags':['generalista','chile'] },
        { 'd':'emol.com',            'n':'Emol',                 'lang':'es', 'type':'digital', 'tags':['generalista','chile'] },
        { 'd':'elpais.com.uy',       'n':'El País (UY)',         'lang':'es', 'type':'diario',  'tags':['generalista','uruguay'] },
        { 'd':'elnacional.com',      'n':'El Nacional',          'lang':'es', 'type':'diario',  'tags':['generalista','venezuela'] },
        { 'd':'univision.com',       'n':'Univisión',            'lang':'es', 'type':'tv',      'tags':['generalista','usa','latino'] },
        { 'd':'telemundo.com',       'n':'Telemundo',            'lang':'es', 'type':'tv',      'tags':['generalista','usa','latino'] },
        { 'd':'folha.uol.com.br',    'n':'Folha de S.Paulo',     'lang':'pt', 'type':'diario',  'tags':['generalista','brasil'] },
        { 'd':'oglobo.globo.com',    'n':'O Globo',              'lang':'pt', 'type':'diario',  'tags':['generalista','brasil'] },
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
    # ── España · Nacionales ──
  
    'elpais.com':           'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',
    'elmundo.es':           'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml',
    'abc.es':               'https://www.abc.es/rss/feeds/abc_ultima.xml',
    'lavanguardia.com':     'https://www.lavanguardia.com/rss/home.xml',
    'elperiodico.com':      'https://www.elperiodico.com/es/rss/rss_portada.xml',
    'larazon.es':           'https://www.larazon.es/rss/portada.xml',
    '20minutos.es':         'https://www.20minutos.es/rss/',
    'elconfidencial.com':   'https://rss.elconfidencial.com/espana/',
    'eldiario.es':          'https://www.eldiario.es/rss/',
    'publico.es':           'https://www.publico.es/feed/',
    'elespanol.com':        'https://www.elespanol.com/rss/',
    'okdiario.com':         'https://okdiario.com/feed/',
    'libertaddigital.com':  'https://feeds.feedburner.com/libertaddigital/portada',
    'huffingtonpost.es':    'https://www.huffingtonpost.es/feeds/index.xml',
    'elplural.com':         'https://www.elplural.com/rss/',
    'infolibre.es':         'https://www.infolibre.es/rss/',
    'rtve.es':              'https://www.rtve.es/api/noticias.rss',
    'cadenaser.com':        'https://cadenaser.com/rss/',
    'cope.es':              'https://www.cope.es/rss/portada.xml',
    'ondacero.es':          'https://www.ondacero.es/rss/portada.xml',
    'europapress.es':       'https://www.europapress.es/rss/rss.aspx',

    # ── España · Deportivos ──
    'marca.com':            'https://e00-marca.uecdn.es/rss/portada.xml',
    'as.com':               'https://feeds.as.com/mrss-s/pages/as/site/as.com/portada',
    'mundodeportivo.com':   'https://www.mundodeportivo.com/rss/portada.xml',
    'sport.es':             'https://www.sport.es/es/rss/portada.xml',

    # ── España · Económicos ──
    'expansion.com':        'https://e00-expansion.uecdn.es/rss/portada.xml',
    'eleconomista.es':      'https://www.eleconomista.es/rss/rss-portada.php',

    # ── España · Tecnología ──
    'xataka.com':           'https://feeds.weblogssl.com/xataka2',
    'genbeta.com':          'https://feeds.weblogssl.com/genbeta',
    'applesfera.com':       'https://feeds.weblogssl.com/applesfera',
    'adslzone.net':         'https://www.adslzone.net/feed/',

    # ── España · Culturales ──
    'jotdown.es':           'https://www.jotdown.es/feed/',
    'yorokobu.es':          'https://www.yorokobu.es/feed/',
    'lamarea.com':          'https://www.lamarea.com/feed/',
    'elsaltodiario.com':    'https://www.elsaltodiario.com/rss',
    'ctxt.es':              'https://ctxt.es/es/rss/portada.xml',
    'hipertextual.com':     'https://hipertextual.com/feed',

    # ── Cataluña ──
    'ara.cat':              'https://www.ara.cat/rss/',
    'vilaweb.cat':          'https://www.vilaweb.cat/feed/',
    'naciodigital.cat':     'https://www.naciodigital.cat/rss',
    'rac1.cat':             'https://www.rac1.cat/rss',
    'elpuntavui.cat':       'https://www.elpuntavui.cat/rss',
    'elmon.cat':            'https://www.elmon.cat/rss',
    'acn.cat':              'https://www.acn.cat/rss',

    # ── Galicia ──
    'farodevigo.es':        'https://www.farodevigo.es/rss/',
    'laregion.es':          'https://www.laregion.es/rss/',
    'laopinioncoruna.es':   'https://www.laopinioncoruna.es/rss/',
    'atlantico.net':        'https://www.atlantico.net/rss/',
    'vigoe.es':             'https://www.vigoe.es/feed/',
    'ferrol360.es':         'https://www.ferrol360.es/feed/',
    'dxtcampeon.com':       'https://www.dxtcampeon.com/rss/',
    'riazor.org':           'https://www.riazor.org/feed/',

    # ── País Vasco · Navarra ──
    'deia.eus':             'https://www.deia.eus/rss/',
    'berria.eus':           'https://www.berria.eus/rss/azala.xml',

    # ── Norte ──
    'heraldo.es':           'https://www.heraldo.es/rss/',
    'lne.es':               'https://www.lne.es/rss/',

    # ── Comunidad Valenciana · Murcia ──
    'laopiniondemurcia.es': 'https://www.laopiniondemurcia.es/rss/',
    'valenciaplaza.com':    'https://valenciaplaza.com/rss',

    # ── Andalucía ──
    'laopiniondemalaga.es': 'https://www.laopiniondemalaga.es/rss/',
    'diariocordoba.com':    'https://www.diariocordoba.com/rss/',
    'granadahoy.com':       'https://www.granadahoy.com/rss/',
    'diariodecadiz.es':     'https://www.diariodecadiz.es/rss/',

    # ── Baleares · Canarias ──
    'laprovincia.es':       'https://www.laprovincia.es/rss/',
    'eldia.es':             'https://www.eldia.es/rss/',

    # ── Internacional · USA / UK ──
    'nytimes.com':          'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    'washingtonpost.com':   'https://feeds.washingtonpost.com/rss/world',
    'wsj.com':              'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
    'theguardian.com':      'https://www.theguardian.com/world/rss',
    'telegraph.co.uk':      'https://www.telegraph.co.uk/rss.xml',
    'independent.co.uk':    'https://www.independent.co.uk/news/rss',
    'bbc.com':              'https://feeds.bbci.co.uk/news/rss.xml',
    'cnn.com':              'http://rss.cnn.com/rss/edition.rss',
    'bloomberg.com':        'https://feeds.bloomberg.com/markets/news.rss',
    'ft.com':               'https://www.ft.com/?format=rss',
    'economist.com':        'https://www.economist.com/the-world-this-week/rss.xml',
    'npr.org':              'https://feeds.npr.org/1001/rss.xml',

    # ── Internacional · Europa ──
    'lemonde.fr':           'https://www.lemonde.fr/rss/une.xml',
    'lefigaro.fr':          'https://www.lefigaro.fr/rss/figaro_actualites.xml',
    'liberation.fr':        'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml',
    'zeit.de':              'https://newsfeed.zeit.de/index',
    'spiegel.de':           'https://www.spiegel.de/schlagzeilen/tops/index.rss',
    'faz.net':              'https://www.faz.net/rss/aktuell/',
    'sueddeutsche.de':      'https://rss.sueddeutsche.de/rss/Topthemen',
    'corriere.it':          'https://www.corriere.it/rss/homepage.xml',
    'repubblica.it':        'https://www.repubblica.it/rss/homepage/rss2.0.xml',
    'observador.pt':        'https://observador.pt/feed/',

    # ── Latinoamérica ──
    'clarin.com':           'https://www.clarin.com/rss/lo-ultimo/',
    'lanacion.com.ar':      'https://www.lanacion.com.ar/arc/outboundfeeds/rss/',
    'eltiempo.com':         'https://www.eltiempo.com/rss/colombia.xml',
    'elcomercio.pe':        'https://elcomercio.pe/arcio/rss/',
    'folha.uol.com.br':     'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',
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


if __name__ == '__main__':
    print(f"Total de grupos: {len(MEDIA_CATALOG)}")
    print(f"Total de medios: {total_medios()}")
    print(f"Feeds RSS conocidos: {len(KNOWN_FEEDS)}")
