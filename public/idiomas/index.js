import es from './es.js?v=4214c8a66c';
import gl from './gl.js?v=4214c8a66c';
import ca from './ca.js?v=4214c8a66c';
import en from './en.js?v=4214c8a66c';
import eu from './eu.js?v=4214c8a66c';

export const I18N = { es, gl, ca, en, eu };

export function traducir(lang, key, vars){
  const dict = I18N[lang] || I18N.es;
  let s = dict[key] != null ? dict[key] : (I18N.es[key] != null ? I18N.es[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}
