/* Persistência, confirmação de versão e proteção de impressão. Sem dependências externas. */
const estadoEscala = {
    pendente: false, salvando: false, inicializando: true, rascunhoSeguro: false,
    versaoBase: null, dataBase: null, requisicaoPendente: null, erro: false,
    consultas: {}, dadosExibidos: new Map(), configCarregada: false, funcionariosCarregados: false,
    dataFormulario: null, rascunhoBanco: false, rascunhoErro: false
};
const REQUEST_TIMEOUT_MS = 15000;

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function encodeData(value) { return encodeURIComponent(JSON.stringify(value)).replace(/'/g, '%27'); }
function parseJSONField(value, fallback) {
    if (value == null || value === '' || value === 'undefined') return fallback;
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return fallback; }
}
function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000'; }
function jsonCanonical(value) {
    if (Array.isArray(value)) return value.map(jsonCanonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,jsonCanonical(value[k])]));
    return value;
}
function mesmosDados(a,b) { return JSON.stringify(jsonCanonical(a)) === JSON.stringify(jsonCanonical(b)); }
function validarLayout(layout) {
    if (!layout || !Array.isArray(layout.turnos) || !Array.isArray(layout.tabelas)) throw new Error('Configuração de turnos ou tabelas inválida.');
    const ids=new Set();
    for (const item of [...layout.turnos,...layout.tabelas]) {
        if (!/^(t|tbl)_[a-zA-Z0-9_-]+$/.test(item.id || '') || ids.has(item.id)) throw new Error('Identificador de configuração inválido ou repetido.');
        ids.add(item.id);
    }
    for (const table of layout.tabelas) if (!Array.isArray(table.colunas) || !table.colunas.length || table.colunas.some(c=>typeof c!=='string')) throw new Error('Colunas da tabela inválidas.');
}
function nomesUnicos(value) {
    const seen = new Set();
    return String(value || '').split(',').map(n => n.trim()).filter(n => {
        const key = normalizeStr(n);
        if (!key || seen.has(key)) return false;
        seen.add(key); return true;
    });
}
function lerLocal(key) { try { return localStorage.getItem(key); } catch { return null; } }
function gravarLocal(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function removerLocal(key) { try { localStorage.removeItem(key); } catch { /* Mantém a aplicação utilizável. */ } }
function tokenAcesso() { try { return sessionStorage.getItem('escala_access_token') || ''; } catch { return ''; } }

async function fetchAPI(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {...options, cache:'no-store', signal:controller.signal,
            headers:{...options.headers, ...(tokenAcesso() ? {'X-Escala-Token':tokenAcesso()} : {})}});
        if (response.status === 401 || response.status === 403) mostrarAcesso();
        return response;
    } finally { clearTimeout(timer); }
}

async function requestJSON(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options, cache: 'no-store', signal: controller.signal,
            headers: { ...(options.body ? {'Content-Type':'application/json'} : {}),
                ...(tokenAcesso() ? {'X-Escala-Token':tokenAcesso()} : {}), ...options.headers }
        });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) mostrarAcesso();
            let message = `Servidor respondeu com erro (${response.status}).`;
            try { const body = await response.json(); if (body.mensagem) message = body.mensagem; } catch {}
            throw new Error(message);
        }
        try { return await response.json(); }
        catch { throw new Error('O servidor retornou uma resposta inválida.'); }
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('O servidor demorou a responder. O salvamento não foi confirmado.');
        throw error;
    } finally { clearTimeout(timer); }
}

function mostrarAcesso() {
    const card = document.getElementById('acessoEquipe');
    if (card) card.hidden = false;
}
async function entrarEquipe() {
    const input = document.getElementById('codigoAcesso');
    const button = document.getElementById('btnEntrar');
    const status = document.getElementById('statusAcesso');
    if (!input.value.trim()) { status.textContent = 'Informe o código de acesso da equipe.'; return; }
    button.disabled = true;
    try {
        sessionStorage.setItem('escala_access_token', input.value.trim());
        await requestJSON(N8N_GET_CONFIG);
        input.value = '';
        document.getElementById('acessoEquipe').hidden = true;
        await inicializarAplicacao();
    } catch (e) { status.textContent = `Não foi possível entrar. ${e.message}`; }
    finally { button.disabled = false; }
}

