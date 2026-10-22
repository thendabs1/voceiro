/**
 * Busca un grupo en el bloque dias[i].grupos del manifest.
 * Match robusto por normStrict: 'Galicia' == 'Regional · Galicia' == 'regional-galicia'.
 */
function _buscarGrupoEnDia(diaGrupos, nombreGrupo) {
  if (!diaGrupos) return null;
  const objetivo = normStrict(nombreGrupo);
  for (const [k, v] of Object.entries(diaGrupos)) {
    if (normStrict(k) === objetivo) return v;
  }
  return null;
}

// Fichero de un grupo o de un medio en un día del manifest. El manifest
// da el nombre del de grupo (lleva hash) y no lista los de medio: se
// deducen, para los medios con noticias en la ventana (medias). El de
// antes traía {file, n, hash, kb} para los dos.
function _ficheroDeCapaEnDia(dia, tipo, valor) {
  if (tipo === 'grupo') {
    const g = _buscarGrupoEnDia(dia.grupos, valor);
    return !g ? '' : (typeof g === 'string' ? g : (g.file || ''));
  }
  if (tipo !== 'dominio') return '';
  if (dia.dominios) {
    const d = dia.dominios[valor];
    return (d && d.file) || '';
  }
  // Los días de antes del troceado no tienen ficheros de grupo ni de medio.
  if (!dia.grupos || !Object.keys(dia.grupos).length) return '';
  const medias = _manifest && _manifest.medias && _manifest.medias.dominios;
  return (medias && medias[valor]) ? `d-${valor}-${dia.fecha}.json` : '';
}


// ─── Decidir qué capas necesita el estado actual ───
// Con más dominios que esto, no se cargan ficheros por medio (sería
// demasiado): se filtra solo lo ya cargado.
const CAPAS_MAX_DOMINIOS = 12;

// Capas de R2 que necesita la consulta. Los filtros explícitos salen de lo
// que el núcleo ya resolvió (consulta.medios), así que coinciden con la
// lista: grupo:galicia carga «Regional · Galicia» (antes buscaba un grupo
// llamado 'galicia' y no cargaba nada).
function capasRequeridas(parsed, consulta = ULT_CTX && ULT_CTX.consulta) {
  const set = new Set();

    // 1) Preset activo → sus grupos + medios incluidos o favoritos
  if (PRESET_ACTIVO && presetTieneReglas()) {
    (PRESET.grupos || []).forEach(g => set.add('grupo:' + normStrict(g)));
    Object.entries(PRESET.overrides || {}).forEach(([d, v]) => {
      if (overrideIncluye(v)) set.add('dominio:' + normDomain(d));
    });
  }

  // 2) Filtros explícitos del usuario
  const doms = consulta && consulta.medios.dominios;
  if (doms && doms.size){
    if ((parsed.grupos || []).length){
      // Ficheros por grupo (uno por grupo y día), con el nombre real.
      for (const d of doms){
        const g = MEDIOS[d] && MEDIOS[d].g;
        if (g) set.add('grupo:' + normStrict(g));
      }
    } else if (doms.size <= CAPAS_MAX_DOMINIOS){
      for (const d of doms) set.add('dominio:' + d);
    }
  }

  return set;
}

