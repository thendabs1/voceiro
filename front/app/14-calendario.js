/* Calendario: cliente de la API de agenda de los workers de datos (/calendario/*). */
// Se pide solo lo visible: el catálogo una vez, el resumen de la ventana (cuentas
// y unas muestras por día), la lista de un día al abrirla y el detalle de una
// cita. Resultados y clasificaciones son consultas puntuales.
const CALENDARIO_ACTIVO = true;
// Zonas que prepara la publicación; con otra zona del navegador, la peninsular.
const CAL_ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'UTC'];
const CAL_ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone;
// «Tipo de plan»: los formatos del clasificador (agenda/clasificacion.md), en su orden.
const CAL_FORMATOS = ['concierto', 'representacion', 'proyeccion', 'exposicion', 'curso-taller', 'charla-encuentro',
  'lectura-club', 'festival', 'feria-mercado', 'fiesta', 'visita-ruta', 'competicion-deportiva', 'practica-deportiva'];
const CAL_PRECIOS = { gratis: 'calPrecioGratis', pago: 'calPrecioPago', mixto: 'calPrecioMixto' };
const CAL_VISTAS = { lista7: 'calLista7', lista14: 'calLista14', mes: 'calMes' };
// Categorías a mano en la barra; las demás raíces, en el panel de filtros.
const CAL_CATEGORIAS = ['cultura', 'deportes'];
const CALENDARIO = {
  abierto: false, porPrefijo: false, orden: null, meta: null, cargado: 0, cargando: false, error: '',
  // dia: el elegido en el mes. dias: listas abiertas por «día|citas» o «día|curso».
  fecha: '', desdeConsulta: '', vista: 'lista7', dia: '', zona: CAL_ZONAS.includes(CAL_ZONA) ? CAL_ZONA : 'Europe/Madrid',
  temas: new Set(), fuente: '', formato: '', precio: '', donde: null, que: null, clave: '',
  escrito: { donde: '', que: '' }, sugerencias: { donde: [], que: [] },
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
  const q = o ? [...o.ambitos.map(a => a + ':'), ...(o.circuitos.length ? ['circuito:' + o.circuitos.join(',')] : [])].join(' ') : '';
  return { zona: s.zona, q, texto: calLibre(o?.resto),
    temas: [...s.temas].join(','), fuente: s.fuente, formatos: s.formato, precio: s.precio,
    objetivo: s.que?.id || '', territorio: s.donde?.id || '' };
}
// Días de la vista y su ventana [desde, hasta) dentro de lo publicado.
// desde:/hasta: del buscador acotan la celebración; en noticias, la publicación.
function calVentana(){
  const s = CALENDARIO, h = s.meta?.horizonte, p = parseQuery(s.orden?.resto || '');
  const dias = ventanaCalendario(s.fecha, s.vista);
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
  // El mes solo pinta cuentas; las listas, tres muestras por día.
  const params = { ...calParametros(), desde, hasta, muestras: s.vista === 'mes' ? 0 : 3 };
  const clave = JSON.stringify([s.vista, params]);
  if (clave === s.consulta && !s.error) return void pintarCalendario();
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  // Al renovar la misma consulta se deja lo que había hasta que llegue su sustituto.
  if (clave !== s.vigente){ s.resumen = null; s.dias.clear(); }
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
  }
  s.cargando = false; pintarCalendario();
  // En el mes, la lista del día elegido: el de la fecha de la vista (hoy al
  // abrir, el 1 al cambiar de mes) o el primero publicado.
  if (s.vista === 'mes' && s.resumen?.length){
    if (!s.resumen.some(d => d.dia === s.dia)) s.dia = s.resumen.some(d => d.dia === s.fecha) ? s.fecha : s.resumen[0].dia;
    abrirDiaCalendario(s.dia, 'citas');
  }
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
  s.temas.clear(); s.fuente = ''; s.formato = ''; s.precio = ''; s.donde = null; s.que = null;
  s.escrito = { donde: '', que: '' }; s.sugerencias = { donde: [], que: [] };
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
      if (!s.abierto){ s.origen = document.getElementById('buscar'); s.scroll = window.scrollY; s.abierto = s.porPrefijo = true; }
    } else if (s.porPrefijo) s.abierto = s.porPrefijo = false;
  }
  s.orden = orden;
  if (s.abierto) return void cargarCalendario();
  pintarCalendario();
}
function abrirCalendario(origen = null){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO;
  if (!s.abierto){ s.origen = origen || document.activeElement; s.scroll = window.scrollY; }
  cerrarEstadisticas(false);
  s.abierto = true; s.porPrefijo = false; s.fecha ||= calHoy();
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
// Un día de la lista: sus muestras y «Ver las N citas»; abierta, todas.
function calDiaLista(d){
  const s = CALENDARIO, l = s.dias.get(d.dia + '|citas'), citas = d.citas + d.programas;
  let cuerpo;
  if (!citas) cuerpo = `<p class="cal-nota">${calEsc(t('calDiaSinCitas'))}</p>`;
  else if (l?.abierta && l.cargada){
    cuerpo = calCitas(l.eventos) + `<div class="cal-paginacion">${l.siguiente ? calBoton('mas-dia', t('calCargarMas'), d.dia, l.cargando ? 'disabled' : '') : ''}
      ${calBoton('ocultar-dia', t('calOcultar'), d.dia)}</div>`;
  } else {
    cuerpo = calCitas(d.muestras) + (citas > d.muestras.length
      ? `<div class="cal-paginacion">${calBoton('ver-dia', t('calVerCitas', { n: citas, dia: calFecha(d.dia, { weekday: 'long', day: undefined, month: undefined }) }), d.dia, l?.cargando ? 'disabled' : '')}</div>` : '');
  }
  return `<section class="cal-dia"><h2>${calEsc(calFecha(d.dia, { weekday: 'short' }))} <small>${calEsc(calCuentas(d))}</small></h2>${cuerpo}</section>`;
}
// «En curso»: plegado, con su cuenta del día; al abrirlo, la lista de ese día.
function calEnCurso(d){
  if (!d?.en_curso) return '';
  const s = CALENDARIO, l = s.dias.get(d.dia + '|curso'), abierta = Boolean(l?.abierta);
  const etiqueta = d.dia === calHoy() ? t('calEnCursoHoy', { n: d.en_curso })
    : t('calEnCursoDia', { n: d.en_curso, fecha: calFecha(d.dia, { weekday: 'short' }) });
  return `<section class="cal-en-curso">${calBoton('curso', (abierta ? '▾ ' : '▸ ') + etiqueta, d.dia, `aria-expanded="${abierta}"`)}
    ${abierta ? `<p class="cal-nota">${calEsc(t('calProgramacionesNota'))}</p>${(l.eventos || []).map(calCita).join('')}
      ${l.siguiente ? `<div class="cal-paginacion">${calBoton('mas-curso', t('calCargarMas'), d.dia, l.cargando ? 'disabled' : '')}</div>` : ''}` : ''}</section>`;
}
function calLista(){
  const r = CALENDARIO.resumen;
  if (!r) return '';
  return calEnCurso(r[0]) + r.map(calDiaLista).join('');
}
// Mes natural: número del día, citas y una marca si hay algo en curso. El día
// elegido abre debajo su lista y su bloque «En curso».
function calMes(){
  const s = CALENDARIO, r = s.resumen;
  if (!r) return '';
  const porDia = new Map(r.map(d => [d.dia, d])), dias = ventanaCalendario(s.fecha, 'mes');
  const celdas = dias.map(dia => {
    const d = porDia.get(dia), citas = d ? d.citas + d.programas : 0;
    const etiqueta = `${calDiaLargo(dia)}: ${d ? calCuentas(d) : calN('calNCitas', 0)}`;
    return `<button type="button" class="cal-celda${dia.slice(0, 7) !== s.fecha.slice(0, 7) ? ' cal-otro-mes' : ''}" data-cal="seleccionar" data-valor="${dia}"
      aria-pressed="${dia === s.dia}"${dia === calHoy() ? ' aria-current="date"' : ''} aria-label="${calEsc(etiqueta)}"${d ? '' : ' disabled'}>
      <span class="cal-num">${calEsc(calFecha(dia, { month: undefined }))}</span>${citas ? `<span class="cal-cuenta">${citas}</span>` : ''}
      ${d?.en_curso ? '<span class="cal-marca" aria-hidden="true">~</span>' : ''}</button>`;
  }).join('');
  const d = porDia.get(s.dia), l = s.dias.get(s.dia + '|citas');
  const lista = !d ? '' : `<section class="cal-dia"><h2>${calEsc(calDiaLargo(d.dia))} <small>${calEsc(calCuentas(d))}</small></h2>
    ${l?.cargada ? calCitas(l.eventos) || `<p class="cal-nota">${calEsc(t('calDiaSinCitas'))}</p>` : ''}
    ${l?.siguiente ? `<div class="cal-paginacion">${calBoton('mas-dia', t('calCargarMas'), d.dia, l.cargando ? 'disabled' : '')}</div>` : ''}</section>${calEnCurso(d)}`;
  return `<div class="cal-mes" role="group" aria-label="${calEsc(t('calMes'))}">${dias.slice(0, 7).map(dia => `<abbr class="cal-semana-nombre" title="${calEsc(calFecha(dia, { weekday: 'long', day: undefined, month: undefined }))}">${calEsc(calFecha(dia, { weekday: 'narrow', day: undefined, month: undefined }))}</abbr>`).join('')}${celdas}</div>${lista}`;
}
function calPendientes(){
  const p = CALENDARIO.pendientes;
  if (!p) return `<div class="cal-pendientes">${calBoton('pendientes', t('calVerPendientes'))}</div>`;
  return `<section class="cal-pendientes"><h2>${calEsc(t('calSinFecha'))}</h2>
    ${p.eventos.map(calCita).join('') || (p.cargando ? '' : `<p class="cal-nota">${calEsc(t('calNingunaPendiente'))}</p>`)}
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
      const d = await calPedir('objetivos', { texto: libre, tipo: 'agrupacion,actividad,participante,lugar', limite: 8 }, controller.signal);
      s.sugerencias.que = d.entidades.map(e => ({ id: e.tipo + ':' + e.id, nombre: calNombre(e),
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
const calRaices = conceptos => Object.keys(conceptos).filter(i => !conceptos[i].padres.length && Object.values(AMBITOS).some(a => a.tema === i));
const calChipTema = i => calBoton('tema', calNombre(CALENDARIO.meta.catalogo.conceptos[i]), i, `aria-pressed="${CALENDARIO.temas.has(i)}"`);
function calCategorias(){
  const m = CALENDARIO.meta;
  if (!m) return '';
  const fijas = CAL_CATEGORIAS.filter(i => calRaices(m.catalogo.conceptos).includes(i));
  return fijas.length ? `<div class="cal-chips cal-categorias" role="group" aria-label="${calEsc(t('calTemas'))}">${fijas.map(calChipTema).join('')}</div>` : '';
}
function calTemas(){
  const s = CALENDARIO, conceptos = s.meta.catalogo.conceptos, todas = calRaices(conceptos);
  const raices = todas.filter(i => !CAL_CATEGORIAS.includes(i));
  const hijos = r => Object.keys(conceptos).filter(i => conceptos[i].padres.includes(r));
  const elegidas = todas.filter(r => s.temas.has(r) || hijos(r).some(h => s.temas.has(h)));
  if (!raices.length && !elegidas.length) return '';
  return `<fieldset><legend>${calEsc(t('calTemas'))}</legend><div class="cal-chips">${calBoton('todos-temas', t('calTodas'), '', `aria-pressed="${!s.temas.size}"`)}${raices.map(calChipTema).join('')}</div>
    ${elegidas.map(r => `<div class="cal-chips cal-subtemas" role="group" aria-label="${calEsc(calNombre(conceptos[r]))}">${hijos(r).map(calChipTema).join('')}</div>`).join('')}</fieldset>`;
}
function calFiltros(){
  const s = CALENDARIO, m = s.meta;
  if (!m) return '';
  const option = (valor, label, elegido) => `<option value="${calEsc(valor)}"${elegido === valor ? ' selected' : ''}>${calEsc(label)}</option>`;
  const enPanel = [...s.temas].filter(i => !CAL_CATEGORIAS.includes(i)).length + [s.donde, s.formato, s.precio, s.fuente, s.que].filter(Boolean).length;
  return `<details class="cal-filtros-avanzados"><summary>${calEsc(t('calFiltrosN', { n: enPanel }))}</summary>
    <div class="cal-filtros"><div class="cal-campos">${calCampo('donde', t('calDonde'), t('calDondeEjemplo'))}
    <label>${calEsc(t('calTipoPlan'))}<select id="cal-formato">${option('', t('calTodos'), s.formato)}${CAL_FORMATOS.map(f => option(f, calNombreFormato(f), s.formato)).join('')}</select></label>
    <label>${calEsc(t('calPrecio'))}<select id="cal-precio">${option('', t('calPrecioCualquiera'), s.precio)}${Object.entries(CAL_PRECIOS).map(([v, k]) => option(v, t(k), s.precio)).join('')}</select></label>
    <label>${calEsc(t('calServicio'))}<select id="cal-fuente">${option('', t('calTodos'), s.fuente)}${Object.entries(m.fuentes).map(([i, f]) => option(i, f.nombre, s.fuente)).join('')}</select></label>
    ${calCampo('que', t('calObjetivo'), t('calObjetivoEjemplo'))}
    <label>${calEsc(t('calZona'))}<select id="cal-zona">${CAL_ZONAS.map(z => option(z, z, s.zona)).join('')}</select></label></div>
    ${calTemas()}${s.temas.size || enPanel ? calBoton('limpiar', t('calLimpiar')) : ''}</div></details>`;
}
function calContenido(){
  const s = CALENDARIO;
  if (s.orden?.desconocidos.length) return `<p class="cal-aviso">${calEsc(t('calConsultaDesconocida', { x: s.orden.desconocidos.join(', ') }))}</p>`;
  if (!s.meta) return '';
  const { desde, hasta, acotada } = calVentana();
  if (desde >= hasta) return `<p class="cal-aviso">${calEsc(t('calFueraHorizonte'))}</p>`;
  return (s.vista === 'mes' ? calMes() : calLista()) + (s.resumen && !acotada ? calPendientes() : '');
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
  const desplegados = [...p.querySelectorAll('details[open]')].map(d => d.className).filter(Boolean);
  p.setAttribute('aria-busy', String(s.cargando));
  const dias = ventanaCalendario(s.fecha, s.vista);
  const periodo = s.vista === 'mes' ? calFecha(s.fecha, { month: 'long', year: 'numeric', day: undefined })
    : `${calFecha(dias[0])} – ${calFecha(dias.at(-1), { year: 'numeric' })}`;
  // Una sola barra: periodo (el nombre abre el selector de fecha), vistas,
  // categorías, acciones y, al final, el panel de filtros.
  p.innerHTML = `<div class="cal-barra"><h1 id="cal-titulo" class="sr-only" tabindex="-1">${calEsc(t('calTitulo'))}</h1>
    <div class="cal-periodo">${calBoton('anterior', '←', '', `aria-label="${calEsc(t('calAnterior'))}"`)}
    ${calBoton('elegir-fecha', periodo, '', `class="cal-periodo-nombre" title="${calEsc(t('calFecha'))}"`)}${calBoton('siguiente', '→', '', `aria-label="${calEsc(t('calSiguiente'))}"`)}
    <input id="cal-fecha" class="sr-only" type="date" tabindex="-1" aria-hidden="true" value="${s.fecha}">${calBoton('hoy', t('calHoy'))}</div>
    <nav class="cal-nav" aria-label="${calEsc(t('calVistas'))}">${Object.entries(CAL_VISTAS).map(([v, k]) => calBoton('vista', t(k), v, s.vista === v ? 'aria-current="page"' : '')).join('')}</nav>
    ${calCategorias()}<div class="cal-acciones">${calBoton('renovar', '↻', '', `aria-label="${calEsc(t('calActualizar'))}" title="${calEsc(t('calActualizar'))}"${s.cargando ? ' disabled' : ''}`)}
    ${calBoton('cerrar', t(s.orden?.noticias ? 'calVerNoticias' : 'calCerrar'))}</div>${calFiltros()}</div>
    <div class="cal-cuerpo"><p class="cal-estado" role="status">${calEsc(s.error ? t(s.error) : s.cargando ? t('calCargando') : '')}</p>
    ${s.error === 'calError' ? calBoton('renovar', t('calReintentar')) : ''}<div class="cal-contenido">${calContenido()}</div>
    ${s.meta ? `<p class="cal-nota cal-pie">${calEsc(t('calCobertura'))} ${calEsc(t('calGenerado', { fecha: calFormato({ dateStyle: 'short', timeStyle: 'short', timeZone: s.zona }).format(new Date(s.meta.generado)) }))}</p>` : ''}
    ${s.orden?.noticias ? `<p class="cal-nota">${calEsc(t('calNoticiasTexto'))}</p>` : ''}</div>`;
  for (const clase of desplegados) for (const d of p.querySelectorAll('details')) if (d.className === clase) d.open = true;
  const siguiente = id ? document.getElementById(id) : [...p.querySelectorAll('[data-cal]')].find(b => b.dataset.cal === accion && b.dataset.valor === valor);
  siguiente?.focus({ preventScroll: true });
  if (seleccion && siguiente?.type === 'search') siguiente.setSelectionRange(...seleccion);
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
    if (a === 'seleccionar'){ s.dia = v; return void abrirDiaCalendario(v, 'citas'); }
    let enfocar = '';
    if (a === 'elegir-donde' || a === 'elegir-que'){
      const campo = a.slice(7);
      s[campo] = { id: v, nombre: b.dataset.nombre }; s.escrito[campo] = ''; s.sugerencias[campo] = [];
      enfocar = `[data-cal="quitar-${campo}"]`;
    }
    if (a === 'quitar-donde' || a === 'quitar-que'){ s[a.slice(7)] = null; enfocar = '#cal-' + a.slice(7); }
    if (a === 'vista') s.vista = v;
    if (a === 'anterior' || a === 'siguiente') s.fecha = moverFecha(s.fecha, s.vista, a === 'anterior' ? -1 : 1);
    if (a === 'hoy') s.fecha = s.dia = calHoy();
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
    if (a === 'limpiar'){ calLimpiarFiltros(); enfocar = '#cal-donde'; }
    consultarCalendario();
    if (enfocar) p.querySelector(enfocar)?.focus({ preventScroll: true });
  });
  p.addEventListener('change', e => {
    const id = e.target.id, v = e.target.value;
    if (id === 'cal-fecha' && fechaValida(v)) s.fecha = v;
    else if (id === 'cal-fuente') s.fuente = v;
    else if (id === 'cal-formato') s.formato = CAL_FORMATOS.includes(v) ? v : '';
    else if (id === 'cal-precio') s.precio = v in CAL_PRECIOS ? v : '';
    else if (id === 'cal-zona' && CAL_ZONAS.includes(v)) s.zona = v;
    else return;
    consultarCalendario();
  });
  p.addEventListener('input', e => {
    const id = e.target.id, v = e.target.value;
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
