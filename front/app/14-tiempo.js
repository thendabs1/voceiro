/* ═══════════════════════════════════════════════════════════════
   EL TIEMPO (eltiempo:Lugar o tiempo:Lugar)
   Tarjeta encima de la lista, fuera del flujo de noticias. Los municipios
   se buscan aquí (shared/tiempo/; la lista se carga al escribir eltiempo:)
   y la previsión la da el worker de Deno (/tiempo), que habla con AEMET y
   Open-Meteo: Cloudflare se bloquea en España. eltiempo: vacío (o el sol de
   la cabecera) abre Mis sitios: hasta 5 lugares guardados en el dispositivo,
   con su previsión y sus avisos; la pestaña Avisos es alertas:.
   ═══════════════════════════════════════════════════════════════ */
const TIEMPO_ACTIVO_KEY  = 'voceiro-tiempo-activo';
const TIEMPO_LUGARES_KEY = 'voceiro-tiempo-lugares-v1';
const TIEMPO_SITIOS_KEY  = 'voceiro-tiempo-sitios-v1';
const TIEMPO_HORAS_KEY   = 'voceiro-tiempo-horas';
const TIEMPO_AVISOS_KEY  = 'voceiro-tiempo-avisos';
const TIEMPO_MAX_SITIOS  = 5;
const PREFIJOS_TIEMPO = { es: 'eltiempo', gl: 'otempo', ca: 'eltemps', en: 'weather', eu: 'eguraldia' };
const TIEMPO_URL = BACKENDS.deno.buscar;
const TIEMPO_CIELO = {
  despejado: ['sun', 'tiempoDespejado'],      poco:     ['cloud-sun', 'tiempoPoco'],
  nuboso:    ['cloud', 'tiempoNuboso'],       cubierto: ['cloud', 'tiempoCubierto'],
  lluvia:    ['cloud-rain', 'tiempoLluvia'],  nieve:    ['cloud-snow', 'tiempoNieve'],
  tormenta:  ['cloud-lightning', 'tiempoTormenta'], niebla: ['cloud-fog', 'tiempoNiebla'],
};
// sitios: la última previsión de cada lugar (clave → { p, pedida }) y
// cargas, las peticiones en curso; fallos, las claves que fallaron y fallo,
// si falló renovar la tarjeta.
const TIEMPO = { valor: null, timer: null, indice: null, carga: null, ultima: null, lugar: null, pedida: 0,
  sitios: new Map(), cargas: new Map(), fallos: new Set(), fallo: false };
let TIEMPO_ACTIVO = cargarTiempoActivo();

function cargarTiempoActivo(){
  try { return localStorage.getItem(TIEMPO_ACTIVO_KEY) !== 'false'; } catch(e){ return true; }
}

// La lista de municipios (~90 KB) solo se descarga la primera vez que hace falta.
function municipiosTiempo(){
  if (!TIEMPO.carga){
    TIEMPO.carga = import('./tiempo/municipios.js')
      .then(m => (TIEMPO.indice = indexar(m.MUNICIPIOS)))
      .catch(e => { TIEMPO.carga = null; throw e; });
  }
  return TIEMPO.carga;
}

// El lugar que se eligió para cada nombre (en el autocompletado o al haber
// varios): la próxima vez no se pregunta.
function lugaresRecordados(){
  try { return JSON.parse(localStorage.getItem(TIEMPO_LUGARES_KEY)) || {}; } catch(e){ return {}; }
}
function recordarLugar(nombre, lugar){
  const r = lugaresRecordados();
  if (lugar) r[normalize(nombre).trim()] = lugar;
  else delete r[normalize(nombre).trim()];
  try { localStorage.setItem(TIEMPO_LUGARES_KEY, JSON.stringify(r)); } catch(e){}
}

// Mis sitios: { nombre, lugar, zona }. lugar es { ine } o { lat, lon, cc,
// nombre, region, pais }; zona, la de los avisos de AEMET (o null).
function sitiosTiempo(){
  try {
    const s = JSON.parse(localStorage.getItem(TIEMPO_SITIOS_KEY));
    return Array.isArray(s) ? s.filter(x => x && x.lugar).slice(0, TIEMPO_MAX_SITIOS) : [];
  } catch(e){ return []; }
}
function guardarSitios(sitios){
  try { localStorage.setItem(TIEMPO_SITIOS_KEY, JSON.stringify(sitios)); } catch(e){}
}
const claveLugar = l => (l.ine ? String(l.ine) : `${(+l.lat).toFixed(3)},${(+l.lon).toFixed(3)}`);
// El lugar de una previsión: los de España, por su INE.
const lugarDe = (p, lugar) => (p.ine ? { ine: p.ine } : lugar);

