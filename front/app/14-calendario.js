/* Calendario: cliente de la API de agenda de los workers de datos (/calendario/*). */
// Se pide solo lo visible: el catálogo una vez, el resumen de la ventana (cuentas
// y unas muestras por día), la lista de un día al abrirla y el detalle de una
// cita. Resultados y clasificaciones son consultas puntuales.
const CALENDARIO_ACTIVO = true;
// Zonas que prepara la publicación; con otra zona del navegador, la peninsular.
const CAL_ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'UTC'];
const CAL_ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CAL_PRECIOS = { gratis: 'calPrecioGratis', pago: 'calPrecioPago', mixto: 'calPrecioMixto' };
// Atajos de fecha (Time Out, Fever): fijan los días que enseña la lista.
const CAL_RANGOS = { hoy: 'calHoy', manana: 'calManana', finde: 'calFinde' };
// Categorías de la barra, con su color (--cat-*); lo demás, «otras».
const CAL_CATEGORIAS = ['cultura', 'deportes'];
const CAL_SEMANAS_MAX = 4;
// Deportes por deporte y sus competiciones (SofaScore): dos toques hasta una liga.
const CAL_DEPORTES = { futbol: ['primera', 'segunda'], baloncesto: ['nba', 'wnba', 'feb-endesa', 'feb-primera', 'feb-challenge'],
  motor: ['f1', 'motogp', 'wrc'], tenis: ['atp', 'wta'] };
const CAL_NOMBRES_DEPORTE = { futbol: 'calFutbol', baloncesto: 'calBaloncesto', motor: 'calMotor', tenis: 'calTenis' };
// Marcas del mes por competición, en orden de prioridad; la WTA está casi
// todos los días y va al final para no tapar al resto.
const CAL_MARCAS = { f1: 'F1', motogp: 'MGP', wrc: 'WRC', primera: '1ª', segunda: '2ª', nba: 'NBA', atp: 'ATP',
  'feb-endesa': 'LFE', 'feb-primera': 'FEB', 'feb-challenge': 'LFC', wnba: 'WNBA', wta: 'WTA' };
const CALENDARIO = {
  abierto: false, porPrefijo: false, orden: null, meta: null, cargado: 0, cargando: false, error: '',
  // dia: el elegido en el mes. dias: listas abiertas por «día|citas» o «día|curso».
  // fecha: el día elegido (la lista empieza en él y la tira enseña su semana).
  fecha: '', desdeConsulta: '', rango: '', semanas: 1, mesAbierto: false, mes: null,
  zona: CAL_ZONAS.includes(CAL_ZONA) ? CAL_ZONA : 'Europe/Madrid',
  temas: new Set(), deporte: '', competicion: '', temporada: null, precio: '', donde: null, dondeAuto: false, editandoDonde: false, clave: '',
  escrito: { donde: '' }, sugerencias: { donde: [] },
  consulta: '', vigente: '', controller: null, resumen: null, dias: new Map(), pendientes: null, origen: null, scroll: 0,
};
const iconoCalendario = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/></svg>';
const calNombre = e => e?.nombres?.[ACCES.lang] || e?.nombres?.es || Object.values(e?.nombres || {})[0] || '—';
const calEsc = s => escapeHtml(String(s ?? ''));
// Singular y plural: «clave1» para uno.
const calN = (clave, n) => t(n === 1 ? clave + '1' : clave, { n });
const calNombreFormato = f => t('calFmt' + f.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join(''));
// Cita, programa o prolongada; por zona si la publicación la distingue.
const calPresentacion = e => (e.presentacion && typeof e.presentacion === 'object'
  ? e.presentacion[CALENDARIO.zona] : e.presentacion) || 'cita';
