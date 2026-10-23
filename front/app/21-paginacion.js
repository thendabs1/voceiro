// ── Paginación R2 + Turso ──
let DIAS_ACTUAL = 0;               // días cargados vía R2 para la query actual
let DIAS_CAPAS_KEY = '';            // las capas a las que pertenece ese contador
const DIAS_R2_STEP = 30;           // días por click en "Cargar más"
// Sin tope: se extiende hasta agotar el manifest.

function claveCapas(capas){ return [...capas].sort().join('|'); }

function ajustarDiasActual(capas){
  const clave = claveCapas(capas);
  const total = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
  if (clave !== DIAS_CAPAS_KEY){
    DIAS_CAPAS_KEY = clave;
    DIAS_ACTUAL = clave ? Math.min(DIAS_MEMORIA, total) : 0;
  } else {
    DIAS_ACTUAL = clave ? Math.min(Math.max(DIAS_ACTUAL, Math.min(DIAS_MEMORIA, total)), total) : 0;
  }
}

let TURSO_OFFSET = 0;              // próximo offset a pedir
let TURSO_HAY_MAS = false;
let TURSO_ACTIVO = false;          // true cuando ya estamos paginando Turso
let TURSO_RAW = '';                // raw con el que se pagina Turso (puede llevar cutoff)
// El archivo se consulta tras una pausa sin cambios (regla 3), no en cada
// pausa del debounce al teclear: menos peticiones y menos respuestas tiradas.
const ARCHIVO_PAUSA_MS = 700;
// TEMPORAL (13-10-2026): Turso sin cuota de lecturas. Con false no se pide
// nada al archivo (ni búsqueda ni «Cargar más»); lo cargado, R2 y la prensa
// siguen igual. Volver a true cuando se restablezca la cuota.
const ARCHIVO_ACTIVO = false;
let _archivoTimer = null;
let ULT_QUERY_KEY = '';            // para detectar cambio de query
let _cargandoMas  = false;

async function buscarEnWorker(rawQuery, { offset = 0, limit = 50 } = {}) {
  const params = new URLSearchParams();
  params.set('raw', rawQuery || '');
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  params.set('fuentes', 'turso');

  const mapear = (data) => ({
    items: (data.items || []).map(it => ({
      u: it.u, d: it.d, t: it.t, p: it.p, e: it.e, f: it.f || 'TURSO',
      _src: 'turso',
    })),
    total: data.total || 0,
    nextOffset: data.next_offset ?? null,
  });

  const intentar = async () => {
    const sig = _signalConTimeout(null, BACKEND_TIMEOUT_CF_MS);
    const r = await fetch(`${WORKER_BUSCAR}/buscar?${params}`, { signal: sig });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  };

  try {
    const data = await intentar();
    _avisarErroresFuente(data);
    return mapear(data);
  } catch(e) {
    if (e.name !== 'AbortError') console.warn('[worker]', e.message);
    if (BACKEND_ACTIVO === 'cf' && e.name !== 'AbortError'){
      await _conmutarBackendPorFallo();
      try {
        const data = await intentar();
        _avisarErroresFuente(data);
        return mapear(data);
      } catch(e2){ /* fall through */ }
    }
    return { items: [], total: 0, nextOffset: null };
  }
}
