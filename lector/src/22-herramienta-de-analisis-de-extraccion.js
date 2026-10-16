/* ============================================================
   18. HERRAMIENTA DE ANÁLISIS DE EXTRACCIÓN
   ============================================================ */
function openExtractionTool(siteIdx, onClose){
  const site = CFG.sites[siteIdx];
  if (!site) return;
  if (document.getElementById('il-extract-tool')) return;

  const work = deepClone(site.extraction || DEFAULT_EXTRACTION);
  let lastExtraction = null;
  let lastError = '';

  const root = temaDe(document.createElement('div'));
  root.id = 'il-extract-tool';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  const box = document.createElement('div');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('extractionTitle'));
  box.style.cssText = 'background:var(--bg);color:var(--fg);border-radius:12px;max-width:1000px;width:100%;' +
    'max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:24px';
  root.appendChild(box);
  document.body.appendChild(root);

  function close(){
    root.remove();
    if (onClose) onClose();
  }

  function runExtractionPreview(){
    lastError = '';
    let art;
    try { art = extractArticleWithConfig(work); }
    catch(e){ lastError = String(e.message || e); }
    if (!art || !art.rawBody || art.rawBody.length < (work.minChars || UI.extractMinChars)){
      lastExtraction = null;
      return null;
    }
    lastExtraction = art;
    return art;
  }

  function renderDiagnosticsHTML(diag){
    const cand = (diag.candidates || []).length
      ? diag.candidates.map(c =>
          '<tr style="border-bottom:1px solid var(--border)">' +
            '<td style="padding:6px 8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--preset)">' + esc(c.selector) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.count + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.words + ' ' + esc(t('extractionWordsShort')) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.imgs + ' ' + esc(t('extractionImgsShort')) + '</td>' +
            '<td style="padding:6px 8px"><button class="il-diag-use" data-sel="' + esc(c.selector) + '" ' +
              'style="padding:3px 8px;border:1px solid var(--btn-border);background:var(--bg);border-radius:4px;cursor:pointer;font-size:11px">' +
              esc(t('extractionUseThis')) + '</button></td>' +
          '</tr>').join('')
      : '<tr><td colspan="5" style="padding:12px;color:var(--muted);font-size:12px;text-align:center">' + esc(t('extractionNoCandidates')) + '</td></tr>';
    const overlays = (diag.overlays || []).length
      ? diag.overlays.map(o => '<code style="font-size:11px;background:var(--quote-bg);padding:2px 6px;border-radius:3px;margin:2px 4px 2px 0;display:inline-block">' +
          esc(o.tag + (o.id ? '#' + o.id : '') + (o.cls ? '.' + o.cls.split(/\s+/)[0] : '')) + ' (z-index: ' + esc(o.zIndex) + ')</code>').join('')
      : '<span style="color:var(--muted);font-size:12px">—</span>';
    const paywall = diag.paywall.detected
      ? '<span style="color:var(--block);font-weight:bold">' + esc(t('extractionPaywallYes')) + '</span>' +
        ' <span style="color:var(--muted);font-size:12px">(' + diag.paywall.indicators.map(esc).join(', ') + ')</span>'
      : '<span style="color:var(--preset);font-weight:bold">' + esc(t('extractionPaywallNo')) + '</span>';
    return (
      '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;background:var(--quote-bg)">' +
        '<h4 style="margin:0 0 10px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('extractionDiagnostics')) + '</h4>' +
        '<div style="font-size:13px;line-height:1.9">' +
          '<strong>' + esc(t('extractionTitleLbl')) + ':</strong> ' + esc(diag.title.text) +
            ' <span style="color:var(--muted);font-size:11px">(' + esc(diag.title.source) + ')</span><br>' +
          '<strong>' + esc(t('extractionMetricsLbl')) + ':</strong> ' +
            diag.metrics.p + ' &lt;p&gt; · ' + diag.metrics.img + ' img · ' +
            diag.metrics.words + ' ' + esc(t('extractionWordsShort')) + ' · ' +
            diag.metrics.textLen + ' ' + esc(t('extractionCharsShort')) + '<br>' +
          '<strong>' + esc(t('extractionPaywallLbl')) + ':</strong> ' + paywall + '<br>' +
          '<strong>' + esc(t('extractionOverlaysLbl')) + ':</strong> ' +
            (diag.overlays.length ? diag.overlays.length + ' ' + overlays : '<span style="color:var(--muted);font-size:12px">—</span>') +
        '</div>' +
        '<div style="margin-top:12px">' +
          '<div style="font-size:12px;color:var(--muted);margin-bottom:6px"><strong>' + esc(t('extractionCandidatesLbl')) + '</strong></div>' +
          '<div style="border:1px solid var(--border);border-radius:6px;background:var(--bg);overflow:hidden">' +
            '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
              '<thead><tr style="background:var(--btn-bg);font-size:11px;color:var(--muted)">' +
                '<th style="text-align:left;padding:6px 8px">Selector</th>' +
                '<th style="text-align:right;padding:6px 8px">n</th>' +
                '<th style="text-align:right;padding:6px 8px">' + esc(t('extractionWordsShort')) + '</th>' +
                '<th style="text-align:right;padding:6px 8px">' + esc(t('extractionImgsShort')) + '</th>' +
                '<th></th>' +
              '</tr></thead>' +
              '<tbody>' + cand + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPreviewHTML(){
    const art = runExtractionPreview();
    if (!art){
      return '<div style="border:1px dashed var(--btn-border);border-radius:8px;padding:16px;color:var(--muted);font-size:13px;text-align:center">' +
        esc(t('extractionPreviewEmpty')) + (lastError ? ' · ' + esc(lastError) : '') +
      '</div>';
    }
    const words = countWords(art.rawBody);
    const chars = art.rawBody.length;
    const preview = art.rawBody.slice(0, 800).replace(/\s+/g,' ').trim() + (art.rawBody.length > 800 ? '…' : '');
    return (
      '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--bg)">' +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:8px">' +
          '<span><strong>' + esc(t('extractionTitleLbl')) + ':</strong> ' + esc(art.headline || '—') + '</span>' +
          '<span><strong>' + esc(t('extractionMetricsLbl')) + ':</strong> ' + words + ' ' + esc(t('extractionWordsShort')) + ' · ' + chars + ' ' + esc(t('extractionCharsShort')) + '</span>' +
          '<span><strong>' + esc(t('extractionSourcePrefix')) + ':</strong> ' + esc(art._source || '—') + '</span>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.5;color:var(--fg);max-height:180px;overflow:auto;padding:10px;background:var(--quote-bg);border-radius:6px;white-space:pre-wrap">' +
          esc(preview) +
        '</div>' +
      '</div>'
    );
  }

  function render(){
    const diag = analyzeCurrentPage();
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<div>' +
          '<h2 style="margin:0;font-size:20px">' + esc(t('extractionTitle')) + '</h2>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:2px">' + esc(site.domain) + '</div>' +
        '</div>' +
        '<button class="il-et-close" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('close')) + '</button>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + esc(t('extractionMode')) + '</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="il-et-mode" data-mode="auto" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'auto' ? 'border:2px solid var(--accent);' : 'border:1px solid var(--btn-border);') +
            'background:var(--bg);border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeAuto')) + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + esc(t('extractionHintAuto')) + '</div>' +
          '</button>' +
          '<button class="il-et-mode" data-mode="selector" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'selector' ? 'border:2px solid var(--accent);' : 'border:1px solid var(--btn-border);') +
            'background:var(--bg);border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeSelector')) + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + esc(t('extractionHintSelector')) + '</div>' +
          '</button>' +
          '<button class="il-et-mode" data-mode="all" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'all' ? 'border:2px solid var(--accent);' : 'border:1px solid var(--btn-border);') +
            'background:var(--bg);border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeAll')) + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + esc(t('extractionHintAll')) + '</div>' +
          '</button>' +
        '</div>' +
      '</div>' +

      (work.mode === 'selector' ?
      '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px">' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionRoot')) + '</label>' +
          '<div style="display:flex;gap:6px">' +
            '<input class="il-et-root" value="' + esc(work.root) + '" placeholder="' + esc(t('extractionRootPh')) + '" ' +
              'style="flex:1;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">' +
            '<button class="il-et-pick" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer;white-space:nowrap">' +
              esc(t('extractionPickBtn')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionExclude')) + '</label>' +
          '<input class="il-et-exclude" value="' + esc(work.exclude) + '" placeholder="' + esc(t('extractionExcludePh')) + '" ' +
            'style="width:100%;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionMinChars')) + '</label>' +
          '<input type="number" class="il-et-min" value="' + work.minChars + '" min="20" max="10000" ' +
            'style="width:120px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;font-size:13px">' +
        '</div>' +
      '</div>' : '') +

      renderDiagnosticsHTML(diag) +

      '<div style="margin-bottom:10px">' +
        '<div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' +
          esc(t('extractionPreviewLbl')) + '</div>' +
        renderPreviewHTML() +
      '</div>' +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px;border-top:1px solid var(--border);padding-top:14px">' +
        '<button class="il-et-refresh" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' +
          esc(t('extractionDiagnoseBtn')) + '</button>' +
        '<button class="il-et-test" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' +
          esc(t('extractionTestBtn')) + '</button>' +
        '<button class="il-et-cancel" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' +
          esc(t('extractionCancelBtn')) + '</button>' +
        '<button class="il-et-save" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer;font-weight:bold">' +
          esc(t('extractionSaveBtn')) + '</button>' +
      '</div>';

    wire();
  }

  function wire(){
    box.querySelector('.il-et-close').onclick = close;
    box.querySelector('.il-et-cancel').onclick = close;

    box.querySelectorAll('.il-et-mode').forEach(b => {
      b.onclick = () => { work.mode = b.dataset.mode; render(); };
    });

    const rootInput = box.querySelector('.il-et-root');
    const excludeInput = box.querySelector('.il-et-exclude');
    const minInput = box.querySelector('.il-et-min');
    if (rootInput) rootInput.oninput = () => { work.root = rootInput.value.trim(); };
    if (excludeInput) excludeInput.oninput = () => { work.exclude = excludeInput.value.trim(); };
    if (minInput) minInput.oninput = () => {
      const v = parseInt(minInput.value, 10);
      if (!isNaN(v) && v > 0) work.minChars = v;
    };

    const pickBtn = box.querySelector('.il-et-pick');
    if (pickBtn) pickBtn.onclick = () => {
      root.style.display = 'none';
      startVisualPicker(
        (sel) => {
          work.root = sel;
          work.mode = 'selector';
          root.style.display = '';
          render();
        },
        () => {
          root.style.display = '';
          render();
        }
      );
    };

    box.querySelectorAll('.il-diag-use').forEach(btn => {
      btn.onclick = () => {
        work.mode = 'selector';
        work.root = btn.dataset.sel;
        render();
      };
    });

    box.querySelector('.il-et-refresh').onclick = () => render();
    box.querySelector('.il-et-test').onclick = () => {
      const art = runExtractionPreview();
      if (!art){
        toast(t('extractionTestFailed'), 2400);
        return;
      }
      close();
      setTimeout(() => openReader(art), 100);
    };
    box.querySelector('.il-et-save').onclick = () => {
      CFG.sites[siteIdx].extraction = {
        mode: work.mode,
        root: work.root,
        exclude: work.exclude,
        minChars: work.minChars
      };
      saveCfg(CFG);
      toast(t('extractionSaved').replace('{X}', site.domain), 2000);
      close();
    };
  }

  render();
}

