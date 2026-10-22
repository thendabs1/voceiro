/* ═══════════════════════════════════════════════════════════════
   CARGA DE DATOS
   ═══════════════════════════════════════════════════════════════ */
let NOTICIAS = [];
let MEDIOS = {};
let MEDIOS_UNICOS = [];
let MEDIOS_STRICT   = new Map();
let DOMINIOS_STRICT = new Map();
let _manifest = null;   // guardamos el manifest para la fase 2

function pintarFechaCabecera(iso){
  const el = document.getElementById('fecha');
  if (!el) return;
  if (!iso) { el.textContent = ''; return; }
  const ts = parseFecha(iso);
  if (isNaN(ts)) { el.textContent = ''; return; }
  try {
    el.textContent = getAbsFmt().format(ts);
  } catch(e){
    el.textContent = new Date(ts).toLocaleString();
  }
}

/* ═══════════════════════════════════════════════════════════════
   FASE 2 · CARGA POR SCOPE
   ═══════════════════════════════════════════════════════════════ */

// Estado de dedup a nivel módulo (compartido entre cargas)
let _urlsCargadas = new Set();
let _titulosCargados = new Set();

// Fuente: 'all' | 'scope'
let _scopeActual = null;

/**
 * Punto de entrada. Reemplaza a cargarPortada().
 * Descarga el manifest, decide el scope y lanza la carga.
 */
let _scopeAbort = null;
let _scopeGeneration = 0;



// ═══════════════════════════════════════════════════════════════
// MODELO BASE + CAPAS
// BASE  = portada (siempre cargada)
// LAYER = slice (grupo o dominio) cargado on-demand
// NOTICIAS = vista materializada (BASE ∪ LAYERS)
// ═══════════════════════════════════════════════════════════════

const BASE = { items: [], cargada: false, generado: '' };

// key: 'grupo:nacional' | 'dominio:elpais.com'
// { items, files: [urls], cargada: ts, lastUse: ts }
const LAYERS = new Map();

const LAYER_MAX_ITEMS = 40000;   // cap de items únicos cargados desde capas
let _itemsCargadosDeCapas = 0;
let _capaEnVuelo = null;

// Índice inverso: url/título → item en NOTICIAS. Para añadir capas sin duplicar.
const _itemPorUrl = new Map();
const _itemPorTitulo = new Map();


/* ── Helpers de merge ── */

function _claveUrl(u, dominio) {
  const full = u.startsWith('http') ? u
             : (u.startsWith('/') ? `https://${dominio || ''}${u}` : u);
  return normalizeUrlForMatch(full);
}

// Los ficheros con hash en el nombre no cambian: force-cache. Los de medio
// (d-<dominio>-<fecha>) se reescriben con el mismo nombre mientras el día
// está vivo: caché normal, con la duración que da el worker (60 s y 304 si
// sigue igual; 1 día los congelados).
async function _fetchJSON(path, signal) {
  const cache = path.startsWith('d-') ? 'default' : 'force-cache';
  const intentar = async () => {
    const url = `${DATA_BASE}/${path}`;
    const sig = _signalConTimeout(signal, BACKEND_TIMEOUT_CF_MS);
    const r = await fetch(url, { cache, signal: sig });
    if (r.status >= 400 && r.status < 500) return null;   // 4xx: no retry
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  };

  try {
    return await intentar();
  } catch(e){
    if (signal && signal.aborted) return null;   // cancelado por el caller
    if (BACKEND_ACTIVO !== 'cf') return null;    // ya en Deno y falla: nada más
    await _conmutarBackendPorFallo();
    try { return await intentar(); } catch { return null; }
  }
}

/**
 * Mergea un slice/portada en NOTICIAS con dedup por URL + título.
 * Devuelve cuántas noticias se añadieron.
 */

function refrescarVistaCompleta(){
  hidratarNoticias();
  construirMediosUnicos();
  construirGruposDuplicados();
  construirIndicesBusqueda();
  reconstruirSelectores();
  aplicarFiltros();
  actualizarFiltrosCount();
  ajRefrescar();   // Ajustes abierto antes de que llegaran los datos
}

