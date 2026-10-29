/* ═══════════════════════════════════════════════════════════════
   HELPERS DE UNIFICACIÓN DE FILTROS
   Los selectores del panel escriben tokens en #buscar. #buscar es
   el estado único. aplicarFiltros lee solo de parseQuery.
   ═══════════════════════════════════════════════════════════════ */

// Una consulta puntual sin comillas toma el resto de la línea
// (shared/parser.js): lo que se añada a la búsqueda va delante de ella.
function partirConsulta(raw) {
  const tk = tokenizeQuery(raw).find(x => x.resto);
  if (!tk) return { antes: raw, consulta: '' };
  const linea = raw.trimEnd();
  return { antes: linea.slice(0, linea.length - tk.raw.length), consulta: tk.raw };
}

// Reescribe #buscar: quita todos los tokens del prefijo indicado
// y añade uno nuevo si `value` es no vacío. Devuelve el nuevo string.
function rebuildInput(raw, prefix, value) {
  const { antes, consulta } = partirConsulta(raw);
  const tokens = tokenizeQuery(antes);
  const kept = tokens.filter(tk => (tk.prefix || '').toLowerCase() !== prefix);
  const parts = kept.map(tk => tk.raw);
  if (value !== null && value !== '' && value !== undefined) {
    const necesitaComillas = /\s/.test(value);
    parts.push(prefix + ':' + (necesitaComillas ? '"' + value + '"' : value));
  }
  if (consulta) parts.push(consulta);
  return parts.join(' ');
}

// Aplica un cambio desde un selector al input y refiltra.
function writeFilterToInput(prefix, value) {
  aplicarFiltrosDebounced.cancel();
  const nuevo = rebuildInput($('#buscar').value, prefix, value);
  $('#buscar').value = nuevo;
  const clearBtn = $('#buscar-clear');
  if (clearBtn) clearBtn.hidden = !nuevo;
  aplicarFiltros();
}

