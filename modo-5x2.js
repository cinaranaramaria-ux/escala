/* Modos isolados: o endpoint 5x2 nunca recorre ao endpoint do modo atual. */
const MODO_5X2 = new URLSearchParams(location.search).get('modo') === '5x2';
function chaveModo(chave) { return MODO_5X2 ? `5x2:${chave}` : chave; }
function urlModo(url) {
    const destino = new URL(url, location.href);
    if (MODO_5X2 && destino.hostname === 'n8n.orbbotia.com' && destino.pathname.startsWith('/webhook/')
        && !/\/(buscar-funcionarios|salvar-funcionario|excluir-funcionario)$/.test(destino.pathname)) {
        destino.pathname = destino.pathname.replace('/webhook/', '/webhook/5x2-');
    }
    return destino.href;
}
function versoesTurmas() { return Array.isArray(alertasConfig.turmas5x2) ? alertasConfig.turmas5x2 : []; }
function turmasNaData(data) {
    return [...versoesTurmas()].filter(v=>v.inicio<=data).sort((a,b)=>b.inicio.localeCompare(a.inicio))[0]?.turmas || [];
}
function turmaColaborador(func,data) { return turmasNaData(data).find(t=>t.membros.includes(String(func.id))); }
function pertenceAoModo(func,data) { return !MODO_5X2 || !!turmaColaborador(func,data); }
function regraTurma(func,data) {
    const turma=turmaColaborador(func,data);
    return turma?.dias.includes(new Date(`${data}T12:00:00`).getDay()) ? {tipo:'fixa',desc:`Folga 5×2 — ${turma.nome}`} : null;
}
let turmasEdicao=[];
function turmasIniciais() { return [{id:'a',nome:'Turma A',dias:[2,4],membros:[]},{id:'b',nome:'Turma B',dias:[3,5],membros:[]}]; }
function inicializarModoUI() {
    document.getElementById('modoAtualNome').textContent=MODO_5X2 ? 'Escala 5×2' : 'Escala atual';
    document.getElementById('turmas5x2').hidden=!MODO_5X2;
    if (!MODO_5X2) return;
    document.title='Escalas — modo 5×2';
    document.getElementById('turmasInicio').value=getHojeISO();
    carregarTurmasEdicao();
    document.getElementById('turmasStatus').textContent=estadoEscala.configCarregada
        ? 'Escolha a vigência e configure as turmas. Salve antes de gerar escalas.'
        : 'Modo 5×2 ainda não conectado. Instale a migração e publique o workflow 5×2; depois atualize a página.';
}
function carregarTurmasEdicao() {
    const data=document.getElementById('turmasInicio').value;
    turmasEdicao=JSON.parse(JSON.stringify(turmasNaData(data).length ? turmasNaData(data) : turmasIniciais()));
    renderizarTurmasEdicao();
}
function renderizarTurmasEdicao() {
    const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    document.getElementById('turmasLista').innerHTML=turmasEdicao.map((t,i)=>`<fieldset class="turma-card"><legend>${escapeHTML(t.nome)}</legend>
        <label>Nome da turma<input type="text" value="${escapeHTML(t.nome)}" maxlength="60" onchange="turmasEdicao[${i}].nome=this.value"></label>
        <div class="turma-dias">${dias.map((dia,d)=>`<label><input type="checkbox" ${t.dias.includes(d)?'checked':''} onchange="editarDiaTurma(${i},${d},this.checked)">${dia}</label>`).join('')}</div>
        <p>Selecione dois dias de folga e os membros:</p><div class="turma-membros">${funcionarios.map(f=>`<label><input type="checkbox" ${t.membros.includes(String(f.id))?'checked':''} onchange="editarMembroTurma(${i},decodeURIComponent('${encodeURIComponent(String(f.id)).replace(/'/g,'%27')}'),this.checked)">${escapeHTML(f.nome)}</label>`).join('')}</div>
        <button type="button" class="btn-danger" onclick="turmasEdicao.splice(${i},1);renderizarTurmasEdicao()">Remover turma desta vigência</button></fieldset>`).join('');
    document.getElementById('turmasVersoes').textContent=versoesTurmas().length ? 'Vigências salvas: '+versoesTurmas().map(v=>formatarDataBR(v.inicio)).join(' · ') : 'Nenhuma vigência salva.';
}
function editarDiaTurma(i,d,marcado) { turmasEdicao[i].dias=marcado ? [...new Set([...turmasEdicao[i].dias,d])] : turmasEdicao[i].dias.filter(x=>x!==d); }
function editarMembroTurma(i,id,marcado) {
    const outra=turmasEdicao.findIndex((t,j)=>j!==i && t.membros.includes(id));
    if (marcado && outra>=0 && !confirm(`Transferir este colaborador de ${turmasEdicao[outra].nome} para ${turmasEdicao[i].nome} nesta vigência?`)) { renderizarTurmasEdicao(); return; }
    if (marcado) turmasEdicao.forEach(t=>t.membros=t.membros.filter(x=>x!==id));
    turmasEdicao[i].membros=marcado ? [...turmasEdicao[i].membros,id] : turmasEdicao[i].membros.filter(x=>x!==id);
    renderizarTurmasEdicao();
}
function adicionarTurma() { turmasEdicao.push({id:crypto.randomUUID(),nome:`Turma ${turmasEdicao.length+1}`,dias:[],membros:[]}); renderizarTurmasEdicao(); }
function validarTurmas(turmas) {
    if (!turmas.length) throw new Error('Adicione pelo menos uma turma.');
    const membros=new Set(),ids=new Set();
    for (const t of turmas) {
        if (!t.nome.trim() || ids.has(t.id)) throw new Error('Informe nomes e identificadores válidos para as turmas.');
        ids.add(t.id);
        if (t.dias.length!==2 || new Set(t.dias).size!==2 || t.dias.some(d=>!Number.isInteger(d)||d<0||d>6)) throw new Error(`${t.nome}: escolha exatamente dois dias distintos de folga.`);
        for (const id of t.membros) { if(membros.has(id)) throw new Error('Um colaborador não pode pertencer a duas turmas na mesma vigência.'); membros.add(id); }
    }
}
async function salvarTurmas5x2() {
    const status=document.getElementById('turmasStatus'),botao=document.getElementById('salvarTurmas');
    const inicio=document.getElementById('turmasInicio').value;
    try {
        if (!estadoEscala.configCarregada) throw new Error('Carregue as configurações do modo 5×2 antes de salvar.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new Error('Informe a data de início da vigência.');
        validarTurmas(turmasEdicao);
        if (versoesTurmas().some(v=>v.inicio===inicio) && !confirm('Substituir a configuração desta vigência? Escalas já salvas permanecem preservadas.')) return;
        botao.disabled=true;
        const anteriores=alertasConfig.turmas5x2;
        const novas=[...versoesTurmas().filter(v=>v.inicio!==inicio),{inicio,turmas:JSON.parse(JSON.stringify(turmasEdicao))}].sort((a,b)=>a.inicio.localeCompare(b.inicio));
        gravarLocal('turmas_edicao',JSON.stringify({inicio,turmas:turmasEdicao}));
        alertasConfig.turmas5x2=novas;
        if (!await salvarConfiguracoes({notificar:false})) { alertasConfig.turmas5x2=anteriores; gravarLocal('cfg_alertas_individuais',JSON.stringify(alertasConfig)); throw new Error('Não foi possível confirmar no banco. As alterações continuam nesta tela; tente salvar novamente.'); }
        removerLocal('turmas_edicao');
        status.textContent='Turmas salvas e confirmadas. A nova regra vale a partir de '+formatarDataBR(inicio)+'.';
        renderizarTurmasEdicao(); atualizarOpcoesDropdown(); renderizarCalendario();
    } catch(e) { status.textContent='NÃO SALVO: '+e.message; }
    finally { botao.disabled=false; }
}
function recuperarTurmasEdicao() {
    const copia=parseJSONField(lerLocal('turmas_edicao'),null);
    if (!copia) return alert('Nenhuma alteração pendente guardada neste aparelho.');
    document.getElementById('turmasInicio').value=copia.inicio; turmasEdicao=copia.turmas; renderizarTurmasEdicao();
}
function validarMembros5x2(data,nomes) {
    if (!MODO_5X2) return;
    if (!turmasNaData(data).some(t=>t.membros.length)) throw new Error('Nenhuma turma com membros está vigente nesta data.');
    const membros=new Set(funcionarios.filter(f=>pertenceAoModo(f,data)).map(f=>normalizeStr(f.nome)));
    const invalidos=nomes.filter(n=>!membros.has(normalizeStr(n)));
    if (invalidos.length) throw new Error('Sem turma 5×2 nesta data: '+invalidos.join(', ')+'. Ajuste a vigência ou retire da escala.');
}
