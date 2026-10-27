"""Consulta local de límites municipales GeoJSON; sin red ni asignación por cercanía."""

from math import cos, hypot, isfinite, radians

from . import cargar


def _punto(valor):
    if (not isinstance(valor, (list, tuple)) or len(valor) != 2
            or any(type(v) not in (int, float) or not isfinite(v) for v in valor)
            or not -180 <= valor[0] <= 180 or not -90 <= valor[1] <= 90):
        raise ValueError('Punto geográfico inválido: se requiere longitud, latitud')
    return tuple(valor)


def _anillo(puntos):
    if not isinstance(puntos, list) or len(puntos) < 4:
        raise ValueError('Anillo municipal incompleto')
    puntos = [_punto(p) for p in puntos]
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(puntos, puntos[1:]))
    if puntos[0] != puntos[-1] or len(set(puntos)) < 3 or not area:
        raise ValueError('Anillo municipal sin cerrar o degenerado')
    return puntos


def _dentro(punto, anillo):
    x, y = punto
    dentro = False
    for (ax, ay), (bx, by) in zip(anillo, anillo[1:]):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            dentro = not dentro
    return dentro


def _distancia(punto, anillo):
    # Proyección local para el margen de revisión (metros), no para decidir
    # pertenencia: esa se comprueba contra el polígono original sin simplificar.
    x, y = punto
    sx, sy = 111_195 * cos(radians(y)), 111_195
    menor = float('inf')
    for a, b in zip(anillo, anillo[1:]):
        ax, ay = (a[0] - x) * sx, (a[1] - y) * sy
        bx, by = (b[0] - x) * sx, (b[1] - y) * sy
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) if dx or dy else 0
        menor = min(menor, hypot(ax + t * dx, ay + t * dy))
    return menor


class LimitesMunicipales:
    """Recintos normalizados con `properties.ine` de cinco cifras.

    Solo admite GeoJSON lon/lat (RFC 7946), Polygon y MultiPolygon. La fuente
    acredita el código; el lector de su catálogo lo normaliza antes de entrar.
    Los huecos, islas y recintos separados conservan su geometría original.
    """

    def __init__(self, datos, margen_m=50):
        if (datos.get('type') != 'FeatureCollection' or 'crs' in datos
                or not isinstance(datos.get('features'), list)
                or type(margen_m) not in (int, float) or not isfinite(margen_m) or margen_m < 1):
            raise ValueError('Límites municipales incompatibles')
        self.margen_m, self.recintos = margen_m, []
        catalogo = cargar()
        for i, f in enumerate(datos['features']):
            codigo = f.get('properties', {}).get('ine')
            if not isinstance(codigo, str) or not catalogo.resolver('ine:municipio', codigo):
                raise ValueError('Recinto sin municipio INE acreditado')
            g = f.get('geometry') or {}
            if g.get('type') not in ('Polygon', 'MultiPolygon'):
                raise ValueError('Geometría municipal no soportada')
            poligonos = [g.get('coordinates')] if g['type'] == 'Polygon' else g.get('coordinates')
            if not isinstance(poligonos, list) or not poligonos:
                raise ValueError('Recinto municipal vacío')
            for poligono in poligonos:
                if not isinstance(poligono, list) or not poligono:
                    raise ValueError('Polígono municipal vacío')
                anillos = [_anillo(a) for a in poligono]
                exterior = anillos[0]
                caja = (min(p[0] for p in exterior), min(p[1] for p in exterior),
                        max(p[0] for p in exterior), max(p[1] for p in exterior))
                self.recintos.append((codigo, i, caja, anillos))

    def resolver(self, longitud, latitud):
        punto = _punto([longitud, latitud])
        candidatos, cercanos = {}, set()
        # El margen también alcanza un recinto contiguo fuera de la caja.
        mx = self.margen_m / max(1, 111_195 * cos(radians(latitud)))
        my = self.margen_m / 111_195
        for codigo, indice, (x0, y0, x1, y1), anillos in self.recintos:
            if not x0 - mx <= longitud <= x1 + mx or not y0 - my <= latitud <= y1 + my:
                continue
            distancia = min(_distancia(punto, a) for a in anillos)
            if distancia <= self.margen_m:
                cercanos.add(codigo)
            if _dentro(punto, anillos[0]) and not any(_dentro(punto, a) for a in anillos[1:]):
                candidatos.setdefault(codigo, []).append(indice)
        # Solo otro municipio a menos del margen hace dudar: la costa o una
        # frontera sin recintos cartografiados no ofrecen otro destino.
        cerca = bool(cercanos - candidatos.keys()) or not candidatos and bool(cercanos)
        estado = 'conflicto' if len(candidatos) > 1 else 'pendiente' if cerca or not candidatos else 'resuelto'
        return {'estado': estado, 'territorio': 'es:municipio:' + next(iter(candidatos)) if estado == 'resuelto' else None,
                'candidatos': sorted(candidatos), 'recintos': candidatos, 'cercanos': sorted(cercanos),
                'motivo': 'recintos_solapados' if len(candidatos) > 1 else 'cerca_del_limite' if cerca
                    else 'punto_en_recinto_municipal' if candidatos else 'fuera_de_cobertura',
                'margen_revision_m': self.margen_m}
