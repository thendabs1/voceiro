# Adaptadores de agenda deportiva

Implementación del diseño del 26/10/2026. Las doce colecciones se importan en el
mismo núcleo que cultura. No activa horarios automáticos, selección pública,
escrituras remotas o cliente; las llamadas de red siguen siendo explícitas.

## Entradas

| Colecciones | Adaptador | Entrada |
| --- | --- | --- |
| `espn-atp`, `espn-wta` | `espn_tenis.importar_agenda` | Site API; torneos, sin recorrer partidos. |
| `espn-primera`, `espn-segunda` | `espn_futbol.importar` | Site API; partidos y equipos mínimos. |
| `espn-nba`, `espn-wnba` | `espn_baloncesto.importar` | Site API; partidos, temporada y fase. |
| `feb-endesa`, `feb-primera`, `feb-challenge` | `feb.importar_agenda` | Extracción FEB; el lector HTML tiene `solo_agenda=True`. |
| `espn-f1` | `espn_f1.importar` | Site API; GP principal y sesiones. Alternativa sin conciliar con Vidmar. |
| `motogp` | `motogp.importar` | Calendario oficial por temporada o detalle de GP; solo categoría MotoGP. |
| `ocblacktop-wrc` | `blacktop.importar` | Temporada WRC; rallies, sin tramos. |

`deportes.importar` despacha por colección; `deportes.recoger` selecciona el
transporte. `espn.py` comparte rutas, validación de liga, fecha explícita y
ayudantes de partidos. `deporte.py` construye documentos por entidad con una
extracción de agenda; no copia scoreboards, HTML, marcadores o perfiles.

Ejemplo local, sin red ni base previa:

```sh
python calendario.py --db /tmp/agenda-deportes.sqlite \
  --entrada-deporte espn-primera=/ruta/primera.json \
  --entrada-deporte motogp=/ruta/motogp.json \
  --exportar-nucleo --salida /tmp/nucleo-deportes.json
```

Recogidas explícitas sobre una base elegida:

```sh
python calendario.py --db /tmp/agenda-deportes.sqlite \
  --recoger-deporte espn-nba --fecha-deporte 2026-11-01
python calendario.py --db /tmp/agenda-deportes.sqlite \
  --recoger-deporte feb-endesa --temporada-deporte 2026
python calendario.py --db /tmp/agenda-deportes.sqlite \
  --recoger-deporte ocblacktop-wrc --temporada-deporte 2026
```

OCB requiere `OCBLACKTOP_API_KEY` en el entorno del servidor; no se añade al
front, URL ni documentos. Una llamada recoge la temporada WRC solicitada.
Las consultas ESPN son de un día por colección; no acreditan toda una temporada.
No hay reintentos, recorrido de perfiles, históricos ni ampliación automática.

`--entrada-feb`, `--entrada-tenis` y la recogida manual anterior de FEB/tenis
usan ahora agenda. Las funciones antiguas `feb.importar` y `espn_tenis.importar`
siguen disponibles para investigación y sus muestras históricas. La marca de
fuente `agenda_deportiva` limita la nueva proyección a las extracciones de agenda:
no vuelve a publicar partidos/resultados antiguos de esa fuente por reutilizarla.
Los originales y resultados previamente guardados permanecen en el núcleo.

## Tiempo y lectura

Cambiar fecha/hora conserva la referencia. Repetir campos de agenda conserva
documentos y observaciones, actualizando solo su comprobación; reloj, tanteo,
ganador o clasificación no intervienen en sus huellas. Si FEB deja de dar una
fecha de partido ya conocida, se conserva la programación anterior; eso no
demuestra que el proveedor haya vuelto a confirmar ese horario.

Tenis publica días solo cuando son fechas civiles explícitas o coinciden los
límites del torneo y su calendario con zona declarada. Sin esa evidencia queda
pendiente. No se deriva el intervalo desde partidos. MotoGP usa offsets de
sesión y deja desconocido el fin igual al inicio. Los GP y rallies usan sus
límites de calendario como días, sin atribuir una hora de apertura o cierre.

Los GP mantienen agrupación, cita principal y sesiones con identidades distintas.
`publicacion.proyectar` incluye las sesiones en `programa` y deja una tarjeta
principal. Agrega sus objetivos antes de preparar texto/facetas/paginación de la
lectura SQL; buscar una sesión permite encontrar su GP. El programa conserva
ID, horario y procedencia de cada sesión. Esto no conecta ni reactiva la UI.

Pendientes operativos: elección y correspondencias de fuente F1; cobertura por
colección/ventana; presupuesto y registro de cuotas; actualización incremental
de la proyección; retención y cliente API. El GET satisfactorio de un proveedor
no resuelve esas tareas ni acredita cobertura completa.

## Verificación

Las pruebas se ejecutaron después de implementar todos los adaptadores, según
lo solicitado. Pasan 19 pruebas nuevas con las doce colecciones, las 86 pruebas
existentes de calendario y tres archivos JavaScript de agenda/buscador/Worker.
Incluyen SQLite nuevo y reapertura, rollback, convivencia con cultura, búsqueda
de sesiones sobre la proyección SQL, identidad ante cambios de fecha, cambio de
hora estacional en tenis y ausencia de historial por cambios solo deportivos.
Las comprobaciones de generación y sincronización de workers también pasan.
La suite completa corresponde a CI.

Sondeo acotado desde servidor, sin escribir en Turso ni publicar:

| Colección | Respuesta comprobada e importación |
| --- | --- |
| FEB LF Endesa | Dos GET: 240 partidos, cero resultados/tablas. |
| FEB Primera | Dos GET: 306 partidos, cero resultados/tablas. |
| FEB Challenge | Dos GET: 240 partidos, cero resultados/tablas. |
| MotoGP 2026 | Un GET de temporada: 22 GP y 176 sesiones MotoGP; 22 tarjetas con programa, cero resultados/tablas. |
| OCB WRC 2026 | Un GET autenticado: 14 rallies, cero resultados/tablas. La clave no se imprime ni persiste. |
| ESPN | El sondeo actual por fecha devolvió 403; un intento adicional de Primera falló en DNS. No se atribuye a CORS ni se certifica acceso operativo. |

Se reutilizaron además respuestas completas retenidas de ESPN: dos torneos ATP,
cinco WTA, un torneo ATP futuro, cuatro partidos de Primera, cuatro NBA y un GP
F1 con cinco sesiones, tanto futuro como terminado. Todas se importan y proyectan
sin resultados ni clasificaciones. Segunda y WNBA tienen contratos sintéticos
explícitos en los tests: su respuesta real sigue sin contrastar. Véase la
[procedencia de las muestras](../tests/fuentes/muestras_calendario/deportes/README.md).

La prueba de red detectó y permitió corregir el tratamiento de direcciones
literales de MotoGP. Se retiró el parámetro ESPN `limit`, que no estaba
contrastado; los errores 403 persistieron con la ruta por fecha. No se añadieron
proxies, credenciales, reintentos automáticos ni sustituciones de fuente.
