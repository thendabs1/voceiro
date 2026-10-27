# Fuentes

Ficha por servicio: qué aporta, acceso, límites y condiciones. Comprobaciones
de octubre de 2026; las cuotas y condiciones cambian, revisarlas antes de
integrar. Responder a un GET no acredita cobertura, frescura ni permiso de
republicación.

Reglas comunes:

- Identidad por el ID del proveedor; nunca fusionar por título, nombre u hora.
  Varias fuentes del mismo dato solo se unen con correspondencia explícita.
- Claves solo en servidor (`.env` local, secretos de Actions o de los workers);
  nunca en el front, URLs, muestras ni logs.
- Respetar `Retry-After`, detenerse ante 401/403, sin reintentos por visitante.
- No repartir peticiones entre IPs para ampliar cuotas por IP. Un pool de
  salida sirve para disponibilidad y bloqueos, no para multiplicar cuotas.
- Atribuir y enlazar al original cuando la licencia lo pide.

## Agenda: integradas

| Fuente | Ámbito | Acceso | Condiciones | Notas |
| --- | --- | --- | --- | --- |
| [Cultura de Galicia](https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0045/axenda-cultura-galicia) | Cultura, Galicia | JSON público, sin clave | CC BY-SA 4.0 | `concello` trae INE de seis cifras con control. Traducciones como celebraciones distintas enlazadas. |
| [Madrid](https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos) | Cultura, Madrid | CKAN, sin clave | CC BY 4.0 | Intervalos con días de semana y exclusiones; recintos por `vgnextoid`. |
| [Kulturklik](https://opendata.euskadi.eus/api-culture/?api=culture_events) | Cultura, Euskadi | API REST, sin clave | CC BY 4.0 | Fechas de día y horario en texto; código municipal propio. |
| [Zaragoza](https://www.zaragoza.es/web/espacio-de-datos/servicio/catalogo/282) | Cultura y actividades municipales | REST JSON, `rows` ≤ 500 por `id asc` | Atribución al Ayuntamiento | Obra `id` con funciones en `subEvent`; recinto con ID. Mezcla formación, empleo y deporte. |
| [Castilla y León](https://datos.gob.es/es/catalogo/a07002862-relacion-de-eventos-de-la-agenda-cultural-categorizados-y-geolocalizados) | Cultura, Castilla y León | Opendatasoft sin clave | CC BY 4.0 | Una fila por fecha: función = `id_evento@fecha_inicio`. Coordenadas en todas; `id_localidad` propio. |
| [Vidmar F1](https://f1.vidmar.net/) | F1 (piloto) | ICS completo | Republicación sin verificar; no se publica | 128 sesiones; UID con nombres; alarmas que no son citas. |
| ESPN Site API | ATP, NBA, WNBA; contraste de WTA, LaLiga y F1 | JSON sin clave, no documentado | Sin autorización de republicación acreditada | Una consulta por día y liga; los intervalos de fechas dan 400. `leagues[].calendar` sirve para planificar, no es la lista de citas. |
| WTA oficial (`api.wtatennis.com`) | WTA | JSON público de su web | Sin licencia publicada | Principal de WTA. |
| LaLiga oficial (`laliga.com`) | Primera y Segunda | HTML con datos de la web | Sin licencia publicada | Principal de fútbol. |
| F1 oficial (`api.formula1.com`) | F1 | API de la web con su clave pública de configuración | Sin licencia publicada | Principal de F1. Si cambia la web, se rompe la lectura de la clave. |
| [FEB](https://baloncestoenvivo.feb.es/) | LF Endesa (4), Primera FEB (1), LF Challenge (67) | HTML; dos páginas por liga y pasada | Derechos reservados; sin robots.txt | Sin pabellón acreditado; hora local sin zona. El calendario sustituye horarios por marcadores en partidos jugados. |
| [MotoGP oficial](https://www.motogp.com/en/calendar/2026) (`api.pulselive.motogp.com`) | MotoGP | JSON sin clave | Sin licencia publicada | GP y sesiones `type=SESSION` de la categoría MotoGP; `show_in_calendar=false` no cancela. |
| [OCBlacktop](https://ocblacktop.com/api) | WRC | `x-api-key` desde servidor | Free: 7.500/mes, 60/min, no comercial; incluso un 400 consume | `/v1/wrc/seasons/{año}`: temporada completa en una petición. Tiene F1 y MotoGP con UUID propios. |

## Contrato de fuente

Cada lector declara, antes de importar nada:

| Declaración | Contenido |
| --- | --- |
| Unidad | Función, programación continua, actividad con funciones o contenedor. Las filas físicas no la determinan |
| Identidad | Proveedor, tipo externo, componentes y serialización; ámbito de unicidad y estabilidad |
| Multiplicación de filas | Qué repite categorías, sedes, organizadores o idiomas y cómo se consolida sin fusionar actividades distintas |
| Obra → función | Relación acreditada; sin funciones inventadas desde una descripción |
| Inventario y ausencia | Completo, ventana o subconjunto; qué acredita retirada. Ausencia no es cancelación |
| Fechas y horas | Celebración frente a inscripción, publicación o modificación; precisión, zona, fin inclusivo, recurrencias, centinelas (`9999`); horario estructurado o texto |
| Estado | Programado, suspendido, aplazado, cancelado, con su valor original |
| Lugar y territorio | ID de recinto si existe; coordenadas con sistema y orden de ejes; municipio acreditado o por límites del IGN |
| Vocabularios | Todos los campos de clasificación, completos, con jerarquía y leyendas (ver [clasificacion.md](clasificacion.md)) |
| Condiciones | Público, edades, precio, acceso, accesibilidad, modalidad, idioma |
| Licencia y operación | Licencia y atribución; cadencia, horizonte, paginación y orden, límites, tamaño |

Se **rechaza** una fuente si no se puede acreditar la identidad, distinguir
celebración de inscripción o publicación, interpretar la unidad o leerla
completa; también si solo tiene histórico o el coste es desproporcionado. No
se rechaza por faltar tema, precio, coordenadas o recinto: esas carencias se
declaran.

## Lista cerrada

Inventario del 27/10/2026 sobre datos.gob.es (SPARQL de cultura, deporte y
turismo más los conjuntos actualizados en el último mes) y sondeo de los
portales autonómicos: de 361 candidatas, unas 30 tienen citas futuras. Los
portales de Aragón, Navarra, Canarias, Andalucía, GVA y C. de Madrid no
tienen agendas sin federar. Orden de integración tras reconstruir las cinco
actuales:

| Orden | Fuente | Veredicto | Familia | Condición o motivo |
| --- | --- | --- | --- | --- |
| 1 | [Barcelona ciudad](https://datos.gob.es/es/catalogo/l01080193-agenda-cultural-de-la-ciudad-de-barcelona) | Sí, con condición | CKAN | 4.745 programaciones, `register_id` único, recinto con ID (472), coordenadas 98,8 %, estado `suspended`/`deferred`. El JSON pesa 172 MB (límite común 4 MB): leer por Datastore o recurso acotado. Mucho curso de centro cívico. Sesiones iCal (75.943) solo si su UID es estable |
| 2 | [Cataluña](https://analisi.transparenciacatalunya.cat/d/rhpv-yr4f) | Sí, con condición | Socrata (nueva) | ~1.120 vigentes. Dos vistas de la misma agenda (por localizaciones `rhpv-yr4f`, por organizadores `2n2k-gg9s`) que se combinan por `codi`; una fila por sede u organizador; fechas a medianoche con centinelas `9999`; sin ID de recinto ni INE. Solapa unas 46 actividades con Barcelona: sin fusión |
| 3 | [Málaga](https://datos.gob.es/es/catalogo/l01290672-agenda-2026) | Sí | CSV anual (nueva) | Obra `ID_ACTIVIDAD`, función `ID_ACTIVIDAD@F_INICIO`; `ID_EVENTO` es contenedor; filas multiplicadas por categoría; `ID_LUGAR` 0 en la mitad. Horizonte corto: descubrir el archivo de cada año |
| 4 | [esMadrid](https://datos.gob.es/es/catalogo/l01280796-agenda-turistica-de-la-ciudad-de-madrid-www-esmadrid-com1) | Sí, con condición | XML (nueva) | 272 vigentes, `service id` y recinto `idrt`, sin solape con 300107. La descarga llegó en portugués: buscar la distribución en castellano. Rangos que empiezan en 2011–2018 |
| 5 | Diputación de Barcelona (`do.diba.cat`) | Reintentar | API JSON (nueva) | Agenda general, escenarios, museos, bibliotecas, parques, turismo. Error 500 el 27/10 |
| 6 | [Junta de Andalucía](https://datos.gob.es/es/catalogo/a01002820-agenda-de-eventos-organizados-por-la-junta-de-andalucia) | Sí, con condición | JSON | `id` único, pero las únicas fechas son `date_registration` (¿inscripción o celebración?) y las coordenadas son proyectadas sin sistema declarado: aclarar antes |
| 7 | L'Hospitalet, Cáceres | Reintentar | Socrata, JSON | Devolvieron HTML o 503 |
| 8 | Cartagena turística | Sí, con condición | CSV | 98 fichas con ID firme; contenedores y sin lugar ni categorías estructurados |
| 9 | Euskadi turística, Vitoria-Gasteiz (RSS), Biblioteca Foral de Bizkaia | Sí, con condición | GeoJSON/JSONP, RSS | Medir aportación frente a Kulturklik; Vitoria sin lugar; Biblioteca Foral confunde inscripción y celebración |
| — | IVC | No con la distribución actual | — | Sin ID; la URL se repite entre recintos |
| — | Tenerife deportiva, IVAP, Agrocabildo, Vigo, KulturAraba, Euskadi joven | No en esta ronda | — | Sin identidad acreditada, formación especializada o aportación mínima |
| — | Subconjuntos de Madrid (bibliotecas, deportivas, «100 días») | No como fuentes | — | Mismos `ID-EVENTO` que 300107 |
| — | Palau Robert, Bizkaikoa, Gijón, Canarias, Bizkaia, Murcia, CyL promoción turística, Bilbao | No | — | Sin futuro, parados, vacíos o ajenos a la agenda |

Sin agenda abierta utilizable: Comunidad de Madrid, Aragón (salvo Zaragoza),
Navarra, Asturias, Cantabria, La Rioja, Extremadura, Baleares, Castilla-La
Mancha (solo web), Murcia, Canarias (parada en 2022), Sevilla, Valencia
ciudad, Valladolid y A Coruña. No se abre una ronda de scraping para ellas.

## Atletismo

Comprobado el 27/10/2026 (muestras locales y 43 GET a páginas públicas).
Carreras populares, maratones, cross, trail y pista son citas de agenda; los
resultados, clasificaciones y marcas, consulta puntual, y solo con una fuente
que permita reutilizarlos (un worker no elimina las restricciones).

**Ya disponible en fuentes abiertas:** Madrid (`CarrerasMaratones`, p. ej.
Cross de la Constitución de Villaverde), Zaragoza (categoría Deporte: trail y
carreras entre unas 300 obras deportivas) y Málaga (Maratón, Carrera de la
Prensa). `Deporte` o `Eventos deportivos` no bastan para asignar `atletismo`:
la tabla de la fuente lo decide por campo, nunca por título.

| Fuente | Acceso | Cobertura | Condiciones | Veredicto |
| --- | --- | --- | --- | --- |
| [RFEA](https://atletismorfea.es/calendario) | HTML con filtros (temporada, disciplina, ámbito); fichas por URL; ID estable sin acreditar; la descarga Excel no devolvió datos | Ruta, maratón, cross, pista, marcha y trail; temporadas hasta 2027 | Copyright, sin licencia de datos | Pedir permiso; es la fuente para «campeonatos de España» y «maratones de la temporada» |
| [Federació Catalana](https://fcatletisme.cat/events/?ical=1) | ICS con 30 citas, `UID` (incluye fechas), lugar, categorías y modificación | Ruta, cross, trail, pista | Aviso legal: solo uso personal | Pedir permiso |
| [Federación Galega](https://atletismo.gal/competicions/) | HTML y Excel anunciado | Por disciplina, municipio y temporada | Autorización escrita para reproducir | Pedir permiso |
| [Federación Andaluza](https://atletismofaa.es/carreraspopulares/) | HTML de próximas carreras; PDF federativo | Carreras, cross y trail hasta 03/2027 | Derechos reservados | Pendiente |
| [World Athletics](https://worldathletics.org/terms-and-conditions) | HTML con datos embebidos | Internacional | Sus condiciones prohíben bases de datos y acceso automatizado sin autorización escrita | No |
| [CarrerasPopulares](https://carreraspopulares.com/aviso-legal) | Web; su RSS son noticias | Amplia | Autorización previa | No |
| Tenerife deportiva | JSON, URL no única | Cabildo | CC BY | Solo si acredita identidad |

En el núcleo: agrupación para circuito, campeonato o temporada; evento por
prueba fechada; disciplina (ruta, cross, trail, pista), distancia y
superficie como datos. Una carrera que aparezca en la RFEA y en una agenda
municipal solo se une por correspondencia revisada entre referencias.

Fases: (1) atletismo bien clasificado en Madrid, Zaragoza y Málaga con la
reconstrucción («carreras cerca de mí este mes»); (2) calendario federativo
tras conseguir permiso y acreditar identidad y lectura completa; (3)
resultados por worker con un proveedor autorizado.

## Agenda: otras candidatas

| Fuente | Qué aportaría | Situación |
| --- | --- | --- |
| [Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) | Conciertos y eventos con entrada en toda España; artistas y recintos con ID | Medido el 27/10: 8.840 eventos en ES (1.245 de artes escénicas); recinto con ID y coordenadas, zona y `status` (cancelado, aplazado). Sus términos permiten caché por «periodos razonables» para dar el servicio y retirar en 24 h si lo pide el titular; un índice propio exige el Discovery Feed de socios. Uso: consulta en vivo con caché, sin guardarlo en la base. Clave en `.env` (`TICKETMASTER_CONSUMER_KEY`); 5.000/día. |
| [SportsEvents24](https://sportsevents24.com/api) | Partidos y torneos por país y deporte | Sin clave: 100/día/IP, 10/min y 5.000 filas/mes contando repeticiones. Sin CORS. Solo para consultas puntuales pequeñas. |
| SportsAPI365 (tenis) | Calendario, resultados y ranking ATP/WTA | Clave en `.env` (`SPORTSAPI365_TENNIS_API_KEY`); plan de 150 peticiones/mes. Condiciones de almacenamiento sin revisar. |
| FotMob | Liga F, Primera y Segunda Federación | Pendiente de la autorización pedida por el usuario; sus condiciones prohíben la extracción automática. No consultar mientras tanto. |
| football-data.org, API-Football | Fútbol con horarios y marcadores | Cuentas gratuitas limitadas (Segunda no está en las 12 gratuitas de football-data). Sin probar con clave. |
| OpenLigaDB | LaLiga y Bundesliga | ODbL, sin registro; resultados atrasados en la comprobación. |
| openfootball, fixturedownload, TheSportsDB | Calendarios de fútbol | openfootball: CC0 sin IDs. fixturedownload: no permite redistribuir. TheSportsDB: clave pública recortada. |
| Directos de prensa | Entradas de directos (elDiario.es, RTVE, 20minutos) | elDiario.es tiene un endpoint incremental; los demás cargan por JS. Investigación sin plan. |

## Consultas puntuales (conectores)

Se consultan cuando la persona lo pide: no se recogen ni se guardan. Directo
desde el navegador si hay CORS y no hace falta clave; si no, por el worker con
caché y presupuesto. Una búsqueda por nombre puede devolver homónimos: mostrar
candidatos en vez de elegir uno.

| Fuente | Pregunta tipo | Acceso | Condiciones |
| --- | --- | --- | --- |
| [Wikipedia](https://www.mediawiki.org/wiki/API:REST_API/Reference) | Contexto de una persona, obra o lugar | REST `search/page` y Action API con `origin=*`; CORS | 200/min con User-Agent identificable. Texto CC BY-SA con enlace. |
| [Wikidata](https://www.mediawiki.org/wiki/Wikibase/API) | Identidad `Q…` entre idiomas e IDs externos (TMDB, MusicBrainz, Open Library…) | `wbgetentities`; CORS | Datos CC0. Preferir entidades por ID a SPARQL amplio. |
| [TMDB](https://developer.themoviedb.org/) | Reparto y equipo de una película o serie; dónde verla en España | Clave en `.env` (`TMDB_*`); CORS | Watch Providers viene de JustWatch y exige atribuirlo. |
| [TVmaze](https://www.tvmaze.com/api) | Series, episodios, reparto | Sin clave; CORS | CC BY-SA; unas 20 llamadas/10 s/IP. Correspondencia con TMDB por IMDb. |
| [Open Library](https://openlibrary.org/developers/api) | Autor, año y ediciones de un libro | Sin clave; CORS | Metadatos CC0; 1–3 peticiones/s; no como backend masivo. Distingue obra y edición. |
| [Google Books](https://developers.google.com/books/docs/v1/using) | Ficha por ISBN y vista previa | Requiere clave | Disponibilidad por país. Alternativa a Open Library. |
| [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) | Discografía, grabaciones y obras de un artista | Sin clave; CORS | 1 petición/s por aplicación; uso no comercial. |
| [setlist.fm](https://api.setlist.fm/docs/1.0/index.html), [Last.fm](https://www.last.fm/api) | Repertorio de un concierto; artistas similares | Clave | Por MBID; no comercial o con contacto. |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Machine-readable_data) | Imagen con autor y licencia | Sin clave; CORS | Licencia por archivo. |
| [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/), [OpenAlex](https://help.openalex.org/) | Publicación detrás de un DOI | Sin clave; CORS | OpenAlex reutiliza Crossref: no es doble confirmación. |
| [Apple Search](https://performance-partners.apple.com/resources/documentation/itunes-store-web-service-search-api/), [Podcast Index](https://podcastindex-org.github.io/docs-api/) | Buscar un pódcast y su feed | Apple: sin clave, CORS. Podcast Index: clave y firma desde servidor | Apple: unas 20/min. |
| ESPN Site API | Resultado de un partido o clasificación | Sin clave, por el worker | Caducidad corta mientras se juega y larga al terminar. |
| Otras | Europeana, IGDB, Open Food Facts, Overpass, calidad del aire de Open-Meteo, búsqueda web (Brave, Tavily) | Clave u otras condiciones | Por decidir según las consultas que se quieran ofrecer. Nominatim público no sirve como dependencia automática. |

### Candidatas de datos.gob.es (aplazadas)

Cribado por títulos del 27/10/2026, sin comprobar endpoints. Aplazadas: no
compensa mantener un conector por red autonómica para preguntas poco
frecuentes. Si se retoman, datos.gob.es sirve para descubrir y registrar la
distribución, no para consultarlo en cada petición, y la respuesta distingue
fecha del dato, de consulta y vigencia.

| Familia | Ejemplos | Nota |
| --- | --- | --- |
| Calidad del aire, polen | C. de Madrid (día en curso), Cataluña, Galicia, Navarra, Euskadi, GVA | Mosaico por comunidad. Para una respuesta general basta Open-Meteo (predicción, toda España) |
| Meteorología y avisos | MeteoGalicia (mareas, marítima), Euskadi, Tenerife | El tiempo ya está en `workers/deno-buscar` con AEMET |
| Playas | Cataluña «información inmediata», Murcia, Bizkaia | Bandera azul anual no es estado actual |
| Farmacias de guardia | Navarra | Un directorio de farmacias no da guardias |
| Recarga eléctrica | Cataluña, Barcelona (estado en tiempo real) | Ubicación no implica disponibilidad |
| Carreteras e incidencias | Navarra, Tenerife, Lorca | Un corte publicado no sigue necesariamente activo |
| Transporte | GTFS de EMT, Bizkaibus, guaguas de Tenerife, Navarra; bici de Vitoria | Horarios previstos frente a tiempo real |
| Agua | Embalses (C. de Madrid, Cataluña), ríos y SAIH (Galicia, Navarra) | Por estación identificada |

### Catálogos de lugares

Museos, teatros, bibliotecas, instalaciones deportivas y oficinas de turismo
de comunidades y ayuntamientos (Castilla y León, Castilla-La Mancha, Galicia,
Euskadi, Murcia, Madrid, Barcelona, Vigo, Zaragoza, Cáceres, Tenerife…)
pueden completar dirección, coordenadas, contacto y accesibilidad de los
recintos de la agenda. La unión exige el mismo identificador o una
correspondencia revisada; nombre, dirección o proximidad solo proponen
candidatos. Prioridad: los que comparten identificador con fuentes ya
integradas.
