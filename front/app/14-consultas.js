/* ═══════════════════════════════════════════════════════════════
   CONSULTAS PUNTUALES: libro:, autor:, pelicula:, serie:, contexto:,
   clasificacion: y resultados: (alias en shared/consultas/registro.js).
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
const CONSULTA_DEPORTES = { primera: 'Primera', segunda: 'Segunda', nba: 'NBA', wnba: 'WNBA', f1: 'F1' };
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
};

const idiomaConsulta = () => {
  const lang = (ACCES && ACCES.lang) || 'es';
  return CONSULTA_IDIOMAS.includes(lang) ? lang : 'es';
};
const nombreConsulta = tipo => t('con' + tipo[0].toUpperCase() + tipo.slice(1));
// Singular y plural: «clave1» para uno.
const tn = (clave, n) => t(n === 1 ? clave + '1' : clave, { n });
const esDeporteConsulta = tipo => tipo === 'clasificacion' || tipo === 'resultados';
const codigoDeporte = (tipo, codigo) => Object.hasOwn(ESPN, codigo) && !(tipo === 'resultados' && codigo === 'f1');

// Desde aplicarFiltros: la consulta activa es la última escrita, salvo que
// se haya elegido otra entre varias. `texto` (compilado, como el del feed):
// las palabras sueltas de la búsqueda, que se marcan en los equipos.
function actualizarConsultaPuntual(parsed, texto = null){
  const lista = parsed.chips.filter(c => c.type === 'consulta').map(c => ({
    tipo: c.tipo, texto: c.value.trim(), prefijo: c.raw.slice(0, c.raw.indexOf(':')), raw: c.raw,
  }));
  const claveTexto = texto?.incluir?.length ? JSON.stringify(texto.incluir) : '';
  const otroTexto = claveTexto !== PUNTUAL.claveTexto;
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
  PUNTUAL.seq++;   // lo que esté en camino ya no se pinta
  clearTimeout(PUNTUAL.timer);
  Object.assign(PUNTUAL, { candidatos: null, ficha: null, id: '', candidato: null, error: '', fallo: '', reintentar: null, enfocar: '' });
  if (esDeporteConsulta(c.tipo)){
    const codigo = normalize(c.texto);
    if (codigoDeporte(c.tipo, codigo)){ abrirFichaConsulta(`espn:${c.tipo}/${codigo}`); return; }
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
  const url = `${CONSULTA_URL}${ruta}?${new URLSearchParams({ ...params, idioma: idiomaConsulta() })}`;
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
async function abrirFichaConsulta(id, { candidato = null, callado = false } = {}){
  const seq = ++PUNTUAL.seq;
  clearTimeout(PUNTUAL.timer);
  if (!callado){
    Object.assign(PUNTUAL, { id, candidato, ficha: null, fallo: '', estado: 'cargando',
      reintentar: () => abrirFichaConsulta(id, { candidato }) });
    pintarConsulta();
  }
  try {
    const d = await pedirConsulta('/consulta/ficha', { id });
    if (seq !== PUNTUAL.seq) return;
    Object.assign(PUNTUAL, { ficha: d, estado: 'ficha', fallo: '' });
  } catch(e){
    if (seq !== PUNTUAL.seq) return;
    if (callado) PUNTUAL.fallo = e.motivo || 'red';
    else Object.assign(PUNTUAL, { estado: 'error', error: e.motivo || 'red' });
  }
  pintarConsulta();
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
  if (!el.dataset.escucha){ el.dataset.escucha = '1'; el.addEventListener('click', pulsarConsulta); }
  const plegada = conservarPlegado && el.querySelector('.consulta-ficha')?.open === false;
  el.innerHTML = htmlConsulta();
  if (plegada) el.querySelector('.consulta-ficha').open = false;
  el.hidden = false;
  // El foco solo se mueve tras un toque en el panel, nunca al llegar datos de lo que se escribe.
  const destino = PUNTUAL.enfocar && el.querySelector(PUNTUAL.enfocar);
  if (destino){ PUNTUAL.enfocar = ''; destino.focus(); }
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
    case 'cambiar':
      p.seq++;
      Object.assign(p, { estado: 'candidatos', ficha: null, id: '', candidato: null, enfocar: '.consulta-candidatos button' });
      pintarConsulta();
      break;
    case 'reintentar': p.reintentar?.(); break;
    case 'actualizar': abrirFichaConsulta(p.id, { candidato: p.candidato, callado: true }); break;
    case 'valor': cambiarTextoConsulta(b.dataset.valor); break;
    case 'forzar': cargarCandidatos(p.activa); break;
  }
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
  const cambiar = p.id && p.candidatos?.estado === 'ok' ? botonConsulta('cambiar', t('conCambiar')) : '';
  const otras = p.lista.length > 1
    ? `<div class="consulta-otras">${escapeHtml(t('conVarias'))} ${p.lista.map((o, i) =>
        botonConsulta('elegir', `${nombreConsulta(o.tipo)}: ${o.texto}`, ` data-i="${i}" aria-pressed="${i === p.elegida}"`)).join('')}</div>`
    : '';
  return `<div class="consulta-cab"><span class="consulta-tipo">${escapeHtml(nombreConsulta(c.tipo))}</span>${cambiar}
    <button type="button" class="consulta-cerrar" data-accion="cerrar" title="${escapeHtml(cerrar)}" aria-label="${escapeHtml(cerrar)}">${ico('x')}</button></div>
    ${otras}${cuerpoConsulta()}`;
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
  const estado = estadoConsulta(d, 'conSinResultados', { x: PUNTUAL.activa.texto });
  if (estado) return estado + htmlPieConsulta(d);
  const items = d.candidatos.map((x, i) => {
    const det = [x.detalle && x.detalle !== x.titulo ? x.detalle : '', x.anio || ''].filter(Boolean).join(' · ');
    return `<li><button type="button" data-accion="candidato" data-i="${i}"><span class="consulta-cand-tit">${escapeHtml(x.titulo || '')}</span>${
      det ? `<span class="consulta-cand-det">${escapeHtml(det)}</span>` : ''}</button></li>`;
  }).join('');
  return msgConsulta('conElige') + `<ul class="consulta-candidatos">${items}</ul>` + htmlPieConsulta(d);
}

function htmlFicha(d){
  const vacio = d.tipo === 'resultados' ? 'conSinPartidos' : d.tipo === 'clasificacion' ? 'conSinTabla' : 'conSinResultados';
  const estado = estadoConsulta(d, vacio, { x: PUNTUAL.activa.texto });
  if (estado) return estado + htmlPieConsulta(d);
  if (!FICHAS_CONSULTA[d.tipo] || !d.ficha) return msgConsulta('conNoAdmitida');
  const r = FICHAS_CONSULTA[d.tipo](d.ficha);
  const linea = [r.linea, d.incompleto ? t('conParcial') : ''].filter(Boolean).join(' · ');
  return `<details class="consulta-ficha" open><summary><strong class="consulta-titulo">${escapeHtml(r.titulo || '')}</strong>${
    linea ? `<span class="consulta-linea">${escapeHtml(linea)}</span>` : ''}</summary>
    <div class="consulta-cuerpo">${r.cuerpo}</div></details>${htmlPieConsulta(d)}`;
}

// Fuente y licencia, siempre a la vista; en deportes, la hora y Actualizar.
function htmlPieConsulta(d){
  const enlace = (url, texto) => enlaceConsulta(url, texto) || escapeHtml(texto);
  const partes = [];
  if (d.tipo === 'contexto'){
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
const equipoConsulta = nombre => (nombre == null ? '—' : PUNTUAL.texto ? resaltarTitular(String(nombre), PUNTUAL.texto) : escapeHtml(nombre));
const claseMarcada = si => (si ? ' class="consulta-marcada"' : '');

const COLUMNAS_CONSULTA = { pj: 'conColPJ', pts: 'conColPts', g: 'conColG', e: 'conColE', p: 'conColP' };
function tablaConsulta(filas, cols, nombre){
  const val = v => escapeHtml(v ?? '—');
  const th = k => { const [abr, largo] = t(COLUMNAS_CONSULTA[k]).split('|'); return `<th scope="col"><abbr title="${escapeHtml(largo || abr)}">${escapeHtml(abr)}</abbr></th>`; };
  return `<table class="consulta-tabla"><thead><tr><th scope="col">#</th><th scope="col">${escapeHtml(t(nombre))}</th>${cols.map(th).join('')}</tr></thead>
    <tbody>${filas.map(r => `<tr${claseMarcada(casaEquipo(r.equipo))}><td>${val(r.pos)}</td><td>${equipoConsulta(r.equipo)}</td>${cols.map(k => `<td>${val(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
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
  clasificacion(f){
    const deporte = ESPN[f.competicion]?.[0];
    const grupos = f.grupos || [];
    const primero = grupos[0]?.filas?.[0];
    let linea = '';
    if (primero) linea = deporte === 'basketball'
      ? `${grupos[0].nombre ? grupos[0].nombre + ': ' : ''}${primero.equipo} · ${primero.g ?? '—'}–${primero.p ?? '—'}`
      : `${primero.pos ?? '—'}. ${primero.equipo}${primero.pts != null ? ' · ' + tn('conPuntos', primero.pts) : ''}`;
    const cols = deporte === 'basketball' ? ['g', 'p'] : deporte === 'racing' ? ['pts'] : ['pj', 'pts'];
    const nombre = deporte === 'racing' ? 'conColNombre' : 'conColEquipo';
    const tablas = grupos.length === 1 ? tablaConsulta(grupos[0].filas, cols, nombre)
      : grupos.map((g, i) => plegadoConsulta(`${g.nombre || ''} (${g.filas.length})`, tablaConsulta(g.filas, cols, nombre),
        i === 0 || g.filas.some(r => casaEquipo(r.equipo)))).join('');
    const desglose = deporte === 'soccer'
      ? grupos.map(g => plegadoConsulta(t('conDesglose'), tablaConsulta(g.filas, ['g', 'e', 'p'], nombre))).join('') : '';
    return { titulo: [CONSULTA_DEPORTES[f.competicion] || f.competicion, f.temporada].filter(Boolean).join(' · '), linea, cuerpo: tablas + desglose };
  },
  resultados(f){
    const lang = idiomaConsulta();
    const dia = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' });
    const hora = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
    const partidos = f.partidos || [];
    const cuenta = {};
    for (const p of partidos) cuenta[p.estado] = (cuenta[p.estado] || 0) + 1;
    const estado = { en_juego: 'conEnJuego', final: 'conFinal', programado: 'conProgramado' };
    // Por día en la zona del lector, en el orden de la respuesta.
    const dias = new Map();
    for (const p of partidos){
      const fecha = new Date(p.inicio);
      const clave = isNaN(fecha) ? '' : dia.format(fecha);
      if (!dias.has(clave)) dias.set(clave, []);
      dias.get(clave).push(p);
    }
    const marcador = v => escapeHtml(v ?? '—');
    const cuerpo = [...dias].map(([fecha, lista]) => `${fecha ? `<p class="consulta-sub">${escapeHtml(fecha)}</p>` : ''}<ul class="consulta-partidos">${
      lista.map(p => {
        const inicio = new Date(p.inicio);
        const cab = [p.estado === 'programado' && !isNaN(inicio) ? hora.format(inicio) : '', estado[p.estado] ? t(estado[p.estado]) : ''].filter(Boolean).join(' · ');
        return `<li${claseMarcada(casaEquipo(p.local) || casaEquipo(p.visitante))}><span class="consulta-estado">${escapeHtml(cab)}</span><span>${equipoConsulta(p.local)}</span><b>${marcador(p.marcador?.local)}</b><span>${equipoConsulta(p.visitante)}</span><b>${marcador(p.marcador?.visitante)}</b></li>`;
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
