import es from './es.js?v=ea52ef898b';
import gl from './gl.js?v=ea52ef898b';
import ca from './ca.js?v=ea52ef898b';
import en from './en.js?v=ea52ef898b';
import eu from './eu.js?v=ea52ef898b';

export const I18N = { es, gl, ca, en, eu };

export function traducir(lang, key, vars){
  const dict = I18N[lang] || I18N.es;
  let s = dict[key] != null ? dict[key] : (I18N.es[key] != null ? I18N.es[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}