function atualizarStatusSalvamento(kind, message) {
    const box = document.getElementById('statusSalvamento');
    if (!box) return;
    box.dataset.estado = kind;
    box.querySelector('[data-status-text]').textContent = message;
    document.getElementById('btnTentarNovamente').hidden = kind !== 'erro' || estadoEscala.rascunhoErro;
    const draftButton = document.getElementById('btnSalvarRascunhoBanco');
    if (draftButton) draftButton.hidden = !estadoEscala.pendente || estadoEscala.salvando;
    const date = document.getElementById('data_escala')?.value;
    document.querySelectorAll('[data-escala-data]').forEach(el => {
        const stale = estadoEscala.pendente && el.dataset.escalaData === date;
        el.classList.toggle('escala-desatualizada', stale);
        const warning = el.querySelector('.aviso-versao');
        if (warning) warning.hidden = !stale;
    });
}
function marcarAlteracao() {
    if (estadoEscala.inicializando || estadoEscala.salvando) return;
    estadoEscala.pendente = true;
    estadoEscala.requisicaoPendente = null;
    estadoEscala.erro = false;
    atualizarStatusSalvamento('pendente', 'Alterações NÃO SALVAS no servidor. Salve e confirme antes de imprimir.');
}
function registrarRascunhoSalvo(ok) {
    estadoEscala.rascunhoSeguro = ok;
    if (estadoEscala.pendente && !estadoEscala.salvando && !estadoEscala.erro) {
        atualizarStatusSalvamento(ok ? 'pendente' : 'erro', ok
            ? 'Escala final NÃO SALVA · rascunho local protegido; sincronizando com o banco. Salve e confirme antes de imprimir.'
            : 'Escala final NÃO SALVA · falhou até a proteção local. Tente salvar novamente e não feche esta página.');
    }
}
function camposAlocacao() {
    return [...turnosConfig.map(t => document.getElementById(`turno_${t.id}`)), document.getElementById('folgas'),
        ...document.querySelectorAll('#escalaForm .fiscal-nome, #escalaForm .linha-tbl-extra select')].filter(Boolean);
}
function valorSelect(sel) {
    // data-init é apenas uma semente para a primeira renderização, nunca um fallback após limpar.
    if (sel.dataset.seeded !== 'true' && sel.options.length === 0) return sel.getAttribute('data-init') || '';
    return sel.value || '';
}
function aplicarAlocacao(target, nomes) {
    const unique = nomesUnicos(nomes.join(','));
    const wanted = new Set(unique.map(normalizeStr));
    const other = camposAlocacao().filter(el => el !== target);
    const moves = other.flatMap(el => nomesUnicos(el.tagName === 'SELECT' ? valorSelect(el) : el.value))
        .filter(n => wanted.has(normalizeStr(n)));
    if (moves.length && !confirm(`Mover ${nomesUnicos(moves.join(',')).join(', ')} para este grupo? A alocação anterior e suas exceções de horário serão removidas.`)) return false;
    other.forEach(el => {
        const remaining = nomesUnicos(el.tagName === 'SELECT' ? valorSelect(el) : el.value).filter(n => !wanted.has(normalizeStr(n)));
        el.value = remaining.join(',');
        if (el.tagName === 'SELECT') { el.removeAttribute('data-init'); el.dataset.seeded = 'true'; }
        else atualizarTagsVisuais(el.id);
    });
    target.value = unique.join(',');
    if (target.tagName === 'SELECT') { target.removeAttribute('data-init'); target.dataset.seeded = 'true'; }
    else atualizarTagsVisuais(target.id);
    // Exceções pertencem somente a quem continua alocado em um turno.
    const inShift = new Set(turnosConfig.flatMap(t => nomesUnicos(document.getElementById(`turno_${t.id}`)?.value)).map(normalizeStr));
    document.querySelectorAll('#containerExcecoesHorario .exc-nomes-hidden').forEach(el => {
        const moved = new Set(moves.map(normalizeStr));
        el.value = nomesUnicos(el.value).filter(n => inShift.has(normalizeStr(n)) && !moved.has(normalizeStr(n))).join(',');
        atualizarTagsVisuais(el.id);
    });
    atualizarOpcoesDropdown(); salvarRascunhoFormularioDebounced(); return true;
}
function validarDuplicacoes() {
    const seen = new Set(); const duplicates = new Set();
    camposAlocacao().forEach(el => {
        // Não deduplicar aqui: detectar também duas ocorrências no mesmo campo legado.
        const values = String(el.tagName === 'SELECT' ? valorSelect(el) : el.value).split(',').map(n => n.trim()).filter(Boolean);
        values.forEach(n => { const key = normalizeStr(n); if (seen.has(key)) duplicates.add(n); seen.add(key); });
    });
    if (duplicates.size) throw new Error(`Pessoas duplicadas: ${[...duplicates].join(', ')}. Corrija as alocações e tente novamente.`);
}
function coletarPayloadEscala() {
    salvarCamposEscondidos();
    const payload = Object.fromEntries(new FormData(document.getElementById('escalaForm')));
    const turnos = {};
    turnosConfig.forEach(t => { turnos[t.id] = document.getElementById(`turno_${t.id}`)?.value || ''; });
    payload.json_turnos = turnos;
    payload.json_layout = {turnos: turnosConfig, tabelas: tabelasExtrasConfig};
    if (payload.observacoes) payload.observacoes = `${document.getElementById('cor_observacoes').value}|${payload.observacoes}`;
    return payload;
}
async function consultarEscala(data) {
    const result = await requestJSON(`${N8N_BUSCA_URL}?data=${encodeURIComponent(data)}`);
    const row = Array.isArray(result) ? result[0] : result;
    return row && row.data_escala ? row : null;
}
function conferirPayload(row, payload) {
    if (!row || row.save_request_id !== payload.save_request_id) return false;
    const turnos = parseJSONField(row.json_turnos, {});
    return Object.keys(payload.json_turnos).every(id => turnos[id] === payload.json_turnos[id])
        && ['fiscais','folgas','observacoes'].every(key => (row[key] || '') === (payload[key] || ''))
        && mesmosDados(parseJSONField(row.json_excecoes_horario, []), parseJSONField(payload.json_excecoes_horario, []))
        && mesmosDados(parseJSONField(row.json_tabelas_extras, {}), parseJSONField(payload.json_tabelas_extras, {}))
        && mesmosDados(parseJSONField(row.json_layout, {}), payload.json_layout);
}
async function salvarEscalaConfiavel(event) {
    event?.preventDefault();
    if (estadoEscala.salvando) return;
    const form = document.getElementById('escalaForm');
    if (!form.reportValidity()) return;
    // Trava antes da primeira espera para impedir duplo toque e alterações durante o envio.
    estadoEscala.salvando = true;
    estadoEscala.pendente = true;
    estadoEscala.erro = false;
    const button = document.getElementById('btnSubmit');
    button.disabled = true; button.textContent = 'Verificando e salvando…';
    gravarRascunhoDebounced.cancel();
    document.querySelector('.tabs').inert = true;
    const mobileNav = document.getElementById('mobileNavSelect');
    if (mobileNav) mobileNav.disabled = true;
    let payload;
    try {
        if (!estadoEscala.configCarregada || !estadoEscala.funcionariosCarregados) {
            throw new Error('A base e as configurações não foram carregadas. Confira o acesso e a conexão e atualize a página; seu rascunho permanece guardado.');
        }
        salvarRascunhoFormulario();
        validarDuplicacoes();
        const data = document.getElementById('data_escala').value;
        const escalados = obterEscaladosGlobais().map(normalizeStr);
        const faltam = funcionarios.filter(f => f.alerta && !isDeFerias(f,data) && !isDesativado(f,data) && !getObjAusencia(f,data) && !escalados.includes(normalizeStr(f.nome)));
        if (faltam.length && !confirm(`Pendentes de alocação: ${faltam.map(f=>f.nome).join(', ')}. Salvar mesmo assim?`)) {
            atualizarStatusSalvamento('pendente','Salvamento cancelado. Alterações NÃO SALVAS; rascunho preservado.'); return;
        }
        payload = coletarPayloadEscala();
        form.inert = true;
        atualizarStatusSalvamento('salvando', 'Salvando… Aguarde a confirmação. Impressão bloqueada.');
        const atual = await consultarEscala(data); // Falha na checagem interrompe, não sobrescreve às cegas.
        const retry = estadoEscala.requisicaoPendente;
        if (retry && conferirPayload(atual, retry)) { payload = retry; }
        else {
            if (atual) {
                if (estadoEscala.dataBase === data && estadoEscala.versaoBase && atual.ultima_atualizacao !== estadoEscala.versaoBase) {
                    throw new Error('A escala mudou no servidor desde que você começou a editar. Seu rascunho foi preservado. Abra a versão atual antes de sobrescrever.');
                }
                if (estadoEscala.dataBase !== data && !confirm('Já existe uma escala nesta data. Deseja substituir pela versão do formulário?')) {
                    atualizarStatusSalvamento('pendente','Substituição cancelada. Alterações NÃO SALVAS; rascunho preservado.'); return;
                }
            }
            payload.expected_updated_at = atual?.ultima_atualizacao || null;
            payload.save_request_id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            estadoEscala.requisicaoPendente = payload;
            salvarRascunhoFormulario();
            const response = await requestJSON(N8N_WEBHOOK_URL,{method:'POST',body:JSON.stringify(payload)});
            if (response.status !== 'sucesso' || response.saved?.save_request_id !== payload.save_request_id) {
                throw new Error(response.mensagem || 'O servidor não confirmou esta versão. Verifique se o backend atualizado foi instalado.');
            }
        }
        const saved = await consultarEscala(data);
        if (!conferirPayload(saved,payload)) throw new Error('A versão consultada não corresponde ao envio. NÃO imprima a escala antiga. Tente novamente.');
        estadoEscala.pendente = false; estadoEscala.erro = false;
        estadoEscala.versaoBase = saved.ultima_atualizacao; estadoEscala.dataBase = data;
        estadoEscala.requisicaoPendente = null;
        let avisoRascunho='';
        try { const result=await requestJSON(N8N_DELETE_DRAFT,{method:'POST',body:JSON.stringify({data_escala:data})}); if(result.status!=='ok') throw new Error('O banco não confirmou a exclusão.'); estadoEscala.rascunhoBanco=false; }
        catch(e) { console.warn('[Rascunho] Escala confirmada, mas rascunho não foi removido do banco:',e); avisoRascunho=' O rascunho compartilhado antigo não foi excluído; toque em “Limpar Tudo e Recomeçar” para removê-lo.'; }
        modoEdicao = true;
        removerLocal('escala_rascunho_temp'); removerLocal('escala_edicao_temp'); removerLocal(`escala_rascunho_${data}`);
        document.getElementById('data_busca').value = data;
        exibirEscalaConfirmada(document.getElementById('historicoContainer'), saved);
        if (data === getHojeISO()) exibirEscalaConfirmada(document.getElementById('escalaHojeContainer'), saved);
        atualizarStatusSalvamento('salvo',`SALVO E CONFIRMADO · Escala de ${formatarDataBR(data)}. A impressão está liberada.${avisoRascunho}`);
        openTab('historico', false);
    } catch (error) {
        estadoEscala.erro = true;
        atualizarStatusSalvamento('erro',`NÃO SALVO/CONFIRMADO. ${error.message} ${estadoEscala.rascunhoSeguro ? 'Rascunho preservado localmente e será sincronizado com o banco.' : 'Falhou também a proteção local; não feche esta página.'}`);
    } finally {
        form.inert = false; estadoEscala.salvando = false;
        document.querySelector('.tabs').inert = false;
        if (mobileNav) mobileNav.disabled = false;
        button.disabled = false; button.textContent = '💾 Salvar e confirmar escala';
    }
}

