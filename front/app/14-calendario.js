/* Un contrato de lectura para calendario y contenido deportivo del feed. */
const CALENDARIO = {
  abierto: false, orden: null, datos: null, cargando: false, error: false, intentado: false,
  fecha: '', vista: 'agenda', zona: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',
  temas: new Set(), circuitos: new Set(), fuente: '', objetivo: '', lugar: '', clave: '', controller: null,
  origen: null, scroll: 0, cargado: 0,
};
const iconoCalendario = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/></svg>';
const calNombre = e => e?.nombres?.[ACCES.lang] || e?.nombres?.es || Object.values(e?.nombres || {})[0] || '—';
const calEsc = s => escapeHtml(String(s ?? ''));
const calHoy = () => diaEnZona(new Date().toISOString(), CALENDARIO.zona);
const calFecha = (dia, opciones = {}) => fechaValida(dia) ? new Intl.DateTimeFormat(ACCES.lang, {
  timeZone: 'UTC', day: 'numeric', month: 'short', ...opciones,
}).format(new Date(dia + 'T12:00:00Z')) : t('calFechaPendiente');
const calBoton = (accion, label, valor = '', attrs = '') => `<button type="button" data-cal="${accion}" data-valor="${calEsc(valor)}" ${attrs}>${calEsc(label)}</button>`;
function calEnlace(url, label){
  try { if (!/^https?:$/.test(new URL(url).protocol)) return calEsc(label); }
  catch { return calEsc(label); }
  return `<a href="${calEsc(url)}" target="_blank" rel="noopener noreferrer">${calEsc(label)}</a>`;
}
function validarLecturaCalendario(p){
  if (!p || p.version !== 1 || p.nucleo_version !== 2 || !p.catalogo?.conceptos
      || !p.entidades || !p.fuentes || !Array.isArray(p.eventos) || !Array.isArray(p.clasificaciones)
      || !Number.isFinite(Date.parse(p.generado))) throw new Error('Contrato de calendario incompatible');
  const vistos = new Set();
  for (const [k, e] of Object.entries(p.entidades)){
    if (k !== `${e.tipo}:${e.id}` || !e.nombres || !Array.isArray(e.temas)
        || !Array.isArray(e.codigos) || !Array.isArray(e.objetivos)
        || e.objetivos.some(i => !Object.hasOwn(p.entidades, i))) throw new Error('Entidad de calendario inválida');
  }
  for (const e of p.eventos){
    if (vistos.has(e.id) || !Object.hasOwn(p.entidades, 'evento:' + e.id)
        || !Array.isArray(e.fuentes) || !Array.isArray(e.participaciones)) throw new Error('Evento inválido');
    vistos.add(e.id);
    const c = e.programacion?.valor?.cuando;
    if (c && (!c.inicio || !c.fin || [c.inicio, c.fin].some(x =>
      x.fecha && !fechaValida(x.fecha) || x.instante && !Number.isFinite(Date.parse(x.instante))))) throw new Error('Horario inválido');
  }
  for (const tabla of p.clasificaciones){
    if (!Array.isArray(tabla.filas) || !Object.hasOwn(p.entidades, `${tabla.ambito?.tipo}:${tabla.ambito?.id}`)) throw new Error('Clasificación inválida');
  }
  return p;
}
async function cargarCalendario(renovar = false){
  const s = CALENDARIO;
  if (s.cargando || !renovar && (s.datos || s.intentado)) return;
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  s.cargando = true; s.error = false; s.intentado = true; pintarCalendario();
  const bases = [...new Set([DATA_BASE, ...Object.values(BACKENDS).map(b => b.data)])];
  try {
    let datos, fallo;
    for (const base of bases){
      try {
        const r = await fetch(`${base}/calendario.json`, { cache: 'no-cache',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        datos = validarLecturaCalendario(await r.json()); break;
      } catch (e){ if (controller.signal.aborted) throw e; fallo = e; }
    }
    if (!datos) throw fallo;
    s.datos = datos; s.cargado = Date.now();
  } catch { if (!controller.signal.aborted) s.error = true; }
  finally { s.cargando = false; pintarCalendario(); }
}
function actualizarConsultaCalendario(orden){
  const s = CALENDARIO, clave = JSON.stringify(orden);
  if (clave !== s.clave){
    s.clave = clave; s.temas.clear(); s.circuitos.clear(); s.fuente = ''; s.objetivo = ''; s.lugar = '';
    const fecha = parseQuery(orden?.resto || '').desde;
    s.fecha = fecha || (orden?.tipos.includes('resultados') ? sumarDiasCalendario(calHoy(), -7) : calHoy());
  }
  s.orden = orden;
  if (orden && !s.datos && !s.intentado) cargarCalendario();
  pintarCalendario();
}
function abrirCalendario(origen = null){
  const s = CALENDARIO;
  if (!s.abierto){ s.origen = origen || document.activeElement; s.scroll = window.scrollY; }
  cerrarEstadisticas(false);
  s.abierto = true; s.fecha ||= calHoy();
  pintarCalendario();
  if (!s.datos || Date.now() - s.cargado > 60000) cargarCalendario(true);
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
function calLugar(e){
  const v = e.lugar?.valor;
  if (!v) return '';
  if (typeof v === 'string') return v;
  return [v.nombre || v.fullName || v.displayName, v.municipio_literal || v.municipio || v.address?.city].filter(Boolean).join(' · ');
}
const CAL_METRICAS = {
  'baloncesto.puntos': 'calPuntos', 'baloncesto.partidos_jugados': 'calPJ',
  'baloncesto.victorias': 'calPG', 'baloncesto.derrotas': 'calPP',
  'baloncesto.puntos_favor': 'calPF', 'baloncesto.puntos_contra': 'calPC',
  'baloncesto.diferencia': 'calDiferencia', 'baloncesto.porcentaje_victorias': 'calPorcentaje',
  'tenis.sets_ganados': 'calSets', 'tenis.juegos': 'calJuegos',
  'tenis.puntos_desempate': 'calDesempate', 'carrera.posicion': 'calPosicion', 'carrera.tiempo': 'calSegundos',
};
function calTabla(filas, caption, conPosicion = false){
  const metricas = [...new Set(filas.flatMap(f => Object.keys(f.metricas)))];
  const valor = v => v == null ? '—' : typeof v === 'number' ? new Intl.NumberFormat(ACCES.lang).format(v) : v;
  return `<div class="cal-tabla"><table><caption>${calEsc(caption)}</caption><thead><tr>${conPosicion ? `<th scope="col">${calEsc(t('calPosicion'))}</th>` : ''}<th scope="col">${calEsc(t('calParticipante'))}</th>${metricas.map(m => `<th scope="col">${calEsc(t(CAL_METRICAS[m] || m))}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${conPosicion ? `<td>${calEsc(f.posicion ?? '—')}</td>` : ''}<th scope="row">${calEsc(f.literal)}</th>${metricas.map(m => `<td>${calEsc(valor(f.metricas[m]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function calResultado(e){
  const r = e.resultado;
  if (!r) return '';
  const nombres = Object.fromEntries(e.participaciones.map(p => [p.id, p.literal]));
  const filas = lineas => lineas.map(l => ({ literal: nombres[l.participacion] || t('calParticipante'), metricas: l.metricas }));
  return `<div class="cal-resultado">${calTabla(filas(r.lineas), t('calResultados'))}
    <p class="cal-nota">${calEsc(r.condicion === 'final' ? t('calFinal') : t('calResultadoObservado'))}</p>
    ${r.parciales.length ? `<details><summary>${calEsc(t('calParciales'))}</summary>${r.parciales.map(p => calTabla(filas(p.lineas), `${p.tipo === 'set' ? t('calSet') : t('calCuarto')} ${p.orden}`)).join('')}</details>` : ''}</div>`;
}
function calFuentes(e){
  const datos = CALENDARIO.datos;
  const vistas = new Set();
  return e.fuentes.filter(f => { const k = f.fuente + '/' + f.url; if (vistas.has(k)) return false; vistas.add(k); return true; })
    .map(f => {
      const fuente = datos.fuentes[f.fuente];
      const comprobado = new Date(f.comprobado);
      return `<p class="cal-nota">${calEnlace(f.url || fuente?.url, fuente?.atribucion || fuente?.nombre || f.fuente)}
        · ${calEsc(t('calComprobado', { fecha: new Intl.DateTimeFormat(ACCES.lang, { dateStyle: 'short', timeStyle: 'short', timeZone: CALENDARIO.zona }).format(comprobado) }))}
        ${fuente?.licencia ? ' · ' + calEnlace(fuente.licencia_url, fuente.licencia) : ''}</p>`;
    }).join('');
}
function calEvento(e){
  const v = e.programacion?.valor, estado = v?.programacion;
  const aviso = e.programacion?.conflicto || e.lugar?.conflicto || e.resultado?.seleccion?.conflicto;
  const ejecucion = v?.ejecucion;
  const horario = v?.cuando?.horario_textual;
  const textoHorario = typeof horario === 'string' ? horario : horario?.[ACCES.lang] || horario?.es || Object.values(horario || {})[0];
  const dias = v?.cuando?.dias_semana?.map(d => calFecha(sumarDiasCalendario('2026-10-19', d), { weekday: 'short', day: undefined, month: undefined })).join(', ');
  return `<article class="cal-evento"><h3>${calEsc(calNombre(e))}</h3>
    <p class="cal-cuando">${calEsc(calHora(e))}</p>${calLugar(e) ? `<p>${calEsc(calLugar(e))}</p>` : ''}
    ${textoHorario || dias ? `<p class="cal-nota">${calEsc([dias, textoHorario].filter(Boolean).join(' · '))}</p>` : ''}
    ${estado === 'cancelado' || estado === 'aplazado' ? `<p class="cal-aviso">${calEsc(t(estado === 'cancelado' ? 'calCancelado' : 'calAplazado'))}</p>` : ''}
    ${ejecucion === 'en_curso' || ejecucion === 'terminado' ? `<p class="cal-nota">${calEsc(t(ejecucion === 'en_curso' ? 'calEnCurso' : 'calTerminado'))}</p>` : ''}
    ${aviso ? `<p class="cal-aviso">${calEsc(t('calConflicto'))}</p>` : ''}
    ${calResultado(e)}<details><summary>${calEsc(t('calDetalles'))}</summary>
    ${e.participaciones.length ? `<ul>${e.participaciones.map(p => `<li>${calEsc(p.literal)}</li>`).join('')}</ul>` : ''}
    ${(e.enlaces || []).map(url => `<p>${calEnlace(url, t('calVerOriginal'))}</p>`).join('')}
    ${calFuentes(e)}</details></article>`;
}
function calClasificacion(tabla){
  const d = CALENDARIO.datos, e = d.entidades[`${tabla.ambito.tipo}:${tabla.ambito.id}`];
  const nombres = e.objetivos.map(k => d.entidades[k]).filter(x => x && x.clase !== 'fase').map(calNombre);
  const f = tabla.seleccion.procedencia;
  return `<article class="cal-clasificacion"><h3>${calEsc([...new Set(nombres)].join(' · ') || calNombre(e))}</h3>
    ${calTabla(tabla.filas, calNombre(e), true)}
    ${tabla.alcance === 'muestra_parcial' ? `<p class="cal-aviso">${calEsc(t('calTablaParcial'))}</p>` : ''}
    ${tabla.seleccion.conflicto ? `<p class="cal-aviso">${calEsc(t('calConflicto'))}</p>` : ''}
    ${f ? calFuentes({ fuentes: [f] }) : ''}</article>`;
}
function calFiltros(){
  const s = CALENDARIO, d = s.datos;
  if (!d) return '';
  const directos = new Set(d.eventos.flatMap(e => e.temas));
  const temas = Object.entries(d.catalogo.conceptos).filter(([id]) => temasDescendientes(d.catalogo, [id]).size &&
    [...temasDescendientes(d.catalogo, [id])].some(t => directos.has(t)));
  const circuitos = Object.values(d.entidades).flatMap(e => e.codigos).filter((x, i, a) => a.indexOf(x) === i);
  const option = (valor, label, elegido) => `<option value="${calEsc(valor)}"${elegido === valor ? ' selected' : ''}>${calEsc(label)}</option>`;
  const utilizados = new Set([...d.eventos, ...d.clasificaciones].flatMap(e => e.objetivos));
  const objetivos = Object.entries(d.entidades).filter(([k, e]) => utilizados.has(k) && ['agrupacion', 'actividad', 'participante'].includes(e.tipo));
  const lugares = Object.entries(d.entidades).filter(([k, e]) => utilizados.has(k) && ['lugar', 'territorio'].includes(e.tipo));
  return `<details class="cal-filtros"><summary>${calEsc(t('calFiltros'))}</summary>
    <fieldset><legend>${calEsc(t('calTemas'))}</legend><div class="cal-chips">${temas.map(([i, tema]) => calBoton('tema', calNombre(tema), i, `aria-pressed="${s.temas.has(i)}"`)).join('')}</div></fieldset>
    ${circuitos.length ? `<fieldset><legend>${calEsc(t('calCircuitos'))}</legend><div class="cal-chips">${circuitos.map(i => calBoton('circuito', i.toUpperCase(), i, `aria-pressed="${s.circuitos.has(i)}"`)).join('')}</div></fieldset>` : ''}
    <div class="cal-campos"><label>${calEsc(t('calObjetivo'))}<select id="cal-objetivo">${option('', t('calTodos'), s.objetivo)}${objetivos.sort((a,b) => calNombre(a[1]).localeCompare(calNombre(b[1]))).map(([k,e]) => option(k, calNombre(e), s.objetivo)).join('')}</select></label>
    <label>${calEsc(t('calLugar'))}<select id="cal-lugar">${option('', t('calTodos'), s.lugar)}${lugares.sort((a,b) => calNombre(a[1]).localeCompare(calNombre(b[1]))).map(([k,e]) => option(k, calNombre(e) + ' · ' + (e.tipo === 'lugar' ? t('calRecinto') : t('calMunicipio')), s.lugar)).join('')}</select></label>
    <label>${calEsc(t('calFuente'))}<select id="cal-fuente">${option('', t('calTodas'), s.fuente)}${Object.entries(d.fuentes).map(([i, f]) => option(i, f.nombre, s.fuente)).join('')}</select></label>
    <label>${calEsc(t('calZona'))}<select id="cal-zona">${[...new Set([s.zona, 'Europe/Madrid', 'Atlantic/Canary', 'UTC'])].map(z => option(z, z, s.zona)).join('')}</select></label></div>
    ${calBoton('limpiar', t('calLimpiar'))}</details>`;
}
function calContenido(){
  const s = CALENDARIO, d = s.datos;
  if (!d) return '';
  const orden = s.orden || {}, { eventos, clasificaciones } = seleccionCalendario(d, orden, {
    temas: [...s.temas], circuitos: [...s.circuitos], fuente: s.fuente, objetivo: s.objetivo, lugar: s.lugar,
  });
  const tipos = new Set(orden.tipos || []), soloTablas = tipos.size && !tipos.has('calendario') && !tipos.has('resultados');
  const mostrarEventos = !soloTablas, mostrarTablas = !tipos.size || tipos.has('clasificaciones');
  // desde:/hasta: se refieren a celebración; en noticias, a publicación.
  const parsed = parseQuery(orden.resto || '');
  const desde = parsed.desde, hasta = parsed.hasta;
  const dias = ventanaCalendario(s.fecha || calHoy(), s.vista);
  const elegidos = tipos.has('resultados') && !tipos.has('calendario') ? eventos.filter(e => e.resultado) : eventos;
  const pendientes = elegidos.filter(e => !extremoVisible(e.programacion?.valor?.cuando?.inicio, s.zona).fecha);
  const porDia = new Map(dias.map(dia => [dia, elegidos.filter(e => (!desde || dia >= desde) && (!hasta || dia <= hasta)
    && enDia(e.programacion?.valor?.cuando, dia, s.zona)).sort((a,b) => {
    const ha = extremoVisible(a.programacion?.valor?.cuando?.inicio, s.zona).hora || '99:99';
    const hb = extremoVisible(b.programacion?.valor?.cuando?.inicio, s.zona).hora || '99:99';
    return ha.localeCompare(hb) || calNombre(a).localeCompare(calNombre(b)) || a.id.localeCompare(b.id);
  })]));
  const ids = new Set([...porDia.values()].flat().map(e => e.id));
  let html = `<p class="cal-nota">${calEsc(t('calCuenta', { n: ids.size, p: pendientes.length, t: mostrarTablas ? clasificaciones.length : 0 }))}</p>`;
  if (orden.desconocidos?.length) return `<p class="cal-aviso">${calEsc(t('calConsultaDesconocida', { x: orden.desconocidos.join(', ') }))}</p>`;
  if (mostrarEventos){
    if (s.vista === 'mes'){
      const cabeceras = ventanaCalendario(s.fecha || calHoy(), 'semana');
      html += `<div class="cal-mes" aria-label="${calEsc(t('calMes'))}">${cabeceras.map(d => `<span class="cal-semana-nombre">${calEsc(calFecha(d, { weekday: 'short', day: undefined, month: undefined }))}</span>`).join('')}
        ${[...porDia].map(([dia, lista]) => `<div class="cal-celda${dia.slice(0,7) !== s.fecha.slice(0,7) ? ' cal-otro-mes' : ''}">
        ${calBoton('dia', calFecha(dia, { month: undefined }), dia, `${dia === calHoy() ? 'aria-current="date"' : ''} aria-label="${calEsc(calFecha(dia, { weekday: 'long' }))} · ${lista.length}"`)}
        ${lista.slice(0,2).map(e => calBoton('evento', `${extremoVisible(e.programacion?.valor?.cuando?.inicio,s.zona).hora || '·'} ${calNombre(e)}`, e.id, 'class="cal-mini-evento"')).join('')}
        ${lista.length > 2 ? calBoton('dia', t('calMas', { n: lista.length - 2 }), dia) : ''}</div>`).join('')}</div>`;
    } else if (s.vista === 'agenda') {
      const intervalos = elegidos.filter(e => ids.has(e.id) && e.programacion?.valor?.modalidad === 'intervalo');
      html += `<div class="cal-agenda">${[...porDia].map(([dia, lista]) => [dia, lista.filter(e => e.programacion?.valor?.modalidad !== 'intervalo')]).filter(([, lista]) => lista.length).map(([dia, lista]) => `<section class="cal-dia"><h2>${calEsc(calFecha(dia, { weekday: 'long' }))}</h2>${lista.map(calEvento).join('')}</section>`).join('')}
        ${intervalos.length ? `<section class="cal-dia cal-intervalos"><h2>${calEsc(t('calProgramaciones'))}</h2><p class="cal-nota">${calEsc(t('calProgramacionesNota'))}</p>${intervalos.map(calEvento).join('')}</section>` : ''}</div>`;
    } else {
      html += `<div class="${s.vista === 'semana' ? 'cal-semana' : 'cal-agenda'}">${[...porDia].filter(([, l]) => l.length || s.vista === 'semana').map(([dia, lista]) => `<section class="cal-dia"><h2>${calEsc(calFecha(dia, { weekday: 'long' }))}</h2>${lista.map(calEvento).join('') || `<p class="cal-nota">${calEsc(t('calSinCitas'))}</p>`}</section>`).join('')}</div>`;
    }
    if (!ids.size && s.vista !== 'mes') html += `<p>${calEsc(t('calSinCitas'))}</p>`;
    if (pendientes.length && !desde && !hasta) html += `<details class="cal-pendientes"><summary>${calEsc(t('calSinFecha', { n: pendientes.length }))}</summary>${pendientes.map(calEvento).join('')}</details>`;
  }
  if (mostrarTablas){
    html += `<section class="cal-tablas"><h2>${calEsc(t('calClasificaciones'))}</h2>${clasificaciones.map(calClasificacion).join('') || `<p>${calEsc(t('calSinClasificacion'))}</p>`}</section>`;
  }
  return html;
}
function pintarCalendario(){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  if (!p) return;
  const visible = s.abierto || !!s.orden;
  p.hidden = !visible;
  document.body.classList.toggle('calendario-abierto', s.abierto);
  document.body.classList.toggle('calendario-sin-noticias', !!s.orden && !s.orden.noticias);
  document.getElementById('btn-calendario')?.setAttribute('aria-expanded', String(s.abierto));
  if (!visible) return;
  s.fecha ||= calHoy();
  const foco = p.contains(document.activeElement) ? document.activeElement : null;
  const id = foco?.id, accion = foco?.dataset.cal, valor = foco?.dataset.valor;
  const desplegados = [...p.querySelectorAll('details[open]')].map(d => d.className).filter(Boolean);
  p.setAttribute('aria-busy', String(s.cargando));
  const periodo = s.vista === 'mes' ? calFecha(s.fecha, { month: 'long', year: 'numeric', day: undefined }) : calFecha(s.fecha, { year: 'numeric' });
  p.innerHTML = `<div class="cal-cabecera"><h1 id="cal-titulo" tabindex="-1">${calEsc(t('calTitulo'))}</h1>
    <div class="cal-acciones">${calBoton('renovar', t('calActualizar'), '', s.cargando ? 'disabled' : '')}
    ${calBoton(s.abierto ? 'cerrar' : 'abrir', t(s.abierto ? 'calCerrar' : 'calAbrir'))}</div></div>
    ${s.orden ? `<p class="cal-contexto">${calEsc([...s.orden.ambitos, ...s.orden.circuitos, ...s.orden.tipos].join(' · ') || t('calTodos'))}</p>` : ''}
    <nav class="cal-nav" aria-label="${calEsc(t('calVistas'))}">${['agenda','semana','mes'].map(v => calBoton('vista', t({agenda:'calAgenda',semana:'calSemana',mes:'calMes'}[v]), v, s.vista === v ? 'aria-current="page"' : '')).join('')}</nav>
    <div class="cal-cuerpo"><div class="cal-periodo">${calBoton('anterior', '←', '', `aria-label="${calEsc(t('calAnterior'))}"`)}
    <strong>${calEsc(periodo)}</strong>${calBoton('siguiente', '→', '', `aria-label="${calEsc(t('calSiguiente'))}"`)}${calBoton('hoy', t('calHoy'))}
    <label><span class="sr-only">${calEsc(t('calFecha'))}</span><input id="cal-fecha" type="date" value="${s.fecha}"></label></div>
    ${calFiltros()}<p class="cal-estado" role="status">${calEsc(s.error ? t('calError') : s.cargando ? t('calCargando') : '')}</p>
    ${s.error ? calBoton('renovar', t('calReintentar')) : ''}<div class="cal-contenido">${calContenido()}</div>
    ${s.datos ? `<p class="cal-nota cal-pie">${calEsc(t('calCobertura'))} ${calEsc(t('calGenerado', { fecha: new Intl.DateTimeFormat(ACCES.lang, { dateStyle: 'short', timeStyle: 'short', timeZone: s.zona }).format(new Date(s.datos.generado)) }))}
    ${s.datos.revision ? ' ' + calEsc(t('calRevision')) : ''}</p>` : ''}
    ${s.orden?.noticias ? `<p class="cal-nota">${calEsc(t('calNoticiasTexto'))}</p>` : ''}</div>`;
  for (const clase of desplegados) for (const d of p.querySelectorAll('details')) if (d.className === clase) d.open = true;
  const siguiente = id ? document.getElementById(id) : [...p.querySelectorAll('[data-cal]')].find(b => b.dataset.cal === accion && b.dataset.valor === valor);
  siguiente?.focus({ preventScroll: true });
}
function wireCalendario(){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  document.getElementById('btn-calendario').addEventListener('click', e => s.abierto ? cerrarCalendario() : abrirCalendario(e.currentTarget));
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-cal]');
    if (!b) return;
    const a = b.dataset.cal, v = b.dataset.valor;
    if (a === 'abrir') return abrirCalendario(b);
    if (a === 'cerrar') return cerrarCalendario();
    if (a === 'renovar') return void cargarCalendario(true);
    if (a === 'vista') s.vista = v;
    if (a === 'anterior' || a === 'siguiente') s.fecha = moverFecha(s.fecha, s.vista, a === 'anterior' ? -1 : 1);
    if (a === 'hoy') s.fecha = calHoy();
    if (a === 'dia'){ s.fecha = v; s.vista = 'agenda'; }
    if (a === 'tema' || a === 'circuito'){
      const set = a === 'tema' ? s.temas : s.circuitos;
      set.has(v) ? set.delete(v) : set.add(v);
    }
    if (a === 'limpiar'){ s.temas.clear(); s.circuitos.clear(); s.fuente = ''; s.objetivo = ''; s.lugar = ''; }
    if (a === 'evento'){
      const evento = s.datos.eventos.find(x => x.id === v), dialogo = document.getElementById('cal-evento-dialogo');
      dialogo.innerHTML = `<form method="dialog"><button autofocus>${calEsc(t('calCerrar'))}</button></form>${calEvento(evento)}`;
      dialogo.showModal(); return;
    }
    pintarCalendario();
  });
  p.addEventListener('change', e => {
    const id = e.target.id, v = e.target.value;
    if (id === 'cal-fecha' && fechaValida(v)) s.fecha = v;
    if (id === 'cal-fuente') s.fuente = v;
    if (id === 'cal-objetivo') s.objetivo = v;
    if (id === 'cal-lugar') s.lugar = v;
    if (id === 'cal-zona') s.zona = v;
    pintarCalendario();
  });
  document.getElementById('buscar').addEventListener('input', () => cerrarCalendario(false));
}
function sugerenciasCalendario(raw){
  const m = raw.match(/(?:^|\s)([^\s"]*)$/);
  if (!m || !m[1]) return null;
  const q = normalize(m[1]);
  const opciones = [...Object.keys(AMBITOS).map(a => a + ':'), 'resultados:tenis',
    'resultados:atp,wta', 'clasificacion:f1', 'f1:clasificación', 'calendario:', 'circuito:atp,wta'];
  const seleccion = opciones.filter(v => normalize(v).startsWith(q));
  if (!seleccion.length) return q.includes(':') && leerConsultaCalendario(q) ? [] : null;
  return seleccion.slice(0,8).map(value => ({ kind: 'calendario', value, label: value,
    tipo: t('calTitulo') }));
}