// ─── Mergear items de una capa/base en NOTICIAS con dedup global ───
// Devuelve cuántos items NUEVOS se añadieron.
// clave: consulta que trajo los items (Turso y prensa). Un item que solo viene
// de ellas se ve únicamente mientras esa consulta esté activa (_pasaVista):
// así una búsqueda no deja sus resultados en el feed ni en la siguiente.
// rangoBase: posición del primer item en la respuesta del archivo (offset);
// con order:relevancia el worker los devuelve por bm25 y esa posición es el rango.
function _mergearItemsEnNoticias(items, capaKey, clave = null, rangoBase = null) {
  let añadidos = 0;
  let pos = 0;
  let rango = null;
  // La prensa lleva marca propia: su clave incluye idioma y país, y a lo suyo
  // no se le exigen las palabras en el titular (_pasaVista).
  const campo = capaKey === 'prensa' ? '_prensaPara' : '_consultas';
  const marcar = n => {
    if (!clave) return;
    (n[campo] || (n[campo] = new Set())).add(clave);
    if (rango !== null) n._rango = { clave, valor: rango };
  };

  for (const n of items) {
    rango = rangoBase === null ? null : rangoBase + pos++;
    const u = _claveUrl(n.u || '', n.d || '');
    const t = n.t ? normalize(n.t) : '';

    // ¿Ya existe por URL?
    if (u) {
      const existente = _itemPorUrl.get(u);
      if (existente) {
        _adoptarPublicacion(existente, n);
        existente._capas.add(capaKey);
        marcar(existente);
        continue;
      }
    }
    // ¿Ya existe por título? En prensa, el mismo titular en otro medio es
    // otra noticia (las de agencia): solo se une si es del mismo medio o si
    // el medio no se pudo resolver.
    if (t) {
      const existente = _itemPorTitulo.get(t);
      if (existente && (capaKey !== 'prensa' || n.d === 'news.google.com'
          || (existente.dominio || existente.d) === n.d)) {
        existente._capas.add(capaKey);
        marcar(existente);
        continue;
      }
    }

    // Es nuevo
    if (u) _urlsCargadas.add(u);
    if (t) _titulosCargados.add(t);

    n._capas = new Set([capaKey]);
    marcar(n);
    n._dia = n._dia || '';
    n._generado = n._generado || '';
    NOTICIAS.push(n);
    if (u) _itemPorUrl.set(u, n);
    if (t && !_itemPorTitulo.has(t)) _itemPorTitulo.set(t, n);
    añadidos++;
  }

  return añadidos;
}

// ─── Cargar una capa desde R2 ───
async function _cargarCapa(key, signal) {
  console.count('capa ' + key);
  const [tipo, valor] = key.split(':', 2);
  if (!_manifest || !_manifest.dias || !_manifest.dias.length) return 0;

  const diasMax = Math.min(DIAS_MEMORIA, DIAS_MEMORIA_MAX_SCOPE);
  const dias = _manifest.dias.slice(0, diasMax);
  const files = [];

  for (const dia of dias) {
    const f = _ficheroDeCapaEnDia(dia, tipo, valor);
    if (f) files.push(f);
  }

  if (!files.length) return 0;

  // Fetch con concurrencia 3
  const cola = files.slice();
  const nuevos = [];
  const workers = Array.from({ length: Math.min(3, cola.length) }, async () => {
    while (cola.length) {
      if (signal.aborted) return;
      const f = cola.shift();
      const data = await _fetchJSON(f, signal);
      if (!data) continue;
      if (data.medios) {
        for (const d in data.medios) MEDIOS[d] = data.medios[d];
      }
      const diaFecha = data.fecha || '';
      const generadoIso = data.generado || '';
      for (const n of (data.noticias || [])) {
        n._dia = diaFecha;
        n._generado = generadoIso;
        nuevos.push(n);
      }
    }
  });
  await Promise.all(workers);

  const añadidos = _mergearItemsEnNoticias(nuevos, key);
  if (añadidos > 0) {
    hidratarNoticias();
    construirMediosUnicos();
    construirIndicesBusqueda();
    if (ajRuta() === 'modo') {
      renderListaMedios();
    }
  }
  LAYERS.set(key, {
    files,
    cargada: Date.now(),
    lastUse: Date.now(),
    n: añadidos,
  });
  _itemsCargadosDeCapas += añadidos;
  return añadidos;
}

