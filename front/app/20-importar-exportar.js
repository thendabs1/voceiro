/* ═══════════════════════════════════════════════════════════════
   IMPORT / EXPORT
   ═══════════════════════════════════════════════════════════════ */
const FONT_MAP_TO_LECTOR = { serif: 'georgia', sans: 'sans', dyslexic: 'dyslexic' };
const FONT_MAP_FROM_LECTOR = { georgia: 'serif', serif: 'serif', sans: 'sans', dyslexic: 'dyslexic' };

function detectarFormato(data){
  if (!data || typeof data !== 'object') return 'invalid';
  if (data._app === 'voceiro') return 'voceiro';
  if (Array.isArray(data.sites) || data.prefs || Array.isArray(data.disabledDomains)) return 'userscript';
  if (data.acces || data.preset) return 'voceiro';
  return 'unknown';
}

function exportarConfig(){
  const sitesArr = [...SITES.entries()].map(([d, s]) => ({
    domain: d,
    lang: s.lang || 'auto',
    type: s.type || '',
    tags: s.tags || [],
    ignorePatterns: [],
    readerSource: 'auto',
    textOnly: false
  }));

  const lectorPrefs = {
    fs: ACCES.fs,
    theme: ACCES.tema,
    width: ACCES.width,
    font: FONT_MAP_TO_LECTOR[ACCES.fuente] || 'sans',
    lh: 1.7,
    just: ACCES.just,
    bionic: ACCES.bionic,
    focus: ACCES.focus,
    img: true,
    panelText: true,
    panelActions: false,
  };

  const payload = {
    _app: 'voceiro',
    _version: 5,
    _format: 'combo',
    _exported: new Date().toISOString(),
    acces: ACCES,
    preset: PRESET,
    presetActivo: PRESET_ACTIVO,
    _lectorVersion: '1.1.0',
    lang: ACCES.lang,
    sites: sitesArr,
    voceiro: { presets: PRESETS.lista },
    prefs: lectorPrefs,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `voceiro-config-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(t('expOk'), 1800);
}


function importarDesdeFormatoVoceiro(data){
  if (data.acces && typeof data.acces === 'object'){
    ACCES = { ...ACCES_DEF, ...data.acces };
    if (!I18N[ACCES.lang]) ACCES.lang = 'es';
    guardarAcces();
  }

  if (Array.isArray(data.sites)){
    setSitesFromArray(data.sites);
    guardarSitesCache();
  }

  if (data.voceiro && Array.isArray(data.voceiro.presets) && data.voceiro.presets.length){
    const lista = data.voceiro.presets.map(normalizarPreset);
    PRESETS = { lista, activo: lista[0].id };
    PRESET = PRESETS.lista[0];
    guardarPresets();
    recompilarPreset();
  }

  if (typeof data.presetActivo === 'boolean'){
    PRESET_ACTIVO = data.presetActivo && presetTieneReglas();
  } else {
    PRESET_ACTIVO = presetTieneReglas();
  }
  guardarPresetActivo();
}

function importarDesdeFormatoLector(data){
  if (data.prefs && typeof data.prefs === 'object'){
    const p = data.prefs;
    if (['light','sepia','dark','contrast'].includes(p.theme)) ACCES.tema = p.theme;
    if (FONT_MAP_FROM_LECTOR[p.font]) ACCES.fuente = FONT_MAP_FROM_LECTOR[p.font];
    if (typeof p.fs === 'number' && p.fs >= LIM.fs.min && p.fs <= LIM.fs.max) ACCES.fs = p.fs;
    if (typeof p.width === 'number'){
      ACCES.width = Math.max(LIM.width.min, Math.min(LIM.width.max, p.width));
    }
    if (typeof p.just === 'boolean') ACCES.just = p.just;
    if (typeof p.bionic === 'boolean') ACCES.bionic = p.bionic;
    if (typeof p.focus === 'boolean') ACCES.focus = p.focus;
  }
  if (typeof data.lang === 'string' && I18N[data.lang]) ACCES.lang = data.lang;
  guardarAcces();

  const known = new Set(MEDIOS_UNICOS.map(m => m.dominio));
  const arr = [];
  (data.sites || []).forEach(s => {
    if (!s || !s.domain) return;
    const d = String(s.domain).toLowerCase().trim();
    if (!known.has(d)) return;
    arr.push({
      domain: d,
      lang: s.lang || 'auto',
      type: s.type || '',
      tags: s.tags || []
    });
  });
  (data.disabledDomains || []).forEach(d0 => {
    const d = String(d0).toLowerCase().trim();
    if (!known.has(d)) return;
    if (!arr.some(x => x.domain === d)){
      arr.push({
        domain: d,
        lang: 'auto',
        type: '',
        tags: []
      });
    }
  });
  setSitesFromArray(arr);
  guardarSitesCache();
  if (data.voceiro && Array.isArray(data.voceiro.presets) && data.voceiro.presets.length){
    const lista = data.voceiro.presets.map(normalizarPreset);
    PRESETS = { lista, activo: lista[0].id };
    PRESET = PRESETS.lista[0];
    guardarPresets();
    recompilarPreset();
  }
  PRESET_ACTIVO = presetTieneReglas();
  guardarPresetActivo();
}

function importarConfig(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') throw new Error('JSON inválido');
      if (!confirm(t('impConfirm'))) return;

      const formato = detectarFormato(data);
      let msgOk = t('impOk');

      if (formato === 'voceiro' || formato === 'combo'){
        importarDesdeFormatoVoceiro(data);
        msgOk = t('impFromVoceiro');
      } else if (formato === 'userscript'){
        importarDesdeFormatoLector(data);
        msgOk = t('impFromLector');
      } else {
        throw new Error('Formato no reconocido');
      }

      aplicarAcces();
      aplicarTextos();
      reconstruirSelectores();
      construirIndicesBusqueda();
      actualizarBotonPreset();
      ajRefrescar();
      aplicarFiltros();
      toast(msgOk, 2400);
    }catch(e){
      toast(t('impErr', { msg: e.message || String(e) }), 3000);
    }
  };
  reader.onerror = () => toast(t('impErr', { msg: 'read error' }), 3000);
  reader.readAsText(file);
}
