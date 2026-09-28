import json
import os
from datetime import datetime
import feedparser
import requests
from bs4 import BeautifulSoup
import concurrent.futures

# Tu lista de medios (hemos comprimido el JSON para no hacer el archivo enorme,
# pero en tu código puedes pegar la tuya completa tal cual la enviaste)
MEDIA_CATALOG = [
  // ============================================================
  // ESPAÑA · NACIONALES GENERALISTAS
  // ============================================================
  { group:'España · Nacionales', items:[
    { d:'elpais.com',          n:'El País',              lang:'es', type:'diario',  tags:['generalista','nacional'] },
    { d:'elmundo.es',          n:'El Mundo',             lang:'es', type:'diario',  tags:['generalista','nacional'] },
    { d:'abc.es',              n:'ABC',                  lang:'es', type:'diario',  tags:['generalista','nacional','conservador'] },
    { d:'lavanguardia.com',    n:'La Vanguardia',        lang:'es', type:'diario',  tags:['generalista','nacional','catalan'] },
    { d:'elperiodico.com',     n:'El Periódico',         lang:'es', type:'diario',  tags:['generalista','nacional','catalan'] },
    { d:'larazon.es',          n:'La Razón',             lang:'es', type:'diario',  tags:['generalista','nacional','conservador'] },
    { d:'20minutos.es',        n:'20 Minutos',           lang:'es', type:'diario',  tags:['generalista','gratuito'] },
    { d:'que.es',              n:'Qué!',                 lang:'es', type:'diario',  tags:['generalista','gratuito'] },

    // Nativos digitales
    { d:'elconfidencial.com',  n:'El Confidencial',      lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'eldiario.es',         n:'elDiario.es',          lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'elespanol.com',       n:'El Español',           lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'publico.es',          n:'Público',              lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'vozpopuli.com',       n:'Vozpópuli',            lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'okdiario.com',        n:'OK Diario',            lang:'es', type:'digital', tags:['generalista','digital','conservador'] },
    { d:'huffingtonpost.es',   n:'El HuffPost',          lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'elplural.com',        n:'El Plural',            lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'infolibre.es',        n:'InfoLibre',            lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'eldebate.com',        n:'El Debate',            lang:'es', type:'digital', tags:['generalista','digital','conservador'] },
    { d:'theobjective.com',    n:'The Objective',        lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'libertaddigital.com', n:'Libertad Digital',     lang:'es', type:'digital', tags:['generalista','digital','liberal'] },
    { d:'elindependiente.com', n:'El Independiente',     lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'moncloa.com',         n:'Moncloa',              lang:'es', type:'digital', tags:['generalista','digital'] },

    // TV y Radio
    { d:'rtve.es',             n:'RTVE',                 lang:'es', type:'tv',      tags:['generalista','publico','tv','radio'] },
    { d:'antena3.com',         n:'Antena 3',             lang:'es', type:'tv',      tags:['generalista','privado','tv'] },
    { d:'telecinco.es',        n:'Telecinco',            lang:'es', type:'tv',      tags:['generalista','privado','tv'] },
    { d:'lasexta.com',         n:'La Sexta',             lang:'es', type:'tv',      tags:['generalista','privado','tv'] },
    { d:'cuatro.com',          n:'Cuatro',               lang:'es', type:'tv',      tags:['generalista','privado','tv'] },
    { d:'cadenaser.com',       n:'Cadena SER',           lang:'es', type:'radio',   tags:['generalista','radio'] },
    { d:'cope.es',             n:'COPE',                 lang:'es', type:'radio',   tags:['generalista','radio','conservador'] },
    { d:'ondacero.es',         n:'Onda Cero',            lang:'es', type:'radio',   tags:['generalista','radio'] },

    // Agencias
    { d:'europapress.es',      n:'Europa Press',         lang:'es', type:'agencia', tags:['agencia','nacional'] },
    { d:'efe.com',             n:'Agencia EFE',          lang:'es', type:'agencia', tags:['agencia','nacional'] },
    { d:'servimedia.es',       n:'Servimedia',           lang:'es', type:'agencia', tags:['agencia','social'] },
    { d:'colpisa.com',         n:'Agencia Colpisa',      lang:'es', type:'agencia', tags:['agencia','nacional'] },
  ]},

  // ============================================================
  // ESPAÑA · DEPORTIVOS
  // ============================================================
  { group:'España · Deportivos', items:[
    { d:'marca.com',           n:'Marca',                lang:'es', type:'deportivo', tags:['deportes','futbol'] },
    { d:'as.com',              n:'Diario AS',            lang:'es', type:'deportivo', tags:['deportes','futbol'] },
    { d:'mundodeportivo.com',  n:'Mundo Deportivo',      lang:'es', type:'deportivo', tags:['deportes','futbol','catalan'] },
    { d:'sport.es',            n:'Sport',                lang:'es', type:'deportivo', tags:['deportes','futbol','catalan'] },
    { d:'superdeporte.es',     n:'Superdeporte',         lang:'es', type:'deportivo', tags:['deportes','valencia'] },
    { d:'estadiodeportivo.com',n:'Estadio Deportivo',    lang:'es', type:'deportivo', tags:['deportes','andalucia'] },
    { d:'eldesmarque.com',     n:'El Desmarque',         lang:'es', type:'deportivo', tags:['deportes','digital'] },
    { d:'relevo.com',          n:'Relevo',               lang:'es', type:'deportivo', tags:['deportes','digital'] },
    { d:'palco23.com',         n:'Palco23',              lang:'es', type:'deportivo', tags:['deportes','negocio'] },
    { d:'2playbook.com',       n:'2Playbook',            lang:'es', type:'deportivo', tags:['deportes','negocio'] },
  ]},

  // ============================================================
  // ESPAÑA · ECONÓMICOS
  // ============================================================
  { group:'España · Económicos', items:[
    { d:'expansion.com',       n:'Expansión',            lang:'es', type:'economico', tags:['economia','negocios'] },
    { d:'cincodias.com',       n:'Cinco Días',           lang:'es', type:'economico', tags:['economia','negocios'] },
    { d:'eleconomista.es',     n:'El Economista',        lang:'es', type:'economico', tags:['economia','negocios'] },
    { d:'economiadigital.es',  n:'Economía Digital',     lang:'es', type:'economico', tags:['economia','digital'] },
    { d:'lainformacion.com',   n:'La Información',       lang:'es', type:'digital',   tags:['economico','digital'] },
    { d:'libremercado.com',    n:'Libre Mercado',        lang:'es', type:'economico', tags:['economia','liberal'] },
    { d:'invertia.com',        n:'Invertia',             lang:'es', type:'economico', tags:['economia','mercados'] },
    { d:'bolsamania.com',      n:'Bolsamania',           lang:'es', type:'economico', tags:['economia','mercados'] },
  ]},

  // ============================================================
  // ESPAÑA · TECNOLOGÍA
  // ============================================================
  { group:'España · Tecnología', items:[
    { d:'xataka.com',          n:'Xataka',               lang:'es', type:'tecnologia', tags:['tecnologia','gadgets'] },
    { d:'genbeta.com',         n:'Genbeta',              lang:'es', type:'tecnologia', tags:['tecnologia','software'] },
    { d:'applesfera.com',      n:'Applesfera',           lang:'es', type:'tecnologia', tags:['tecnologia','apple'] },
    { d:'computerhoy.com',     n:'Computer Hoy',         lang:'es', type:'tecnologia', tags:['tecnologia'] },
    { d:'hipertextual.com',    n:'Hipertextual',         lang:'es', type:'tecnologia', tags:['tecnologia','cultura'] },
    { d:'adslzone.net',        n:'ADSLZone',             lang:'es', type:'tecnologia', tags:['tecnologia','internet'] },
  ]},

  // ============================================================
  // ESPAÑA · CULTURALES / REVISTAS
  // ============================================================
  { group:'España · Culturales', items:[
    { d:'jotdown.es',          n:'Jot Down',             lang:'es', type:'revista', tags:['cultural','entrevistas'] },
    { d:'elcultural.com',      n:'El Cultural',          lang:'es', type:'revista', tags:['cultural'] },
    { d:'zendalibros.com',     n:'Zenda Libros',         lang:'es', type:'revista', tags:['cultural','libros'] },
    { d:'letraslibres.com',    n:'Letras Libres',        lang:'es', type:'revista', tags:['cultural','literatura'] },
    { d:'ethic.es',            n:'Ethic',                lang:'es', type:'revista', tags:['cultural','sociedad'] },
    { d:'yorokobu.es',         n:'Yorokobu',             lang:'es', type:'revista', tags:['cultural','creatividad'] },
    { d:'elsaltodiario.com',   n:'El Salto',             lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'lamarea.com',         n:'La Marea',             lang:'es', type:'revista', tags:['cultural','progresista'] },
    { d:'ctxt.es',             n:'CTXT',                 lang:'es', type:'revista', tags:['cultural','investigacion'] },
    { d:'alternativaseconomicas.coop', n:'Alternativas Económicas', lang:'es', type:'revista', tags:['economia','social'] },
    { d:'revistamongolia.com', n:'Mongolia',             lang:'es', type:'revista', tags:['cultural','humor'] },
    { d:'critic.cat',          n:'Crític',               lang:'ca', type:'revista', tags:['cultural','investigacion'] },
    { d:'culturainquieta.com', n:'Cultura Inquieta',     lang:'es', type:'revista', tags:['cultural'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · CATALUÑA
  // ============================================================
  { group:'Cataluña', items:[
    { d:'elpuntavui.cat',      n:'El Punt Avui',         lang:'ca', type:'diario',  tags:['generalista','catalan'] },
    { d:'ara.cat',             n:'Ara',                  lang:'ca', type:'diario',  tags:['generalista','catalan'] },
    { d:'naciodigital.cat',    n:'Nació Digital',        lang:'ca', type:'digital', tags:['generalista','digital'] },
    { d:'vilaweb.cat',         n:'VilaWeb',              lang:'ca', type:'digital', tags:['generalista','digital'] },
    { d:'elnacional.cat',      n:'El Nacional',          lang:'ca', type:'digital', tags:['generalista','digital'] },
    { d:'elmon.cat',           n:'El Món',               lang:'ca', type:'digital', tags:['generalista','digital'] },
    { d:'324.cat',             n:'324',                  lang:'ca', type:'tv',      tags:['generalista','tv','publico'] },
    { d:'ccma.cat',            n:'CCMA',                 lang:'ca', type:'tv',      tags:['generalista','tv','publico'] },
    { d:'rac1.cat',            n:'RAC1',                 lang:'ca', type:'radio',   tags:['generalista','radio'] },
    { d:'viaempresa.cat',      n:'Via Empresa',          lang:'ca', type:'economico', tags:['economia'] },
    { d:'acn.cat',             n:'Agència Catalana de Notícies', lang:'ca', type:'agencia', tags:['agencia','catalan'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · GALICIA (VERIFICADOS Y AMPLIADOS)
  // ============================================================
  { group:'Galicia', items:[
    // Diarios de alcance autonómico y provincial
    { d:'lavozdegalicia.es',   n:'La Voz de Galicia',    lang:'es', type:'diario',  tags:['generalista','galicia'] },
    { d:'farodevigo.es',       n:'Faro de Vigo',         lang:'es', type:'diario',  tags:['generalista','galicia'] },
    { d:'elcorreogallego.es',  n:'El Correo Gallego',    lang:'es', type:'diario',  tags:['generalista','galicia'] },
    { d:'laregion.es',         n:'La Región',            lang:'es', type:'diario',  tags:['generalista','galicia','ourense'] },
    { d:'elprogreso.es',       n:'El Progreso',          lang:'es', type:'diario',  tags:['generalista','galicia','lugo'] },
    { d:'laopinioncoruna.es',  n:'La Opinión A Coruña',  lang:'es', type:'diario',  tags:['generalista','galicia','coruña'] },
    { d:'elidealgallego.com',  n:'El Ideal Gallego',     lang:'es', type:'diario',  tags:['generalista','galicia','coruña'] },
    { d:'diariodepontevedra.es', n:'Diario de Pontevedra', lang:'es', type:'diario', tags:['generalista','galicia','pontevedra'] },
    { d:'atlantico.net',       n:'Atlántico',            lang:'es', type:'diario',  tags:['generalista','galicia','vigo'] },
    { d:'diariodeferrol.com',  n:'Diario de Ferrol',     lang:'es', type:'diario',  tags:['generalista','galicia','ferrol'] },
    { d:'diariodearousa.com',  n:'Diario de Arousa',     lang:'es', type:'diario',  tags:['generalista','galicia','arousa'] },

    // Nativos Digitales Autonómicos y Análisis
    { d:'galiciaconfidencial.com', n:'Galicia Confidencial', lang:'gl', type:'digital', tags:['generalista','galicia'] },
    { d:'nosdiario.gal',       n:'Nós Diario',           lang:'gl', type:'digital', tags:['generalista','galicia'] },
    { d:'praza.gal',           n:'Praza Pública',        lang:'gl', type:'digital', tags:['generalista','galicia'] },
    { d:'galiciapress.es',     n:'Galicia Press',        lang:'es', type:'digital', tags:['generalista','galicia'] },
    { d:'mundiario.com',       n:'Mundiario',            lang:'es', type:'digital', tags:['generalista','galicia'] },
    { d:'galiciadigital.com',  n:'Galicia Digital',      lang:'es', type:'digital', tags:['generalista','galicia'] },

    // Digitales Locales y Comarcales
    { d:'pontevedraviva.com',  n:'Pontevedra Viva',      lang:'es', type:'digital', tags:['generalista','local','pontevedra'] },
    { d:'vigoe.es',            n:'Vigoé',                lang:'es', type:'digital', tags:['generalista','local','vigo'] },
    { d:'metropolitano.gal',   n:'Metropolitano',        lang:'es', type:'digital', tags:['generalista','local','vigo'] },
    { d:'ferrol360.es',        n:'Ferrol 360',           lang:'es', type:'digital', tags:['generalista','local','ferrol'] },

    // Deportes
    { d:'dxtcampeon.com',      n:'DxT Campeón',          lang:'es', type:'deportivo', tags:['deportes','galicia','coruña'] },
    { d:'riazor.org',          n:'Riazor.org',           lang:'es', type:'deportivo', tags:['deportes','galicia','coruña'] },

    // Radio y TV Autonómica
    { d:'crtvg.gal',           n:'CRTVG (TVG y Radio Galega)', lang:'gl', type:'tv', tags:['generalista','publico','galicia','radio'] },
    { d:'radiovoz.com',        n:'Radio Voz',            lang:'es', type:'radio',   tags:['generalista','privado','galicia'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · PAÍS VASCO / NAVARRA
  // ============================================================
  { group:'País Vasco · Navarra', items:[
    { d:'elcorreo.com',        n:'El Correo',            lang:'es', type:'diario',  tags:['generalista','euskadi'] },
    { d:'diariovasco.com',     n:'Diario Vasco',         lang:'es', type:'diario',  tags:['generalista','euskadi'] },
    { d:'deia.eus',            n:'Deia',                 lang:'es', type:'diario',  tags:['generalista','euskadi'] },
    { d:'noticiasdegipuzkoa.eus', n:'Noticias de Gipuzkoa', lang:'es', type:'diario', tags:['generalista','euskadi'] },
    { d:'noticiasdealava.eus', n:'Noticias de Álava',    lang:'es', type:'diario',  tags:['generalista','euskadi'] },
    { d:'naiz.eus',            n:'Naiz',                 lang:'es', type:'digital', tags:['generalista','euskadi'] },
    { d:'berria.eus',          n:'Berria',               lang:'eu', type:'diario',  tags:['generalista','euskadi'] },
    { d:'eitb.eus',            n:'EITB',                 lang:'eu', type:'tv',      tags:['generalista','tv','publico'] },
    { d:'diariodenavarra.es',  n:'Diario de Navarra',    lang:'es', type:'diario',  tags:['generalista','navarra'] },
    { d:'noticiasdenavarra.es',n:'Noticias de Navarra',  lang:'es', type:'diario',  tags:['generalista','navarra'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · ARAGÓN · LA RIOJA · CANTABRIA · ASTURIAS
  // ============================================================
  { group:'Norte · Aragón · La Rioja · Cantabria · Asturias', items:[
    { d:'heraldo.es',          n:'Heraldo de Aragón',    lang:'es', type:'diario',  tags:['generalista','aragon'] },
    { d:'elperiodicodearagon.com', n:'El Periódico de Aragón', lang:'es', type:'diario', tags:['generalista','aragon'] },
    { d:'larioja.com',         n:'La Rioja',             lang:'es', type:'diario',  tags:['generalista','rioja'] },
    { d:'eldiariomontanes.es', n:'El Diario Montañés',   lang:'es', type:'diario',  tags:['generalista','cantabria'] },
    { d:'lne.es',              n:'La Nueva España',      lang:'es', type:'diario',  tags:['generalista','asturias'] },
    { d:'elcomercio.es',       n:'El Comercio',          lang:'es', type:'diario',  tags:['generalista','asturias'] },
    { d:'lavozdeasturias.es',  n:'La Voz de Asturias',   lang:'es', type:'digital', tags:['generalista','asturias'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · CASTILLA Y LEÓN
  // ============================================================
  { group:'Castilla y León', items:[
    { d:'elnortedecastilla.es',n:'El Norte de Castilla', lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'diariodeleon.es',     n:'Diario de León',       lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'diariodeburgos.es',   n:'Diario de Burgos',     lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'laopiniondezamora.es',n:'La Opinión de Zamora', lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'lagacetadesalamanca.es', n:'La Gaceta de Salamanca', lang:'es', type:'diario', tags:['generalista','castillaleon'] },
    { d:'diariodeavila.es',    n:'Diario de Ávila',      lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'eldiadevalladolid.com', n:'El Día de Valladolid', lang:'es', type:'diario', tags:['generalista','castillaleon'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · CASTILLA-LA MANCHA
  // ============================================================
  { group:'Castilla-La Mancha', items:[
    { d:'lanzadigital.com',    n:'Lanza Digital',        lang:'es', type:'digital', tags:['generalista','clm'] },
    { d:'latribunadealbacete.es', n:'La Tribuna de Albacete', lang:'es', type:'diario', tags:['generalista','clm'] },
    { d:'latribunadeciudadreal.es', n:'La Tribuna de Ciudad Real', lang:'es', type:'diario', tags:['generalista','clm'] },
    { d:'encastillalamancha.es', n:'En Castilla-La Mancha', lang:'es', type:'digital', tags:['generalista','clm'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · COMUNIDAD VALENCIANA · MURCIA
  // ============================================================
  { group:'Comunidad Valenciana · Murcia', items:[
    { d:'lasprovincias.es',    n:'Las Provincias',       lang:'es', type:'diario',  tags:['generalista','valencia'] },
    { d:'levante-emv.com',     n:'Levante-EMV',          lang:'es', type:'diario',  tags:['generalista','valencia'] },
    { d:'informacion.es',      n:'Información',          lang:'es', type:'diario',  tags:['generalista','alicante'] },
    { d:'elperiodicomediterraneo.com', n:'El Periódico Mediterráneo', lang:'es', type:'diario', tags:['generalista','castellon'] },
    { d:'valenciaplaza.com',   n:'Valencia Plaza',       lang:'es', type:'digital', tags:['economia','valencia'] },
    { d:'laverdad.es',         n:'La Verdad',            lang:'es', type:'diario',  tags:['generalista','murcia'] },
    { d:'laopiniondemurcia.es',n:'La Opinión de Murcia', lang:'es', type:'diario',  tags:['generalista','murcia'] },
    { d:'murciaeconomia.com',  n:'Murcia Economía',      lang:'es', type:'economico', tags:['economia','murcia'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · ANDALUCÍA
  // ============================================================
  { group:'Andalucía', items:[
    { d:'diariosur.es',        n:'Diario Sur',           lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'diariodesevilla.es',  n:'Diario de Sevilla',    lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'ideal.es',            n:'Ideal',                lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'laopiniondemalaga.es',n:'La Opinión de Málaga', lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'malagahoy.es',        n:'Málaga Hoy',           lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'diariocordoba.com',   n:'Diario Córdoba',       lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'granadahoy.com',      n:'Granada Hoy',          lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'diariodecadiz.es',    n:'Diario de Cádiz',      lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'diariodejerez.es',    n:'Diario de Jerez',      lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'elcorreoweb.es',      n:'El Correo de Andalucía', lang:'es', type:'digital', tags:['generalista','andalucia'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · EXTREMADURA · MADRID
  // ============================================================
  { group:'Extremadura · Madrid', items:[
    { d:'hoy.es',              n:'Hoy',                  lang:'es', type:'diario',  tags:['generalista','extremadura'] },
    { d:'elperiodicoextremadura.com', n:'El Periódico Extremadura', lang:'es', type:'diario', tags:['generalista','extremadura'] },
    { d:'madridiario.es',      n:'Madridiario',          lang:'es', type:'digital', tags:['generalista','madrid'] },
    { d:'telemadrid.es',       n:'Telemadrid',           lang:'es', type:'tv',      tags:['generalista','tv','publico'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · BALEARES · CANARIAS
  // ============================================================
  { group:'Baleares · Canarias', items:[
    { d:'diariodemallorca.es', n:'Diario de Mallorca',   lang:'es', type:'diario',  tags:['generalista','baleares'] },
    { d:'ultimahora.es',       n:'Última Hora',          lang:'es', type:'diario',  tags:['generalista','baleares'] },
    { d:'diariodeibiza.es',    n:'Diario de Ibiza',      lang:'es', type:'diario',  tags:['generalista','baleares'] },
    { d:'canarias7.es',        n:'Canarias 7',           lang:'es', type:'diario',  tags:['generalista','canarias'] },
    { d:'laprovincia.es',      n:'La Provincia',         lang:'es', type:'diario',  tags:['generalista','canarias'] },
    { d:'eldia.es',            n:'El Día',               lang:'es', type:'diario',  tags:['generalista','canarias'] },
    { d:'diariodeavisos.com',  n:'Diario de Avisos',     lang:'es', type:'diario',  tags:['generalista','canarias'] },
  ]},

  // ============================================================
  // INTERNACIONAL · USA / UK
  // ============================================================
  { group:'Internacional · USA / UK', items:[
    { d:'nytimes.com',         n:'The New York Times',   lang:'en', type:'diario',  tags:['generalista','usa','referencia'] },
    { d:'washingtonpost.com',  n:'The Washington Post',  lang:'en', type:'diario',  tags:['generalista','usa'] },
    { d:'wsj.com',             n:'The Wall Street Journal', lang:'en', type:'economico', tags:['economia','usa'] },
    { d:'theguardian.com',     n:'The Guardian',         lang:'en', type:'diario',  tags:['generalista','uk'] },
    { d:'thetimes.com',        n:'The Times',            lang:'en', type:'diario',  tags:['generalista','uk'] },
    { d:'telegraph.co.uk',     n:'The Telegraph',        lang:'en', type:'diario',  tags:['generalista','uk'] },
    { d:'independent.co.uk',   n:'The Independent',      lang:'en', type:'digital', tags:['generalista','uk'] },
    { d:'bbc.com',             n:'BBC',                  lang:'en', type:'tv',      tags:['generalista','uk','publico'] },
    { d:'cnn.com',             n:'CNN',                  lang:'en', type:'tv',      tags:['generalista','usa','tv'] },
    { d:'reuters.com',         n:'Reuters',              lang:'en', type:'agencia', tags:['agencia','internacional'] },
    { d:'apnews.com',          n:'Associated Press',     lang:'en', type:'agencia', tags:['agencia','internacional'] },
    { d:'bloomberg.com',       n:'Bloomberg',            lang:'en', type:'economico', tags:['economia','internacional'] },
    { d:'ft.com',              n:'Financial Times',      lang:'en', type:'economico', tags:['economia','uk'] },
    { d:'economist.com',       n:'The Economist',        lang:'en', type:'revista', tags:['economia','internacional'] },
    { d:'time.com',            n:'Time',                 lang:'en', type:'revista', tags:['generalista','usa'] },
    { d:'politico.com',        n:'Politico',             lang:'en', type:'digital', tags:['politica','usa'] },
    { d:'npr.org',             n:'NPR',                  lang:'en', type:'radio',   tags:['generalista','usa','radio'] },
  ]},

  // ============================================================
  // INTERNACIONAL · FRANCIA, ALEMANIA, ITALIA, PORTUGAL
  // ============================================================
  { group:'Internacional · Europa', items:[
    { d:'lemonde.fr',          n:'Le Monde',             lang:'fr', type:'diario',  tags:['generalista','francia'] },
    { d:'lefigaro.fr',         n:'Le Figaro',            lang:'fr', type:'diario',  tags:['generalista','francia'] },
    { d:'liberation.fr',       n:'Libération',           lang:'fr', type:'diario',  tags:['generalista','francia'] },
    { d:'lesechos.fr',         n:'Les Échos',            lang:'fr', type:'economico', tags:['economia','francia'] },
    { d:'monde-diplomatique.fr', n:'Le Monde Diplomatique', lang:'fr', type:'revista', tags:['generalista','francia'] },
    { d:'zeit.de',             n:'Die Zeit',             lang:'de', type:'diario',  tags:['generalista','alemania'] },
    { d:'spiegel.de',          n:'Der Spiegel',          lang:'de', type:'revista', tags:['generalista','alemania'] },
    { d:'faz.net',             n:'FAZ',                  lang:'de', type:'diario',  tags:['generalista','alemania'] },
    { d:'sueddeutsche.de',     n:'Süddeutsche Zeitung',  lang:'de', type:'diario',  tags:['generalista','alemania'] },
    { d:'corriere.it',         n:'Corriere della Sera',  lang:'it', type:'diario',  tags:['generalista','italia'] },
    { d:'repubblica.it',       n:'La Repubblica',        lang:'it', type:'diario',  tags:['generalista','italia'] },
    { d:'ilsole24ore.com',     n:'Il Sole 24 Ore',       lang:'it', type:'economico', tags:['economia','italia'] },
    { d:'publico.pt',          n:'Público',              lang:'pt', type:'diario',  tags:['generalista','portugal'] },
    { d:'expresso.pt',         n:'Expresso',             lang:'pt', type:'revista', tags:['generalista','portugal'] },
    { d:'observador.pt',       n:'Observador',           lang:'pt', type:'digital', tags:['generalista','portugal'] },
    { d:'ionline.sapo.pt',     n:'Jornal i',             lang:'pt', type:'diario',  tags:['generalista','portugal'] },
  ]},

  // ============================================================
  // LATINOAMÉRICA
  // ============================================================
  { group:'Latinoamérica', items:[
    { d:'eluniversal.com.mx',  n:'El Universal',         lang:'es', type:'diario',  tags:['generalista','mexico'] },
    { d:'milenio.com',         n:'Milenio',              lang:'es', type:'diario',  tags:['generalista','mexico'] },
    { d:'clarin.com',          n:'Clarín',               lang:'es', type:'diario',  tags:['generalista','argentina'] },
    { d:'lanacion.com.ar',     n:'La Nación',            lang:'es', type:'diario',  tags:['generalista','argentina'] },
    { d:'infobae.com',         n:'Infobae',              lang:'es', type:'digital', tags:['generalista','argentina'] },
    { d:'eltiempo.com',        n:'El Tiempo',            lang:'es', type:'diario',  tags:['generalista','colombia'] },
    { d:'elespectador.com',    n:'El Espectador',        lang:'es', type:'diario',  tags:['generalista','colombia'] },
    { d:'elcomercio.pe',       n:'El Comercio',          lang:'es', type:'diario',  tags:['generalista','peru'] },
    { d:'latercera.com',       n:'La Tercera',           lang:'es', type:'diario',  tags:['generalista','chile'] },
    { d:'emol.com',            n:'Emol',                 lang:'es', type:'digital', tags:['generalista','chile'] },
    { d:'elpais.com.uy',       n:'El País (UY)',         lang:'es', type:'diario',  tags:['generalista','uruguay'] },
    { d:'elnacional.com',      n:'El Nacional',          lang:'es', type:'diario',  tags:['generalista','venezuela'] },
    { d:'univision.com',       n:'Univisión',            lang:'es', type:'tv',      tags:['generalista','usa','latino'] },
    { d:'telemundo.com',       n:'Telemundo',            lang:'es', type:'tv',      tags:['generalista','usa','latino'] },
    { d:'folha.uol.com.br',    n:'Folha de S.Paulo',     lang:'pt', type:'diario',  tags:['generalista','brasil'] },
    { d:'oglobo.globo.com',    n:'O Globo',              lang:'pt', type:'diario',  tags:['generalista','brasil'] },
  ]},
];


# Configuración para simular que somos un navegador real y que no nos bloqueen
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
}

def obtener_titular(medio):
    dominio = medio['d']
    nombre = medio['n']
    url = f"https://{dominio}"
    
    # 1. Intentar predecir la ruta del RSS más común
    rutas_rss = [f"{url}/rss", f"{url}/feed", f"{url}/rss.xml"]
    
    for ruta in rutas_rss:
        try:
            feed = feedparser.parse(ruta)
            if feed.entries:
                return {
                    'medio': nombre,
                    'titular': feed.entries[0].title,
                    'enlace': feed.entries[0].link,
                    'metodo': 'RSS'
                }
        except:
            continue
            
    # 2. Si no hay RSS, hacer scraping de la portada
    try:
        respuesta = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(respuesta.text, 'html.parser')
        
        # Buscar el primer h1 o h2 que contenga un enlace (suele ser el titular principal)
        titular_etiqueta = soup.find(['h1', 'h2'], limit=5)
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
    # Crear carpeta para la página web
    os.makedirs('public', exist_ok=True)
    hora_actual = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    # HTML muy limpio, alto contraste y letras grandes para accesibilidad
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
                   line-height: 1.6; font-size: 22px; }} /* Tamaño de letra grande */
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
    
    # Agrupar los resultados por el grupo definido en tu JSON
    for grupo_data in MEDIA_CATALOG:
        nombre_grupo = grupo_data['group']
        medios_del_grupo = [m['n'] for m in grupo_data['items']]
        
        # Filtrar los titulares que pertenecen a este grupo
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
    
    # Usar hilos paralelos para que sea mucho más rápido
    resultados_finales = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        resultados = executor.map(obtener_titular, lista_plana_medios)
        for r in resultados:
            if r:
                print(f"Obtenido: {r['medio']} ({r['metodo']})")
                resultados_finales.append(r)
                
    print(f"Total obtenidos: {len(resultados_finales)}")
    generar_html(resultados_finales)
    print("HTML generado con éxito en public/index.html")
