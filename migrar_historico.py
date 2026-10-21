"""Migración del histórico de R2 a Turso: retirada.

Se usó una vez para pasar a Turso los días que había en R2. Ya no aplica:
R2 guarda ahora los días antiguos solo como ficheros por medio
(d-<dominio>-<fecha>.json, ver inventario.json) y Turso recibe las
noticias nuevas de los medios nacionales en cada run del recolector.

Si hace falta volver a cargar algo de R2 en Turso, hay que desarrollarlo
de nuevo sobre ese formato.
"""
