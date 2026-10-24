/* Panel técnico: lee los resúmenes públicos ya calculados, bajo demanda.
   Los titulares del archivo diario no son artículos únicos por publicación.
   Asuntos y su evidencia necesitan sus propios agregados (siguiente fase). */
const ESTADISTICAS = {
  abierto: false, vista: 'resumen', fecha: '', ambito: 'todos', modo: '', modoBase: null,
  dominio: '', consulta: '', destino: null, indice: null, dia: null,
  cargando: false, error: false, ampliado: false, secuencia: 0,
  controller: null, cache: new Map(), origen: null, scroll: 0,
};
const iconoEstadisticas = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v17h17M8 16v-5m5 5V6m5 10v-8"/></svg>';
const estNumero = n => Number.isFinite(n) ? new Intl.NumberFormat(ACCES.lang).format(n) : '—';
const estHoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const estFechaValida = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
function estFecha(s){
  return estFechaValida(s) ? new Intl.DateTimeFormat(ACCES.lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z')) : '—';
}
function estGenerado(s){
  const d = new Date(s);
  return isNaN(d) ? '—' : new Intl.DateTimeFormat(ACCES.lang, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(d);
}

// Los temas de un modo no amplían este conjunto. ignore gana a su grupo.
function seleccionEstadisticas(catalogo, ambito, modo){
  if (ambito === 'mis' && !modo) return [];
  const ov = modo?.overrides || {}, grupos = new Set(modo?.grupos || []);
  const dominios = new Set(Object.keys(catalogo));
  if (ambito === 'mis') for (const d of Object.keys(ov)) if (ov[d] === 'include' || ov[d] === 'first') dominios.add(d);
  return [...dominios].filter(d => ambito === 'todos' || (ambito === 'mis'
    ? ov[d] !== 'ignore' && (ov[d] === 'include' || ov[d] === 'first' || grupos.has(catalogo[d]?.g))
    : catalogo[d]?.g === ambito));
}
function sumarEstadisticas(medios, dominios){
  const pubs = dominios.map(d => medios[d]?.pub).filter(p => Number.isFinite(p?.titulares));
  const fechas = {};
  for (const p of pubs) for (const [k, v] of Object.entries(p.fechas || {})) if (Number.isFinite(v)) fechas[k] = (fechas[k] || 0) + v;
  return { titulares: pubs.length ? pubs.reduce((n, p) => n + p.titulares, 0) : null,
    disponibles: pubs.length, conTitulares: pubs.filter(p => p.titulares > 0).length,
    seleccionados: dominios.length, fechas };
}
function serieEstadisticas(indice, dominios, hasta){
  return indice.serie_dias.map((fecha, i) => {
    const valores = dominios.map(d => indice.serie[d]?.titulares?.[i]).filter(Number.isFinite);
    return { fecha, valor: valores.length ? valores.reduce((a, b) => a + b, 0) : null, medios: valores.length };
  }).filter(p => p.fecha <= hasta).slice(-30);
}
function validarIndiceEstadisticas(p){
  if (!p || !Array.isArray(p.dias) || !p.medios || Array.isArray(p.medios) || typeof p.medios !== 'object'
      || !Array.isArray(p.serie_dias) || !p.serie || typeof p.serie !== 'object' || Array.isArray(p.serie)
      || typeof p.generado !== 'string' || isNaN(Date.parse(p.generado))
      || !p.dias.every(d => estFechaValida(d.fecha)) || !p.serie_dias.every(estFechaValida)
      || !Object.values(p.serie).every(s => s && Array.isArray(s.titulares) && s.titulares.length === p.serie_dias.length && s.titulares.every(n => n == null || Number.isFinite(n) && n >= 0))
      || !Object.values(p.medios).every(m => m && typeof m.n === 'string' && typeof m.g === 'string')) throw new Error('formato');
  return p;
}
function estModo(){ return ESTADISTICAS.modoBase; }
function fijarModoEstadisticas(id){
  const modo = PRESETS.lista.find(p => p.id === id);
  ESTADISTICAS.modo = modo?.id || '';
  ESTADISTICAS.modoBase = modo ? structuredClone(modo) : null;
}
function estDominios(){ return seleccionEstadisticas(ESTADISTICAS.indice.medios, ESTADISTICAS.ambito, estModo()); }
function estDatoDia(){ return ESTADISTICAS.dia?.fecha === ESTADISTICAS.fecha ? ESTADISTICAS.dia : null; }
function estBoton(accion, texto, valor = ''){
  return `<button type="button" data-est="${accion}" data-valor="${escapeHtml(valor)}">${escapeHtml(texto)}</button>`;
}
function estTabla(cabeceras, filas){
  return `<div class="est-tabla" tabindex="0"><table><thead><tr>${cabeceras.map(c => `<th scope="col">${escapeHtml(t(c))}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map((v, i) => i ? `<td>${v}</td>` : `<th scope="row">${v}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function estMetricas(pares){
  return `<dl class="est-metricas">${pares.map(([clave, valor]) => `<div><dt>${escapeHtml(t(clave))}</dt><dd>${estNumero(valor)}</dd></div>`).join('')}</dl>`;
}
function estCurva(dominios){
  const puntos = serieEstadisticas(ESTADISTICAS.indice, dominios, ESTADISTICAS.fecha);
  if (!puntos.some(p => p.valor != null)) return `<p class="est-nota">${escapeHtml(t('estSinSerie'))}</p>`;
  const max = Math.max(1, ...puntos.map(p => p.valor || 0));
  return `<div class="est-barras" aria-hidden="true">${puntos.map(p => `<span style="--est-valor:${p.valor == null ? 0 : p.valor / max * 100}%" title="${escapeHtml(estFecha(p.fecha))}: ${estNumero(p.valor)}">${p.valor == null ? '' : '<i></i>'}</span>`).join('')}</div>
    <p class="est-nota">${escapeHtml(t('estSerieNota'))}</p><details><summary>${escapeHtml(t('estVerValores'))}</summary>${estTabla(['estDia', 'estTitulares', 'estMediosDatos'], puntos.map(p => [estBoton('fecha', estFecha(p.fecha), p.fecha), estNumero(p.valor), `${estNumero(p.medios)} / ${estNumero(dominios.length)}`]))}</details>`;
}
function estResumen(){
  const dia = estDatoDia(), ids = estDominios();
  if (!dia) return estSinDia();
  const total = sumarEstadisticas(dia.medios, ids), grupos = new Map();
  for (const d of ids){
    const g = ESTADISTICAS.indice.medios[d]?.g || t('estSinSeguimiento');
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(d);
  }
  return `<h2 id="est-vista-titulo" tabindex="-1">${escapeHtml(t('estResumen'))}</h2>
    ${estMetricas([['estTitulares', total.titulares], ['estMediosTitulares', total.disponibles ? total.conTitulares : null], ['estMediosDatos', total.disponibles]])}
    <p class="est-nota">${escapeHtml(t('estMuestra', { n: total.disponibles, total: total.seleccionados }))}</p>
    <h3>${escapeHtml(t('estPorGrupo'))}</h3>${estTabla(['estGrupo', 'estTitulares', 'estMediosDatos'], [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([g, ds]) => {
      const s = sumarEstadisticas(dia.medios, ds);
      return [escapeHtml(g), estNumero(s.titulares), `${s.disponibles} / ${ds.length}`];
    }))}<h3>${escapeHtml(t('estEvolucion'))}</h3>${estCurva(ids)}
    ${estSeguimiento(dia.recolector)}`;
}
function estSinDia(conTitulo = true){
  const ultimo = ESTADISTICAS.indice.dias.map(d => d.fecha).sort().at(-1);
  return `${conTitulo ? `<h2 id="est-vista-titulo" tabindex="-1">${escapeHtml(t('estSinDia'))}</h2>` : ''}<p>${escapeHtml(t('estSinDiaNota'))}</p>
    ${ultimo && ultimo !== ESTADISTICAS.fecha ? estBoton('fecha', t('estVerDia', { fecha: estFecha(ultimo) }), ultimo) : ''}`;
}
function estEstado(dominio){
  const d = estDatoDia()?.medios[dominio];
  if (!ESTADISTICAS.indice.medios[dominio]) return t('estSinSeguimiento');
  if (d?.runs?.ultimo_estado === 'fallo') return t('estIncidencias');
  return t(d?.pub ? 'estDatosRecogidos' : 'estSinDatos');
}
function estDirectorio(){
  const catalogo = ESTADISTICAS.indice.medios, dia = estDatoDia();
  const q = normalize(ESTADISTICAS.consulta);
  const ids = estDominios().filter(d => normalize(d + ' ' + (catalogo[d]?.n || '')).includes(q))
    .sort((a, b) => (catalogo[a]?.n || a).localeCompare(catalogo[b]?.n || b));
  return `<h2 id="est-vista-titulo" tabindex="-1">${escapeHtml(t('estMedios'))}</h2>
    <label class="est-buscar">${escapeHtml(t('estBuscarMedio'))}<input type="search" id="est-buscar-medio" value="${escapeHtml(ESTADISTICAS.consulta)}" autocomplete="off"></label>
    ${ids.length ? estTabla(['estMedio', 'estGrupo', 'estTitulares', 'estSeguimiento'], ids.map(d => [
      estBoton('medio', catalogo[d]?.n || d, d) + `<small>${escapeHtml(d)}</small>`,
      escapeHtml(catalogo[d]?.g || '—'), estNumero(dia?.medios[d]?.pub?.titulares), escapeHtml(estEstado(d)),
    ])) : `<p>${escapeHtml(t('estSinMedios'))}</p>`}`;
}
function estFicha(){
  const d = ESTADISTICAS.dominio, m = ESTADISTICAS.indice.medios[d], datos = estDatoDia()?.medios[d], pub = datos?.pub;
  const clases = ['con_hora', 'hora_00', 'solo_dia', 'pasada', 'futura', 'estimada', 'sin_fecha'];
  return `${estBoton('medios', t('estVolverMedios'))}<h2 id="est-vista-titulo" tabindex="-1">${escapeHtml(m?.n || d)}</h2>
    <p class="est-nota">${escapeHtml(d)} · ${escapeHtml(m?.g || t('estSinSeguimiento'))}</p>
    ${!m ? `<p>${escapeHtml(t('estSinSeguimiento'))}</p>` : !estDatoDia() ? estSinDia(false) : !pub ? `<p>${escapeHtml(t('estSinDatos'))}</p>` :
      estMetricas([['estTitulares', pub.titulares], ['estConHora', (pub.fechas?.con_hora || 0) + (pub.fechas?.hora_00 || 0)], ['estSoloDia', pub.fechas?.solo_dia || 0]])}
    <h3>${escapeHtml(t('estEvolucion'))}</h3>${estCurva([d])}
    ${pub ? `<details><summary>${escapeHtml(t('estPrecision'))}</summary><p>${escapeHtml(t('estPrecisionNota'))}</p>${estTabla(['estClase', 'estTitulares'], clases.map(k => [escapeHtml(t('estFecha_' + k)), estNumero(pub.fechas?.[k] || 0)]))}</details>` : ''}
    ${estSeguimiento(null, datos?.runs, pub)}`;
}
function estSeguimiento(recolector, runs = null, pub = null){
  const e = s => escapeHtml(t(s));
  const pares = runs ? [
    ['estPasadas', runs.pasadas], ['estBuenas', runs.ok], ['estRescates', runs.rescates],
    ['estVentana', runs.ventana_min?.p50], ['estLatencia', runs.ms?.p50],
  ] : recolector ? [['estPasadas', recolector.pasadas], ['estIntervalo', recolector.intervalo_p50], ['estHuecos', recolector.huecos]] : [];
  return `<details><summary>${e('estSeguimiento')}</summary>
    <p>${e('estSeguimientoNota')}</p>${pares.length ? estMetricas(pares) : `<p>${e('estSinPasadas')}</p>`}
    ${runs?.ultimo_estado === 'fallo' ? `<p>${e('estIncidencias')}</p>` : ''}
    ${pub?.fuentes ? `<h3>${e('estFuentes')}</h3>${estTabla(['estFuente', 'estTitulares'], Object.entries(pub.fuentes).map(([k, v]) => [escapeHtml(k), estNumero(v)]))}` : ''}
    ${runs?.errores && Object.keys(runs.errores).length ? `<h3>${e('estErrores')}</h3>${estTabla(['estError', 'estOcurrencias'], Object.entries(runs.errores).map(([k, v]) => [escapeHtml(k), estNumero(v)]))}` : ''}</details>`;
}
function pintarEstadisticas(){
  const s = ESTADISTICAS, panel = document.getElementById('estadisticas-panel');
  if (!panel) return;
  panel.hidden = !s.abierto;
  document.body.classList.toggle('estadisticas-abiertas', s.abierto);
  document.getElementById('btn-estadisticas')?.setAttribute('aria-expanded', String(s.abierto));
  if (!s.abierto) return;
  const foco = panel.contains(document.activeElement) ? document.activeElement : null;
  const idFoco = foco?.id, accionFoco = foco?.dataset.est, valorFoco = foco?.dataset.valor;
  panel.classList.toggle('est-ampliado', s.ampliado);
  panel.setAttribute('aria-label', t('estTitulo'));
  panel.setAttribute('aria-busy', String(s.cargando));
  const catalogo = s.indice?.medios || {};
  const grupos = [...new Set(Object.values(catalogo).map(m => m.g))].sort((a, b) => a.localeCompare(b));
  let contenido = '';
  if (s.indice){
    if (s.ambito === 'mis' && !estModo()) contenido = `<p>${escapeHtml(t('estElegirModo'))}</p>`;
    else if (s.ambito === 'mis' && !estDominios().length) contenido = `<p>${escapeHtml(t('estModoSinMedios'))}</p>`;
    else contenido = ({ resumen: estResumen, medios: estDirectorio, medio: estFicha }[s.vista] || estResumen)();
  }
  const datos = estDatoDia(), generado = datos?.generado || s.indice?.generado;
  const modoCambiado = s.ambito === 'mis' && s.modoBase && JSON.stringify(s.modoBase) !== JSON.stringify(PRESETS.lista.find(p => p.id === s.modo));
  const option = (valor, texto, seleccionado) => `<option value="${escapeHtml(valor)}"${seleccionado === valor ? ' selected' : ''}>${escapeHtml(texto)}</option>`;
  panel.innerHTML = `<div class="est-cabecera"><strong>${escapeHtml(t('estTitulo'))}</strong><div class="est-acciones">
      <button type="button" data-est="ampliar" aria-pressed="${s.ampliado}">${escapeHtml(t(s.ampliado ? 'estReducir' : 'estAmpliar'))}</button>
      <button type="button" data-est="renovar"${s.cargando ? ' disabled' : ''} aria-label="${escapeHtml(t('estActualizar'))}" title="${escapeHtml(t('estActualizar'))}">${ico('refresh-cw')}</button>
      <button type="button" data-est="cerrar" aria-label="${escapeHtml(t('estCerrar'))}" title="${escapeHtml(t('estCerrar'))}">${ico('x')}</button></div></div>
    <nav class="est-nav" aria-label="${escapeHtml(t('estTitulo'))}">${['resumen', 'medios'].map(v => `<button type="button" data-est="${v}"${(v === 'medios' ? s.vista !== 'resumen' : s.vista === v) ? ' aria-current="page"' : ''}>${escapeHtml(t(v === 'resumen' ? 'estResumen' : 'estMedios'))}</button>`).join('')}</nav>
    <div class="est-cuerpo"><div class="est-filtros"><label>${escapeHtml(t('estDiaArchivo'))}<input id="est-fecha" type="date" value="${escapeHtml(s.fecha)}" max="${estHoy()}"></label>
    <label>${escapeHtml(t('estAmbito'))}<select id="est-ambito">${option('todos', t('estTodos'), s.ambito)}${option('mis', t('estMisMedios'), s.ambito)}${grupos.map(g => option(g, g, s.ambito)).join('')}</select></label>
    ${s.ambito === 'mis' ? `<label>${escapeHtml(t('estModo'))}<select id="est-modo">${option('', t('estElegirModo'), s.modo)}${PRESETS.lista.map(p => option(p.id, p.nombre, s.modo)).join('')}</select></label>` : ''}</div>
    <p class="est-contexto">${escapeHtml(estFecha(s.fecha))}${s.ambito === 'mis' && estModo() ? ' · ' + escapeHtml(estModo().nombre) : ''}${datos ? ' · ' + escapeHtml(t(datos.cerrado ? 'estArchivado' : 'estRevisable')) : ''}${generado ? ' · ' + escapeHtml(t('estGenerado', { fecha: estGenerado(generado) })) : ''}</p>
    <p class="est-estado" role="status">${escapeHtml(t(s.error ? 'estErrorCarga' : s.cargando ? 'estCargando' : 'estLecturaLista'))}${s.error ? ' ' + estBoton('renovar', t('estReintentar')) : ''}</p>
    ${modoCambiado ? `<p class="est-nota">${escapeHtml(t('estModoCambio'))} ${estBoton('modo-actualizar', t('estActualizar'))}</p>` : ''}
    ${contenido}<details class="est-metodo"><summary>${escapeHtml(t('estComo'))}</summary><p>${escapeHtml(t('estMetodo'))}</p><p>${escapeHtml(t('estActualizacion'))}</p></details></div>`;
  // Repintar una tabla no debe expulsar el teclado al body.
  const siguiente = idFoco ? document.getElementById(idFoco) : [...panel.querySelectorAll('[data-est]')].find(b => b.dataset.est === accionFoco && b.dataset.valor === valorFoco);
  siguiente?.focus({ preventScroll: true });
}

async function pedirEstadisticas(nombre, signal){
  const bases = [DATA_BASE, ...Object.values(BACKENDS).map(b => b.data)].filter((b, i, a) => a.indexOf(b) === i);
  let error;
  for (const base of bases){
    try {
      const r = await fetch(`${base}/${nombre}`, { cache: 'no-cache', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e){ if (signal.aborted) throw e; error = e; }
  }
  throw error;
}
async function cargarEstadisticas(renovar = false){
  const s = ESTADISTICAS, secuencia = ++s.secuencia;
  s.controller?.abort();
  const controller = s.controller = new AbortController(), fecha = s.fecha;
  s.cargando = true; s.error = false; pintarEstadisticas();
  try {
    const indice = renovar || !s.indice ? validarIndiceEstadisticas(await pedirEstadisticas('estadisticas.json', controller.signal)) : s.indice;
    let dia = null;
    const cacheKey = indice.generado + '/' + fecha;
    if (indice.dias.some(d => d.fecha === fecha)){
      dia = !renovar && s.cache.get(cacheKey) || await pedirEstadisticas(`estadisticas-dia-${fecha}.json`, controller.signal);
      if (dia.fecha !== fecha || !dia.medios || typeof dia.medios !== 'object' || Array.isArray(dia.medios)
          || !Object.values(dia.medios).every(m => m && (!m.pub || Number.isFinite(m.pub.titulares) && m.pub.titulares >= 0))) throw new Error('formato');
    }
    if (secuencia !== s.secuencia || !s.abierto) return;
    // Publicar juntos índice y detalle: un fallo conserva el resultado anterior.
    s.indice = indice; s.dia = dia;
    if (dia){ if (s.cache.size >= 30) s.cache.clear(); s.cache.set(cacheKey, dia); }
    if (s.destino != null){
      const destino = s.destino; s.destino = null;
      if (destino === 'mis-medios') { s.ambito = 'mis'; s.vista = 'medios'; }
      else if (destino){
        const hits = Object.entries(indice.medios).filter(([d, m]) => normDomain(d) === normDomain(destino) || normalize(m.n) === normalize(destino));
        if (hits.length === 1){ s.dominio = hits[0][0]; s.vista = 'medio'; }
        else if (!hits.length && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(destino)){ s.dominio = destino.toLowerCase(); s.vista = 'medio'; }
        else { s.consulta = destino; s.vista = 'medios'; }
      }
    }
  } catch (e){ if (secuencia === s.secuencia && !controller.signal.aborted) s.error = true; }
  finally { if (secuencia === s.secuencia){ s.cargando = false; pintarEstadisticas(); } }
}
function abrirEstadisticas(destino = '', origen = null){
  const s = ESTADISTICAS;
  if (!s.abierto){
    s.origen = origen || document.activeElement; s.scroll = window.scrollY;
    if (!s.modoBase && PRESET_ACTIVO) fijarModoEstadisticas(PRESETS.activo);
  }
  s.abierto = true; s.destino = destino;
  if (destino === 'mis-medios' && PRESET_ACTIVO) fijarModoEstadisticas(PRESETS.activo);
  if (!s.fecha) s.fecha = estHoy();
  if (destino && destino !== 'mis-medios') { s.ambito = 'todos'; s.consulta = ''; }
  const carga = cargarEstadisticas(), secuencia = s.secuencia;
  carga.then(() => { if (s.abierto && s.secuencia === secuencia) document.getElementById('est-vista-titulo')?.focus({ preventScroll: true }); });
  document.getElementById('barra-sup')?.classList.remove('cab-oculta');
  requestAnimationFrame(() => {
    if (!s.abierto) return;
    const p = document.getElementById('estadisticas-panel'), alto = document.getElementById('barra-sup')?.getBoundingClientRect().height || 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + p.getBoundingClientRect().top - alto - 8), behavior: 'auto' });
  });
}
function cerrarEstadisticas(){
  const s = ESTADISTICAS;
  if (!s.abierto) return;
  s.abierto = false; s.ampliado = false; s.secuencia++; s.controller?.abort(); s.cargando = false;
  pintarEstadisticas();
  (s.origen?.isConnected && s.origen.getClientRects().length ? s.origen : document.getElementById('btn-estadisticas'))?.focus({ preventScroll: true });
  window.scrollTo({ top: s.scroll, behavior: 'auto' });
}

// Se consume la orden solo al confirmarla. Escribir «estadísticas» sigue
// siendo una búsqueda normal; el texto restante nunca contiene la orden.
function ordenEstadisticas(raw){
  // tokenizeQuery espera comillas cerradas. Mientras se completa un nombre,
  // tampoco enviar ese fragmento a la búsqueda de noticias.
  const abierto = raw.match(/(?:^|\s)(?:estadisticas|stats):"([^"]*)$/i);
  const incompleto = abierto && (raw.slice(0, abierto.index).match(/"/g) || []).length % 2 === 0 ? abierto : null;
  const todos = tokenizeQuery(incompleto ? raw.slice(0, incompleto.index) : raw), esOrden = x => /^(estadisticas|stats)$/i.test(x.prefix);
  const tokens = todos.filter(esOrden);
  if (!tokens.length && !incompleto) return null;
  return { destino: incompleto ? incompleto[1] : tokens.at(-1).text, resto: todos.filter(x => !esOrden(x)).map(x => x.raw).join(' ') };
}
function consumirOrdenEstadisticas(){
  const input = document.getElementById('buscar'), orden = ordenEstadisticas(input.value);
  if (!orden) return false;
  input.value = orden.resto; cerrarSugerencias();
  document.getElementById('buscar-clear').hidden = !input.value;
  aplicarFiltros(); abrirEstadisticas(orden.destino, input);
  return true;
}
function sugerenciasEstadisticas(raw){
  const m = raw.match(/(?:^|\s)(?:estadisticas|stats):(?:"([^"]*)|([^\s"]*))$/i);
  if (!m) return null;
  const q = normalize(m[1] ?? m[2]);
  const items = [{ value: '', label: t('estTitulo') }, { value: 'mis-medios', label: t('estMisMedios') },
    ...MEDIOS_UNICOS.map(m => ({ value: m.dominio, label: m.medio || m.dominio, meta: m.dominio }))];
  return items.filter(x => normalize(x.label + ' ' + x.value).includes(q)).slice(0, 8).map(x => ({ ...x, kind: 'estadisticas', tipo: t('estTitulo') }));
}
function wireEstadisticas(){
  const s = ESTADISTICAS, p = document.getElementById('estadisticas-panel');
  document.getElementById('btn-estadisticas').addEventListener('click', e => s.abierto ? cerrarEstadisticas() : abrirEstadisticas('', e.currentTarget));
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-est]');
    if (!b) return;
    const accion = b.dataset.est;
    if (accion === 'cerrar') return cerrarEstadisticas();
    if (accion === 'renovar') return void cargarEstadisticas(true);
    if (accion === 'modo-actualizar') { fijarModoEstadisticas(s.modo); pintarEstadisticas(); return; }
    if (accion === 'fecha') { s.fecha = b.dataset.valor; return void cargarEstadisticas(); }
    if (accion === 'ampliar') s.ampliado = !s.ampliado;
    else if (accion === 'medio') { s.destino = null; s.vista = 'medio'; s.dominio = b.dataset.valor; }
    else if (accion === 'resumen' || accion === 'medios') { s.destino = null; s.vista = accion; }
    pintarEstadisticas();
    if (accion !== 'ampliar') document.getElementById('est-vista-titulo')?.focus({ preventScroll: true });
  });
  p.addEventListener('change', e => {
    if (e.target.id === 'est-fecha'){
      if (!estFechaValida(e.target.value)) return;
      s.fecha = e.target.value; cargarEstadisticas();
    } else if (e.target.id === 'est-ambito') { s.destino = null; s.ambito = e.target.value; s.vista = s.vista === 'medio' ? 'medios' : s.vista; pintarEstadisticas(); }
    else if (e.target.id === 'est-modo') { fijarModoEstadisticas(e.target.value); pintarEstadisticas(); }
  });
  p.addEventListener('input', e => {
    if (e.target.id !== 'est-buscar-medio') return;
    s.consulta = e.target.value; pintarEstadisticas();
  });
  document.getElementById('buscar').addEventListener('keydown', e => {
    if (e.key === 'Enter' && ordenEstadisticas(e.target.value)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (SUG_STATE.open && SUG_STATE.items[SUG_STATE.sel]?.kind === 'estadisticas') aplicarSugerencia(SUG_STATE.sel);
      else consumirOrdenEstadisticas();
    }
  }, true);
}
