# Baloncesto FEB: contraste acotado — 25/10/2026

Lote acotado para revisar el modelo Voceiro (calendario común) contra la web
oficial de la Federación Española de Baloncesto (`baloncestoenvivo.feb.es`).
Sin adaptador ni recogida periódica. Se hicieron 11 consultas GET lógicas
con timeout de 20 s, algunas con redirección adicional, sin eludir bloqueos.
La página de calendario sí incluye las 30 jornadas de LF Endesa; no se
recorrieron todas sus fichas ni fases. Las respuestas fueron 200/301/404.
Evidencia recortada (36 KB) en
`/tmp/voceiro-agenda-feb/`, con el detalle de cada petición en `00-RESUMEN.txt`
y muestras literales recortadas de cada página. No se trabajó FotMob ni otros
proveedores de fútbol, ni OpenF1/Jolpica.

## Peticiones y respuestas

| # | URL | HTTP | Resultado |
| --- | --- | --- | --- |
| 01 | `calendario.aspx?g=4&t=2026` | 301 | Redirige a `/calendario/4/2026` |
| 02 | `resultados.aspx?g=4&t=2026` | 301 | Redirige a `/resultados/4/2026` |
| 03 | `/calendario/4/2026` | 200 | 418 KB; LF ENDESA 2026/2027, 30 jornadas |
| 04 | `/resultados/4/2026` | 200 | 82 KB; última jornada + clasificación + próxima |
| 05 | `Partido.aspx?p=2522807` | 301 | Redirige a `/partido/2522807` |
| 06 | `/avisoLegal.html` | 200 | Aviso legal (LSSI, propiedad intelectual) |
| 07 | `/robots.txt` | 404 | No existe robots.txt en el host |
| 08 | `/partido/2522807` | 200 | Ficha completa de partido finalizado |
| 09 | `calendario.aspx?g=21&t=2025` | 200 (tras 301) | C. España Clubes Junior Masc., selector de fases |
| 10 | `/calendariofeb.aspx` | 200 | Calendario general con filtros (categoría, equipo, fecha, pabellón) |
| 11 | `Partido.aspx?p=2522809` | 200 (tras 301) | Ficha de partido pendiente (hoy 18:30) |

Las rutas `.aspx` clásicas **siguen existiendo pero redirigen (301)** a rutas
limpias (`/calendario/{g}/{t}`, `/partido/{p}`). Conservar la redirección como
referencia canónica declarada por la propia fuente; las dos formas resuelven.

## Qué acredita la fuente sobre `g` y `t`

- **`g` identifica la competición.** El menú de la propia página enlaza
  `resultados.aspx?g=4&t=2026&nm=lfendesa` bajo el rótulo «LF ENDESA»,
  `g=1` «PRIMERA FEB», `g=2` «SEGUNDA FEB», `g=3` «TERCERA FEB», `g=9` «L.F.-2»,
  `g=67` «LF CHALLENGE», `g=74` «LIGA U», `g=73` «COPA ESPAÑA» y los campeonatos
  de España (`g=19..72` con `t=2025`). `nm` es un slug decorativo: la página se
  resuelve igual sin él. (Comprobado en HTML; evidencia
  `muestra-menu-competiciones.txt`.) La etimología de la letra «g» no consta;
  no se afirma.
- **`t` identifica la temporada por su año de inicio.** El selector de la página
  muestra `value="2026" → «2026/2027»` … hasta `value="1997" → «1997/1998»`.
  (Comprobado en el propio formulario.) Un `t=2026` cubre por tanto octubre de
  2026 a abril de 2027: **no se puede inferir la temporada del año natural de
  celebración**; la referencia de temporada debe viajar con el grupo.
- Existe además **`f` para fase/grupo**: el selector de fases del C. España de
  Clubes Junior (`g=21`, `t=2025`) lista `89481 → «PRIMERA FASE A»` …
  `89488 → «PRIMERA FASE H»` y `89493..89495 → «3º-4º», «5º-6º», «7º-8º»`; en LF
  Endesa el selector solo contiene `89975 → «Liga Regular Único»` (texto literal
  del sitio). La página de LF Endesa enlaza también `Series.aspx?f=45080` con
  el texto «Supercopa». (Comprobado; `muestra-ce-junior-fases-g21-t2025.txt`.)

## Identificadores explícitos observados

