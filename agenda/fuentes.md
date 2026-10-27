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
| [Vidmar F1](https://f1.vidmar.net/) | F1 (piloto) | ICS completo | Republicación sin verificar; no se publica | 128 sesiones; UID con nombres; alarmas que no son citas. |
| ESPN Site API | ATP, NBA, WNBA; contraste de WTA, LaLiga y F1 | JSON sin clave, no documentado | Sin autorización de republicación acreditada | Una consulta por día y liga; los intervalos de fechas dan 400. `leagues[].calendar` sirve para planificar, no es la lista de citas. |
| WTA oficial (`api.wtatennis.com`) | WTA | JSON público de su web | Sin licencia publicada | Principal de WTA. |
| LaLiga oficial (`laliga.com`) | Primera y Segunda | HTML con datos de la web | Sin licencia publicada | Principal de fútbol. |
| F1 oficial (`api.formula1.com`) | F1 | API de la web con su clave pública de configuración | Sin licencia publicada | Principal de F1. Si cambia la web, se rompe la lectura de la clave. |
| [FEB](https://baloncestoenvivo.feb.es/) | LF Endesa (4), Primera FEB (1), LF Challenge (67) | HTML; dos páginas por liga y pasada | Derechos reservados; sin robots.txt | Sin pabellón acreditado; hora local sin zona. El calendario sustituye horarios por marcadores en partidos jugados. |
| [MotoGP oficial](https://www.motogp.com/en/calendar/2026) (`api.pulselive.motogp.com`) | MotoGP | JSON sin clave | Sin licencia publicada | GP y sesiones `type=SESSION` de la categoría MotoGP; `show_in_calendar=false` no cancela. |
| [OCBlacktop](https://ocblacktop.com/api) | WRC | `x-api-key` desde servidor | Free: 7.500/mes, 60/min, no comercial; incluso un 400 consume | `/v1/wrc/seasons/{año}`: temporada completa en una petición. Tiene F1 y MotoGP con UUID propios. |

## Agenda: candidatas

| Fuente | Qué aportaría | Situación |
| --- | --- | --- |
| [Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) | Conciertos y eventos con entrada en toda España; artistas y recintos con ID | Medido el 27/10: 8.840 eventos en ES (1.245 de artes escénicas); recinto con ID y coordenadas, zona y `status` (cancelado, aplazado). Sus términos permiten caché por «periodos razonables» para dar el servicio y retirar en 24 h si lo pide el titular; un índice propio exige el Discovery Feed de socios. Uso: consulta en vivo con caché, sin guardarlo en la base. Clave en `.env` (`TICKETMASTER_CONSUMER_KEY`); 5.000/día. |
| [Agenda cultural de Cataluña](https://analisi.transparenciacatalunya.cat/d/rhpv-yr4f) | Cultura, Cataluña | Socrata/SoQL sin clave. Medido el 27/10: 1.050 filas hasta fin de año. `codi` es la actividad y hay una fila por espacio: (`codi`, `espai`) casi única (1 choque). Fechas siempre a medianoche, horario en texto; municipio como ruta propia (`agenda:ubicacions/…`) y coordenadas. Incluye contenedores mensuales («Octubre al Palau Sant Jordi»). |
| [Castilla y León](https://datos.gob.es/es/catalogo/a07002862-relacion-de-eventos-de-la-agenda-cultural-categorizados-y-geolocalizados) | Cultura, Castilla y León | **Integrada** (`agenda/cyl.py`). Opendatasoft sin clave, export completo en una petición; CC BY 4.0. Medido el 27/10: 555 filas en 142 localidades. `id_evento` es la obra: una fila por fecha (hasta 16), así que la función es (`id_evento`, `fecha_inicio`). Coordenadas en todas; `id_localidad` propio, no INE; horas en formatos mezclados («10:00», «19:30 h.»). |
| [Zaragoza](https://www.zaragoza.es/web/espacio-de-datos/servicio/catalogo/282) | Cultura y actividades municipales | REST JSON, `rows` ≤ 500; 2.810 eventos. `id` de obra con funciones en `subEvent` (ID propio, recinto con ID y sesiones con hora); `lastUpdated`; geometría en UTM. Mezcla actividades no culturales (juventud, cursos). |
| [Málaga](https://datos.gob.es/es/catalogo/l01290672-agenda-2026) | Agenda municipal | CSV anual; CC BY-SA 4.0. Medido el 27/10: 1.205 filas, `ID_EVENTO` (132) agrupa `ID_ACTIVIDAD` (766, repetidas por fecha); sin programación más allá del 31/10. |
| [Bilbao](https://datos.gob.es/es/catalogo/l01480209-agenda-municipal-de-bilbao) | Agenda municipal | JSON con caracteres de control (requiere lector tolerante); 18 eventos, sin coordenadas, mezcla actos municipales. Poco útil frente a Kulturklik. |
| [IVC](https://datos.gob.es/es/catalogo/a10002983-agenda-cultural-del-institut-valencia-de-cultura-ivc) | Espacios del Institut Valencià de Cultura | JSON roto en pares clave–valor; 1.022 registros (172 futuros) sin ID: la URL no es única. Cancelaciones en el título. No integrable sin identidad. |
| Murcia (`regmurcia.com/eventos.json`) | Agenda regional | Responde 200 sin contenido (27/10). |
| Sin probar (solo catálogo) | Otras agendas | Con descarga anunciada: L'Hospitalet (Socrata), Gijón, Terrassa, Vitoria (RSS), Vigo («agenda de hoy»), Cartagena, Diputación de Barcelona (escenarios, bibliotecas, museos) y Bizkaia. Solo web: Andalucía, Castilla-La Mancha, Asturias, Baleares, Cantabria, Navarra, La Rioja. Barcelona ciudad declara fin de cobertura en 11/2025; Canarias y Santa Cruz, metadatos de 2019–2025. |
| Portales CKAN y [datos.gob.es](https://datos.gob.es/) | Agendas de otras comunidades y ayuntamientos | Por explorar con los lectores por formato (ICS, JSON-LD, RSS). |
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
