/* Calendario: cliente de la API de agenda de los workers de datos (/calendario/*). */
// Se pide solo lo visible: el catálogo una vez, la ventana de cada vista y el
// detalle al abrir una cita. Resultados y clasificaciones son consultas puntuales.
// Apagado hasta rehacer la interfaz; los datos ya llegan de la API.
const CALENDARIO_ACTIVO = false;
// Zonas que prepara la publicación; con otra zona del navegador, la peninsular.
const CAL_ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'UTC'];
const CAL_ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CALENDARIO = {
  abierto: false, orden: null, meta: null, cargado: 0, cargando: false, error: '',
  fecha: '', vista: 'agenda', soloDia: false, zona: CAL_ZONAS.includes(CAL_ZONA) ? CAL_ZONA : 'Europe/Madrid',
  temas: new Set(), fuente: '', texto: '', donde: null, que: null, clave: '',
  escrito: { donde: '', que: '' }, sugerencias: { donde: [], que: [] },
  consulta: '', controller: null, lista: null, resumen: null, pendientes: null, origen: null, scroll: 0,
};
const iconoCalendario = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/></svg>';
const calNombre = e => e?.nombres?.[ACCES.lang] || e?.nombres?.es || Object.values(e?.nombres || {})[0] || '—';
const calEsc = s => escapeHtml(String(s ?? ''));
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
// backend respondería lo mismo, así que no se repite (salvo el límite, 429).
async function calPedir(ruta, params, signal){
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
    if (r.status >= 400 && r.status < 500 && r.status !== 429) throw fallo;
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
  const q = o ? [...o.ambitos.map(a => a + ':'), ...(o.circuitos.length ? ['circuito:' + o.circuitos.join(',')] : [])].join(' ') : '';
  return { zona: s.zona, q, texto: [calLibre(o?.resto), calLibre(s.texto)].filter(Boolean).join(' '),
    temas: [...s.temas].join(','), fuente: s.fuente, objetivo: s.que?.id || '', territorio: s.donde?.id || '' };
}
// Días de la vista y su ventana [desde, hasta) dentro de lo publicado.
// desde:/hasta: del buscador acotan la celebración; en noticias, la publicación.
function calVentana(){
  const s = CALENDARIO, h = s.meta?.horizonte, p = parseQuery(s.orden?.resto || '');
  const dias = s.soloDia && s.vista === 'agenda' ? [s.fecha] : ventanaCalendario(s.fecha, s.vista);
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
  const { desde, hasta } = calVentana(), agenda = s.vista === 'agenda';
  const params = { ...calParametros(), desde, hasta, ...(agenda ? { limite: 20 } : {}) };
  const clave = JSON.stringify([s.vista, params]);
  if (clave === s.consulta && !s.error) return void pintarCalendario();
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  s.consulta = clave; s.lista = s.resumen = null; s.error = '';
  // Abortar también corta la lista sin fecha en curso: se vuelve a pedir al pulsar.
  const p = s.pendientes;
  if (p && (p.cargando || p.clave !== JSON.stringify(calParametros()))) s.pendientes = null;
  if (desde >= hasta){ s.cargando = false; return void pintarCalendario(); }
  s.cargando = true; pintarCalendario();
  try {
    const dato = await calPedir(agenda ? 'eventos' : 'resumen', params, controller.signal);
    calAnotar(dato);
    if (agenda) s.lista = { params, eventos: dato.eventos, siguiente: dato.siguiente, cargando: false };
    else s.resumen = dato.dias;
  } catch (e){
    if (controller.signal.aborted) return;
    s.error = e.status === 422 ? 'calFueraHorizonte' : 'calError';
  }
  s.cargando = false; pintarCalendario();
}
// «Ver más» sigue el cursor de la misma consulta. Si la publicación cambió
// entre páginas (409), se rehace desde el principio para no mezclar lecturas.
async function masCalendario(){
  const s = CALENDARIO, l = s.lista, controller = s.controller;
  if (!l?.siguiente || l.cargando) return;
  l.cargando = true; pintarCalendario();
  try {
    const dato = await calPedir('eventos', { ...l.params, cursor: l.siguiente }, controller.signal);
    if (s.lista !== l) return;
    calAnotar(dato); l.eventos.push(...dato.eventos); l.siguiente = dato.siguiente;
  } catch (e){
    if (controller.signal.aborted || s.lista !== l) return;
    if (e.status === 409){ s.consulta = ''; return void consultarCalendario(); }
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
  s.temas.clear(); s.fuente = ''; s.texto = ''; s.donde = null; s.que = null;
  s.escrito = { donde: '', que: '' }; s.sugerencias = { donde: [], que: [] };
}
function actualizarConsultaCalendario(orden){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO, clave = JSON.stringify(orden);
  if (clave !== s.clave){
    s.clave = clave; calLimpiarFiltros(); s.soloDia = false;
    const fecha = parseQuery(orden?.resto || '').desde;
    s.fecha = fechaValida(fecha) ? fecha : calHoy();
  }
  s.orden = orden;
  if (s.abierto || calPideAgenda(orden)) return void cargarCalendario();
  pintarCalendario();
}
function abrirCalendario(origen = null){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO;
  if (!s.abierto){ s.origen = origen || document.activeElement; s.scroll = window.scrollY; }
  cerrarEstadisticas(false);
  s.abierto = true; s.fecha ||= calHoy();
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
  s.abierto = false; pintarCalendario();
  if (!volver) return;
  const origen = s.origen?.isConnected ? s.origen : document.getElementById('btn-calendario');
  const menu = origen?.closest?.('#cab-menu');
  (menu && !menu.open ? menu.querySelector('summary') : origen)?.focus({ preventScroll: true });
  window.scrollTo({ top: s.scroll, behavior: 'auto' });
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
function calEvento(e, compacto = false){
  const v = e.programacion?.valor, estado = v?.programacion;
  const aviso = e.programacion?.conflicto || e.lugar?.conflicto;
  const lugar = calLugar(e);
  const avisoEstado = estado === 'cancelado' || estado === 'aplazado' ? `<p class="cal-aviso">${calEsc(t(estado === 'cancelado' ? 'calCancelado' : 'calAplazado'))}</p>` : '';
  if (compacto) return `<article class="cal-evento cal-evento-compacto"><h3>${calBoton('evento', calNombre(e), e.id, 'aria-haspopup="dialog"')}</h3>
    <p class="cal-cuando">${calEsc(calHora(e))}</p>${lugar ? `<p class="cal-nota">${calEsc(lugar)}</p>` : ''}
    ${avisoEstado}${aviso ? `<p class="cal-aviso">${calEsc(t('calConflicto'))}</p>` : ''}</article>`;
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
function calAgenda(){
  const s = CALENDARIO, l = s.lista;
  if (!l) return '';
  // La API ordena por día y luego por ID; dentro del día, por hora y nombre.
  const intervalo = e => e.programacion?.valor?.modalidad === 'intervalo';
  const hora = e => extremoVisible(e.programacion?.valor?.cuando?.inicio, s.zona).hora || '99:99';
  const grupos = new Map();
  for (const e of l.eventos) if (!intervalo(e)){
    if (!grupos.has(e.dia)) grupos.set(e.dia, []);
    grupos.get(e.dia).push(e);
  }
  for (const lista of grupos.values()) lista.sort((a, b) => hora(a).localeCompare(hora(b)) || calNombre(a).localeCompare(calNombre(b)));
  const prolongadas = l.eventos.filter(intervalo).sort((a, b) => calNombre(a).localeCompare(calNombre(b)));
  let html = `<div class="cal-agenda">${[...grupos].map(([dia, lista]) => `<section class="cal-dia"><h2>${calEsc(calFecha(dia, { weekday: 'short' }))}</h2>${lista.map(e => calEvento(e, true)).join('')}</section>`).join('')}
    ${prolongadas.length ? `<section class="cal-dia cal-intervalos"><h2>${calEsc(t('calProgramaciones'))}</h2><p class="cal-nota">${calEsc(t('calProgramacionesNota'))}</p>${prolongadas.map(e => calEvento(e, true)).join('')}</section>` : ''}</div>`;
  if (!l.eventos.length) html += `<p>${calEsc(t('calSinCitas'))}</p>`;
  if (l.siguiente) html += `<div class="cal-paginacion">${calBoton('mas', t('calCargarMas'), '', l.cargando ? 'disabled' : '')}</div>`;
  return html;
}
function calSemana(){
  const s = CALENDARIO;
  if (!s.resumen) return '';
  return `<div class="cal-semana">${s.resumen.map(d => `<section class="cal-dia"><h2>${calBoton('dia', calFecha(d.dia, { weekday: 'short', month: undefined }), d.dia, `aria-label="${calEsc(calFecha(d.dia, { weekday: 'long' }))} · ${d.cantidad}" ${d.dia === calHoy() ? 'aria-current="date"' : ''}`)}</h2>${d.muestras.map(e => calEvento(e, true)).join('') || `<p class="cal-nota">${calEsc(t('calSinCitas'))}</p>`}${d.cantidad > d.muestras.length ? calBoton('dia', t('calMas', { n: d.cantidad - d.muestras.length }), d.dia) : ''}</section>`).join('')}</div>`;
}
function calMes(){
  const s = CALENDARIO, { dias } = calVentana();
  if (!s.resumen) return '';
  const porDia = new Map(s.resumen.map(d => [d.dia, d]));
  return `<div class="cal-mes" aria-label="${calEsc(t('calMes'))}">${dias.slice(0, 7).map(d => `<abbr class="cal-semana-nombre" title="${calEsc(calFecha(d, { weekday: 'long', day: undefined, month: undefined }))}">${calEsc(calFecha(d, { weekday: 'narrow', day: undefined, month: undefined }))}</abbr>`).join('')}
    ${dias.map(dia => {
      const d = porDia.get(dia) || { cantidad: 0, muestras: [] };
      return `<div class="cal-celda${dia.slice(0,7) !== s.fecha.slice(0,7) ? ' cal-otro-mes' : ''}">
      ${calBoton('dia', calFecha(dia, { month: undefined }), dia, `${dia === calHoy() ? 'aria-current="date"' : ''} aria-label="${calEsc(calFecha(dia, { weekday: 'long' }))} · ${d.cantidad}"`)}
      ${d.muestras.map(e => calBoton('evento', `${extremoVisible(e.programacion?.valor?.cuando?.inicio, s.zona).hora || '·'} ${calNombre(e)}`, e.id, `class="cal-mini-evento" aria-haspopup="dialog" title="${calEsc(calNombre(e))}"`)).join('')}
      ${d.cantidad > d.muestras.length ? calBoton('dia', t('calMas', { n: d.cantidad - d.muestras.length }), dia) : ''}</div>`;
    }).join('')}</div>`;
}
function calPendientes(){
  const p = CALENDARIO.pendientes;
  if (!p) return `<div class="cal-pendientes">${calBoton('pendientes', t('calVerPendientes'))}</div>`;
  return `<section class="cal-pendientes"><h2>${calEsc(t('calSinFecha'))}</h2>
    ${p.eventos.map(e => calEvento(e, true)).join('') || (p.cargando ? '' : `<p class="cal-nota">${calEsc(t('calNingunaPendiente'))}</p>`)}
    ${p.siguiente ? calBoton('mas-pendientes', t('calCargarMas'), '', p.cargando ? 'disabled' : '') : ''}</section>`;
}
// Dónde: comunidades, provincias y municipios del catálogo territorial común
// (los municipios, con la lista del tiempo). Qué: entidades publicadas.
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
let calTimerQue = 0;
function sugerirQue(texto){
  const s = CALENDARIO, libre = calLibre(texto);
  clearTimeout(calTimerQue); s.controllerQue?.abort();
  if (normalize(libre).trim().length < 3){ s.sugerencias.que = []; return void pintarSugerencias('que'); }
  calTimerQue = setTimeout(async () => {
    const controller = s.controllerQue = new AbortController();
    const conceptos = s.meta?.catalogo?.conceptos || {};
    try {
      const d = await calPedir('objetivos', { texto: libre, limite: 12 }, controller.signal);
      s.sugerencias.que = d.entidades.filter(e => ['agrupacion', 'actividad', 'participante', 'lugar'].includes(e.tipo))
        .slice(0, 8).map(e => ({ id: e.tipo + ':' + e.id, nombre: calNombre(e),
          meta: (e.temas || []).filter(i => conceptos[i]).map(i => calNombre(conceptos[i])).join(', ') }));
    } catch {
      if (controller.signal.aborted) return;
      s.sugerencias.que = [];
    }
    pintarSugerencias('que');
  }, 300);
}
const calSugerenciasHtml = campo => CALENDARIO.sugerencias[campo].map(x => `<button type="button" data-cal="elegir-${campo}" data-valor="${calEsc(x.id)}" data-nombre="${calEsc(x.nombre)}">${calEsc(x.nombre)}${x.meta ? ` <small>${calEsc(x.meta)}</small>` : ''}</button>`).join('');
function pintarSugerencias(campo){
  const el = document.getElementById('cal-sug-' + campo);
  if (el) el.innerHTML = calSugerenciasHtml(campo);
}
function calCampo(campo, label, ejemplo){
  const s = CALENDARIO, elegido = s[campo];
  if (elegido) return `<div class="cal-campo-sug"><span class="cal-etiqueta">${calEsc(label)}</span>
    ${calBoton('quitar-' + campo, '✕ ' + elegido.nombre, '', `class="cal-elegido" aria-label="${calEsc(t('calQuitar', { x: elegido.nombre }))}"`)}</div>`;
  return `<div class="cal-campo-sug"><label for="cal-${campo}">${calEsc(label)}</label>
    <input id="cal-${campo}" type="search" autocomplete="off" value="${calEsc(s.escrito[campo])}" placeholder="${calEsc(ejemplo)}" aria-controls="cal-sug-${campo}">
    <div id="cal-sug-${campo}" class="cal-sugerencias" role="group" aria-label="${calEsc(t('calSugerencias'))}">${calSugerenciasHtml(campo)}</div></div>`;
}
// Categorías: las raíces de los ámbitos; sus subcategorías, al elegir una.
function calTemas(){
  const s = CALENDARIO, conceptos = s.meta.catalogo.conceptos;
  const raices = Object.keys(conceptos).filter(i => !conceptos[i].padres.length && Object.values(AMBITOS).some(a => a.tema === i));
  const hijos = r => Object.keys(conceptos).filter(i => conceptos[i].padres.includes(r));
  const chip = i => calBoton('tema', calNombre(conceptos[i]), i, `aria-pressed="${s.temas.has(i)}"`);
  return `<fieldset><legend>${calEsc(t('calTemas'))}</legend><div class="cal-chips">${calBoton('todos-temas', t('calTodas'), '', `aria-pressed="${!s.temas.size}"`)}${raices.map(chip).join('')}</div>
    ${raices.filter(r => s.temas.has(r) || hijos(r).some(h => s.temas.has(h))).map(r => `<div class="cal-chips cal-subtemas" role="group" aria-label="${calEsc(calNombre(conceptos[r]))}">${hijos(r).map(chip).join('')}</div>`).join('')}</fieldset>`;
}
function calFiltros(){
  const s = CALENDARIO, m = s.meta;
  if (!m) return '';
  const option = (valor, label, elegido) => `<option value="${calEsc(valor)}"${elegido === valor ? ' selected' : ''}>${calEsc(label)}</option>`;
  const avanzados = [s.que, s.fuente].filter(Boolean).length;
  const activos = s.temas.size + avanzados + [s.donde, s.texto].filter(Boolean).length;
  return `<div class="cal-filtros"><div class="cal-campos cal-principales"><label class="cal-buscar">${calEsc(t('calBuscar'))}<input id="cal-texto" type="search" value="${calEsc(s.texto)}" placeholder="${calEsc(t('calBuscarEjemplo'))}"></label>
    ${calCampo('donde', t('calDonde'), t('calDondeEjemplo'))}</div>
    ${calTemas()}
    <div class="cal-filtros-extra"><details class="cal-filtros-avanzados"><summary>${calEsc(t('calFiltros'))}${avanzados ? ` (${avanzados})` : ''}</summary>
    <div class="cal-campos">${calCampo('que', t('calObjetivo'), t('calObjetivoEjemplo'))}
    <label>${calEsc(t('calFuente'))}<select id="cal-fuente">${option('', t('calTodas'), s.fuente)}${Object.entries(m.fuentes).map(([i, f]) => option(i, f.nombre, s.fuente)).join('')}</select></label>
    <label>${calEsc(t('calZona'))}<select id="cal-zona">${CAL_ZONAS.map(z => option(z, z, s.zona)).join('')}</select></label></div>
    </details>${activos ? calBoton('limpiar', t('calLimpiar')) : ''}</div></div>`;
}
function calContenido(){
  const s = CALENDARIO;
  if (s.orden?.desconocidos.length) return `<p class="cal-aviso">${calEsc(t('calConsultaDesconocida', { x: s.orden.desconocidos.join(', ') }))}</p>`;
  if (!s.meta) return '';
  const { desde, hasta, acotada } = calVentana();
  if (desde >= hasta) return `<p class="cal-aviso">${calEsc(t('calFueraHorizonte'))}</p>`;
  if (s.vista === 'mes') return calMes();
  if (s.vista === 'semana') return calSemana();
  return calAgenda() + (s.lista && !acotada ? calPendientes() : '');
}
function pintarCalendario(){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  if (!p) return;
  const visible = CALENDARIO_ACTIVO && (s.abierto || calPideAgenda(s.orden));
  p.hidden = !visible;
  document.body.classList.toggle('calendario-abierto', visible && s.abierto);
  document.body.classList.toggle('calendario-sin-noticias', visible && !!s.orden && !s.orden.noticias);
  document.getElementById('btn-calendario')?.setAttribute('aria-expanded', String(visible && s.abierto));
  if (!visible) return;
  s.fecha ||= calHoy();
  const foco = p.contains(document.activeElement) ? document.activeElement : null;
  const id = foco?.id, accion = foco?.dataset.cal, valor = foco?.dataset.valor;
  const seleccion = foco?.type === 'search' ? [foco.selectionStart, foco.selectionEnd] : null;
  const desplegados = [...p.querySelectorAll('details[open]')].map(d => d.className).filter(Boolean);
  p.setAttribute('aria-busy', String(s.cargando));
  const dias = ventanaCalendario(s.fecha, s.vista);
  const periodo = s.vista === 'mes' ? calFecha(s.fecha, { month: 'long', year: 'numeric', day: undefined })
    : s.soloDia ? calFecha(s.fecha, { weekday: 'short', year: 'numeric' })
    : `${calFecha(dias[0])} – ${calFecha(dias.at(-1), { year: 'numeric' })}`;
  p.innerHTML = `<div class="cal-cabecera"><h1 id="cal-titulo" tabindex="-1">${calEsc(t('calTitulo'))}</h1>
    <nav class="cal-nav" aria-label="${calEsc(t('calVistas'))}">${['agenda','semana','mes'].map(v => calBoton('vista', t({agenda:'calAgenda',semana:'calSemana',mes:'calMes'}[v]), v, s.vista === v ? 'aria-current="page"' : '')).join('')}</nav>
    <div class="cal-acciones">${calBoton('renovar', t('calActualizar'), '', s.cargando ? 'disabled' : '')}
    ${calBoton(s.abierto ? 'cerrar' : 'abrir', t(s.abierto ? 'calCerrar' : 'calAbrir'))}</div></div>
    ${s.orden ? `<p class="cal-contexto">${calEsc([...s.orden.ambitos, ...s.orden.circuitos, ...s.orden.tipos].join(' · ') || t('calTodos'))}</p>` : ''}
    <div class="cal-cuerpo"><div class="cal-periodo">${calBoton('anterior', '←', '', `aria-label="${calEsc(t('calAnterior'))}"`)}
    <strong>${calEsc(periodo)}</strong>${calBoton('siguiente', '→', '', `aria-label="${calEsc(t('calSiguiente'))}"`)}${calBoton('hoy', t('calHoy'))}
    <label><span class="sr-only">${calEsc(t('calFecha'))}</span><input id="cal-fecha" type="date" value="${s.fecha}"></label></div>
    ${calFiltros()}<p class="cal-estado" role="status">${calEsc(s.error ? t(s.error) : s.cargando ? t('calCargando') : '')}</p>
    ${s.error === 'calError' ? calBoton('renovar', t('calReintentar')) : ''}<div class="cal-contenido">${calContenido()}</div>
    ${s.meta ? `<p class="cal-nota cal-pie">${calEsc(t('calCobertura'))} ${calEsc(t('calGenerado', { fecha: calFormato({ dateStyle: 'short', timeStyle: 'short', timeZone: s.zona }).format(new Date(s.meta.generado)) }))}</p>` : ''}
    ${s.orden?.noticias ? `<p class="cal-nota">${calEsc(t('calNoticiasTexto'))}</p>` : ''}</div>`;
  for (const clase of desplegados) for (const d of p.querySelectorAll('details')) if (d.className === clase) d.open = true;
  const siguiente = id ? document.getElementById(id) : [...p.querySelectorAll('[data-cal]')].find(b => b.dataset.cal === accion && b.dataset.valor === valor);
  siguiente?.focus({ preventScroll: true });
  if (seleccion && siguiente?.type === 'search') siguiente.setSelectionRange(...seleccion);
}
let calTimerTexto = 0;
function wireCalendario(){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  const boton = document.getElementById('btn-calendario');
  boton.hidden = !CALENDARIO_ACTIVO;
  boton.addEventListener('click', e => s.abierto ? cerrarCalendario() : abrirCalendario(e.currentTarget));
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-cal]');
    if (!b) return;
    const a = b.dataset.cal, v = b.dataset.valor;
    if (a === 'abrir') return abrirCalendario(b);
    if (a === 'cerrar') return cerrarCalendario();
    if (a === 'renovar') return void cargarCalendario(true);
    if (a === 'evento') return void abrirEventoCalendario(v);
    if (a === 'mas') return void masCalendario();
    if (a === 'pendientes' || a === 'mas-pendientes') return void pendientesCalendario(a === 'mas-pendientes');
    let enfocar = '';
    if (a === 'elegir-donde' || a === 'elegir-que'){
      const campo = a.slice(7);
      s[campo] = { id: v, nombre: b.dataset.nombre }; s.escrito[campo] = ''; s.sugerencias[campo] = [];
      enfocar = `[data-cal="quitar-${campo}"]`;
    }
    if (a === 'quitar-donde' || a === 'quitar-que'){ s[a.slice(7)] = null; enfocar = '#cal-' + a.slice(7); }
    if (a === 'vista'){ s.vista = v; s.soloDia = false; }
    if (a === 'anterior' || a === 'siguiente') s.fecha = s.soloDia
      ? sumarDiasCalendario(s.fecha, a === 'anterior' ? -1 : 1) : moverFecha(s.fecha, s.vista, a === 'anterior' ? -1 : 1);
    if (a === 'hoy') s.fecha = calHoy();
    if (a === 'dia'){ s.fecha = v; s.vista = 'agenda'; s.soloDia = true; }
    // Elegir una subcategoría acota su raíz; elegir la raíz deja sus subcategorías.
    if (a === 'tema'){
      const conceptos = s.meta.catalogo.conceptos;
      if (s.temas.has(v)) s.temas.delete(v);
      else {
        s.temas.add(v);
        for (const [i, c] of Object.entries(conceptos)) if (conceptos[v].padres.includes(i) || c.padres.includes(v)) s.temas.delete(i);
      }
    }
    if (a === 'todos-temas') s.temas.clear();
    if (a === 'limpiar'){ calLimpiarFiltros(); enfocar = '#cal-texto'; }
    consultarCalendario();
    if (enfocar) p.querySelector(enfocar)?.focus({ preventScroll: true });
  });
  p.addEventListener('change', e => {
    const id = e.target.id, v = e.target.value;
    if (id === 'cal-fecha' && fechaValida(v)) s.fecha = v;
    else if (id === 'cal-fuente') s.fuente = v;
    else if (id === 'cal-zona' && CAL_ZONAS.includes(v)) s.zona = v;
    else return;
    consultarCalendario();
  });
  p.addEventListener('input', e => {
    const id = e.target.id, v = e.target.value;
    if (id === 'cal-texto'){
      // Una consulta al dejar de escribir: la API limita peticiones por IP.
      s.texto = v; clearTimeout(calTimerTexto); calTimerTexto = setTimeout(consultarCalendario, 400);
    }
    if (id === 'cal-donde'){ s.escrito.donde = v; sugerirDonde(v); }
    if (id === 'cal-que'){ s.escrito.que = v; sugerirQue(v); }
  });
  // Teclado en los campos con sugerencias: ↓ entra en la lista, Intro elige
  // la primera, Escape la cierra y vuelve al campo.
  p.addEventListener('keydown', e => {
    const campo = e.target.id?.match(/^cal-(donde|que)$/)?.[1] || e.target.dataset?.cal?.match(/^elegir-(donde|que)$/)?.[1];
    if (!campo) return;
    const botones = [...p.querySelectorAll(`#cal-sug-${campo} button`)], i = botones.indexOf(e.target);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      const destino = e.key === 'ArrowDown' ? botones[i + 1] : i > 0 ? botones[i - 1] : document.getElementById('cal-' + campo);
      if (destino){ e.preventDefault(); destino.focus(); }
    } else if (e.key === 'Enter' && i < 0 && botones[0]){
      e.preventDefault(); botones[0].click();
    } else if (e.key === 'Escape' && (botones.length || i >= 0)){
      e.preventDefault(); e.stopPropagation();
      s.sugerencias[campo] = []; pintarSugerencias(campo); document.getElementById('cal-' + campo)?.focus();
    }
  });
  document.getElementById('buscar').addEventListener('input', () => cerrarCalendario(false));
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
