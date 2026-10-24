import es from './es.js?v=e261fd7853';
import gl from './gl.js?v=e261fd7853';
import ca from './ca.js?v=e261fd7853';
import en from './en.js?v=e261fd7853';
import eu from './eu.js?v=e261fd7853';

export const I18N = { es, gl, ca, en, eu };

export function traducir(lang, key, vars){
  const dict = I18N[lang] || I18N.es;
  let s = dict[key] != null ? dict[key] : (I18N.es[key] != null ? I18N.es[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}
