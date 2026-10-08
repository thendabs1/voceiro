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
# ================================================================
# CATÁLOGO DE MEDIOS
# ================================================================
MEDIA_CATALOG = [
    # ═══════════════════════════════════════════════════════════════
    # DEPORTES
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Deportes', 'items':[
        { 'd':'2playbook.com','n':'2Playbook','type':'digital','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','negocio'] },
        { 'd':'as.com','n':'Diario AS','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','futbol'] },
        { 'd':'eldesmarque.com','n':'El Desmarque','type':'digital','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','digital'] },
        { 'd':'estadiodeportivo.com','n':'Estadio Deportivo','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','andalucia'] },
        { 'd':'marca.com','n':'Marca','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','futbol'] },
        { 'd':'mundodeportivo.com','n':'Mundo Deportivo','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','futbol','catalan'] },
        { 'd':'palco23.com','n':'Palco23','type':'digital','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','negocio'] },
        { 'd':'relevo.com','n':'Relevo','type':'digital','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','digital'] },
        { 'd':'sport.es','n':'Sport','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','futbol','catalan'] },
        { 'd':'superdeporte.es','n':'Superdeporte','type':'diario','sector':'deportes','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','valencia'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # ECONOMÍA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Economía', 'items':[
        { 'd':'bolsamania.com','n':'Bolsamania','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','mercados'] },
        { 'd':'brainsre.news','n':'Brains RE','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','inmobiliario'] },
        { 'd':'capitalmadrid.com','n':'Capital Madrid','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','finanzas'] },
        { 'd':'cincodias.com','n':'Cinco Días','type':'diario','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','negocios'] },
        { 'd':'dirigentesdigital.com','n':'Dirigentes Digital','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','negocios'] },
        { 'd':'economiadigital.es','n':'Economía Digital','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','digital'] },
        { 'd':'elblogsalmon.com','n':'El Blog Salmón','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','blog'] },
        { 'd':'eleconomista.es','n':'El Economista','type':'diario','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','negocios'] },
        { 'd':'estrategiasdeinversion.com','n':'Estrategias de Inversión','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','inversion'] },
        { 'd':'expansion.com','n':'Expansión','type':'diario','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','negocios'] },
        { 'd':'finect.com','n':'Finect','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','finanzas'] },
        { 'd':'idealista.com','n':'Idealista News','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','vivienda'] },
        { 'd':'invertia.com','n':'Invertia','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','mercados'] },
        { 'd':'libremercado.com','n':'Libre Mercado','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','liberal'] },
        { 'd':'mercadofinanciero.com','n':'Mercado Financiero','type':'digital','sector':'economia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','mercados'] },
        { 'd':'murciaeconomia.com','n':'Murcia Economía','type':'digital','sector':'economia','ambito':'regional','region':'murcia','pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','murcia'] },
        { 'd':'valenciaplaza.com','n':'Valencia Plaza','type':'digital','sector':'economia','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','valencia'] },
        { 'd':'viaempresa.cat','n':'Via Empresa','type':'digital','sector':'economia','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['economia'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # TECNOLOGÍA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Tecnología', 'items':[
        { 'd':'adslzone.net','n':'ADSLZone','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','internet'] },
        { 'd':'andro4all.com','n':'Andro4all','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','android'] },
        { 'd':'applesfera.com','n':'Applesfera','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','apple'] },
        { 'd':'computerhoy.com','n':'Computer Hoy','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia'] },
        { 'd':'computerworld.es','n':'Computerworld España','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','empresa'] },
        { 'd':'elandroidelibre.elespanol.com','n':'El Androide Libre','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','android'] },
        { 'd':'elchapuzasinformatico.com','n':'El Chapuzas Informático','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','hardware'] },
        { 'd':'genbeta.com','n':'Genbeta','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','software'] },
        { 'd':'hardzone.es','n':'HardZone','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','hardware'] },
        { 'd':'hipertextual.com','n':'Hipertextual','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','cultura'] },
        { 'd':'ituser.es','n':'IT User','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','empresa'] },
        { 'd':'muycomputer.com','n':'MuyComputer','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','hardware'] },
        { 'd':'profesionalreview.com','n':'Profesional Review','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','hardware'] },
        { 'd':'silicon.es','n':'Silicon','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','empresa'] },
        { 'd':'teknofilo.com','n':'Teknófilo','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','movil'] },
        { 'd':'xataka.com','n':'Xataka','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','gadgets'] },
        { 'd':'xatakaciencia.com','n':'Xataka Ciencia','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','tecnologia'] },
        { 'd':'xatakamovil.com','n':'Xataka Móvil','type':'digital','sector':'tecnologia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['tecnologia','movil'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # CIENCIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Ciencia', 'items':[
        { 'd':'agenciasinc.es','n':'SINC','type':'digital','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','publico'] },
        { 'd':'consalud.es','n':'ConSalud','type':'digital','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['salud'] },
        { 'd':'diariomedico.com','n':'Diario Médico','type':'digital','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['salud','profesional'] },
        { 'd':'muyinteresante.okdiario.com','n':'Muy Interesante','type':'revista','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','divulgacion'] },
        { 'd':'nationalgeographic.com.es','n':'National Geographic España','type':'revista','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','naturaleza'] },
        { 'd':'naukas.com','n':'Naukas','type':'digital','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','blog'] },
        { 'd':'quo.es','n':'Quo','type':'revista','sector':'ciencia','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['ciencia','divulgacion'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # CULTURA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Cultura', 'items':[
        { 'd':'alternativaseconomicas.coop','n':'Alternativas Económicas','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['economia','social'] },
        { 'd':'elcritic.cat','n':'Crític','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['ca'],'lang_principal':'ca','tags':['cultural','investigacion'] },
        { 'd':'ctxt.es','n':'CTXT','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','investigacion'] },
        { 'd':'culturainquieta.com','n':'Cultura Inquieta','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural'] },
        { 'd':'elsaltodiario.com','n':'El Salto','type':'digital','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'] },
        { 'd':'ethic.es','n':'Ethic','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','sociedad'] },
        { 'd':'jotdown.es','n':'Jot Down','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','entrevistas'] },
        { 'd':'lamarea.com','n':'La Marea','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','progresista'] },
        { 'd':'letraslibres.com','n':'Letras Libres','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','literatura'] },
        { 'd':'revistamongolia.com','n':'Mongolia','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','humor'] },
        { 'd':'yorokobu.es','n':'Yorokobu','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','creatividad'] },
        { 'd':'zendalibros.com','n':'Zenda Libros','type':'revista','sector':'cultura','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','libros'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # NACIONAL
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Nacional', 'items':[
        { 'd':'20minutos.es','n':'20 Minutos','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','gratuito'] },
        { 'd':'abc.es','n':'ABC','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional','conservador'] },
        { 'd':'antena3.com','n':'Antena 3','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','tv'] },
        { 'd':'cadenaser.com','n':'Cadena SER','type':'radio','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','radio'] },
        { 'd':'cambio16.com','n':'Cambio16','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'confilegal.com','n':'Confilegal','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['justicia','digital'] },
        { 'd':'cope.es','n':'COPE','type':'radio','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','radio','conservador'] },
        { 'd':'cuartopoder.es','n':'Cuarto Poder','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','progresista'] },
        { 'd':'cuatro.com','n':'Cuatro','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','tv'] },
        { 'd':'diariocritico.com','n':'Diario Crítico','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'efe.com','n':'Agencia EFE','type':'agencia','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['agencia','nacional'] },
        { 'd':'elboletin.com','n':'El Boletín','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'elconfidencial.com','n':'El Confidencial','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'eldebate.com','n':'El Debate','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','conservador'] },
        { 'd':'eldiario.es','n':'elDiario.es','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'] },
        { 'd':'elespanol.com','n':'El Español','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'elindependiente.com','n':'El Independiente','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'elmundo.es','n':'El Mundo','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional'] },
        { 'd':'elpais.com','n':'El País','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional'] },
        { 'd':'elperiodico.com','n':'El Periódico','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional','catalan'] },
        { 'd':'elplural.com','n':'El Plural','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'] },
        { 'd':'elsiglodeuropa.es','n':'El Siglo de Europa','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'elviejotopo.com','n':'El Viejo Topo','type':'revista','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','izquierda'] },
        { 'd':'europapress.es','n':'Europa Press','type':'agencia','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['agencia','nacional'] },
        { 'd':'huffingtonpost.es','n':'El HuffPost','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'] },
        { 'd':'infolibre.es','n':'InfoLibre','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'] },
        { 'd':'larazon.es','n':'La Razón','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional','conservador'] },
        { 'd':'lasexta.com','n':'La Sexta','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','tv'] },
        { 'd':'lavanguardia.com','n':'La Vanguardia','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','nacional','catalan'] },
        { 'd':'libertaddigital.com','n':'Libertad Digital','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','liberal'] },
        { 'd':'mientrastanto.org','n':'Mientras Tanto','type':'revista','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['politica','izquierda'] },
        { 'd':'moncloa.com','n':'Moncloa','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'niusdiario.es','n':'Nius','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'nuevarevista.net','n':'Nueva Revista','type':'revista','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['cultural','ideas'] },
        { 'd':'okdiario.com','n':'OK Diario','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','conservador'] },
        { 'd':'ondacero.es','n':'Onda Cero','type':'radio','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','radio'] },
        { 'd':'periodistadigital.com','n':'Periodista Digital','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'publico.es','n':'Público','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital','progresista'] },
        { 'd':'que.es','n':'Qué!','type':'diario','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','gratuito'] },
        { 'd':'republica.com','n':'Republica.com','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'rtve.es','n':'RTVE','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','publico','tv','radio'] },
        { 'd':'servimedia.es','n':'Servimedia','type':'agencia','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['agencia','social'] },
        { 'd':'telecinco.es','n':'Telecinco','type':'tv','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','tv'] },
        { 'd':'theobjective.com','n':'The Objective','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
        { 'd':'vientosur.info','n':'Viento Sur','type':'revista','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['politica','izquierda'] },
        { 'd':'vozpopuli.com','n':'Vozpópuli','type':'digital','sector':'generalista','ambito':'nacional','region':None,'pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','digital'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · ANDALUCÍA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Andalucía', 'items':[
        { 'd':'andaluciainformacion.es','n':'Andalucía Información','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'cordopolis.eldiario.es','n':'Cordópolis','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','cordoba'] },
        { 'd':'diariocordoba.com','n':'Diario Córdoba','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'diariodealmeria.es','n':'Diario de Almería','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','almeria'] },
        { 'd':'diariodecadiz.es','n':'Diario de Cádiz','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'diariodejerez.es','n':'Diario de Jerez','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'diariodesevilla.es','n':'Diario de Sevilla','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'diariosur.es','n':'Diario Sur','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'elcorreoweb.es','n':'El Correo de Andalucía','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'granadadigital.es','n':'Granada Digital','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','granada'] },
        { 'd':'granadahoy.com','n':'Granada Hoy','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'huelvaya.es','n':'Huelva Ya','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','huelva'] },
        { 'd':'ideal.es','n':'Ideal','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'laopiniondemalaga.es','n':'La Opinión de Málaga','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'malagahoy.es','n':'Málaga Hoy','type':'diario','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','andalucia'] },
        { 'd':'sevillaactualidad.com','n':'Sevilla Actualidad','type':'digital','sector':'generalista','ambito':'regional','region':'andalucia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','sevilla'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · ARAGÓN
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Aragón', 'items':[
        { 'd':'elperiodicodearagon.com','n':'El Periódico de Aragón','type':'diario','sector':'generalista','ambito':'regional','region':'aragon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','aragon'] },
        { 'd':'heraldo.es','n':'Heraldo de Aragón','type':'diario','sector':'generalista','ambito':'regional','region':'aragon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','aragon'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · ASTURIAS
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Asturias', 'items':[
        { 'd':'elcomercio.es','n':'El Comercio','type':'diario','sector':'generalista','ambito':'regional','region':'asturias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','asturias'] },
        { 'd':'lavozdeasturias.es','n':'La Voz de Asturias','type':'digital','sector':'generalista','ambito':'regional','region':'asturias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','asturias'] },
        { 'd':'lne.es','n':'La Nueva España','type':'diario','sector':'generalista','ambito':'regional','region':'asturias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','asturias'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · BALEARES
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Baleares', 'items':[
        { 'd':'diariodeibiza.es','n':'Diario de Ibiza','type':'diario','sector':'generalista','ambito':'regional','region':'baleares','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','baleares'] },
        { 'd':'diariodemallorca.es','n':'Diario de Mallorca','type':'diario','sector':'generalista','ambito':'regional','region':'baleares','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','baleares'] },
        { 'd':'ultimahora.es','n':'Última Hora','type':'diario','sector':'generalista','ambito':'regional','region':'baleares','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','baleares'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CANARIAS
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Canarias', 'items':[
        { 'd':'canarias7.es','n':'Canarias 7','type':'diario','sector':'generalista','ambito':'regional','region':'canarias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','canarias'] },
        { 'd':'diariodeavisos.com','n':'Diario de Avisos','type':'diario','sector':'generalista','ambito':'regional','region':'canarias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','canarias'] },
        { 'd':'eldia.es','n':'El Día','type':'diario','sector':'generalista','ambito':'regional','region':'canarias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','canarias'] },
        { 'd':'laprovincia.es','n':'La Provincia','type':'diario','sector':'generalista','ambito':'regional','region':'canarias','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','canarias'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CANTABRIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Cantabria', 'items':[
        { 'd':'eldiariomontanes.es','n':'El Diario Montañés','type':'diario','sector':'generalista','ambito':'regional','region':'cantabria','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','cantabria'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CASTILLA-LA MANCHA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Castilla-La Mancha', 'items':[
        { 'd':'encastillalamancha.es','n':'En Castilla-La Mancha','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-la-mancha','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','clm'] },
        { 'd':'lanzadigital.com','n':'Lanza Digital','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-la-mancha','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','clm'] },
        { 'd':'latribunadealbacete.es','n':'La Tribuna de Albacete','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-la-mancha','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','clm'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CASTILLA Y LEÓN
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Castilla y León', 'items':[
        { 'd':'diariodeleon.es','n':'Diario de León','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','leon'] },
        { 'd':'diariodevalladolid.es','n':'Diario de Valladolid','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valladolid'] },
        { 'd':'elcorreodeburgos.com','n':'El Correo de Burgos','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','burgos'] },
        { 'd':'eldiadevalladolid.com','n':'El Día de Valladolid','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castillaleon'] },
        { 'd':'elmirondesoria.es','n':'El Mirón de Soria','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','soria'] },
        { 'd':'elnortedecastilla.es','n':'El Norte de Castilla','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castillaleon'] },
        { 'd':'lagacetadesalamanca.es','n':'La Gaceta de Salamanca','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castillaleon'] },
        { 'd':'laopiniondezamora.es','n':'La Opinión de Zamora','type':'diario','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castillaleon'] },
        { 'd':'sorianoticias.com','n':'Soria Noticias','type':'digital','sector':'generalista','ambito':'regional','region':'castilla-y-leon','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','soria'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · CATALUÑA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Cataluña', 'items':[
        { 'd':'324.cat','n':'324','type':'tv','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','tv','publico'] },
        { 'd':'acn.cat','n':'Agència Catalana de Notícies','type':'agencia','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['agencia','catalan'] },
        { 'd':'ara.cat','n':'Ara','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'] },
        { 'd':'diaridegirona.cat','n':'Diari de Girona','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'] },
        { 'd':'diaridetarragona.com','n':'Diari de Tarragona','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'] },
        { 'd':'directa.cat','n':'La Directa','type':'revista','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['investigacion','izquierda'] },
        { 'd':'e-noticies.cat','n':'e-Notícies','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'] },
        { 'd':'elmon.cat','n':'El Món','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','digital'] },
        { 'd':'elnacional.cat','n':'El Nacional','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','digital'] },
        { 'd':'elpuntavui.cat','n':'El Punt Avui','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'] },
        { 'd':'naciodigital.cat','n':'Nació Digital','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','digital'] },
        { 'd':'rac1.cat','n':'RAC1','type':'radio','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','radio'] },
        { 'd':'regio7.cat','n':'Regió7','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'] },
        { 'd':'reusdigital.cat','n':'Reus Digital','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','local'] },
        { 'd':'segre.com','n':'Segre','type':'diario','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca'],'lang_principal':'ca','tags':['generalista','catalan'] },
        { 'd':'vilaweb.cat','n':'VilaWeb','type':'digital','sector':'generalista','ambito':'regional','region':'cataluna','pais':None,'langs':['ca','es'],'lang_principal':'ca','tags':['generalista','digital'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · COMUNIDAD VALENCIANA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Comunidad Valenciana', 'items':[
        { 'd':'alicanteplaza.es','n':'Alicante Plaza','type':'digital','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','alicante'] },
        { 'd':'castellonplaza.com','n':'Castellón Plaza','type':'digital','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castellon'] },
        { 'd':'elperiodicomediterraneo.com','n':'El Periódico Mediterráneo','type':'diario','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','castellon'] },
        { 'd':'informacion.es','n':'Información','type':'diario','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','alicante'] },
        { 'd':'lasprovincias.es','n':'Las Provincias','type':'diario','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valencia'] },
        { 'd':'levante-emv.com','n':'Levante-EMV','type':'diario','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valencia'] },
        { 'd':'valenciaactua.es','n':'Valencia Actúa','type':'digital','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valencia'] },
        { 'd':'valenciaextra.com','n':'Valencia Extra','type':'digital','sector':'generalista','ambito':'regional','region':'comunidad-valenciana','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','valencia'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · EXTREMADURA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Extremadura', 'items':[
        { 'd':'elperiodicoextremadura.com','n':'El Periódico Extremadura','type':'diario','sector':'generalista','ambito':'regional','region':'extremadura','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','extremadura'] },
        { 'd':'hoy.es','n':'Hoy','type':'diario','sector':'generalista','ambito':'regional','region':'extremadura','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','extremadura'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · GALICIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Galicia', 'items':[
        { 'd':'atlantico.net','n':'Atlántico','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','vigo'] },
        { 'd':'campogalego.es','n':'Campo Galego','type':'revista','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['agro','galicia'] },
        { 'd':'crtvg.gal','n':'CRTVG (TVG y Radio Galega)','type':'tv','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','publico','galicia','radio'] },
        { 'd':'diariodearousa.com','n':'Diario de Arousa','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','arousa'] },
        { 'd':'diariodeferrol.com','n':'Diario de Ferrol','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','ferrol'] },
        { 'd':'diariodepontevedra.es','n':'Diario de Pontevedra','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','pontevedra'] },
        { 'd':'diariodevigo.com','n':'Diario de Vigo','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','vigo'] },
        { 'd':'dxtcampeon.com','n':'DxT Campeón','type':'digital','sector':'deportes','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','galicia','coruña'] },
        { 'd':'elcorreogallego.es','n':'El Correo Gallego','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'] },
        { 'd':'elidealgallego.com','n':'El Ideal Gallego','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','coruña'] },
        { 'd':'elprogreso.es','n':'El Progreso','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','lugo'] },
        { 'd':'farodevigo.es','n':'Faro de Vigo','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'] },
        { 'd':'ferrol360.es','n':'Ferrol 360','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','local','ferrol'] },
        { 'd':'ferrolxa.com','n':'FerrolXA','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','ferrol'] },
        { 'd':'galiciaconfidencial.com','n':'Galicia Confidencial','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','galicia'] },
        { 'd':'galiciadigital.com','n':'Galicia Digital','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'] },
        { 'd':'galiciae.com','n':'Galiciae','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','galicia'] },
        { 'd':'galiciapress.es','n':'Galicia Press','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'] },
        { 'd':'galiciaunica.es','n':'Galicia Única','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'] },
        { 'd':'laopinioncoruna.es','n':'La Opinión A Coruña','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','coruña'] },
        { 'd':'laregion.es','n':'La Región','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia','ourense'] },
        { 'd':'lavozdegalicia.es','n':'La Voz de Galicia','type':'diario','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'] },
        { 'd':'metropolitano.gal','n':'Metropolitano','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','local','vigo'] },
        { 'd':'mundiario.com','n':'Mundiario','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','galicia'] },
        { 'd':'nosdiario.gal','n':'Nós Diario','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','galicia'] },
        { 'd':'pontevedraviva.com','n':'Pontevedra Viva','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','local','pontevedra'] },
        { 'd':'praza.gal','n':'Praza Pública','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['gl'],'lang_principal':'gl','tags':['generalista','galicia'] },
        { 'd':'radiovoz.com','n':'Radio Voz','type':'radio','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','privado','galicia'] },
        { 'd':'riazor.org','n':'Riazor.org','type':'digital','sector':'deportes','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['deportes','galicia','coruña'] },
        { 'd':'vigoe.es','n':'Vigoé','type':'digital','sector':'generalista','ambito':'regional','region':'galicia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','local','vigo'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · LA RIOJA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · La Rioja', 'items':[
        { 'd':'larioja.com','n':'La Rioja','type':'diario','sector':'generalista','ambito':'regional','region':'la-rioja','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','rioja'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · MADRID
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Madrid', 'items':[
        { 'd':'madridiario.es','n':'Madridiario','type':'digital','sector':'generalista','ambito':'regional','region':'madrid','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','madrid'] },
        { 'd':'telemadrid.es','n':'Telemadrid','type':'tv','sector':'generalista','ambito':'regional','region':'madrid','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','tv','publico'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · MURCIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Murcia', 'items':[
        { 'd':'laopiniondemurcia.es','n':'La Opinión de Murcia','type':'diario','sector':'generalista','ambito':'regional','region':'murcia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','murcia'] },
        { 'd':'laverdad.es','n':'La Verdad','type':'diario','sector':'generalista','ambito':'regional','region':'murcia','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','murcia'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · NAVARRA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · Navarra', 'items':[
        { 'd':'diariodenavarra.es','n':'Diario de Navarra','type':'diario','sector':'generalista','ambito':'regional','region':'navarra','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','navarra'] },
        { 'd':'noticiasdenavarra.com','n':'Noticias de Navarra','type':'diario','sector':'generalista','ambito':'regional','region':'navarra','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','navarra'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # REGIONAL · PAÍS VASCO
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Regional · País Vasco', 'items':[
        { 'd':'berria.eus','n':'Berria','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['eu'],'lang_principal':'eu','tags':['generalista','euskadi'] },
        { 'd':'deia.eus','n':'Deia','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'] },
        { 'd':'diariovasco.com','n':'Diario Vasco','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'] },
        { 'd':'eitb.eus','n':'EITB','type':'tv','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['eu'],'lang_principal':'eu','tags':['generalista','tv','publico'] },
        { 'd':'elcorreo.com','n':'El Correo','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'] },
        { 'd':'naiz.eus','n':'Naiz','type':'digital','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'] },
        { 'd':'noticiasdealava.eus','n':'Noticias de Álava','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'] },
        { 'd':'noticiasdegipuzkoa.eus','n':'Noticias de Gipuzkoa','type':'diario','sector':'generalista','ambito':'regional','region':'pais-vasco','pais':None,'langs':['es'],'lang_principal':'es','tags':['generalista','euskadi'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ALEMANIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Alemania', 'items':[
        { 'd':'dw.com','n':'Deutsche Welle','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania','publico'] },
        { 'd':'faz.net','n':'FAZ','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania'] },
        { 'd':'spiegel.de','n':'Der Spiegel','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania'] },
        { 'd':'sueddeutsche.de','n':'Süddeutsche Zeitung','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania'] },
        { 'd':'zeit.de','n':'Die Zeit','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'alemania','langs':['de'],'lang_principal':'de','tags':['generalista','alemania'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ARGENTINA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Argentina', 'items':[
        { 'd':'clarin.com','n':'Clarín','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'argentina','langs':['es'],'lang_principal':'es','tags':['generalista','argentina'] },
        { 'd':'infobae.com','n':'Infobae','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'argentina','langs':['es'],'lang_principal':'es','tags':['generalista','argentina'] },
        { 'd':'lanacion.com.ar','n':'La Nación','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'argentina','langs':['es'],'lang_principal':'es','tags':['generalista','argentina'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · BOLIVIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Bolivia', 'items':[
        { 'd':'eldeber.com.bo','n':'El Deber','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'bolivia','langs':['es'],'lang_principal':'es','tags':['generalista','bolivia'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · BRASIL
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Brasil', 'items':[
        { 'd':'cartacapital.com.br','n':'CartaCapital','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'] },
        { 'd':'estadao.com.br','n':'O Estado de S. Paulo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'] },
        { 'd':'folha.uol.com.br','n':'Folha de S.Paulo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'] },
        { 'd':'g1.globo.com','n':'G1','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'] },
        { 'd':'oglobo.globo.com','n':'O Globo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'] },
        { 'd':'veja.abril.com.br','n':'Veja','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'brasil','langs':['pt'],'lang_principal':'pt','tags':['generalista','brasil'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · BÉLGICA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Bélgica', 'items':[
        { 'd':'lalibre.be','n':'La Libre Belgique','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'belgica','langs':['fr'],'lang_principal':'fr','tags':['generalista','belgica'] },
        { 'd':'lesoir.be','n':'Le Soir','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'belgica','langs':['fr'],'lang_principal':'fr','tags':['generalista','belgica'] },
        { 'd':'politico.eu','n':'PoliticoEU','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'belgica','langs':['es'],'lang_principal':'es','tags':['politica','EU'] },
        { 'd':'standaard.be','n':'De Standaard','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'belgica','langs':['nl'],'lang_principal':'nl','tags':['generalista','belgica'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · CATAR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Catar', 'items':[
        { 'd':'aljazeera.com','n':'Al Jazeera','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'qatar','langs':['en'],'lang_principal':'en','tags':['generalista','oriente medio'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · CHILE
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Chile', 'items':[
        { 'd':'biobiochile.cl','n':'BioBioChile','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile'] },
        { 'd':'ciperchile.cl','n':'CIPER Chile','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['investigacion','chile'] },
        { 'd':'cooperativa.cl','n':'Cooperativa','type':'radio','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile','radio'] },
        { 'd':'eldesconcierto.cl','n':'El Desconcierto','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile'] },
        { 'd':'elmostrador.cl','n':'El Mostrador','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile'] },
        { 'd':'latercera.com','n':'La Tercera','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'chile','langs':['es'],'lang_principal':'es','tags':['generalista','chile'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · CHINA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · China', 'items':[
        { 'd':'globaltimes.cn','n':'Global Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'china','langs':['en'],'lang_principal':'en','tags':['generalista','china'] },
        { 'd':'scmp.com','n':'South China Morning Post','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'china','langs':['en'],'lang_principal':'en','tags':['generalista','asia','china'] },
        { 'd':'xinhuanet.com','n':'Xinhua','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'china','langs':['en'],'lang_principal':'en','tags':['agencia','china'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · COLOMBIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Colombia', 'items':[
        { 'd':'elespectador.com','n':'El Espectador','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'colombia','langs':['es'],'lang_principal':'es','tags':['generalista','colombia'] },
        { 'd':'eltiempo.com','n':'El Tiempo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'colombia','langs':['es'],'lang_principal':'es','tags':['generalista','colombia'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · COREA DEL SUR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Corea del Sur', 'items':[
        { 'd':'koreaherald.com','n':'The Korea Herald','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'corea-del-sur','langs':['en'],'lang_principal':'en','tags':['generalista','asia','corea'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · COSTA RICA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Costa Rica', 'items':[
        { 'd':'nacion.com','n':'La Nación (CR)','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'costa-rica','langs':['es'],'lang_principal':'es','tags':['generalista','costarica'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · EE.UU.
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · EE.UU.', 'items':[
        { 'd':'abcnews.com','n':'ABC News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'] },
        { 'd':'apnews.com','n':'Associated Press','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['agencia','internacional'] },
        { 'd':'axios.com','n':'Axios','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['politica','usa'] },
        { 'd':'bloomberg.com','n':'Bloomberg','type':'digital','sector':'economia','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['economia','internacional'] },
        { 'd':'businessinsider.com','n':'Business Insider','type':'digital','sector':'economia','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['economia','usa'] },
        { 'd':'cbsnews.com','n':'CBS News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'] },
        { 'd':'cnbc.com','n':'CNBC','type':'tv','sector':'economia','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['economia','usa'] },
        { 'd':'edition.cnn.com','n':'CNN','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','tv'] },
        { 'd':'elnuevoherald.com','n':'El Nuevo Herald','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['es'],'lang_principal':'es','tags':['generalista','usa','latino'] },
        { 'd':'foreignaffairs.com','n':'Foreign Affairs','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['internacional','usa'] },
        { 'd':'foreignpolicy.com','n':'Foreign Policy','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['internacional','usa'] },
        { 'd':'foxnews.com','n':'Fox News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','conservador'] },
        { 'd':'msnbc.com','n':'MSNBC','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','progresista'] },
        { 'd':'nbcnews.com','n':'NBC News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'] },
        { 'd':'newyorker.com','n':'The New Yorker','type':'revista','sector':'cultura','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['cultural','usa'] },
        { 'd':'npr.org','n':'NPR','type':'radio','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','radio'] },
        { 'd':'nytimes.com','n':'The New York Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa','referencia'] },
        { 'd':'politico.com','n':'Politico','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['politica','usa'] },
        { 'd':'telemundo.com','n':'Telemundo','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['es'],'lang_principal':'es','tags':['generalista','usa','latino'] },
        { 'd':'theatlantic.com','n':'The Atlantic','type':'revista','sector':'cultura','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['cultural','usa'] },
        { 'd':'time.com','n':'Time','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'] },
        { 'd':'vox.com','n':'Vox','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'] },
        { 'd':'washingtonpost.com','n':'The Washington Post','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['generalista','usa'] },
        { 'd':'wsj.com','n':'The Wall Street Journal','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'eeuu','langs':['en'],'lang_principal':'en','tags':['economia','usa'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ECUADOR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Ecuador', 'items':[
        { 'd':'elcomercio.com','n':'El Comercio (EC)','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'ecuador','langs':['es'],'lang_principal':'es','tags':['generalista','ecuador'] },
        { 'd':'eluniverso.com','n':'El Universo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'ecuador','langs':['es'],'lang_principal':'es','tags':['generalista','ecuador'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · EL SALVADOR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · El Salvador', 'items':[
        { 'd':'elfaro.net','n':'El Faro','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'el-salvador','langs':['es'],'lang_principal':'es','tags':['investigacion','salvador'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · FRANCIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Francia', 'items':[
        { 'd':'euronews.com','n':'Euronews','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['en'],'lang_principal':'en','tags':['generalista','europa'] },
        { 'd':'france24.com','n':'France 24','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia','publico'] },
        { 'd':'lefigaro.fr','n':'Le Figaro','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia'] },
        { 'd':'lemonde.fr','n':'Le Monde','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia'] },
        { 'd':'lesechos.fr','n':'Les Échos','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['economia','francia'] },
        { 'd':'liberation.fr','n':'Libération','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia'] },
        { 'd':'monde-diplomatique.fr','n':'Le Monde Diplomatique','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia'] },
        { 'd':'rfi.fr','n':'RFI','type':'radio','sector':'generalista','ambito':'internacional','region':None,'pais':'francia','langs':['fr'],'lang_principal':'fr','tags':['generalista','francia','publico'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · GUATEMALA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Guatemala', 'items':[
        { 'd':'prensalibre.com','n':'Prensa Libre','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'guatemala','langs':['es'],'lang_principal':'es','tags':['generalista','guatemala'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · HONDURAS
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Honduras', 'items':[
        { 'd':'elheraldo.hn','n':'El Heraldo','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'honduras','langs':['es'],'lang_principal':'es','tags':['generalista','honduras'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · INDIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · India', 'items':[
        { 'd':'thehindu.com','n':'The Hindu','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'india','langs':['en'],'lang_principal':'en','tags':['generalista','india'] },
        { 'd':'timesofindia.indiatimes.com','n':'Times of India','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'india','langs':['en'],'lang_principal':'en','tags':['generalista','india'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · IRLANDA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Irlanda', 'items':[
        { 'd':'independent.ie','n':'Irish Independent','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'irlanda','langs':['en'],'lang_principal':'en','tags':['generalista','irlanda'] },
        { 'd':'irishtimes.com','n':'The Irish Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'irlanda','langs':['en'],'lang_principal':'en','tags':['generalista','irlanda'] },
        { 'd':'rte.ie','n':'RTÉ','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'irlanda','langs':['en'],'lang_principal':'en','tags':['generalista','irlanda','publico'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ISRAEL
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Israel', 'items':[
        { 'd':'haaretz.com','n':'Haaretz','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'israel','langs':['en'],'lang_principal':'en','tags':['generalista','oriente medio'] },
        { 'd':'jpost.com','n':'The Jerusalem Post','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'israel','langs':['en'],'lang_principal':'en','tags':['generalista','oriente medio'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ITALIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Italia', 'items':[
        { 'd':'ansa.it','n':'ANSA','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['agencia','italia'] },
        { 'd':'corriere.it','n':'Corriere della Sera','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'] },
        { 'd':'ilfattoquotidiano.it','n':'Il Fatto Quotidiano','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'] },
        { 'd':'ilmessaggero.it','n':'Il Messaggero','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'] },
        { 'd':'ilsole24ore.com','n':'Il Sole 24 Ore','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['economia','italia'] },
        { 'd':'lastampa.it','n':'La Stampa','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'] },
        { 'd':'repubblica.it','n':'La Repubblica','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'italia','langs':['it'],'lang_principal':'it','tags':['generalista','italia'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · JAPÓN
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Japón', 'items':[
        { 'd':'japantimes.co.jp','n':'The Japan Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'japon','langs':['en'],'lang_principal':'en','tags':['generalista','asia','japon'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · MÉXICO
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · México', 'items':[
        { 'd':'eluniversal.com.mx','n':'El Universal','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'mexico','langs':['es'],'lang_principal':'es','tags':['generalista','mexico'] },
        { 'd':'milenio.com','n':'Milenio','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'mexico','langs':['es'],'lang_principal':'es','tags':['generalista','mexico'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · NIGERIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Nigeria', 'items':[
        { 'd':'premiumtimesng.com','n':'Premium Times','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'nigeria','langs':['en'],'lang_principal':'en','tags':['generalista','africa','nigeria'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · PAÍSES BAJOS
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Países Bajos', 'items':[
        { 'd':'nrc.nl','n':'NRC Handelsblad','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paises-bajos','langs':['nl'],'lang_principal':'nl','tags':['generalista','paisesbajos'] },
        { 'd':'telegraaf.nl','n':'De Telegraaf','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paises-bajos','langs':['nl'],'lang_principal':'nl','tags':['generalista','paisesbajos'] },
        { 'd':'trouw.nl','n':'Trouw','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paises-bajos','langs':['nl'],'lang_principal':'nl','tags':['generalista','paisesbajos'] },
        { 'd':'volkskrant.nl','n':'de Volkskrant','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paises-bajos','langs':['nl'],'lang_principal':'nl','tags':['generalista','paisesbajos'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · PARAGUAY
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Paraguay', 'items':[
        { 'd':'abc.com.py','n':'ABC Color','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paraguay','langs':['es'],'lang_principal':'es','tags':['generalista','paraguay'] },
        { 'd':'ultimahora.com','n':'Última Hora (PY)','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'paraguay','langs':['es'],'lang_principal':'es','tags':['generalista','paraguay'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · PERÚ
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Perú', 'items':[
        { 'd':'elcomercio.pe','n':'El Comercio','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'peru','langs':['es'],'lang_principal':'es','tags':['generalista','peru'] },
        { 'd':'gestion.pe','n':'Gestión','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'peru','langs':['es'],'lang_principal':'es','tags':['economia','peru'] },
        { 'd':'rpp.pe','n':'RPP','type':'radio','sector':'generalista','ambito':'internacional','region':None,'pais':'peru','langs':['es'],'lang_principal':'es','tags':['generalista','peru','radio'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · PORTUGAL
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Portugal', 'items':[
        { 'd':'expresso.pt','n':'Expresso','type':'revista','sector':'generalista','ambito':'internacional','region':None,'pais':'portugal','langs':['pt'],'lang_principal':'pt','tags':['generalista','portugal'] },
        { 'd':'ionline.sapo.pt','n':'Jornal i','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'portugal','langs':['pt'],'lang_principal':'pt','tags':['generalista','portugal'] },
        { 'd':'observador.pt','n':'Observador','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'portugal','langs':['pt'],'lang_principal':'pt','tags':['generalista','portugal'] },
        { 'd':'publico.pt','n':'Público','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'portugal','langs':['pt'],'lang_principal':'pt','tags':['generalista','portugal'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · REINO UNIDO
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Reino Unido', 'items':[
        { 'd':'bbc.com','n':'BBC','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk','publico'] },
        { 'd':'dailymail.co.uk','n':'Daily Mail','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk','tabloide'] },
        { 'd':'economist.com','n':'The Economist','type':'revista','sector':'economia','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['economia','internacional'] },
        { 'd':'ft.com','n':'Financial Times','type':'diario','sector':'economia','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['economia','uk'] },
        { 'd':'independent.co.uk','n':'The Independent','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'] },
        { 'd':'middleeasteye.net','n':'Middle East Eye','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','oriente medio'] },
        { 'd':'mirror.co.uk','n':'The Mirror','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk','tabloide'] },
        { 'd':'news.sky.com','n':'Sky News','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'] },
        { 'd':'reuters.com','n':'Reuters','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['agencia','internacional'] },
        { 'd':'telegraph.co.uk','n':'The Telegraph','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'] },
        { 'd':'theguardian.com','n':'The Guardian','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'] },
        { 'd':'thetimes.com','n':'The Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'reino-unido','langs':['en'],'lang_principal':'en','tags':['generalista','uk'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · REPÚBLICA DOMINICANA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · República Dominicana', 'items':[
        { 'd':'diariolibre.com','n':'Diario Libre','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'republica-dominicana','langs':['es'],'lang_principal':'es','tags':['generalista','republicadominicana'] },
        { 'd':'listindiario.com','n':'Listín Diario','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'republica-dominicana','langs':['es'],'lang_principal':'es','tags':['generalista','republicadominicana'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · RUSIA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Rusia', 'items':[
        { 'd':'tass.com','n':'TASS','type':'agencia','sector':'generalista','ambito':'internacional','region':None,'pais':'rusia','langs':['en'],'lang_principal':'en','tags':['agencia','rusia'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · SINGAPUR
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Singapur', 'items':[
        { 'd':'straitstimes.com','n':'The Straits Times','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'singapur','langs':['en'],'lang_principal':'en','tags':['generalista','asia','singapur'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · SUDÁFRICA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Sudáfrica', 'items':[
        { 'd':'mg.co.za','n':'Mail & Guardian','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'sudafrica','langs':['en'],'lang_principal':'en','tags':['generalista','africa','sudafrica'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · SUIZA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Suiza', 'items':[
        { 'd':'swissinfo.ch','n':'SWI swissinfo.ch','type':'digital','sector':'generalista','ambito':'internacional','region':None,'pais':'suiza','langs':['es'],'lang_principal':'es','tags':['generalista','suiza','publico'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · URUGUAY
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Uruguay', 'items':[
        { 'd':'elobservador.com.uy','n':'El Observador','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'uruguay','langs':['es'],'lang_principal':'es','tags':['generalista','uruguay'] },
        { 'd':'elpais.com.uy','n':'El País (UY)','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'uruguay','langs':['es'],'lang_principal':'es','tags':['generalista','uruguay'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · VENEZUELA
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · Venezuela', 'items':[
        { 'd':'elnacional.com','n':'El Nacional','type':'diario','sector':'generalista','ambito':'internacional','region':None,'pais':'venezuela','langs':['es'],'lang_principal':'es','tags':['generalista','venezuela'] },
    ]},

    # ═══════════════════════════════════════════════════════════════
    # INTERNACIONAL · ÁFRICA (pan-regional)
    # ═══════════════════════════════════════════════════════════════
    { 'group':'Internacional · África', 'items':[
        { 'd':'africanews.com','n':'Africanews','type':'tv','sector':'generalista','ambito':'internacional','region':None,'pais':'africa','langs':['en'],'lang_principal':'en','tags':['generalista','africa','panafricano'] },
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
def _derivar_grupo(m):
    """Deriva el nombre del grupo a partir de sector y ámbito."""
    s = m['sector']; a = m['ambito']
    if s != 'generalista':
        return SECTOR_DISPLAY.get(s, s.replace('-', ' ').title())
    if a == 'nacional':
        return 'Nacional'
    if a == 'regional':
        return f"Regional · {REGION_DISPLAY.get(m['region'], m['region'])}"
    if a == 'internacional':
        return f"Internacional · {COUNTRY_DISPLAY.get(m['pais'], m['pais'])}"
    return 'Otros'


def todos_los_medios():
    """Aplana el catálogo y deriva el grupo."""
    return [
        {**it, 'grupo': _derivar_grupo(it), 'lang': it['lang_principal']}
        for g in MEDIA_CATALOG for it in g['items']
    ]


def total_medios():
    return sum(len(g['items']) for g in MEDIA_CATALOG)


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


_validar_catalogo()

if __name__ == '__main__':
    print(f"Total de grupos: {len(MEDIA_CATALOG)}")
    print(f"Total de medios: {total_medios()}")
    print(f"Feeds RSS conocidos: {len(KNOWN_FEEDS)}")
