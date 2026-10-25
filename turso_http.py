"""Valores y transacciones HTTP v2 de libSQL, compartidos con la cosecha.

Cada transacción viaja en un solo batch condicional. Un pipeline de execute
independientes no es atómico: el servidor continúa después de un error.
Protocolo: https://github.com/tursodatabase/libsql/blob/main/docs/HTTP_V2_SPEC.md
"""

import base64
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def argumento(valor):
    if valor is None:
        return {'type': 'null'}
    if isinstance(valor, bool):
        return {'type': 'integer', 'value': str(int(valor))}
    if isinstance(valor, int):
        return {'type': 'integer', 'value': str(valor)}
    if isinstance(valor, float):
        return {'type': 'float', 'value': valor}
    if isinstance(valor, (bytes, bytearray)):
        return {'type': 'blob', 'base64': base64.b64encode(valor).decode()}
    return {'type': 'text', 'value': str(valor)}


def valor(celda):
    if not isinstance(celda, dict):
        return celda
    tipo = celda.get('type')
    if tipo == 'null':
        return None
    if tipo == 'blob':
        return base64.b64decode(celda['base64'])
    dato = celda.get('value')
    if tipo == 'integer':
        return int(dato)
    if tipo == 'float':
        return float(dato)
    return dato


class ErrorTurso(RuntimeError):
    def __init__(self, mensaje, paso=None, codigo=None):
        super().__init__(mensaje)
        self.paso = paso
        self.codigo = codigo


class Cliente:
    MAX_ENVIO = 8_000_000
    MAX_RESPUESTA = 16_000_000

    def __init__(self, url, token):
        url = url.replace('libsql://', 'https://', 1).rstrip('/')
        partes = urlsplit(url)
        if (partes.scheme != 'https' or not partes.hostname or partes.username
                or partes.password or partes.query or partes.fragment or partes.path):
            raise ValueError('Se requiere la URL HTTPS/libsql de la base de calendario')
        if not token:
            raise ValueError('Falta el token de la base de calendario')
        self.url, self.token = url, token
        self.leidas = self.escritas = 0

    def _leer(self, peticion, limite):
        try:
            with urlopen(peticion, timeout=60) as respuesta:
                datos = respuesta.read(limite + 1)
        except HTTPError as error:
            raise ErrorTurso(f'Turso: HTTP {error.code}; comprobar estado antes de repetir') from None
        except (URLError, TimeoutError, OSError):
            raise ErrorTurso('Turso: conexión interrumpida; comprobar estado antes de repetir') from None
        if len(datos) > limite:
            raise ErrorTurso('Respuesta de Turso demasiado grande; comprobar estado antes de repetir')
        return datos

    def dump(self):
        peticion = Request(self.url + '/dump', headers={'Authorization': 'Bearer ' + self.token})
        return self._leer(peticion, 64_000_000).decode('utf-8')

    def transaccion(self, sentencias, escritura=True):
        """Devuelve resultados solo tras confirmar todos los pasos.

        Sin reintento automático: perder la respuesta de COMMIT deja un resultado
        incierto. El llamante debe releer el estado antes de decidir si repite.
        """
        sentencias = list(sentencias)
        operaciones = [('PRAGMA foreign_keys=ON', ()),
                       ('BEGIN IMMEDIATE' if escritura else 'BEGIN', ()),
                       *sentencias, ('COMMIT', ())]
        pasos = []
        for i, (sql, args) in enumerate(operaciones):
            paso = {'stmt': {'sql': sql, 'args': [argumento(a) for a in args]}}
            if i:
                paso['condition'] = {'type': 'ok', 'step': i - 1}
            pasos.append(paso)
        commit = len(pasos) - 1
        pasos.append({'stmt': {'sql': 'ROLLBACK'}, 'condition': {
            'type': 'and', 'conds': [{'type': 'ok', 'step': 1},
                {'type': 'not', 'cond': {'type': 'ok', 'step': commit}}]}})
        cuerpo = json.dumps({'requests': [
            {'type': 'batch', 'batch': {'steps': pasos}}, {'type': 'close'}]},
            ensure_ascii=False).encode()
        if len(cuerpo) > self.MAX_ENVIO:
            raise ErrorTurso('Recogida demasiado grande: reducir su intervalo antes de escribir')
        peticion = Request(self.url + '/v2/pipeline', data=cuerpo, headers={
            'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        datos = self._leer(peticion, self.MAX_RESPUESTA)
        try:
            respuesta = json.loads(datos)
            resultados = respuesta['results']
            if len(resultados) != 2 or any(r['type'] != 'ok' for r in resultados):
                raise ValueError()
            if resultados[0]['response']['type'] != 'batch':
                raise ValueError()
            lote = resultados[0]['response']['result']
            filas, errores = lote['step_results'], lote['step_errors']
            if len(filas) != len(pasos) or len(errores) != len(pasos):
                raise ValueError()
            for i, error in enumerate(errores):
                if error is not None:
                    codigo = error.get('code', 'SQL_ERROR')
                    raise ErrorTurso(f'Turso: {codigo} en paso {i}; transacción rechazada',
                                     paso=i - 2, codigo=codigo)
            if any(r is None for r in filas[:commit + 1]):
                raise ValueError()
            if filas[-1] is not None or resultados[1]['response']['type'] != 'close':
                raise ValueError()
            self.leidas += sum(r.get('rows_read', 0) for r in filas if r)
            self.escritas += sum(r.get('rows_written', 0) for r in filas if r)
            return filas[2:commit]
        except (KeyError, TypeError, ValueError):
            raise ErrorTurso('Respuesta de Turso incompleta; comprobar estado antes de repetir') from None


def filas(resultado):
    return [[valor(c) for c in fila] for fila in resultado['rows']]
