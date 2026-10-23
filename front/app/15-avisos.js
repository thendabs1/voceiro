/* ═══════════════════════════════════════════════════════════════
   AVISOS (alertas:)
   Panel encima de la lista (la pestaña Avisos del panel del tiempo). Los
   de mis sitios salen en su tarjeta y en Mis sitios, y colorean el sol de
   la cabecera si son naranjas o rojos (ajuste «Avisos en el sol», puesto
   por defecto). Los da el worker de Deno (/avisos): AEMET y, si falla,
   MeteoAlarm. Solo se piden con alertas:, con el panel del tiempo o con
   sitios guardados que tengan zona, y entonces cada 15 min con la página
   a la vista; con el tiempo desactivado, nunca. Nombres, filtro y grupos
   en shared/tiempo/avisos.js; allí, la nota sobre «noticias relacionadas».
   ═══════════════════════════════════════════════════════════════ */
const AVISOS_CADA = 15 * 60e3;
// pintada y pintadaTiempo: la firma con la que se pintaron el panel y la
// tarjeta (o Mis sitios).
const AVISOS = { datos: null, pedido: 0, carga: null, error: false, valor: null, pintada: '', pintadaTiempo: '' };
const AVISOS_CABECERA_KEY = 'voceiro-avisos-sol';
let AVISOS_CABECERA = (() => {
  try { return localStorage.getItem(AVISOS_CABECERA_KEY) !== 'false'; } catch(e){ return true; }
})();

// Una petición a la vez; si lo que hay tiene menos de 15 min, sirve. Tras
// un fallo se reintenta al minuto, no a cada tecla.
function pedirAvisos(){
  if (AVISOS.carga) return AVISOS.carga;
  if (Date.now() - AVISOS.pedido < (AVISOS.error ? 60e3 : AVISOS_CADA)) return Promise.resolve(AVISOS.datos);
  AVISOS.carga = pedirTiempo('/avisos')
    .then(d => { AVISOS.datos = d; AVISOS.error = false; return d; })
    .catch(() => { AVISOS.error = true; return AVISOS.datos; })
    .finally(() => { AVISOS.pedido = Date.now(); AVISOS.carga = null; });
  return AVISOS.carga;
}
const avisosVigentes = () => (AVISOS.datos?.avisos || []).filter(a => Date.parse(a.fin) > Date.now());
// Lo que cambia el panel: datos nuevos, avisos que caducan o empiezan y
// el día («hoy», «mañana»).
function firmaAvisos(){
  const v = avisosVigentes();
  return [AVISOS.datos?.consultado, AVISOS.error, v.length, v.filter(a => empezado(a)).length,
    new Date().toDateString()].join('|');
}

// Panel, tarjeta y Mis sitios se repintan solo si cambió lo que mostraban.
async function refrescarAvisos(){
  const enSitios = AVISOS_CABECERA && sitiosTiempo().some(s => s.zona);
  const enTiempo = TIEMPO.valor === '' || !!TIEMPO.ultima?.zonaAviso;
  if (!TIEMPO_ACTIVO || document.hidden || (!enSitios && !enTiempo && AVISOS.valor == null)) return;
  await pedirAvisos();
  pintarBotonTiempo();
  const firma = firmaAvisos();
  if (AVISOS.valor != null && firma !== AVISOS.pintada) pintarAvisos();
  if (enTiempo && firma !== AVISOS.pintadaTiempo){
    AVISOS.pintadaTiempo = firma;
    repintarTiempo();
  }
}

// null: sin panel; '': toda España; si no, el filtro (Galicia, lluvia…).
function actualizarAlertas(valor){
  if (valor === AVISOS.valor) return;
  AVISOS.valor = valor;
  pintarAvisos();
}

async function pintarAvisos(){
  const el = document.getElementById('avisos-panel');
  if (!el) return;
  const valor = AVISOS.valor;
  el.hidden = valor === null;
  if (valor === null){ el.innerHTML = ''; return; }
  if (!TIEMPO_ACTIVO){ el.innerHTML = msgTiempo('avisosDesactivado'); return; }
  if (!AVISOS.datos) el.innerHTML = msgTiempo('avisosCargando');
  await pedirAvisos();
  if (AVISOS.valor !== valor) return;
  pintarBotonTiempo();
  if (AVISOS.datos) pintarPanelAvisos(el, htmlAvisos(valor));
  else el.innerHTML = msgTiempo('avisosError');
}

