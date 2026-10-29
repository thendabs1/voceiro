// Texto, medios y fechas: lo decide el núcleo (shared/busqueda/consulta.js).
function _pasaConsulta(n, consulta){
  if (consulta.calendario && !noticiaEnAmbitos(n.titular, consulta.calendario)) return false;
  return consulta.pasa({
    dominio: n.dominio,
    titular: n.titular,
    ts: n._tsActualidad,
    palabras: n._palabras || (n._palabras = palabrasDe(n.titular)),
  });
}
// Lo mismo para lo que trajo la prensa: las palabras buscadas pueden estar
// en el cuerpo (consulta.pasaExterno).
function _pasaExterno(n, consulta){
  if (consulta.calendario && !noticiaEnAmbitos(n.titular, consulta.calendario)) return false;
  return consulta.pasaExterno({
    dominio: n.dominio,
    titular: n.titular,
    ts: n._tsActualidad,
    palabras: n._palabras || (n._palabras = palabrasDe(n.titular)),
  });
}
// ¿Todo lo que tiene el item viene de la prensa (lo trae una consulta)?
function _soloDeConsulta(n){
  for (const c of n._capas) if (c !== 'prensa') return false;
  return true;
}

// Vista de un item para el comparador del núcleo (shared/busqueda/orden.js).
// El rango (relevancia) solo vale para la consulta que lo produjo.
function _paraOrden(n, clave){
  return {
    ts: n._tsOrden,
    dominio: n.dominio,
    titular: n.titular,
    rango: (n._rango && n._rango.clave === clave) ? n._rango.valor : NaN,
  };
}

// Timestamp de ordenación para el feed. Un programado futuro no debe flotar
// por encima de lo ya publicado, así que se trata como si fuera "ahora".
function _tsOrdenFeed(n, ahora){
  if (n._esFuturo && !isNaN(n._tsShow) && n._tsShow > ahora) return ahora;
  return n._tsOrden;
}

// Vista del feed: igual que _paraOrden, pero con el timestamp ajustado para
// que los programados no tapen las noticias ya publicadas.
function _paraOrdenFeed(n, clave, ahora){
  return { ..._paraOrden(n, clave), ts: _tsOrdenFeed(n, ahora) };
}

// Ocultar leídas / vistas (HIDE_MODE). Una sola copia: la usan la lista
// y el recuento de las pestañas.
function _ocultaPorLectura(n, hm){
  if (hm === 'off') return false;
  const key = normalizeUrlForMatch(n.enlace);
  const pluginItem = PENDIENTES_MAP.get(key);
  const esLeida = LEIDAS_LOCAL.has(key) || (pluginItem && pluginItem.read);
  if ((hm === 'read' || hm === 'both') && esLeida) return true;
  if ((hm === 'viewed' || hm === 'both') && VISTAS_LOCAL.has(key)) return true;
  return false;
}

// Predicado único de la lista (antes había dos copias: el filtro de
// aplicarFiltros y _pasaFiltroIndividual), también para la prensa. Encima de
// la consulta solo quedan filtros de vista del cliente: selects, ocultar
// leídas/vistas y modo (preset). Devuelve true, false o 'fuera-preset'.
function _pasaVista(n, ctx){
  const { g, t2, consulta, clavePrensa, presetEfectivo, soloPreset, marcarPreset, HIDE_MODE: hm } = ctx;
  if (g && n.grupo !== g) return false;
  if (t2 && n.tipo  !== t2) return false;
  if (_ocultaPorLectura(n, hm)) return false;
  // Lo que trajo la prensa para esta consulta, con la prensa encendida.
  const dePrensa = PRENSA_ACTIVA && !!n._prensaPara && n._prensaPara.has(clavePrensa);
  if (n._capas && _soloDeConsulta(n) && !dePrensa) return false;
  if (!(dePrensa ? _pasaExterno(n, consulta) : _pasaConsulta(n, consulta))) return false;
  if (presetEfectivo || soloPreset){
    const cumple = cumpleFiltro(n, ctx);
    n._esPreset = cumple;
    return cumple ? true : 'fuera-preset';
  }
  n._esPreset = marcarPreset ? cumpleFiltro(n, ctx) : false;
  return true;
}

// Aviso de medio desconocido (medio:noexiste → 0 resultados). Con retardo,
// para no avisar de cada prefijo mientras se teclea.
let _avisoMedioTimer = null;
function _avisarMediosDesconocidos(consulta){
  if (_avisoMedioTimer){ clearTimeout(_avisoMedioTimer); _avisoMedioTimer = null; }
  const desc = consulta.medios.desconocidos;
  if (!desc.length) return;
  _avisoMedioTimer = setTimeout(() => {
    _avisoMedioTimer = null;
    toast(`Sin medios para: ${desc.map(d => d.valor).join(', ')}`, 3000);
  }, 1500);
}