// El prefijo del tiempo que se está escribiendo al final del buscador
// («eltiempo:"A Cor»).
const RX_TIEMPO_FINAL = /(^|\s)((?:eltiempo|tiempo|t|otempo|tempo|eltemps|temps|weather|eguraldia):)(?:"[^"]*|[^\s"]*)$/i;
function fragmentoTiempo(raw){
  const m = raw.match(/(?:^|\s)(?:eltiempo|tiempo|t|otempo|tempo|eltemps|temps|weather|eguraldia):(?:"([^"]*)|([^\s"]*))$/i);
  return m ? (m[1] ?? m[2]) : null;
}

function sugerenciasTiempo(texto){
  if (!TIEMPO.indice){
    // Cuando llegue la lista, se sugiere si el usuario sigue en el buscador.
    municipiosTiempo().then(() => {
      const input = document.getElementById('buscar');
      if (document.activeElement !== input) return;
      const items = sugerenciasBuscar(input.value);
      if (haySugerencias(items)) abrirSugerencias(items);
    }).catch(() => {});
    return [];
  }
  return sugerirMunicipios(TIEMPO.indice, texto).map(m => ({
    kind: 'municipio', value: m.nombre, ine: m.ine, label: m.nombre,
    meta: provinciaDe(m.ine), tipo: t('tiempoSugTipo'),
  }));
}

function pintarTiempo(html, prevision = null){
  const el = document.getElementById('tiempo-tarjeta');
  if (!el) return;
  TIEMPO.ultima = prevision;
  el.innerHTML = html;
  el.hidden = !html;
}
const msgTiempo = (clave, vars) => `<p class="tiempo-msg">${escapeHtml(t(clave, vars))}</p>`;

function actualizarTiempo(valor){
  if (valor === TIEMPO.valor) return;
  TIEMPO.valor = valor;
  clearTimeout(TIEMPO.timer);
  if (valor == null){ pintarTiempo(''); return; }
  if (valor === ''){
    if (TIEMPO_ACTIVO) pintarSitios();
    else pintarTiempo(msgTiempo('tiempoDesactivado'));
    return;
  }
  // Pausa: mientras se escribe «eltiempo:Vi…» no se pide nada.
  TIEMPO.timer = setTimeout(() => resolverTiempo(valor), 500);
}

async function pedirTiempo(ruta){
  const r = await fetch(TIEMPO_URL + ruta, { signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}

// Primero lo recordado; luego los municipios de España (sin red); si no,
// el worker geocodifica (ciudades de fuera, nombres en castellano…).
async function resolverTiempo(valor){
  if (!TIEMPO_ACTIVO){ pintarTiempo(msgTiempo('tiempoDesactivado')); return; }
  const vigente = () => TIEMPO.valor === valor;
  const clave = normalize(valor).trim();
  const recordado = lugaresRecordados()[clave];
  if (recordado) return mostrarPrevision(recordado, valor);

  let exactos = [];
  try { exactos = municipiosExactos(await municipiosTiempo(), valor); } catch(e){}
  if (!vigente()) return;
  if (exactos.length === 1) return mostrarPrevision({ ine: exactos[0].ine }, valor);
  if (exactos.length > 1){
    return pintarEleccion(valor, exactos.map(m => ({ ine: m.ine, nombre: m.nombre, region: provinciaDe(m.ine), pais: '' })));
  }
  if (clave.length < 3){ pintarTiempo(''); return; }

  pintarTiempo(msgTiempo('tiempoCargando'));
  let lugares;
  try {
    lugares = (await pedirTiempo(`/tiempo/lugares?q=${encodeURIComponent(valor)}&lang=${(ACCES && ACCES.lang) || 'es'}`)).lugares || [];
  } catch(e){
    if (vigente()) pintarTiempo(msgTiempo('tiempoError'));
    return;
  }
  if (!vigente()) return;
  if (!lugares.length){ pintarTiempo(msgTiempo('tiempoNoEncontrado', { X: valor })); return; }
  const iguales = lugares.filter(l => normalize(l.nombre).trim() === clave);
  if (iguales.length === 1) return mostrarPrevision(iguales[0], valor);
  pintarEleccion(valor, (iguales.length ? iguales : lugares).slice(0, 6));
}

function pintarEleccion(valor, lugares){
  pintarTiempo(msgTiempo('tiempoElegir', { X: valor })
    + `<div class="tiempo-elegir">${lugares.map((l, i) =>
        `<button type="button" data-i="${i}">${escapeHtml(l.nombre)} <span>${escapeHtml([l.region, l.pais].filter(Boolean).join(' · '))}</span></button>`
      ).join('')}</div>`);
  document.querySelectorAll('#tiempo-tarjeta .tiempo-elegir button').forEach(b => {
    b.addEventListener('click', () => {
      const l = lugares[+b.dataset.i];
      const lugar = l.ine ? { ine: l.ine }
        : { lat: l.lat, lon: l.lon, cc: l.cc, nombre: l.nombre, region: l.region, pais: l.pais };
      recordarLugar(valor, lugar);
      mostrarPrevision(lugar, valor);
    });
  });
}

function rutaTiempo(lugar){
  return lugar.ine ? `/tiempo?ine=${encodeURIComponent(lugar.ine)}`
    : '/tiempo?' + new URLSearchParams({
        lat: lugar.lat, lon: lugar.lon, cc: lugar.cc || '',
        nombre: lugar.nombre || '', region: lugar.region || '', pais: lugar.pais || '',
      });
}

// callado: al renovarla se deja la tarjeta que había hasta que llegue la nueva.
async function mostrarPrevision(lugar, valor, { callado = false } = {}){
  if (!callado) pintarTiempo(msgTiempo('tiempoCargando'));
  try {
    const p = await pedirTiempo(rutaTiempo(lugar));
    if (TIEMPO.valor !== valor) return;
    TIEMPO.lugar = lugar;
    TIEMPO.pedida = Date.now();
    TIEMPO.fallo = false;
    TIEMPO.sitios.set(claveLugar(lugarDe(p, lugar)), { p, pedida: TIEMPO.pedida });
    pintarTiempo(htmlPrevision(p), p);
    // Los avisos de su zona: los de toda España, en una petición que se
    // reutiliza 15 minutos.
    if (p.zonaAviso) pedirAvisos().then(() => { if (TIEMPO.ultima === p) repintarTiempo(); });
  } catch(e){
    if (TIEMPO.valor !== valor) return;
    if (!callado) pintarTiempo(msgTiempo('tiempoError'));
    // Al renovarla se queda la que había, pero se dice y se puede reintentar.
    else if (TIEMPO.ultima){ TIEMPO.fallo = true; pintarTiempo(htmlPrevision(TIEMPO.ultima), TIEMPO.ultima); }
  }
}

const grados = v => (v == null ? '–' : `${v}°`);
function cieloTiempo(c, noche){
  const x = TIEMPO_CIELO[c];
  if (!x) return { ico: '', txt: '' };
  let nombre = x[0];
  if (noche && c === 'despejado') nombre = 'moon';
  if (noche && c === 'poco') nombre = 'cloud-moon';
  return { ico: ico(nombre), txt: t(x[1]) };
}

function htmlPrevision(p){
  const lang = (ACCES && ACCES.lang) || 'es';
  const cielo = cieloTiempo;
  const diaSemana = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
  const region = p.lugar.region || (p.ine ? provinciaDe(p.ine) : '');

  const a = p.ahora;
  const ca = a ? cielo(a.cielo, a.noche) : null;
  const sol = p.sol
    ? `<span class="tiempo-sol">${ico('sun')}
       <span class="tiempo-sol-hora"><span class="sr">${escapeHtml(t('tiempoOrto'))}: </span><span aria-hidden="true">↑</span>${escapeHtml(p.sol.orto)}</span>
       <span class="tiempo-sol-hora"><span class="sr">${escapeHtml(t('tiempoOcaso'))}: </span><span aria-hidden="true">↓</span>${escapeHtml(p.sol.ocaso)}</span></span>`
    : '';
  const ahora = a
    ? `<div class="tiempo-ahora">${ca.ico}<span class="tiempo-temp">${grados(a.temp)}</span><span>${escapeHtml(ca.txt)}</span>${sol}</div>`
    : '';

  const dias = p.dias.slice(0, 5).map((d, i) => {
    const c = cielo(d.cielo);
    return `<li>
      <span class="tiempo-dia">${escapeHtml(i === 0 ? t('tiempoHoy') : diaSemana.format(new Date(d.fecha + 'T12:00:00Z')))}</span>
      ${c.ico}<span class="sr">${escapeHtml(c.txt)}</span>
      <span><b>${grados(d.max)}</b> <span class="tiempo-min">${grados(d.min)}</span></span>
      ${d.lluvia == null ? '' : `<span class="tiempo-lluvia">${ico('droplet')}<span class="sr">${escapeHtml(t('tiempoProbLluvia'))}</span> ${d.lluvia}%</span>`}
    </li>`;
  }).join('');

  const enlace = /^https:\/\//.test(p.enlace || '') ? p.enlace : '';
  const fuente = p.fuente === 'aemet' ? 'AEMET' : 'Open-Meteo';
  const pie = `${escapeHtml(t('tiempoFuente'))}: `
    + (enlace ? `<a href="${escapeHtml(enlace)}" target="_blank" rel="noopener">${fuente}</a>` : fuente)
    + (p.elaborado ? ' · ' + escapeHtml(t('tiempoElaborado', { h: p.elaborado.slice(11, 16) })) : '')
    + (p.sinAemet ? ' · ' + escapeHtml(t('tiempoSinAemet')) : '')
    + (TIEMPO.fallo ? ' · ' + escapeHtml(t('tiempoNoActualizado')) + htmlReintentar() : '')
    + `<button type="button" class="tiempo-cambiar">${escapeHtml(t('tiempoCambiar'))}</button>`;

  return `${htmlPestanasTiempo(null)}
    <div class="tiempo-cab"><strong>${escapeHtml(p.lugar.nombre)}</strong><span>${escapeHtml([region, p.lugar.pais].filter(Boolean).join(' · '))}</span>${htmlGuardar(p)}</div>
    ${ahora}
    <ol class="tiempo-dias">${dias}</ol>
    ${htmlHoras(p)}
    ${htmlAvisosLugar(p)}
    <div class="tiempo-pie">${pie}</div>`;
}

// Mis sitios, Avisos (alertas:) y los ajustes; activa: 'sitios', 'avisos' o null.
function htmlPestanasTiempo(activa){
  const p = (ir, clave) => `<button type="button" class="tiempo-pestana" data-ir="${ir}"${activa === ir ? ' aria-current="page"' : ''}>${escapeHtml(t(clave))}</button>`;
  const aj = t('tiempoAjustes');
  const cerrar = `${t('btnCerrar')} ${t('ajTiempoTit')}`;
  return `<nav class="tiempo-pestanas" aria-label="${escapeHtml(t('ajTiempoTit'))}">${p('sitios', 'tiempoMisSitios')}${p('avisos', 'avisosBotonTxt')}
    <button type="button" class="tiempo-cerrar" title="${escapeHtml(cerrar)}" aria-label="${escapeHtml(cerrar)}">${ico('x')}</button>
    <button type="button" class="tiempo-ajustes" title="${escapeHtml(aj)}" aria-label="${escapeHtml(aj)}">${ico('settings')}</button></nav>`;
}

// ☆ / ★: guardar o quitar de Mis sitios (con 5, no deja guardar más).
function htmlGuardar(p){
  const lugar = lugarDe(p, TIEMPO.lugar || {});
  if (!lugar.ine && lugar.lat == null) return '';
  const sitios = sitiosTiempo();
  const guardado = sitios.some(s => claveLugar(s.lugar) === claveLugar(lugar));
  const lleno = !guardado && sitios.length >= TIEMPO_MAX_SITIOS;
  return `<button type="button" class="tiempo-guardar" aria-pressed="${guardado}" aria-label="${escapeHtml(t('tiempoGuardar'))}"
    title="${escapeHtml(t(guardado ? 'tiempoQuitar' : lleno ? 'tiempoLleno' : 'tiempoGuardar'))}"${lleno ? ' aria-disabled="true"' : ''}><span aria-hidden="true">${guardado ? '★' : '☆'}</span></button>`;
}

function alternarSitio(p){
  const lugar = lugarDe(p, TIEMPO.lugar);
  const k = claveLugar(lugar);
  const sitios = sitiosTiempo();
  const i = sitios.findIndex(s => claveLugar(s.lugar) === k);
  if (i >= 0) sitios.splice(i, 1);
  else if (sitios.length < TIEMPO_MAX_SITIOS) sitios.push({ nombre: p.lugar.nombre, lugar, zona: p.zonaAviso || null });
  else return;
  guardarSitios(sitios);
  repintarTiempo();
  document.querySelector('#tiempo-tarjeta .tiempo-guardar')?.focus();
  pintarBotonTiempo();
  refrescarAvisos();
}

// Las próximas 24 horas, plegadas; abiertas o no, como se dejaron la última vez.
function htmlHoras(p){
  if (!p.horas?.length) return '';
  const lang = (ACCES && ACCES.lang) || 'es';
  const diaSemana = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
  let abiertas = false;
  try { abiertas = localStorage.getItem(TIEMPO_HORAS_KEY) === 'true'; } catch(e){}
  const horas = p.horas.map((h, i) => {
    const c = cieloTiempo(h.cielo, h.noche);
    // A medianoche, el día va bajo «0h» sin desplazar el resto de la fila.
    const dia = h.hora === 0 && i > 0 ? diaSemana.format(new Date(h.fecha + 'T12:00:00Z')) : '';
    return `<li>
      <span class="tiempo-dia">${h.hora}h${dia ? `<small>${escapeHtml(dia)}</small>` : ''}</span>
      ${c.ico}<span class="sr">${escapeHtml(c.txt)}</span>
      <b>${grados(h.temp)}</b>
      ${h.lluvia ? `<span class="tiempo-lluvia">${ico('droplet')}<span class="sr">${escapeHtml(t('tiempoProbLluvia'))}</span> ${h.lluvia}%</span>` : ''}
    </li>`;
  }).join('');
  return `<details class="tiempo-horas"${abiertas ? ' open' : ''}><summary>${escapeHtml(t('tiempoPorHoras'))}</summary>
    <ol class="tiempo-dias" tabindex="0" aria-label="${escapeHtml(t('tiempoPorHoras'))}">${horas}</ol></details>`;
}

// Avisos de la zona del municipio y de su costa (la misma zona con C).
function avisosDeZona(zona){
  return avisosVigentes().filter(a => a.zona === zona || a.zona === zona + 'C')
    .sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || empezado(b) - empezado(a) || Date.parse(a.inicio) - Date.parse(b.inicio));
}
function htmlAvisosLugar(p){
  const d = AVISOS.datos;
  if (!p.zonaAviso || (!d && !AVISOS.error)) return '';
  // Plegados como «Por horas» y como se dejaron; sin abrir se ven cuántos y
  // el más grave con su momento: «Avisos (3) · Naranja mañana».
  const lista = d ? avisosDeZona(p.zonaAviso) : [];
  let abiertos = false;
  try { abiertos = localStorage.getItem(TIEMPO_AVISOS_KEY) === 'true'; } catch(e){}
  const a = lista[0];
  const resumen = a ? ` (${lista.length}) · ${t('avisoNivel' + a.nivel)} ${momentoAviso(a)}` : '';
  const cuerpo = !d ? msgTiempo('avisosError')
    : (lista.length ? `<ul class="aviso-zonas">${lista.map(a => htmlAviso(a, { nivel: '' })).join('')}</ul>` : msgTiempo('avisosNinguno'))
      + (d.incompleto || AVISOS.error ? `<div class="tiempo-pie">${pieAvisos(d)}</div>` : '');
  return `<details class="tiempo-avisos"${abiertos ? ' open' : ''}><summary>${escapeHtml(t('avisosBotonTxt') + resumen)}</summary>`
    + cuerpo + '</details>';
}

// La previsión de un sitio guardado: la de la última hora sirve.
function previsionSitio(s){
  const k = claveLugar(s.lugar);
  const c = TIEMPO.sitios.get(k);
  if (c && Date.now() - c.pedida < 60 * 60e3 && new Date(c.pedida).toDateString() === new Date().toDateString()) return Promise.resolve(c.p);
  if (!TIEMPO.cargas.has(k)){
    TIEMPO.cargas.set(k, pedirTiempo(rutaTiempo(s.lugar))
      .then(p => { TIEMPO.sitios.set(k, { p, pedida: Date.now() }); TIEMPO.fallos.delete(k); return p; },
        e => { TIEMPO.fallos.add(k); throw e; })
      .finally(() => TIEMPO.cargas.delete(k)));
  }
  return TIEMPO.cargas.get(k);
}

// eltiempo: vacío: Mis sitios, cada uno con el cielo, la temperatura, la
// máxima y la mínima de hoy y su aviso más grave. Pinta lo que tiene y
// repinta según llega lo demás, siempre con la lista guardada: una
// respuesta que llega tarde no devuelve un sitio ya quitado.
function pintarSitios(){
  const pintar = () => {
    if (TIEMPO.valor !== '') return;
    const sitios = sitiosTiempo();
    pintarTiempo(htmlPestanasTiempo('sitios') + (sitios.length ? htmlSitios(sitios) : msgTiempo('tiempoSinSitios')));
  };
  pintar();
  const sitios = sitiosTiempo();
  if (sitios.some(s => s.zona)) pedirAvisos().then(pintar);
  sitios.forEach(s => previsionSitio(s).then(pintar, pintar));
}

const htmlReintentar = () => `<button type="button" class="tiempo-reintentar">${escapeHtml(t('tiempoReintentar'))}</button>`;
const regionSitio = l => (l.ine ? provinciaDe(l.ine) : [l.region, l.pais].filter(Boolean).join(' · '));

// Los botones llevan la clave del lugar, no la posición en la lista.
function htmlSitios(sitios){
  const repetido = s => sitios.filter(x => normalize(x.nombre) === normalize(s.nombre)).length > 1;
  const filas = sitios.map(s => {
    const k = claveLugar(s.lugar);
    const p = TIEMPO.sitios.get(k)?.p;
    const hoy = p?.dias?.[0];
    const a = p?.ahora;
    const c = a ? cieloTiempo(a.cielo, a.noche) : hoy ? cieloTiempo(hoy.cielo) : null;
    const avisos = s.zona && AVISOS.datos ? avisosDeZona(s.zona) : [];
    const av = avisos[0];
    // Dos sitios con el mismo nombre: con su provincia (o región y país).
    const nombre = s.nombre + (repetido(s) && regionSitio(s.lugar) ? ` (${regionSitio(s.lugar)})` : '');
    const quitar = `${t('tiempoQuitar')}: ${nombre}`;
    return `<li><button type="button" class="tiempo-sitio" data-k="${escapeHtml(k)}">
        <strong>${escapeHtml(nombre)}</strong>
        ${c ? c.ico + `<span class="sr">${escapeHtml(c.txt)}</span>` : ''}
        ${a ? `<b>${grados(a.temp)}</b>` : ''}
        ${hoy ? `<span>${grados(hoy.max)} <span class="tiempo-min">${grados(hoy.min)}</span></span>` : (p ? '' : `<span class="tiempo-min">${TIEMPO.fallos.has(k) ? '–' : '…'}</span>`)}
        ${av ? `<span class="tiempo-sitio-aviso" data-nivel="${escapeHtml(av.nivel)}">${escapeHtml(`${t('avisoNivel' + av.nivel)} · ${nombreFen(av.fen)} · ${momentoAviso(av)}`)}${avisos.length > 1 ? ` +${avisos.length - 1}` : ''}</span>` : ''}
      </button><button type="button" class="tiempo-quitar" data-k="${escapeHtml(k)}" aria-label="${escapeHtml(quitar)}" title="${escapeHtml(quitar)}">${ico('x')}</button></li>`;
  }).join('');
  const fallo = sitios.some(s => TIEMPO.fallos.has(claveLugar(s.lugar)) && !TIEMPO.sitios.has(claveLugar(s.lugar)));
  return `<ul class="tiempo-sitios">${filas}</ul>
    <div class="tiempo-pie"><button type="button" class="tiempo-otro">${ico('search')}${escapeHtml(t('tiempoOtro'))}</button>`
    + (fallo ? ` ${escapeHtml(t('tiempoNoActualizado'))}${htmlReintentar()}` : '') + '</div>';
}

const sitioPorClave = k => sitiosTiempo().find(s => claveLugar(s.lugar) === k);
function abrirSitio(s){
  if (!s) return;
  recordarLugar(s.nombre, s.lugar);   // que no pregunte «¿Qué Castro?»
  ponerTiempo(tokenTiempo(/\s/.test(s.nombre) ? `"${s.nombre}"` : s.nombre));
}
function quitarSitio(k){
  const sitios = sitiosTiempo().filter(s => claveLugar(s.lugar) !== k);
  guardarSitios(sitios);
  pintarSitios();
  document.querySelector('#tiempo-tarjeta .tiempo-sitio, #tiempo-tarjeta .tiempo-pestana')?.focus();
  pintarBotonTiempo();
}

// El sol y las pestañas cambian un prefijo del tiempo por otro sin tocar
// el resto de la búsqueda; '' los quita (cierra el panel).
const RX_TOKENS_TIEMPO = /(^|\s)(?:eltiempo|tiempo|t|otempo|tempo|eltemps|temps|weather|eguraldia|alertas|avisos):(?:"[^"]*"?|[^\s"]*)/gi;
const RX_HAY_TIEMPO = /(^|\s)(?:eltiempo|tiempo|t|otempo|tempo|eltemps|temps|weather|eguraldia|alertas|avisos):/i;
function tokenTiempo(valor = ''){
  return `${PREFIJOS_TIEMPO[(ACCES && ACCES.lang) || 'es'] || 'eltiempo'}:${valor}`;
}
function ponerTiempo(token){
  if (document.getElementById('estadisticas-panel')?.hidden === false) cerrarEstadisticas();
  cerrarCalendario(false);
  const input = $('#buscar');
  const { antes, consulta } = partirConsulta(input.value);
  const resto = antes.replace(RX_TOKENS_TIEMPO, ' ').replace(/\s+/g, ' ').trim();
  input.value = [resto, token, consulta].filter(Boolean).join(' ');
  if (token){
    $('.filtros-wrap').classList.add('busqueda-abierta');
    $('#btn-buscar').setAttribute('aria-expanded', 'true');
    const clear = $('#buscar-clear');
    if (clear) clear.hidden = false;
  }
  aplicarFiltros();
  const barra = document.getElementById('barra-sup');
  barra?.classList.remove('cab-oculta');
  requestAnimationFrame(() => {
    const panel = document.getElementById(token.startsWith('alertas') ? 'avisos-panel' : 'tiempo-tarjeta');
    // De arriba abajo: chips de la búsqueda, el panel y, bajo él, los del feed.
    const visible = id => { const el = document.getElementById(id); return el?.getClientRects().length ? el : null; };
    const destino = visible('chips-busqueda') || (token && panel && !panel.hidden ? panel : null)
      || visible('preset-pestanas') || visible('temas-chips');
    if (!destino) return;
    const altoBarra = barra?.getBoundingClientRect().height || 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + destino.getBoundingClientRect().top - altoBarra - 8), behavior: 'auto' });
  });
}
// Sin sitios guardados, el panel se abre con el cursor tras eltiempo:.
function enfocarBuscador(){
  const input = $('#buscar');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
function cambiarLugarTiempo(){
  ponerTiempo(tokenTiempo());
  requestAnimationFrame(enfocarBuscador);
}
function abrirSitios(){
  ponerTiempo(tokenTiempo());
  if (!sitiosTiempo().length) enfocarBuscador();
}
function abrirTiempo(){
  if (RX_HAY_TIEMPO.test(partirConsulta($('#buscar').value).antes)) ponerTiempo('');
  else abrirSitios();
}
// Pestañas y ajustes, en el panel del tiempo y en el de avisos.
function pulsarPestanaTiempo(b){
  if (b.classList.contains('tiempo-cerrar')) ponerTiempo('');
  else if (b.classList.contains('tiempo-ajustes')) abrirAjustes('feed');
  else if (b.dataset.ir === 'avisos') ponerTiempo('alertas:');
  else if (b.dataset.ir === 'sitios') abrirSitios();
}

// El sol: con el tiempo activado. Con aviso naranja o rojo en uno de mis
// sitios (y el ajuste puesto), se colorea y lo dice.
function pintarBotonTiempo(){
  const b = document.getElementById('btn-tiempo');
  if (!b) return;
  b.hidden = !TIEMPO_ACTIVO;
  const graves = AVISOS_CABECERA && AVISOS.datos
    ? sitiosTiempo().filter(s => s.zona).map(s => ({ s, a: avisosDeZona(s.zona)[0] })).filter(x => x.a && PESO[x.a.nivel] >= 2)
    : [];
  const nivel = graves.some(x => x.a.nivel === 'rojo') ? 'rojo' : graves.length ? 'naranja' : '';
  if (nivel) b.dataset.nivel = nivel;
  else delete b.dataset.nivel;
  const etiqueta = t('ajTiempoTit') + (nivel ? ` · ${t('avisoNivel' + nivel)}: ${graves.map(x => x.s.nombre).join(', ')}` : '');
  b.innerHTML = ico('sun');
  b.title = etiqueta;
  b.setAttribute('aria-label', etiqueta);
  b.setAttribute('aria-pressed', String(RX_HAY_TIEMPO.test(partirConsulta($('#buscar')?.value || '').antes)));
}

// Etiqueta, idioma y «Cambiar de lugar» de la tarjeta ya pintada.
function wireTiempo(){
  const el = document.getElementById('tiempo-tarjeta');
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('tiempo-cambiar')) cambiarLugarTiempo();
    else if (b.classList.contains('tiempo-guardar')){
      if (TIEMPO.ultima && b.getAttribute('aria-disabled') !== 'true') alternarSitio(TIEMPO.ultima);
    }
    else if (b.classList.contains('tiempo-sitio')) abrirSitio(sitioPorClave(b.dataset.k));
    else if (b.classList.contains('tiempo-quitar')) quitarSitio(b.dataset.k);
    else if (b.classList.contains('tiempo-reintentar')) reintentarTiempo();
    else if (b.classList.contains('tiempo-otro')) enfocarBuscador();
    else pulsarPestanaTiempo(b);
  });
  // «Por horas» y los avisos se quedan abiertos o cerrados para la próxima
  // vez (toggle no burbujea: se escucha en la captura).
  el.addEventListener('toggle', e => {
    const clave = e.target.classList?.contains('tiempo-horas') ? TIEMPO_HORAS_KEY
      : e.target.classList?.contains('tiempo-avisos') ? TIEMPO_AVISOS_KEY : null;
    if (!clave) return;
    try { localStorage.setItem(clave, String(e.target.open)); } catch(err){}
  }, true);
  // Una pestaña abierta desde hace rato: al volver, si la previsión tiene
  // más de una hora (lo que la guarda el worker) o es de otro día, se pide
  // de nuevo. Sin temporizadores.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !TIEMPO_ACTIVO) return;
    if (TIEMPO.valor === ''){ pintarSitios(); return; }   // pide solo lo de hace más de una hora
    if (!TIEMPO.ultima || !TIEMPO.lugar) return;
    const h = TIEMPO.pedida;
    if (Date.now() - h < 60 * 60e3 && new Date(h).toDateString() === new Date().toDateString()) return;
    TIEMPO.pedida = Date.now();   // una vez, aunque falle
    mostrarPrevision(TIEMPO.lugar, TIEMPO.valor, { callado: true });
  });
}
// En Mis sitios, los que fallaron; en la tarjeta, renovarla.
function reintentarTiempo(){
  if (TIEMPO.valor === ''){ TIEMPO.fallos.clear(); pintarSitios(); }
  else if (TIEMPO.lugar && TIEMPO.valor) mostrarPrevision(TIEMPO.lugar, TIEMPO.valor, { callado: true });
}
function repintarTiempo(){
  const el = document.getElementById('tiempo-tarjeta');
  if (el && TIEMPO.valor === '' && TIEMPO_ACTIVO) pintarSitios();
  else if (el && TIEMPO.ultima) pintarTiempo(htmlPrevision(TIEMPO.ultima), TIEMPO.ultima);
  if (el) el.setAttribute('aria-label', TIEMPO.valor === '' ? t('tiempoMisSitios') : t('tiempoRegion', { X: TIEMPO.valor || '' }));
}
