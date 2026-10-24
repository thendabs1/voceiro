/* ============================================================
   20. RSVP
   ============================================================ */
function openRSVP(ov, rawBody){
  const existente = ov.querySelector('#il-rsvp-root');
  if (existente){ existente.focus(); return; }
  const allWords = rawBody.split(/\s+/).filter(Boolean);
  if (!allWords.length) return;
  const WPL = UI.rsvpWPL;
  const lines = [];
  for (let i = 0; i < allWords.length; i += WPL) lines.push(allWords.slice(i, i + WPL).join(' '));
  const escW = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const root = document.createElement('div');
  root.id = 'il-rsvp-root';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('teleprompter'));
  root.style.cssText = 'position:fixed;inset:0;background:var(--bg);color:var(--fg);z-index:25;display:flex;flex-direction:column;';

  const linesHtml = lines.map(l =>
    '<div class="il-tp-line" style="padding:6px 24px;display:flex;align-items:center;justify-content:center;' +
    'text-align:center;color:var(--fg);opacity:.5;transition:color .35s ease,opacity .35s ease,font-weight .35s ease">' +
    escW(l) + '</div>').join('');

  root.innerHTML =
    '<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:20px 20px 0">' +
      '<div id="il-tp-viewport" class="il-content" style="width:100%;max-width:var(--w,720px);height:100%;position:relative;overflow:hidden;' +
        '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 30%,black 70%,transparent 100%);' +
        'mask-image:linear-gradient(to bottom,transparent 0%,black 30%,black 70%,transparent 100%)">' +
        '<div id="il-tp-inner" style="width:100%;will-change:transform">' + linesHtml + '</div>' +
        '<div style="position:absolute;top:50%;left:8%;right:8%;height:1px;background:var(--accent);opacity:.28;pointer-events:none;transform:translateY(-1px)"></div>' +
      '</div>' +
    '</div>' +
    '<div style="font-family:-apple-system,sans-serif;padding:18px 20px 24px;display:flex;flex-direction:column;align-items:center;gap:14px">' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">' +
        '<button id="il-rsvp-sl">🐢 -50</button>' +
        '<button id="il-rsvp-pl" class="il-primary" style="min-width:120px">' + esc(t('pause')) + '</button>' +
        '<button id="il-rsvp-fs">🐇 +50</button>' +
      '</div>' +
      '<div style="color:var(--muted);font-size:14px">' + esc(t('speed')) + ': <span id="il-rsvp-v">300</span> ' + esc(t('ppm')) + '</div>' +
      '<div style="width:100%;max-width:600px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">' +
        '<div id="il-rsvp-bar" style="height:100%;background:var(--accent);width:0%"></div></div>' +
    '</div>' +
    '<button id="il-rsvp-cls" style="position:absolute;top:20px;right:20px;font-size:16px;font-family:-apple-system,sans-serif">' + esc(t('exit')) + '</button>';

  ov.appendChild(root);
  const viewport = root.querySelector('#il-tp-viewport');
  const inner = root.querySelector('#il-tp-inner');
  const lineEls = Array.prototype.slice.call(inner.querySelectorAll('.il-tp-line'));
  const pBtn = root.querySelector('#il-rsvp-pl');
  const vEl = root.querySelector('#il-rsvp-v');
  const barEl = root.querySelector('#il-rsvp-bar');

  let wpm = 300, lineIdx = 0, playing = false, timer = null, rafId = null, activeIdx = -1;

  function offsetFor(idx){
    if (idx < 0) idx = 0;
    if (idx >= lineEls.length) idx = lineEls.length - 1;
    const vh = viewport.clientHeight;
    let top = 0;
    for (let i = 0; i < idx; i++) top += lineEls[i].getBoundingClientRect().height;
    const lh = lineEls[idx].getBoundingClientRect().height;
    return vh / 2 - lh / 2 - top;
  }
  function setActive(i){
    if (i === activeIdx) return;
    if (activeIdx >= 0 && lineEls[activeIdx]){
      lineEls[activeIdx].style.color = 'var(--fg)';
      lineEls[activeIdx].style.opacity = '0.5';
      lineEls[activeIdx].style.fontWeight = 'normal';
    }
    if (lineEls[i]){
      lineEls[i].style.color = 'var(--accent)';
      lineEls[i].style.opacity = '1';
      lineEls[i].style.fontWeight = 'bold';
    }
    activeIdx = i;
  }
  function rAFHighlight(){
    if (!playing){ rafId = null; return; }
    const cy = viewport.clientHeight / 2;
    const vpTop = viewport.getBoundingClientRect().top;
    const start = Math.max(0, lineIdx - 2);
    const end = Math.min(lineEls.length, lineIdx + 3);
    let best = activeIdx, bestD = Infinity;
    for (let k = start; k < end; k++){
      const r = lineEls[k].getBoundingClientRect();
      const lc = (r.top + r.bottom) / 2 - vpTop;
      const d = Math.abs(lc - cy);
      if (d < bestD){ bestD = d; best = k; }
    }
    setActive(best);
    rafId = requestAnimationFrame(rAFHighlight);
  }
  function scheduleNext(){
    clearTimeout(timer);
    if (!playing) return;
    const lastWord = lines[lineIdx].split(' ').slice(-1)[0] || '';
    let dur = (60000 * WPL) / wpm;
    if (/[.!?]$/.test(lastWord)) dur *= 1.7;
    else if (/[,;:]$/.test(lastWord)) dur *= 1.3;
    inner.style.transition = 'transform ' + dur + 'ms linear';
    timer = setTimeout(() => {
      if (lineIdx >= lines.length - 1){ stop(); pBtn.textContent = t('repeat'); return; }
      lineIdx++;
      inner.style.transform = 'translateY(' + offsetFor(lineIdx) + 'px)';
      barEl.style.width = ((lineIdx / Math.max(1, lines.length - 1)) * 100) + '%';
      scheduleNext();
    }, dur);
  }
  function play(){
    if (!root.isConnected) return;
    playing = true; pBtn.textContent = t('pause');
    if (!rafId) rafId = requestAnimationFrame(rAFHighlight);
    scheduleNext();
  }
  function stop(){
    playing = false; pBtn.textContent = t('play');
    clearTimeout(timer);
    if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
    setActive(lineIdx);
  }
  pBtn.onclick = () => {
    if (playing){ stop(); return; }
    if (pBtn.textContent === t('repeat')){
      lineIdx = 0;
      inner.style.transition = 'none';
      inner.style.transform = 'translateY(' + offsetFor(0) + 'px)';
      barEl.style.width = '0%';
      activeIdx = -1; setActive(0);
    }
    play();
  };
  root.querySelector('#il-rsvp-sl').onclick = () => {
    wpm = Math.max(UI.rsvpWpmMin, wpm - UI.rsvpWpmStep); vEl.textContent = wpm;
    if (playing){ clearTimeout(timer); scheduleNext(); }
  };
  root.querySelector('#il-rsvp-fs').onclick = () => {
    wpm = Math.min(UI.rsvpWpmMax, wpm + UI.rsvpWpmStep); vEl.textContent = wpm;
    if (playing){ clearTimeout(timer); scheduleNext(); }
  };
  const cerrar = () => {
    stop(); root.remove(); delete ov.__cerrarRSVP;
    if (ov.isConnected) ov.querySelector('#il-titulo')?.focus({ preventScroll: true });
  };
  ov.__cerrarRSVP = cerrar;
  root.querySelector('#il-rsvp-cls').onclick = cerrar;
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cerrar(); }
  });
  root.focus();

  requestAnimationFrame(() => {
    if (!root.isConnected) return;
    inner.style.transition = 'none';
    inner.style.transform = 'translateY(' + offsetFor(0) + 'px)';
    setActive(0);
    requestAnimationFrame(() => play());
  });
}

