/* ============================================================
   4. TIPOS DE SITIO POR DEFECTO
   ============================================================ */
const DEFAULT_SITE_TYPES = {
  es: [
    { id:'diario',     label:'Diario' },     { id:'digital',   label:'Digital' },
    { id:'revista',    label:'Revista' },    { id:'deportivo', label:'Deportivo' },
    { id:'economico',  label:'Económico' },  { id:'tecnologia',label:'Tecnología' },
    { id:'cultural',   label:'Cultural' },   { id:'tv',        label:'TV' },
    { id:'radio',      label:'Radio' },      { id:'agencia',   label:'Agencia' },
    { id:'otro',       label:'Otro' }
  ],
  gl: [
    { id:'diario',     label:'Diario' },     { id:'digital',   label:'Dixital' },
    { id:'revista',    label:'Revista' },    { id:'deportivo', label:'Deportivo' },
    { id:'economico',  label:'Económico' },  { id:'tecnologia',label:'Tecnoloxía' },
    { id:'cultural',   label:'Cultural' },   { id:'tv',        label:'TV' },
    { id:'radio',      label:'Radio' },      { id:'agencia',   label:'Axencia' },
    { id:'otro',       label:'Outro' }
  ],
  ca: [
    { id:'diario',     label:'Diari' },      { id:'digital',   label:'Digital' },
    { id:'revista',    label:'Revista' },    { id:'deportivo', label:'Esportiu' },
    { id:'economico',  label:'Econòmic' },   { id:'tecnologia',label:'Tecnologia' },
    { id:'cultural',   label:'Cultural' },   { id:'tv',        label:'TV' },
    { id:'radio',      label:'Ràdio' },      { id:'agencia',   label:'Agència' },
    { id:'otro',       label:'Altre' }
  ],
  en: [
    { id:'diario',     label:'Newspaper' },  { id:'digital',   label:'Digital' },
    { id:'revista',    label:'Magazine' },   { id:'deportivo', label:'Sports' },
    { id:'economico',  label:'Business' },   { id:'tecnologia',label:'Tech' },
    { id:'cultural',   label:'Culture' },    { id:'tv',        label:'TV' },
    { id:'radio',      label:'Radio' },      { id:'agencia',   label:'Agency' },
    { id:'otro',       label:'Other' }
  ],
  eu: [
    { id:'diario',     label:'Egunkaria' },  { id:'digital',   label:'Digitala' },
    { id:'revista',    label:'Aldizkaria' }, { id:'deportivo', label:'Kirola' },
    { id:'economico',  label:'Ekonomia' },   { id:'tecnologia',label:'Teknologia' },
    { id:'cultural',   label:'Kultura' },    { id:'tv',        label:'TB' },
    { id:'radio',      label:'Irratia' },    { id:'agencia',   label:'Agentzia' },
    { id:'otro',       label:'Bestea' }
  ]
};

function defaultLabelForType(id, lang){
  const map = DEFAULT_SITE_TYPES[lang] || DEFAULT_SITE_TYPES.es;
  const found = map.find(tt => tt.id === id);
  return found ? found.label : id;
}

