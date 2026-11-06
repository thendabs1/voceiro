/* ═══════════════════════════════════════════════════════════════
   CONSULTAS PUNTUALES: libro:, autor:, pelicula:, serie:, contexto:,
   clasificacion:, resultados: y partido: (alias en shared/consultas/registro.js).
   Un panel encima de las noticias, como el tiempo, con una consulta
   activa. Los candidatos se eligen con un toque aunque haya uno solo (el
   nombre no asegura la identidad); los deportes van directos a su ficha.
   Todo sale por deno-buscar (/consulta, /consulta/ficha); aquí solo hay
   una caché de sesión hasta `caduca`, sin sondeos.
   ═══════════════════════════════════════════════════════════════ */
const CONSULTA_URL = BACKENDS.deno.buscar;
const CONSULTA_MIN_LETRAS = 3;
const CONSULTA_CACHE_MAX = 30;
const CONSULTA_IDIOMAS = ['es', 'gl', 'ca', 'eu', 'en'];
const CONSULTA_DEPORTES = { primera: 'Primera', segunda: 'Segunda', 'copa-del-rey': 'Copa del Rey', champions: 'Champions',
  'liga-f': 'Liga F', nba: 'NBA', wnba: 'WNBA', f1: 'F1', atp: 'ATP', wta: 'WTA' };
const VISTAS_CONSULTA = {};
const CONSULTA_EJEMPLOS = {
  libro: 'Los besos en el pan', autor: 'Almudena Grandes', pelicula: 'La infiltrada',
  serie: 'La mesías', contexto: 'Almudena Grandes',
};

const PUNTUAL = {
  lista: [], elegida: -1, claveLista: '', clave: '',
  activa: null,           // { tipo, texto, prefijo, raw }
  estado: '',             // ayuda | corta | cargando | candidatos | ficha | error
  candidatos: null, ficha: null, id: '', candidato: null,
  error: '', fallo: '', reintentar: null, enfocar: '',
  seq: 0, timer: null,
  cache: new Map(), enCurso: new Map(),
  texto: null, claveTexto: '',   // palabras de la búsqueda, marcadas en los equipos
  grupo: null,               // grupo visible en una columna; en ancho se ven todos
  origen: null,              // parrilla a la que volver desde un partido
  fecha: '', cargandoFecha: false,
};

const idiomaConsulta = () => {
  const lang = (ACCES && ACCES.lang) || 'es';
  return CONSULTA_IDIOMAS.includes(lang) ? lang : 'es';
};
const nombreConsulta = tipo => t('con' + tipo[0].toUpperCase() + tipo.slice(1));
// Singular y plural: «clave1» para uno.
const tn = (clave, n) => t(n === 1 ? clave + '1' : clave, { n });
const esDeporteConsulta = tipo => ['clasificacion', 'resultados', 'partido'].includes(tipo);
const codigoDeporte = admiteConsultaESPN;
const idPartidoConsultaValido = id => {
  const partes = /^espn:partido\/([a-z0-9-]+)\/[1-9]\d{0,11}$/.exec(id || '');
  return (!!partes && !['atp', 'wta'].includes(partes[1]) && codigoDeporte('partido', partes[1]))
    || Object.values(VISTAS_CONSULTA).some(v => v.idValido?.(id));
};
const ESTADOS_PARTIDO = { en_juego: 'conEnJuego', final: 'conFinal', programado: 'conProgramado',
  aplazado: 'conAplazado', cancelado: 'conCancelado', retrasado: 'conRetrasado', suspendido: 'conSuspendido', desconocido: 'conEstadoDesconocido' };
