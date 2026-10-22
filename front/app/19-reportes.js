/* ═══════════════════════════════════════════════════════════════
   REPORTES
   ═══════════════════════════════════════════════════════════════ */
let REPORTE_CONTEXTO = null;

function abrirReporte(contexto){
  REPORTE_CONTEXTO = contexto || null;
  const ctxBox = $('#rep-contexto');
  if (!ctxBox) return;
  const ctx = REPORTE_CONTEXTO;
  if (!ctx){
    ctxBox.className = 'rep-ctx empty';
    ctxBox.textContent = t('repCtxEmpty');
  } else {
    ctxBox.className = 'rep-ctx';
    const rows = [
      ctx.medio     ? `<div><strong>${escapeHtml(t('repCtxMedio'))}:</strong> ${escapeHtml(ctx.medio)}</div>` : '',
      ctx.dominio   ? `<div><strong>Domain:</strong> ${escapeHtml(ctx.dominio)}</div>` : '',
      ctx.grupo     ? `<div><strong>${escapeHtml(t('repCtxGrupo'))}:</strong> ${escapeHtml(ctx.grupo)}</div>` : '',
      ctx.tipo      ? `<div><strong>${escapeHtml(t('repCtxTipo'))}:</strong> ${escapeHtml(ctx.tipo)}</div>` : '',
      ctx.titular   ? `<div><strong>${escapeHtml(t('repCtxTitular'))}:</strong> ${escapeHtml(ctx.titular)}</div>` : '',
      ctx.enlace    ? `<div><strong>${escapeHtml(t('repCtxEnlace'))}:</strong> <a href="${escapeHtml(ctx.enlace)}" target="_blank" rel="noopener" style="color:var(--accent)">${escapeHtml(ctx.enlace)}</a></div>` : '',
      ctx.fecha     ? `<div><strong>${escapeHtml(t('repCtxFecha'))}:</strong> ${escapeHtml(ctx.fecha)}</div>` : '',
      ctx.fuente    ? `<div><strong>${escapeHtml(t('repCtxFuente'))}:</strong> ${escapeHtml(ctx.fuente)}</div>` : '',
    ].filter(Boolean).join('');
    ctxBox.innerHTML = rows || `<div>${escapeHtml(t('repCtxEmpty'))}</div>`;
  }
  $('#rep-motivo').value = 'no_se_muestra';
  $('#rep-detalles').value = '';
  abrirPanel('panel-reporte');
}

function construirTextoReporte(){
  const motivoSel = $('#rep-motivo');
  const motivoTxt = motivoSel.options[motivoSel.selectedIndex].textContent;
  const detalles = $('#rep-detalles').value.trim();
  const incluirConfig = $('#rep-config-incluir').checked;

  const L = [];
  L.push(`### ${t('repTitle')}`);
  L.push('');
  L.push(`**${t('repMotivoLbl')}:** ${motivoTxt}`);
  L.push(`**${t('repFecha')}:** ${new Date().toISOString()}`);
  L.push('');

  if (detalles){
    L.push(`**${t('repDetallesLbl')}:**`);
    L.push(detalles);
    L.push('');
  }

  if (REPORTE_CONTEXTO){
    const c = REPORTE_CONTEXTO;
    L.push(`### ${t('repContexto')}`);
    if (c.medio)   L.push(`- **${t('repCtxMedio')}:** ${c.medio}`);
    if (c.dominio) L.push(`- **Domain:** ${c.dominio}`);
    if (c.grupo)   L.push(`- **${t('repCtxGrupo')}:** ${c.grupo}`);
    if (c.tipo)    L.push(`- **${t('repCtxTipo')}:** ${c.tipo}`);
    if (c.fuente)  L.push(`- **${t('repCtxFuente')}:** ${c.fuente}`);
    if (c.fecha)   L.push(`- **${t('repCtxFecha')}:** ${c.fecha}`);
    if (c.titular) L.push(`- **${t('repCtxTitular')}:** ${c.titular}`);
    if (c.enlace)  L.push(`- **${t('repCtxEnlace')}:** ${c.enlace}`);
    L.push('');
  }

  L.push(`- **${t('repCtxIdioma')}:** ${ACCES.lang}`);

  if (incluirConfig){
    L.push('');
    L.push(`### ${t('repCtxConfig')}`);
    L.push('```json');
    L.push(JSON.stringify({
      acces: ACCES,
      preset: PRESET,
      presetActivo: PRESET_ACTIVO,
      sites: [...SITES.entries()].map(([d, s]) => ({ domain: d, ...s }))
    }, null, 2));
    L.push('```');
  }

  return L.join('\n');
}

function construirTituloReporte(){
  const motivoSel = $('#rep-motivo');
  const motivoTxt = motivoSel.options[motivoSel.selectedIndex].textContent;
  if (REPORTE_CONTEXTO && REPORTE_CONTEXTO.medio){
    return `[Reporte] ${motivoTxt} — ${REPORTE_CONTEXTO.medio}${REPORTE_CONTEXTO.grupo ? ' (' + REPORTE_CONTEXTO.grupo + ')' : ''}`;
  }
  return `[Reporte] ${motivoTxt}`;
}

function reportarViaGithub(){
  const title = encodeURIComponent(construirTituloReporte());
  const body  = encodeURIComponent(construirTextoReporte());
  const url = `https://github.com/${REPORT_REPO}/issues/new?title=${title}&body=${body}`;
  try{
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) throw new Error('popup blocked');
  }catch(e){ toast(t('repErrGithub'), 3200); }
}
function reportarViaEmail(){
  const subject = encodeURIComponent(construirTituloReporte());
  const body    = encodeURIComponent(construirTextoReporte());
  window.location.href = `mailto:${REPORT_EMAIL}?subject=${subject}&body=${body}`;
}
function copiarReporte(){
  const texto = construirTextoReporte();
  const done = () => toast(t('repCopiado'), 1800);
  const fb = () => {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch(e){ toast('No se pudo copiar', 2000); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(done, fb);
  } else fb();
}