// Offset de Europe/Madrid ('+02:00' o '+01:00') para una hora local dada.
// Las HH:MM de los ficheros se escriben en hora de Madrid (recolector _hhmm),
// así que un '+02:00' fijo desplaza 1 h todo lo publicado en horario de
// invierno. Cacheado por día+hora: se llama por cada item al hidratar.
const _OFFSET_MADRID = new Map();
const _FMT_MADRID = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});
function _horaMadridComoUTC(t){
  const p = {};
  for (const x of _FMT_MADRID.formatToParts(new Date(t))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}
function _offsetMadrid(dia, hhmm){
  const clave = dia + 'T' + hhmm;
  const enCache = _OFFSET_MADRID.get(clave);
  if (enCache) return enCache;
  const [y, m, d] = dia.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const local = Date.UTC(y, m - 1, d, h, mi);
  // Candidatos: los offsets de 12 h antes y después (uno a cada lado de un
  // posible cambio de hora) y el del instante corregido. Gana el mayor que
  // reproduce la hora local: en la hora ambigua de octubre es la primera
  // aparición, como zoneinfo con fold=0 en el recolector. Si la hora no
  // existe (marzo), queda el offset de antes del cambio, también como fold=0.
  const offEn = t => _horaMadridComoUTC(t) - t;
  const o1 = offEn(local);
  const o2 = offEn(local - o1);
  const candidatos = [...new Set([
    offEn(local - 12 * 3600e3), offEn(local + 12 * 3600e3), o1, o2,
  ])].sort((a, b) => b - a);
  const ms = candidatos.find(o => _horaMadridComoUTC(local - o) === local) ?? o2;
  const mins = Math.round(ms / 60000);
  const abs = Math.abs(mins);
  const off = (mins >= 0 ? '+' : '-')
            + String(Math.floor(abs / 60)).padStart(2, '0') + ':'
            + String(abs % 60).padStart(2, '0');
  _OFFSET_MADRID.set(clave, off);
  return off;
}

function reconstruirFecha(raw, dia){
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.includes('T') && s.length > 10) return s;
  if (/^\d{2}:\d{2}$/.test(s) && dia){
    return `${dia}T${s}:00${_offsetMadrid(dia, s)}`;
  }
  return s;
}
let _hidratadasHasta = 0;
function hidratarNoticias(){
  const ahora = Date.now();
  const horizonte = ahora + HORIZONTE_FUTURO_MS;

  for (let i = _hidratadasHasta; i < NOTICIAS.length; i++){
    const n = NOTICIAS[i];
    if (n._hidratada) continue;
    n._hidratada = true;
    if (n.dominio === undefined) n.dominio = n.d || '';
    if (n.titular === undefined) n.titular = n.t || '';
    if (n.fuente === undefined) n.fuente = n.f || '';

    // ── URL: path (nuevo) o completa (viejo) ──
        // ── URL: path (nuevo) o completa (viejo) ──
    const u_raw = n.u || '';
    if (u_raw.startsWith('http://') || u_raw.startsWith('https://')){
      n.enlace = u_raw;
    } else if (u_raw.startsWith('/')){
      const m = MEDIOS[n.dominio] || {};
      const host = m.h || `www.${n.dominio}`;
      n.enlace = `https://${host}${u_raw}`;
    } else {
      n.enlace = u_raw;
    }

    // ── Fechas: HH:MM (nuevo) o ISO (viejo) ──
    n.fecha_pub      = reconstruirFecha(n.p, n._dia);
    n.fecha_estimada = reconstruirFecha(n.e, n._dia);
    // `c`: primera recogida. Los ficheros de antes no la traen: el generado.
    n.fecha          = reconstruirFecha(n.c, n._dia) || n._generado || '';

    n.titular = limpiarCdata(n.titular);

    const m = MEDIOS[n.dominio] || {};
    if (n.medio === undefined || !n.medio) n.medio = m.n || '';
    if (n.grupo === undefined || !n.grupo) n.grupo = m.g || '';
    if (n.tipo  === undefined || !n.tipo ) n.tipo  = m.t || '';
    if (n.lang  === undefined || !n.lang ) n.lang  = m.l || '';
    if (!Array.isArray(n.tags) || !n.tags.length) n.tags = m.tags || [];

    n._titularEsc = escapeHtml(n.titular);
    n._medioEsc   = escapeHtml(n.medio);
    n._tipoEsc    = escapeHtml(n.tipo);
    n._grupoEsc   = escapeHtml(n.grupo);
    n._enlaceEsc  = escapeHtml(n.enlace);
    n._esPreset   = false;

    _calcularFechas(n, horizonte);
  }
  _hidratadasHasta = NOTICIAS.length;
}

