"""Escrituras grandes del calendario: varios envíos, una sola transacción.

HTTP v2 conserva el stream con su baton rotatorio. Se confirma únicamente
después de validar todas las respuestas. Nunca se reintenta una escritura.
"""

import json
from urllib.parse import urlsplit
from urllib.request import Request

from turso_http import Cliente, ErrorTurso, argumento


class ClienteCalendario(Cliente):
    # El núcleo reúne varias agendas y su historial en una instantánea validada.
    # Límite propio; no amplía los envíos ni el cliente de otros servicios.
    MAX_RESPUESTA = 64_000_000

    def transaccion(self, sentencias, escritura=True):
        sentencias = list(sentencias)
        try:
            return super().transaccion(sentencias, escritura)
        except ErrorTurso as error:
            if not escritura or str(error) != 'Recogida demasiado grande: reducir su intervalo antes de escribir':
                raise
        return self._lotes(sentencias)

    def _lotes(self, sentencias):
        operaciones = [('PRAGMA foreign_keys=ON', ()), ('BEGIN IMMEDIATE', ()), *sentencias]
        lotes, actual, tamano = [], [], 0
        limite = self.MAX_ENVIO - 2048
        # Preparar y comprobar todos los trozos antes de abrir el stream.
        for sql, args in operaciones:
            paso = {'stmt': {'sql': sql, 'args': [argumento(a) for a in args]}}
            coste = len(json.dumps(paso, ensure_ascii=False).encode()) + 100
            if coste > limite:
                raise ErrorTurso('Sentencia demasiado grande para el calendario; no se inició la escritura')
            if actual and tamano + coste > limite:
                lotes.append(actual); actual, tamano = [], 0
            actual.append(paso); tamano += coste
        if actual:
            lotes.append(actual)
        lotes.append([{'stmt': {'sql': 'COMMIT', 'args': []}}])
        baton, base, resultados, leidas, escritas = None, self.url, [], 0, 0

        def pedir(pasos, cerrar=False):
            peticiones = [{'type': 'batch', 'batch': {'steps': pasos}}]
            if cerrar:
                peticiones.append({'type': 'close'})
            cuerpo = json.dumps({'baton': baton, 'requests': peticiones}, ensure_ascii=False).encode()
            if len(cuerpo) > self.MAX_ENVIO:
                raise ErrorTurso('Envío del calendario excede el límite')
            peticion = Request(base.rstrip('/') + '/v2/pipeline', data=cuerpo, headers={
                'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
            return json.loads(self._leer(peticion, self.MAX_RESPUESTA))

        try:
            for il, pasos in enumerate(lotes):
                for i, paso in enumerate(pasos):
                    if i:
                        paso['condition'] = {'type': 'ok', 'step': i - 1}
                cerrar = il == len(lotes) - 1
                respuesta = pedir(pasos, cerrar)
                nuevo_baton = respuesta.get('baton')
                if not cerrar and (not isinstance(nuevo_baton, str) or not nuevo_baton):
                    raise ErrorTurso('Stream Turso cerrado antes del COMMIT; comprobar estado')
                baton = nuevo_baton
                if respuesta.get('base_url'):
                    nuevo = urlsplit(respuesta['base_url'])
                    host = urlsplit(self.url).hostname
                    if (nuevo.scheme != 'https' or nuevo.username or nuevo.password or nuevo.query or nuevo.fragment
                            or not nuevo.hostname or not (nuevo.hostname == host or
                                host.endswith('.turso.io') and nuevo.hostname.endswith('.turso.io'))):
                        raise ErrorTurso('URL de continuación Turso no admitida; comprobar estado')
                    base = respuesta['base_url']
                rs = respuesta['results']
                if len(rs) != (2 if cerrar else 1) or any(r['type'] != 'ok' for r in rs):
                    raise ErrorTurso('Respuesta Turso incompleta; comprobar estado')
                if rs[0]['response']['type'] != 'batch' or cerrar and rs[1]['response']['type'] != 'close':
                    raise ErrorTurso('Respuesta Turso incompatible; comprobar estado')
                lote = rs[0]['response']['result']
                filas, errores = lote['step_results'], lote['step_errors']
                if len(filas) != len(pasos) or len(errores) != len(pasos):
                    raise ErrorTurso('Respuesta Turso incompleta; comprobar estado')
                for i, error in enumerate(errores):
                    if error is not None:
                        codigo = error.get('code', 'SQL_ERROR')
                        raise ErrorTurso(f'Turso: {codigo}; transacción rechazada',
                            paso=len(resultados) + i - 2, codigo=codigo)
                if any(f is None for f in filas):
                    raise ErrorTurso('Pasos Turso omitidos; comprobar estado')
                resultados.extend(filas)
                leidas += sum(f.get('rows_read', 0) for f in filas)
                escritas += sum(f.get('rows_written', 0) for f in filas)
            self.leidas += leidas; self.escritas += escritas
            return resultados[2:-1]
        except (KeyError, TypeError, ValueError) as error:
            raise ErrorTurso('Respuesta Turso incompleta; comprobar estado antes de repetir') from error
        finally:
            if baton:
                try:
                    pedir([{'stmt': {'sql': 'ROLLBACK', 'args': []}}], cerrar=True)
                except Exception:
                    # Si se perdió la respuesta, el servidor cierra el stream
                    # inactivo y revierte lo no confirmado. No repetir COMMIT.
                    pass
