// Borrador en memoria: ni los pasos ni la prueba escriben modos o ajustes.
// La única escritura se hace al confirmar la selección en el último paso.
let ASISTENTE_MODO = null;

function abrirAsistenteModo(){
  ajGuardarTemas();
  ASISTENTE_MODO = {
    paso: 0, tipo: 'medios', fuentes: 'elegidas', grupos: [], overrides: {},
    textoTemas: '', nombre: '', categoria: '', buscar: '',
  };
  ajEmpujar('asistente');
}
function pasosAsistente(){
  return ASISTENTE_MODO?.tipo === 'temas'
    ? ['intencion', 'fuentes', 'temas', 'resumen'] : ['intencion', 'fuentes', 'resumen'];
}
function modoAsistente(){
  const b = ASISTENTE_MODO;
  return {
    nombre: b.nombre.trim(), grupos: b.fuentes === 'todas' ? [] : [...b.grupos],
    palabras: b.tipo === 'temas' ? parseLista(b.textoTemas) : [],
    overrides: { ...b.overrides }, regla: { v: 1, fuentes: b.fuentes },
  };
}
function errorAsistente(paso){
  const m = modoAsistente();
  if (paso === 'fuentes' && m.regla.fuentes === 'elegidas'
      && !m.grupos.length && !Object.values(m.overrides).some(overrideIncluye)) return t('asSinFuentes');
  if (paso === 'temas' || paso === 'resumen'){
    if (ASISTENTE_MODO.tipo === 'temas'){
      const validas = new Set(compilarTemas(m.palabras).map(x => x.etiqueta));
      const invalidas = m.palabras.filter(x => !validas.has(x) || tokenizeQuery(x).some(tk => tk.prefix));
      if (!m.palabras.length || invalidas.length)
        return t('asTemasInvalidos', { X: invalidas.join(' · ') });
    }
  }
  if (paso === 'resumen' && !m.nombre) return t('asNombreFalta');
  return '';
}
function avanzarAsistente(delta){
  const b = ASISTENTE_MODO;
  if (!b) return;
  const pasos = pasosAsistente();
  const error = delta > 0 ? errorAsistente(pasos[b.paso]) : '';
  if (error){ $('#as-error').textContent = error; return; }
  b.paso = Math.max(0, Math.min(pasos.length - 1, b.paso + delta));
  pintarAsistenteModo();
  $('#as-paso-titulo').focus();
  $('#panel-ajustes .aj-cuerpo').scrollTop = 0;
}
function pintarAsistenteModo(){
  const b = ASISTENTE_MODO;
  if (!b) return;
  // Una carga de datos no debe sustituir un campo mientras se escribe.
  const form = $('#asistente-modo');
  if (form.contains(document.activeElement) && form.dataset.paso === String(b.paso)) return;
  const pasos = pasosAsistente(), paso = pasos[b.paso];
  const e = escapeHtml;
  let contenido = '';
  if (paso === 'intencion'){
    contenido = `<p class="aj-hint">${e(t('asIntencionHint'))}</p>`
      + `<div class="aj-radios">${['medios', 'temas'].map(tipo =>
        `<label><input type="radio" name="as-tipo" value="${tipo}"${b.tipo === tipo ? ' checked' : ''}>`
        + `<span>${e(t(tipo === 'medios' ? 'asMedios' : 'asTemas'))}</span></label>`).join('')}</div>`
      + `<details class="as-ayuda"><summary>${e(t('asPortadas'))}</summary>`
      + `<p class="aj-hint">${e(t('asPortadasHint'))}</p>`
      + `<button type="button" data-as="portadas">${e(t('asVerPortadas'))}</button></details>`;
  } else if (paso === 'fuentes'){
    contenido = `<p class="aj-hint">${e(t('asFuentesHint'))}</p><p class="aj-hint">${e(t('asEstadosHint'))}</p>`
      + `<div class="aj-radios">${['elegidas', 'todas'].map(f =>
        `<label><input type="radio" name="as-fuentes" value="${f}"${b.fuentes === f ? ' checked' : ''}>`
        + `<span>${e(t(f === 'todas' ? 'asFuentesTodas' : 'asFuentesElegidas'))}</span></label>`).join('')}</div>`
      + `<label class="as-campo" for="as-categoria">${e(t('asCategoria'))}<select id="as-categoria">`
      + `<option value="">${e(t('asCategoria'))}</option>`
      + [...new Set(MEDIOS_UNICOS.map(m => superGrupo(m.grupo)))].sort((a, c) => ordenSuper(a) - ordenSuper(c))
        .map(c => `<option value="${e(c)}"${b.categoria === c ? ' selected' : ''}>${e(c)}</option>`).join('') + '</select></label>'
      + `<label class="as-campo" for="as-buscar">${e(t('cfgBuscarMedio'))}`
      + `<input id="as-buscar" type="search" value="${e(b.buscar)}" autocomplete="off"></label>`
      + `<div id="as-fuentes-lista"></div><div id="as-excepciones"></div>`
      + `<p id="as-fuentes-resumen" class="aj-pista" role="status"></p>`;
  } else if (paso === 'temas'){
    contenido = `<p class="aj-hint">${e(t('asTemasHint'))}</p>`
      + `<label class="as-campo" for="as-temas">${e(t('cfgPalabras'))}`
      + `<textarea id="as-temas" class="preset-texto" spellcheck="false" placeholder="${e(t('cfgPalabrasPlaceholder'))}">${e(b.textoTemas)}</textarea></label>`
      + `<details class="as-ayuda"><summary>${e(t('cfgPalabrasHint'))}</summary><ul>`
      + t('cfgTemasAyuda').split('\n').map(l => {
        const [ej, txt] = l.split('|');
        return `<li><code>${e(ej)}</code> → ${e(txt || '')}</li>`;
      }).join('') + '</ul></details>';
  } else {
    contenido = `<label class="as-campo" for="as-nombre">${e(t('asNombre'))}`
      + `<input id="as-nombre" maxlength="100" value="${e(b.nombre)}" autocomplete="off" required></label>`
      + `<div id="as-seleccion-resumen" class="aj-pista"></div>`
      + `<p id="as-preview-count" role="status"></p><p class="aj-hint">${e(t('asVistaParcial'))}</p>`
      + `<ul id="as-preview" class="as-preview"></ul>`
      + `<p class="aj-hint">${e(t('asFiltrosVista'))}</p>`;
  }
  const titulos = { intencion: 'asIntencion', fuentes: 'cfgMedios', temas: 'cfgPalabras', resumen: 'asRevisar' };
  form.dataset.paso = String(b.paso);
  form.innerHTML = `<p class="aj-hint">${e(t('asPaso', { n: b.paso + 1, total: pasos.length }))}</p>`
    + `<h3 id="as-paso-titulo" tabindex="-1">${e(t(titulos[paso]))}</h3>`
    + contenido + `<p id="as-error" class="as-error" role="alert"></p>`
    + `<p class="aj-hint">${e(t('asBorrador'))}</p><div class="as-acciones">`
    + `<button type="button" data-as="cancelar">${e(t('asCancelar'))}</button>`
    + (b.paso ? `<button type="button" data-as="anterior">${e(t('asAnterior'))}</button>` : '')
    + `<button type="submit" class="primary">${e(t(paso === 'resumen' ? 'asGuardar' : 'asSiguiente'))}</button></div>`;
  if (paso === 'fuentes') pintarFuentesAsistente();
  if (paso === 'resumen') pintarPruebaAsistente();
}
function filaMedioAsistente(m){
  const e = escapeHtml, ov = ASISTENTE_MODO.overrides[m.dominio] || '';
  return `<label class="as-medio"><span><strong>${e(m.medio)}</strong><small>${e(m.dominio)}</small></span>`
    + `<select data-as-medio="${e(m.dominio)}" aria-label="${e(t('cfgEstadoMedio', { X: m.medio }))}">`
    + [['', 'cfgMedioAutomatico'], ['include', 'cfgMedioIncluir'], ['ignore', 'cfgMedioBloquear']]
      .map(([v, k]) => `<option value="${v}"${ov === v ? ' selected' : ''}>${e(t(k))}</option>`).join('')
    + '</select></label>';
}
function pintarFuentesAsistente(){
  const b = ASISTENTE_MODO, e = escapeHtml;
  const q = normalize(b.buscar.trim());
  const lista = $('#as-fuentes-lista');
  if (q){
    const medios = MEDIOS_UNICOS.filter(m => normalize(m.medio + ' ' + m.dominio + ' ' + m.grupo).includes(q));
    lista.innerHTML = medios.slice(0, 25).map(filaMedioAsistente).join('');
    if (medios.length > 25) lista.innerHTML += `<p class="aj-hint">${e(t('asLimiteMedios', { n: 25, total: medios.length }))}</p>`;
    const dominio = normalizarDominioInput(b.buscar);
    if (!medios.length){
      lista.innerHTML = `<p class="aj-hint">${e(t('cfgMediosVacio'))}</p>`;
      if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(dominio) && !Object.hasOwn(b.overrides, dominio))
        lista.innerHTML += `<button type="button" data-as-dominio="${e(dominio)}">${e(t('asAnadirDominio', { X: dominio }))}</button>`
          + `<p class="aj-hint">${e(t('asDominioHint'))}</p>`;
    }
  } else {
    const medios = MEDIOS_UNICOS.filter(m => superGrupo(m.grupo) === b.categoria);
    const grupos = ordenarGruposPorIdioma([...new Set(medios.map(m => m.grupo))]);
    lista.innerHTML = grupos.map(g => {
      const delGrupo = medios.filter(m => m.grupo === g);
      return `<details class="as-grupo"><summary>${e(g)} · ${delGrupo.length}</summary>`
        + `<label class="as-grupo-elegir"><input type="checkbox" data-as-grupo="${e(g)}"${b.grupos.includes(g) ? ' checked' : ''}`
        + `${b.fuentes === 'todas' ? ' disabled' : ''}> ${e(t('asIncluirGrupo'))}</label>`
        + delGrupo.map(filaMedioAsistente).join('') + '</details>';
    }).join('');
    if (!MEDIOS_UNICOS.length) lista.innerHTML = `<p class="aj-hint">${e(t('asSinCatalogo'))}</p>`;
  }
  pintarResumenFuentesAsistente();
}
function pintarResumenFuentesAsistente(){
  const b = ASISTENTE_MODO, e = escapeHtml, m = modoAsistente();
  const regla = compilarRegla(m);
  const n = MEDIOS_UNICOS.filter(medio => regla.pasaFuentes(medio)).length;
  $('#as-fuentes-resumen').textContent = t('asResumenFuentes', {
    g: m.grupos.length, i: Object.values(m.overrides).filter(overrideIncluye).length,
    s: Object.values(m.overrides).filter(x => x === 'ignore').length, n,
  });
  const propios = Object.keys(b.overrides).map(d =>
    MEDIOS_UNICOS.find(m => m.dominio === d) || { dominio: d, medio: d });
  $('#as-excepciones').innerHTML = (b.grupos.length && b.fuentes === 'elegidas'
    ? `<p class="aj-hint">${b.grupos.map(g => `<button type="button" data-as-quitar-grupo="${e(g)}">${e(g)} ×</button>`).join(' ')}</p>` : '')
    + (propios.length ? `<details class="as-grupo" open><summary>${e(t('asExcepciones'))}</summary>`
      + propios.map(filaMedioAsistente).join('') + '</details>' : '')
    + (propios.some(m => !MEDIOS_UNICOS.some(c => c.dominio === m.dominio))
      ? `<p class="aj-hint">${e(t('asDominioHint'))}</p>` : '');
  // Una excepción puede aparecer en el catálogo y en el resumen.
  $('#as-fuentes-lista').querySelectorAll('select[data-as-medio]').forEach(s => {
    s.value = b.overrides[s.dataset.asMedio] || '';
  });
}
function pintarPruebaAsistente(){
  const modo = modoAsistente(), regla = compilarRegla(modo), e = escapeHtml;
  const fuentes = modo.regla.fuentes === 'todas' ? t('asResumenTodas')
    : t('asResumenElegidas', { X: [...modo.grupos, ...Object.entries(modo.overrides)
      .filter(([, v]) => overrideIncluye(v)).map(([d]) => d)].join(' · ') });
  const silencios = Object.entries(modo.overrides).filter(([, v]) => v === 'ignore').map(([d]) => d);
  $('#as-seleccion-resumen').innerHTML = `<p>${e(fuentes)}</p>`
    + `<p>${e(modo.palabras.length ? t('asResumenTemas', { X: modo.palabras.join(' / ') }) : t('asSinTemas'))}</p>`
    + (silencios.length ? `<p>${e(t('cfgMedioBloquear'))}: ${e(silencios.join(' · '))}</p>` : '');
  // Solo datos propios ya cargados: nunca se lanza una consulta ni una
  // descarga masiva para probar un borrador. No influye el modo activo.
  const propias = NOTICIAS.filter(n => !(n._capas && _soloDeConsulta(n)));
  const noticias = propias.filter(regla.pasa).sort((a, b) => (b._tsActualidad || 0) - (a._tsActualidad || 0));
  $('#as-preview-count').textContent = t('asVistaPrevia', { n: noticias.length, total: propias.length });
  $('#as-preview').innerHTML = noticias.slice(0, 8).map(n =>
    `<li><strong>${e(n.titular)}</strong><small>${e(n.medio || n.dominio)}</small></li>`).join('')
    || `<li>${e(t('asSinCoincidencias'))}</li>`;
}
function guardarAsistenteModo(){
  if (!ASISTENTE_MODO) return;
  for (const paso of pasosAsistente()){
    const error = errorAsistente(paso);
    if (error){ $('#as-error').textContent = error; return; }
  }
  const modo = normalizarPreset({ ...modoAsistente(), id: 'm-' + crypto.randomUUID() });
  PRESETS.lista.push(modo);
  MODO_EDITADO = modo.id;
  ASISTENTE_MODO = null;
  AJ_PILA[AJ_PILA.length - 1] = 'modo';
  activarModo(modo.id);  // Guarda y recompila con el mismo motor de la prueba.
  ajPintar();
  toast(t('asGuardado', { X: modo.nombre }), 3000);
}
function wireAsistenteModo(){
  $('#btn-asistente-modo').addEventListener('click', abrirAsistenteModo);
  $('#btn-as-modo').addEventListener('click', abrirAsistenteModo);
  const form = $('#asistente-modo');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!ASISTENTE_MODO) return;
    if (pasosAsistente()[ASISTENTE_MODO.paso] === 'resumen') guardarAsistenteModo();
    else avanzarAsistente(1);
  });
  form.addEventListener('input', ev => {
    const b = ASISTENTE_MODO;
    if (!b) return;
    if (ev.target.id === 'as-temas') b.textoTemas = ev.target.value;
    if (ev.target.id === 'as-nombre') b.nombre = ev.target.value;
    if (ev.target.id === 'as-buscar'){ b.buscar = ev.target.value; pintarFuentesAsistente(); }
    $('#as-error').textContent = '';
  });
  form.addEventListener('change', ev => {
    const b = ASISTENTE_MODO, el = ev.target;
    if (!b) return;
    if (el.name === 'as-tipo'){
      b.tipo = el.value;
      b.fuentes = b.tipo === 'temas' ? 'todas' : 'elegidas';
      // Solo cambia el número de pasos; se conserva el control enfocado.
      form.querySelector('.aj-hint').textContent = t('asPaso', { n: 1, total: pasosAsistente().length });
    }
    if (el.name === 'as-fuentes'){ b.fuentes = el.value; pintarFuentesAsistente(); }
    if (el.id === 'as-categoria'){ b.categoria = el.value; b.buscar = ''; $('#as-buscar').value = ''; pintarFuentesAsistente(); }
    if (el.dataset.asGrupo){
      b.grupos = b.grupos.filter(g => g !== el.dataset.asGrupo);
      if (el.checked) b.grupos.push(el.dataset.asGrupo);
      pintarResumenFuentesAsistente();
    }
    if (el.dataset.asMedio){
      if (el.value) b.overrides[el.dataset.asMedio] = el.value;
      else delete b.overrides[el.dataset.asMedio];
      // No se recrea el selector enfocado ni se cierran los grupos.
      if (!el.closest('#as-excepciones')) pintarResumenFuentesAsistente();
      else {
        const id = el.dataset.asMedio;
        pintarResumenFuentesAsistente();
        form.querySelector(`select[data-as-medio="${CSS.escape(id)}"]`)?.focus();
      }
    }
    $('#as-error').textContent = '';
  });
  form.addEventListener('click', ev => {
    const el = ev.target.closest('button');
    if (!el || !ASISTENTE_MODO) return;
    if (el.dataset.as === 'anterior') avanzarAsistente(-1);
    if (el.dataset.as === 'cancelar'){ ASISTENTE_MODO = null; ajAtras(); }
    if (el.dataset.as === 'portadas'){ ASISTENTE_MODO = null; ajIrSeccion('feed'); }
    if (el.dataset.asDominio){
      ASISTENTE_MODO.overrides[el.dataset.asDominio] = 'include';
      pintarFuentesAsistente();
    }
    if (el.dataset.asQuitarGrupo){
      ASISTENTE_MODO.grupos = ASISTENTE_MODO.grupos.filter(g => g !== el.dataset.asQuitarGrupo);
      pintarFuentesAsistente();
    }
  });
}
