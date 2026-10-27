"""Fuentes culturales con recogida completa: declaración única para CLI, recogida e inventario.

Cada módulo declara FUENTE, FAMILIA (agenda/familias.py), URL_RECOGIDA,
CAMPO_ID (identidad en la respuesta), TIPO_EXTERNO (referencia del núcleo),
FECHAS (inicio y fin para la ventana) e importar(anterior, filas, observado, url).
"""

from . import kulturklik, madrid

CULTURA = {m.FUENTE: m for m in (madrid, kulturklik)}
