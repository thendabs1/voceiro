import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, tokenizeQuery } from '../../shared/parser.js';
import { CONSULTAS, PREFIJOS_CONSULTAS, ESPN } from '../../shared/consultas/registro.js';
import { AMBITOS, leerConsultaCalendario } from '../../shared/calendario/consulta.js';
import { PARSER_SOURCE } from '../../workers/deno-buscar/src/parser-source.js';

test('todos los alias del registro crean chips de consulta conservando texto y raw', () => {
  for (const [tipo, alias] of Object.entries(CONSULTAS)) for (const prefijo of alias) {
    const raw = `${prefijo}:"Texto con espacios"`;
    const p = parseQuery(raw);
    assert.deepEqual(p.consultas,[{tipo,texto:'Texto con espacios'}],raw);
    assert.deepEqual(p.chips,[{type:'consulta',tipo,value:'Texto con espacios',raw}],raw);
    assert.equal(p.q,''); assert.equal(leerConsultaCalendario(raw),null);
  }
});

test('los siete tipos tienen prefijos en los cinco idiomas de la interfaz', () => {
  const idiomas = {
    es:['libro','autor','película','serie','clasificación','resultados','contexto'],
    gl:['libro','autor','filme','serie','clasificación','resultados','contexto'],
    ca:['llibre','autor','pel·lícula','sèrie','classificació','resultats','context'],
    eu:['liburua','egilea','filma','telesaila','sailkapena','emaitzak','testuingurua'],
    en:['book','author','movie','series','standings','results','wiki'],
  };
  for (const prefijos of Object.values(idiomas)) assert.deepEqual(
    prefijos.map(p=>parseQuery(`${p}:dato`).consultas[0].tipo),Object.keys(CONSULTAS));
});

test('sin comillas, el valor de una consulta es el resto de la línea', () => {
  const consulta = raw => parseQuery(raw).consultas;
  assert.deepEqual(consulta('pelicula:La infiltrada'),[{tipo:'pelicula',texto:'La infiltrada'}]);
  // «palabra:» dentro del título no corta el valor, aunque sea un prefijo conocido.
  const hawking = parseQuery('libro:Breve historia del tiempo: del big bang');
  assert.deepEqual(hawking.consultas,[{tipo:'libro',texto:'Breve historia del tiempo: del big bang'}]);
  assert.equal(hawking.eltiempo,null); assert.deepEqual(hawking.titulo,[]);
  // Lo de detrás es título; los filtros van delante o se cierra con comillas.
  assert.deepEqual(consulta('pelicula:Misión: imposible lang:es'),[{tipo:'pelicula',texto:'Misión: imposible lang:es'}]);
  const delante = parseQuery('lang:es pelicula:Misión: imposible');
  assert.deepEqual(delante.consultas,[{tipo:'pelicula',texto:'Misión: imposible'}]); assert.deepEqual(delante.lang,['es']);
  const comillas = parseQuery('incendio pelicula:"La infiltrada" lang:es');
  assert.deepEqual(comillas.consultas,[{tipo:'pelicula',texto:'La infiltrada'}]);
  assert.deepEqual(comillas.lang,['es']); assert.equal(comillas.q,'incendio');
  assert.deepEqual(consulta('libro:Dune autor:Herbert'),[{tipo:'libro',texto:'Dune autor:Herbert'}]);
  // Comilla sin cerrar mientras se escribe, prefijo vacío y espacios finales.
  assert.deepEqual(consulta('pelicula:"La infil'),[{tipo:'pelicula',texto:'La infil'}]);
  assert.deepEqual(consulta('pelicula: '),[{tipo:'pelicula',texto:''}]);
  const chip = parseQuery('incendio película:La  infiltrada  ').chips.at(-1);
  assert.deepEqual(chip,{type:'consulta',tipo:'pelicula',value:'La  infiltrada',raw:'película:La  infiltrada'});
  // El texto de noticias sale de los tokens sin prefijo: el título no entra.
  assert.deepEqual(tokenizeQuery('incendio pelicula:La infiltrada').filter(t=>!t.prefix).map(t=>t.raw),['incendio']);
});

test('sin colisiones con calendario; las equivalencias ESPN son circuitos existentes', () => {
  for (const p of Object.keys(PREFIJOS_CONSULTAS)) assert.ok(!Object.hasOwn(AMBITOS,p),p);
  for (const c of Object.keys(ESPN)) assert.equal(AMBITOS[c].codigo,c);
  assert.deepEqual(leerConsultaCalendario('primera:agenda').ambitos,['primera']);
});

test('regresión: formato previo de parsed y combinación con tiempo, avisos y filtros', () => {
  assert.deepEqual(parseQuery(''),{q:'',titulo:[],dominios:[],medios:[],grupos:[],tipos:[],tags:[],lang:[],desde:null,hasta:null,
    eltiempo:null,alertas:null,fuentes:[],order:'recientes',limit:50,offset:0,chips:[]});
  const p = parseQuery('sánchez web:elpais.com tiempo:Vigo avisos:Galicia book:"Los besos"');
  assert.equal(p.q,'sanchez'); assert.deepEqual(p.dominios,['elpais.com']); assert.equal(p.eltiempo,'Vigo');assert.equal(p.alertas,'Galicia');
  assert.deepEqual(p.consultas,[{tipo:'libro',texto:'Los besos'}]);
  assert.equal(parseQuery('desconocido:algo').q,'desconocido:algo');
});

test('el parser servido por los workers es autónomo y reconoce el mismo registro', async () => {
  const modulo = await import(`data:text/javascript;base64,${Buffer.from(PARSER_SOURCE).toString('base64')}`);
  const raw = 'lang:es book:Breve historia del tiempo: movie:test';
  assert.deepEqual(modulo.parseQuery(raw),parseQuery(raw));
  assert.equal(parseQuery(raw).consultas.length,1);
});
