# Muestras reales de motor

Recogidas el 6/11/2026 con el User-Agent del worker, sin clave, Origin ni correo.
Cliente de servidor normal; peticiones secuenciales separadas al menos 2,1 segundos.
Los JSON conservan los valores recibidos: se han eliminado campos y filas, sin
corregir nombres, posiciones ni tiempos. Las pruebas los leen sin acceder a red.

OpenF1, base `https://api.openf1.org/v1`:

- `openf1-sesiones.json`: `/sessions?year=2026`. México (1298), cancelado
  (1282), GP con metadatos discordantes (1308), pruebas (1304) y sesión
  futura 11436. Campos de identidad, sesión, fecha y cancelación.
- `openf1-gp.json`: `/meetings?year=2026`, esos mismos GP; nombre e identidad.
- `openf1-race.json`: `/session_result?session_key=11404`. Dos primeras filas
  y primera con `dnf:true`; sin modificar los null.
- `openf1-qualifying.json`: `/session_result?session_key=11400`. Dos primeras
  y dos últimas filas; arrays de las tres tandas con sus huecos.
- `openf1-pilotos-race.json` y `openf1-pilotos-qualifying.json`:
  `/drivers?session_key=11404` y `11400`; pilotos de esas filas, nombres,
  equipos y claves. No unir por nombre ni suponer qué dorsal lleva un piloto.

También se consultó `/drivers?session_key=11397` (200, no se usa como muestra
porque corresponde a otra sesión). `/session_result?session_key=11436` devolvió
404: no había resultado para esa sesión futura. No se repitió esa petición.

MotoGP, base `https://api.pulselive.motogp.com/motogp/v1/results`:

- `motogp-temporadas.json`: `/seasons`, primeras dos temporadas.
- `motogp-categorias.json`: `/categories?seasonUuid=e88b4e43-2209-47aa-8e83-0e0b1cedde6e`.
- `motogp-eventos.json`: `/events?seasonUuid=e88b4e43-2209-47aa-8e83-0e0b1cedde6e&isFinished=true`;
  Malasia y una prueba de 2026, identidad, fechas, estado y puente al calendario.
- `motogp-sesiones.json`: `/sessions?eventUuid=ea2ba334-b943-462f-aedb-084ac38408d1&categoryUuid=e8c110ad-64aa-4e8e-8a86-f2f152f6a942`;
  las ocho sesiones, sin documentos ni condiciones meteorológicas.
- `motogp-carrera.json`: `/session/f8adeb74-3941-43e1-91cd-e1883f341ded/classification?test=false`;
  dos primeras filas y dos `OUTSTND`, más los campos `file` y `files` para
  verificar que no se reenvían como parte de la ficha.

Total de comprobación: 8 GET a OpenF1 (7 respuestas 200 y una 404), 5 GET a
MotoGP (todas 200). Sin 403 ni 429. No se probaron sesiones de pago/en directo,
ni se repitió el contraste contra los calendarios oficiales aportado por el usuario.
El puente de sprint F1 sigue sin contrastar contra el calendario oficial.

Licencias/atribución: [OpenF1](https://openf1.org/) declara CC BY-NC-SA 4.0,
30 peticiones/minuto y la ventana de pago desde 30 minutos antes del inicio
hasta 30 minutos después del final. MotoGP conserva la atribución y el enlace
a sus [condiciones](https://www.motogp.com/en/legal-notice); no se declara una
licencia abierta que la fuente no ofrece.
