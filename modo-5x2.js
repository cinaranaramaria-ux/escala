/* Modos isolados: o endpoint 5x2 nunca recorre ao endpoint do modo atual. */
const MODO_5X2 = new URLSearchParams(location.search).get('modo') === '5x2';
function chaveModo(chave) { return MODO_5X2 ? `5x2:${chave}` : chave; }
function urlModo(url) {
    const destino = new URL(url, location.href);
    if (MODO_5X2 && destino.hostname === 'n8n.orbbotia.com' && destino.pathname.startsWith('/webhook/')
        && !destino.pathname.startsWith('/webhook/5x2-')) {
        destino.pathname = destino.pathname.replace('/webhook/', '/webhook/5x2-');
    }
    return destino.href;
}
function versoesTurmas() { return Array.isArray(alertasConfig.turmas5x2) ? alertasConfig.turmas5x2 : []; }
function vigenciaTurmasNaData(data) {
    return [...versoesTurmas()].filter(v=>v.inicio<=data).sort((a,b)=>b.inicio.localeCompare(a.inicio))[0];
}
function turmasNaData(data) { return vigenciaTurmasNaData(data)?.turmas || []; }
function turmaColaborador(func,data) { return turmasNaData(data).find(t=>t.membros.includes(String(func.id))); }
function pertenceAoModo(func,data) { return !MODO_5X2 || !!turmaColaborador(func,data); }
function regraTabelaExtra(tabela) {
    if (['5x2','propria'].includes(tabela?.regraEscala)) return tabela.regraEscala;
    return /\b(jovem aprendiz|jovens aprendizes)\b/.test(normalizeStr(tabela?.titulo || '')) ? 'propria' : '5x2';
}
function tabelaJovemAprendiz(tabela) { return !!tabela && regraTabelaExtra(tabela)==='propria'; }
function nomesAprendizesConfigurados() {
    return tabelasExtrasConfig.filter(tabelaJovemAprendiz).flatMap(t=>[
        ...(t.defaultRows || []).map(row=>row[t.colunas[0]]),
        ...[...document.querySelectorAll('.linha-tbl-extra')].filter(el=>el.dataset.tbl===t.id).map(el=>el.querySelector('select')?.value)
    ]).filter(Boolean);
}
function aprendizConfigurado(func) { return nomesAprendizesConfigurados().some(nome=>normalizeStr(nome)===normalizeStr(func.nome)); }
function nomesAprendizesNoFormulario() {
    return [...document.querySelectorAll('.linha-tbl-extra')].filter(el=>tabelaJovemAprendiz(tabelasExtrasConfig.find(t=>t.id===el.dataset.tbl))).map(el=>el.querySelector('select')?.value).filter(Boolean);
}
function referenciaDomingo5x2(func,turma) {
    const explicita=turma?.referencias?.[String(func.id)];
    if (explicita) return explicita;
    const regra=(func.regrasFolga || []).find(r=>r?.tipo==='ciclo' && String(r.dia)==='0'
        && /^\d{4}-\d{2}-\d{2}$/.test(r.dataBase || '') && new Date(`${r.dataBase}T12:00:00Z`).getUTCDay()===0);
    return regra?.dataBase || '';
}
function diaFolgaCasada(turma) {
    return Number(turma.diaMantido ?? (turma.id==='a'?4:turma.id==='b'?5:turma.dias[1]));
}
const diasCurtos = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
function regraFixaNoDia(regra,dia) {
    return regra?.tipo==='fixa' && String(regra.dia)===String(dia);
}
function diasFixosCadastro(func) {
    return diasCurtos.map((_,dia)=>dia).filter(dia=>(func?.regrasFolga || []).some(r=>regraFixaNoDia(r,dia)));
}
function fonteFolgas(turma,id) {
    if (turma?.usarFixasCadastro?.includes(String(id))) return 'cadastro';
    if (turma?.folgasFixasDomSeg?.includes(String(id))) return 'anterior';
    return 'turma';
}
function diasFixosDaTurma(func,turma) {
    const fonte=fonteFolgas(turma,func.id);
    if (fonte==='anterior') return [0,1];
    return fonte==='cadastro' ? diasFixosCadastro(func) : [];
}
function regraTurma(func,data) {
    const turma=turmaColaborador(func,data);
    if (turma) {
        const fixos=diasFixosDaTurma(func,turma);
        if (fixos.length) {
            const dia=new Date(`${data}T12:00:00Z`).getUTCDay();
            return fixos.includes(dia) ? {tipo:'fixa',desc:'Folga fixa individual'} : null;
        }
        const ref=referenciaDomingo5x2(func,turma);
        if (ref) {
            const atual=new Date(`${data}T12:00:00Z`),dia=atual.getUTCDay();
            const domingo=new Date(atual);
            domingo.setUTCDate(atual.getUTCDate()-dia);
            const base=new Date(`${ref}T12:00:00Z`);
            const dias=Math.round((domingo-base)/86400000);
            if (dias>=0 && dias%21===0) {
                return dia===0 || dia===diaFolgaCasada(turma) ? {tipo:'ciclo',desc:`Folga 5×2 — ${turma.nome} (semana de domingo)`} : null;
            }
        }
    }
    return turma?.dias.includes(new Date(`${data}T12:00:00`).getDay()) ? {tipo:'fixa',desc:`Folga 5×2 — ${turma.nome}`} : null;
}
function conferirFolgasTurmas() {
    const data=document.getElementById('dataConferenciaTurmas').value;
    const resultado=document.getElementById('resultadoConferenciaTurmas');
    if (!data) { resultado.textContent='Escolha a data da escala.'; return; }
    if (!estadoEscala.configCarregada || !estadoEscala.funcionariosCarregados) {
        resultado.textContent='Carregue as configurações e o cadastro antes de conferir as folgas.';
        return;
    }
    const vigencia=vigenciaTurmasNaData(data);
    if (!vigencia) { resultado.textContent='Nenhuma turma salva está vigente nessa data.'; return; }
    const folgantes=new Set(nomesFolgaConfigurada(data).map(normalizeStr));
    const linhas=funcionarios.filter(f=>turmaColaborador(f,data)).map(f=>{
        const turma=turmaColaborador(f,data);
        const ref=referenciaDomingo5x2(f,turma);
        const situacao=isDesativado(f,data) || isDeFerias(f,data) || getObjAusencia(f,data)
            ? 'Indisponível' : folgantes.has(normalizeStr(f.nome)) ? 'Folga prevista' : 'Sem folga prevista';
        const fixos=diasFixosDaTurma(f,turma);
        const regra=fixos.length ? ' · folgas fixas '+fixos.map(d=>diasCurtos[d]).join(' e ') : ref ? ` · referência ${escapeHTML(formatarDataBR(ref))}` : ' · sem referência de domingo';
        return `<li>${escapeHTML(f.nome)} · ${escapeHTML(turma.nome)} · ${situacao}${regra}</li>`;
    });
    const dias=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
    const combinacoes=vigencia.turmas.map(t=>`${escapeHTML(t.nome)} · domingo e ${dias[diaFolgaCasada(t)] || 'dia indefinido'}`).join('<br>');
    resultado.innerHTML=`<p>Regras salvas para ${escapeHTML(formatarDataBR(data))} · vigência de ${escapeHTML(formatarDataBR(vigencia.inicio))}.</p><p>${combinacoes}</p><button type="button" class="btn-action">Editar esta vigência</button><ul>${linhas.join('')}</ul>`;
    resultado.querySelector('button').onclick=()=>{
        if (!confirm('Carregar esta vigência no formulário? Alterações ainda não salvas no formulário serão descartadas.')) return;
        const inicio=document.getElementById('turmasInicio');
        inicio.value=vigencia.inicio;
        carregarTurmasEdicao();
        inicio.focus();
    };
}
let turmasEdicao=[];
function turmasIniciais() { return [{id:'a',nome:'Turma A',dias:[2,4],membros:[]},{id:'b',nome:'Turma B',dias:[3,5],membros:[]}]; }
function inicializarModoUI() {
    document.getElementById('modoAtualNome').textContent=MODO_5X2 ? 'Escala 5×2' : 'Escala atual';
    const opcao=document.querySelector('#mobileNavSelect option[value="turmas5x2"]');
    opcao.hidden=opcao.disabled=!MODO_5X2;
    document.querySelector('[data-tab="turmas5x2"]').hidden=!MODO_5X2;
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
        <p>Selecione dois dias de folga.</p><button type="button" class="btn-action" onclick="abrirSeletorTurma(${i})">🔍 Selecionar participantes (${t.membros.length})</button>
        <label>Outra folga na semana de domingo a sábado<select onchange="turmasEdicao[${i}].diaMantido=Number(this.value)">${t.dias.filter(d=>d!==0).map(d=>`<option value="${d}" ${d===diaFolgaCasada(t)?'selected':''}>${dias[d]}</option>`).join('')}</select></label>
        <details><summary>Regras por participante</summary>
        <label>Participante<select aria-label="Participante" class="participante-regra" onchange="mostrarRegraParticipante(${i},this)"><option value="">Selecione para consultar ou editar</option>${t.membros.map(id=>`<option value="${escapeHTML(id)}">${escapeHTML(funcionarios.find(f=>String(f.id)===id)?.nome || 'Colaborador indisponível')}</option>`).join('')}</select></label>
        <div class="regra-participante"></div></details>
        <button type="button" class="btn-danger" onclick="turmasEdicao.splice(${i},1);renderizarTurmasEdicao()">Remover turma desta vigência</button></fieldset>`).join('');
    document.getElementById('turmasVersoes').textContent=versoesTurmas().length ? 'Vigências salvas: '+versoesTurmas().map(v=>formatarDataBR(v.inicio)).join(' · ') : 'Nenhuma vigência salva.';
}
function editarDiaTurma(i,d,marcado) { turmasEdicao[i].dias=marcado ? [...new Set([...turmasEdicao[i].dias,d])] : turmasEdicao[i].dias.filter(x=>x!==d); }
function mostrarRegraParticipante(i,seletor) {
    const painel=seletor.closest('details').querySelector('.regra-participante');
    const id=seletor.value, turma=turmasEdicao[i], pessoa=funcionarios.find(f=>String(f.id)===id);
    painel.replaceChildren();
    if (!pessoa) return;
    const fonte=fonteFolgas(turma,id), dias=diasFixosCadastro(pessoa);
    const resumo=dias.map(d=>diasCurtos[d]).join(' e ');
    painel.innerHTML=`<label>Folga semanal<select class="fonte-folga">
        <option value="turma">Seguir turma e ciclo de domingos</option>
        <option value="cadastro" ${!dias.length && fonte!=='cadastro'?'disabled':''}>Usar dias fixos do cadastro${resumo?' · '+resumo:''}</option>
        ${fonte==='anterior'?'<option value="anterior">Dom e Seg · exceção já salva</option>':''}</select></label>
        <small>Escolha os dias em Base/Regras → Fixa Semanal. Esse cadastro é compartilhado entre os modos. Sem dias fixos cadastrados, vale a regra da turma.</small>
        <button type="button" class="btn-action">Editar cadastro individual</button>`;
    painel.querySelector('button').onclick=()=>{
        openTab('funcionarios');
        editarFunc(pessoa.id);
    };
    const escolha=painel.querySelector('select');
    escolha.value=fonte;
    escolha.onchange=()=>{
        turma.usarFixasCadastro=(turma.usarFixasCadastro || []).filter(x=>x!==id);
        turma.folgasFixasDomSeg=(turma.folgasFixasDomSeg || []).filter(x=>x!==id);
        if (escolha.value==='cadastro') turma.usarFixasCadastro.push(id);
        mostrarRegraParticipante(i,seletor);
    };
    if (!diasFixosDaTurma(pessoa,turma).length) {
        const ref=referenciaDomingo5x2(pessoa,turma);
        painel.insertAdjacentHTML('beforeend',`<label>Domingo de referência<input type="date"><small>${ref?'Ciclo a partir de '+escapeHTML(formatarDataBR(ref)):'Sem domingo de referência'}</small></label>`);
        const campo=painel.querySelector('input');
        campo.value=turma.referencias?.[id] || '';
        campo.onchange=()=>definirReferenciaDomingo(i,id,campo.value,campo);
    }
}
function limparReferenciasDomingo() {
    const status=document.getElementById('turmasStatus');
    const inicio=document.getElementById('turmasInicio').value;
    if (!inicio) { status.textContent='Escolha o início da vigência.'; return; }
    const total=turmasEdicao.reduce((n,t)=>n+Object.values(t.referencias || {}).filter(Boolean).length,0);
    if (!total) { status.textContent='As turmas desta vigência já estão sem referências de domingo.'; return; }
    if (!confirm(`Limpar as referências de domingo (${total}) de todas as turmas da vigência de ${formatarDataBR(inicio)}? O ciclo passará a usar o domingo do cadastro individual, quando houver.`)) return;
    for (const turma of turmasEdicao) turma.referencias={};
    renderizarTurmasEdicao();
    status.textContent='Referências de domingo limpas. Clique em Salvar turmas para confirmar a alteração.';
}
function definirReferenciaDomingo(i,id,data,campo) {
    if(data && new Date(`${data}T12:00:00Z`).getUTCDay()!==0) {
        if(campo) campo.value=turmasEdicao[i].referencias?.[id] || '';
        return alert('Escolha um domingo como referência.');
    }
    turmasEdicao[i].referencias={...turmasEdicao[i].referencias,[id]:data};
    if(campo) {
        const pessoa=funcionarios.find(f=>String(f.id)===id);
        const referencia=pessoa && referenciaDomingo5x2(pessoa,turmasEdicao[i]);
        campo.nextElementSibling.textContent=referencia ? `Ciclo de domingos a partir de ${formatarDataBR(referencia)}${data ? '' : ' (cadastro individual)'}` : 'Sem domingo de referência';
    }
}
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
        if(t.diaMantido!=null && (!t.dias.includes(Number(t.diaMantido)) || Number(t.diaMantido)===0)) throw new Error(`${t.nome}: escolha a folga que permanece na semana do domingo.`);
        for(const ref of Object.values(t.referencias || {})) if(ref && (!/^\d{4}-\d{2}-\d{2}$/.test(ref) || new Date(`${ref}T12:00:00Z`).getUTCDay()!==0)) throw new Error('A referência individual deve ser um domingo.');
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
    const aprendizes=new Set(nomesAprendizesNoFormulario().map(normalizeStr));
    const folgantes=new Set(nomesUnicos(document.getElementById('folgas')?.value).map(normalizeStr));
    nomesAprendizesConfigurados().forEach(nome=>{if(folgantes.has(normalizeStr(nome))) aprendizes.add(normalizeStr(nome));});
    const invalidos=nomes.filter(n=>!membros.has(normalizeStr(n)) && !aprendizes.has(normalizeStr(n)));
    if (invalidos.length) throw new Error('Sem turma 5×2 nesta data: '+invalidos.join(', ')+'. Ajuste a vigência ou retire da escala.');
}

let turmaSelecionadaIndex=0;
function abrirSeletorTurma(i) {
    if (!estadoEscala.funcionariosCarregados) return alert('A lista de colaboradores não foi carregada. Tente atualizar a base antes de selecionar participantes.');
    turmaSelecionadaIndex=i;
    openMultiSelectModal('', 'Participantes — '+turmasEdicao[i].nome, 'turma5x2');
}
function renderizarSeletorTurma() {
    const turma=turmasEdicao[turmaSelecionadaIndex];
    document.getElementById('modalCheckboxesList').innerHTML=funcionarios.map(f=>`<label class="checkbox-item" data-nome="${escapeHTML(normalizeStr(f.nome))}"><input type="checkbox" value="${escapeHTML(String(f.id))}" ${turma.membros.includes(String(f.id))?'checked':''}><span>${escapeHTML(f.nome)}</span></label>`).join('');
}
function confirmarSeletorTurma() {
    const ids=[...document.querySelectorAll('#modalCheckboxesList input:checked')].map(el=>el.value);
    const outros=turmasEdicao.filter((t,i)=>i!==turmaSelecionadaIndex && t.membros.some(id=>ids.includes(id)));
    if(outros.length && !confirm('Transferir os participantes selecionados das outras turmas para esta turma?')) return;
    const destino=turmasEdicao[turmaSelecionadaIndex];
    for (const turma of outros) {
        for (const id of turma.membros.filter(id=>ids.includes(id))) {
            destino.referencias={...destino.referencias,[id]:turma.referencias?.[id] || ''};
            for (const chave of ['usarFixasCadastro','folgasFixasDomSeg']) {
                destino[chave]=(destino[chave] || []).filter(x=>x!==id);
                if (turma[chave]?.includes(id)) destino[chave].push(id);
            }
        }
    }
    turmasEdicao.forEach((t,i)=>{t.membros=i===turmaSelecionadaIndex?ids:t.membros.filter(id=>!ids.includes(id));});
    renderizarTurmasEdicao();closeMultiSelectModal();
}