const calHoy = () => diaEnZona(new Date().toISOString(), CALENDARIO.zona);
const calFormatos = new Map();
function calFormato(opciones){
  const clave = JSON.stringify([ACCES.lang, opciones]);
  if (!calFormatos.has(clave)){
    if (calFormatos.size >= 32) calFormatos.clear();
    calFormatos.set(clave, new Intl.DateTimeFormat(ACCES.lang, opciones));
  }
  return calFormatos.get(clave);
}
const calFecha = (dia, opciones = {}) => fechaValida(dia) ? calFormato({
  timeZone: 'UTC', day: 'numeric', month: 'short', ...opciones,
}).format(new Date(dia + 'T12:00:00Z')) : t('calFechaPendiente');
const calBoton = (accion, label, valor = '', attrs = '') => `<button type="button" data-cal="${accion}" data-valor="${calEsc(valor)}" ${attrs}>${calEsc(label)}</button>`;
function calEnlace(url, label){
  try { if (!/^https?:$/.test(new URL(url).protocol)) return calEsc(label); }
  catch { return calEsc(label); }
  return `<a href="${calEsc(url)}" target="_blank" rel="noopener noreferrer">${calEsc(label)}</a>`;
}
// El texto libre, sin prefijos: las fechas y los filtros van en parámetros propios.
const calLibre = raw => tokenizeQuery(raw || '').filter(tk => !tk.prefix).map(tk => tk.raw).join(' ');
// Mismo orden de backends que los datos. Un 4xx es de la consulta: el otro
// backend respondería lo mismo, así que no se repite. Tampoco el 429: es el
// límite por IP y ambos leen la misma base; se espera lo que diga Retry-After.
let calEsperaHasta = 0;
async function calPedir(ruta, params, signal){
  if (Date.now() < calEsperaHasta) throw Object.assign(new Error('HTTP 429'), { status: 429 });
  const qs = String(new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)));
  let fallo;
  for (const base of [...new Set([DATA_BASE, ...Object.values(BACKENDS).map(b => b.data)])]){
    let r;
    try {
      r = await fetch(`${base}/calendario/${ruta}${qs ? '?' + qs : ''}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    } catch (e){ if (signal.aborted) throw e; fallo = e; continue; }
    const dato = await r.json().catch(() => null);
    if (r.ok && dato) return dato;
    fallo = Object.assign(new Error(dato?.error || `HTTP ${r.status}`), { status: r.status });
    if (r.status === 429) calEsperaHasta = Date.now() + (Number(r.headers.get('Retry-After')) || 60) * 1000;
    if (r.status >= 400 && r.status < 500) throw fallo;
  }
  throw fallo;
}
// La publicación avanza a diario: cada respuesta trae su revisión y cobertura.
function calAnotar(dato){
  const m = CALENDARIO.meta;
  if (m) for (const k of ['revision', 'generado', 'horizonte', 'cobertura', 'colecciones']) m[k] = dato[k];
}
function calParametros(){
  const s = CALENDARIO, o = s.orden;
  const elegidas = s.competicion ? [s.competicion] : s.deporte ? CAL_DEPORTES[s.deporte] : [];
  const ambitos = [...(o?.ambitos || []), ...elegidas];
  const q = [...ambitos.map(a => a + ':'), ...(o?.circuitos.length ? ['circuito:' + o.circuitos.join(',')] : [])].join(' ');
  // La ciudad acota la agenda local (territorio estricto). Una competición
  // elegida a propósito (chip o prefijo) no tiene sitio: va sin ciudad.
  const competiciones = elegidas.length || ambitos.some(a => AMBITOS[a]?.codigo) || Boolean(o?.circuitos.length);
  return { zona: s.zona, q, texto: calLibre(o?.resto), temas: [...s.temas].join(','), precio: s.precio,
    territorio: competiciones ? '' : s.donde?.id || '' };
}
// Días de la vista y su ventana [desde, hasta) dentro de lo publicado.
// desde:/hasta: del buscador acotan la celebración; en noticias, la publicación.
function calVentana(){
  const s = CALENDARIO, h = s.meta?.horizonte, p = parseQuery(s.orden?.resto || '');
  // Desde el día elegido, una semana por cada una cargada (la tira enseña la
  // semana entera; sus días anteriores, sin cuentas).
  const dias = Array.from({ length: 7 * s.semanas }, (_, i) => sumarDiasCalendario(s.fecha, i));
  const fin = fechaValida(p.hasta) ? sumarDiasCalendario(p.hasta, 1) : null;
  const desde = [dias[0], h?.desde, fechaValida(p.desde) ? p.desde : null].filter(Boolean).sort().at(-1);
  const hasta = [sumarDiasCalendario(dias.at(-1), 1), h?.hasta, fin].filter(Boolean).sort()[0];
  return { dias, desde, hasta, acotada: Boolean(p.desde || fin) };
}
const calPideAgenda = o => Boolean(o) && (o.desconocidos.length > 0 || !o.tipos.length || o.tipos.includes('calendario'));
async function cargarCalendario(renovar = false){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO;
  if (s.orden?.desconocidos.length) return void pintarCalendario();
  if (s.meta && !renovar) return void consultarCalendario();
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  s.cargando = true; s.error = ''; pintarCalendario();
  try {
    s.meta = await calPedir('catalogo', {}, controller.signal); s.cargado = Date.now();
  } catch {
    if (controller.signal.aborted) return;
    s.cargando = false; s.error = 'calError'; return void pintarCalendario();
  }
  s.consulta = ''; s.pendientes = null;
  consultarCalendario();
}
async function consultarCalendario(){
  const s = CALENDARIO;
  if (!s.meta) return void cargarCalendario();
  s.fecha ||= calHoy();
  const { desde, hasta } = calVentana();
  if (s.mesAbierto) cargarMesCalendario();
  // Tira y lista salen del mismo resumen: cuentas por categoría y tres muestras por día.
  const params = { ...calParametros(), desde, hasta, muestras: 3 };
  const clave = JSON.stringify(params);
  if (clave === s.consulta && !s.error) return void pintarCalendario();
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  // Lo anterior se queda a la vista hasta que llegue su sustituto.
  if (clave !== s.vigente) s.dias.clear();
  s.consulta = clave; s.error = '';
  // Abortar también corta la lista sin fecha en curso: se vuelve a pedir al pulsar.
  const p = s.pendientes;
  if (p && (p.cargando || p.clave !== JSON.stringify(calParametros()))) s.pendientes = null;
  if (desde >= hasta){ s.cargando = false; return void pintarCalendario(); }
  s.cargando = true; pintarCalendario();
  try {
    const dato = await calPedir('resumen', params, controller.signal);
    calAnotar(dato); s.vigente = clave; s.resumen = dato.dias; s.dias.clear();
  } catch (e){
    if (controller.signal.aborted) return;
    s.error = e.status === 422 ? 'calFueraHorizonte' : 'calError';
    // Lo que quedaba a la vista era de otra consulta: no se presenta como suyo.
    if (clave !== s.vigente) s.resumen = null;
  }
  s.cargando = false; pintarCalendario();
}
// Mes desplegado: solo cuentas (sin muestras) de sus 42 días, al abrirlo.
async function cargarMesCalendario(){
  const s = CALENDARIO, h = s.meta?.horizonte, dias = ventanaCalendario(s.fecha, 'mes');
  const desde = [dias[0], h?.desde].filter(Boolean).sort().at(-1);
  const hasta = [sumarDiasCalendario(dias.at(-1), 1), h?.hasta].filter(Boolean).sort()[0];
  const params = { ...calParametros(), desde, hasta, muestras: 0 }, clave = JSON.stringify(params);
  if (s.mes?.clave === clave || desde >= hasta) return;
  s.controllerMes?.abort();
  const controller = s.controllerMes = new AbortController();
  s.mes = { clave, dias: s.mes?.dias || null, cargando: true };
  try {
    const dato = await calPedir('resumen', params, controller.signal);
    if (s.mes?.clave !== clave) return;
    calAnotar(dato); s.mes = { clave, dias: dato.dias, cargando: false };
  } catch {
    if (controller.signal.aborted) return;
    s.mes = null; s.error = 'calError';
  }
  pintarCalendario();
  if (calModoDeportes()) cargarTemporadaCalendario();
}
// «Este mes en deportes»: los GP y torneos del mes natural (los partidos se
// cuentan con el resumen). Pocos: unos 30 al mes con todas las competiciones.
async function cargarTemporadaCalendario(){
  const s = CALENDARIO, uno = s.fecha.slice(0, 8) + '01', mesSig = moverFecha(uno, 'mes', 1);
  const params = { ...calParametros(), desde: uno, hasta: mesSig, presentacion: 'prolongada,programa',
    circuitos: Object.keys(CAL_MARCAS).join(','), limite: 50 }, clave = JSON.stringify(params);
  if (s.temporada?.clave === clave) return;
  s.temporada = { clave, eventos: null };
  try {
    const dato = await calPedir('eventos', params, (s.controllerMes ||= new AbortController()).signal);
    if (s.temporada?.clave !== clave) return;
    calAnotar(dato); s.temporada.eventos = dato.eventos;
  } catch {
    if (s.temporada?.clave === clave) s.temporada = null;
    return;
  }
  pintarCalendario();
}
// Lista de un día: sus citas y programas, o lo que está en curso. Se pide al
// abrirla y pagina con el cursor de la API; si la publicación cambió (409),
// se rehace desde el principio para no mezclar lecturas.
async function abrirDiaCalendario(dia, tipo, mas = false){
  const s = CALENDARIO, clave = dia + '|' + tipo;
  let l = s.dias.get(clave);
  if (!l){ l = { eventos: [], siguiente: null, cargando: false, cargada: false }; s.dias.set(clave, l); }
  l.abierta = true;
  if (l.cargando || (mas ? !l.siguiente : l.cargada)) return void pintarCalendario();
  l.cargando = true; pintarCalendario();
  const controller = s.controller ||= new AbortController();
  try {
    const dato = await calPedir('eventos', { ...calParametros(), desde: dia, hasta: sumarDiasCalendario(dia, 1), limite: 20,
      presentacion: tipo === 'curso' ? 'prolongada' : 'cita,programa', cursor: mas ? l.siguiente : '' }, controller.signal);
    if (s.dias.get(clave) !== l) return;
    calAnotar(dato); l.eventos.push(...dato.eventos); l.siguiente = dato.siguiente; l.cargada = true;
  } catch (e){
    if (controller.signal.aborted || s.dias.get(clave) !== l) return void (l.cargando = false);
    if (e.status === 409){ s.dias.delete(clave); return void abrirDiaCalendario(dia, tipo); }
    s.error = 'calError';
  }
  l.cargando = false; pintarCalendario();
}
async function pendientesCalendario(mas = false){
  const s = CALENDARIO, filtros = calParametros(), clave = JSON.stringify(filtros);
  if (s.pendientes?.clave !== clave) s.pendientes = { clave, eventos: [], siguiente: null, cargando: false };
  const p = s.pendientes;
  if (p.cargando || mas && !p.siguiente) return;
  p.cargando = true; pintarCalendario();
  const controller = s.controller;
  try {
    const dato = await calPedir('eventos', { ...filtros, pendientes: 1, limite: 20, cursor: mas ? p.siguiente : '' }, controller.signal);
    if (s.pendientes !== p) return;
    calAnotar(dato); p.eventos.push(...dato.eventos); p.siguiente = dato.siguiente;
  } catch (e){
    if (controller.signal.aborted || s.pendientes !== p) return;
    if (e.status === 409){ s.pendientes = null; return void pendientesCalendario(); }
    s.error = 'calError';
  }
  p.cargando = false; pintarCalendario();
}
function calLimpiarFiltros(){
  const s = CALENDARIO;
  s.temas.clear(); s.deporte = ''; s.competicion = ''; s.temporada = null; s.precio = ''; s.rango = ''; s.semanas = 1; s.mes = null;
  s.escrito = { donde: '' }; s.sugerencias = { donde: [] }; s.editandoDonde = false;
}
// La ciudad fija también la hora: la canaria en Canarias; si no, la del navegador.
function calElegirDonde(donde){
  const s = CALENDARIO, [, nivel, codigo = ''] = donde?.id.split(':') || [];
  const canarias = nivel === 'autonomia' ? codigo === '05' : ['35', '38'].includes(codigo.slice(0, 2));
  s.donde = donde;
  s.zona = canarias ? 'Atlantic/Canary' : donde ? 'Europe/Madrid' : CAL_ZONAS.includes(CAL_ZONA) ? CAL_ZONA : 'Europe/Madrid';
}
// Ciudad por defecto: la provincia del primer sitio de «Mis sitios» (el
// tiempo), una vez por sesión; quitarla deja toda la agenda.
function calDondePorDefecto(){
  const s = CALENDARIO;
  if (s.dondeAuto) return;
  s.dondeAuto = true;
  const ine = sitiosTiempo().find(x => x.lugar?.ine)?.lugar.ine;
  const provincia = ine && ADMINISTRACION.provincias.find(([c]) => c === String(ine).padStart(5, '0').slice(0, 2));
  if (provincia && !s.donde) calElegirDonde({ id: 'es:provincia:' + provincia[0], nombre: provincia[1] });
}
// La identidad de la consulta son sus prefijos de agenda: editar el texto o
// añadir otros servicios (tiempo, consultas) conserva filtros y apertura.
function actualizarConsultaCalendario(orden){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO, clave = JSON.stringify(orden && [orden.ambitos, orden.circuitos, orden.tipos, orden.desconocidos]);
  const fecha = parseQuery(orden?.resto || '').desde || '';
  if (fecha !== s.desdeConsulta){ s.desdeConsulta = fecha; s.fecha = fechaValida(fecha) ? fecha : calHoy(); }
  if (clave !== s.clave){
    s.clave = clave; calLimpiarFiltros();
    s.fecha = fechaValida(fecha) ? fecha : calHoy();
    // Un prefijo de agenda abre la vista completa y, al quitarlo, la cierra;
    // cerrada a mano, sigue cerrada mientras no cambie la consulta.
    if (calPideAgenda(orden)){
      if (!s.abierto){ s.origen = document.getElementById('buscar'); s.scroll = window.scrollY; s.abierto = s.porPrefijo = true; calDondePorDefecto(); }
    } else if (s.porPrefijo) s.abierto = s.porPrefijo = false;
  }
  s.orden = orden;
  if (s.abierto) return void cargarCalendario();
  pintarCalendario();
}
function abrirCalendario(origen = null){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO;
  // Cada entrada empieza hoy; el pasado se visita navegando.
  if (!s.abierto){ s.origen = origen || document.activeElement; s.scroll = window.scrollY; calElegirDia(calHoy()); }
  cerrarEstadisticas(false);
  s.abierto = true; s.porPrefijo = false; calDondePorDefecto();
  // Tras un rato cerrado, la publicación del día pudo cambiar.
  cargarCalendario(Date.now() - s.cargado > 10 * 60000);
  requestAnimationFrame(() => {
    document.getElementById('cal-titulo')?.focus({ preventScroll: true });
    document.getElementById('calendario-panel')?.scrollIntoView({ block: 'start' });
  });
}
function cerrarCalendario(volver = true){
  const s = CALENDARIO;
  if (!s.abierto) return;
  s.abierto = s.porPrefijo = false; pintarCalendario();
  if (!volver) return;
  const origen = s.origen?.isConnected ? s.origen : document.getElementById('btn-calendario');
  const menu = origen?.closest?.('#cab-menu');
  (menu && !menu.open ? menu.querySelector('summary') : origen)?.focus({ preventScroll: true });
  window.scrollTo({ top: s.scroll, behavior: 'auto' });
}
// Salir de la vista: con una agenda que admite noticias quedan sus noticias;
// si no, se quitan sus prefijos del buscador (como al cerrar el tiempo) para
// no dejar un feed vacío por construcción.
function salirCalendario(){
  const s = CALENDARIO;
  if (!s.orden || s.orden.noticias) return cerrarCalendario();
  const input = document.getElementById('buscar');
  const { antes, consulta } = partirConsulta(input.value);
  input.value = [tokenizeQuery(antes).filter(tk => !(tk.prefix && leerConsultaCalendario(tk.raw))).map(tk => tk.raw).join(' '), consulta]
    .filter(Boolean).join(' ');
  cerrarCalendario();
  aplicarFiltros();
}
function calHora(e){
  const c = e.programacion?.valor?.cuando;
  const a = extremoVisible(c?.inicio, CALENDARIO.zona), b = extremoVisible(c?.fin, CALENDARIO.zona);
  if (!a.fecha) return c?.restricciones_pendientes ? t('calHorarioRevisar') : t('calFechaPendiente');
  if (e.programacion?.valor?.modalidad === 'intervalo') return calFecha(a.fecha)
    + (b.fecha ? ' → ' + calFecha(b.fecha) : '') + ' · ' + t('calPeriodo');
  let s = a.hora || t('calSinHora');
  if (a.hora && a.sinZona) s += ' · ' + t('calSinZona');
  if (b.fecha) s += ' → ' + calFecha(b.fecha) + (b.hora ? ' ' + b.hora : '')
    + (c.fin_exclusivo ? ' · ' + t('calFinExclusivo') : '');
  return s;
}
// La tarjeta trae el lugar compacto; el detalle, la selección con su valor.
function calLugar(e){
  const l = e.lugar, v = l && typeof l === 'object' && 'valor' in l ? l.valor : l;
  if (!v) return '';
  if (typeof v === 'string') return v;
  return [...new Set([v.nombre || v.fullName || v.displayName,
    v.municipio_literal || v.municipio || v.address?.city].filter(Boolean))].join(' · ');
}
function calFuentes(e){
  const m = CALENDARIO.meta, vistas = new Set();
  return e.fuentes.filter(f => { const k = f.fuente + '/' + f.url; if (vistas.has(k)) return false; vistas.add(k); return true; })
    .map(f => {
      const fuente = m?.fuentes?.[f.fuente];
      const comprobado = f.comprobado || m?.cobertura?.find(c => c.fuente === f.fuente)?.comprobado;
      return `<p class="cal-nota">${calEnlace(f.url || fuente?.url, fuente?.atribucion || fuente?.nombre || f.fuente)}
        ${comprobado ? ' · ' + calEsc(t('calComprobado', { fecha: calFormato({ dateStyle: 'short', timeStyle: 'short', timeZone: CALENDARIO.zona }).format(new Date(comprobado)) })) : ''}
        ${fuente?.licencia ? ' · ' + calEnlace(fuente.licencia_url, fuente.licencia) : ''}</p>`;
    }).join('');
}
// Detalle completo, en el diálogo.
function calEvento(e){
  const v = e.programacion?.valor, estado = v?.programacion;
  const aviso = e.programacion?.conflicto || e.lugar?.conflicto;
  const lugar = calLugar(e);
  const avisoEstado = estado === 'cancelado' || estado === 'aplazado' ? `<p class="cal-aviso">${calEsc(t(estado === 'cancelado' ? 'calCancelado' : 'calAplazado'))}</p>` : '';
  const horario = v?.cuando?.horario_textual, ejecucion = v?.ejecucion;
  const textoHorario = typeof horario === 'string' ? horario : horario?.[ACCES.lang] || horario?.es || Object.values(horario || {})[0];
  const dias = v?.cuando?.dias_semana?.map(d => calFecha(sumarDiasCalendario('2026-10-19', d), { weekday: 'short', day: undefined, month: undefined })).join(', ');
  return `<article class="cal-evento"><h3>${calEsc(calNombre(e))}</h3>
    <p class="cal-cuando">${calEsc(calHora(e))}</p>${lugar ? `<p>${calEsc(lugar)}</p>` : ''}
    ${textoHorario || dias ? `<p class="cal-nota">${calEsc([dias, textoHorario].filter(Boolean).join(' · '))}</p>` : ''}
    ${avisoEstado}
    ${ejecucion === 'en_curso' || ejecucion === 'terminado' ? `<p class="cal-nota">${calEsc(t(ejecucion === 'en_curso' ? 'calEnCurso' : 'calTerminado'))}</p>` : ''}
    ${aviso ? `<p class="cal-aviso">${calEsc(t('calConflicto'))}</p>` : ''}
    ${e.programa?.length ? `<section class="cal-programa"><h4>${calEsc(t('calPrograma'))}</h4><ul>${e.programa.map(p => `<li><span>${calEsc(calNombre(p))}</span> <span class="cal-cuando">${calEsc(calHora(p))}</span></li>`).join('')}</ul></section>` : ''}
    <details><summary>${calEsc(t('calDetalles'))}</summary>
    ${e.participaciones?.length ? `<ul>${e.participaciones.map(p => `<li>${calEsc(p.literal)}</li>`).join('')}</ul>` : ''}
    ${(e.enlaces || []).map(url => `<p>${calEnlace(url, t('calVerOriginal'))}</p>`).join('')}
    ${calFuentes(e)}</details></article>`;
}
async function abrirEventoCalendario(id){
  const s = CALENDARIO, dialogo = document.getElementById('cal-evento-dialogo');
  const cerrar = `<form method="dialog"><button autofocus>${calEsc(t('calCerrar'))}</button></form>`;
  dialogo.innerHTML = cerrar + `<p class="cal-estado" role="status">${calEsc(t('calCargando'))}</p>`;
  dialogo.removeAttribute('aria-labelledby'); dialogo.setAttribute('aria-label', t('calTitulo'));
  if (!dialogo.open) dialogo.showModal();
  s.detalle?.abort();
  const controller = s.detalle = new AbortController();
  dialogo.addEventListener('close', () => controller.abort(), { once: true });
  try {
    const d = await calPedir('eventos/' + encodeURIComponent(id), {}, controller.signal);
    calAnotar(d);
    dialogo.innerHTML = cerrar + calEvento(d.evento);
    dialogo.querySelector('h3').id = 'cal-evento-titulo';
    dialogo.removeAttribute('aria-label'); dialogo.setAttribute('aria-labelledby', 'cal-evento-titulo');
  } catch {
    if (controller.signal.aborted) return;
    dialogo.innerHTML = cerrar + `<p class="cal-aviso" role="status">${calEsc(t('calError'))}</p>`;
  }
  dialogo.querySelector('form button')?.focus();
}
// Hora de la columna: no la llevan lo prolongado ni los programas (su inicio
// puede ser de otro día).
const calHoraCita = e => ['prolongada', 'programa'].includes(calPresentacion(e)) ? ''
  : extremoVisible(e.programacion?.valor?.cuando?.inicio, CALENDARIO.zona).hora || '';
// Tarjeta de la lista: la hora en su columna; título, lugar y tipo de plan con
// precio. Lo prolongado lleva sus fechas en vez de hora.
function calCita(e){
  const v = e.programacion?.valor, estado = v?.programacion;
  const prolongada = calPresentacion(e) === 'prolongada', hora = calHoraCita(e);
  const lugar = calLugar(e);
  const plan = [...(e.formatos || []).map(calNombreFormato), e.precio && CAL_PRECIOS[e.precio] ? t(CAL_PRECIOS[e.precio]) : '',
    e.tiene_programa ? '▸ ' + t('calPrograma') : ''].filter(Boolean).join(' · ');
  return `<article class="cal-cita"><span class="cal-hora">${calEsc(hora)}</span><div class="cal-cita-cuerpo">
    <h3>${calBoton('evento', calNombre(e), e.id, 'aria-haspopup="dialog"')}</h3>
    ${prolongada ? `<p class="cal-cuando">${calEsc(calHora(e))}</p>` : ''}${lugar ? `<p class="cal-nota">${calEsc(lugar)}</p>` : ''}
    ${plan ? `<p class="cal-plan">${calEsc(plan)}</p>` : ''}
    ${estado === 'cancelado' || estado === 'aplazado' ? `<p class="cal-aviso">${calEsc(t(estado === 'cancelado' ? 'calCancelado' : 'calAplazado'))}</p>` : ''}</div></article>`;
}
// Citas de un día: primero con hora (así llegan de la API) y después, bajo su
// rótulo, las que no la tienen y los programas.
function calCitas(eventos){
  let rotulo = false;
  return eventos.map(e => {
    const sinHora = !rotulo && calPresentacion(e) !== 'prolongada' && !calHoraCita(e);
    if (sinHora) rotulo = true;
    return (sinHora ? `<p class="cal-sin-hora">${calEsc(t('calSinHora'))}</p>` : '') + calCita(e);
  }).join('');
}
const calDiaLargo = dia => calFecha(dia, { weekday: 'long', month: 'long' });
function calCuentas(d){
  return [calN('calNCitas', d.citas + d.programas), d.en_curso ? t('calNEnCurso', { n: d.en_curso }) : ''].filter(Boolean).join(' · ');
}
const calCategoria = c => CAL_CATEGORIAS.includes(c) ? c : 'otras';
// Categorías con algo ese día, para los puntos. Lo prolongado de cultura
// (exposiciones, ciclos) está casi todos los días y taparía lo demás: allí
// solo cuentan citas y programas; en el resto, también lo que está en curso
// (un GP o un torneo).
function calPuntos(d){
  const hay = new Set();
  for (const [c, n] of Object.entries(d?.categorias || {})){
    if (n.citas + n.programas > 0 || (calCategoria(c) !== 'cultura' && n.en_curso > 0)) hay.add(calCategoria(c));
  }
  return [...CAL_CATEGORIAS, 'otras'].filter(c => hay.has(c));
}
// En Deportes el mes enseña competiciones: «NBA 9» (partidos) o «F1» (GP,
// torneo); dos como mucho y «+N». La elegida va primero.
const calModoDeportes = () => Boolean(CALENDARIO.meta) && (calRaizElegida() === 'deportes'
  || Boolean(CALENDARIO.orden?.ambitos.some(a => AMBITOS[a]?.codigo)));
function calMarcas(d){
  const s = CALENDARIO, orden = Object.keys(CAL_MARCAS);
  const hay = Object.entries(d?.competiciones || {}).filter(([c, n]) => CAL_MARCAS[c] && n.citas + n.programas + n.en_curso > 0)
    .sort(([a], [b]) => (b === s.competicion) - (a === s.competicion) || orden.indexOf(a) - orden.indexOf(b));
  return hay.map(([c, n]) => ({ c, texto: CAL_MARCAS[c] + (n.citas > 1 ? ' ' + n.citas : ''),
    nombre: calNombreCompeticion(c) + (n.citas ? ' · ' + calN('calNPartidos', n.citas) : '') }));
}
const calMarcasHtml = marcas => marcas.length ? `<span class="cal-marcas" aria-hidden="true">${marcas.slice(0, 2).map(m => `<span class="cal-marca">${calEsc(m.texto)}</span>`).join('')}
  ${marcas.length > 2 ? `<span class="cal-marca cal-mas">+${marcas.length - 2}</span>` : ''}</span>` : '';
const calNombreCompeticion = c => AMBITOS[c]?.noticias?.[0] || c;
const calPuntosHtml = cats => cats.length ? `<span class="cal-puntos" aria-hidden="true">${cats.map(c => `<span class="cal-punto cal-cat-${c}"></span>`).join('')}</span>` : '';
const calNombreCategoria = c => c === 'otras' ? t('calOtras') : calNombre(CALENDARIO.meta?.catalogo?.conceptos?.[c]);
// Un día de la lista: sus muestras y «Ver las N citas»; abierta, todas.
function calDiaLista(d){
  const s = CALENDARIO, l = s.dias.get(d.dia + '|citas'), citas = d.citas + d.programas;
  let cuerpo;
  if (l?.abierta && l.cargada){
    cuerpo = calCitas(l.eventos) + `<div class="cal-paginacion">${l.siguiente ? calBoton('mas-dia', t('calCargarMas'), d.dia, l.cargando ? 'disabled' : '') : ''}
      ${calBoton('ocultar-dia', t('calOcultar'), d.dia)}</div>`;
  } else {
    cuerpo = calCitas(d.muestras) + (citas > d.muestras.length
      ? `<div class="cal-paginacion">${calBoton('ver-dia', t('calVerCitas', { n: citas, dia: calFecha(d.dia, { weekday: 'long', day: undefined, month: undefined }) }), d.dia, l?.cargando ? 'disabled' : '')}</div>` : '');
  }
  const hoy = calHoy();
  return `<section class="cal-dia${d.dia < hoy ? ' cal-pasado' : ''}" id="cal-dia-${d.dia}"><h2>${calEsc(d.dia === hoy ? t('calHoy') + ' · ' + calFecha(d.dia, { weekday: 'long' }) : calDiaLargo(d.dia))}
    <small>${calEsc(calN('calNCitas', citas))}${d.dia < hoy ? ' · ' + calEsc(t('calPasado')) : ''}</small></h2>${cuerpo}</section>`;
}
// «En cartel»: lo prolongado (exposiciones, ciclos, torneos) del primer día
// de la lista, plegado y aparte de las citas.
function calEnCurso(d){
  if (!d?.en_curso) return '';
  const s = CALENDARIO, l = s.dias.get(d.dia + '|curso'), abierta = Boolean(l?.abierta);
  return `<section class="cal-en-curso">${calBoton('curso', (abierta ? '▾ ' : '▸ ') + t('calEnCartel', { n: d.en_curso }), d.dia, `aria-expanded="${abierta}"`)}
    ${abierta ? `<p class="cal-nota">${calEsc(t('calProgramacionesNota'))}</p>${(l.eventos || []).map(calCita).join('')}
      ${l.siguiente ? `<div class="cal-paginacion">${calBoton('mas-curso', t('calCargarMas'), d.dia, l.cargando ? 'disabled' : '')}</div>` : ''}` : ''}</section>`;
}
// Días que enseña la lista: los del atajo o, sin él, desde el día elegido.
function calDiasLista(){
  const s = CALENDARIO, r = s.resumen || [];
  if (s.rango === 'finde'){
    const fin = ventanaCalendario(s.fecha, 'semana').slice(5);
    return r.filter(d => fin.includes(d.dia) && d.dia >= calHoy());
  }
  if (s.rango) return r.filter(d => d.dia === s.fecha);
  return r.filter(d => d.dia >= s.fecha);
}
function calLista(){
  const s = CALENDARIO;
  if (!s.resumen) return '';
  const dias = calDiasLista(), conCitas = dias.filter(d => d.citas + d.programas);
  const vacio = !conCitas.length ? `<p class="cal-nota cal-vacio">${calEsc(t(s.rango ? 'calDiaSinCitas' : 'calSinCitas'))}</p>` : '';
  const mas = !s.rango && s.semanas < CAL_SEMANAS_MAX ? `<div class="cal-paginacion">${calBoton('mas-semanas', t('calSemanaSiguiente'), '', s.cargando ? 'disabled' : '')}</div>` : '';
  return calEnCurso(dias[0]) + conCitas.map(calDiaLista).join('') + vacio + mas;
}
// Una celda de la tira o del mes: inicial del día, número y puntos.
function calCeldaDia(dia, d, { otroMes = false } = {}){
  const s = CALENDARIO, hoy = calHoy(), deportes = calModoDeportes();
  const cats = deportes ? [] : calPuntos(d), marcas = deportes ? calMarcas(d) : [];
  const detalle = deportes ? marcas.map(m => m.nombre) : cats.map(calNombreCategoria);
  const etiqueta = `${calDiaLargo(dia)}: ${d ? calCuentas(d) : calN('calNCitas', 0)}${detalle.length ? ' · ' + detalle.join(', ') : ''}`;
  return `<button type="button" class="cal-celda${otroMes ? ' cal-otro-mes' : ''}${dia < hoy ? ' cal-pasado' : ''}" data-cal="dia" data-valor="${dia}"
    aria-pressed="${dia === s.fecha}"${dia === hoy ? ' aria-current="date"' : ''} aria-label="${calEsc(etiqueta)}">
    <span class="cal-num">${calEsc(calFecha(dia, { month: undefined }))}</span>${deportes ? calMarcasHtml(marcas) : calPuntosHtml(cats)}</button>`;
}
const calCabeceraSemana = dias => dias.slice(0, 7).map(dia => `<abbr class="cal-semana-nombre" title="${calEsc(calFecha(dia, { weekday: 'long', day: undefined, month: undefined }))}">${calEsc(calFecha(dia, { weekday: 'narrow', day: undefined, month: undefined }))}</abbr>`).join('');
// Tira (Apple Calendar, SofaScore): la semana del día elegido; desplegada, el mes.
function calTira(){
  const s = CALENDARIO, porDia = new Map([...(s.resumen || []), ...(s.mesAbierto ? s.mes?.dias || [] : [])].map(d => [d.dia, d]));
  const dias = s.mesAbierto ? ventanaCalendario(s.fecha, 'mes') : ventanaCalendario(s.fecha, 'semana');
  const titulo = calFecha(s.fecha, { month: 'long', year: 'numeric', day: undefined });
  const [ant, sig] = s.mesAbierto ? ['calMesAnterior', 'calMesSiguiente'] : ['calSemanaAnterior', 'calSemanaPosterior'];
  return `<div class="cal-tira"><div class="cal-tira-cabecera">${calBoton('anterior', '‹', '', `aria-label="${calEsc(t(ant))}"`)}
    ${calBoton('mes', titulo + (s.mesAbierto ? ' ▴' : ' ▾'), '', `class="cal-tira-titulo" aria-expanded="${s.mesAbierto}"`)}${calBoton('siguiente', '›', '', `aria-label="${calEsc(t(sig))}"`)}</div>
    <div class="cal-mes" role="group" aria-label="${calEsc(t(s.mesAbierto ? 'calMes' : 'calSemana'))}">${calCabeceraSemana(dias)}${dias.map(dia =>
      calCeldaDia(dia, porDia.get(dia), { otroMes: s.mesAbierto && dia.slice(0, 7) !== s.fecha.slice(0, 7) })).join('')}</div>
    ${calModoDeportes() ? '' : `<p class="cal-leyenda">${[...CAL_CATEGORIAS, 'otras'].map(c => `<span><span class="cal-punto cal-cat-${c}" aria-hidden="true"></span>${calEsc(calNombreCategoria(c))}</span>`).join('')}</p>`}
    ${s.mesAbierto && calModoDeportes() ? calTemporada() : ''}</div>`;
}
// Este mes en deportes (calendario de temporada de la app de F1, SofaScore):
// por competición, sus GP o torneos con fechas y los partidos publicados.
function calTemporada(){
  const s = CALENDARIO, mes = s.fecha.slice(0, 7), dias = (s.mes?.dias || []).filter(d => d.dia.slice(0, 7) === mes);
  const partidos = {};
  for (const d of dias) for (const [c, n] of Object.entries(d.competiciones || {})) partidos[c] = (partidos[c] || 0) + n.citas;
  const largos = {};
  for (const e of s.temporada?.eventos || []) for (const c of e.competiciones || []) (largos[c] ||= []).push(e);
  const parcial = c => s.meta?.colecciones?.some(x => x.coleccion === c && x.calendario_completo === false);
  const rango = e => {
    const v = e.programacion?.valor?.cuando, a = extremoVisible(v?.inicio, s.zona).fecha, b = extremoVisible(v?.fin, s.zona).fecha;
    return a ? calFecha(a) + (b && b !== a ? '–' + calFecha(b) : '') : t('calFechaPendiente');
  };
  const filas = Object.keys(CAL_MARCAS).filter(c => partidos[c] || largos[c]?.length).map(c => {
    const lista = largos[c] || [];
    return `<li class="cal-temporada-fila">${calBoton('competicion', calNombreCompeticion(c), c, `aria-pressed="${s.competicion === c}"`)}
      ${partidos[c] ? `<span class="cal-nota">${calEsc(calN('calNPartidos', partidos[c]))}</span>` : ''}${parcial(c) ? `<span class="cal-nota">· ${calEsc(t('calParcial'))}</span>` : ''}
      ${lista.length ? `<ul>${lista.slice(0, 4).map(e => `<li>${calBoton('evento', calNombre(e), e.id, 'aria-haspopup="dialog"')} <span class="cal-cuando">${calEsc(rango(e))}</span></li>`).join('')}
        ${lista.length > 4 ? `<li class="cal-nota">${calEsc(t('calYMas', { n: lista.length - 4 }))}</li>` : ''}</ul>` : ''}</li>`;
  });
  return `<section class="cal-temporada"><h2>${calEsc(t('calEsteMes', { mes: calFecha(s.fecha, { month: 'long', day: undefined }) }))}</h2>
    ${filas.length ? `<ul>${filas.join('')}</ul>` : `<p class="cal-nota">${calEsc(s.temporada?.eventos ? t('calSinDeportes') : t('calCargando'))}</p>`}</section>`;
}
function calPendientes(){
  const p = CALENDARIO.pendientes;
  if (!p) return `<div class="cal-pendientes">${calBoton('pendientes', t('calVerPendientes'))}</div>`;
  return `<section class="cal-pendientes"><h2>${calEsc(t('calSinFecha'))}</h2>
    ${p.eventos.map(calCita).join('') || (p.cargando ? '' : `<p class="cal-nota">${calEsc(t('calNingunaPendiente'))}</p>`)}
    ${p.siguiente ? calBoton('mas-pendientes', t('calCargarMas'), '', p.cargando ? 'disabled' : '') : ''}</section>`;
}
// Dónde: comunidades, provincias y municipios del catálogo territorial común
// (los municipios, con la lista del tiempo).
function sugerirDonde(texto){
  const s = CALENDARIO, q = normalize(texto).trim();
  if (q.length < 2){ s.sugerencias.donde = []; return void pintarSugerencias('donde'); }
  if (!TIEMPO.indice) municipiosTiempo().then(() => { if (s.escrito.donde === texto) sugerirDonde(texto); }).catch(() => {});
  const casa = x => x.nombre.split('/').some(n => normalize(n).trim().startsWith(q));
  const fijos = [...ADMINISTRACION.regiones.map(([c, n]) => ({ id: 'es:autonomia:' + c, nombre: n, meta: t('calComunidad') })),
    ...ADMINISTRACION.provincias.map(([c, n]) => ({ id: 'es:provincia:' + c, nombre: n, meta: t('calProvincia') }))].filter(casa);
  const municipios = TIEMPO.indice ? sugerirMunicipios(TIEMPO.indice, texto, 6)
    .map(m => ({ id: 'es:municipio:' + m.ine, nombre: m.nombre, meta: provinciaDe(m.ine) })) : [];
  s.sugerencias.donde = [...fijos.slice(0, 3), ...municipios].slice(0, 8);
  pintarSugerencias('donde');
}
const calSugerenciasHtml = campo => CALENDARIO.sugerencias[campo].map(x => `<button type="button" data-cal="elegir-${campo}" data-valor="${calEsc(x.id)}" data-nombre="${calEsc(x.nombre)}">${calEsc(x.nombre)}${x.meta ? ` <small>${calEsc(x.meta)}</small>` : ''}</button>`).join('');
function pintarSugerencias(campo){
  const el = document.getElementById('cal-sug-' + campo);
  if (el) el.innerHTML = calSugerenciasHtml(campo);
}
// La ciudad, arriba (Time Out, Fever): su nombre abre el buscador de sitios.
function calDonde(){
  const s = CALENDARIO;
  if (!s.editandoDonde) return `<div class="cal-donde">${calBoton('editar-donde', '📍 ' + (s.donde?.nombre || t('calTodaEspana')) + ' ▾', '', `class="cal-donde-nombre" aria-label="${calEsc(t('calCambiarSitio', { x: s.donde?.nombre || t('calTodaEspana') }))}"`)}
    ${s.donde ? calBoton('quitar-donde', '✕', '', `class="cal-icono" aria-label="${calEsc(t('calQuitar', { x: s.donde.nombre }))}"`) : ''}</div>`;
  return `<div class="cal-donde cal-campo-sug"><label for="cal-donde" class="sr-only">${calEsc(t('calDonde'))}</label>
    <input id="cal-donde" type="search" autocomplete="off" value="${calEsc(s.escrito.donde)}" placeholder="${calEsc(t('calDondeEjemplo'))}" aria-controls="cal-sug-donde">
    <div id="cal-sug-donde" class="cal-sugerencias" role="group" aria-label="${calEsc(t('calSugerencias'))}">${calSugerenciasHtml('donde')}</div></div>`;
}
// Chips: Todo · Cultura · Deportes · Gratis; elegida una categoría, una
// segunda fila con sus subcategorías o competiciones (SofaScore, Fever).
const calHijos = (conceptos, r) => Object.keys(conceptos).filter(i => conceptos[i].padres.includes(r));
function calRaizElegida(){
  const s = CALENDARIO, conceptos = s.meta.catalogo.conceptos;
  return CAL_CATEGORIAS.find(c => s.temas.has(c) || calHijos(conceptos, c).some(h => s.temas.has(h))) || '';
}
function calChips(){
  const s = CALENDARIO, m = s.meta;
  if (!m) return '';
  const conceptos = m.catalogo.conceptos, raiz = calRaizElegida();
  const chip = (accion, label, valor, pulsado, clase = '') => calBoton(accion, label, valor, `class="${clase}" aria-pressed="${pulsado}"`);
  const fijas = CAL_CATEGORIAS.filter(c => conceptos[c]);
  const primera = `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calTemas'))}">${chip('categoria', t('calTodo'), '', !raiz && !s.competicion)}
    ${fijas.map(c => chip('categoria', calNombre(conceptos[c]), c, raiz === c, 'cal-cat cal-cat-' + c)).join('')}
    ${calBoton('gratis', t('calPrecioGratis'), '', `aria-pressed="${s.precio === 'gratis'}" title="${calEsc(t('calGratisNota'))}"`)}</div>`;
  let segunda = '';
  let tercera = '';
  if (raiz === 'deportes' && !s.orden?.ambitos.length){
    segunda = Object.keys(CAL_DEPORTES).map(k => chip('deporte', t(CAL_NOMBRES_DEPORTE[k]), k, s.deporte === k)).join('');
    if (s.deporte) tercera = CAL_DEPORTES[s.deporte].map(k => chip('competicion', calNombreCompeticion(k), k, s.competicion === k)).join('');
  } else if (raiz) segunda = calHijos(conceptos, raiz).map(i => chip('tema', calNombre(conceptos[i]), i, s.temas.has(i))).join('');
  const fila = (html, label) => html ? `<div class="cal-chips cal-subchips ui-tira" role="group" aria-label="${calEsc(label)}">${html}</div>` : '';
  return primera + fila(segunda, calNombre(conceptos[raiz])) + fila(tercera, s.deporte ? t(CAL_NOMBRES_DEPORTE[s.deporte]) : '');
}
function calContenido(){
  const s = CALENDARIO;
  if (s.orden?.desconocidos.length) return `<p class="cal-aviso">${calEsc(t('calConsultaDesconocida', { x: s.orden.desconocidos.join(', ') }))}</p>`;
  if (!s.meta) return '';
  const { desde, hasta, acotada } = calVentana();
  if (desde >= hasta) return `<p class="cal-aviso">${calEsc(t('calFueraHorizonte'))}</p>`;
  return calTira() + calLista() + (s.resumen && !acotada ? calPendientes() : '');
}
function pintarCalendario(){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  if (!p) return;
  const visible = CALENDARIO_ACTIVO && s.abierto;
  p.hidden = !visible;
  document.body.classList.toggle('calendario-abierto', visible);
  document.getElementById('btn-calendario')?.setAttribute('aria-expanded', String(visible));
  if (!visible) return;
  s.fecha ||= calHoy();
  const foco = p.contains(document.activeElement) ? document.activeElement : null;
  const id = foco?.id, accion = foco?.dataset.cal, valor = foco?.dataset.valor;
  const seleccion = foco?.type === 'search' ? [foco.selectionStart, foco.selectionEnd] : null;
  p.setAttribute('aria-busy', String(s.cargando));
  const hoy = calHoy(), manana = sumarDiasCalendario(hoy, 1);
  const rango = (k, dia) => calBoton('rango', t(CAL_RANGOS[k]), k, `aria-pressed="${s.rango === k}"${dia ? ` data-dia="${dia}"` : ''}`);
  // Arriba la ciudad y las acciones; debajo, atajos de fecha y chips.
  p.innerHTML = `<div class="cal-barra"><h1 id="cal-titulo" class="sr-only" tabindex="-1">${calEsc(t('calTitulo'))}</h1>
    ${calDonde()}<div class="cal-acciones">${calBoton('renovar', '↻', '', `class="cal-icono" aria-label="${calEsc(t('calActualizar'))}" title="${calEsc(t('calActualizar'))}"${s.cargando ? ' disabled' : ''}`)}
    ${calBoton('cerrar', t(s.orden?.noticias ? 'calVerNoticias' : 'calCerrar'))}</div>
    <div class="cal-chips cal-rangos ui-tira" role="group" aria-label="${calEsc(t('calCuando'))}">${rango('hoy', hoy)}${rango('manana', manana)}${rango('finde')}
    ${calBoton('elegir-fecha', '📅', '', `class="cal-icono" aria-label="${calEsc(t('calFecha'))}" title="${calEsc(t('calFecha'))}"`)}
    <input id="cal-fecha" class="sr-only" type="date" tabindex="-1" aria-hidden="true" value="${s.fecha}"></div>
    ${calChips()}</div>
    <div class="cal-cuerpo"><p class="cal-estado" role="status">${calEsc(s.error ? t(s.error) : s.cargando ? t('calCargando') : '')}</p>
    ${s.error === 'calError' ? calBoton('renovar', t('calReintentar')) : ''}<div class="cal-contenido">${calContenido()}</div>
    ${s.meta ? `<p class="cal-nota cal-pie">${calEsc(t('calCobertura'))} ${calEsc(t('calGenerado', { fecha: calFormato({ dateStyle: 'short', timeStyle: 'short', timeZone: s.zona }).format(new Date(s.meta.generado)) }))}</p>` : ''}
    ${s.orden?.noticias ? `<p class="cal-nota">${calEsc(t('calNoticiasTexto'))}</p>` : ''}</div>`;
  const siguiente = id ? document.getElementById(id) : [...p.querySelectorAll('[data-cal]')].find(b => b.dataset.cal === accion && b.dataset.valor === valor);
  siguiente?.focus({ preventScroll: true });
  if (seleccion && siguiente?.type === 'search') siguiente.setSelectionRange(...seleccion);
}
// Fecha elegida: la tira salta a su semana y la lista empieza en ese día.
function calElegirDia(dia, rango = ''){
  const s = CALENDARIO;
  s.fecha = dia; s.rango = rango; s.semanas = 1;
}
function wireCalendario(){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  const boton = document.getElementById('btn-calendario');
  boton.hidden = !CALENDARIO_ACTIVO;
  boton.addEventListener('click', e => s.abierto ? salirCalendario() : abrirCalendario(e.currentTarget));
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-cal]');
    if (!b) return;
    const a = b.dataset.cal, v = b.dataset.valor;
    if (a === 'cerrar') return salirCalendario();
    if (a === 'elegir-fecha'){
      const f = document.getElementById('cal-fecha');
      try { return void f.showPicker(); } catch { return void f.click(); }
    }
    if (a === 'renovar') return void cargarCalendario(true);
    if (a === 'evento') return void abrirEventoCalendario(v);
    if (a === 'pendientes' || a === 'mas-pendientes') return void pendientesCalendario(a === 'mas-pendientes');
    if (a === 'ver-dia' || a === 'mas-dia') return void abrirDiaCalendario(v, 'citas', a === 'mas-dia');
    if (a === 'mas-curso') return void abrirDiaCalendario(v, 'curso', true);
    if (a === 'curso' || a === 'ocultar-dia'){
      const l = s.dias.get(v + (a === 'curso' ? '|curso' : '|citas'));
      if (a === 'curso' && !l?.abierta) return void abrirDiaCalendario(v, 'curso');
      l.abierta = false; return void pintarCalendario();
    }
    if (a === 'mes'){ s.mesAbierto = !s.mesAbierto; return void consultarCalendario(); }
    if (a === 'editar-donde'){
      s.editandoDonde = true; pintarCalendario();
      return void document.getElementById('cal-donde')?.focus();
    }
    let enfocar = '';
    if (a === 'elegir-donde'){
      calElegirDonde({ id: v, nombre: b.dataset.nombre }); s.escrito.donde = ''; s.sugerencias.donde = []; s.editandoDonde = false;
      enfocar = '[data-cal="editar-donde"]';
    }
    if (a === 'quitar-donde'){ calElegirDonde(null); enfocar = '[data-cal="editar-donde"]'; }
    // En el mes, tocar un día lo elige y pliega la tira (Apple Calendar).
    if (a === 'dia'){ calElegirDia(v); s.mesAbierto = false; }
    if (a === 'rango'){
      if (s.rango === v) calElegirDia(calHoy());
      else calElegirDia(v === 'finde' ? ventanaCalendario(calHoy(), 'semana')[5] : b.dataset.dia, v);
      if (v === 'finde' && s.fecha < calHoy()) s.fecha = calHoy();
    }
    // Semana o mes vecinos: su primer día, o hoy si cae en ellos.
    if (a === 'anterior' || a === 'siguiente'){
      const vista = s.mesAbierto ? 'mes' : 'semana', dias = ventanaCalendario(moverFecha(s.fecha, vista, a === 'anterior' ? -1 : 1), vista);
      const propios = s.mesAbierto ? dias.filter(d => d.slice(0, 7) === dias[15].slice(0, 7)) : dias;
      calElegirDia(propios.includes(calHoy()) ? calHoy() : propios[0]);
    }
    if (a === 'mas-semanas') s.semanas = Math.min(CAL_SEMANAS_MAX, s.semanas + 1);
    // Deportes abre el mes: sus fechas se ven mejor de un vistazo.
    if (a === 'categoria'){
      s.temas.clear(); s.deporte = ''; s.competicion = '';
      if (v) s.temas.add(v);
      if (v === 'deportes') s.mesAbierto = true;
    }
    if (a === 'deporte'){ s.deporte = s.deporte === v ? '' : v; s.competicion = ''; }
    // Una subcategoría sustituye a su raíz y se quita volviendo a pulsarla.
    if (a === 'tema'){
      const raiz = calRaizElegida(), pulsado = s.temas.has(v);
      s.temas.clear(); s.temas.add(pulsado ? raiz : v);
    }
    if (a === 'competicion') s.competicion = s.competicion === v ? '' : v;
    if (a === 'gratis') s.precio = s.precio === 'gratis' ? '' : 'gratis';
    consultarCalendario();
    if (enfocar) p.querySelector(enfocar)?.focus({ preventScroll: true });
  });
  p.addEventListener('change', e => {
    const id = e.target.id, v = e.target.value;
    if (id !== 'cal-fecha' || !fechaValida(v)) return;
    calElegirDia(v); consultarCalendario();
  });
  p.addEventListener('input', e => {
    if (e.target.id === 'cal-donde'){ s.escrito.donde = e.target.value; sugerirDonde(e.target.value); }
  });
  // Teclado en el buscador de sitios: ↓ entra en la lista, Intro elige la
  // primera, Escape la cierra y vuelve al nombre de la ciudad.
  p.addEventListener('keydown', e => {
    if (e.target.id !== 'cal-donde' && e.target.dataset?.cal !== 'elegir-donde') return;
    const botones = [...p.querySelectorAll('#cal-sug-donde button')], i = botones.indexOf(e.target);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      const destino = e.key === 'ArrowDown' ? botones[i + 1] : i > 0 ? botones[i - 1] : document.getElementById('cal-donde');
      if (destino){ e.preventDefault(); destino.focus(); }
    } else if (e.key === 'Enter' && i < 0 && botones[0]){
      e.preventDefault(); botones[0].click();
    } else if (e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      s.sugerencias.donde = []; s.editandoDonde = false; s.escrito.donde = ''; pintarCalendario();
      p.querySelector('[data-cal="editar-donde"]')?.focus();
    }
  });
  // Escribir cierra la vista abierta desde la cabecera; la de un prefijo sigue al prefijo.
  document.getElementById('buscar').addEventListener('input', () => { if (!s.porPrefijo) cerrarCalendario(false); });
}
function sugerenciasCalendario(raw){
  if (!CALENDARIO_ACTIVO) return null;
  const m = raw.match(/(?:^|\s)([^\s"]*)$/);
  if (!m || !m[1]) return null;
  const q = normalize(m[1]);
  const opciones = [...Object.keys(AMBITOS).map(a => a + ':'), 'calendario:', 'circuito:atp,wta'];
  const seleccion = opciones.filter(v => normalize(v).startsWith(q));
  if (!seleccion.length) return q.includes(':') && leerConsultaCalendario(q) ? [] : null;
  return seleccion.slice(0,8).map(value => ({ kind: 'calendario', value, label: value,
    tipo: t('calTitulo') }));
}
