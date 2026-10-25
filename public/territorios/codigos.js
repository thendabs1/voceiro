// El catálogo municipal completo se proporciona solo donde sea necesario.
// El tiempo sigue cargando sus sugerencias AEMET bajo demanda.
import { ADMINISTRACION } from './administracion.js?v=4d14400925';

export { PROVINCIAS } from './administracion.js?v=4d14400925';

export function crearCatalogo(municipios, administracion = ADMINISTRACION) {
  const entidades = new Map([['pais:ES', { id: 'pais:ES', tipo: 'pais', nombre: 'España', padre: null }]]);
  const codigos = new Map([['iso3166-1:alpha2|ES', 'pais:ES']]);
  const agregar = (tipo, codigo, nombre, padre, sistema) => {
    const id = `es:${tipo}:${codigo}`;
    if (entidades.has(id) || !entidades.has(padre) || !nombre) throw new Error('Territorio duplicado o sin padre/nombre');
    entidades.set(id, { id, tipo, nombre, padre });
    codigos.set(`${sistema}|${codigo}`, id);
    return id;
  };
  for (const [codigo, nombre, region] of administracion.regiones) {
    codigos.set(`medios:region|${region}`, agregar('autonomia', codigo, nombre, 'pais:ES', 'ine:autonomia'));
  }
  for (const [codigo, nombre, autonomia] of administracion.provincias) {
    agregar('provincia', codigo, nombre, `es:autonomia:${autonomia}`, 'ine:provincia');
  }
  for (const [codigo, control, nombre] of municipios.municipios) {
    if (typeof codigo !== 'string' || !/^[0-9]{5}$/.test(codigo)
        || typeof control !== 'string' || !/^[0-9]$/.test(control)) throw new Error('Código municipal INE inválido');
    codigos.set(`ine:municipio:dc|${codigo}${control}`,
      agregar('municipio', codigo, nombre, `es:provincia:${codigo.slice(0, 2)}`, 'ine:municipio'));
  }
  return {
    version: [administracion.version, municipios.version],
    fecha_referencia: municipios.fecha_referencia,
    resolver(sistema, codigo) {
      if (typeof codigo !== 'string') return null;
      const id = codigos.get(`${sistema}|${codigo}`);
      if (!id) return null;
      const entidad = entidades.get(id), ancestros = [];
      let padre = entidad.padre;
      while (padre) {
        ancestros.push(padre);
        padre = entidades.get(padre).padre;
      }
      return { ...entidad, ancestros };
    },
  };
}