| Entidad | Forma | Ejemplo comprobado |
| --- | --- | --- |
| Partido | `Partido.aspx?p={n}` → `/partido/{n}` | `p=2522807` (final), `p=2522809` (pendiente) |
| Equipo | `Equipo.aspx?i={n}` | `i=1008705` AZULMARINO MALLORCA PALMA, `i=1008686` VALENCIA B.C. |
| Competición | `g` | `g=4` LF Endesa, `g=21` C.E. Clubes Junior Masc. |
| Temporada | `t` | `t=2026` → «2026/2027» |
| Fase/grupo | `f` (selector y `Series.aspx?f=`) | `f=89481..89488` (grupos A–H), `f=45080` (Supercopa) |

Todos son **numéricos y literales en la URL**, encajan con la regla común
«fuente estable + ID literal». Además, el calendario de LF Endesa **ya tiene
asignados los `p` de las 30 jornadas** (240 partidos enlazados, incluidas las
jornadas futuras): el ID de partido existe antes de jugarse, lo que permite
observar un encuentro desde su anuncio hasta su acta final. Estabilidad a largo
plazo no demostrada: son observaciones de un día; pendiente comprobar si un
partido aplazado conserva su `p`.

## Estado y marcador: pendiente vs final

Comprobado con tres señales distintas (`muestra-resultados-lfendesa.txt`,
`muestra-partido-pendiente-2522809.txt`):

- En **resultados**, la celda del partido pendiente muestra literalmente
  `*-*`; la del jugado, `67-69`. En la Jornada 5 (24/10/2026) convivían 5
  finales y 3 `*-*` (los del 25/10 por la tarde).
- En **calendario**, los partidos futuros no tienen marcador: la celda es
  `class="fecha"` con «SÁBADO 31/10/2026 19:00» (día de semana + fecha + hora).
- En la **ficha del partido pendiente** (`p=2522809`) el marcador aparece
  `0 - 0` **sin cuartos** y con un aviso de información provisional sujeta a
  cambios o correcciones de la FEB.
  **Consecuencia para el modelo: un 0-0 de ficha no es un resultado** —igual
  que los ceros de ESPN en el contraste de fútbol—; la señal de estado hay que
  contrastarla entre vistas. La ausencia de cuartos o un aviso genérico por
  sí solos tampoco acreditan un estado deportivo.
- La ficha final (`p=2522807`) sí muestra los cuatro cuartos
  (19/25, 18/12, 19/16, 11/16) y el acta completa. No se ha visto un campo
  explícito tipo «FINAL»/«estado»: la condición de terminado es **inferencia**
  a partir de cuartos presentes y marcador no `*-*`; pendiente si la fuente
  declara estado en directo/aplazado en otras vistas (la pestaña «Directo» del
  menú aparece también en fichas ya jugadas, no es señal de estado).

## Horas: precisión y zona

- Formato comprobado: `24/10/2026 - 17:00` en ficha y resultados;
  «SÁBADO 31/10/2026 19:00» en calendario. El literal tiene precisión de minuto,
  pero no acredita todavía un instante con zona.
- **No se declara zona horaria** en ninguna de las páginas revisadas
  (comprobado en las tres vistas). Que sea hora local peninsular/Balear
  (CET/CEST) es **inferencia razonable, pendiente de acreditar**; con sedes en
  Canarias la conversión no es trivial. Regla para el modelo: conservar el
  literal y marcar zona desconocida, no fabricar UTC.

## Venue y municipio vs sede del club

La ficha del partido declara la pista **del encuentro**:
`Pista | POLIESPORTIU SON MOIX | Palma de Mallorca (Illes Balears)`
(final, Mallorca) y `Pavelló Municipal Girona Fontajau | Girona (Girona)`
(pendiente, Girona). Es decir, **pabellón + municipio + (provincia/comunidad)
por partido**, con el mismo encaje territorial que ya exige el modelo: el
lugar de celebración no se deduce de la ficha del club. En las dos muestras el
municipio coincide con la sede del local; queda **pendiente** un ejemplo de
sede neutral (copas/fases finales) para no generalizar. No se observó ID
estable de pabellón (solo texto), salvo el filtro `filtroPabellon` de
`calendariofeb.aspx`, cuyas opciones se cargan por JavaScript (no descargado).

## Clasificación como instantánea independiente

La página de resultados incrusta un bloque «Clasificación» con columnas
`Po | Equipo | PJ | PG | PP | PF | PC | DIF | % | R` (muestra: 1.º CASADEMONT
ZARAGOZA 4 PJ/4 PG; 2.º AZULMARINO MALLORCA PALMA 5 PJ…, observado el
25/10/2026). Encaja con lo previsto en persistencia: **instantánea por fuente +
competición + temporada + fase/grupo + fecha de observación**, no un evento ni
un resultado de sesión. La página no declara jornada de corte explícita de la
tabla (va junto a «Resultados Jornada 5»); conservar la fecha de observación
propia, no la jornada, como ámbito temporal. Existe además una sección
«Rankings» en el menú (no visitada; pendiente saber si difiere de la tabla).

