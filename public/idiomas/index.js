import es from './es.js?v=d338c86cf3';
import gl from './gl.js?v=d338c86cf3';
import ca from './ca.js?v=d338c86cf3';
import en from './en.js?v=d338c86cf3';
import eu from './eu.js?v=d338c86cf3';

export const I18N = { es, gl, ca, en, eu };

export function traducir(lang, key, vars){
  const dict = I18N[lang] || I18N.es;
  let s = dict[key] != null ? dict[key] : (I18N.es[key] != null ? I18N.es[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}
