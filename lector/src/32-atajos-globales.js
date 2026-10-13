/* ============================================================
   25. ATAJOS GLOBALES
   ============================================================ */
function executeGlobalAction(action){
  switch (action){
    case 'openReader': {
      if (document.getElementById('il-full')) return;
      activateReader();
      break;
    }
    case 'openQueue':    openSettings('pendientes'); break;
    case 'openMedia':    openSettings('sites'); break;
    case 'openSettings': openSettings(); break;
    case 'abrirEn': {
      const existing = document.getElementById('il-global-servicios-dd');
      if (existing){ existing.remove(); return; }
      const dd = crearDesplegableServicios({ position: 'fixed-top-right', onClose: () => dd.remove() });
      dd.id = 'il-global-servicios-dd';
      document.body.appendChild(dd);
      setTimeout(() => {
        const close = (ev) => {
          if (!dd.contains(ev.target)){
            dd.remove();
            document.removeEventListener('mousedown', close);
          }
        };
        document.addEventListener('mousedown', close);
      }, 0);
      break;
    }
    case 'toggleTextOnly': {
      const rule = ensureSiteRule();
      rule.textOnly = !rule.textOnly;
      saveCfg(CFG);
      const ov2 = document.getElementById('il-full');
      if (ov2){
        ov2.classList.toggle('il-textonly', rule.textOnly);
        const btn = ov2.querySelector('.il-textonly-btn');
        if (btn){
          btn.textContent = rule.textOnly ? '📝' : '🖼';
          btn.title = rule.textOnly ? t('textOnlyOn') : t('textOnlyOff');
          btn.classList.toggle('il-active', rule.textOnly);
        }
      }
      toast(rule.textOnly ? t('textOnlyOn') : t('textOnlyOff'), 1500);
      break;
    }
    case 'openVoceiro': {
      window.open(VOCEIRO_URL, '_blank', 'noopener,noreferrer');
      break;
    }
  }
}

function globalKeyHandler(e){
  // En Voceiro mandan sus atajos (Alt+P, Alt+M, Alt+B…): los del lector
  // no actúan allí. La revisión completa de atajos, antes de publicar.
  if (esVoceiro()) return;
  const tg = e.target;
  if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
  if (document.getElementById('il-settings')) return;
  if (document.getElementById('il-extract-tool')) return;
  if (isPickerActive()) return;

  const nk = normalizeKey(e);
  if (!hasSafeModifier(nk)) return;

  const action = findActionByKey('global', nk);
  if (!action) return;
  e.preventDefault();
  e.stopPropagation();
  executeGlobalAction(action);
}

