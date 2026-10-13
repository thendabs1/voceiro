/* ============================================================
   11b. ATAJOS DE TECLADO — infraestructura
   ============================================================ */
const RESERVED_BROWSER_KEYS = new Set([
  'ctrl+w','ctrl+t','ctrl+n','ctrl+shift+t','ctrl+shift+n','ctrl+shift+w',
  'meta+w','meta+t','meta+n','meta+shift+t','meta+shift+n','meta+shift+w',
  'ctrl+tab','ctrl+shift+tab',
  'ctrl+r','f5','ctrl+shift+r','ctrl+f5','ctrl+l','alt+left','alt+right','alt+home',
  'f12','ctrl+shift+i','ctrl+shift+j','ctrl+shift+c','ctrl+shift+k',
  'meta+alt+i','meta+alt+j','meta+alt+c',
  'f11','ctrl+0','ctrl+-','ctrl+=','ctrl++','ctrl+shift+0',
  'alt+f4','ctrl+q','meta+q',
  'ctrl+p','ctrl+s',
  'ctrl+d','ctrl+shift+o','ctrl+h','ctrl+j','ctrl+shift+delete',
  'ctrl+c','ctrl+v','ctrl+x','ctrl+a','ctrl+z','ctrl+y',
  'ctrl+f','ctrl+g','ctrl+shift+g','f3',
  'ctrl+u','ctrl+shift+u','alt+d'
]);

function normalizeKey(e){
  let key = String(e.key || '').toLowerCase();
  if (key === ' ' || e.code === 'Space') key = 'space';
  if (key === 'esc') key = 'escape';
  if (key === 'del') key = 'delete';
  if (key === 'ins') key = 'insert';
  if (key === 'pgup' || key === 'pageup') key = 'pageup';
  if (key === 'pgdn' || key === 'pagedown') key = 'pagedown';
  if (key === 'left') key = 'arrowleft';
  if (key === 'right') key = 'arrowright';
  if (key === 'up') key = 'arrowup';
  if (key === 'down') key = 'arrowdown';
  if (key === 'return' || key === 'enter') key = 'enter';

  const parts = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey && (key.length > 1 || /^[a-z0-9]$/.test(key))){
    parts.push('shift');
  }
  if (e.metaKey) parts.push('meta');

  parts.push(key);
  return parts.join('+');
}

function hasSafeModifier(nk){
  const parts = String(nk).split('+');
  return parts.includes('ctrl') || parts.includes('alt') || parts.includes('meta');
}
function findActionByKey(scope, nk){
  const map = CFG.shortcuts && CFG.shortcuts[scope];
  if (!map) return null;
  // Solo acciones que existen: una configuración importada de otra versión
  // puede traer acciones que ya no están, y no deben tragarse teclas.
  for (const action of Object.keys(DEFAULT_CFG.shortcuts[scope] || {})){
    if (action === 'close') continue;
    const keys = map[action];
    if (Array.isArray(keys) && keys.some(k => k.toLowerCase() === nk)) return action;
  }
  return null;
}
function findShortcutConflict(scope, except, nk){
  const map = CFG.shortcuts && CFG.shortcuts[scope];
  if (!map) return null;
  for (const action of Object.keys(map)){
    if (action === except) continue;
    if (action === 'close') continue;
    const keys = map[action];
    if (Array.isArray(keys) && keys.some(k => k.toLowerCase() === nk)) return action;
  }
  return null;
}
function formatShortcut(nk){
  if (!nk) return '';
  const labels = {
    ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta',
    escape: 'Esc', space: 'Space', enter: 'Enter',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    pageup: 'PgUp', pagedown: 'PgDn', delete: 'Del', backspace: '⌫', tab: 'Tab'
  };
  return String(nk).split('+').map(p => {
    if (labels[p]) return labels[p];
    if (p.length === 1) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' + ');
}
function shortcutActionLabel(action){
  return t('sc' + action.charAt(0).toUpperCase() + action.slice(1));
}

