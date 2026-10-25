"""Calendario común: Turso, recogidas acotadas y exportaciones recuperables."""

import argparse
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import tempfile
from zoneinfo import ZoneInfo

from agenda.cultura_galicia import FUENTES, leer_pagina, normalizar, recoger
from agenda import almacen, vidmar_f1
from agenda.modelo import integrar
from agenda.clasificacion import aplicar as clasificar


def guardar(ruta, calendario):
    """Sustituye la última respuesta buena solo cuando está completa y validada."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                         dir=ruta.parent, delete=False) as archivo:
            temporal = Path(archivo.name)
            json.dump(calendario, archivo, ensure_ascii=False, indent=2)
            archivo.write('\n')
        temporal.replace(ruta)
    finally:
        if temporal and temporal.exists():
            temporal.unlink()


def operar_nucleo(args):
    from agenda.transicion import ampliar
    from agenda import feb, espn_tenis, madrid, kulturklik

    modificar = bool(args.preparar_nucleo or args.entrada_feb or args.entrada_tenis or args.recoger_deporte
                     or args.recoger_cultura or args.entrada_madrid or args.entrada_kulturklik)
    observado = datetime.now(ZoneInfo('Europe/Madrid')).isoformat(timespec='microseconds')

    def preparar(anterior):
        if anterior is None:
            raise ValueError('La base aún no contiene un calendario del piloto')
        calendario = ampliar(anterior) if modificar else anterior
        if 'nucleo' not in calendario:
            raise ValueError('Preparar el núcleo antes de exportarlo')
        for ruta in args.entrada_feb or []:
            calendario['nucleo'] = feb.importar(calendario['nucleo'],
                json.loads(Path(ruta).read_text(encoding='utf-8')), observado)
        for ruta in args.entrada_tenis or []:
            calendario['nucleo'] = espn_tenis.importar(calendario['nucleo'],
                json.loads(Path(ruta).read_text(encoding='utf-8')), args.circuito, observado)
        from agenda import recogida
        for fuente, modulo in (('madrid', madrid), ('kulturklik', kulturklik)):
            for ruta in getattr(args, 'entrada_' + fuente) or []:
                calendario['nucleo'] = modulo.importar(calendario['nucleo'],
                    json.loads(Path(ruta).read_text(encoding='utf-8')), observado)
            if fuente in (args.recoger_cultura or []):
                filas, url = recogida.cultura(fuente, args.inicio, args.fin)
                calendario['nucleo'] = modulo.importar(calendario['nucleo'], filas, observado, url)
        for fuente in dict.fromkeys(args.recoger_deporte or []):
            if fuente == 'feb':
                calendario['nucleo'] = feb.importar(calendario['nucleo'],
                    recogida.feb(args.temporada_feb, args.competicion_feb), observado)
            else:
                circuito = fuente.removeprefix('espn-')
                pagina, url = recogida.tenis(circuito)
                calendario['nucleo'] = espn_tenis.importar(calendario['nucleo'],
                    pagina, circuito, observado, url=url)
        return calendario

    if args.turso:
        from agenda.turso import Almacen
        remoto = Almacen()
        remoto.inicializar()
        calendario = preparar(remoto.cargar())
        if modificar:
            remoto.guardar(calendario, solo_nucleo=True)
    else:
        with almacen.abrir(args.db) as db:
            calendario = preparar(almacen.cargar(db))
            if modificar:
                almacen.guardar(db, calendario, solo_nucleo=True)
    if args.salida:
        guardar(args.salida, calendario['nucleo'] if args.exportar_nucleo else calendario)
    cuenta = sum(e['tipo'] == 'evento' for e in calendario['nucleo']['entidades'].values())
    print(f'[agenda] Núcleo v2: {cuenta} eventos; '
          + ('recogida explícita' if args.recoger_deporte or args.recoger_cultura else 'sin consultar proveedores'))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--salida', help='Exportación JSON de calendario para revisar')
    ap.add_argument('--db', help='Base SQLite dedicada: conserva estado e historial entre pasadas')
    ap.add_argument('--turso', action='store_true', help='Persistir con CALENDARIO_TURSO_URL y CALENDARIO_TURSO_TOKEN')
    ap.add_argument('--copia', help='Descargar un snapshot SQLite completo de --turso, sin recoger fuentes')
    ap.add_argument('--exportar', action='store_true', help='Exportar --db/--turso a --salida sin recoger fuentes')
    ap.add_argument('--reclasificar', action='store_true',
                    help='Aplicar el catálogo común al estado guardado, sin consultar fuentes ni revalidar eventos')
    ap.add_argument('--preparar-nucleo', action='store_true',
                    help='Proyectar el piloto al núcleo v2 sin recoger proveedores')
    ap.add_argument('--exportar-nucleo', action='store_true',
                    help='Exportar solo el contrato v2 con --salida, sin recoger proveedores')
    ap.add_argument('--entrada-feb', action='append', help='Extracción FEB revisada v1 guardada, sin red')
    ap.add_argument('--entrada-tenis', action='append', help='JSON Site API de tenis guardado, sin red')
    ap.add_argument('--entrada-madrid', action='append', help='Lista de registros Madrid guardada, sin red')
    ap.add_argument('--entrada-kulturklik', action='append', help='Lista de eventos Kulturklik guardada, sin red')
    ap.add_argument('--recoger-cultura', action='append', choices=('madrid', 'kulturklik'),
                    help='Recogida cultural completa paginada en el núcleo; repetible')
    ap.add_argument('--circuito', choices=('atp', 'wta'), help='Circuito de --entrada-tenis')
    ap.add_argument('--recoger-deporte', action='append', choices=('feb', 'espn-atp', 'espn-wta'),
                    help='Recogida manual deportiva en el núcleo; repetible, sin publicación')
    ap.add_argument('--temporada-feb', help='Año inicial explícito de la temporada FEB')
    ap.add_argument('--competicion-feb', choices=('4', '1', '67'), default='4',
                    help='Competición FEB contrastada: 4 LF Endesa, 1 Primera FEB, 67 LF Challenge')
    ap.add_argument('--anterior', help='Calendario anterior: conserva IDs e historial de recogida')
    ap.add_argument('--entrada', action='append', help='Página JSON guardada de Galicia (repetible, sin red)')
    ap.add_argument('--entrada-ics', action='append', help='ICS de Vidmar guardado (repetible, sin red)')
    ap.add_argument('--fuente', action='append', choices=('cultura-galicia', 'vidmar-f1'),
                    help='Fuente a recoger por red (repetible, Galicia por defecto)')
    ap.add_argument('--idioma', action='append', choices=('gl', 'es'), help='Idioma a recoger (repetible, gl por defecto)')
    ap.add_argument('--inicio', help='Primer día solicitado (hoy por defecto)')
    ap.add_argument('--fin', help='Último día solicitado, incluido (inicio + 30 días por defecto)')
    args = ap.parse_args(argv)
    if not args.salida and not args.db and not args.turso:
        ap.error('Se necesita --salida, --db o --turso')
    if sum(bool(a) for a in (args.db, args.turso, args.anterior)) > 1:
        ap.error('--db, --turso y --anterior son alternativas de estado persistente')
    if args.db and args.salida and Path(args.db).resolve() == Path(args.salida).resolve():
        ap.error('La base y la exportación deben ser archivos distintos')
    if args.fuente and (args.entrada or args.entrada_ics):
        ap.error('Usa --fuente para red o --entrada/--entrada-ics para archivos locales')
    operacion_nucleo = any((args.preparar_nucleo, args.exportar_nucleo, args.entrada_feb,
                           args.entrada_tenis, args.recoger_deporte, args.recoger_cultura,
                           args.entrada_madrid, args.entrada_kulturklik))
    if ('feb' in (args.recoger_deporte or [])) != bool(args.temporada_feb):
        ap.error('--recoger-deporte feb requiere --temporada-feb y viceversa')
    if args.competicion_feb != '4' and 'feb' not in (args.recoger_deporte or []):
        ap.error('--competicion-feb requiere --recoger-deporte feb')
    if args.circuito and not args.entrada_tenis:
        ap.error('--circuito requiere --entrada-tenis')
    if operacion_nucleo:
        if not (args.db or args.turso) or any((args.copia, args.exportar, args.reclasificar, args.anterior,
                args.entrada, args.entrada_ics, args.fuente, args.idioma)):
            ap.error('El núcleo requiere --db/--turso, sin recogida ni operaciones del piloto')
        if (args.inicio or args.fin) and not args.recoger_cultura:
            ap.error('--inicio/--fin en el núcleo requieren --recoger-cultura')
        if args.exportar_nucleo and not args.salida:
            ap.error('--exportar-nucleo requiere --salida')
        if args.entrada_tenis and not args.circuito:
            ap.error('--entrada-tenis requiere --circuito')
        operar_nucleo(args)
        return
    if args.copia:
        if not args.turso or any((args.exportar, args.reclasificar, args.salida, args.db, args.anterior,
                args.entrada, args.entrada_ics, args.fuente, args.inicio, args.fin, args.idioma)):
            ap.error('--copia requiere solo --turso y una ruta de copia')
        from agenda.turso import Almacen
        Almacen().copia(args.copia)
        print(f'[agenda] Copia completa → {args.copia}')
        return
    if args.reclasificar:
        if not (args.db or args.turso) or any((args.exportar, args.anterior, args.entrada,
                args.entrada_ics, args.fuente, args.inicio, args.fin, args.idioma)):
            ap.error('--reclasificar requiere --db/--turso y opcionalmente --salida, sin recogida')
        if args.turso:
            from agenda.turso import Almacen
            remoto = Almacen()
            remoto.inicializar()
            anterior = remoto.cargar()
            if anterior is None:
                raise ValueError('La base aún no contiene un calendario')
            calendario = clasificar(anterior)
            if 'nucleo' in calendario:
                from agenda.transicion import ampliar
                calendario = ampliar(calendario)
            remoto.guardar(calendario, solo_clasificacion=True)
        else:
            with almacen.abrir(args.db) as db:
                anterior = almacen.cargar(db)
                if anterior is None:
                    raise ValueError('La base aún no contiene un calendario')
                calendario = clasificar(anterior)
                if 'nucleo' in calendario:
                    from agenda.transicion import ampliar
                    calendario = ampliar(calendario)
                almacen.guardar(db, calendario, solo_clasificacion=True)
        if args.salida:
            guardar(args.salida, calendario)
        print('[agenda] Clasificación común aplicada sin consultar proveedores')
        return
    if args.exportar:
        if not (args.db or args.turso) or not args.salida or any((args.anterior, args.entrada, args.entrada_ics,
                                                  args.fuente, args.inicio, args.fin, args.idioma)):
            ap.error('--exportar requiere --db/--turso y --salida')
        if args.turso:
            from agenda.turso import Almacen
            remoto = Almacen()
            remoto.inicializar()
            calendario = remoto.cargar()
        else:
            with almacen.abrir(args.db) as db:
                calendario = almacen.cargar(db)
        if calendario is None:
            raise ValueError('La base aún no contiene un calendario')
        guardar(args.salida, calendario)
        return
    remoto = None
    if args.turso:
        from agenda.turso import Almacen
        remoto = Almacen()  # Validar credenciales antes de consultar proveedores.
    ahora = datetime.now(ZoneInfo('Europe/Madrid')).isoformat(timespec='seconds')
    idiomas = list(dict.fromkeys(args.idioma or ['gl']))
    anterior = json.loads(Path(args.anterior).read_text(encoding='utf-8')) if args.anterior else None
    registros, consultas = [], []
    fuentes = {}
    if args.entrada:
        fuentes.update(FUENTES)
        if len(idiomas) != 1:
            ap.error('--entrada requiere un solo idioma de respaldo')
        for ruta in args.entrada:
            filas, total = leer_pagina(json.loads(Path(ruta).read_text(encoding='utf-8')))
            registros.extend(normalizar(fila, idiomas[0]) for fila in filas)
            consultas.append({'fuente': 'cultura-galicia', 'archivo': Path(ruta).name,
                              'registros': len(filas), 'total_declarado': total,
                              'alcance': 'muestra_local'})
    if args.entrada_ics:
        fuentes.update(vidmar_f1.FUENTES)
        for ruta in args.entrada_ics:
            filas = vidmar_f1.leer(Path(ruta).read_text(encoding='utf-8'))
            registros.extend(filas)
            consultas.append({'fuente': vidmar_f1.FUENTE, 'archivo': Path(ruta).name,
                              'registros': len(filas), 'alcance': 'muestra_local'})
    if not args.entrada and not args.entrada_ics:
        inicio = date.fromisoformat(args.inicio) if args.inicio else datetime.fromisoformat(ahora).date()
        fin = date.fromisoformat(args.fin) if args.fin else inicio + timedelta(days=30)
        for fuente in dict.fromkeys(args.fuente or ['cultura-galicia']):
            if fuente == 'cultura-galicia':
                fuentes.update(FUENTES)
                for idioma in idiomas:
                    filas = recoger(inicio.isoformat(), fin.isoformat(), idioma)
                    registros.extend(filas)
                    consultas.append({'fuente': fuente, 'idioma': idioma,
                                      'inicio': inicio.isoformat(), 'fin': fin.isoformat(),
                                      'registros': len(filas), 'alcance': 'intervalo_solicitado'})
            else:
                fuentes.update(vidmar_f1.FUENTES)
                filas = vidmar_f1.recoger()
                registros.extend(filas)
                consultas.append({'fuente': fuente, 'url': vidmar_f1.URL,
                                  'registros': len(filas), 'alcance': 'calendario_completo'})
    # Toda la red y el parseo terminan antes de abrir la transacción de escritura.
    if args.turso:
        remoto.inicializar()
        calendario = integrar(remoto.cargar(), registros, fuentes, ahora, consultas)
        remoto.guardar(calendario)
        print(f'[agenda] Turso: {remoto.cliente.leidas} filas leídas, '
              f'{remoto.cliente.escritas} escritas (métricas del servidor)')
    elif args.db:
        with almacen.abrir(args.db) as db:
            calendario = integrar(almacen.cargar(db), registros, fuentes, ahora, consultas)
            almacen.guardar(db, calendario)
    else:
        calendario = integrar(anterior, registros, fuentes, ahora, consultas)
    if args.salida:
        guardar(args.salida, calendario)
    print(f"[agenda] {len(calendario['eventos'])} eventos, "
          f"{len(calendario['registros'])} registros → {'Turso' if args.turso else args.db or args.salida}")


if __name__ == '__main__':
    main()
