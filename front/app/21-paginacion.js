// ── Paginación R2 ──
let DIAS_ACTUAL = 0;               // días cargados vía R2 para la query actual
let DIAS_CAPAS_KEY = '';            // las capas a las que pertenece ese contador
const DIAS_R2_STEP = 7;            // días por pulsación del histórico de un medio
let DIAS_GENERACION = 0;
let HISTORICO_ERROR = false;
// Sin tope: se extiende hasta agotar el manifest.

function claveCapas(capas){ return [...capas].sort().join('|'); }

// Solo un medio elegido explícitamente; los grupos y modos conservan su
// carga inicial, pero no ofrecen ampliar todo su archivo.
function capasHistorico(parsed, consulta = ULT_CTX && ULT_CTX.consulta){
  const dominios = consulta && consulta.medios.dominios;
  if (!((parsed.medios || []).length || (parsed.dominios || []).length)
      || !dominios || dominios.size !== 1) return new Set();
  return new Set(['dominio:' + [...dominios][0]]);
}

function ajustarDiasActual(capas){
  const clave = claveCapas(capas);
  const total = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
  if (clave !== DIAS_CAPAS_KEY){
    DIAS_GENERACION++;
    HISTORICO_ERROR = false;
    DIAS_CAPAS_KEY = clave;
    DIAS_ACTUAL = clave ? Math.min(DIAS_MEMORIA, total) : 0;
  } else {
    DIAS_ACTUAL = clave ? Math.min(Math.max(DIAS_ACTUAL, Math.min(DIAS_MEMORIA, total)), total) : 0;
  }
}

let _cargandoMas  = false;