// Extiende una o varias capas pidiendo días [desde, hasta) desde el manifest.
// Diferencia con _cargarCapa: aquella carga [0, DIAS_MEMORIA), esta carga
// un rango arbitrario para paginación.
async function extenderCapasR2(capas, desde, hasta) {
  for (const key of capas) {
    const [tipo, valor] = key.split(':', 2);
    const dias = (_manifest.dias || []).slice(desde, hasta);
    if (!dias.length) continue;

    const files = [];
    for (const dia of dias) {
      const f = _ficheroDeCapaEnDia(dia, tipo, valor);
      if (f) files.push(f);
    }
    if (!files.length) continue;

    const cola = files.slice();
    const nuevos = [];
    const workers = Array.from({ length: Math.min(8, cola.length) }, async () => {
      while (cola.length) {
        const f = cola.shift();
        const data = await _fetchJSON(f);
        if (!data) continue;
        if (data.medios) {
          for (const d in data.medios) MEDIOS[d] = data.medios[d];
        }
        const diaFecha = data.fecha || '';
        const generadoIso = data.generado || '';
        for (const n of (data.noticias || [])) {
          n._dia = diaFecha;
          n._generado = generadoIso;
          nuevos.push(n);
        }
      }
    });
    await Promise.all(workers);

    const añadidos = _mergearItemsEnNoticias(nuevos, key);
    if (añadidos > 0) {
      hidratarNoticias();
      construirMediosUnicos();
      construirIndicesBusqueda();
      if (ajRuta() === 'modo') {
        renderListaMedios();
      }
    }
    _itemsCargadosDeCapas += añadidos;
  }
}


async function asegurarCapas(capas, signal) {
  const faltantes = [...capas].filter(k => !LAYERS.has(k));
  if (!faltantes.length) return false;

  // Si ya hay una carga en curso, nos colgamos de ella. Cuando termine,
  // re-evaluamos: puede que ya no falte nada (caso típico: aplicarFiltros
  // se dispara dos veces seguidas por el evento del userscript).
  if (_capaEnVuelo) {
    try { await _capaEnVuelo; } catch(e){}
    return asegurarCapas(capas, signal);
  }

  if (_itemsCargadosDeCapas >= LAYER_MAX_ITEMS) {
    toast('Límite de capas alcanzado. Recarga la página para resetear.', 3200);
    return false;
  }

  _capaEnVuelo = (async () => {
    let total = 0;
    for (const key of faltantes) {
      if (signal.aborted) return total;
      if (_itemsCargadosDeCapas >= LAYER_MAX_ITEMS) break;
      try {
        total += await _cargarCapa(key, signal);
      } catch(e) {
        if (e.name !== 'AbortError') console.warn('[capa]', key, e.message);
      }
    }
    return total;
  })();

  try {
    return (await _capaEnVuelo) > 0;
  } finally {
    _capaEnVuelo = null;
  }
}
// ─── Cargar base (portada) ───
async function cargarBase() {
  _cargandoScope = true;
  let myGen = 0;
  try {
    if (_scopeAbort) _scopeAbort.abort();
    _scopeAbort = new AbortController();
    myGen = ++_scopeGeneration;
    const signal = _scopeAbort.signal;

    _manifest = await _fetchManifestConFallback(signal);
    if (myGen !== _scopeGeneration) return;
    if (BACKEND_ACTIVO === 'deno') _probarCFEnBackground();

    // 2) Reset
    MEDIOS = {};
    NOTICIAS = [];
    BASE.items = [];
    BASE.cargada = false;
    LAYERS.clear();
    _itemsCargadosDeCapas = 0;
    _itemPorUrl.clear();
    _itemPorTitulo.clear();
    _urlsCargadas = new Set();
    _titulosCargados = new Set();
    _hidratadasHasta = 0;
    PRENSA_HECHA = null;       // su prensa ya no está en NOTICIAS
    PRENSA_FALLO = null;
    _dupsHechosHasta = 0;
    _dupsLogged = false;

    // 2.5) Catálogo completo (346 medios desde el manifest)
    //      Va antes de la portada para que MEDIOS_UNICOS arranque completo.
    //      La portada luego sobreescribe con datos frescos (mismos valores).
    if (_manifest.catalogo) {
      for (const d in _manifest.catalogo) {
        MEDIOS[d] = _manifest.catalogo[d];
      }
    }

    // 3) Base = portada general + portadas adicionales activas, pedidas
    //    en paralelo y mezcladas en orden (primero la general).
    const portadaFile = (_manifest.portada && _manifest.portada.file)
                        ? _manifest.portada.file : 'portada.json';
    const pExtras = _fetchPortadasExtra(PORTADAS_ACTIVAS, signal);
    const data = await _fetchJSON(portadaFile, signal);
    if (data) {
      if (data.medios) {
        for (const d in data.medios) MEDIOS[d] = data.medios[d];
      }
      const generado = data.generado || '';
      for (const n of (data.noticias || [])) {
        n._dia = data.fecha || '';
        n._generado = generado;
        BASE.items.push(n);
      }
      BASE.cargada = true;
      BASE.generado = generado;
      _mergearItemsEnNoticias(BASE.items, 'base');
      pintarFechaCabecera(generado);
    }
    _mergearPortadasExtra(await pExtras);
    renderListaPortadas();

    if (myGen === _scopeGeneration) refrescarVistaCompleta();
  } catch(e) {
    if (e.name === 'AbortError') return;
    throw e;
  } finally {
    if (myGen === _scopeGeneration) {
      _cargandoScope = false;
    }
  }
}

