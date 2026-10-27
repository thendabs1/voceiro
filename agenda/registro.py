"""Fuentes culturales con recogida completa: declaración única para CLI, recogida e inventario.

Cada módulo declara FUENTE, FAMILIA (agenda/familias.py), URL_RECOGIDA,
CAMPO_ID (identidad en la respuesta, campo o función), TIPO_EXTERNO (referencia del núcleo),
FECHAS (inicio y fin para la ventana) e importar(anterior, filas, observado, url).
Opcional: inventario(filas) cuando la presencia se acredita por otra identidad
(Zaragoza: funciones dentro de cada obra); obra(id) cuando la identidad de
función incluye la fecha (CyL), para actualizar fuera de la ventana las filas
de una obra conocida.
"""

from . import cyl, kulturklik, madrid, zaragoza

CULTURA = {m.FUENTE: m for m in (madrid, kulturklik, zaragoza, cyl)}
