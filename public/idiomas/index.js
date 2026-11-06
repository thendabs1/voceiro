import es from './es.js?v=cac9f66eb2';
import gl from './gl.js?v=cac9f66eb2';
import ca from './ca.js?v=cac9f66eb2';
import en from './en.js?v=cac9f66eb2';
import eu from './eu.js?v=cac9f66eb2';

export const I18N = { es, gl, ca, en, eu };

export function traducir(lang, key, vars){
  const dict = I18N[lang] || I18N.es;
  let s = dict[key] != null ? dict[key] : (I18N.es[key] != null ? I18N.es[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}
