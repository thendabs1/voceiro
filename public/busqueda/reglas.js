// Selecciones creadas por el asistente. Los modos sin «regla» conservan
// su semántica histórica (fuentes OR temas). La regla no contiene noticias
// ni preferencias de entrega: sirve igual para el feed y un futuro bot.
import { limpiarDominio } from './filtros.js?v=3fa3a2b905';
import { palabrasDe } from './texto.js?v=3fa3a2b905';
import { compilarTemas, temasQueCasan } from './temas.js?v=3fa3a2b905';

export function normalizarRegla(regla) {
  if (regla?.v !== 1 || !['todas', 'elegidas'].includes(regla.fuentes)) return null;
  return { v: 1, fuentes: regla.fuentes };
}

export function compilarRegla(modo) {
  const regla = normalizarRegla(modo?.regla);
  if (!regla) return null;
  const grupos = new Set(modo.grupos || []);
  const overrides = new Map(Object.entries(modo.overrides || {})
    .map(([d, v]) => [limpiarDominio(d), v]));
  const temas = compilarTemas(modo.palabras);
  const hayTemas = (modo.palabras || []).some(x => String(x || '').trim());
  const pasaFuentes = n => {
    const ov = overrides.get(limpiarDominio(n.dominio || ''));
    if (ov === 'ignore') return false;
    return regla.fuentes === 'todas' || ov === 'include' || ov === 'first' || grupos.has(n.grupo);
  };
  const temasDe = n => pasaFuentes(n)
    ? temasQueCasan(n.palabras || palabrasDe(n.titular), temas, n.titular) : [];
  // Un tema inválido escrito a mano o importado no debe ampliar la
  // selección a todos los titulares como si no se hubiera escrito nada.
  const pasa = n => pasaFuentes(n) && (!hayTemas || temasDe(n).length > 0);
  return { regla, temas, pasaFuentes, temasDe, pasa };
}