## Liga femenina y competición de fases/grupos

- **Liga femenina: comprobado.** `g=4` es LF Endesa (máxima categoría
  femenina) y el propio menú documenta también L.F.-2 (`g=9`) y LF Challenge
  (`g=67`). Las muestras de este informe son de LF Endesa 2026/2027.
- **Fases/grupos: comprobado.** El C. España de Clubes Junior Masc. (`g=21`,
  `t=2025`) ofrece un selector con «PRIMERA FASE A»…«H» (8 grupos con IDs
  `f=89481..89488`) y fases de clasificación final («3º-4º»…). La vista por
  defecto muestra «Jornada 1 02/05/2026». Encaja con «competición/temporada/
  fase son grupos tipados con relaciones explícitas», conservando ambos IDs
  (`g` y `f`) como ya se previno con `primaryId` en fútbol.

## Condiciones de uso (fuente primaria)

Comprobado en [el aviso legal](https://baloncestoenvivo.feb.es/avisoLegal.html) del propio host
(`muestra-avisolegal.txt`):

- Titular: Federación Española de Baloncesto. Se reserva los derechos y
  restringe reproducción, distribución y comunicación pública con fines
  comerciales sin autorización; también limita el uso comercial del portal.
- No hay robots.txt (404) ni cabeceras de API; las páginas son HTML ASP.NET
  con ViewState (sin JSON público observado).

**No se ha localizado una licencia abierta.** Que exista una biblioteca de terceros (wehoop)
que lea estos datos **no concede derechos de recogida ni de republicación**:
los términos aplicables deben venir del titular. Queda por aclarar con la FEB
el uso sistemático y la republicación previstos; las restricciones comerciales
del aviso no equivalen a una licencia abierta para el resto de usos.
Mientras tanto, este lote se limita a
comprobación puntual para diseño del modelo. (Constatación de las condiciones
publicadas, no asesoramiento legal.)

## Comprobado / documentado / inferencia / pendiente

- **Comprobado (HTTP + muestra):** redirecciones 301 de `.aspx` a rutas
  limpias; catálogo `g/t/nm` del menú; selector `t=año inicio`; IDs `p`, `i`,
  `g`, `t`, `f` en URL; `*-*` pendiente vs `67-69` final; hora al minuto sin
  zona; pista+municipio por partido; clasificación con sus columnas; aviso de
  provisionalidad; cláusula de derechos reservados; 404 de robots.txt.
- **Documentado por la propia fuente:** correspondencia `g`→competición y
  `t`→«2026/2027» (formularios del sitio); «Liga Regular Único» como única
  fase de LF Endesa; «PRIMERA FASE A–H» en el C.E. Junior.
- **Inferencia (no afirmar):** que la hora sea local española; que un partido
  con cuartos y marcador esté «finalizado»; que `p` sea estable tras
  aplazamientos; que el 0-0 de la ficha pendiente sea siempre «sin jugar».
- **Pendiente:** zona horaria explícita; estado explícito (directo/aplazado/
  suspendido); ejemplo de sede neutral; sección «Rankings»; estabilidad
  histórica de IDs; autorización de la FEB para recogida/republicación.

## Recomendación de utilidad técnica

Técnicamente **muy útil como contraste del modelo**: IDs explícitos y literales
de partido/equipo/competición/temporada/fase, calendario completo de temporada
con IDs preasignados, pendiente/final diferenciados, pista y municipio por
partido, clasificación como instantánea e información provisional. El aviso
genérico no acredita una revisión ni equivale a `dataOrixinal` de Galicia.
Es HTML de presentación
(sin API ni feed): una recogida real exigiría parseo de páginas, paginación por
fase y cadencia propia según estado. **No se propone adaptador ni recogida
mientras no se aclare el uso previsto**; el diseño de persistencia puede contrastarse con estas
muestras guardadas, sin más descargas.

## Verificación local

Solo se creó este informe y la evidencia en `/tmp/voceiro-agenda-feb/`; no se
tocó código. Las 11 consultas lógicas (con redirecciones adicionales) y las
muestras citadas quedan en `00-RESUMEN.txt`. La revisión principal contrastó
las muestras y el aviso legal y corrigió las limitaciones anteriores.
No se ejecutó la suite (cambio exclusivamente documental).
