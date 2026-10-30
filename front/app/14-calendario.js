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
// Preferencias del calendario, solo en este dispositivo: sitio, intereses y
// competiciones que sigo. «omitido» recuerda «Ahora no».
const CAL_PREF_KEY = 'voceiro-calendario-preferencias-v1';
const CAL_PASOS = ['sitio', 'intereses', 'competiciones', 'resumen'];
// Deportes por deporte y sus competiciones (SofaScore): dos toques hasta una liga.
const CAL_DEPORTES = { futbol: ['primera', 'segunda'], baloncesto: ['nba', 'wnba', 'feb-endesa', 'feb-primera', 'feb-challenge'],
  motor: ['f1', 'motogp', 'wrc'], tenis: ['atp', 'wta'] };
const CAL_NOMBRES_DEPORTE = { futbol: 'calFutbol', baloncesto: 'calBaloncesto', motor: 'calMotor', tenis: 'calTenis' };
const CAL_COMPETICIONES = Object.values(CAL_DEPORTES).flat();
// Cada competición lleva el color de su deporte (--dep-*); lo demás, el de su categoría.
const CAL_DEPORTE_DE = Object.fromEntries(Object.entries(CAL_DEPORTES).flatMap(([k, cs]) => cs.map(c => [c, k])));
const calDeporte = e => (e.competiciones || []).map(c => CAL_DEPORTE_DE[c]).find(Boolean);
const calColor = e => calDeporte(e) ? 'cal-dep cal-dep-' + calDeporte(e) : 'cal-cat-' + calCategoria(e.categoria);
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
  temas: new Set(), mio: false, prefs: null, asistente: null, temporada: null, temporadaAbierta: false, disp: null,
  // vista: «agenda» (la de un sitio: cultura y ocio, y su deporte local) o
  // «deportes» (por competición, sin sitio), cada una con su botón.
  // capas: competiciones marcadas en Deportes.
  vista: 'agenda', capas: null,
  // desplegado: «día~id» del evento abierto en la lista; detalles: su ficha por id
  // (null si falló), hasta renovar.
  desplegado: '', detalles: new Map(), precio: '', donde: null, dondeAuto: false, editandoDonde: false, clave: '',
  escrito: { donde: '' }, sugerencias: { donde: [] },
  consulta: '', vigente: '', controller: null, resumen: null, dias: new Map(), pendientes: null, origen: null, scroll: 0,
};
const iconoCalendario = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/></svg>';
// Trofeo: copa, asas y peana.
const iconoDeportes = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3m-5 4v4m-4 3h8l-1-3H9l-1 3Z"/></svg>';
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
// Temas con algo en el sitio de la agenda (precalculado al publicar): los
// subchips solo ofrecen esos. Mientras llega, o si falla, se ofrecen todos.
async function calDisponibilidadSitio(){
  const s = CALENDARIO, clave = s.donde?.id || '';
  if (s.disp?.clave === clave) return;
  s.disp?.controller.abort();
  const d = s.disp = { clave, temas: null, controller: new AbortController() };
  try {
    const dato = await calPedir('catalogo', { disponibilidad: 1, territorio: clave }, d.controller.signal);
    if (s.disp !== d) return;
    d.temas = dato.disponibilidad?.temas || null;
    pintarCalendario();
  } catch { /* Sin filtro: todas las subcategorías. */ }
}
// Mensaje de un fallo. Un 429 es el límite por IP: se avisa de la espera y, al
// terminar, se vuelve a pedir solo (un reintento aunque fallen varias a la vez).
let calReintentoPendiente = false;
function calFallo(e){
  if (e?.status !== 429) return e?.status === 422 ? 'calFueraHorizonte' : 'calError';
  if (!calReintentoPendiente){
    calReintentoPendiente = true;
    setTimeout(() => {
      calReintentoPendiente = false;
      const s = CALENDARIO;
      if (!s.abierto) return;
      s.error = ''; s.consulta = ''; s.mes = null; consultarCalendario();
    }, Math.max(1000, calEsperaHasta - Date.now()));
  }
  return 'calEspera';
}
const calSegundosEspera = () => Math.max(1, Math.ceil((calEsperaHasta - Date.now()) / 1000));
// La publicación avanza a diario: cada respuesta trae su revisión y cobertura.
function calAnotar(dato){
  const m = CALENDARIO.meta;
  // Otra publicación: las fichas guardadas pueden haber cambiado.
  if (m && dato.revision && dato.revision !== m.revision) CALENDARIO.detalles.clear();
  if (m) for (const k of ['revision', 'generado', 'horizonte', 'cobertura', 'colecciones']) m[k] = dato[k];
}
function calParametros(){
  // Cada vista toma de la orden solo lo suyo: Deportes, las competiciones; la
  // agenda, los temas. Una orden solo de noticias no filtra el calendario.
  const s = CALENDARIO, o = calPideAgenda(s.orden) ? s.orden : null, deportes = calModoDeportes();
  const ambitos = [...(o?.ambitos || []).filter(a => Boolean(AMBITOS[a]?.codigo) === deportes), ...(deportes ? s.capas || [] : [])];
  const circuitos = deportes ? o?.circuitos || [] : [];
  const q = [...ambitos.map(a => a + ':'), ...(circuitos.length ? ['circuito:' + circuitos.join(',')] : [])].join(' ');
  // La agenda va siempre acotada a su sitio (territorio estricto); Deportes,
  // por competición y sin sitio: las competiciones no tienen territorio.
  return { zona: s.zona, q, texto: calLibre(o?.resto), temas: deportes ? '' : [...s.temas].join(','),
    precio: deportes ? '' : s.precio, territorio: deportes ? '' : s.donde?.id || '' };
}
// desde:/hasta: del buscador. Los relativos (hoy, ayer, 7d) el parser los
// cuenta desde el día del navegador; el calendario, desde el hoy de su zona.
function calFechasConsulta(resto){
  const p = parseQuery(resto || ''), desfase = calDiferencia(parseQuery('desde:hoy').desde, calHoy());
  const fecha = tipo => {
    const v = p[tipo], texto = p.chips?.find(c => c.type === tipo)?.value || '';
    return fechaValida(v) && /^(hoy|ayer|\d+[dhm])$/i.test(texto.trim()) ? sumarDiasCalendario(v, desfase) : v;
  };
  return { desde: fecha('desde'), hasta: fecha('hasta') };
}
// Días de la vista y su ventana [desde, hasta) dentro de lo publicado.
// desde:/hasta: del buscador acotan la celebración; en noticias, la publicación.
function calVentana(){
  const s = CALENDARIO, h = s.meta?.horizonte, p = calFechasConsulta(s.orden?.resto);
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
  if (renovar){ s.mes = null; s.temporada = null; s.disp = null; s.detalles.clear(); s.desplegado = ''; s.detalleLista?.abort(); }
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  s.cargando = true; s.error = ''; pintarCalendario();
  try {
    s.meta = await calPedir('catalogo', {}, controller.signal); s.cargado = Date.now();
  } catch (e){
    if (controller.signal.aborted) return;
    s.cargando = false; s.error = calFallo(e); return void pintarCalendario();
  }
  s.consulta = ''; s.pendientes = null;
  consultarCalendario();
}
async function consultarCalendario(){
  const s = CALENDARIO;
  if (!s.meta) return void cargarCalendario();
  s.fecha ||= calHoy();
  if (calSinSitio() || calMixta()){
    s.controller?.abort(); s.consulta = s.vigente = ''; s.resumen = null; s.barras = []; s.cargando = false;
    return void pintarCalendario();
  }
  const { desde, hasta } = calVentana();
  if (s.mesAbierto) cargarMesCalendario();
  // Los subchips solo se ven con una categoría elegida: solo entonces hace falta.
  if (!calModoDeportes() && calRaizElegida()) calDisponibilidadSitio();
  // Tira y lista salen del mismo resumen: cuentas por categoría, tres muestras
  // por día y, en Deportes, las barras (los GP van a cada día de la lista como
  // «todo el día»; solo las competiciones tienen barra).
  const params = { ...calParametros(), desde, hasta, muestras: 3, barras: calModoDeportes() ? 1 : '' };
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
    calAnotar(dato); s.vigente = clave; s.resumen = dato.dias; s.barras = dato.barras || []; s.dias.clear(); s.reintento = false;
  } catch (e){
    if (controller.signal.aborted) return;
    // Republicación en curso: un reintento lee ya la revisión nueva.
    if (e.status === 409 && !s.reintento){ s.reintento = true; s.consulta = ''; s.cargando = false; return void consultarCalendario(); }
    s.error = calFallo(e);
    // Lo que quedaba a la vista era de otra consulta: no se presenta como suyo.
    if (clave !== s.vigente){ s.resumen = null; s.barras = []; }
  }
  s.cargando = false; pintarCalendario();
}
// Mes desplegado: solo cuentas (sin muestras) de sus 42 días, al abrirlo.
// Ventana [desde, hasta) recortada al horizonte publicado y a desde:/hasta: del buscador.
function calRecortar(desde, hasta){
  const s = CALENDARIO, h = s.meta?.horizonte, p = calFechasConsulta(s.orden?.resto);
  const fin = fechaValida(p.hasta) ? sumarDiasCalendario(p.hasta, 1) : null;
  return { desde: [desde, h?.desde, fechaValida(p.desde) ? p.desde : null].filter(Boolean).sort().at(-1),
    hasta: [hasta, h?.hasta, fin].filter(Boolean).sort()[0] };
}
async function cargarMesCalendario(){
  const s = CALENDARIO, { dias } = calPeriodoMes();
  const { desde, hasta } = calRecortar(dias[0], sumarDiasCalendario(dias.at(-1), 1));
  // En ancho (rejilla con títulos), la agenda pide muestras y Deportes, barras
  // (sus días llevan marcas, que salen de las cuentas); en estrecho, solo cuentas.
  const ancho = calMesAncho(), deportes = calModoDeportes();
  const params = { ...calParametros(), desde, hasta, muestras: !ancho ? 0 : !deportes ? 4 : calPartidosEnMes() ? 5 : 0, barras: ancho && deportes ? 1 : '' }, clave = JSON.stringify(params);
  // Mismos días, otro período (este mes desde hoy y el siguiente entero): el
  // bloque de Deportes sigue al mes elegido aunque la rejilla no cambie.
  if (s.mes?.clave === clave || desde >= hasta) return void (deportes && s.abierto && s.temporadaAbierta && cargarTemporadaCalendario());
  s.controllerMes?.abort();
  const controller = s.controllerMes = new AbortController();
  s.mes = { clave, dias: s.mes?.dias || null, cargando: true };
  try {
    const dato = await calPedir('resumen', params, controller.signal);
    if (s.mes?.clave !== clave) return;
    calAnotar(dato); s.mes = { clave, dias: dato.dias, barras: dato.barras || [], cargando: false };
  } catch (e){
    // Un fallo de un mes que ya no se mira (otra vista u otra selección) no es de esta.
    if (controller.signal.aborted || s.mes?.clave !== clave) return;
    s.mes = null; s.error = calFallo(e);
  }
  pintarCalendario();
  if (calModoDeportes() && s.abierto && s.temporadaAbierta) cargarTemporadaCalendario();
}
// «Este mes en deportes»: los GP y torneos del período del mes desplegado (los
// partidos se cuentan con el resumen). Unos 30 al mes con todas las competiciones; se
// siguen hasta CAL_TEMPORADA_PAGINAS páginas para no contar sobre una parcial.
const CAL_TEMPORADA_PAGINAS = 4;
async function cargarTemporadaCalendario(){
  const s = CALENDARIO, uno = s.fecha.slice(0, 8) + '01', { dias, rodante } = calPeriodoMes();
  const { desde, hasta } = rodante ? calRecortar(dias[0], sumarDiasCalendario(dias.at(-1), 1)) : calRecortar(uno, moverFecha(uno, 'mes', 1));
  const params = { ...calParametros(), desde, hasta, presentacion: 'prolongada,programa',
    circuitos: Object.keys(CAL_MARCAS).join(','), limite: 50 }, clave = JSON.stringify(params);
  if (s.temporada?.clave === clave) return;
  if (desde >= hasta){ s.temporada = { clave, eventos: [] }; return; }
  // Su propio controlador: que el mes cambie de consulta no la deja a medias.
  s.controllerTemporada?.abort();
  const controller = s.controllerTemporada = new AbortController(), actual = s.temporada = { clave, eventos: null };
  try {
    const eventos = [];
    let cursor = '';
    for (let i = 0; i < CAL_TEMPORADA_PAGINAS; i++){
      const dato = await calPedir('eventos', { ...params, cursor, revision: s.meta?.revision }, controller.signal);
      if (s.temporada !== actual) return;
      calAnotar(dato); eventos.push(...dato.eventos);
      if (!(cursor = dato.siguiente)) break;
    }
    actual.eventos = eventos; actual.parcial = Boolean(cursor);
  } catch (e){
    // Cortada sin respuesta, se puede volver a pedir.
    if (controller.signal.aborted){ if (s.temporada === actual) s.temporada = null; return; }
    if (s.temporada !== actual) return;
    if (e.status === 409) return void cargarCalendario(true);
    s.temporada = { clave, eventos: [], error: true };
  }
  pintarCalendario();
}
// Lista de un día: lo que pasa ese día (los mismos chips que sus muestras y su
// cuenta; con lecturas sin chips, citas y programas) o lo que está en curso. Se
// pide al abrirla y pagina con el cursor de la API; si la publicación cambió
// (409), se rehace desde el principio para no mezclar lecturas.
async function abrirDiaCalendario(dia, tipo, mas = false){
  const s = CALENDARIO, clave = dia + '|' + tipo;
  let l = s.dias.get(clave);
  if (!l){ l = { eventos: [], siguiente: null, cargando: false, cargada: false }; s.dias.set(clave, l); }
  l.abierta = true;
  if (l.cargando || (mas ? !l.siguiente : l.cargada)) return void pintarCalendario();
  l.cargando = true; pintarCalendario();
  const controller = s.controller ||= new AbortController();
  // «En cartel» va por período («desde~hasta»); las citas, por día.
  const [desde, hasta = sumarDiasCalendario(dia, 1)] = dia.split('~');
  try {
    // Con la revisión del resumen a la vista: si la publicación cambió, 409.
    const dato = await calPedir('eventos', { ...calParametros(), desde, hasta, limite: 20, revision: s.meta?.revision,
      ...(tipo === 'curso' ? { presentacion: 'prolongada' } : { chips: 1 }), cursor: mas ? l.siguiente : '' }, controller.signal);
    if (s.dias.get(clave) !== l) return;
    calAnotar(dato); l.eventos.push(...dato.eventos); l.siguiente = dato.siguiente; l.cargada = true;
  } catch (e){
    if (controller.signal.aborted || s.dias.get(clave) !== l) return void (l.cargando = false);
    // Otra publicación: se rehace todo (cuentas y listas) para no mezclar lecturas.
    if (e.status === 409) return void cargarCalendario(true);
    s.error = calFallo(e);
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
    s.error = calFallo(e);
  }
  p.cargando = false; pintarCalendario();
}
function calLimpiarFiltros(){
  const s = CALENDARIO;
  s.temas.clear(); s.mio = false; s.capas = null; s.temporada = null; s.precio = ''; s.rango = ''; s.semanas = 1; s.mes = null;
  // Lo abierto tampoco pasa a la siguiente entrada (las fichas sí se guardan).
  s.desplegado = ''; for (const l of s.dias.values()) l.abierta = false;
  s.escrito = { donde: '' }; s.sugerencias = { donde: [] }; s.editandoDonde = false;
}
function calPreferencias(){
  try {
    const p = CALENDARIO.prefs || JSON.parse(localStorage.getItem(CAL_PREF_KEY));
    if (p?.v !== 1 || !['configurado', 'omitido'].includes(p.estado)) return null;
    const lista = x => Array.isArray(x) ? x.filter(v => typeof v === 'string').slice(0, 40) : [];
    const sitio = p.sitio?.id && p.sitio?.nombre ? { id: String(p.sitio.id), nombre: String(p.sitio.nombre) } : null;
    // Sin sitio no hay intereses locales (las guardadas antes podían tenerlos).
    const i = sitio ? p.intereses : null;
    return { v: 1, estado: p.estado, sitio,
      intereses: { cultura: lista(i?.cultura), otraCultura: i?.otraCultura === true, deporteLocal: i?.deporteLocal === true },
      competiciones: lista(p.competiciones).filter(c => CAL_MARCAS[c]) };
  } catch { return null; }
}
function calGuardarPreferencias(p){
  CALENDARIO.prefs = p;
  try { localStorage.setItem(CAL_PREF_KEY, JSON.stringify(p)); return true; } catch { return false; }
}
// «Lo mío» de la agenda: los temas de mis intereses en mi sitio (con
// «otra:cultura» y el deporte local). Las competiciones que sigo, en Deportes.
const calTemasMios = p => [...p.intereses.cultura, ...(p.intereses.otraCultura ? ['otra:cultura'] : []), ...(p.intereses.deporteLocal ? ['deportes'] : [])];
function calVerLoMio(){
  const s = CALENDARIO, p = calPreferencias();
  if (p?.estado !== 'configurado' || !calTemasMios(p).length) return false;
  s.temas = new Set(calTemasMios(p)); s.mio = true;
  return true;
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
  // Configurado con el asistente: su sitio (o ninguno) y «Lo mío».
  const p = calPreferencias();
  if (p?.estado === 'configurado'){
    if (!s.donde) calElegirDonde(p.sitio);
    return;
  }
  const ine = sitiosTiempo().find(x => x.lugar?.ine)?.lugar.ine;
  const provincia = ine && ADMINISTRACION.provincias.find(([c]) => c === String(ine).padStart(5, '0').slice(0, 2));
  if (provincia && !s.donde) calElegirDonde({ id: 'es:provincia:' + provincia[0], nombre: provincia[1] });
}
// La identidad de la consulta son sus prefijos de agenda: editar el texto o
// añadir otros servicios (tiempo, consultas) conserva filtros y apertura.
function actualizarConsultaCalendario(orden){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO, clave = JSON.stringify(orden && [orden.ambitos, orden.circuitos, orden.tipos, orden.desconocidos]);
  const fecha = calFechasConsulta(orden?.resto).desde || '';
  if (fecha !== s.desdeConsulta){ s.desdeConsulta = fecha; s.fecha = fechaValida(fecha) ? fecha : calHoy(); }
  // La orden va antes que las preferencias: un prefijo no hereda «Lo mío».
  s.orden = orden;
  if (clave !== s.clave){
    s.clave = clave; calLimpiarFiltros();
    // Un prefijo de agenda abre la vista completa y, al quitarlo, la cierra;
    // cerrada a mano, sigue cerrada mientras no cambie la consulta. El sitio
    // (y con él la zona) se aplica antes de calcular «hoy».
    if (calPideAgenda(orden)){
      if (!s.abierto){ s.origen = document.getElementById('buscar'); s.scroll = window.scrollY; s.abierto = s.porPrefijo = true; calDondePorDefecto(); }
      calEntrarVista(calVistaDe(orden));
    } else if (s.porPrefijo) s.abierto = s.porPrefijo = false;
    // Abierta desde su botón, la vista repone lo suyo (las capas de Deportes, «Lo mío»).
    else if (s.abierto) calEntrarVista(s.vista);
    s.fecha = fechaValida(fecha) ? fecha : calHoy();
  }
  if (s.abierto) return void cargarCalendario();
  pintarCalendario();
}
// Un prefijo de competición es de Deportes; el resto, de la agenda.
const calEsDeportiva = o => Boolean(o?.circuitos.length || o?.ambitos.some(a => AMBITOS[a]?.codigo));
const calVistaDe = o => calEsDeportiva(o) ? 'deportes' : 'agenda';
// Una orden con competiciones y temas a la vez («f1: teatro:») no se resuelve
// en silencio: se pregunta qué parte ver (cada vista toma solo lo suyo).
const calMixta = () => { const o = calPideAgenda(CALENDARIO.orden) && CALENDARIO.orden;
  return Boolean(o) && calEsDeportiva(o) && o.ambitos.some(a => !AMBITOS[a]?.codigo); };