// ─── Portadas adicionales (ediciones) ───
// Pide las portadas de edición que existan en el manifest. Nunca falla:
// una portada que no llega se queda en data null y se ignora al mezclar.
function _fetchPortadasExtra(slugs, signal) {
  const portadas = (_manifest && _manifest.portadas) || {};
  const pedidas = slugs.filter(s => portadas[s] && portadas[s].file);
  return Promise.all(pedidas.map(slug =>
    _fetchJSON(portadas[slug].file, signal).then(data => ({ slug, data }))));
}

// Mezcla en NOTICIAS lo que trajo _fetchPortadasExtra. Devuelve cuántas
// noticias nuevas entraron (las que ya estaban en la general no cuentan).
function _mergearPortadasExtra(lista) {
  let añadidos = 0;
  for (const { slug, data } of lista) {
    if (!data) continue;
    if (data.medios) {
      for (const d in data.medios) MEDIOS[d] = data.medios[d];
    }
    const items = data.noticias || [];
    for (const n of items) {
      n._dia = data.fecha || '';
      n._generado = data.generado || '';
    }
    añadidos += _mergearItemsEnNoticias(items, 'portada:' + slug);
  }
  return añadidos;
}

// Casillas del panel: una por portada de edición que publique el manifest.
function renderListaPortadas() {
  const cont = $('#lista-portadas');
  if (!cont) return;
  const portadas = (_manifest && _manifest.portadas) || {};
  const slugs = Object.keys(portadas);
  $('#cfg-portadas-bloque').hidden = !slugs.length;
  cont.innerHTML = slugs.map(slug => {
    const clave = 'portada' + slug.charAt(0).toUpperCase() + slug.slice(1);
    const nombre = t(clave) === clave ? slug : t(clave);
    const marcada = PORTADAS_ACTIVAS.includes(slug) ? ' checked' : '';
    return `<label class="cfg-toggle">
      <input type="checkbox" data-portada="${escapeHtml(slug)}"${marcada}>
      <span class="cfg-toggle-txt">
        <span class="cfg-toggle-title">${escapeHtml(nombre)}</span>
        <span class="cfg-toggle-hint">${escapeHtml(t('cfgPortadaN', { n: portadas[slug].n || 0 }))}</span>
      </span>
    </label>`;
  }).join('');
}

// Activar una portada la añade sin recargar; quitarla obliga a rehacer la
// base, porque sus noticias ya están mezcladas en NOTICIAS.
function wirePortadas() {
  const cont = $('#lista-portadas');
  if (!cont) return;
  cont.addEventListener('change', async e => {
    const chk = e.target.closest('input[data-portada]');
    if (!chk) return;
    const slug = chk.dataset.portada;
    PORTADAS_ACTIVAS = PORTADAS_ACTIVAS.filter(s => s !== slug);
    if (chk.checked) PORTADAS_ACTIVAS.push(slug);
    guardarPortadasActivas();
    if (chk.checked) {
      if (_mergearPortadasExtra(await _fetchPortadasExtra([slug]))) {
        refrescarVistaCompleta();
      }
    } else {
      await cargarBase();
    }
  });
}