const estadoTextoPartido = estado => t(ESTADOS_PARTIDO[estado] || 'conEstadoDesconocido');
const fechaPartidoConsulta = inicio => isNaN(Date.parse(inicio)) ? ''
  : new Intl.DateTimeFormat(idiomaConsulta(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(inicio));

// Desde aplicarFiltros: la consulta activa es la última escrita, salvo que
// se haya elegido otra entre varias. `texto` (compilado, como el del feed):
// las palabras sueltas de la búsqueda, que se marcan en los equipos.
function actualizarConsultaPuntual(parsed, texto = null){
  const lista = parsed.chips.filter(c => c.type === 'consulta').map(c => ({
    tipo: c.tipo, texto: c.value.trim(), prefijo: c.raw.slice(0, c.raw.indexOf(':')), raw: c.raw,
  }));
  const claveTexto = texto?.incluir?.length ? JSON.stringify(texto.incluir) : '';
  const otroTexto = claveTexto !== PUNTUAL.claveTexto;
  if (otroTexto) PUNTUAL.grupo = null;
  Object.assign(PUNTUAL, { texto: claveTexto ? texto : null, claveTexto });
  const claveLista = JSON.stringify(lista) + idiomaConsulta();
  if (claveLista === PUNTUAL.claveLista){
    if (otroTexto && PUNTUAL.estado === 'ficha') pintarConsulta({ conservarPlegado: true });
    return;
  }
  PUNTUAL.claveLista = claveLista;
  PUNTUAL.lista = lista;
  if (!lista.length){ ocultarConsulta(); return; }
  if (!lista[PUNTUAL.elegida]) PUNTUAL.elegida = lista.length - 1;
  activarConsulta(lista[PUNTUAL.elegida]);
}

function activarConsulta(c){
  const clave = `${c.tipo}|${c.texto}|${idiomaConsulta()}`;
  PUNTUAL.activa = c;
  if (clave === PUNTUAL.clave){ pintarConsulta(); return; }
  PUNTUAL.clave = clave;
  PUNTUAL.grupo = null;
  PUNTUAL.seq++;   // lo que esté en camino ya no se pinta
  clearTimeout(PUNTUAL.timer);
  Object.assign(PUNTUAL, { candidatos: null, ficha: null, id: '', candidato: null, error: '', fallo: '', reintentar: null, enfocar: '', origen: null, fecha: '', cargandoFecha: false });
  if (esDeporteConsulta(c.tipo)){
    const codigo = normalize(c.texto);
    if (c.tipo === 'partido' && idPartidoConsultaValido(`espn:partido/${codigo}`)){
      abrirFichaConsulta(`espn:partido/${codigo}`); return;
    }
    if (codigoDeporte(c.tipo, codigo)){
      if (c.tipo === 'partido') cargarCandidatos({ ...c, texto: codigo });
      else abrirFichaConsulta(`espn:${c.tipo}/${codigo}`);
      return;
    }
    PUNTUAL.estado = 'ayuda';
  } else if (!c.texto) PUNTUAL.estado = 'ayuda';
  else if (c.texto.length < CONSULTA_MIN_LETRAS) PUNTUAL.estado = 'corta';
  else { cargarCandidatos(c); return; }
  pintarConsulta();
}

function ocultarConsulta(){
  PUNTUAL.seq++;
  clearTimeout(PUNTUAL.timer);
  Object.assign(PUNTUAL, { clave: '', activa: null, elegida: -1, estado: '' });
  const el = document.getElementById('consulta-panel');
  if (el){ el.hidden = true; el.innerHTML = ''; }
}

const errorConsulta = motivo => Object.assign(new Error(motivo), { motivo });

// Una petición por URL: lo vigente sale de la caché y lo que está en camino
// se comparte. Los fallos no se guardan.
function pedirConsulta(ruta, params){
  // Versionar también la URL pública: el navegador puede conservar respuestas
  // anteriores a las fichas de partido, cuyos marcadores no incluían un ID.
  const url = `${CONSULTA_URL}${ruta}?${new URLSearchParams({ ...params, idioma: idiomaConsulta(), v: '3' })}`;
  const guardada = PUNTUAL.cache.get(url);
  if (guardada && guardada.caduca > Date.now()) return Promise.resolve(guardada.datos);
  if (PUNTUAL.enCurso.has(url)) return PUNTUAL.enCurso.get(url);
  const peticion = (async () => {
    let r;
    try { r = await fetch(url, { signal: AbortSignal.timeout(20000) }); }
    catch(e){ throw errorConsulta('red'); }
    if (r.status === 429) throw errorConsulta('limite');
    const datos = await r.json().catch(() => null);
    if (!datos || typeof datos !== 'object' || !datos.estado) throw errorConsulta('red');
    if (r.status === 400) datos.estado = 'invalida';
    if (params.fecha && ['ok', 'vacio'].includes(datos.estado) && datos.ficha?.fecha !== params.fecha) throw errorConsulta('red');
    const caduca = Date.parse(datos.caduca);
    if (r.ok && datos.estado !== 'no_disponible' && caduca > Date.now()){
      PUNTUAL.cache.delete(url);
      PUNTUAL.cache.set(url, { datos, caduca });
      if (PUNTUAL.cache.size > CONSULTA_CACHE_MAX) PUNTUAL.cache.delete(PUNTUAL.cache.keys().next().value);
    }
    return datos;
  })().finally(() => PUNTUAL.enCurso.delete(url));
  PUNTUAL.enCurso.set(url, peticion);
  return peticion;
}

async function cargarCandidatos(c){
  const seq = ++PUNTUAL.seq;
  Object.assign(PUNTUAL, { estado: 'cargando', reintentar: () => cargarCandidatos(c) });
  pintarConsulta();
  try {
    const d = await pedirConsulta('/consulta', { tipo: c.tipo, texto: c.texto });
    if (seq !== PUNTUAL.seq) return;
    Object.assign(PUNTUAL, { candidatos: d, estado: 'candidatos' });
  } catch(e){
    if (seq !== PUNTUAL.seq) return;
    Object.assign(PUNTUAL, { estado: 'error', error: e.motivo || 'red' });
  }
  pintarConsulta();
}

// callado: al actualizar se deja la ficha que había hasta que llegue la nueva.
async function abrirFichaConsulta(id, { candidato = null, callado = false, fecha = '' } = {}){
  const seq = ++PUNTUAL.seq;
  const resultados = id.startsWith('espn:resultados/');
  clearTimeout(PUNTUAL.timer);
  PUNTUAL.cargandoFecha = resultados && callado;
  PUNTUAL.reintentar = () => abrirFichaConsulta(id, { candidato, callado, fecha });
  if (!callado){
    Object.assign(PUNTUAL, { id, candidato, ficha: null, fallo: '', estado: 'cargando', fecha: resultados ? fecha : '' });
  }
  pintarConsulta();
  try {
    const d = await pedirConsulta('/consulta/ficha', { id, ...(resultados && fecha ? { fecha } : {}) });
    if (seq !== PUNTUAL.seq) return;
    if (callado && !['ok', 'vacio'].includes(d.estado) && PUNTUAL.ficha) PUNTUAL.fallo = 'red';
    else Object.assign(PUNTUAL, { ficha: d, estado: 'ficha', fallo: '',
      fecha: resultados ? fecha || (fechaValida(d.ficha?.fecha) ? d.ficha.fecha : '') : '' });
  } catch(e){
    if (seq !== PUNTUAL.seq) return;
    if (callado) PUNTUAL.fallo = e.motivo || 'red';
    else Object.assign(PUNTUAL, { estado: 'error', error: e.motivo || 'red' });
  }
  PUNTUAL.cargandoFecha = false;
  pintarConsulta();
  programarCaducidadConsulta();
}

function programarCaducidadConsulta(){
  clearTimeout(PUNTUAL.timer);
  // Deportes: al caducar se ofrece Actualizar; no se pide nada solo.
  const caduca = Date.parse(PUNTUAL.ficha?.caduca);
  if (PUNTUAL.estado === 'ficha' && esDeporteConsulta(PUNTUAL.ficha.tipo) && caduca > Date.now()){
    PUNTUAL.timer = setTimeout(pintarConsulta, caduca - Date.now() + 1000);
  }
}

// conservarPlegado: al cambiar solo las palabras marcadas, la ficha se queda
// plegada si el lector la plegó.
function pintarConsulta({ conservarPlegado = false } = {}){
  const el = document.getElementById('consulta-panel');
  if (!el || !PUNTUAL.activa) return;
  if (!el.dataset.escucha){
    el.dataset.escucha = '1';
    el.addEventListener('click', pulsarConsulta);
    el.addEventListener('change', cambiarFechaConsulta);
  }
  const plegada = conservarPlegado && el.querySelector('.consulta-ficha')?.open === false;
  el.innerHTML = htmlConsulta();
  if (plegada) el.querySelector('.consulta-ficha').open = false;
  el.hidden = false;
  // El foco solo se mueve tras un toque en el panel, nunca al llegar datos de lo que se escribe.
  const destino = PUNTUAL.enfocar && el.querySelector(PUNTUAL.enfocar);
  if (destino && !destino.disabled){ PUNTUAL.enfocar = ''; destino.focus(); }
}

function pulsarConsulta(ev){
  const b = ev.target.closest('button[data-accion]');
  if (!b) return;
  const p = PUNTUAL;
  switch (b.dataset.accion){
    case 'cerrar': quitarConsultas(); break;
    case 'elegir':
      p.elegida = +b.dataset.i;
      activarConsulta(p.lista[p.elegida]);
      break;
    case 'candidato': {
      const c = p.candidatos?.candidatos?.[+b.dataset.i];
      if (c){ p.enfocar = '.consulta-ficha summary'; abrirFichaConsulta(c.id, { candidato: c }); }
      break;
    }
    case 'ficha': p.enfocar = '.consulta-ficha summary'; abrirFichaConsulta(b.dataset.id); break;
    case 'partido': {
      const partido = p.ficha?.ficha?.partidos?.find(x => x.id === b.dataset.id);
      if (!partido || !idPartidoConsultaValido(partido.id)) break;
      p.origen = { ficha: p.ficha, id: p.id, candidato: p.candidato, fallo: p.fallo,
        grupo: p.grupo, reintentar: p.reintentar, idPartido: partido.id, fecha: p.fecha };
      p.enfocar = '.consulta-ficha summary';
      abrirFichaConsulta(partido.id);
      break;
    }
    case 'volver': {
      if (!p.origen) break;
      const { idPartido, ...origen } = p.origen;
      p.seq++;
      Object.assign(p, origen, { origen: null, estado: 'ficha', enfocar: `[data-accion="partido"][data-id="${idPartido}"]` });
      pintarConsulta();
      programarCaducidadConsulta();
      break;
    }
    case 'cambiar':
      p.seq++;
      Object.assign(p, { estado: 'candidatos', ficha: null, id: '', candidato: null, enfocar: '.consulta-candidatos button' });
      pintarConsulta();
      break;
    case 'reintentar': p.reintentar?.(); break;
    case 'actualizar':
      if (p.fallo) p.reintentar?.();
      else abrirFichaConsulta(p.id, { candidato: p.candidato, callado: true, fecha: p.fecha });
      break;
    case 'dia':
      if (fechaValida(p.fecha) && ['-1', '1'].includes(b.dataset.direccion)){
        consultarFechaResultados(sumarDiasCalendario(p.fecha, Number(b.dataset.direccion)),
          `[data-accion="dia"][data-direccion="${b.dataset.direccion}"]`);
      }
      break;
    case 'valor': cambiarTextoConsulta(b.dataset.valor); break;
    case 'grupo': {
      const i = Number(b.dataset.i);
      if (!Number.isInteger(i) || !p.ficha?.ficha?.grupos?.[i]) break;
      p.grupo = i;
      p.enfocar = `[data-accion="grupo"][data-i="${i}"]`;
      pintarConsulta({ conservarPlegado: true });
      break;
    }
    case 'forzar': cargarCandidatos(p.activa); break;
  }
}

function cambiarFechaConsulta(ev){
  if (ev.target.dataset.fechaResultados !== undefined){
    consultarFechaResultados(ev.target.value, '[data-fecha-resultados]');
  }
}
function consultarFechaResultados(fecha, foco){
  const p = PUNTUAL;
  if (!p.id.startsWith('espn:resultados/') || p.cargandoFecha || !fechaValida(fecha) || fecha < '0001-01-01') return;
  p.enfocar = foco;
  abrirFichaConsulta(p.id, { fecha, callado: Boolean(p.ficha) });
}

function escribirBusqueda(nuevo){
  aplicarFiltrosDebounced.cancel();
  $('#buscar').value = nuevo;
  const clear = $('#buscar-clear');
  if (clear) clear.hidden = !nuevo;
  aplicarFiltros();
}
function quitarConsultas(){
  const raws = new Set(PUNTUAL.lista.map(c => c.raw));
  escribirBusqueda(tokenizeQuery($('#buscar').value).filter(tk => !raws.has(tk.raw)).map(tk => tk.raw).join(' '));
}
function cambiarTextoConsulta(valor){
  const c = PUNTUAL.activa;
  escribirBusqueda(tokenizeQuery($('#buscar').value)
    .map(tk => (tk.raw === c.raw ? `${c.prefijo}:${valor}` : tk.raw)).join(' '));
}

/* ── HTML ── */
const enlaceSeguro = url => (/^https:\/\/[^\s"'<>]+$/.test(url || '') ? url : '');
function enlaceConsulta(url, texto){
  const u = enlaceSeguro(url);
  return u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(texto)}</a>` : '';
}
const msgConsulta = (clave, vars) => `<p class="consulta-msg" role="status">${escapeHtml(t(clave, vars))}</p>`;
const botonConsulta = (accion, texto, attrs = '') => `<button type="button" data-accion="${accion}"${attrs}>${escapeHtml(texto)}</button>`;
const opcionesConsulta = botones => `<div class="consulta-opciones">${botones}</div>`;
const botonFicha = (id, texto) => `<button type="button" class="consulta-enlace" data-accion="ficha" data-id="${escapeHtml(id)}">${escapeHtml(texto)} →</button>`;
const plegadoConsulta = (resumen, contenido, abierto = false) =>
  `<details${abierto ? ' open' : ''}><summary>${escapeHtml(resumen)}</summary>${contenido}</details>`;
const listaConsulta = items => `<ul class="consulta-lista">${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
// Miniatura: el worker da la imagen grande.
function imgConsulta(url){
  const u = enlaceSeguro(url).replace('/t/p/w500/', '/t/p/w185/').replace(/-L\.jpg$/, '-M.jpg');
  return u ? `<img class="consulta-img" src="${escapeHtml(u)}" alt="" width="64" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
}
const olUrl = id => {
  const v = String(id).split(':')[1] || '';
  return `https://openlibrary.org/${v.endsWith('A') ? 'authors' : 'works'}/${v}`;
};
const historialWikipedia = () => (PUNTUAL.id.startsWith('wikipedia:')
  ? `https://${idiomaConsulta()}.wikipedia.org/w/index.php?title=${encodeURIComponent(PUNTUAL.id.slice(10))}&action=history` : '');

function htmlConsulta(){
  const p = PUNTUAL, c = p.activa;
  const cerrar = t('conCerrar');
  const cambiar = p.origen ? botonConsulta('volver', t('conVolverResultados'))
    : p.id && p.candidatos?.estado === 'ok' ? botonConsulta('cambiar', t('conCambiar')) : '';
  const otras = p.lista.length > 1
    ? `<div class="consulta-otras">${escapeHtml(t('conVarias'))} ${p.lista.map((o, i) =>
        botonConsulta('elegir', `${nombreConsulta(o.tipo)}: ${o.texto}`, ` data-i="${i}" aria-pressed="${i === p.elegida}"`)).join('')}</div>`
    : '';
  const tipo = idPartidoConsultaValido(p.id) ? 'partido' : c.tipo;
  return `<div class="consulta-cab"><span class="consulta-tipo">${escapeHtml(nombreConsulta(tipo))}</span>${cambiar}
    <button type="button" class="consulta-cerrar" data-accion="cerrar" title="${escapeHtml(cerrar)}" aria-label="${escapeHtml(cerrar)}">${ico('x')}</button></div>
    ${otras}${htmlFechasResultados()}${cuerpoConsulta()}`;
}

function htmlFechasResultados(){
  const p = PUNTUAL;
  if (!p.id.startsWith('espn:resultados/')) return '';
  const cargando = p.cargandoFecha || p.estado === 'cargando';
  const mover = (direccion, texto, flecha) => botonConsulta('dia', flecha,
    ` data-direccion="${direccion}" title="${escapeHtml(t(texto))}" aria-label="${escapeHtml(t(texto))}"${cargando || !fechaValida(p.fecha) ? ' disabled' : ''}`);
  return `<div class="consulta-fechas" role="group" aria-label="${escapeHtml(t('conFechaResultados'))}" aria-busy="${cargando}">
    ${mover(-1, 'conDiaAnterior', '‹')}
    <label><span class="sr-only">${escapeHtml(t('conFechaResultados'))}</span><input type="date" data-fecha-resultados value="${escapeHtml(p.fecha)}" min="0001-01-01" max="9999-12-31"${cargando ? ' disabled' : ''}></label>
    ${mover(1, 'conDiaSiguiente', '›')}</div>${/^espn:resultados\/(nba|wnba)$/.test(p.id) ? `<p class="consulta-nota">${escapeHtml(t('conFechaMadrugada'))}</p>` : ''}`;
}

function cuerpoConsulta(){
  const p = PUNTUAL, c = p.activa;
  switch (p.estado){
    case 'ayuda':
      if (esDeporteConsulta(c.tipo)){
        return msgConsulta('conCompeticion') + opcionesConsulta(Object.keys(ESPN).filter(k => codigoDeporte(c.tipo, k))
          .map(k => botonConsulta('valor', CONSULTA_DEPORTES[k] || k, ` data-valor="${k}"`)).join(''));
      }
      return msgConsulta('conAyuda', { p: c.prefijo, ej: CONSULTA_EJEMPLOS[c.tipo] });
    case 'corta': return msgConsulta('conCorta') + opcionesConsulta(botonConsulta('forzar', t('conBuscarIgual', { x: c.texto })));
    case 'cargando': return msgConsulta('conCargando');
    case 'error':
      return msgConsulta(p.error === 'limite' ? 'conLimite' : 'conErrorRed') + opcionesConsulta(botonConsulta('reintentar', t('conReintentar')));
    case 'candidatos': return htmlCandidatos(p.candidatos);
    case 'ficha': return htmlFicha(p.ficha);
  }
  return '';
}

// '' si la respuesta trae contenido; si no, por qué.
function estadoConsulta(d, claveVacio, vars){
  if (d.estado === 'ok') return '';
  if (d.estado === 'vacio') return msgConsulta(claveVacio, vars);
  if (d.estado === 'invalida') return msgConsulta('conNoAdmitida');
  return msgConsulta('conNoDisponible', { x: d.fuente || '' }) + opcionesConsulta(botonConsulta('reintentar', t('conReintentar')));
}

function htmlCandidatos(d){
  const estado = estadoConsulta(d, d.tipo === 'partido' ? 'conSinPartidos' : 'conSinResultados', { x: PUNTUAL.activa.texto });
  if (estado) return estado + htmlPieConsulta(d);
  const items = d.candidatos.map((x, i) => {
    const det = (d.tipo === 'partido'
      ? [fechaPartidoConsulta(x.inicio), estadoTextoPartido(x.estado), x.detalle]
      : [x.detalle && x.detalle !== x.titulo ? x.detalle : '', x.anio || '']).filter(Boolean).join(' · ');
    return `<li><button type="button" data-accion="candidato" data-i="${i}"><span class="consulta-cand-tit">${escapeHtml(x.titulo || '')}</span>${
      det ? `<span class="consulta-cand-det">${escapeHtml(det)}</span>` : ''}</button></li>`;
  }).join('');
  return msgConsulta('conElige') + `<ul class="consulta-candidatos">${items}</ul>` + htmlPieConsulta(d);
}

function htmlFicha(d){
  const vacio = d.tipo === 'resultados' ? 'conSinPartidos' : d.tipo === 'clasificacion' ? 'conSinTabla' : 'conSinResultados';
  const estado = estadoConsulta(d, vacio, { x: PUNTUAL.activa.texto });
  if (estado) return estado + htmlPieConsulta(d);
  const pintar = d.ficha?.vista ? VISTAS_CONSULTA[d.ficha.vista]?.ficha : FICHAS_CONSULTA[d.tipo];
  if (!pintar || !d.ficha) return msgConsulta('conNoAdmitida');
  const r = pintar(d.ficha);
  const linea = [r.linea, d.incompleto ? t('conParcial') : ''].filter(Boolean).join(' · ');
  const ficha = `<details class="consulta-ficha" open><summary><strong class="consulta-titulo">${escapeHtml(r.titulo || '')}</strong>${
    linea ? `<span class="consulta-linea">${escapeHtml(linea)}</span>` : ''}</summary>
    <div class="consulta-cuerpo">${r.cuerpo}</div></details>${htmlPieConsulta(d)}`;
  return esDeporteConsulta(d.tipo) ? `<div class="consulta-deporte">${ficha}</div>` : ficha;
}

// Fuente y licencia, siempre a la vista; en deportes, la hora y Actualizar.
function htmlPieConsulta(d){
  const enlace = (url, texto) => enlaceConsulta(url, texto) || escapeHtml(texto);
  const partes = [];
  if (d.ficha?.fuente){
    const f = d.ficha.fuente;
    if (f.nombre) partes.push(enlace(f.url, f.nombre));
    if (f.licencia) partes.push(enlace(f.licencia_url, /^Condiciones/.test(f.licencia) ? t('conCondiciones') : f.licencia));
  } else if (d.tipo === 'contexto'){
    partes.push(enlace('https://www.wikipedia.org', 'Wikipedia'), enlace(d.licencia?.enlace, 'CC BY-SA'));
    if (d.ficha && historialWikipedia()) partes.push(enlace(historialWikipedia(), t('conAutores')));
  } else {
    if (d.fuente) partes.push(enlace(d.enlace, d.fuente));
    if (d.tipo === 'pelicula' || d.tipo === 'serie') partes.push('JustWatch');
    if (d.licencia) partes.push(enlace(d.licencia.enlace, /^Condiciones/.test(d.licencia.nombre) ? t('conCondiciones') : d.licencia.nombre));
  }
  if (!partes.length) return '';
  let pie = partes.join(' · ');
  if (esDeporteConsulta(d.tipo) && d.ficha){
    const hora = new Intl.DateTimeFormat(idiomaConsulta(), { hour: '2-digit', minute: '2-digit' });
    if (!isNaN(Date.parse(d.consultado))) pie += ' · ' + escapeHtml(t('conConsultado', { h: hora.format(new Date(d.consultado)) }));
    if (PUNTUAL.fallo) pie += ' · ' + escapeHtml(t('conNoActualizada'));
    if (PUNTUAL.fallo || !(Date.parse(d.caduca) > Date.now())) pie += ' ' + botonConsulta('actualizar', t('conActualizar'));
  }
  return `<p class="consulta-pie">${pie}</p>`;
}

function nombresIdioma(codigos = []){
  let dn = null;
  try { dn = new Intl.DisplayNames([idiomaConsulta()], { type: 'language' }); } catch(e){}
  const nombre = c => { try { return (dn && dn.of(c)) || c; } catch(e){ return c; } };
  return codigos.slice(0, 5).map(nombre).join(', ') + (codigos.length > 5 ? ` +${codigos.length - 5}` : '');
}

// Las palabras sueltas de la búsqueda (resultados:primera levante) se marcan
// en los equipos, con la regla del feed, sin filtrar: la lista es corta y la
// posición en la tabla o la jornada es parte del dato.
const casaEquipo = nombre => !!(PUNTUAL.texto && nombre && rangosResaltado(nombre, PUNTUAL.texto).length);
const equipoConsulta = nombre => (nombre == null ? escapeHtml(t('conEquipoPendiente')) : PUNTUAL.texto ? resaltarTitular(String(nombre), PUNTUAL.texto) : escapeHtml(nombre));
const claseMarcada = si => (si ? ' class="consulta-marcada"' : '');

const COLUMNAS_CONSULTA = { pj: 'conColPJ', pts: 'conColPts', g: 'conColG', e: 'conColE', p: 'conColP', dg: 'conColDG' };
function tablaConsulta(filas, cols, nombre){
  const val = v => escapeHtml(v ?? '—');
  const th = k => { const [abr, largo] = t(COLUMNAS_CONSULTA[k]).split('|'); return `<th scope="col"><abbr title="${escapeHtml(largo || abr)}">${escapeHtml(abr)}</abbr></th>`; };
  return `<table class="consulta-tabla"><thead><tr><th scope="col">#</th><th scope="col">${escapeHtml(t(nombre))}</th>${cols.map(th).join('')}</tr></thead>
    <tbody>${filas.map(r => `<tr${claseMarcada(casaEquipo(r.equipo))}><td>${val(r.pos)}</td><td>${equipoConsulta(r.equipo)}</td>${cols.map(k => `<td>${val(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function nombreGrupoConsulta(g){
  const clave = { 'Eastern Conference': 'conEste', 'Western Conference': 'conOeste', 'League Phase': 'conFaseLiga' }[g.nombre];
  return clave ? t(clave) : g.nombre || '';
}

function gruposConsulta(grupos, pintar){
  if (grupos.length === 1) return pintar(grupos[0]);
  const marcado = grupos.findIndex(g => g.filas.some(r => casaEquipo(r.equipo)));
  const elegido = PUNTUAL.grupo !== null && grupos[PUNTUAL.grupo] ? PUNTUAL.grupo : marcado >= 0 ? marcado : 0;
  const titulo = g => `${nombreGrupoConsulta(g)} (${g.filas.length})`;
  return `<div class="consulta-grupos-nav" role="group" aria-label="${escapeHtml(t('conGrupos'))}">${grupos.map((g, i) =>
    botonConsulta('grupo', titulo(g), ` data-i="${i}" aria-pressed="${i === elegido}"`)).join('')}</div>
    <div class="consulta-grupos">${grupos.map((g, i) => `<section data-seleccionado="${i === elegido}">
      <h3>${escapeHtml(titulo(g))}</h3>${pintar(g)}</section>`).join('')}</div>`;
}

const statPartido = id => t('conStat' + id[0].toUpperCase() + id.slice(1));

function textoEliminatoria(f){
  const e = f.eliminatoria;
  if (!e) return '';
  const marcador = m => `${m.local ?? '—'}–${m.visitante ?? '—'}`;
  return [e.ida_vuelta ? t(e.ida_vuelta === 'ida' ? 'conIda' : 'conVuelta') : '',
    e.global ? t('conGlobal', { x: marcador(e.global) }) : '',
    e.resolucion === 'prorroga' ? t('conTrasProrroga') : '',
    e.penaltis ? t('conPenaltis', { x: marcador(e.penaltis) }) : e.resolucion === 'penaltis' ? t('conTrasPenaltis') : '',
    e.clasificado && f[e.clasificado] ? t('conPasa', { x: f[e.clasificado] })
      : e.ganador && f[e.ganador] ? t('conGana', { x: f[e.ganador] }) : '',
  ].filter(Boolean).join(' · ');
}

function fichaPartido(f){
  const val = v => escapeHtml(v ?? '—');
  const equipo = lado => f[lado] || '—';
  const equipos = pintar => `<div class="consulta-equipos">${['local', 'visitante'].map(pintar).join('')}</div>`;
  const estadisticas = (f.estadisticas || []).length ? `<table class="consulta-comparativa">
    <caption>${escapeHtml(t('conEstadisticas'))}</caption><thead><tr><th scope="col">${equipoConsulta(f.local)}</th>
    <td></td><th scope="col">${equipoConsulta(f.visitante)}</th></tr></thead><tbody>${f.estadisticas.map(s => {
      const formato = v => v == null ? '—' : s.id === 'posesion' && !String(v).includes('%') ? v + '%' : v;
      return `<tr><td>${val(formato(s.local))}</td><th scope="row">${escapeHtml(statPartido(s.id))}</th><td>${val(formato(s.visitante))}</td></tr>`;
    }).join('')}</tbody></table>` : '';
  const incidencias = (f.incidencias || []).length ? `<h3 class="consulta-sub">${escapeHtml(t('conIncidencias'))}</h3>
    <ul class="consulta-incidencias">${f.incidencias.map(e => `<li><span>${val(e.minuto)}</span><span>
      <strong>${escapeHtml(t('conInc' + e.tipo[0].toUpperCase() + e.tipo.slice(1)))}</strong> · ${equipoConsulta(equipo(e.equipo))}
      ${e.jugadores.length ? `<span class="consulta-inc-jugadores">${escapeHtml(e.jugadores.join(' · '))}</span>` : ''}</span></li>`).join('')}</ul>` : '';
  const alineaciones = (f.alineaciones || []).length ? plegadoConsulta(t('conAlineaciones'), equipos(lado => {
    const a = f.alineaciones.find(x => x.equipo === lado);
    if (!a) return '';
    return `<section><h4>${equipoConsulta(equipo(lado))}${a.formacion ? ' · ' + escapeHtml(a.formacion) : ''}</h4>${[true, false].map(titular => {
      const lista = a.jugadores.filter(p => p.titular === titular);
      return lista.length ? `<p class="consulta-sub">${escapeHtml(t(titular ? 'conTitulares' : 'conSuplentes'))}</p>
        <ul class="consulta-alineacion">${lista.map(p => `<li><span>${val(p.dorsal)}</span><span>${escapeHtml(p.nombre)}${p.posicion ? ` <small>(${escapeHtml(p.posicion)})</small>` : ''}</span></li>`).join('')}</ul>` : '';
    }).join('')}</section>`;
  })) : '';
  const parciales = (f.parciales || []).length ? `<div class="consulta-tabla-scroll"><table class="consulta-parciales">
    <caption>${escapeHtml(t('conParciales'))}</caption><thead><tr><th scope="col">${escapeHtml(t('conColEquipo'))}</th>${f.parciales.map(p =>
      `<th scope="col"><abbr title="${escapeHtml(t(p.periodo <= 4 ? 'conCuarto' : 'conProrroga', { n: p.periodo <= 4 ? p.periodo : p.periodo - 4 }))}">${p.periodo <= 4 ? p.periodo : 'P' + (p.periodo - 4)}</abbr></th>`).join('')}</tr></thead>
    <tbody>${['local', 'visitante'].map(lado => `<tr><th scope="row">${equipoConsulta(equipo(lado))}</th>${f.parciales.map(p => `<td>${val(p[lado])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const destacados = (f.destacados || []).length ? `<h3 class="consulta-sub">${escapeHtml(t('conDestacados'))}</h3>${equipos(lado => {
    const lista = f.destacados.filter(p => p.equipo === lado);
    return lista.length ? `<section><h4>${equipoConsulta(equipo(lado))}</h4>${listaConsulta(lista.map(p => `${p.nombre} · ${p.valor} ${statPartido(p.tipo)}`))}</section>` : '';
  })}` : '';
  const jugadores = (f.jugadores || []).length ? plegadoConsulta(t('conJugadores'), equipos(lado => {
    const tabla = f.jugadores.find(p => p.equipo === lado);
    return tabla ? `<section><div class="consulta-tabla-scroll"><table class="consulta-jugadores"><caption>${equipoConsulta(equipo(lado))}</caption>
      <thead><tr><th scope="col">${escapeHtml(t('conJugador'))}</th>${['minutos', 'puntos', 'rebotes', 'asistencias'].map(k => `<th scope="col"><abbr title="${escapeHtml(statPartido(k))}">${escapeHtml(t('conAbrev' + k[0].toUpperCase() + k.slice(1)))}</abbr></th>`).join('')}</tr></thead>
      <tbody>${tabla.filas.map(p => `<tr><th scope="row">${escapeHtml(p.nombre)}</th>${['minutos', 'puntos', 'rebotes', 'asistencias'].map(k => `<td>${val(p[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : '';
  })) : '';
  return {
    titulo: `${f.local || t('conEquipoPendiente')} · ${f.visitante || t('conEquipoPendiente')}`,
    linea: [CONSULTA_DEPORTES[f.competicion], fechaPartidoConsulta(f.inicio), estadoTextoPartido(f.estado), f.reloj].filter(Boolean).join(' · '),
    cuerpo: `<div class="consulta-marcador"><span>${equipoConsulta(f.local)}</span><b>${val(f.marcador?.local)}</b>
      <span>${equipoConsulta(f.visitante)}</span><b>${val(f.marcador?.visitante)}</b></div>
      ${textoEliminatoria(f) ? `<p class="consulta-nota">${escapeHtml(textoEliminatoria(f))}</p>` : ''}
      ${f.lugar ? `<p class="consulta-lugar">${escapeHtml([f.lugar, f.ciudad].filter(Boolean).join(' · '))}</p>` : ''}
      ${parciales}${estadisticas}${incidencias}${destacados}${alineaciones}${jugadores}`,
  };
}

function fichaAudiovisual(f, serie){
  const personas = (serie ? f.creacion : f.direccion) || [];
  const modos = { suscripcion: [], alquiler: [], compra: [] };
  for (const p of f.donde_ver || []) modos[p.modo]?.push(p.nombre);
  const donde = (f.donde_ver || []).length
    ? (modos.suscripcion.length ? `<p class="consulta-sub">${escapeHtml(t('conSuscripcion'))} (${modos.suscripcion.length})</p>${listaConsulta(modos.suscripcion)}` : '')
      + (modos.alquiler.length ? plegadoConsulta(`${t('conAlquiler')} (${modos.alquiler.length})`, listaConsulta(modos.alquiler)) : '')
      + (modos.compra.length ? plegadoConsulta(`${t('conCompra')} (${modos.compra.length})`, listaConsulta(modos.compra)) : '')
    : `<p>${escapeHtml(t('conSinDondeVer'))}</p>`;
  const reparto = (f.reparto || []).map(r => (r.personaje ? `${r.nombre} — ${r.personaje}` : r.nombre));
  const ficha = enlaceConsulta(`https://www.themoviedb.org/${PUNTUAL.id.split(':')[1] || ''}`, t('conVerEn', { x: 'TMDB' }));
  return {
    titulo: f.titulo,
    linea: (serie ? [f.anio, f.temporadas ? tn('conTemporadas', f.temporadas) : '']
      : [f.anio, f.duracion ? t('conMin', { n: f.duracion }) : '']).filter(Boolean).join(' · '),
    cuerpo: `<div class="consulta-media">${imgConsulta(f.poster)}<div>
        ${f.titulo_original && f.titulo_original !== f.titulo ? `<p>${escapeHtml(t('conOriginal'))}: ${escapeHtml(f.titulo_original)}</p>` : ''}
        ${personas.length ? `<p>${escapeHtml(t(serie ? 'conCreacion' : 'conDireccion'))}: ${escapeHtml(personas.join(', '))}</p>` : ''}
        ${f.generos?.length ? `<p>${escapeHtml(f.generos.join(' · '))}</p>` : ''}</div></div>
      ${f.sinopsis ? plegadoConsulta(t('conSinopsis'), `<p>${escapeHtml(f.sinopsis)}</p>`) : ''}
      ${reparto.length ? plegadoConsulta(t('conReparto', { n: reparto.length }), listaConsulta(reparto)) : ''}
      <p class="consulta-sub">${escapeHtml(t('conDondeVer'))}</p>${donde}
      <p class="consulta-nota">${escapeHtml(t('conJustWatch'))}${f.enlace_donde_ver && enlaceSeguro(f.enlace_donde_ver) ? ' · ' + enlaceConsulta(f.enlace_donde_ver, t('conVerOpciones')) : ''}</p>
      <p class="consulta-nota">${ficha ? ficha + ' · ' : ''}${escapeHtml(t('conAvisoTmdb'))}</p>`,
  };
}

// Cada tipo: título, segunda línea (lo que identifica la ficha) y el desplegable.
const FICHAS_CONSULTA = {
  libro(f){
    const autores = f.autores || [];
    const datos = [f.ediciones != null ? tn('conEdiciones', f.ediciones) : '', nombresIdioma(f.idiomas)].filter(Boolean).join(' · ');
    return {
      titulo: f.titulo,
      linea: [autores.map(a => a.nombre).filter(Boolean).join(', '), f.primer_anio].filter(Boolean).join(' · '),
      cuerpo: `<div class="consulta-media">${imgConsulta(f.portada)}<div>
        ${datos ? `<p>${escapeHtml(datos)}</p>` : ''}
        ${autores.map(a => botonFicha(a.id, a.nombre || t('conAutor'))).join('')}
        <p>${enlaceConsulta(olUrl(PUNTUAL.id), t('conVerEn', { x: 'Open Library' }))}</p></div></div>`,
    };
  },
  autor(f){
    const obras = f.obras_principales || [];
    const boton = o => botonFicha(o.id, o.titulo);
    return {
      titulo: f.nombre,
      linea: [[f.nacimiento, f.fallecimiento].filter(Boolean).join('–'), obras.length ? tn('conObrasRecibidas', obras.length) : ''].filter(Boolean).join(' · '),
      cuerpo: `<div class="consulta-media">${imgConsulta(f.foto)}<div>
        ${obras.length ? `<p class="consulta-sub">${escapeHtml(t('conObras'))}</p>${obras.slice(0, 3).map(boton).join('')}` : ''}
        ${obras.length > 3 ? plegadoConsulta(t('conVerTodas', { n: obras.length }), obras.slice(3).map(boton).join('')) : ''}
        <p>${enlaceConsulta(olUrl(PUNTUAL.id), t('conVerEn', { x: 'Open Library' }))}</p></div></div>`,
    };
  },
  pelicula: f => fichaAudiovisual(f, false),
  serie: f => fichaAudiovisual(f, true),
  partido: fichaPartido,
  clasificacion(f){
    const deporte = ESPN[f.competicion]?.[0];
    const grupos = f.grupos || [];
    const primero = grupos[0]?.filas?.[0];
    let linea = '';
    if (primero && grupos.length === 1) linea = `${primero.pos ?? '—'}. ${primero.equipo}${primero.pts != null ? ' · ' + tn('conPuntos', primero.pts) : ''}`;
    const dg = f.competicion === 'champions' && grupos.some(g => g.filas.some(r => r.dg != null));
    const cols = deporte === 'basketball' ? ['g', 'p'] : deporte === 'racing' ? ['pts'] : ['pj', 'g', 'e', 'p', ...(dg ? ['dg'] : []), 'pts'];
    const nombre = deporte === 'racing' ? 'conColNombre' : 'conColEquipo';
    const tablas = gruposConsulta(grupos, g => tablaConsulta(g.filas, cols, nombre));
    return { titulo: [CONSULTA_DEPORTES[f.competicion] || f.competicion, f.temporada].filter(Boolean).join(' · '), linea,
      cuerpo: (f.competicion === 'champions' ? `<p class="consulta-sub">${escapeHtml(t('conFaseLiga'))}</p>` : '') + tablas };
  },
  resultados(f){
    const vista = Object.values(VISTAS_CONSULTA).find(v => v.admiteResultados?.(f));
    if (vista) return vista.resultados(f);
    const lang = idiomaConsulta();
    const dia = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' });
    const hora = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
    const partidos = f.partidos || [];
    const cuenta = {};
    for (const p of partidos) cuenta[p.estado] = (cuenta[p.estado] || 0) + 1;
    // Por día en la zona del lector, en el orden de la respuesta.
    const dias = new Map();
    for (const p of partidos){
      const fecha = new Date(p.inicio || NaN);
      const clave = isNaN(fecha) ? '' : dia.format(fecha);
      if (!dias.has(clave)) dias.set(clave, []);
      dias.get(clave).push(p);
    }
    const marcador = v => escapeHtml(v ?? '—');
    const cuerpo = [...dias].map(([fecha, lista]) => `${fecha ? `<p class="consulta-sub">${escapeHtml(fecha)}</p>` : ''}<ul class="consulta-partidos">${
      lista.map(p => {
        if (p.vista) return VISTAS_CONSULTA[p.vista]?.fila?.(p) || '';
        const inicio = new Date(p.inicio);
        const cab = [p.estado === 'programado' && !isNaN(inicio) ? hora.format(inicio) : '', estadoTextoPartido(p.estado)].filter(Boolean).join(' · ');
        const contenido = `<span class="consulta-estado">${escapeHtml(cab)}</span><span>${equipoConsulta(p.local)}</span><b>${marcador(p.marcador?.local)}</b><span>${equipoConsulta(p.visitante)}</span><b>${marcador(p.marcador?.visitante)}</b>${textoEliminatoria(p) ? `<span class="consulta-estado">${escapeHtml(textoEliminatoria(p))}</span>` : ''}`;
        const abrir = idPartidoConsultaValido(p.id);
        return `<li${claseMarcada(casaEquipo(p.local) || casaEquipo(p.visitante))} data-estado="${escapeHtml(p.estado || '')}">${abrir ? `<button type="button" data-accion="partido" data-id="${escapeHtml(p.id)}" aria-label="${escapeHtml(t('conAbrirPartido', { x: `${p.local || t('conEquipoPendiente')} · ${p.visitante || t('conEquipoPendiente')}` }))}">${contenido}</button>` : contenido}</li>`;
      }).join('')}</ul>`).join('');
    return {
      titulo: `${CONSULTA_DEPORTES[f.competicion] || f.competicion} · ${tn('conPartidos', partidos.length)}`,
      linea: [['en_juego', 'conNEnJuego'], ['final', 'conNFinal'], ['programado', 'conNProgramado']]
        .filter(([e]) => cuenta[e]).map(([e, k]) => tn(k, cuenta[e])).join(' · '),
      cuerpo,
    };
  },
  contexto(f){
    const ol = (f.ids?.openlibrary || []).find(x => /^OL\d+[AW]$/.test(x));
    const qid = /^Q\d+$/.test(f.qid || '') ? f.qid : '';
    const articulo = enlaceConsulta(f.enlace, t('conArticulo'));
    return {
      titulo: f.titulo,
      linea: (PUNTUAL.candidato?.id === PUNTUAL.id && PUNTUAL.candidato.detalle) || f.resumen || '',
      cuerpo: `${f.resumen ? `<p>${escapeHtml(f.resumen)}</p>` : ''}
        ${articulo ? `<p>${articulo}</p>` : ''}
        ${qid ? `<p class="consulta-nota">${escapeHtml(t('conDatos'))}: ${enlaceConsulta(`https://www.wikidata.org/wiki/${qid}`, 'Wikidata')} · CC0</p>` : ''}
        ${ol ? botonFicha(`openlibrary:${ol}`, t('conFichaOL')) : ''}`,
    };
  },
};