function exibirEscalaConfirmada(container, row) {
    if (!container) return;
    estadoEscala.dadosExibidos.set(container.id, row);
    container.innerHTML = renderTabelaHTML(row);
    atualizarStatusSalvamento(document.getElementById('statusSalvamento').dataset.estado,
        document.querySelector('[data-status-text]').textContent);
}
async function carregarEscalaContainer(id, data) {
    const container = document.getElementById(id);
    const request = (estadoEscala.consultas[id] || 0) + 1;
    estadoEscala.consultas[id] = request;
    estadoEscala.dadosExibidos.delete(id);
    container.textContent = 'Consultando a versão salva…';
    try {
        const row = await consultarEscala(data);
        if (estadoEscala.consultas[id] !== request) return;
        if (row) exibirEscalaConfirmada(container,row);
        else container.textContent = 'Nenhuma escala salva para esta data.';
    } catch(error) {
        if (estadoEscala.consultas[id] !== request) return;
        container.textContent = `Não foi possível consultar a escala. ${error.message} Atualize antes de imprimir.`;
    }
}
function podeImprimir(row) {
    return !estadoEscala.salvando && !(estadoEscala.pendente && row.data_escala.split('T')[0] === document.getElementById('data_escala').value);
}
async function imprimirEscalaAtual() {
    const tab = document.querySelector('.tab-content.active')?.id;
    const id = tab === 'vigente' ? 'escalaHojeContainer' : tab === 'historico' ? 'historicoContainer' : null;
    if (!id) { if (tab === 'ausencias') window.print(); return; }
    const row = estadoEscala.dadosExibidos.get(id);
    if (!row || !podeImprimir(row)) { alert('Impressão bloqueada: salve e confirme as alterações ou atualize a consulta antes de imprimir.'); return; }
    try {
        const current = await consultarEscala(row.data_escala.split('T')[0]);
        if (!current || current.ultima_atualizacao !== row.ultima_atualizacao || current.save_request_id !== row.save_request_id) {
            if (current) exibirEscalaConfirmada(document.getElementById(id), current);
            else { estadoEscala.dadosExibidos.delete(id); document.getElementById(id).textContent='A escala não está mais disponível.'; }
            alert('A versão salva mudou. A consulta foi atualizada; confira antes de imprimir novamente.'); return;
        }
        if (!podeImprimir(row)) throw new Error('Há alterações pendentes. Salve antes de imprimir.');
        window.print();
    } catch(e) { alert(`Impressão bloqueada. ${e.message}`); }
}
function alinharObservacoesNoFimDaFolha() {
    const alturaUtilA4 = (297 - 16) * 96 / 25.4;
    const observacoes = [...document.querySelectorAll('.tab-content.active .sheet-observacoes')];
    observacoes.forEach(element => {
        const espaco = element.previousElementSibling?.classList.contains('sheet-observation-spacer') ? element.previousElementSibling : null;
        if (espaco) espaco.style.height = '0';
        element.style.marginTop = '0';
    });
    observacoes.forEach(element => {
        const rect = element.getBoundingClientRect();
        const topoDocumento = rect.top + window.scrollY;
        const posicaoNaFolha = ((topoDocumento % alturaUtilA4) + alturaUtilA4) % alturaUtilA4;
        const espacoAteORodape = Math.max(0, ((alturaUtilA4 - posicaoNaFolha - rect.height) % alturaUtilA4 + alturaUtilA4) % alturaUtilA4 - 16);
        const espaco = element.previousElementSibling?.classList.contains('sheet-observation-spacer') ? element.previousElementSibling : null;
        if (espaco && espacoAteORodape > 1) espaco.style.height = `${espacoAteORodape}px`;
    });
}
window.addEventListener('beforeprint', () => {
    const tab = document.querySelector('.tab-content.active')?.id;
    const id = tab === 'vigente' ? 'escalaHojeContainer' : tab === 'historico' ? 'historicoContainer' : null;
    const row = id && estadoEscala.dadosExibidos.get(id);
    document.body.classList.toggle('impressao-bloqueada', tab !== 'ausencias' && (!row || !podeImprimir(row)));
    if (!document.body.classList.contains('impressao-bloqueada')) alinharObservacoesNoFimDaFolha();
});
window.addEventListener('afterprint', () => {
    document.body.classList.remove('impressao-bloqueada');
    document.querySelectorAll('.sheet-observation-spacer').forEach(element => { element.style.height = ''; });
    document.querySelectorAll('.sheet-observacoes').forEach(element => { element.style.marginTop = ''; });
});
window.addEventListener('beforeunload', event => {
    if (!estadoEscala.pendente) return;
    salvarRascunhoFormulario(); event.preventDefault(); event.returnValue = '';
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && estadoEscala.pendente) salvarRascunhoFormulario();
});
document.addEventListener('change', event => {
    if (event.target.matches('#escalaForm select.func-select')) {
        event.target.removeAttribute('data-init'); event.target.dataset.seeded = 'true';
        atualizarOpcoesDropdown(); salvarRascunhoFormularioDebounced();
    }
});

function reconstruirFormularioPreservando() {
    if (estadoEscala.inicializando) { gerarCamposFormularioEscala(); return; }
    salvarRascunhoFormulario();
    gerarCamposFormularioEscala();
    carregarRascunhoFormulario();
    marcarAlteracao(); salvarRascunhoFormulario();
}
