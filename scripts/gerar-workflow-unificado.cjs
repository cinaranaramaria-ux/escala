const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const fonte=JSON.parse(fs.readFileSync(process.argv[2] || path.join(root,'backend/Escalas 5x2.json'),'utf8').replace(/^\uFEFF/,''));
const saida={name:'Escalas - Atual e 5x2 (unificado)',nodes:[],connections:{},active:false,pinData:{},settings:{executionOrder:'v1'}};
for(const modo of ['Atual','5x2']) {
 const nomes=new Map(fonte.nodes.map(n=>[n.name,`${modo} | ${n.name}`]));
 function expressao(valor){
  if(typeof valor==='string' && valor.includes('{{')) for(const [antes,depois] of nomes){
   valor=valor.replaceAll(`$('${antes}')`,`$('${depois}')`).replaceAll(`$("${antes}")`,`$("${depois}")`)
    .replaceAll(`$node["${antes}"]`,`$node["${depois}"]`).replaceAll(`$node['${antes}']`,`$node['${depois}']`);
  }
  if(Array.isArray(valor))return valor.map(expressao);
  if(valor && typeof valor==='object')return Object.fromEntries(Object.entries(valor).map(([k,v])=>[k,expressao(v)]));
  return valor;
 }
 for(const original of fonte.nodes){
  const n=expressao(structuredClone(original));
  n.id=crypto.randomUUID();n.name=nomes.get(original.name);
  n.position=[original.position[0]+(modo==='5x2'?2400:0),original.position[1]];
  if(n.type==='n8n-nodes-base.webhook'){
   const rota=n.parameters.path.replace(/^5x2-/,'');
   n.parameters.path=(modo==='5x2'?'5x2-':'')+rota;
   n.parameters.authentication='none';n.webhookId=crypto.randomUUID();
   n.parameters.options={...n.parameters.options,allowedOrigins:'*'};
  }
  if(n.parameters.query){
   const pares=[['escalas_5x2','escalas_simplificada'],['rascunhos_5x2','escala_rascunhos'],['configuracoes_5x2','configuracoes_sistema']];
   for(const [cinco,atual] of pares)n.parameters.query=n.parameters.query.replaceAll(`public.${modo==='Atual'?cinco:atual}`,`public.${modo==='Atual'?atual:cinco}`);
  }
  saida.nodes.push(n);
 }
 for(const [origem,tipos] of Object.entries(fonte.connections)){
  saida.connections[nomes.get(origem)]=Object.fromEntries(Object.entries(tipos).map(([tipo,saidas])=>[tipo,saidas.map(ramos=>ramos.map(link=>({...link,node:nomes.get(link.node)})))]));
 }
}
fs.writeFileSync(path.join(root,'backend/Escalas unificado.json'),JSON.stringify(saida,null,2)+'\n');
console.log(`Workflow unificado gerado: ${saida.nodes.length} nós.`);