// Lo desplegado sigue desplegado tras repintar.
function pintarPanelAvisos(el, html){
  const abiertos = new Set([...el.querySelectorAll('details[open]')].map(d => d.dataset.k));
  el.innerHTML = html;
  el.querySelectorAll('details[data-k]').forEach(d => { if (abiertos.has(d.dataset.k)) d.open = true; });
  AVISOS.pintada = firmaAvisos();
}

// Para alertas:lluvia o alertas:naranja, en el idioma de la página y en castellano.
function nombresAvisos(){
  const ambos = clave => [t(clave), I18N.es[clave]];
  return {
    fen: Object.fromEntries(FENOMENOS.map(f => [f, ambos('avisoFen' + f)])),
    nivel: Object.fromEntries(NIVELES.map(n => [n, ambos('avisoNivel' + n)])),
  };
}

// «hoy», «mañana» o «jue», en la hora del sitio (Canarias, una menos).
const fechaAviso = (ms, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
function diaAviso(ms, timeZone){
  const dias = Math.round((Date.parse(fechaAviso(ms, timeZone)) - Date.parse(fechaAviso(Date.now(), timeZone))) / 864e5);
  return dias === 0 ? t('avisosHoy') : dias === 1 ? t('avisosManana')
    : new Intl.DateTimeFormat((ACCES && ACCES.lang) || 'es', { timeZone, weekday: 'short' }).format(ms);
}
// Sin horas, para los títulos: «en vigor» o el día en que empieza.
const momentoAviso = a => (empezado(a) ? t('avisosAhora').toLocaleLowerCase() : diaAviso(Date.parse(a.inicio), zonaHorariaAviso(a.zona)));

// «En vigor · hasta mañana 17:59» o «jue 06:00 – 23:59», en la hora del
// sitio; una comunidad con huecos entre sus avisos, «varios periodos» (las
// horas, dentro). Devuelve HTML: las horas, en negrita.
function cuandoAviso(a){
  const lang = (ACCES && ACCES.lang) || 'es';
  const timeZone = zonaHorariaAviso(a.zona);
  const fecha = ms => fechaAviso(ms, timeZone);
  const hora = ms => `<b class="aviso-hora">${escapeHtml(new Intl.DateTimeFormat(lang, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms))}</b>`;
  const hoy = fecha(Date.now());
  const dia = ms => escapeHtml(diaAviso(ms, timeZone));
  const ahora = `<span class="aviso-ahora">${escapeHtml(t('avisosAhora'))}</span> · `;
  if (a.varios){
    const varios = t('avisosVarios');
    return empezado(a) ? ahora + escapeHtml(varios) : escapeHtml(varios.charAt(0).toLocaleUpperCase() + varios.slice(1));
  }
  const ini = Date.parse(a.inicio), fin = Date.parse(a.fin);
  const hasta = fecha(fin) === hoy ? hora(fin) : `${dia(fin)} ${hora(fin)}`;
  if (empezado(a)) return ahora + escapeHtml(t('avisosHasta', { h: '\u0000' })).replace('\u0000', hasta);
  return `${dia(ini)} ${hora(ini)} – ${fecha(fin) === fecha(ini) ? hora(fin) : `${dia(fin)} ${hora(fin)}`}`;
}

const nombreFen = fen => (I18N.es['avisoFen' + fen] ? t('avisoFen' + fen) : fen);

// Una zona dentro de su comunidad: fenómeno y zona; el nivel, solo si no
// es el de la línea (el borde lo acompaña siempre).
function htmlAviso(a, g){
  const lang = (ACCES && ACCES.lang) || 'es';
  const texto = a.texto ? (lang === 'en' && a.texto.en) || a.texto.es : '';
  return `<li class="aviso-zona" data-nivel="${escapeHtml(a.nivel)}">
    ${a.nivel !== g.nivel ? `<span class="aviso-nivel">${escapeHtml(t('avisoNivel' + a.nivel))}</span>` : ''}${escapeHtml(nombreFen(a.fen))} · <strong>${escapeHtml(a.area || '')}</strong>
    <span class="aviso-cuando">${cuandoAviso(a)}</span>
    ${texto ? `<p class="aviso-texto">${escapeHtml(texto)}</p>` : ''}
  </li>`;
}

// «[GALICIA] Naranja Lluvias · Amarillo Vientos, Costeros · 3 zonas / En
// vigor · hasta 18:00»; al desplegarla, todas sus zonas con su texto.
function htmlGrupoAvisos(g, seccion){
  const niveles = g.niveles.map(n => `<span class="aviso-nivel">${escapeHtml(t('avisoNivel' + n.nivel))}</span>`
    + escapeHtml(n.fens.map(nombreFen).join(', '))).join(' · ');
  const donde = g.zonas === 1 ? g.avisos[0].area : t('avisosZonas', { n: g.zonas });
  return `<li><details class="aviso" data-nivel="${escapeHtml(g.nivel)}" data-k="${escapeHtml(seccion + '|' + g.clave)}">
    <summary><span class="aviso-ccaa">${escapeHtml(g.comunidad || g.clave)}</span>${niveles} · ${escapeHtml(donde || '')}
      <span class="aviso-cuando">${cuandoAviso(g)}</span></summary>
    <ul class="aviso-zonas">${g.avisos.map(a => htmlAviso(a, g)).join('')}</ul>
  </details></li>`;
}

// Una línea por comunidad con algún naranja o rojo, con sus amarillos
// dentro; las comunidades con solo amarillos, en una línea plegada (abierta
// si se ha filtrado: alertas:Galicia).
function htmlAvisos(valor){
  const d = AVISOS.datos;
  const lista = filtrarAvisos(avisosVigentes(), valor, nombresAvisos());
  const todos = agruparAvisos(lista);
  const graves = todos.filter(g => g.nivel !== 'amarillo');
  const amarillos = todos.filter(g => g.nivel === 'amarillo');
  const comunidades = amarillos.map(g => g.comunidad);
  const grupos = (graves.length ? `<ul class="avisos-lista">${graves.map(g => htmlGrupoAvisos(g, 'g')).join('')}</ul>` : '')
    + (amarillos.length ? `<details class="avisos-amarillos" data-k="amarillos"${valor ? ' open' : ''}>
        <summary>${escapeHtml(t('avisosAmarillos', { n: amarillos.reduce((n, g) => n + g.avisos.length, 0) }))}
          · ${escapeHtml(comunidades.slice(0, 3).join(', ') + (comunidades.length > 3 ? '…' : ''))}</summary>
        <ul class="avisos-lista">${amarillos.map(g => htmlGrupoAvisos(g, 'a')).join('')}</ul></details>` : '');
  return `${htmlPestanasTiempo('avisos')}<div class="tiempo-cab"><strong>${escapeHtml(t('avisosTitulo'))}</strong>${valor ? `<span>${escapeHtml(valor)}</span>` : ''}</div>
    ${lista.length ? grupos : msgTiempo(valor ? 'avisosNingunoX' : 'avisosNinguno', { X: valor })}
    <div class="tiempo-pie">${pieAvisos(d)}</div>`;
}

// Fuente, hora de la consulta y lo que falta (MeteoAlarm) o falló.
function pieAvisos(d){
  const enlace = /^https:\/\//.test(d.enlace || '') ? d.enlace : '';
  const fuente = d.fuente === 'aemet' ? 'AEMET' : 'MeteoAlarm';
  const consultado = new Date(d.consultado);
  return `${escapeHtml(t('tiempoFuente'))}: `
    + (enlace ? `<a href="${escapeHtml(enlace)}" target="_blank" rel="noopener">${fuente}</a>` : fuente)
    + (isNaN(consultado) ? '' : ' · ' + escapeHtml(t('avisosConsultado', {
        h: consultado.toLocaleTimeString((ACCES && ACCES.lang) || 'es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })))
    + (d.incompleto ? ' · ' + escapeHtml(t('avisosIncompleto')) : '')
    + (AVISOS.error ? ' · ' + escapeHtml(t('avisosError')) : '');
}

function wireAvisos(){
  document.getElementById('btn-tiempo')?.addEventListener('click', abrirTiempo);
  document.getElementById('avisos-panel')?.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) pulsarPestanaTiempo(b);
  });
  // Cada minuto se quitan los caducados (sin red); la petición, cada 15. Sin
  // panel ni sitios con zona no hace nada.
  setInterval(refrescarAvisos, 60e3);
  document.addEventListener('visibilitychange', refrescarAvisos);
  setTimeout(refrescarAvisos, 2000);
}
function repintarAvisos(){
  const el = document.getElementById('avisos-panel');
  if (el) el.setAttribute('aria-label', t('avisosRegion'));
  pintarBotonTiempo();
  if (AVISOS.valor != null && AVISOS.datos) pintarPanelAvisos(el, htmlAvisos(AVISOS.valor));
}
