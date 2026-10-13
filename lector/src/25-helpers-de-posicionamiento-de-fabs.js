/* ============================================================
   20b. HELPERS DE POSICIONAMIENTO DE FABs
   ============================================================ */
const STACK_FAB_IDS = ['il-settings-fab', 'il-add-fab'];

function countStackFABs(){
  return STACK_FAB_IDS.filter(id => document.getElementById(id)).length;
}

function repositionStackFABs(){
  const M = UI.fabMargin, S = UI.fabSize, GAP = UI.fabGap;
  let offset = 0;
  for (const id of STACK_FAB_IDS){
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.bottom = (M + offset * (S + GAP)) + 'px';
    el.style.left = M + 'px';
    offset++;
  }
}

