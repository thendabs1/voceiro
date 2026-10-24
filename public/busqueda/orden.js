// shared/busqueda/orden.js
// Orden de los resultados de búsqueda (reglas 2, 8 y 27 de la especificación):
//   recientes (por defecto) / antiguos → por fecha; relevancia → por rango
//   que da la fuente y, a igualdad o sin rango, por fecha.
//   Las noticias sin fecha van siempre al final.
//   El preset NO reordena: sus resultados solo se marcan.
// Desempate estable por dominio y titular, para que la lista no baile.

// item: { ts, dominio, titular, rango? }  (ts en ms, NaN si no hay fecha)
export function comparador(orden = 'recientes') {
  const asc = orden === 'antiguos';
  const porRango = orden === 'relevancia';
  return (a, b) => {
    if (porRango) {
      const ra = Number.isFinite(a.rango) ? a.rango : Infinity;
      const rb = Number.isFinite(b.rango) ? b.rango : Infinity;
      if (ra !== rb) return ra - rb;
    }
    const fa = Number.isFinite(a.ts), fb = Number.isFinite(b.ts);
    if (fa !== fb) return fa ? -1 : 1;              // sin fecha, al final
    if (fa && a.ts !== b.ts) return asc ? a.ts - b.ts : b.ts - a.ts;
    const da = a.dominio || '', db = b.dominio || '';
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.titular || '', tb = b.titular || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  };
}
