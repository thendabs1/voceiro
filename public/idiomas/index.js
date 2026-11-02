import es from './es.js?v=072b81c6ee';
import gl from './gl.js?v=072b81c6ee';
import ca from './ca.js?v=072b81c6ee';
import en from './en.js?v=072b81c6ee';
import eu from './eu.js?v=072b81c6ee';

export const I18N = { es, gl, ca, en, eu };

export function traducir(lang, key, vars){
  const dict = I18N[lang] || I18N.es;
  let s = dict[key] != null ? dict[key] : (I18N.es[key] != null ? I18N.es[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}