function aplicarFiltros(){
  if (PASE) return;   // lo que llegue durante el pase espera: cerrarPase vuelve a filtrar
  hidratarNoticias();
  const rawInput = $('#buscar').value.trim();
  const sinStats = ordenEstadisticas(rawInput)?.resto ?? rawInput;
  const ordenCalendario = CALENDARIO_ACTIVO ? leerConsultaCalendario(sinStats) : null;
  actualizarConsultaCalendario(ordenCalendario);
  const raw = ordenCalendario?.resto ?? sinStats;
  const rawProcesado = preprocesarInput(raw);
  const parsed = parseQuery(rawProcesado);
  // Semántica de la búsqueda (texto, medios, fechas): shared/busqueda/.
  // Se interpreta una vez y la usan el filtro y la prensa.
  const consulta = interpretarConsulta(raw, { catalogo: MEDIOS, ahora: Date.now() });
  consulta.calendario = ordenCalendario;
  if (ordenCalendario) consulta.clave += '|' + JSON.stringify(ordenCalendario);
  renderChips(parsed, raw);
  syncPanelFromParsed(parsed);
  actualizarTiempo(parsed.eltiempo);
  actualizarAlertas(parsed.alertas);
  actualizarConsultaPuntual(parsed);
  pintarBotonTiempo();

const capas = capasRequeridas(parsed, consulta);

// El cursor solo sirve para las capas que se cargaron con él. Al cambiar de
// modo o de medio, la nueva capa empieza tras los días cargados en memoria.
ajustarDiasActual(capas);
    // Disparo R2 en background
  if (capas.size) {
    const signal = new AbortController().signal;
    asegurarCapas(capas, signal).then(trajo => {
      if (trajo) aplicarFiltros();
    });
  }

  // ── Filtrado ──
  const g = $('#grupo').value;
  const t2 = $('#tipo').value;
  const orden = $('#orden').value || 'recientes';   // sincronizado con order:/orden: de la consulta

  const ahora = Date.now();

  const hayMedio   = parsed.medios.length   > 0;
  const hayDominio = parsed.dominios.length > 0;
  const hayGrupo   = parsed.grupos.length   > 0;
  const hayTipo    = parsed.tipos.length    > 0;
  const hayTag     = parsed.tags.length     > 0;
  const hayTitulo  = parsed.titulo.length   > 0;

  const hayFuenteExplicita = hayDominio || hayMedio;
  const hayBusquedaActiva =
    hayTitulo || hayGrupo || hayTipo || hayTag ||
    !!g || !!t2 || !!parsed.desde || !!parsed.hasta || !!ordenCalendario;

  const presetConReglas = PRESET_ACTIVO && presetTieneReglas();
  // La vista 🔖 Temas filtra como un modo, con los temas de todos los modos.
  const vistaTemas = vistaTemasActiva();
  if (CHIP_TEMAS && !TEMAS_TODOS.some(m => m.id === CHIP_TEMAS)) CHIP_TEMAS = null;
  const conFiltro = presetConReglas || vistaTemas;
  // Sin búsqueda, el modo filtra el feed (es tu forma de leerlo). Buscando,
  // el modo no esconde nada: los resultados se separan en dos pestañas,
  // «Modo · N» y «Todo · M» (en Todo, los del modo van marcados). Un filtro
  // de medio escrito en la búsqueda manda sobre el modo: sin pestañas.
  const presetEfectivo = conFiltro && !hayFuenteExplicita && !hayBusquedaActiva;
  const conPestanas    = conFiltro && !hayFuenteExplicita && hayBusquedaActiva && !ordenCalendario;

  _avisarMediosDesconocidos(consulta);
  const ctx = {
    g, t2, ahora, parsed, consulta, clavePrensa: _clavePrensa(consulta), orden, HIDE_MODE,
    presetEfectivo, marcarPreset: conPestanas, soloPreset: false,
    vistaTemas, chipTemas: null, chipTema: null,
  };

  let filtradas = NOTICIAS.filter(n => _pasaVista(n, ctx) === true);

  // Chips. En la vista Temas, uno por modo; con un modo elegido (o si solo
  // hay uno), uno por cada tema suyo. En un modo con temas, «Medios del
  // modo» y uno por tema. Se cuenta sobre la lista sin el chip y luego se
  // filtra. Los chips pasan al ctx para que lo que lee ULT_CTX (las marcas
  // de tema de cada tarjeta) los respete.
  let infoChips = null;
  const filtrarPorChips = lista => {
    const total = lista.length;
    let porModo = null;
    if (vistaTemas){
      porModo = new Map();
      for (const n of lista){
        for (const id of new Set(_temasDe(n).map(x => x.id))) porModo.set(id, (porModo.get(id) || 0) + 1);
      }
      ctx.chipTemas = CHIP_TEMAS;
      if (CHIP_TEMAS) lista = lista.filter(n => _temasDe(n).some(x => x.id === CHIP_TEMAS));
    }
    const idModo = vistaTemas
      ? CHIP_TEMAS || (TEMAS_TODOS.length === 1 ? TEMAS_TODOS[0].id : null)
      : PRESET.id;
    const modo = idModo && TEMAS_TODOS.find(m => m.id === idModo);
    if (CHIP_TEMA && (!modo || CHIP_TEMA.modo !== modo.id)) CHIP_TEMA = null;
    let porTema = null, nMedios = null;
    if (modo){
      // Todos los temas del modo, también los que no casan con nada (a 0):
      // así se ve si una palabra recién añadida no está trayendo noticias.
      porTema = new Map(modo.temas.map(x => [x.etiqueta, 0]));
      for (const n of lista){
        for (const e of new Set(_temasDe(n).filter(x => x.id === modo.id).map(x => x.etiqueta))){
          porTema.set(e, porTema.get(e) + 1);
        }
      }
      if (!vistaTemas && _modoTieneMedios()) nMedios = lista.filter(_entraPorMedios).length;
      // Si todo lo del modo entra por sus medios, el chip es igual que «Todo».
      if (nMedios === lista.length) nMedios = null;
      if (CHIP_TEMA && (CHIP_TEMA.medios ? nMedios === null : !porTema.has(CHIP_TEMA.etiqueta))) CHIP_TEMA = null;
    }
    if (porModo || porTema) infoChips = { total, porModo, modo: modo ? modo.id : null, totalModo: lista.length, porTema, nMedios };
    ctx.chipTema = CHIP_TEMA;
    return CHIP_TEMA ? lista.filter(n => _pasaChipTema(n, CHIP_TEMA)) : lista;
  };

  let infoPestanas = null;
  if (conPestanas){
    // Una búsqueda nueva vuelve a la pestaña automática.
    if (PESTANA_CLAVE !== consulta.clave){ PESTANA_CLAVE = consulta.clave; PESTANA_BUSQUEDA = null; }
    const delModo = filtradas.filter(n => n._esPreset);
    const pestana = PESTANA_BUSQUEDA || (delModo.length ? 'modo' : 'todo');
    // La automática se decide con los primeros resultados y se mantiene: lo
    // que llegue después (archivo, prensa) cambia las cifras, no la pestaña.
    if (filtradas.length) PESTANA_BUSQUEDA = pestana;
    infoPestanas = { pestana, nModo: delModo.length, nTodo: filtradas.length, temas: vistaTemas };
    if (pestana === 'modo'){
      filtradas = filtrarPorChips(delModo);
      ctx.soloPreset = true;
    }
  } else if (presetEfectivo){
    filtradas = filtrarPorChips(filtradas);
  }

  const FAV_WINDOW_MS = 3 * 3600 * 1000;
  const cmpNucleo = comparador(orden);
  filtradas.sort((a, b) => {
    if (presetEfectivo && !vistaTemas){
      const aFav = getOverride(a.dominio) === 'first'
                   && !isNaN(a._tsOrden)
                   && (ahora - a._tsOrden) < FAV_WINDOW_MS;
      const bFav = getOverride(b.dominio) === 'first'
                   && !isNaN(b._tsOrden)
                   && (ahora - b._tsOrden) < FAV_WINDOW_MS;
      const fa = aFav ? 1 : 0;
      const fb = bFav ? 1 : 0;
      if (fa !== fb) return fb - fa;
    }
    const aLejos = a._esFuturo && !isNaN(a._tsShow) && (a._tsShow - ahora > HORIZONTE_FUTURO_MS);
    const bLejos = b._esFuturo && !isNaN(b._tsShow) && (b._tsShow - ahora > HORIZONTE_FUTURO_MS);
    if (aLejos !== bLejos) return aLejos - bLejos;
    // El resto lo decide el núcleo: fecha según el orden, sin fecha siempre
    // al final (antes, con 'antiguos', salían las primeras) y relevancia
    // por el rango que dio la fuente para esta consulta, si lo dio.
    // Los programados futuros se ordenan como "ahora", para no tapar lo
    // publicado recientemente.
    return cmpNucleo(_paraOrdenFeed(a, consulta.clave, ahora), _paraOrdenFeed(b, consulta.clave, ahora));
  });

  ULT_FILTRADAS = filtradas;
  ULT_TEXTO = consulta.texto.incluir.length ? consulta.texto : null;

  // Contexto para el append incremental
  ULT_CTX = ctx;

  ULT_PESTANAS = infoPestanas;
  renderPestanasPreset();
  ULT_CHIPS = infoChips;
  renderChipsTemas();

  actualizarFiltrosCount();
  requestAnimationFrame(renderizar);

  if (APP_LISTA && RECORDAR_FILTROS){
    try { localStorage.setItem('voceiro-buscar', rawInput); } catch(e){}
  }
  programarPrensa(consulta);
}


/* ── Renombrada: cuerpo de aplicarFiltros sin el trigger de scope ── */
let _cargandoScope = false;
