import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../../shared/parser.js';
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
    parseQuery(prefijos.map(p=>`${p}:dato`).join(' ')).consultas.map(c=>c.tipo),Object.keys(CONSULTAS));
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
  assert.deepEqual(modulo.parseQuery('book:test movie:test'),parseQuery('book:test movie:test'));
});