// Clic en el nombre del medio de una tarjeta: afina la búsqueda actual a
// ese medio. Se conservan el texto, las fechas y el resto de filtros; los
// filtros de medio (medio:, web:, grupo:, y un dominio escrito suelto) se
// sustituyen por web:<dominio>.
function filtrarPorMedio(dominio) {
  if (!dominio) return;
  aplicarFiltrosDebounced.cancel();
  const { antes: raw, consulta } = partirConsulta($('#buscar').value);
  const deMedio = new Set(parseQuery(raw).chips
    .filter(ch => ch.type === 'medio' || ch.type === 'dominio' || ch.type === 'grupo')
    .map(ch => ch.raw));
  const parts = tokenizeQuery(raw).filter(tk => !deMedio.has(tk.raw)).map(tk => tk.raw);
  parts.push('web:' + dominio);
  if (consulta) parts.push(consulta);
  const nuevo = parts.join(' ');
  $('#buscar').value = nuevo;
  const clearBtn = $('#buscar-clear');
  if (clearBtn) clearBtn.hidden = !nuevo;
  aplicarFiltros();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Lee de parsed el primer valor de un prefijo (o null).
// parsed.grupos → prefijo 'grupo'; parsed.tipos → 'tipo'; parsed.order → 'order' (string)
function getParsedFirst(parsed, prefix) {
  switch (prefix) {
    case 'grupo':  return parsed.grupos[0] || null;   // normalizado
    case 'tipo':   return parsed.tipos[0]  || null;   // normalizado
    case 'lang':   return parsed.lang[0]   || null;   // normalizado
    case 'desde':  return parsed.desde     || null;   // ISO
    case 'hasta':  return parsed.hasta     || null;   // ISO
    case 'order':  return (parsed.order && parsed.order !== 'recientes') ? parsed.order : null;
    default:       return null;
  }
}
// Sincroniza los controles del panel con el estado de parsed.
// No dispara 'change' (usa .value = ...), así que no rebota.
function syncPanelFromParsed(parsed) {
  // Grupo: parsed.grupos[0] está normalizado ("espananacionales").
  // El select tiene valores display ("España · Nacionales"). Buscamos por normStrict.
  const gVal = getParsedFirst(parsed, 'grupo');
  const selG = $('#grupo');
  if (selG) {
    let match = '';
    if (gVal) {
      for (const opt of selG.options) {
        if (opt.value && normStrict(opt.value) === gVal) { match = opt.value; break; }
      }
    }
    if (selG.value !== match) selG.value = match;
  }

  // Tipo: parsed.tipos[0] normalizado, opciones display.
  const tVal = getParsedFirst(parsed, 'tipo');
  const selT = $('#tipo');
  if (selT) {
    let match = '';
    if (tVal) {
      for (const opt of selT.options) {
        if (opt.value && normStrict(opt.value) === tVal) { match = opt.value; break; }
      }
    }
    if (selT.value !== match) selT.value = match;
  }

  // Orden
  const oVal = getParsedFirst(parsed, 'order') || 'recientes';
  const selO = $('#orden');
  if (selO && selO.value !== oVal) selO.value = oVal;

  // Fechas (los <input type="date">)
  // NOTA: aquí SOLO sincronizamos valores. Los listeners 'change' van
  // en wireStaticEvents, porque esta función se llama en cada aplicarFiltros
  // y acumularía listeners (uno por tecla).
  const desde = getParsedFirst(parsed, 'desde') || '';
  const hasta = getParsedFirst(parsed, 'hasta') || '';
  const fD = $('#fecha-desde');
  const fH = $('#fecha-hasta');
  if (fD && fD.value !== desde) fD.value = desde;
  if (fH && fH.value !== hasta) fH.value = hasta;

  // Rango: «24 h» y «48 h» son exactamente desde:24h y desde:48h. Otro desde
  // (hoy, ayer, 2d, una fecha) no es una ventana móvil: el selector, en «Todo».
  const selR = $('#rango');
  if (selR) {
    // parsed.desde ya es un día: se mira lo escrito (gana el último desde:).
    const chD = (parsed.chips || []).filter(ch => ch.type === 'desde').pop();
    const vD = chD ? String(chD.value).toLowerCase() : '';
    const rMatch = vD === '24h' ? '1' : vD === '48h' ? '2' : '';
    if (selR.value !== rMatch) selR.value = rMatch;
  }
}

/* ═══════════════════════════════════════════════════════════════
   PREPROCESAR INPUT
   El parser shared no conoce el catálogo (MEDIOS_POR_NOMBRE) — es
   frontend-only. Aquí convertimos palabras sueltas que coincidan con
   un medio del catálogo a su token canónico "web:dominio", antes de
   pasarlas al parser. Así "elpais" funciona igual que "web:elpais.com".
   ═══════════════════════════════════════════════════════════════ */
function preprocesarInput(raw) {
  if (!raw) return raw;
  const tokens = tokenizeQuery(raw);
  const out = [];
  for (const tk of tokens) {

    // ── NUEVO: medio:elpais → web:elpais.com ──
    // Convierte el prefijo medio: en su dominio canónico. Así
    // el worker lo trata como dominio (que ya soporta OR via IN).
    if (tk.prefix === 'medio' || tk.prefix === 'medios'){
      const strict = normStrict(tk.text);
      const dom = MEDIOS_POR_NOMBRE.get(strict);
      if (dom){ out.push('web:' + dom); continue; }
      // si no hay match, cae al push normal (queda como medio:foo)
    }

    // Las palabras sueltas se quedan como texto. Antes, cualquier palabra
    // de 4+ letras que fuera prefijo de un medio se convertía en web:dominio
    // ('economia', 'madrid', 'vigo'…), y 'crisis economia' buscaba solo en
    // un medio. Para filtrar por medio: medio:X, web:X o el autocompletado.
    out.push(tk.raw);
  }
  return out.join(' ');
}
/* ═══════════════════════════════════════════════════════════════
   CHIPS DE FILTROS ACTIVOS
   ═══════════════════════════════════════════════════════════════ */
function renderChips(parsed, rawQuery){
  const cont = $('#chips-busqueda');
  if (!cont) return;

  if (!parsed.chips.length){
    cont.style.display = 'none';
    cont.innerHTML = '';
    return;
  }

  cont.style.display = '';
  cont.innerHTML = parsed.chips.map((c, i) =>
    `<span class="chip">
      <span class="chip-tipo">${escapeHtml(c.type === 'eltiempo' ? t('chipTiempo') : c.type)}</span>
      <span>${escapeHtml(c.value)}</span>
      <button type="button" class="chip-x" data-idx="${i}" title="${escapeHtml(t('chipLiteral'))}">×</button>
    </span>`
  ).join('');

  cont.querySelectorAll('.chip-x').forEach(b => {
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const chip = parsed.chips[i];
      if (!chip || !chip.raw) return;

      // Reconstruimos el input quitando el token que corresponde a este chip.
      // Como el parser preprocesa cada token individualmente (medio:elpais → web:elpais.com),
      // comparamos cada token del input crudo contra el chip tras pasarlo por
      // el mismo preprocesador. Así encontramos el que le corresponde.
      const tokensRaw = tokenizeQuery(rawQuery);
      const kept = [];
      let removed = false;

      for (const tk of tokensRaw) {
        const pre = preprocesarInput(tk.raw);
        if (!removed && pre === chip.raw){
          removed = true;
          continue;   // este es el token del chip → lo descartamos
        }
        kept.push(tk.raw);
      }

      let nueva;
      if (removed){
        nueva = kept.join(' ');
      } else {
        // Fallback: no hubo match en el input crudo.
        // Probamos sobre el input preprocesado (por si el chip vino de un selector
        // que escribe el token canónico directamente).
        const rawProcesado = preprocesarInput(rawQuery);
        const esc = _escapeRegex(chip.raw);
        const rx = new RegExp('(^|\\s)' + esc + '(?=\\s|$)', 'g');
        const limpio = rawProcesado.replace(rx, ' ').replace(/\s+/g, ' ').trim();
        if (limpio === rawProcesado) return;   // no se pudo quitar nada
        nueva = limpio;
      }

      $('#buscar').value = nueva;
      const clearBtn = $('#buscar-clear');
      if (clearBtn) clearBtn.hidden = !nueva;
      aplicarFiltros();
    });
  });
}
