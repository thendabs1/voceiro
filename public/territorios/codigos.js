// El catálogo municipal completo se proporciona solo donde sea necesario.
// El tiempo sigue cargando sus sugerencias AEMET bajo demanda.
import { ADMINISTRACION } from './administracion.js?v=6688a0c5d9';
import { PAISES } from './paises.js?v=6688a0c5d9';

export { PROVINCIAS } from './administracion.js?v=6688a0c5d9';

export function crearCatalogo(municipios, administracion = ADMINISTRACION, paises = PAISES) {
  const entidades = new Map();
  const codigos = new Map();
  for (const [codigo, nombre, editorial] of paises.paises) {
    const id = `pais:${codigo}`;
    if (typeof codigo !== 'string' || !/^[A-Z]{2}$/.test(codigo) || entidades.has(id) || !nombre
        || (editorial !== null && (!editorial || codigos.has(`medios:pais|${editorial}`)))) {
      throw new Error('País o código editorial inválido o duplicado');
    }
    entidades.set(id, { id, tipo: 'pais', nombre, padre: null });
    codigos.set(`iso3166-1:alpha2|${codigo}`, id);
    if (editorial !== null) codigos.set(`medios:pais|${editorial}`, id);
  }
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
    version: [administracion.version, municipios.version, paises.version],
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
