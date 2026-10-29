/* Panel técnico: lee los resúmenes públicos ya calculados, bajo demanda.
   Cuenta los titulares guardados en el archivo de cada día, no artículos
   únicos por publicación. Solo se muestra lo que trae datos: un hueco no es un cero. */
const ESTADISTICAS = {
  abierto: false, vista: 'resumen', fecha: '', ambito: '', dominio: '', consulta: '', destino: null,
  indice: null, dia: null, cargando: false, error: false, familias: new Set(), secuencia: 0,
  controller: null, cache: new Map(), origen: null, scroll: 0,
};
const iconoEstadisticas = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v17h17M8 16v-5m5 5V6m5 10v-8"/></svg>';
const estNumero = n => Number.isFinite(n) ? new Intl.NumberFormat(ACCES.lang).format(n) : '—';
const estHoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const estFechaValida = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
function estFecha(s, corta = false){
  return estFechaValida(s) ? new Intl.DateTimeFormat(ACCES.lang, { day: 'numeric', month: 'short', ...(corta ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z')) : '—';
}
function estGenerado(s){
  const d = new Date(s);
  return isNaN(d) ? '—' : new Intl.DateTimeFormat(ACCES.lang, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(d);
}
const estPorcentaje = (n, total) => Number.isFinite(n) && total > 0 ? `${Math.round(n / total * 100)} %` : null;
const estDuracion = min => !Number.isFinite(min) ? null : min < 90 ? `${min} min` : `${Math.round(min / 60)} h`;

// Ámbito: 'todos', 'modo:<id>' o 'grupo:<grupo o familia>'. Sin elección
// propia (o si el modo elegido ya no existe) sigue al modo activo.
const estModo = ambito => ambito?.startsWith('modo:') ? PRESETS.lista.find(p => 'modo:' + p.id === ambito) || null : null;
function estAmbito(){
  const a = ESTADISTICAS.ambito;
  if (a && (!a.startsWith('modo:') || estModo(a))) return a;
  return PRESET_ACTIVO && estModo('modo:' + PRESETS.activo) ? 'modo:' + PRESETS.activo : 'todos';
}
// Los temas y palabras de un modo no amplían este conjunto. ignore gana a su grupo.
// `extra`: dominios con datos que ya no están en el catálogo; sin ellos «Todos»
// no cuadra con el total del día.
function seleccionEstadisticas(catalogo, ambito, modos = [], extra = []){
  const todos = [...new Set([...Object.keys(catalogo), ...extra])];
  if (ambito.startsWith('grupo:')){
    const g = ambito.slice(6);
    return todos.filter(d => catalogo[d]?.g === g || catalogo[d]?.g.startsWith(g + ' · '));
  }
  if (!ambito.startsWith('modo:')) return todos;
  const modo = modos.find(p => 'modo:' + p.id === ambito);
  if (!modo) return [];
  if (modo.regla){
    const regla = compilarRegla(modo);
    if (regla) return [...new Set([...todos, ...Object.keys(modo.overrides || {})])]
      .filter(d => regla.pasaFuentes({ dominio: d, grupo: catalogo[d]?.g }));
  }
  const ov = modo.overrides || {}, grupos = new Set(modo.grupos || []);
  const incluido = d => ov[d] === 'include' || ov[d] === 'first';
  return [...new Set([...todos, ...Object.keys(ov)])].filter(d => ov[d] !== 'ignore' && (incluido(d) || grupos.has(catalogo[d]?.g)));
}
function sumarEstadisticas(medios, dominios){
  const pubs = dominios.map(d => medios[d]?.pub).filter(p => Number.isFinite(p?.titulares));
  const porHora = Array(24).fill(0);
  for (const p of pubs) (p.por_hora || []).slice(0, 24).forEach((n, h) => { if (Number.isFinite(n)) porHora[h] += n; });
  return { titulares: pubs.length ? pubs.reduce((n, p) => n + p.titulares, 0) : null,
    conHora: pubs.reduce((n, p) => n + (p.fechas?.con_hora || 0), 0), disponibles: pubs.length, conTitulares: pubs.filter(p => p.titulares > 0).length,
    seleccionados: dominios.length, porHora };
}
// «Regional · Galicia» se pliega bajo «Regional»; una familia de un solo grupo
// se muestra como ese grupo. Mapa familia → grupo → dominios.
function familiasEstadisticas(catalogo, dominios, sinGrupo){
  const familias = new Map();
  for (const d of dominios){
    const g = catalogo[d]?.g || sinGrupo, f = g.split(' · ')[0];
    if (!familias.has(f)) familias.set(f, new Map());
    const grupos = familias.get(f);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(d);
  }
  return familias;
}
// Días con fichero publicado (35 en el índice; la serie solo trae 30).
function estDias(indice){ return indice.dias.map(d => d.fecha).filter(f => f <= estHoy()).sort(); }
function estUltimoDia(indice){ return estDias(indice).at(-1); }
// Los 30 días del índice, siempre enteros: elegir un día no mueve la gráfica.
function serieEstadisticas(indice, dominios, campo = 'titulares'){
  return indice.serie_dias.map((fecha, i) => {
    const valores = dominios.map(d => indice.serie[d]?.[campo]?.[i]).filter(Number.isFinite);
    return { fecha, valor: valores.length ? valores.reduce((a, b) => a + b, 0) : null, medios: valores.length };
  });
}
function validarIndiceEstadisticas(p){
  if (!p || !Array.isArray(p.dias) || !p.medios || Array.isArray(p.medios) || typeof p.medios !== 'object'
      || !Array.isArray(p.serie_dias) || !p.serie || typeof p.serie !== 'object' || Array.isArray(p.serie)
      || typeof p.generado !== 'string' || isNaN(Date.parse(p.generado))
      || !p.dias.every(d => estFechaValida(d.fecha)) || !p.serie_dias.every(estFechaValida)
      || !Object.values(p.serie).every(s => s && Array.isArray(s.titulares) && s.titulares.length === p.serie_dias.length && s.titulares.every(n => n == null || Number.isFinite(n) && n >= 0))
      || !Object.values(p.medios).every(m => m && typeof m.n === 'string' && typeof m.g === 'string')) throw new Error('formato');
  return p;
}
function estDominios(){
  const { indice } = ESTADISTICAS;
  return seleccionEstadisticas(indice.medios, estAmbito(), PRESETS.lista, [...Object.keys(indice.serie), ...Object.keys(estDatoDia()?.medios || {})]);
}
function estDatoDia(){ return ESTADISTICAS.dia?.fecha === ESTADISTICAS.fecha ? ESTADISTICAS.dia : null; }
function estBoton(accion, texto, valor = ''){
  return `<button type="button" data-est="${accion}" data-valor="${escapeHtml(valor)}">${escapeHtml(texto)}</button>`;
}
function estTabla(cabeceras, filas){
  return `<div class="est-tabla" tabindex="0"><table><thead><tr>${cabeceras.map(c => `<th scope="col">${escapeHtml(t(c))}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map((v, i) => i ? `<td>${v}</td>` : `<th scope="row">${v}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
// Lo que no tiene dato no se pinta: un «0» o un «—» de relleno no informa.
function estMetricas(pares){
  const visibles = pares.filter(([, v]) => v != null && v !== '');
  return visibles.length ? `<dl class="est-metricas">${visibles.map(([clave, v]) => `<div><dt>${escapeHtml(t(clave))}</dt><dd>${typeof v === 'number' ? estNumero(v) : escapeHtml(v)}</dd></div>`).join('')}</dl>` : '';
}
const estAlto = (n, max) => `--est-valor:${n ? Math.max(2, n / max * 100) : 0}%`;
function estEvolucion(dominios, nota = ''){
  const puntos = serieEstadisticas(ESTADISTICAS.indice, dominios);
  if (!puntos.some(p => p.valor != null)) return '';
  const max = Math.max(1, ...puntos.map(p => p.valor || 0));
  // Cada barra abre su día: en móvil no hay title que leer al pasar.
  return `<h3>${escapeHtml(t('estEvolucion'))}</h3><div class="est-grafico"><span class="est-escala">${estNumero(max)}</span>
    <div class="est-barras" role="group" aria-label="${escapeHtml(t('estEvolucion'))}">${puntos.map(p => {
      const texto = `${estFecha(p.fecha)}: ${p.valor == null ? t('estSinDatos') : estNumero(p.valor)}`;
      return `<button type="button" data-est="fecha" data-valor="${p.fecha}"${p.fecha === ESTADISTICAS.fecha ? ' aria-current="date"' : ''}${p.valor == null ? ' disabled' : ''} style="${estAlto(p.valor, max)}" aria-label="${escapeHtml(texto)}" title="${escapeHtml(texto)}"><i></i></button>`;
    }).join('')}</div>
    <div class="est-eje"><span>${escapeHtml(estFecha(puntos[0].fecha, true))}</span><span>${escapeHtml(estFecha(puntos.at(-1).fecha, true))}</span></div></div>
    <p class="est-nota">${nota ? escapeHtml(nota) + ' ' : ''}${escapeHtml(t('estBarrasDia'))}</p>`;
}
// Sin hora de publicación, el titular cuenta a la estimada o a la de recogida.
function estHoras(porHora, sinHora = 0){
  if (!porHora?.some(n => n > 0)) return '';
  const max = Math.max(...porHora), pico = t('estPico', { hora: porHora.indexOf(max), n: estNumero(max) });
  return `<h3>${escapeHtml(t('estPorHora'))}</h3><div class="est-grafico"><span class="est-escala">${estNumero(max)}</span>
    <div class="est-barras est-horas" role="img" aria-label="${escapeHtml(pico)}">${porHora.map((n, h) => `<span style="${estAlto(n, max)}" title="${h} h: ${estNumero(n)}"><i></i></span>`).join('')}</div>
    <div class="est-eje">${[0, 6, 12, 18, 23].map(h => `<span>${h} h</span>`).join('')}</div></div>
    <p class="est-nota">${escapeHtml(pico)}${sinHora > 0 ? ' ' + escapeHtml(t('estHorasEstimadas', { n: estNumero(sinHora) })) : ''}</p>`;
}
function estSecciones(secciones){
  const filas = Object.entries(secciones || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (filas.length < 2) return '';
  return `<h3>${escapeHtml(t('estSecciones'))}</h3><ul class="est-ranking">${filas.map(([s, n]) =>
    `<li><span>${escapeHtml(s.replaceAll('-', ' '))}</span><b>${estNumero(n)}</b><i style="${estAlto(n, filas[0][1])}"></i></li>`).join('')}</ul>`;
}
// Familias y grupos, de más a menos titulares. Con una sola fila no hay desglose.
function estGrupos(dia, ids){
  const volumen = ds => sumarEstadisticas(dia.medios, ds).titulares ?? -1;
  const fila = (nombre, ds) => { const s = sumarEstadisticas(dia.medios, ds); return [nombre, estNumero(s.titulares), t('estNDe', { n: estNumero(s.conTitulares), total: estNumero(ds.length) })]; };
  const familias = [...familiasEstadisticas(ESTADISTICAS.indice.medios, ids, t('estSinSeguimiento'))]
    .map(([f, grupos]) => [f, grupos, [...grupos.values()].flat()]).sort((a, b) => volumen(b[2]) - volumen(a[2]));
  if (familias.length < 2 && (familias[0]?.[1].size || 0) < 2) return '';
  const filas = [];
  for (const [f, grupos, ds] of familias){
    if (grupos.size === 1){ filas.push(fila(escapeHtml([...grupos.keys()][0]), ds)); continue; }
    const abierta = ESTADISTICAS.familias.has(f);
    filas.push(fila(`<button type="button" data-est="familia" data-valor="${escapeHtml(f)}" aria-expanded="${abierta}">${escapeHtml(f)}</button>`, ds));
    if (abierta) for (const [g, gs] of [...grupos].sort((a, b) => volumen(b[1]) - volumen(a[1])))
      filas.push(fila(`<span class="est-subgrupo">${escapeHtml(g.slice(f.length).replace(/^ · /, '') || g)}</span>`, gs));
  }
  return `<h3>${escapeHtml(t('estPorGrupo'))}</h3>${estTabla(['estGrupo', 'estTitulares', 'estMediosTitulares'], filas)}`;
}
// Pasadas del recolector: solo cuando el día las trae. Un contador a cero
// (rescates, huecos, rachas) no se pinta; «48 de 48 buenas» sí informa.
function estRecogida(runs){
  if (!runs?.pasadas) return '';
  const errores = Object.entries(runs.errores || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return `<h3>${escapeHtml(t('estRecogida'))}</h3>`
    + (runs.ultimo_estado === 'fallo' ? `<p class="est-aviso">${escapeHtml(t('estUltimaFallo'))}</p>` : '')
    + estMetricas([
      ['estPasadasBuenas', t('estNDe', { n: estNumero(runs.ok), total: estNumero(runs.pasadas) })],
      ['estVentana', estDuracion(runs.ventana_min?.p50)],
      ['estRescates', runs.rescates || null],
      ['estRachaFallos', runs.racha_fallos_min ? estDuracion(runs.racha_fallos_min) : null],
    ])
    + (errores.length ? estTabla(['estError', 'estOcurrencias'], errores.map(([k, v]) => [escapeHtml(k), estNumero(v)])) : '');
}
function estSinDia(){
  const ultimo = estUltimoDia(ESTADISTICAS.indice);
  return `<p class="est-aviso">${escapeHtml(t('estSinDia'))}${ultimo && ultimo !== ESTADISTICAS.fecha ? ' ' + estBoton('fecha', t('estVerDia', { fecha: estFecha(ultimo) }), ultimo) : ''}</p>`;
}
function estResumen(){
  const dia = estDatoDia(), ids = estDominios();
  // La pestaña ya dice dónde se está: el título queda para el lector de pantalla y el foco.
  const titulo = `<h2 id="est-vista-titulo" class="sr-only" tabindex="-1">${escapeHtml(t('estResumen'))}</h2>`;
  if (!dia) return titulo + estSinDia() + estEvolucion(ids);
  const total = sumarEstadisticas(dia.medios, ids);
  return titulo + estMetricas([['estTitulares', total.titulares],
      ['estMediosTitulares', total.disponibles ? t('estNDe', { n: estNumero(total.conTitulares), total: estNumero(total.seleccionados) }) : null]])
    + estEvolucion(ids) + estHoras(total.porHora, total.titulares - total.conHora) + estGrupos(dia, ids);
}
// Miniatura de 30 días: deja ver de un vistazo un medio que se ha callado.
function estMiniatura(valores){
  const v = (valores || []).map(n => Number.isFinite(n) ? n : null);
  if (!v.some(n => n != null)) return '';
  const max = Math.max(1, ...v.filter(n => n != null)), paso = 100 / Math.max(1, v.length - 1), tramos = [[]];
  v.forEach((n, i) => n == null ? tramos.push([]) : tramos.at(-1).push(`${(i * paso).toFixed(1)},${(19 - n / max * 18).toFixed(1)}`));
  return `<svg class="est-mini" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">${tramos.filter(p => p.length).map(p => `<polyline points="${p.length > 1 ? p.join(' ') : p[0] + ' ' + p[0]}"/>`).join('')}</svg>`;
}
function estListaMedios(){
  const s = ESTADISTICAS, catalogo = s.indice.medios, dia = estDatoDia(), q = normalize(s.consulta);
  const nombre = d => catalogo[d]?.n || d, titulares = d => dia?.medios[d]?.pub?.titulares;
  // Cualquier pasada fallida cuenta; que fallara la última se dice aparte.
  const fallo = d => {
    const r = dia?.medios[d]?.runs;
    if (!(r?.pasadas > r?.ok)) return [];
    return [`${t('estConFallos')} (${t('estNDe', { n: estNumero(r.pasadas - r.ok), total: estNumero(r.pasadas) })})`,
      ...(r.ultimo_estado === 'fallo' ? [t('estFalloUltima')] : [])];
  };
  const ids = estDominios().filter(d => normalize(d + ' ' + nombre(d)).includes(q))
    .sort((a, b) => (titulares(b) ?? -1) - (titulares(a) ?? -1) || nombre(a).localeCompare(nombre(b)));
  return ids.length ? estTabla(['estMedio', 'estTitulares', 'estUltimos30'], ids.map(d => [
      estBoton('medio', nombre(d), d) + `<small>${escapeHtml([d, catalogo[d]?.g || t('estSinSeguimiento'), ...fallo(d)].join(' · '))}</small>`,
      estNumero(titulares(d)), estMiniatura(s.indice.serie[d]?.titulares),
    ])) : `<p>${escapeHtml(t('estSinMedios'))}</p>`;
}
// Al escribir solo cambia la lista: recrear el campo cierra el teclado del móvil.
function estDirectorio(){
  return `<h2 id="est-vista-titulo" class="sr-only" tabindex="-1">${escapeHtml(t('estMedios'))}</h2>
    <label class="est-buscar">${escapeHtml(t('estBuscarMedio'))}<input type="search" id="est-buscar-medio" value="${escapeHtml(ESTADISTICAS.consulta)}" autocomplete="off"></label>
    <div id="est-lista">${estListaMedios()}</div>`;
}
function estFicha(){
  const s = ESTADISTICAS, d = s.dominio, m = s.indice.medios[d], dia = estDatoDia(), pub = dia?.medios[d]?.pub, runs = dia?.medios[d]?.runs;
  const cabecera = `<div class="est-ficha-cab">${estBoton('medios', t('estVolverMedios'))}<h2 id="est-vista-titulo" tabindex="-1">${escapeHtml(m?.n || d)}</h2></div>
    <p class="est-nota">${[d, m?.g || t('estSinSeguimiento'), pub?.fuentes && Object.keys(pub.fuentes).join(', ')].filter(Boolean).map(escapeHtml).join(' · ')}</p>`;
  // Un medio que salió del catálogo conserva su ficha mientras tenga datos.
  const serie = s.indice.serie[d];
  if (!m && !serie && !dia?.medios[d]) return cabecera;
  // Un día con pasadas y sin titulares (feed caído) también entra en el histórico.
  const dias = s.indice.serie_dias.map((fecha, i) => ({ fecha, titulares: serie?.titulares?.[i], conHora: serie?.con_hora?.[i], pasadas: serie?.pasadas?.[i], ok: serie?.ok?.[i] }))
    .filter(x => Number.isFinite(x.titulares) || x.pasadas > 0);
  const conTitulares = dias.filter(x => Number.isFinite(x.titulares)), conPasadas = dias.some(x => x.pasadas > 0);
  const media = conTitulares.length ? Math.round(conTitulares.reduce((n, x) => n + x.titulares, 0) / conTitulares.length) : null;
  // La media es de los 30 días: va con su gráfica, no entre las cifras del día.
  const notaMedia = media == null ? '' : t('estMediaDias', { n: estNumero(media), dias: estNumero(conTitulares.length) });
  // Como en la serie, con titulares del medio la cuenta que falta es 0, no un hueco.
  const conHora = pub ? pub.fechas?.con_hora || 0 : null;
  const delDia = !dia ? estSinDia() : !pub ? `<p class="est-aviso">${escapeHtml(t('estSinDatos'))}</p>` : estMetricas([
    ['estTitulares', pub.titulares],
    ['estConHora', estPorcentaje(conHora, pub.titulares)],
    ['estHorario', pub.primera && pub.ultima ? `${pub.primera}–${pub.ultima}` : null],
    ['estRetraso', estDuracion(pub.retraso_min?.p50)],
  ]);
  return cabecera + delDia + estEvolucion([d], notaMedia) + estHoras(pub?.por_hora, pub ? pub.titulares - conHora : 0) + estSecciones(pub?.secciones) + estRecogida(runs)
    + (dias.length ? `<h3>${escapeHtml(t('estHistorico'))}</h3>` + estTabla(['estDia', 'estTitulares', 'estConHora', ...(conPasadas ? ['estPasadasBuenas'] : [])], dias.reverse().map(x => [
      estBoton('fecha', estFecha(x.fecha), x.fecha), estNumero(x.titulares), estPorcentaje(x.conHora, x.titulares) || '—',
      ...(conPasadas ? [x.pasadas > 0 ? t('estNDe', { n: estNumero(x.ok), total: estNumero(x.pasadas) }) : '—'] : [])])) : '');
}
// ‹ día › como en Plausible: se pasa de un día con datos al siguiente sin abrir
// el calendario. El calendario solo ofrece días con fichero publicado.
function estFiltros(){
  const s = ESTADISTICAS, ambito = estAmbito(), catalogo = s.indice?.medios || {};
  const option = (valor, texto) => `<option value="${escapeHtml(valor)}"${ambito === valor ? ' selected' : ''}>${escapeHtml(texto)}</option>`;
  // Las familias con varios grupos («Regional») van delante de los suyos.
  const grupos = [...new Set(Object.values(catalogo).flatMap(m => m.g.includes(' · ') ? [m.g, m.g.split(' · ')[0]] : [m.g]))].sort((a, b) => a.localeCompare(b));
  const dias = s.indice ? estDias(s.indice) : [];
  const anterior = dias.filter(f => f < s.fecha).at(-1), siguiente = dias.find(f => f > s.fecha), datos = estDatoDia();
  const paso = (id, valor, clave, icono) => `<button type="button" id="${id}" class="est-paso" data-est="fecha" data-valor="${valor || ''}"${valor ? '' : ' disabled'} aria-label="${escapeHtml(t(clave))}" title="${escapeHtml(t(clave))}">${ico(icono)}</button>`;
  const fecha = `<div class="est-dia">${paso('est-dia-anterior', anterior, 'estDiaAnterior', 'chevron-left')}
    <label><span class="sr-only">${escapeHtml(t('estDiaArchivo'))}</span><input id="est-fecha" type="date" value="${escapeHtml(s.fecha)}"${dias.length ? ` min="${dias[0]}" max="${dias.at(-1)}"` : ''}></label>
    ${paso('est-dia-siguiente', siguiente, 'estDiaSiguiente', 'chevron-right')}${datos && !datos.cerrado ? `<span class="est-revisable">${escapeHtml(t('estRevisable'))}</span>` : ''}</div>`;
  if (s.vista === 'medio') return `<div class="est-filtros">${fecha}</div>`;
  return `<div class="est-filtros">${fecha}<label><span class="sr-only">${escapeHtml(t('estAmbito'))}</span><select id="est-ambito">${option('todos', t('estTodos'))}
    ${PRESETS.lista.length ? `<optgroup label="${escapeHtml(t('estModos'))}">${PRESETS.lista.map(p => option('modo:' + p.id, p.nombre)).join('')}</optgroup>` : ''}
    ${grupos.length ? `<optgroup label="${escapeHtml(t('estGrupos'))}">${grupos.map(g => option('grupo:' + g, g)).join('')}</optgroup>` : ''}</select></label></div>`;
}
function pintarEstadisticas(){
  const s = ESTADISTICAS, panel = document.getElementById('estadisticas-panel');
  if (!panel) return;
  panel.hidden = !s.abierto;
  document.body.classList.toggle('estadisticas-abiertas', s.abierto);
  document.getElementById('btn-estadisticas')?.setAttribute('aria-expanded', String(s.abierto));
  if (!s.abierto) return;
  const foco = panel.contains(document.activeElement) ? document.activeElement : null;
  const idFoco = foco?.id, accionFoco = foco?.dataset.est, valorFoco = foco?.dataset.valor;
  // Mientras llega otro día se deja el contenido anterior, no un aviso de «sin datos».
  const previo = panel.querySelector('.est-contenido');
  panel.setAttribute('aria-label', t('estTitulo'));
  panel.setAttribute('aria-busy', String(s.cargando));
  let contenido = '';
  if (s.indice){
    if (estModo(estAmbito()) && !estDominios().length) contenido = `<p>${escapeHtml(t('estModoSinMedios'))}</p>`;
    else contenido = ({ resumen: estResumen, medios: estDirectorio, medio: estFicha }[s.vista] || estResumen)();
    if (s.cargando && !estDatoDia() && previo) contenido = previo.innerHTML;
  }
  const datos = estDatoDia(), generado = datos?.generado || s.indice?.generado;
  // Dos filas arriba: pestañas y acciones; luego día y selección. El nombre
  // del panel ya lo lleva su aria-label.
  panel.innerHTML = `<div class="est-cabecera">
    <nav class="est-nav" aria-label="${escapeHtml(t('estTitulo'))}">${['resumen', 'medios'].map(v => `<button type="button" data-est="${v}"${(v === 'medios' ? s.vista !== 'resumen' : s.vista === v) ? ' aria-current="page"' : ''}>${escapeHtml(t(v === 'resumen' ? 'estResumen' : 'estMedios'))}</button>`).join('')}</nav>
    <div class="est-acciones">
      <button type="button" data-est="renovar"${s.cargando ? ' disabled' : ''} aria-label="${escapeHtml(t('estActualizar'))}" title="${escapeHtml(t('estActualizar'))}">${ico('refresh-cw')}</button>
      <button type="button" data-est="cerrar" aria-label="${escapeHtml(t('estCerrar'))}" title="${escapeHtml(t('estCerrar'))}">${ico('x')}</button></div>
    ${estFiltros()}</div>
    <div class="est-cuerpo">
    <p class="est-estado" role="status">${s.error ? escapeHtml(t('estErrorCarga')) + ' ' + estBoton('renovar', t('estReintentar')) : s.cargando ? escapeHtml(t('estCargando')) : ''}</p>
    <div class="est-contenido">${contenido}</div>
    <p id="total-r2" class="est-nota est-pie" hidden></p>
    <p class="est-nota est-pie">${escapeHtml(t('estMetodo'))}${generado ? ' ' + escapeHtml(t('estGenerado', { fecha: estGenerado(generado) })) : ''}</p></div>`;
  renderTotalR2();
  // Repintar una tabla no debe expulsar el teclado al body.
  const siguiente = idFoco ? document.getElementById(idFoco) : [...panel.querySelectorAll('[data-est]')].find(b => b.dataset.est === accionFoco && b.dataset.valor === valorFoco);
  // Al llegar al primer o último día la flecha se desactiva: el foco pasa a la fecha.
  (siguiente?.disabled ? document.getElementById('est-fecha') : siguiente)?.focus({ preventScroll: true });
}

async function pedirEstadisticas(nombre, signal){
  const bases = [DATA_BASE, ...Object.values(BACKENDS).map(b => b.data)].filter((b, i, a) => a.indexOf(b) === i);
  let error;
  for (const base of bases){
    try {
      const r = await fetch(`${base}/${nombre}`, { cache: 'no-cache', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e){ if (signal.aborted) throw e; error = e; }
  }
  throw error;
}
async function cargarEstadisticas(renovar = false){
  const s = ESTADISTICAS, secuencia = ++s.secuencia;
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  s.cargando = true; s.error = false; pintarEstadisticas();
  try {
    const indice = renovar || !s.indice ? validarIndiceEstadisticas(await pedirEstadisticas('estadisticas.json', controller.signal)) : s.indice;
    // Sin día elegido, el último calculado: el de hoy casi nunca lo está aún.
    const fecha = s.fecha || estUltimoDia(indice) || estHoy();
    let dia = null;
    const cacheKey = indice.generado + '/' + fecha;
    if (indice.dias.some(d => d.fecha === fecha)){
      dia = !renovar && s.cache.get(cacheKey) || await pedirEstadisticas(`estadisticas-dia-${fecha}.json`, controller.signal);
      if (dia.fecha !== fecha || !dia.medios || typeof dia.medios !== 'object' || Array.isArray(dia.medios)
          || !Object.values(dia.medios).every(m => m && (!m.pub || Number.isFinite(m.pub.titulares) && m.pub.titulares >= 0))) throw new Error('formato');
    }
    if (secuencia !== s.secuencia || !s.abierto) return;
    // Publicar juntos índice y detalle: un fallo conserva el resultado anterior.
    s.indice = indice; s.dia = dia; s.fecha = fecha;
    if (dia){ if (s.cache.size >= 30) s.cache.clear(); s.cache.set(cacheKey, dia); }
    if (s.destino != null){
      const destino = s.destino; s.destino = null;
      if (destino === 'mis-medios') { s.ambito = ''; s.vista = 'medios'; }
      else if (destino){
        const hits = Object.entries(indice.medios).filter(([d, m]) => normDomain(d) === normDomain(destino) || normalize(m.n) === normalize(destino));
        if (hits.length === 1){ s.dominio = hits[0][0]; s.vista = 'medio'; }
        else if (!hits.length && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(destino)){ s.dominio = destino.toLowerCase(); s.vista = 'medio'; }
        else { s.ambito = 'todos'; s.consulta = destino; s.vista = 'medios'; }
      }
    }
  } catch (e){ if (secuencia === s.secuencia && !controller.signal.aborted) s.error = true; }
  finally { if (secuencia === s.secuencia){ s.cargando = false; pintarEstadisticas(); } }
}
function abrirEstadisticas(destino = '', origen = null){
  cerrarCalendario(false);
  const s = ESTADISTICAS;
  if (!s.abierto){ s.origen = origen || document.activeElement; s.scroll = window.scrollY; }
  s.abierto = true; s.destino = destino;
  if (destino && destino !== 'mis-medios') s.consulta = '';
  const carga = cargarEstadisticas(), secuencia = s.secuencia;
  carga.then(() => { if (s.abierto && s.secuencia === secuencia) document.getElementById('est-vista-titulo')?.focus({ preventScroll: true }); });
  estEncajar(true);
}
// Al abrir, y al cambiar de vista o de día desde más abajo, el panel vuelve a
// empezar bajo la cabecera: una ficha más corta no deja ver el feed.
function estEncajar(siempre = false){
  const barra = document.getElementById('barra-sup');
  requestAnimationFrame(() => {
    const p = document.getElementById('estadisticas-panel');
    if (!ESTADISTICAS.abierto || !p) return;
    const alto = barra?.getBoundingClientRect().height || 0, top = p.getBoundingClientRect().top - alto - 8;
    if (!siempre && top >= 0) return;
    barra?.classList.remove('cab-oculta');
    window.scrollTo({ top: Math.max(0, window.scrollY + top), behavior: 'auto' });
  });
}
function cerrarEstadisticas(volver = true){
  const s = ESTADISTICAS;
  if (!s.abierto) return;
  s.abierto = false; s.secuencia++; s.controller?.abort(); s.cargando = false;
  pintarEstadisticas();
  if (!volver) return;
  const origen = s.origen?.isConnected && s.origen.getClientRects().length ? s.origen : document.getElementById('btn-estadisticas');
  const menu = origen?.closest?.('#cab-menu');
  (menu && !menu.open ? menu.querySelector('summary') : origen)?.focus({ preventScroll: true });
  window.scrollTo({ top: s.scroll, behavior: 'auto' });
}

// Se consume la orden solo al confirmarla. Escribir «estadísticas» sigue
// siendo una búsqueda normal; el texto restante nunca contiene la orden.
function ordenEstadisticas(raw){
  // tokenizeQuery espera comillas cerradas. Mientras se completa un nombre,
  // tampoco enviar ese fragmento a la búsqueda de noticias.
  const abierto = raw.match(/(?:^|\s)(?:estadisticas|stats):"([^"]*)$/i);
  const incompleto = abierto && (raw.slice(0, abierto.index).match(/"/g) || []).length % 2 === 0 ? abierto : null;
  const todos = tokenizeQuery(incompleto ? raw.slice(0, incompleto.index) : raw), esOrden = x => /^(estadisticas|stats)$/i.test(x.prefix);
  const tokens = todos.filter(esOrden);
  if (!tokens.length && !incompleto) return null;
  return { destino: incompleto ? incompleto[1] : tokens.at(-1).text, resto: todos.filter(x => !esOrden(x)).map(x => x.raw).join(' ') };
}
function consumirOrdenEstadisticas(){
  const input = document.getElementById('buscar'), orden = ordenEstadisticas(input.value);
  if (!orden) return false;
  input.value = orden.resto; cerrarSugerencias();
  document.getElementById('buscar-clear').hidden = !input.value;
  aplicarFiltros(); abrirEstadisticas(orden.destino, input);
  return true;
}
function sugerenciasEstadisticas(raw){
  const m = raw.match(/(?:^|\s)(?:estadisticas|stats):(?:"([^"]*)|([^\s"]*))$/i);
  if (!m) return null;
  const q = normalize(m[1] ?? m[2]);
  const items = [{ value: '', label: t('estTitulo') }, { value: 'mis-medios', label: t('estMisMedios') },
    ...MEDIOS_UNICOS.map(m => ({ value: m.dominio, label: m.medio || m.dominio, meta: m.dominio }))];
  return items.filter(x => normalize(x.label + ' ' + x.value).includes(q)).slice(0, 8).map(x => ({ ...x, kind: 'estadisticas', tipo: t('estTitulo') }));
}
function wireEstadisticas(){
  const s = ESTADISTICAS, p = document.getElementById('estadisticas-panel');
  document.getElementById('btn-estadisticas').addEventListener('click', e => s.abierto ? cerrarEstadisticas() : abrirEstadisticas('', e.currentTarget));
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-est]');
    if (!b) return;
    const accion = b.dataset.est;
    if (accion === 'cerrar') return cerrarEstadisticas();
    if (accion === 'renovar') return void cargarEstadisticas(true);
    if (accion === 'fecha') { s.fecha = b.dataset.valor; estEncajar(); return void cargarEstadisticas(); }
    if (accion === 'familia') { const f = b.dataset.valor; s.familias.has(f) ? s.familias.delete(f) : s.familias.add(f); }
    else if (accion === 'medio') { s.destino = null; s.vista = 'medio'; s.dominio = b.dataset.valor; }
    else if (accion === 'resumen' || accion === 'medios') { s.destino = null; s.vista = accion; }
    pintarEstadisticas();
    if (accion !== 'familia') { document.getElementById('est-vista-titulo')?.focus({ preventScroll: true }); estEncajar(); }
  });
  p.addEventListener('change', e => {
    if (e.target.id === 'est-fecha'){
      if (!estFechaValida(e.target.value)) return;
      s.fecha = e.target.value; cargarEstadisticas();
    } else if (e.target.id === 'est-ambito') { s.destino = null; s.ambito = e.target.value; pintarEstadisticas(); }
  });
  p.addEventListener('input', e => {
    if (e.target.id !== 'est-buscar-medio') return;
    s.consulta = e.target.value;
    document.getElementById('est-lista').innerHTML = estListaMedios();
  });
  // El panel tapa el feed: escribir otra búsqueda vuelve a él sin mover el foco.
  document.getElementById('buscar').addEventListener('input', e => {
    if (s.abierto && !/(?:^|\s)(?:estadisticas|stats):/i.test(e.target.value)) cerrarEstadisticas(false);
  });
  document.getElementById('buscar').addEventListener('keydown', e => {
    if (e.key === 'Enter' && ordenEstadisticas(e.target.value)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (SUG_STATE.open && SUG_STATE.items[SUG_STATE.sel]?.kind === 'estadisticas') aplicarSugerencia(SUG_STATE.sel);
      else consumirOrdenEstadisticas();
    }
  }, true);
}