// La agenda es siempre de un sitio: sin él no se consulta, se pide (P05).
const calSinSitio = () => !calModoDeportes() && !CALENDARIO.donde;
// Deportes con un prefijo de competición manda el prefijo: solo esas, sin capas.
const calPrefijoDeportivo = () => calPideAgenda(CALENDARIO.orden) && calVistaDe(CALENDARIO.orden) === 'deportes';
// Cada vista con lo suyo: Deportes abre el mes con sus capas (las que sigo o
// todas); la agenda, la semana y, sin prefijo, «Lo mío». Al cambiar de vista
// no queda nada de la anterior: ni sus datos, ni sus peticiones, ni lo abierto.
function calEntrarVista(vista){
  const s = CALENDARIO;
  if (s.vista !== vista){
    calCortarCargas();
    s.resumen = null; s.barras = []; s.vigente = s.consulta = ''; s.dias.clear(); s.pendientes = null; s.cargando = false; s.error = '';
  }
  s.vista = vista; s.mesAbierto = vista === 'deportes';
  if (vista === 'deportes'){ s.capas = null; if (!calPrefijoDeportivo()) calEntrarDeportes(); }
  else if (!calPideAgenda(s.orden)) calVerLoMio();
}
function abrirCalendario(origen = null, vista = 'agenda'){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO;
  // El botón de la otra vista no hereda sus prefijos: se quitan del buscador.
  if (calPideAgenda(s.orden) && calVistaDe(s.orden) !== vista) calQuitarPrefijos();
  // Cada entrada empieza hoy (en la zona del sitio), sin los filtros de la
  // anterior; el pasado se visita navegando.
  cerrarEstadisticas(false);
  calDondePorDefecto();
  if (!s.abierto || s.vista !== vista){
    // Al cerrar, el foco vuelve al botón de la vista en la que se estaba.
    if (!s.abierto){ s.origen = origen || document.activeElement; s.scroll = window.scrollY; }
    else if (origen) s.origen = origen;
    calElegirDia(calHoy()); calLimpiarFiltros(); calEntrarVista(vista);
  }
  s.abierto = true; s.porPrefijo = false;
  // Tras un rato cerrado, la publicación del día pudo cambiar.
  cargarCalendario(Date.now() - s.cargado > 10 * 60000);
  requestAnimationFrame(() => {
    document.getElementById('cal-titulo')?.focus({ preventScroll: true });
    document.getElementById('calendario-panel')?.scrollIntoView({ block: 'start' });
  });
}
// Cerrar corta todo lo que estaba en curso; lo cortado queda sin cargar para
// volver a pedirlo al entrar. El borrador del asistente no sobrevive al cierre.
function calCortarCargas(){
  const s = CALENDARIO;
  for (const c of [s.controller, s.controllerMes, s.controllerTemporada, s.detalleLista, s.asistente?.controller]) c?.abort();
  if (s.cargando){ s.cargando = false; s.consulta = ''; }
  if (s.mes?.cargando) s.mes = null;
  if (s.temporada && !s.temporada.eventos) s.temporada = null;
  if (s.pendientes?.cargando) s.pendientes = null;
  for (const [k, l] of s.dias) if (l.cargando) s.dias.delete(k);
  if (s.desplegado && s.detalles.get(s.desplegado.split('~').at(-1)) === undefined) s.desplegado = '';
}
function cerrarCalendario(volver = true){
  const s = CALENDARIO;
  if (!s.abierto) return;
  calCortarCargas(); s.asistente = null;
  s.abierto = s.porPrefijo = false; pintarCalendario();
  if (!volver) return;
  const origen = s.origen?.isConnected ? s.origen : document.getElementById(calModoDeportes() ? 'btn-deportes' : 'btn-calendario');
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
  cerrarCalendario();
  calQuitarPrefijos();
}
// Quita del buscador los prefijos de agenda (o solo los que diga `quitar`).
function calQuitarPrefijos(quitar = () => true){
  const input = document.getElementById('buscar');
  const { antes, consulta } = partirConsulta(input.value);
  const fuera = tk => { const o = tk.prefix && leerConsultaCalendario(tk.raw); return Boolean(o) && quitar(o); };
  input.value = [tokenizeQuery(antes).filter(tk => !fuera(tk)).map(tk => tk.raw).join(' '), consulta]
    .filter(Boolean).join(' ');
  aplicarFiltros();
}
function calHora(e, conFecha = false){
  const c = e.programacion?.valor?.cuando;
  const a = extremoVisible(c?.inicio, CALENDARIO.zona), b = extremoVisible(c?.fin, CALENDARIO.zona);
  if (!a.fecha) return c?.restricciones_pendientes ? t('calHorarioRevisar') : t('calFechaPendiente');
  if (e.programacion?.valor?.modalidad === 'intervalo') return calFecha(a.fecha)
    + (b.fecha ? ' → ' + calFecha(b.fecha) : '') + ' · ' + t('calPeriodo');
  let s = (conFecha ? calFecha(a.fecha) + ' · ' : '') + (a.hora || t('calSinHora'));
  if (a.hora && a.sinZona) s += ' · ' + t('calSinZona');
  if (b.fecha) s += ' → ' + (conFecha && b.fecha === a.fecha && b.hora ? b.hora : calFecha(b.fecha) + (b.hora ? ' ' + b.hora : ''))
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
// Fuente: su nombre enlaza a la ficha original; luego, comprobación y licencia.
function calFuentes(e){
  const m = CALENDARIO.meta, vistas = new Set();
  return e.fuentes.filter(f => { const k = f.fuente + '/' + f.url; if (vistas.has(k)) return false; vistas.add(k); return true; })
    .map(f => {
      const fuente = m?.fuentes?.[f.fuente];
      const comprobado = f.comprobado || m?.cobertura?.find(c => c.fuente === f.fuente)?.comprobado;
      return `<p class="cal-nota">${calEsc(t('calFuente'))}: ${calEnlace(f.url || fuente?.url, fuente?.atribucion || fuente?.nombre || f.fuente)}
        ${comprobado ? ' · ' + calEsc(t('calComprobado', { fecha: calFormato({ dateStyle: 'short', timeStyle: 'short', timeZone: CALENDARIO.zona }).format(new Date(comprobado)) })) : ''}
        ${fuente?.licencia ? ' · ' + calEnlace(fuente.licencia_url, fuente.licencia) : ''}</p>`;
    }).join('');
}
// Detalle completo, en el diálogo y todo a la vista: cuándo, dónde, programa,
// participantes y fuente (sin desplegables que repitan lo mismo).
function calEvento(e){
  return `<article class="cal-evento"><h3>${calEsc(calNombre(e))}</h3>${calEtiquetasDeportes(e)}${calEventoCuerpo(e)}</article>`;
}
// El título del programa ya identifica el GP; solo se retira su prefijo exacto.
function calNombreSesion(p, e){
  const nombre = calNombre(p), padre = calNombre(e);
  if (!nombre.startsWith(padre)) return nombre;
  const resto = nombre.slice(padre.length), separador = resto.match(/^\s+[—–-]\s+|^\s*:\s+/);
  return separador ? resto.slice(separador[0].length).trim() || nombre : nombre;
}
// Cuerpo del detalle; desplegado en la lista, sin el lugar si la tarjeta ya lo dice.
function calEventoCuerpo(e, lugarVisto = ''){
  const v = e.programacion?.valor, estado = v?.programacion;
  const aviso = e.programacion?.conflicto || e.lugar?.conflicto;
  const lugar = calLugar(e);
  const avisoEstado = estado === 'cancelado' || estado === 'aplazado' ? `<p class="cal-aviso">${calEsc(t(estado === 'cancelado' ? 'calCancelado' : 'calAplazado'))}</p>` : '';
  const horario = v?.cuando?.horario_textual, ejecucion = v?.ejecucion;
  const textoHorario = typeof horario === 'string' ? horario : horario?.[ACCES.lang] || horario?.es || Object.values(horario || {})[0];
  const dias = v?.cuando?.dias_semana?.map(d => calFecha(sumarDiasCalendario('2026-10-19', d), { weekday: 'short', day: undefined, month: undefined })).join(', ');
  return `<p class="cal-cuando">${calEsc(calHora(e))}</p>${lugar && lugar !== lugarVisto ? `<p>${calEsc(lugar)}</p>` : ''}
    ${textoHorario || dias ? `<p class="cal-nota">${calEsc([dias, textoHorario].filter(Boolean).join(' · '))}</p>` : ''}
    ${avisoEstado}
    ${ejecucion === 'en_curso' || ejecucion === 'terminado' ? `<p class="cal-nota">${calEsc(t(ejecucion === 'en_curso' ? 'calEnCurso' : 'calTerminado'))}</p>` : ''}
    ${aviso ? `<p class="cal-aviso">${calEsc(t('calConflicto'))}</p>` : ''}
    ${e.programa?.length ? `<section class="cal-programa"><h4>${calEsc(t('calPrograma'))}</h4><ul>${e.programa.map(p => {
      const anulada = calEstadoAnulado(p.programacion?.valor?.programacion);
      return `<li${anulada ? ' class="cal-anulada"' : ''}><span>${calEsc(calNombreSesion(p, e))}</span> <span class="cal-cuando">${calEsc(calHora(p, true))}</span>${anulada ? ` · ${calEsc(t(anulada))}` : ''}</li>`;
    }).join('')}</ul></section>` : ''}
    ${e.participaciones?.length ? `<ul class="cal-participantes">${e.participaciones.map(p => `<li>${calEsc(p.literal)}</li>`).join('')}</ul>` : ''}
    <footer class="cal-evento-fuente">${calFuentes(e)}
    ${(e.enlaces || []).filter(url => !e.fuentes.some(f => f.url === url)).map(url => `<p class="cal-nota">${calEnlace(url, t('calVerOriginal'))}</p>`).join('')}</footer>`;
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
// Las muestras de chips traen su hora de ese día (la de la sesión, en un GP).
const calHoraCita = e => 'hora_muestra' in e ? e.hora_muestra || '' : ['prolongada', 'programa'].includes(calPresentacion(e)) ? ''
  : extremoVisible(e.programacion?.valor?.cuando?.inicio, CALENDARIO.zona).hora || '';
// Tarjeta de la lista: la hora en su columna; título, lugar y tipo de plan con
// precio. Lo prolongado lleva sus fechas en vez de hora.
// Desplegar un evento en la lista (agenda de Google Calendar): su detalle va
// bajo la tarjeta, sin diálogo; la ficha se pide una vez por evento. La clave
// distingue cada función (ocurrencia) y la fila «todo el día» de su carrera.
const calClaveDesplegable = (dia, e, barra = false) => [dia || '', barra ? '*' : e.ocurrencia || '', e.id].join('~');
const calIdDesplegado = clave => 'cal-det-' + clave.replace(/[^\w-]/g, '_');
function calTituloDesplegable(e, dia, barra = false){
  const clave = calClaveDesplegable(dia, e, barra), abierto = CALENDARIO.desplegado === clave;
  return calBoton('desplegar', calNombre(e), clave, `data-id="${calEsc(e.id)}" aria-expanded="${abierto}"${abierto ? ` aria-controls="${calIdDesplegado(clave)}"` : ''}`);
}
function calDesplegado(e, dia, barra = false){
  const s = CALENDARIO, clave = calClaveDesplegable(dia, e, barra);
  if (s.desplegado !== clave) return '';
  const d = s.detalles.get(e.id);
  return `<div class="cal-desplegado" id="${calIdDesplegado(clave)}">${d ? calEventoCuerpo(d, calLugar(e))
    : d === null ? `<p class="cal-aviso">${calEsc(t('calError'))}</p>` : `<p class="cal-nota">${calEsc(t('calCargando'))}</p>`}</div>`;
}
// Con su propio controlador: el diálogo del mes no corta la carga de la lista.
async function desplegarEventoCalendario(clave, id){
  const s = CALENDARIO;
  s.desplegado = s.desplegado === clave ? '' : clave;
  s.detalleLista?.abort();
  if (!s.desplegado || s.detalles.get(id)) return void pintarCalendario();
  s.detalles.delete(id); pintarCalendario();
  const controller = s.detalleLista = new AbortController();
  try {
    const d = await calPedir('eventos/' + encodeURIComponent(id), {}, controller.signal);
    calAnotar(d); s.detalles.set(id, d.evento);
  } catch {
    if (controller.signal.aborted) return;
    s.detalles.set(id, null);
  }
  pintarCalendario();
}
// Cancelado o aplazado: visible en su sitio, apagado y sin contar (SofaScore).
const calEstadoAnulado = estado => estado === 'cancelado' || estado === 'aplazado' ? (estado === 'cancelado' ? 'calCancelado' : 'calAplazado') : '';
// La lista conserva la competición aunque sus filtros queden fuera de la pantalla.
function calEtiquetasDeportes(e){
  const competiciones = [...new Set(e.competiciones || [])];
  return competiciones.length ? `<p class="cal-etiquetas">${competiciones.map(c =>
    `<span class="cal-etiqueta ${calColor({ competiciones: [c], categoria: 'deportes' })}">${calEsc(calNombreCompeticion(c))}</span>`).join('')}</p>` : '';
}
function calCita(e, dia = ''){
  // Un chip de sesión trae su propio estado; si no, el del evento.
  const v = e.programacion?.valor, anulado = calEstadoAnulado(e.estado || v?.programacion);
  const prolongada = calPresentacion(e) === 'prolongada', hora = calHoraCita(e);
  const lugar = calLugar(e);
  const plan = [...(e.formatos || []).map(calNombreFormato), e.precio && CAL_PRECIOS[e.precio] ? t(CAL_PRECIOS[e.precio]) : '',
    e.tiene_programa ? '▸ ' + t('calPrograma') : ''].filter(Boolean).join(' · ');
  // Una sesión o función lleva encima el GP o programa al que pertenece, si su nombre no lo dice ya.
  const padre = e.padre ? calNombre({ nombres: e.padre }) : '';
  return `<article class="cal-cita${anulado ? ' cal-anulada' : ''}"><span class="cal-hora">${calEsc(hora)}</span><div class="cal-cita-cuerpo">
    ${padre && !calNombre(e).includes(padre) ? `<p class="cal-nota cal-padre">${calEsc(padre)}</p>` : ''}
    <h3>${calTituloDesplegable(e, dia)}</h3>
    ${calEtiquetasDeportes(e)}
    ${prolongada ? `<p class="cal-cuando">${calEsc(calHora(e))}</p>` : ''}${lugar ? `<p class="cal-nota">${calEsc(lugar)}</p>` : ''}
    ${plan ? `<p class="cal-plan">${calEsc(plan)}</p>` : ''}
    ${anulado ? `<p class="cal-aviso">${calEsc(t(anulado))}</p>` : ''}${calDesplegado(e, dia)}</div></article>`;
}
// Citas de un día: primero con hora (así llegan de la API) y después, bajo su
// rótulo, las que no la tienen y los programas.
function calCitas(eventos, dia){
  let rotulo = false;
  return eventos.map(e => {
    const sinHora = !rotulo && calPresentacion(e) !== 'prolongada' && !calHoraCita(e);
    if (sinHora) rotulo = true;
    return (sinHora ? `<p class="cal-sin-hora">${calEsc(t('calSinHora'))}</p>` : '') + calCita(e, dia);
  }).join('');
}
const calDiaLargo = dia => calFecha(dia, { weekday: 'long', month: 'long' });
// Citas de un día: sus chips (cada función o carrera cuenta) o, en lecturas sin
// ellos o pedidas sin muestras, los eventos.
const calNDia = d => d.chips ?? d.citas + d.programas;
function calCuentas(d){
  return [calN('calNCitas', calNDia(d)), d.en_curso ? t('calNEnCurso', { n: d.en_curso }) : ''].filter(Boolean).join(' · ');
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
// torneo), con el color de su deporte; tres como mucho y «+N». Con una sola
// capa, la suya va primero.
const calModoDeportes = () => CALENDARIO.vista === 'deportes';
const calUnica = () => CALENDARIO.capas?.size === 1 ? [...CALENDARIO.capas][0] : '';
function calMarcas(d, orden = Object.keys(CAL_MARCAS)){
  const unica = calUnica();
  const hay = Object.entries(d?.competiciones || {}).filter(([c, n]) => CAL_MARCAS[c] && n.citas + n.programas + n.en_curso > 0)
    .sort(([a], [b]) => (b === unica) - (a === unica) || orden.indexOf(a) - orden.indexOf(b));
  return hay.map(([c, n]) => ({ c, texto: CAL_MARCAS[c] + (n.citas > 1 ? ' ' + n.citas : ''),
    nombre: calNombreCompeticion(c) + (n.citas ? ' · ' + calN('calNPartidos', n.citas) : '') }));
}
const CAL_MARCAS_DIA = 3;
const calMarcasHtml = marcas => marcas.length ? `<span class="cal-marcas" aria-hidden="true">${marcas.slice(0, CAL_MARCAS_DIA).map(m => `<span class="cal-marca cal-dep cal-dep-${CAL_DEPORTE_DE[m.c]}">${calEsc(m.texto)}</span>`).join('')}
  ${marcas.length > CAL_MARCAS_DIA ? `<span class="cal-marca cal-mas">+${marcas.length - CAL_MARCAS_DIA}</span>` : ''}</span>` : '';
const calNombreCompeticion = c => AMBITOS[c]?.noticias?.[0] || c;
const calPuntosHtml = cats => cats.length ? `<span class="cal-puntos" aria-hidden="true">${cats.map(c => `<span class="cal-punto cal-cat-${c}"></span>`).join('')}</span>` : '';
const calNombreCategoria = c => c === 'otras' ? t('calOtras') : calNombre(CALENDARIO.meta?.catalogo?.conceptos?.[c]);
// GP y programas de competición que siguen ese día: sus días sin carrera no
// tienen chip, así que van arriba como «todo el día» (Google, Apple).
const calBarrasDia = dia => (CALENDARIO.barras || []).filter(b => calPresentacion(b) === 'programa' && b.desde <= dia && dia < b.hasta);
function calBarraDia(b, dia){
  // Duración del programa (no de los tramos que tocan la ventana); sin fechas, nada.
  const v = b.programacion?.valor?.cuando, a = extremoVisible(v?.inicio, CALENDARIO.zona).fecha, z = extremoVisible(v?.fin, CALENDARIO.zona).fecha;
  const total = a && z ? calDiferencia(a, z) + 1 : 0, n = a ? calDiferencia(a, dia) + 1 : 0;
  return `<article class="cal-cita cal-todo-dia"><span class="cal-hora ${calColor(b)}">${calEsc(t('calTodoElDia'))}</span><div class="cal-cita-cuerpo">
    <h3>${calTituloDesplegable(b, dia, true)}</h3>
    ${calEtiquetasDeportes(b)}
    ${total > 1 && n >= 1 && n <= total ? `<p class="cal-nota">${calEsc(t('calDiaDeN', { n, total }))}</p>` : ''}${calDesplegado(b, dia, true)}</div></article>`;
}
// Un día de la lista: sus muestras y «Ver las N citas»; abierta, todas.
function calDiaLista(d){
  const s = CALENDARIO, l = s.dias.get(d.dia + '|citas'), citas = calNDia(d);
  let cuerpo;
  if (l?.abierta && l.cargada){
    cuerpo = calCitas(l.eventos, d.dia) + `<div class="cal-paginacion">${l.siguiente ? calBoton('mas-dia', t('calCargarMas'), d.dia, l.cargando ? 'disabled' : '') : ''}
      ${calBoton('ocultar-dia', t('calOcultar'), d.dia)}</div>`;
  } else {
    cuerpo = calCitas(d.muestras, d.dia) + (citas > d.muestras.length
      ? `<div class="cal-paginacion">${calBoton('ver-dia', t('calVerCitas', { n: citas, dia: calFecha(d.dia, { weekday: 'long', day: undefined, month: undefined }) }), d.dia, l?.cargando ? 'disabled' : '')}</div>` : '');
  }
  cuerpo = calBarrasDia(d.dia).map(b => calBarraDia(b, d.dia)).join('') + cuerpo;
  const hoy = calHoy();
  return `<section class="cal-dia${d.dia < hoy ? ' cal-pasado' : ''}" id="cal-dia-${d.dia}"><h2>${calEsc(d.dia === hoy ? t('calHoy') + ' · ' + calFecha(d.dia, { weekday: 'long' }) : calDiaLargo(d.dia))}
    <small>${calEsc(calN('calNCitas', citas))}${d.dia < hoy ? ' · ' + calEsc(t('calPasado')) : ''}</small></h2>${cuerpo}</section>`;
}
// «En cartel» (Time Out): lo prolongado (exposiciones, ciclos, torneos) de todos
// los días que enseña la lista, plegado y aparte de las citas; lo que empieza
// después del primero, con su día de apertura. Una sola lista: «desde~hasta».
const calVentanaCartel = dias => dias.length ? dias[0].dia + '~' + sumarDiasCalendario(dias.at(-1).dia, 1) : '';
function calEnCurso(dias){
  if (!dias.some(d => d.en_curso)) return '';
  const s = CALENDARIO, clave = calVentanaCartel(dias), l = s.dias.get(clave + '|curso'), abierta = Boolean(l?.abierta);
  // Cuántas el primer día; el resto del período se ve al abrirlo.
  const titulo = dias.length > 1 ? t('calEnCartelPeriodo') : t('calEnCartel', { n: dias[0].en_curso });
  return `<section class="cal-en-curso">${calBoton('curso', (abierta ? '▾ ' : '▸ ') + titulo, clave, `aria-expanded="${abierta}"`)}
    ${abierta ? `<p class="cal-nota">${calEsc(t('calProgramacionesNota'))}</p>${(l.eventos || []).map(e => (e.dia > dias[0].dia
      ? `<p class="cal-nota cal-abre">${calEsc(t('calAbre', { dia: calFecha(e.dia, { weekday: 'short' }) }))}</p>` : '') + calCita(e, e.dia)).join('')}
      ${l.siguiente ? `<div class="cal-paginacion">${calBoton('mas-curso', t('calCargarMas'), clave, l.cargando ? 'disabled' : '')}</div>` : ''}` : ''}</section>`;
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
  const dias = calDiasLista(), conCitas = dias.filter(d => calNDia(d) || calBarrasDia(d.dia).length);
  // Sin citas pero con algo en cartel, no es un período vacío.
  const vacio = !conCitas.length ? `<p class="cal-nota cal-vacio">${calEsc(t(dias.some(d => d.en_curso) ? 'calSinCitasEnCartel'
    : s.rango ? 'calDiaSinCitas' : 'calSinCitas'))}</p>` : '';
  const mas = !s.rango && s.semanas < CAL_SEMANAS_MAX ? `<div class="cal-paginacion">${calBoton('mas-semanas', t('calSemanaSiguiente'), '', s.cargando ? 'disabled' : '')}</div>` : '';
  return calEnCurso(dias) + conCitas.map(calDiaLista).join('') + vacio + mas;
}
// Una celda de la tira o del mes: inicial del día, número y puntos.
function calCeldaDia(dia, d, { otroMes = false, rodante = false } = {}){
  const s = CALENDARIO, hoy = calHoy(), deportes = calModoDeportes();
  const cats = deportes ? [] : calPuntos(d), marcas = deportes ? calMarcas(d) : [];
  const detalle = deportes ? marcas.map(m => m.nombre) : cats.map(calNombreCategoria);
  const etiqueta = `${calDiaLargo(dia)}: ${d ? calCuentas(d) : calN('calNCitas', 0)}${detalle.length ? ' · ' + detalle.join(', ') : ''}`;
  return `<button type="button" class="cal-celda${otroMes ? ' cal-otro-mes' : ''}${dia < hoy ? ' cal-pasado' : ''}" data-cal="dia" data-valor="${dia}"
    aria-pressed="${dia === s.fecha}"${dia === hoy ? ' aria-current="date"' : ''} aria-label="${calEsc(etiqueta)}">
    <span class="cal-num">${calEsc(calNumDia(dia, rodante))}</span>${deportes ? calMarcasHtml(marcas) : calPuntosHtml(cats)}</button>`;
}
// En el mes que empieza en esta semana, el día 1 lleva su mes («1 nov»).
const calNumDia = (dia, rodante = false) => calFecha(dia, rodante && dia.endsWith('-01') ? {} : { month: undefined });
const calCabeceraSemana = dias => dias.slice(0, 7).map(dia => `<abbr class="cal-semana-nombre" title="${calEsc(calFecha(dia, { weekday: 'long', day: undefined, month: undefined }))}">${calEsc(calFecha(dia, { weekday: 'narrow', day: undefined, month: undefined }))}</abbr>`).join('');
// Tira (Apple Calendar, SofaScore): la semana del día elegido; desplegada, el mes.
// Mes estilo Google Calendar cuando el panel deja sitio para títulos: en em,
// para que la letra grande de Aa cuente como un panel estrecho.
const CAL_MES_ANCHO_EM = 44;
const calMesAncho = () => (document.getElementById('calendario-panel')?.clientWidth || 0) >= CAL_MES_ANCHO_EM * calEm();
// Días del mes desplegado: los del mes del día elegido (seis semanas desde el
// lunes de la del día 1). El mes en curso empieza en la semana de hoy, como las
// «próximas semanas» de Google Calendar: el calendario no da resultados.
function calPeriodoMes(fecha = CALENDARIO.fecha){
  const hoy = calHoy(), lunes = ventanaCalendario(hoy, 'semana')[0];
  if (fecha.slice(0, 7) !== hoy.slice(0, 7) || fecha < lunes) return { dias: ventanaCalendario(fecha, 'mes'), rodante: false };
  return { dias: Array.from({ length: 42 }, (_, i) => sumarDiasCalendario(lunes, i)), rodante: true };
}
// Alto de cada semana (Google Calendar): el mes entero cabe en la ventana con la
// barra y la cabecera del mes (≈ 8 líneas); lo que no cabe en un día va en «+N».
const calEm = () => parseFloat(globalThis.getComputedStyle?.(document.getElementById('calendario-panel'))?.fontSize) || 16;
const calAltoSemana = (em = calEm()) => Math.round(Math.min(em * 10, Math.max(em * 5, ((window.innerHeight || 900) - em * 8) / 6)));
// Deportes con una o dos competiciones: caben sus partidos en el mes (Google
// Calendar); con más, solo las marcas por competición.
const calPartidosEnMes = () => calModoDeportes() && CALENDARIO.capas?.size <= 2;
// Último día publicado de lo elegido en Deportes: las competiciones sin
// calendario completo se publican a unas dos semanas; las que lo tienen (F1,
// MotoGP) no ponen límite. Más allá, el mes no está vacío sino sin publicar.
function calPublicadoHasta(){
  const s = CALENDARIO, fines = [];
  for (const c of s.capas || []){
    const activas = (s.meta?.colecciones || []).filter(x => x.coleccion === c && x.estado === 'activa');
    if (!activas.length || activas.some(x => x.calendario_completo)) continue;
    const fin = activas.flatMap(x => x.unidades || []).map(u => u.fin).filter(Boolean).sort().at(-1);
    if (fin) fines.push(fin);
  }
  return fines.sort()[0] || '';
}
const calDiferencia = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
// Cada semana, una cuadrícula: el día es un botón con su número, el hueco de
// las barras y, en la agenda, hasta cuatro chips «hora título» (+N). En
// Deportes no caben los partidos (un sábado, diez competiciones y cuarenta
// partidos): cada día lleva sus marcas («NBA 12», «ATP»), todas, y la semana
// crece lo que haga falta. Solo el motor va en barra encima (un GP o rally a la
// vez); los torneos de tenis (varios a la vez, toda la temporada) son marcas.
function calMesTitulos(dias, rodante = false){
  const s = CALENDARIO, hoy = calHoy(), porDia = new Map((s.mes?.dias || []).map(d => [d.dia, d])), deportes = calModoDeportes();
  const barras = (s.mes?.barras || []).filter(b => b.competiciones?.some(c => CAL_DEPORTE_DE[c] === 'motor'));
  // Carril de 28 px como mínimo: la barra (2 px de margen arriba y abajo) llega a los 24 de AA.
  const em = calEm(), alto = calAltoSemana(em), carril = Math.max(em * 1.6, 28), semanas = [];
  const partidos = deportes && calPartidosEnMes(), publicado = deportes ? calPublicadoHasta() : '';
  const sinPublicar = dia => Boolean(publicado) && dia > publicado;
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return `<div class="cal-mg" role="group" aria-label="${calEsc(t('calMes'))}"><div class="cal-mg-cabecera">${calCabeceraSemana(dias)}</div>${semanas.map(semana => {
    const fin = sumarDiasCalendario(semana[6], 1), carriles = [];
    const colocadas = barras.filter(b => b.desde < fin && b.hasta > semana[0]).map(b => {
      const a = Math.max(0, calDiferencia(semana[0], b.desde)), z = Math.min(7, calDiferencia(semana[0], b.hasta));
      let n = carriles.findIndex(libre => libre <= a);
      if (n < 0) n = carriles.push(0) - 1;
      carriles[n] = z;
      return { b, a, z, carril: n };
    });
    const n = carriles.length;
    // Chips que caben bajo el número, las barras y la línea de «+N».
    const caben = Math.max(0, Math.floor((alto - em * (1.3 + 1.1) - carril * n - 6) / (em * 1.15)));
    const celdas = semana.map((dia, i) => {
      const d = porDia.get(dia);
      let contenido, detalle;
      if (deportes && partidos){
        // Una o dos competiciones: sus partidos, hasta cinco, y «+N»; lo que va en barra no se repite.
        const enBarra = new Set(colocadas.filter(x => x.a <= i && x.z > i).flatMap(x => x.b.competiciones || []));
        const muestras = (d?.muestras || []).filter(m => !(m.competiciones || []).some(c => enBarra.has(c)));
        const mas = Math.max(0, (d ? calNDia(d) : 0) - (d?.muestras || []).length);
        contenido = muestras.map(m => `<span class="cal-mg-chip ${calColor(m)}">${calHoraCita(m) ? `<b>${calEsc(calHoraCita(m))}</b> ` : ''}${calEsc(calNombre(m))}</span>`).join('')
          + (mas ? `<span class="cal-mg-mas">${calEsc(t('calMasN', { n: mas }))}</span>` : '');
        detalle = muestras.map(m => calNombre(m));
      } else if (deportes){
        // Lo que ya va en barra ese día no se repite como marca.
        const enBarra = new Set(colocadas.filter(x => x.a <= i && x.z > i).flatMap(x => x.b.competiciones || []));
        const marcas = calMarcas(d, CAL_COMPETICIONES).filter(m => !enBarra.has(m.c));
        contenido = marcas.length ? `<span class="cal-mg-marcas">${marcas.map(m => `<span class="cal-mg-marca cal-dep cal-dep-${CAL_DEPORTE_DE[m.c]}" title="${calEsc(m.nombre)}">${calEsc(m.texto)}</span>`).join('')}</span>` : '';
        detalle = calMarcas(d).map(m => m.nombre);
      } else {
        const muestras = (d?.muestras || []).slice(0, caben), mas = Math.max(0, (d?.chips ?? muestras.length) - muestras.length);
        contenido = muestras.map(m => {
          const titulo = calNombre(m.padre ? { nombres: m.padre } : m), hora = calHoraCita(m);
          return `<span class="cal-mg-chip ${calColor(m)}">${hora ? `<b>${calEsc(hora)}</b> ` : ''}${calEsc(titulo)}</span>`;
        }).join('') + (mas ? `<span class="cal-mg-mas">${calEsc(t('calMasN', { n: mas }))}</span>` : '');
        detalle = muestras.map(m => calNombre(m.padre ? { nombres: m.padre } : m));
      }
      const etiqueta = `${calDiaLargo(dia)}: ${sinPublicar(dia) && !d ? t('calSinPublicar') : d ? calCuentas(d) : calN('calNCitas', 0)}${detalle.length ? ' · ' + detalle.join(', ') : ''}`;
      return `<button type="button" class="cal-mg-dia${!rodante && dia.slice(0, 7) !== s.fecha.slice(0, 7) ? ' cal-otro-mes' : ''}${dia < hoy ? ' cal-pasado' : ''}${sinPublicar(dia) ? ' cal-sin-publicar' : ''}" style="grid-column:${i + 1}"
        data-cal="dia" data-valor="${dia}" aria-pressed="${dia === s.fecha}"${dia === hoy ? ' aria-current="date"' : ''} aria-label="${calEsc(etiqueta)}">
        <span class="cal-num">${calEsc(calNumDia(dia, rodante))}</span><span class="cal-mg-hueco" aria-hidden="true"></span>${contenido}</button>`;
    }).join('');
    const lineas = colocadas.map(({ b, a, z, carril: c }) => calBoton('evento', calNombre(b), b.id,
      `class="cal-mg-barra ${calColor(b)}${b.desde < semana[a] ? ' sigue-antes' : ''}${b.hasta > sumarDiasCalendario(semana[z - 1], 1) ? ' sigue-despues' : ''}" style="grid-column:${a + 1}/${z + 1};grid-row:${c + 2}" aria-haspopup="dialog" title="${calEsc(calNombre(b))}"`)).join('');
    return `<div class="cal-mg-semana" style="--carriles:${n};--carril:${carril}px${deportes ? '' : `;height:${alto}px`}">${celdas}${lineas}</div>`;
  }).join('')}</div>${dias.some(sinPublicar) ? `<p class="cal-nota cal-leyenda-sin-publicar">${calEsc(t('calSinPublicarNota'))}</p>` : ''}`;
}
function calTira(){
  const s = CALENDARIO, porDia = new Map([...(s.resumen || []), ...(s.mesAbierto ? s.mes?.dias || [] : [])].map(d => [d.dia, d]));
  const { dias: diasMes, rodante } = s.mesAbierto ? calPeriodoMes() : { dias: null, rodante: false };
  const dias = diasMes || ventanaCalendario(s.fecha, 'semana');
  const titulo = rodante ? calFecha(dias[0], { month: 'short', day: undefined }) + ' – ' + calFecha(dias.at(-1), { month: 'short', year: 'numeric', day: undefined })
    : calFecha(s.fecha, { month: 'long', year: 'numeric', day: undefined });
  const [ant, sig] = s.mesAbierto ? ['calMesAnterior', 'calMesSiguiente'] : ['calSemanaAnterior', 'calSemanaPosterior'];
  return `<div class="cal-tira"><div class="cal-tira-cabecera">${calBoton('anterior', '‹', '', `aria-label="${calEsc(t(ant))}"`)}
    ${calBoton('mes', titulo + (s.mesAbierto ? ' ▴' : ' ▾'), '', `class="cal-tira-titulo" aria-expanded="${s.mesAbierto}"`)}${calBoton('siguiente', '›', '', `aria-label="${calEsc(t(sig))}"`)}</div>
    ${s.mesAbierto && calMesAncho() ? calMesTitulos(dias, rodante) : `<div class="cal-mes" role="group" aria-label="${calEsc(t(s.mesAbierto ? 'calMes' : 'calSemana'))}">${calCabeceraSemana(dias)}${dias.map(dia =>
      calCeldaDia(dia, porDia.get(dia), { otroMes: s.mesAbierto && !rodante && dia.slice(0, 7) !== s.fecha.slice(0, 7), rodante })).join('')}</div>`}
    ${calModoDeportes() ? '' : `<p class="cal-leyenda">${[...CAL_CATEGORIAS, 'otras'].map(c => `<span><span class="cal-punto cal-cat-${c}" aria-hidden="true"></span>${calEsc(calNombreCategoria(c))}</span>`).join('')}</p>`}
    ${s.mesAbierto && calModoDeportes() ? calTemporada(diasMes, rodante) : ''}</div>`;
}
// Este mes en deportes (calendario de temporada de la app de F1, SofaScore):
// por competición, sus GP o torneos con fechas y los partidos publicados. Va
// plegado y se pide al abrirlo: abierto empujaba la lista una pantalla abajo.
// Con el mes que empieza en esta semana, el mismo período que la rejilla.
function calTemporada(periodo, rodante){
  const s = CALENDARIO, mes = s.fecha.slice(0, 7), abierta = s.temporadaAbierta;
  const nombre = rodante ? t('calProximasSemanas') : t('calEsteMes', { mes: calFecha(s.fecha, { month: 'long', day: undefined }) });
  const cabecera = calBoton('temporada', (abierta ? '▾ ' : '▸ ') + nombre, '', `class="cal-temporada-boton" aria-expanded="${abierta}"`);
  if (!abierta) return `<section class="cal-temporada">${cabecera}</section>`;
  const dias = (s.mes?.dias || []).filter(d => rodante ? periodo.includes(d.dia) : d.dia.slice(0, 7) === mes);
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
    return `<li class="cal-temporada-fila">${s.capas ? calBoton('solo', calNombreCompeticion(c), c, `aria-pressed="${calUnica() === c}"`) : `<b>${calEsc(calNombreCompeticion(c))}</b>`}
      ${partidos[c] ? `<span class="cal-nota">${calEsc(calN('calNPartidos', partidos[c]))}</span>` : ''}${parcial(c) ? `<span class="cal-nota">· ${calEsc(t('calParcial'))}</span>` : ''}
      ${lista.length ? `<ul>${lista.slice(0, 4).map(e => `<li>${calBoton('evento', calNombre(e), e.id, 'aria-haspopup="dialog"')} <span class="cal-cuando">${calEsc(rango(e))}</span></li>`).join('')}
        ${lista.length > 4 ? `<li class="cal-nota">${calEsc(t('calYMas', { n: lista.length - 4 }))}</li>` : ''}</ul>` : ''}</li>`;
  });
  return `<section class="cal-temporada">${cabecera}
    ${s.temporada?.error ? `<p class="cal-aviso">${calEsc(t('calError'))}</p>` : ''}
    ${filas.length ? `<ul>${filas.join('')}</ul>` : `<p class="cal-nota">${calEsc(s.temporada?.eventos ? t('calSinDeportes') : t('calCargando'))}</p>`}
    ${s.temporada?.parcial ? `<p class="cal-nota">${calEsc(t('calTemporadaParcial'))}</p>` : ''}</section>`;
}
function calPendientes(){
  const p = CALENDARIO.pendientes;
  if (!p) return `<div class="cal-pendientes">${calBoton('pendientes', t('calVerPendientes'))}</div>`;
  return `<section class="cal-pendientes"><h2>${calEsc(t('calSinFecha'))}</h2>
    ${p.eventos.map(e => calCita(e)).join('') || (p.cargando ? '' : `<p class="cal-nota">${calEsc(t('calNingunaPendiente'))}</p>`)}
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
  // Sin «Toda España» ni quitar el sitio: se cambia por otro (la agenda es local).
  if (!s.editandoDonde) return `<div class="cal-donde">${calBoton('editar-donde', '📍 ' + (s.donde?.nombre || t('calEligeSitio')) + ' ▾', '', `class="cal-donde-nombre" aria-label="${calEsc(s.donde ? t('calCambiarSitio', { x: s.donde.nombre }) : t('calEligeSitio'))}"`)}</div>`;
  return `<div class="cal-donde cal-campo-sug"><label for="cal-donde" class="sr-only">${calEsc(t('calDonde'))}</label>
    <input id="cal-donde" type="search" autocomplete="off" value="${calEsc(s.escrito.donde)}" placeholder="${calEsc(t('calDondeEjemplo'))}" aria-controls="cal-sug-donde">
    <div id="cal-sug-donde" class="cal-sugerencias" role="group" aria-label="${calEsc(t('calSugerencias'))}">${calSugerenciasHtml('donde')}</div></div>`;
}
// Chips: Todo · Cultura · Deportes · Gratis; elegida una categoría, una
// segunda fila con sus subcategorías o competiciones (SofaScore, Fever).
const calHijos = (conceptos, r) => Object.keys(conceptos).filter(i => conceptos[i].padres.includes(r));
function calRaizElegida(){
  const s = CALENDARIO, conceptos = s.meta.catalogo.conceptos;
  if (s.mio) return '';
  return CAL_CATEGORIAS.find(c => s.temas.has(c) || calHijos(conceptos, c).some(h => s.temas.has(h))) || '';
}
function calChips(){
  const s = CALENDARIO, m = s.meta;
  if (!m) return '';
  const conceptos = m.catalogo.conceptos, raiz = calRaizElegida();
  const chip = (accion, label, valor, pulsado, clase = '') => calBoton(accion, label, valor, `class="${clase}" aria-pressed="${pulsado}"`);
  const fijas = CAL_CATEGORIAS.filter(c => conceptos[c]);
  const gratis = calBoton('gratis', t('calPrecioGratis'), '', `aria-pressed="${s.precio === 'gratis'}" title="${calEsc(t('calGratisNota'))}"`);
  // Con un prefijo de tema en el buscador, manda él: se ve como chip pulsado que
  // se quita, en vez de un «Todo» que no es verdad (como Deportes con prefijo).
  const prefijos = calPideAgenda(s.orden) ? s.orden.ambitos.filter(a => !AMBITOS[a]?.codigo) : [];
  if (prefijos.length) return `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calTemas'))}">${prefijos.map(a => {
    const nombre = calNombre(conceptos[AMBITOS[a].tema]);
    return calBoton('quitar-prefijo', nombre + ' ✕', a, `aria-pressed="true" aria-label="${calEsc(t('calQuitar', { x: nombre }))}"`);
  }).join('')}${gratis}</div>`;
  const p = calPreferencias(), loMio = p?.estado === 'configurado' && calTemasMios(p).length ? chip('categoria', t('calLoMio'), 'mio', s.mio) : '';
  // En la agenda, «Deportes» es el deporte del sitio; las competiciones tienen su vista.
  const primera = `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calTemas'))}">${loMio}${chip('categoria', t('calTodo'), '', !raiz && !s.mio)}
    ${fijas.map(c => chip('categoria', c === 'deportes' ? t('calAsDeporteLocal') : calNombre(conceptos[c]), c, raiz === c, 'cal-cat cal-cat-' + c)).join('')}
    ${gratis}</div>`;
  // Solo las subcategorías con algo en el sitio; la elegida se queda aunque no tenga.
  const hay = s.disp?.clave === (s.donde?.id || '') ? s.disp.temas : null;
  const segunda = raiz ? calHijos(conceptos, raiz).filter(i => !hay || hay[i] || s.temas.has(i))
    .map(i => chip('tema', calNombre(conceptos[i]), i, s.temas.has(i))).join('') : '';
  return primera + (segunda ? `<div class="cal-chips cal-subchips ui-tira" role="group" aria-label="${calEsc(calNombre(conceptos[raiz]))}">${segunda}</div>` : '');
}
function calContenido(){
  const s = CALENDARIO;
  if (s.orden?.desconocidos.length) return `<p class="cal-aviso">${calEsc(t('calConsultaDesconocida', { x: s.orden.desconocidos.join(', ') }))}</p>`;
  if (!s.meta) return '';
  if (calMixta()) return calElegirParte();
  if (calSinSitio()) return calInvitacion() + calPedirSitio();
  const { desde, hasta, acotada } = calVentana();
  if (desde >= hasta) return `<p class="cal-aviso">${calEsc(t('calFueraHorizonte'))}</p>`;
  return calInvitacion() + calTira() + calLista() + (s.resumen && !acotada ? calPendientes() : '');
}
// Sitios que ya conozco del usuario: los de «Mis sitios» (el tiempo) y su provincia.
function calSitiosCandidatos(){
  const candidatos = new Map();
  for (const x of sitiosTiempo()){
    const ine = x.lugar?.ine && String(x.lugar.ine).padStart(5, '0');
    if (!ine) continue;
    candidatos.set('es:municipio:' + ine, x.nombre);
    const prov = ADMINISTRACION.provincias.find(([c]) => c === ine.slice(0, 2));
    if (prov) candidatos.set('es:provincia:' + prov[0], t('calAsProvincia', { x: prov[1] }));
  }
  return candidatos;
}
function calPedirSitio(){
  const candidatos = [...calSitiosCandidatos()];
  return `<section class="cal-invitacion cal-pedir-sitio"><h2>${calEsc(t('calEligeSitio'))}</h2><p>${calEsc(t('calEligeSitioTexto'))}</p>
    ${candidatos.length ? `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calSugerencias'))}">${candidatos.map(([id, nombre]) =>
      `<button type="button" data-cal="elegir-donde" data-valor="${calEsc(id)}" data-nombre="${calEsc(nombre)}">${calEsc(nombre)}</button>`).join('')}</div>` : ''}
    <div class="as-acciones">${calBoton('editar-donde', t('calBuscarSitio'))}${calBoton('ir-deportes', t('calIrDeportes'))}</div></section>`;
}
// Orden mixta: dos botones, uno por parte, con lo que se verá en cada una.
function calElegirParte(){
  const o = CALENDARIO.orden, conceptos = CALENDARIO.meta?.catalogo?.conceptos || {};
  const deportes = [...o.ambitos.filter(a => AMBITOS[a]?.codigo), ...o.circuitos].map(calNombreCompeticion).join(', ');
  const temas = o.ambitos.filter(a => !AMBITOS[a]?.codigo).map(a => calNombre(conceptos[AMBITOS[a].tema]) || a).join(', ');
  const sitio = CALENDARIO.donde?.nombre;
  return `<section class="cal-invitacion cal-elegir-parte"><h2>${calEsc(t('calMezcla'))}</h2><p>${calEsc(t('calMezclaTexto'))}</p>
    <div class="as-acciones">${calBoton('quedarse', t('calVerEnDeportes', { x: deportes }), 'deportes')}
    ${calBoton('quedarse', t(sitio ? 'calVerEnSitio' : 'calVerEnAgenda', { x: temas, sitio }), 'agenda')}</div></section>`;
}
// Calendario deportivo: cada competición es una capa («Mis calendarios» de
// Google Calendar) y se eligen arriba, como los deportes de SofaScore o ESPN y
// los chips de la agenda: un deporte se elige entero («mixed» si solo algunas)
// y solo entonces salen debajo sus competiciones, con su marca del mes y su
// nombre, que hacen de leyenda. Con color, las marcadas. Siempre queda una.
// El deporte elegido: el único al que pertenecen todas las capas.
const calDeporteElegido = () => Object.keys(CAL_DEPORTES).find(k => [...CALENDARIO.capas].every(c => CAL_DEPORTE_DE[c] === k)) || '';
function calChipsDeportes(){
  const s = CALENDARIO, sigo = calPreferencias()?.competiciones || [], elegido = calDeporteElegido();
  const igual = cs => cs.length === s.capas.size && cs.every(c => s.capas.has(c));
  const chip = (accion, html, valor, pulsado, clase = '', attrs = '') => `<button type="button" data-cal="${accion}" data-valor="${calEsc(valor)}" class="${clase}" aria-pressed="${pulsado}"${attrs}>${html}</button>`;
  const deportes = Object.entries(CAL_DEPORTES).map(([k, cs]) =>
    chip('deporte', calEsc(t(CAL_NOMBRES_DEPORTE[k])), k, k !== elegido ? 'false' : igual(cs) ? 'true' : 'mixed', `cal-dep cal-dep-${k}`)).join('');
  const competiciones = (CAL_DEPORTES[elegido] || []).map(c => {
    const nombre = calNombreCompeticion(c), marca = CAL_MARCAS[c];
    return chip('capa', (marca && marca !== nombre ? `<b class="cal-chip-marca">${calEsc(marca)}</b> ` : '') + calEsc(nombre), c, s.capas.has(c),
      `cal-dep cal-dep-${CAL_DEPORTE_DE[c]}`);
  }).join('');
  return `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calCompeticiones'))}">${chip('capas-todas', calEsc(t('calTodas')), '', igual(CAL_COMPETICIONES))}
    ${sigo.length ? chip('capas-sigo', calEsc(t('calLasQueSigo')), '', igual(sigo)) : ''}${deportes}${calBoton('asistente', t('calElegirCompeticiones'), '2')}</div>
    ${elegido ? `<div class="cal-chips cal-subchips ui-tira" role="group" aria-label="${calEsc(t('calCompeticionesN', { n: s.capas.size, total: CAL_DEPORTES[elegido].length }))}">${competiciones}</div>` : ''}`;
}
// Al entrar en Deportes: las competiciones que sigo o, sin ninguna, todas.
function calEntrarDeportes(){
  const p = calPreferencias();
  CALENDARIO.capas = new Set(p?.competiciones.length ? p.competiciones : CAL_COMPETICIONES);
}
// Primera vez sin configurar: invitar al asistente (se puede dejar para otro día).
function calInvitacion(){
  if (CALENDARIO.orden || calPreferencias()) return '';
  return `<section class="cal-invitacion"><h2>${calEsc(t('calAsInvitacion'))}</h2><p>${calEsc(t('calAsInvitacionTexto'))}</p>
    <div class="as-acciones">${calBoton('ahora-no', t('calAsAhoraNo'))}${calBoton('asistente', t('calAsTitulo'), '0', 'class="primary"')}</div></section>`;
}
// Asistente: borrador en memoria; solo se escribe al guardar (como el de modos).
function calAbrirAsistente(paso = 0){
  const s = CALENDARIO, p = calPreferencias();
  s.asistente = { paso, disp: null, clave: null, error: '', b: {
    sitio: p?.estado === 'configurado' ? p.sitio : s.donde, cultura: new Set(p?.intereses.cultura || []),
    otraCultura: p?.estado === 'configurado' ? p.intereses.otraCultura : true, deporteLocal: Boolean(p?.intereses.deporteLocal),
    competiciones: new Set(p?.competiciones || []) } };
  s.escrito.donde = ''; s.sugerencias.donde = [];
  calPasoAsistente(paso);
}
function calPasoAsistente(paso){
  const a = CALENDARIO.asistente;
  a.paso = paso; a.error = '';
  pintarCalendario();
  document.getElementById('cal-as-titulo')?.focus();
  if (paso > 0) calDisponibilidad();
}
// Lo que hay en el sitio elegido y en cada competición: solo se ofrece eso.
async function calDisponibilidad(){
  const a = CALENDARIO.asistente, clave = a.b.sitio?.id || '';
  if (a.clave === clave) return;
  a.controller?.abort();
  const controller = a.controller = new AbortController();
  a.clave = clave; a.disp = null; pintarCalendario();
  try {
    const d = await calPedir('catalogo', { disponibilidad: 1, territorio: clave }, controller.signal);
    if (CALENDARIO.asistente !== a || a.clave !== clave) return;
    a.disp = d.disponibilidad; a.error = '';
  } catch {
    if (controller.signal.aborted || CALENDARIO.asistente !== a || a.clave !== clave) return;
    a.error = t('calError'); a.clave = null;
  }
  pintarCalendario();
}
function calAsistente(){
  const s = CALENDARIO, a = s.asistente, b = a.b, d = a.disp, paso = CAL_PASOS[a.paso];
  const conceptos = s.meta?.catalogo?.conceptos || {};
  const caja = (tipo, valor, label, marcado, n = null, ayuda = '') => `<label class="cal-as-opcion"><input type="${tipo === 'cal-as-sitio' ? 'radio' : 'checkbox'}" name="${tipo}" value="${calEsc(valor)}" data-nombre="${calEsc(label)}"${marcado ? ' checked' : ''}>
    <span>${calEsc(label)}${n != null ? ` <small>· ${n}</small>` : ''}${ayuda ? `<small class="cal-as-ayuda">${calEsc(ayuda)}</small>` : ''}</span></label>`;
  const cargando = `<p class="cal-estado" role="status">${calEsc(t('calCargando'))}</p>`;
  let titulo, cuerpo;
  if (paso === 'sitio'){
    titulo = t('calAsSitio');
    const candidatos = calSitiosCandidatos();
    if (b.sitio && !candidatos.has(b.sitio.id)) candidatos.set(b.sitio.id, b.sitio.nombre);
    cuerpo = `<p class="aj-hint">${calEsc(t('calAsSitioAyuda'))}</p><fieldset class="cal-as-grupo"><legend class="sr-only">${calEsc(titulo)}</legend>
      ${[...candidatos].map(([id, nombre]) => caja('cal-as-sitio', id, nombre, b.sitio?.id === id)).join('')}
      ${caja('cal-as-sitio', '', t('calAsSinSitio'), !b.sitio)}</fieldset>
      <div class="cal-campo-sug"><label for="cal-donde">${calEsc(t('calAsBuscarOtro'))}</label>
      <input id="cal-donde" type="search" autocomplete="off" value="${calEsc(s.escrito.donde)}" placeholder="${calEsc(t('calDondeEjemplo'))}" aria-controls="cal-sug-donde">
      <div id="cal-sug-donde" class="cal-sugerencias" role="group" aria-label="${calEsc(t('calSugerencias'))}">${calSugerenciasHtml('donde')}</div></div>`;
  } else if (paso === 'intereses'){
    titulo = b.sitio ? t('calAsIntereses', { x: b.sitio.nombre }) : t('calAsInteresesSinSitio');
    if (!d) cuerpo = cargando;
    else {
      const hijos = calHijos(conceptos, 'cultura').filter(h => d.temas[h] || b.cultura.has(h)).sort((x, y) => (d.temas[y] || 0) - (d.temas[x] || 0));
      const hay = hijos.length || d.sin_subcategoria.cultura || d.raices.deportes;
      cuerpo = `<p class="aj-hint">${calEsc(t('calAsInteresesAyuda'))}</p>
        ${!hay && b.sitio ? `<p class="cal-aviso">${calEsc(t('calAsSinCobertura', { x: b.sitio.nombre }))}</p>` : ''}
        <fieldset class="cal-as-grupo"><legend>${calEsc(calNombre(conceptos.cultura))}</legend>
        ${hijos.map(h => caja('cal-as-interes', h, calNombre(conceptos[h]), b.cultura.has(h), d.temas[h] || 0)).join('')}
        ${d.sin_subcategoria.cultura || b.otraCultura ? caja('cal-as-interes', 'otra', t('calAsOtraCultura'), b.otraCultura, d.sin_subcategoria.cultura || 0, t('calAsOtraCulturaAyuda')) : ''}</fieldset>
        ${d.raices.deportes || b.deporteLocal ? `<fieldset class="cal-as-grupo"><legend>${calEsc(calNombre(conceptos.deportes))}</legend>
          ${caja('cal-as-interes', 'deporte', t('calAsDeporteLocal'), b.deporteLocal, d.raices.deportes || 0)}</fieldset>` : ''}`;
    }
  } else if (paso === 'competiciones'){
    titulo = t('calAsCompeticiones');
    cuerpo = !d ? cargando : `<p class="aj-hint">${calEsc(t('calAsCompeticionesAyuda'))}</p>`
      + Object.entries(CAL_DEPORTES).map(([dep, codigos]) => {
        const lista = codigos.filter(c => d.circuitos[c] || b.competiciones.has(c));
        return lista.length ? `<fieldset class="cal-as-grupo"><legend>${calEsc(t(CAL_NOMBRES_DEPORTE[dep]))}</legend>
          ${lista.map(c => caja('cal-as-comp', c, calNombreCompeticion(c), b.competiciones.has(c), d.circuitos[c] || 0)).join('')}</fieldset>` : '';
      }).join('');
  } else {
    titulo = t('calAsResumen');
    const intereses = [...[...b.cultura].map(h => calNombre(conceptos[h])), ...(b.otraCultura ? [t('calAsOtraCultura')] : []),
      ...(b.deporteLocal ? [t('calAsDeporteLocal')] : [])];
    const fila = (k, valor, i) => `<div class="cal-as-fila"><dt>${calEsc(t(k))}</dt><dd>${calEsc(valor || t('calAsNinguno'))}</dd>
      <dd>${calBoton('as-ir', t('calAsCambiar'), String(i), `aria-label="${calEsc(t('calAsCambiar') + ': ' + t(k))}"`)}</dd></div>`;
    cuerpo = `<dl class="cal-as-resumen">${fila('calAsSitioRes', b.sitio?.nombre, 0)}${b.sitio ? fila('calAsInteresesRes', intereses.join(', '), 1) : ''}
      ${fila('calAsCompeticionesRes', [...b.competiciones].map(calNombreCompeticion).join(', '), 2)}</dl>`;
  }
  const ultimo = a.paso === CAL_PASOS.length - 1;
  return `<section class="cal-asistente" aria-labelledby="cal-as-titulo"><p class="aj-hint">${calEsc(t('calAsPaso', { n: a.paso + 1, total: CAL_PASOS.length }))}</p>
    <ol class="cal-as-progreso" aria-hidden="true">${CAL_PASOS.map((_, i) => `<li class="${i <= a.paso ? 'hecho' : ''}"></li>`).join('')}</ol>
    <h2 id="cal-as-titulo" tabindex="-1">${calEsc(titulo)}</h2>${cuerpo}
    <p class="as-error" role="alert">${calEsc(a.error)}</p>
    <div class="as-acciones">${calBoton('as-cancelar', t('calAsCancelar'))}${a.paso ? calBoton('as-anterior', t('calAsAnterior')) : ''}
    ${calBoton(ultimo ? 'as-guardar' : 'as-siguiente', t(ultimo ? 'calAsGuardar' : 'calAsSiguiente'), '', 'class="primary"')}</div></section>`;
}
const calEnfocarAjustes = () => document.getElementById('calendario-panel')?.querySelector('[data-cal="asistente"]')?.focus({ preventScroll: true });
function calGuardarAsistente(){
  const s = CALENDARIO, b = s.asistente.b;
  // Sin sitio, solo competiciones: no quedan intereses de toda España.
  if (!b.sitio){ b.cultura.clear(); b.otraCultura = false; b.deporteLocal = false; }
  if (!b.cultura.size && !b.otraCultura && !b.deporteLocal && !b.competiciones.size){
    s.asistente.error = t('calAsVacio'); return void pintarCalendario();
  }
  const ok = calGuardarPreferencias({ v: 1, estado: 'configurado', sitio: b.sitio,
    intereses: { cultura: [...b.cultura], otraCultura: b.otraCultura, deporteLocal: b.deporteLocal },
    competiciones: [...b.competiciones], actualizado: new Date().toISOString() });
  s.asistente = null;
  calElegirDonde(b.sitio);
  if (calModoDeportes()) calEntrarVista('deportes');
  else if (!calVerLoMio()){ s.temas.clear(); s.mio = false; }
  toast(t(ok ? 'calAsGuardado' : 'calAsNoGuardado'), 3000);
  consultarCalendario();
  calEnfocarAjustes();
}
const CAL_FOCO_SUSTITUTO = { 'ver-dia': 'ocultar-dia', 'mas-dia': 'ocultar-dia', 'ocultar-dia': 'ver-dia', 'mas-curso': 'curso' };
function pintarCalendario(){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  if (!p) return;
  const visible = CALENDARIO_ACTIVO && s.abierto;
  p.hidden = !visible;
  document.body.classList.toggle('calendario-abierto', visible);
  document.getElementById('btn-calendario')?.setAttribute('aria-expanded', String(visible && !calModoDeportes()));
  document.getElementById('btn-deportes')?.setAttribute('aria-expanded', String(visible && calModoDeportes()));
  if (!visible) return;
  s.fecha ||= calHoy();
  const foco = p.contains(document.activeElement) ? document.activeElement : null;
  const id = foco?.id, accion = foco?.dataset.cal, valor = foco?.dataset.valor;
  const seleccion = foco?.type === 'search' ? [foco.selectionStart, foco.selectionEnd] : null;
  p.setAttribute('aria-busy', String(s.cargando));
  if (s.asistente){
    p.innerHTML = `<h1 id="cal-titulo" class="sr-only" tabindex="-1">${calEsc(t('calTitulo'))}</h1>${calAsistente()}`;
    const vuelta = id ? document.getElementById(id) : foco?.name
      ? [...p.querySelectorAll('input')].find(b => b.name === foco.name && b.value === foco.value)
      : [...p.querySelectorAll('[data-cal]')].find(b => b.dataset.cal === accion && b.dataset.valor === valor);
    vuelta?.focus({ preventScroll: true });
    return;
  }
  const hoy = calHoy(), manana = sumarDiasCalendario(hoy, 1);
  const rango = (k, dia) => calBoton('rango', t(CAL_RANGOS[k]), k, `aria-pressed="${s.rango === k}"${dia ? ` data-dia="${dia}"` : ''}`);
  const deportes = calModoDeportes();
  // Las tiras de chips conservan su desplazamiento: si no, al elegir un chip
  // lejano la tira vuelve al principio y lo elegido queda fuera de la vista.
  const desplazadas = [...p.querySelectorAll('.ui-tira')].map(x => x.scrollLeft);
  // Arriba la ciudad (en Deportes, el título) y las acciones; debajo, atajos de
  // fecha y chips: en la agenda, temas; en Deportes, deportes y competiciones.
  p.innerHTML = `<div class="cal-barra"><h1 id="cal-titulo" class="${deportes ? 'cal-titulo-vista' : 'sr-only'}" tabindex="-1">${calEsc(t(deportes ? 'calDeportesTitulo' : 'calTitulo'))}</h1>
    ${deportes ? '' : calDonde()}<div class="cal-acciones">${deportes ? '' : calBoton('asistente', '⚙', '0', `class="cal-icono" aria-label="${calEsc(t('calAsTitulo'))}" title="${calEsc(t('calAsTitulo'))}"`)}${calBoton('renovar', '↻', '', `class="cal-icono" aria-label="${calEsc(t('calActualizar'))}" title="${calEsc(t('calActualizar'))}"${s.cargando ? ' disabled' : ''}`)}
    ${s.orden?.noticias ? calBoton('cerrar', t('calVerNoticias')) : calBoton('cerrar', '✕', '', `class="cal-icono" aria-label="${calEsc(t('calCerrar'))}" title="${calEsc(t('calCerrar'))}"`)}</div>
    <div class="cal-chips cal-rangos ui-tira" role="group" aria-label="${calEsc(t('calCuando'))}">${rango('hoy', hoy)}${rango('manana', manana)}${rango('finde')}
    ${calBoton('elegir-fecha', '📅', '', `class="cal-icono" aria-label="${calEsc(t('calFecha'))}" title="${calEsc(t('calFecha'))}"`)}
    <input id="cal-fecha" class="sr-only" type="date" tabindex="-1" aria-hidden="true" value="${s.fecha}"></div>
    ${deportes ? s.capas ? calChipsDeportes() : '' : calChips()}</div>
    <div class="cal-cuerpo"><p class="cal-estado" role="status">${calEsc(s.error ? t(s.error, { n: calSegundosEspera() }) : s.cargando ? t('calCargando') : '')}</p>
    ${s.error === 'calError' ? calBoton('renovar', t('calReintentar')) : ''}<div class="cal-contenido">${calContenido()}</div>
    ${s.meta ? `<p class="cal-nota cal-pie">${calEsc(t('calCobertura'))} ${calEsc(t('calGenerado', { fecha: calFormato({ dateStyle: 'short', timeStyle: 'short', timeZone: s.zona }).format(new Date(s.meta.generado)) }))}</p>` : ''}
    ${s.orden?.noticias ? `<p class="cal-nota">${calEsc(t('calNoticiasTexto'))}</p>` : ''}</div>`;
  p.querySelectorAll('.ui-tira').forEach((x, i) => { if (desplazadas[i]) x.scrollLeft = desplazadas[i]; });
  // Si el botón con el foco se sustituye al pintar («Ver las N» → «Mostrar menos»,
  // y al revés), el foco pasa a su sustituto del mismo día en vez de perderse.
  const botonCal = a => [...p.querySelectorAll('[data-cal]')].find(b => b.dataset.cal === a && b.dataset.valor === valor);
  const siguiente = id ? document.getElementById(id) : foco?.name ? [...p.querySelectorAll('input')].find(b => b.name === foco.name && b.value === foco.value)
    : botonCal(accion) || botonCal(CAL_FOCO_SUSTITUTO[accion]);
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
  // Dos entradas a la misma vista: la agenda y Deportes. Pulsar la abierta la cierra.
  for (const [id, vista] of [['btn-calendario', 'agenda'], ['btn-deportes', 'deportes']]){
    const boton = document.getElementById(id);
    boton.hidden = !CALENDARIO_ACTIVO;
    boton.addEventListener('click', e => s.abierto && s.vista === vista ? salirCalendario() : abrirCalendario(e.currentTarget, vista));
  }
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-cal]');
    if (!b) return;
    const a = b.dataset.cal, v = b.dataset.valor;
    if (a === 'cerrar') return salirCalendario();
    if (a === 'asistente') return calAbrirAsistente(Number(v) || 0);
    if (a === 'ahora-no'){ calGuardarPreferencias({ v: 1, estado: 'omitido' }); return void pintarCalendario(); }
    if (s.asistente){
      const as = s.asistente;
      if (a === 'as-cancelar'){ as.controller?.abort(); s.asistente = null; pintarCalendario(); return void calEnfocarAjustes(); }
      // Sin sitio no hay agenda local: del sitio se pasa a las competiciones.
      const salto = !as.b.sitio && as.paso === (a === 'as-siguiente' ? 0 : 2) ? 2 : 1;
      if (a === 'as-anterior') return calPasoAsistente(as.paso - salto);
      if (a === 'as-siguiente') return calPasoAsistente(as.paso + salto);
      if (a === 'as-ir') return calPasoAsistente(Number(v));
      if (a === 'as-guardar') return calGuardarAsistente();
      if (a === 'elegir-donde'){
        as.b.sitio = { id: v, nombre: b.dataset.nombre }; s.escrito.donde = ''; s.sugerencias.donde = [];
        return void pintarCalendario();
      }
      return;
    }
    if (a === 'elegir-fecha'){
      const f = document.getElementById('cal-fecha');
      try { return void f.showPicker(); } catch { return void f.click(); }
    }
    if (a === 'renovar') return void cargarCalendario(true);
    if (a === 'evento') return void abrirEventoCalendario(v);
    if (a === 'desplegar') return void desplegarEventoCalendario(v, b.dataset.id);
    if (a === 'pendientes' || a === 'mas-pendientes') return void pendientesCalendario(a === 'mas-pendientes');
    if (a === 'ver-dia' || a === 'mas-dia') return void abrirDiaCalendario(v, 'citas', a === 'mas-dia');
    if (a === 'mas-curso') return void abrirDiaCalendario(v, 'curso', true);
    if (a === 'curso' || a === 'ocultar-dia'){
      const l = s.dias.get(v + (a === 'curso' ? '|curso' : '|citas'));
      if (a === 'curso' && !l?.abierta) return void abrirDiaCalendario(v, 'curso');
      l.abierta = false; return void pintarCalendario();
    }
    if (a === 'mes'){ s.mesAbierto = !s.mesAbierto; return void consultarCalendario(); }
    if (a === 'temporada'){
      s.temporadaAbierta = !s.temporadaAbierta; pintarCalendario();
      return void (s.temporadaAbierta && cargarTemporadaCalendario());
    }
    if (a === 'editar-donde'){
      s.editandoDonde = true; pintarCalendario();
      return void document.getElementById('cal-donde')?.focus();
    }
    let enfocar = '';
    if (a === 'elegir-donde'){
      calElegirDonde({ id: v, nombre: b.dataset.nombre }); s.escrito.donde = ''; s.sugerencias.donde = []; s.editandoDonde = false;
      enfocar = '[data-cal="editar-donde"]';
    }
    // Quitar el prefijo no cierra la agenda abierta por él: se queda con lo suyo.
    if (a === 'quitar-prefijo'){ s.porPrefijo = false; return calQuitarPrefijos(o => !calEsDeportiva(o) && o.ambitos.includes(v)); }
    if (a === 'ir-deportes') return abrirCalendario(document.getElementById('btn-deportes'), 'deportes');
    if (a === 'quedarse') return calQuitarPrefijos(o => v === 'deportes' ? !calEsDeportiva(o) : calEsDeportiva(o));
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
    if (a === 'categoria'){
      s.temas.clear(); s.mio = false;
      if (v === 'mio') calVerLoMio();
      else if (v) s.temas.add(v);
    }
    // Capas: solo una (su nombre en «Este mes en deportes»), todas o las que sigo.
    // Con un prefijo de competición no hay capas: manda el prefijo.
    if (s.capas){
      if (a === 'solo') s.capas = new Set([v]);
      if (a === 'capas-todas') s.capas = new Set(CAL_COMPETICIONES);
      if (a === 'capas-sigo') s.capas = new Set(calPreferencias().competiciones);
      // Un deporte se elige entero y, pulsado otra vez, vuelve a todas; dentro
      // de él, cada competición se enciende o se apaga. Nunca sin capas.
      if (a === 'deporte') s.capas = new Set(calDeporteElegido() === v ? CAL_COMPETICIONES : CAL_DEPORTES[v]);
      if (a === 'capa'){
        const capas = new Set(s.capas);
        capas.has(v) ? capas.delete(v) : capas.add(v);
        if (capas.size) s.capas = capas;
      }
    }
    // Una subcategoría sustituye a su raíz y se quita volviendo a pulsarla.
    if (a === 'tema'){
      const raiz = calRaizElegida(), pulsado = s.temas.has(v);
      s.temas.clear(); s.temas.add(pulsado ? raiz : v);
    }
    if (a === 'gratis') s.precio = s.precio === 'gratis' ? '' : 'gratis';
    consultarCalendario();
    if (enfocar) p.querySelector(enfocar)?.focus({ preventScroll: true });
  });
  p.addEventListener('change', e => {
    const id = e.target.id, v = e.target.value, as = s.asistente;
    if (as && e.target.name?.startsWith('cal-as-')){
      const b = as.b, n = e.target.name, marcado = e.target.checked;
      if (n === 'cal-as-sitio') b.sitio = v ? { id: v, nombre: e.target.dataset.nombre } : null;
      if (n === 'cal-as-interes'){
        if (v === 'otra') b.otraCultura = marcado;
        else if (v === 'deporte') b.deporteLocal = marcado;
        else marcado ? b.cultura.add(v) : b.cultura.delete(v);
      }
      if (n === 'cal-as-comp') marcado ? b.competiciones.add(v) : b.competiciones.delete(v);
      as.error = '';
      return;
    }
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
  if (typeof ResizeObserver !== 'undefined'){
    let ancho = calMesAncho();
    new ResizeObserver(() => {
      if (calMesAncho() === ancho) return;
      ancho = calMesAncho();
      if (s.abierto && s.mesAbierto) consultarCalendario();
    }).observe(p);
  }
  // El alto de las semanas sigue al de la ventana.
  let alto = calAltoSemana();
  window.addEventListener?.('resize', () => {
    if (calAltoSemana() === alto) return;
    alto = calAltoSemana();
    if (s.abierto && s.mesAbierto && !s.asistente && calMesAncho()) pintarCalendario();
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
