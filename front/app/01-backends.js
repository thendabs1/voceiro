/* ═══════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════ */
const REPORT_EMAIL = 'thendabs1@gmail.com';
const REPORT_REPO = 'thendabs1/voceiro';


// ── Backends (switch CF ↔ Deno) ──
const BACKENDS = {
  cf:   { data: 'https://datos.voceiro.eu',
          buscar: 'https://buscar.voceiro.eu' },
  deno: { data: 'https://voceiro-datos.thendabs1.deno.net',
          buscar: 'https://voceiro-buscar.thendabs1.deno.net' },
};
const BACKEND_KEY = 'voceiro-backend-v1';
const BACKEND_TIMEOUT_MANIFEST_MS = 5000;
const BACKEND_TIMEOUT_CF_MS = 10000;
const BACKEND_RECHECK_MS = 5 * 60 * 1000;

let BACKEND_ACTIVO = 'cf';
let DATA_BASE     = BACKENDS.cf.data;
let WORKER_BUSCAR = BACKENDS.cf.buscar;
let _ultimoRecheckCF = 0;
let _conmutacionEnCurso = null;




const PRENSA_CACHE_KEY = 'voceiro-prensa-cache-v1';
const PRENSA_CACHE_TTL_MS = 30 * 60 * 1000;
const PRENSA_DEBOUNCE_MS = 1500;




/* ═══════════════════════════════════════════════════════════════
   SWITCH DE BACKEND (CF ↔ Deno)
   - Al arrancar, intenta el backend guardado (por defecto CF).
   - Si el manifest falla, conmuta al otro backend.
   - Si un fetch falla mid-sesión estando en CF, conmuta a Deno y reintenta.
   - Al volver a la pestaña tras >5 min oculta, re-prueba CF si estamos en Deno.
   ═══════════════════════════════════════════════════════════════ */

function _leerBackendGuardado(){
  try {
    const v = localStorage.getItem(BACKEND_KEY);
    if (v === 'cf' || v === 'deno') return v;
  } catch(e){}
  return 'cf';
}

function _guardarBackend(nombre){
  try { localStorage.setItem(BACKEND_KEY, nombre); } catch(e){}
}

function _aplicarBackend(nombre){
  if (nombre !== 'cf' && nombre !== 'deno') nombre = 'cf';
  BACKEND_ACTIVO = nombre;
  DATA_BASE     = BACKENDS[nombre].data;
  WORKER_BUSCAR = BACKENDS[nombre].buscar;
}

function _otroBackend(){
  return BACKEND_ACTIVO === 'cf' ? 'deno' : 'cf';
}

// Combina un signal externo con timeout si estamos en CF.
function _signalConTimeout(signal, timeoutMs){
  if (BACKEND_ACTIVO !== 'cf' || !timeoutMs) return signal;
  const t = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, t]) : t;
}

// Conmuta al otro backend una sola vez por ráfaga de fallos.
async function _conmutarBackendPorFallo(){
  if (_conmutacionEnCurso) return _conmutacionEnCurso;
  const nuevo = _otroBackend();
  _conmutacionEnCurso = (async () => {
    console.info(`[backend] fallo en ${BACKEND_ACTIVO} → conmutando a ${nuevo}`);
    _aplicarBackend(nuevo);
    _guardarBackend(nuevo);
    setTimeout(() => { _conmutacionEnCurso = null; }, 5000);
  })();
  return _conmutacionEnCurso;
}

// Probe silencioso a CF. No bloquea, no avisa.
async function _probarCFEnBackground(){
  _ultimoRecheckCF = Date.now();
  try {
    const r = await fetch(`${BACKENDS.cf.data}/manifest.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return false;
    // Cuerpo completo dentro del plazo: CF puede dar cabeceras al momento
    // y atascarse después.
    await r.arrayBuffer();
    if (BACKEND_ACTIVO === 'deno'){
      console.info('[backend] CF responde de nuevo → volviendo a CF');
      _aplicarBackend('cf');
      _guardarBackend('cf');
    }
    return true;
  } catch(e){
    return false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (BACKEND_ACTIVO !== 'deno') return;
  if (Date.now() - _ultimoRecheckCF < BACKEND_RECHECK_MS) return;
  _probarCFEnBackground();
});

// Manifest con timeout y fallback automático.
// Devuelve el objeto parseado, o lanza si ambos backends fallan.
async function _fetchManifestConFallback(signal){
  const intentar = async (nombre) => {
    const url = `${BACKENDS[nombre].data}/manifest.json`;
    let sig = signal;
    if (nombre === 'cf'){
      const t = AbortSignal.timeout(BACKEND_TIMEOUT_MANIFEST_MS);
      sig = signal ? AbortSignal.any([signal, t]) : t;
    }
    const r = await fetch(url, { cache: 'no-cache', signal: sig });
    if (!r.ok) throw new Error('manifest HTTP ' + r.status);
    return await r.json();
  };

  const principal = _leerBackendGuardado();
  _aplicarBackend(principal);

  try {
    return await intentar(principal);
  } catch(e){
    if (signal && signal.aborted) throw e;   // abort real del caller
    const otro = principal === 'cf' ? 'deno' : 'cf';
    console.info(`[backend] ${principal} falló (${e.message}) → probando ${otro}`);
    const data = await intentar(otro);
    _aplicarBackend(otro);
    _guardarBackend(otro);
    return data;
  }
}