// Instantes de una noticia ya hidratada. Para ordenar y mostrar vale la
// publicación, la estimada o la recogida; para los filtros de tiempo
// (_tsActualidad), solo la publicación: la estimada sale de la posición en
// la portada y la recogida dice cuándo la vimos, no cuándo se publicó.
function _calcularFechas(n, horizonte){
  const tsPub = parseFecha(n.fecha_pub);
  const tsEst = parseFecha(n.fecha_estimada);
  const tsRec = parseFecha(n.fecha);

  let tsOrden = NaN;
  if (!isNaN(tsPub) && tsPub <= horizonte) tsOrden = tsPub;
  else if (!isNaN(tsEst)) tsOrden = tsEst;
  else if (!isNaN(tsRec)) tsOrden = tsRec;

  let tsShow = NaN;
  let tipoShow = 'none';
  if (!isNaN(tsPub)){ tsShow = tsPub; tipoShow = 'pub'; }
  else if (!isNaN(tsEst)){ tsShow = tsEst; tipoShow = 'est'; }
  else if (!isNaN(tsRec)){ tsShow = tsRec; tipoShow = 'rec'; }

  n._tsOrden      = tsOrden;
  n._tsActualidad = (!isNaN(tsPub) && tsPub <= horizonte) ? tsPub : NaN;
  n._tsShow       = tsShow;
  n._tipoShow     = tipoShow;
  n._esFuturo     = !isNaN(tsPub) && (tsPub > horizonte);
  n._tieneFecha   = !isNaN(tsOrden);
}

// Otra capa (la prensa, el archivo) trae la publicación que aquí faltaba:
// se adopta. La hora corta (HH:MM) es relativa al día de su fichero.
function _adoptarPublicacion(n, otra){
  if (n.p || !otra.p) return;
  const p = reconstruirFecha(otra.p, otra._dia || '');
  if (isNaN(parseFecha(p))) return;
  n.p = p;
  if (!n._hidratada) return;
  n.fecha_pub = p;
  _calcularFechas(n, Date.now() + HORIZONTE_FUTURO_MS);
}

function construirMediosUnicos(){
  MEDIOS_UNICOS = Object.entries(MEDIOS).map(([dominio, m]) => ({
    dominio,
    medio: m.n || '',
    grupo: m.g || '',
    tipo:  m.t || '',
    lang:  m.l || '',
    tags:  Array.isArray(m.tags) ? m.tags : [],
  })).sort((a,b) =>
    a.grupo.localeCompare(b.grupo) || a.medio.localeCompare(b.medio)
  );
}
let _dupsHechosHasta = 0;
let _dupsLogged = false;
function construirGruposDuplicados(){
  let total = 0;
  for (let i = _dupsHechosHasta; i < NOTICIAS.length; i++){
    const n = NOTICIAS[i];
    if (n._dupsHecho) continue;
    n._dupsHecho = true;

    if (Array.isArray(n.a) && n.a.length){
      n._dupHidden = n.a.map(o => {
        const dom = o.d || '';
        const u_raw = o.u || '';
        let enlace;
        if (u_raw.startsWith('http://') || u_raw.startsWith('https://')){
          enlace = u_raw;
        } else if (u_raw.startsWith('/')){
          const m = MEDIOS[dom] || {};
          const host = m.h || `www.${dom}`;
          enlace = `https://${host}${u_raw}`;
        } else {
          enlace = u_raw;
        }
        return {
          dominio: dom,
          medio:   (MEDIOS[dom] && MEDIOS[dom].n) || dom,
          enlace:  enlace,
        };
      });
      total += n.a.length;
    } else {
      n._dupHidden = null;
    }
  }
  _dupsHechosHasta = NOTICIAS.length;

  if (total && !_dupsLogged){
    console.log(`[dups] ${total} noticias referenciadas como 'alt'`);
    _dupsLogged = true;
  }
}

const MEDIOS_POR_NOMBRE = new Map();

function construirIndicesBusqueda(){
  MEDIOS_STRICT.clear();
  DOMINIOS_STRICT.clear();
  MEDIOS_POR_NOMBRE.clear();

  MEDIOS_UNICOS.forEach(m => {
    if (m.medio)   MEDIOS_STRICT.set(normStrict(m.medio), m.medio);
    if (m.dominio) DOMINIOS_STRICT.set(normDomain(m.dominio), m.dominio);
    if (m.medio && m.dominio){
      const clave = normStrict(m.medio);
      // Guarda anti-colisión: nombres de menos de 4 letras no entran
      // (Vox, EFE, ABC... son ambiguos y colisionan con partidos, siglas, etc.)
      if (clave.length >= 4 && !MEDIOS_POR_NOMBRE.has(clave)){
        MEDIOS_POR_NOMBRE.set(clave, m.dominio);
      }
    }
  });
}
