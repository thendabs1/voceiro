// Vista de consultas de tenis. No usa los lados local/visitante ni cambia la agenda.
function idTenisConsultaValido(id){
  const p = /^espn:tenis\/(atp|wta)\/(\d{4})(\d{2})(\d{2})\/([1-9]\d{0,8}-\d{4})\/([1-9]\d{0,11})$/.exec(id || '');
  return !!p && p[0] === id && fechaValida(`${p[2]}-${p[3]}-${p[4]}`) && `${p[2]}-${p[3]}-${p[4]}` >= '0001-01-01';
}
const participantesTenis = lado => (lado?.participantes || []).map(n => n || t('conParticipantePendiente')).join(' / ');
const tituloTenis = f => (f.lados || []).map(participantesTenis).join(' · ');
const condicionTenis = f => f.condicion === 'retirada' ? t('conRetiradaTenis')
  : f.condicion === 'incomparecencia' ? t('conIncomparecenciaTenis') : f.condicion || '';
const estadoTenis = f => condicionTenis(f) || estadoTextoPartido(f.estado);
const contextoTenis = f => [f.torneo?.nombre, f.cuadro?.nombre, f.ronda].filter(Boolean).join(' · ');

function parcialesTenis(f){
  const lados = f.lados || [];
  const cantidad = Math.max(0, ...lados.map(l => l.sets?.length || 0));
  if (!cantidad) return '';
  const columnas = Array.from({ length: cantidad }, (_, i) => i);
  return `<div class="consulta-tabla-scroll"><table class="consulta-parciales"><caption>${escapeHtml(t('conParciales'))}</caption>
    <thead><tr><th scope="col">${escapeHtml(t('conParticipantesTenis'))}</th>${columnas.map(i => `<th scope="col">${escapeHtml(t('conParcialTenis', { n: i + 1 }))}</th>`).join('')}</tr></thead>
    <tbody>${lados.map(l => `<tr><th scope="row">${equipoConsulta(participantesTenis(l))}${l.ganador === true ? ` <small>(${escapeHtml(t('conGanadorTenis'))})</small>` : ''}</th>${columnas.map(i => {
      const s = l.sets?.[i];
      return `<td>${escapeHtml(s?.juegos ?? '—')}${s?.desempate != null ? ` <sup title="${escapeHtml(t('conDesempateTenis', { n: s.desempate }))}" aria-label="${escapeHtml(t('conDesempateTenis', { n: s.desempate }))}">${escapeHtml(s.desempate)}</sup>` : ''}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function filaTenis(f){
  const nombres = (f.lados || []).map(participantesTenis);
  const contexto = contextoTenis(f);
  const cab = [estadoTenis(f), f.inicio ? fechaPartidoConsulta(f.inicio) : t('conHoraSinConfirmar')].filter(Boolean).join(' · ');
  const contenido = `<span class="consulta-estado">${escapeHtml(cab)}</span>${nombres.map((n, i) => `<span>${equipoConsulta(n)}</span><b>${
    (f.lados[i].sets || []).map(s => `${escapeHtml(s.juegos ?? '—')}${s.desempate != null ? `<sup title="${escapeHtml(t('conDesempateTenis', { n: s.desempate }))}" aria-label="${escapeHtml(t('conDesempateTenis', { n: s.desempate }))}">${escapeHtml(s.desempate)}</sup>` : ''}`).join(' · ') || '—'}</b>`).join('')}
    ${contexto ? `<span class="consulta-estado">${escapeHtml(contexto)}</span>` : ''}`;
  const abrir = idTenisConsultaValido(f.id);
  return `<li${claseMarcada(nombres.some(casaEquipo))} data-estado="${escapeHtml(f.estado || '')}">${abrir ? `<button type="button" data-accion="partido" data-id="${escapeHtml(f.id)}" aria-label="${escapeHtml(t('conAbrirPartido', { x: nombres.join(' · ') }))}">${contenido}</button>` : contenido}</li>`;
}

VISTAS_CONSULTA.encuentro_tenis = {
  idValido: idTenisConsultaValido,
  fila: filaTenis,
  admiteResultados: f => ['atp', 'wta'].includes(f.competicion),
  resultados(f){
    const partidos = f.partidos || [];
    return { titulo: `${CONSULTA_DEPORTES[f.competicion]} · ${tn('conEncuentrosTenis', partidos.length)}`,
      linea: f.fecha || '', cuerpo: `<p class="consulta-nota">${escapeHtml(t('conFechaTenis'))}</p>
        <ul class="consulta-partidos">${partidos.map(filaTenis).join('')}</ul>` };
  },
  ficha(f){
    const ganadores = (f.lados || []).filter(l => l.ganador === true).map(participantesTenis);
    const parciales = parcialesTenis(f);
    return { titulo: tituloTenis(f),
      linea: [contextoTenis(f), f.inicio ? fechaPartidoConsulta(f.inicio) : t('conHoraSinConfirmar'), estadoTenis(f)].filter(Boolean).join(' · '),
      cuerpo: `${ganadores.length ? `<p>${escapeHtml(t('conGanadorTenis'))}: ${escapeHtml(ganadores.join(' · '))}</p>` : ''}
        ${parciales}${parciales ? `<p class="consulta-nota">${escapeHtml(t('conParcialesTenis'))}</p>` : ''}
        ${f.estado_original ? `<p class="consulta-nota">${escapeHtml(t('conEstadoFuenteTenis', { x: f.estado_original }))}</p>` : ''}` };
  },
};
