/* ═══════════════════════════════════════════════════════════════
   AUTOCOMPLETE DEL BUSCADOR
   ═══════════════════════════════════════════════════════════════ */
const SUG_STATE = { open: false, items: [], sel: 0 };

function fragmentoActual(raw){
  const trimmed = raw.replace(/\s+$/, '');
  const words = trimmed.split(/\s+/);
  const last = words[words.length - 1] || '';
  const pi = last.indexOf(':');
  if (pi > 0 && /^[a-z]+$/i.test(last.slice(0, pi))){
    return { prefix: last.slice(0, pi).toLowerCase(), text: last.slice(pi + 1) };
  }
  return { prefix: '', text: last };
}

function scoreMatch(haystack, needle){
  if (!haystack || !needle) return 0;
  if (haystack === needle) return 3;
  if (haystack.startsWith(needle)) return 2;
  if (haystack.includes(needle)) return 1;
  return 0;
}

function sugerenciasBuscar(raw){
  // Lo que sigue a una consulta puntual es su valor: nada que sugerir.
  if (partirConsulta(raw).consulta) return [];
  const calendario = sugerenciasCalendario(raw);
  if (calendario) return calendario;
  const stats = sugerenciasEstadisticas(raw);
  if (stats) return stats;
  // eltiempo: sugiere municipios, no medios.
  const fragTiempo = fragmentoTiempo(raw);
  if (fragTiempo !== null) return TIEMPO_ACTIVO ? sugerenciasTiempo(fragTiempo) : [];

  const frag = fragmentoActual(raw);
  const low = normalize(frag.text);
  if (frag.prefix) return [];

  const out = [];

  if (frag.text){
    out.push({
      kind: 'titulo',
      value: frag.text,
      label: `Buscar "${frag.text}" en el titular`,
      tipo: 'texto',
    });
  }

  if (!low) return out;

  const grupos = [...new Set(MEDIOS_UNICOS.map(m => m.grupo).filter(Boolean))];
  const grupoHits = grupos
    .map(g => ({ g, score: scoreMatch(normalize(g), low) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.g.localeCompare(b.g))
    .slice(0, 4);

  grupoHits.forEach(({ g, score }) => {
    const n = MEDIOS_UNICOS.filter(m => m.grupo === g).length;
    out.push({
      kind: 'grupo', value: g, label: g, meta: `${n} medios`,
      tipo: 'grupo', score,
    });
  });

  const medioHits = MEDIOS_UNICOS
    .filter(m => m.medio)
    .map(m => ({ m, score: scoreMatch(normalize(m.medio), low) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.m.medio.localeCompare(b.m.medio))
    .slice(0, 6);

  const yaDominios = new Set();
  medioHits.forEach(({ m, score }) => {
    yaDominios.add(m.dominio);
    out.push({
      kind: 'dominio', value: m.dominio, label: m.medio, meta: m.dominio,
      tipo: 'medio', score,
    });
  });

  const domHits = MEDIOS_UNICOS
    .map(m => ({ m, score: scoreMatch(normalize(m.dominio), low) }))
    .filter(x => x.score > 0 && !yaDominios.has(x.m.dominio))
    .sort((a, b) => b.score - a.score || a.m.dominio.localeCompare(b.m.dominio))
    .slice(0, 4);

  domHits.forEach(({ m, score }) => {
    out.push({
      kind: 'dominio', value: m.dominio, label: m.medio || m.dominio, meta: m.dominio,
      tipo: 'dominio', score,
    });
  });

  return out;
}

function renderSugerencias(items){
  const cont = document.getElementById('buscar-sugerencias');
  if (!cont) return;
  if (!items.length){ cont.style.display = 'none'; return; }

  cont.innerHTML = items.map((s, i) => {
    const cls = 'sug-item'
      + (i === SUG_STATE.sel ? ' sel' : '')
      + (s.score === 3 ? ' exact' : '');
    return `<div class="${cls}" data-idx="${i}">
      <span class="sug-label">${escapeHtml(s.label)}</span>
      ${s.meta ? `<span class="sug-meta">${escapeHtml(s.meta)}</span>` : ''}
      <span class="sug-tipo">${escapeHtml(s.tipo)}</span>
    </div>`;
  }).join('');

  cont.style.display = '';
}

function cerrarSugerencias(){
  SUG_STATE.open = false;
  SUG_STATE.items = [];
  SUG_STATE.sel = 0;
  const c = document.getElementById('buscar-sugerencias');
  if (c) c.style.display = 'none';
}

function abrirSugerencias(items){
  SUG_STATE.open = true;
  SUG_STATE.items = items;
  SUG_STATE.sel = 0;
  renderSugerencias(items);
}

function aplicarSugerencia(idx){
  const s = SUG_STATE.items[idx];
  if (!s) return;
  const input = document.getElementById('buscar');

  if (s.kind === 'calendario'){
    input.value = input.value.replace(/[^\s"]*$/, s.value);
    cerrarSugerencias(); aplicarFiltros(); return;
  }

  if (s.kind === 'estadisticas'){
    input.value = input.value.replace(/(^|\s)(?:estadisticas|stats):(?:"[^"]*|[^\s"]*)$/i, (_, antes) => antes + 'estadisticas:' + s.value);
    consumirOrdenEstadisticas();
    return;
  }
  if (s.kind === 'municipio'){
    // eltiempo:"A Coruña" con el municipio elegido (hay nombres repetidos).
    recordarLugar(s.value, { ine: s.ine });
    const token = /\s/.test(s.value) ? `"${s.value}"` : s.value;
    input.value = input.value.replace(RX_TIEMPO_FINAL, (_, antes, prefijo) => `${antes}${prefijo}${token}`) + ' ';
    cerrarSugerencias();
    input.focus();
    aplicarFiltros();
    return;
  }

  if (s.kind === 'titulo'){
    cerrarSugerencias();
    input.blur();
    aplicarFiltros();
    return;
  }

  // Token a insertar
  let token;
  if (s.kind === 'grupo'){
    token = 'grupo:"' + s.value + '"';
  } else if (s.kind === 'dominio'){
    token = 'web:' + s.value;
  } else {
    token = s.value;
  }

  const raw = input.value.replace(/\s+$/, '');
  const palabrasInput = raw ? raw.split(/\s+/) : [];
  const palabrasLabel = (s.label || '').split(/\s+/).filter(Boolean);

  // Buscar la coincidencia más larga entre el final del input
  // y el principio del label. Ej: input="diario de arousa", label="Diario de Arousa"
  // → match de 3 palabras → reemplazamos las 3 por el token.
  let mejorMatch = 0;
  const maxN = Math.min(palabrasLabel.length, palabrasInput.length);
  for (let n = maxN; n >= 1; n--){
    const tail = palabrasInput.slice(-n).join(' ');
    const head = palabrasLabel.slice(0, n).join(' ');
    if (normalize(tail) === normalize(head)){
      mejorMatch = n;
      break;
    }
  }

  let nuevoRaw;
  if (mejorMatch > 0){
    const antes = palabrasInput.slice(0, -mejorMatch).join(' ');
    nuevoRaw = antes ? antes + ' ' + token : token;
  } else {
    // Fallback: reemplaza solo la última palabra (comportamiento anterior)
    const idxUlt = raw.lastIndexOf(' ');
    const antes = idxUlt >= 0 ? raw.slice(0, idxUlt + 1) : '';
    nuevoRaw = antes + token;
  }

  input.value = nuevoRaw + ' ';
  cerrarSugerencias();
  input.focus();
  aplicarFiltros();
}
// Las sugerencias normales empiezan por «Buscar en el titular» y se abren
// con 2 o más; las de municipios, con una basta.
const haySugerencias = items => items.length > 1 || ['municipio', 'estadisticas'].includes(items[0]?.kind);

function wireAutocomplete(){
  const input = document.getElementById('buscar');
  const cont  = document.getElementById('buscar-sugerencias');
  if (!input || !cont) return;

  input.addEventListener('input', () => {
    const items = sugerenciasBuscar(input.value);
    if (haySugerencias(items)) abrirSugerencias(items);
    else cerrarSugerencias();
  });

  input.addEventListener('keydown', e => {
    if (!SUG_STATE.open){
      if (e.key === 'ArrowDown'){
        const items = sugerenciasBuscar(input.value);
        if (haySugerencias(items)){ abrirSugerencias(items); e.preventDefault(); }
      }
      return;
    }

    if (e.key === 'ArrowDown'){
      SUG_STATE.sel = (SUG_STATE.sel + 1) % SUG_STATE.items.length;
      renderSugerencias(SUG_STATE.items);
      e.preventDefault();
    } else if (e.key === 'ArrowUp'){
      SUG_STATE.sel = (SUG_STATE.sel - 1 + SUG_STATE.items.length) % SUG_STATE.items.length;
      renderSugerencias(SUG_STATE.items);
      e.preventDefault();
    } else if (e.key === 'Enter'){
      const s = SUG_STATE.items[SUG_STATE.sel];
      if (s && s.kind !== 'titulo'){
        aplicarSugerencia(SUG_STATE.sel);
        e.preventDefault();
      } else {
        cerrarSugerencias();
      }
    } else if (e.key === 'Tab'){
      aplicarSugerencia(SUG_STATE.sel);
      e.preventDefault();
    } else if (e.key === 'Escape'){
      cerrarSugerencias();
      e.preventDefault();
    }
  });

  cont.addEventListener('mousedown', e => {
    const item = e.target.closest('.sug-item');
    if (!item) return;
    e.preventDefault();
    aplicarSugerencia(parseInt(item.dataset.idx, 10));
  });

  cont.addEventListener('mousemove', e => {
    const item = e.target.closest('.sug-item');
    if (!item) return;
    const idx = parseInt(item.dataset.idx, 10);
    if (SUG_STATE.sel !== idx){
      SUG_STATE.sel = idx;
      renderSugerencias(SUG_STATE.items);
    }
  });

  input.addEventListener('blur', () => setTimeout(cerrarSugerencias, 120));

  input.addEventListener('focus', () => {
    if (input.value.trim()){
      const items = sugerenciasBuscar(input.value);
      if (haySugerencias(items)) abrirSugerencias(items);
    }
  });
}
