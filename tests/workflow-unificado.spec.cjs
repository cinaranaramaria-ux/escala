const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const w=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../backend/Escalas unificado.json'),'utf8'));
const nodes=new Map(w.nodes.map(n=>[n.name,n]));
assert.equal(nodes.size,w.nodes.length);
assert.equal(new Set(w.nodes.map(n=>n.id)).size,w.nodes.length);
assert.equal(w.active,false);assert.deepEqual(w.pinData,{});
const triggers=w.nodes.filter(n=>n.type==='n8n-nodes-base.webhook');
assert.equal(triggers.length,20);assert.equal(new Set(triggers.map(n=>n.parameters.path)).size,20);
for(const [origem,tipos] of Object.entries(w.connections)){
 assert.ok(nodes.has(origem));
 for(const ramos of Object.values(tipos)) for(const links of ramos) for(const link of links){assert.ok(nodes.has(link.node));assert.equal(link.node.split(' | ')[0],origem.split(' | ')[0]);}
}
for(const n of w.nodes){
 const query=n.parameters.query || '';
 if(n.name.startsWith('Atual |')) assert.doesNotMatch(query,/public\.(escalas_5x2|rascunhos_5x2|configuracoes_5x2)\b/);
 else assert.doesNotMatch(query,/public\.(escalas_simplificada|escala_rascunhos|configuracoes_sistema)\b/);
}
for(const t of triggers){
 const visitados=new Set();let resposta=false;
 function visitar(nome){if(visitados.has(nome))return;visitados.add(nome);if(nodes.get(nome).type==='n8n-nodes-base.respondToWebhook')resposta=true;for(const ramos of Object.values(w.connections[nome] || {})) for(const links of ramos) for(const link of links)visitar(link.node);}
 visitar(t.name);assert.ok(resposta,`Webhook sem resposta: ${t.name}`);
 assert.equal(t.parameters.options.allowedOrigins,'*');
}
console.log('PASSOU: 20 webhooks únicos, conexões válidas, respostas alcançáveis e tabelas separadas nos dois modos. Nenhuma chamada real.');
