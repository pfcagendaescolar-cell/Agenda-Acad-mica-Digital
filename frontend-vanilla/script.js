/**
 * AGENDA ACADÊMICA DIGITAL IFPR
 * VERSÃO COM API REST - Eventos do servidor
 */

// =============================
// CONFIGURAÇÕES
// =============================

const API_BASE = 'http://localhost:3000';

const FERIADOS_ESTADUAIS = [
    { date: "-12-19", name: "Emancipação Política do Paraná", type: "state" }
];

const PRIORIDADES = { "prova": 1, "trabalho": 2, "tarefa": 3, "evento": 4 };
const SESSAO_LIDER_KEY = 'ifpr_sessao_lider_v1';
const SESSAO_LIDER_LEGACY_FLAG = 'ifpr_lider_logado';
const SESSAO_LIDER_LEGACY_USER = 'ifpr_user_logged';

// =============================
// SISTEMA DE NOTIFICAÇÕES (Toast)
// =============================

/**
 * Exibe uma notificação toast na tela
 * @param {string} message - Mensagem a exibir
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duração em ms (padrão: 5000 para erro, 3000 para sucesso)
 */
function showNotification(message, type = 'info', duration = null) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    container.appendChild(toast);

    if (duration === null) {
        duration = type === 'error' ? 5000 : 3000;
    }

    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

function showSuccess(message, duration) {
    showNotification(message, 'success', duration);
}

function showError(message, duration) {
    showNotification(message, 'error', duration);
}

function showWarning(message, duration) {
    showNotification(message, 'warning', duration);
}

function showInfo(message, duration) {
    showNotification(message, 'info', duration);
}

// =============================
// ESTADO GLOBAL
// =============================

let dataAtualDeVisualizacao = new Date();
let eventosCarregados = [];   
let feriadosNacionais = {};
let turmaAtual = JSON.parse(localStorage.getItem('ifpr_selected_turma_v1')) || null;
let turmasCadastradas = [];   
let liderLogado = false;      

// =============================
// REGRA DE PERMISSÃO POR TURMA (NOVA)
// =============================

/**
 * Verifica se o usuário atual possui permissão de edição/administração
 * na turma que está atualmente aberta no calendário.
 */
function podeEditarTurma() {
    const usuario = obterUsuarioLogado();
    if (!usuario) return false;

    const role = usuario.role || localStorage.getItem("usuarioRole");
    
    if (role === "admin") {
        return true;
    }

    if (role === "lider" || role === "turma_admin") {
        const turmaUsuario = String(usuario.turma || usuario.turmaId || localStorage.getItem("usuarioTurma") || '').trim();
        const turmaAbertaId = turmaAtual ? String(turmaAtual.id || turmaAtual.nome || '').trim() : '';
        const turmaAbertaNome = turmaAtual ? String(turmaAtual.nome || '').trim() : '';

        // Compara tanto pelo ID quanto pelo Nome da turma aberta
        if (turmaUsuario && (turmaUsuario === turmaAbertaId || turmaUsuario === turmaAbertaNome)) {
            return true;
        }
    }

    return false;
}

// =============================
// SESSÃO DO LÍDER
// =============================

function salvarSessao(usuario) {
    if (!usuario || !usuario.email) {
        limparSessao();
        return null;
    }

    const sessao = {
        usuario,
        autenticadoEm: new Date().toISOString()
    };

    localStorage.setItem(SESSAO_LIDER_KEY, JSON.stringify(sessao));
    localStorage.removeItem(SESSAO_LIDER_LEGACY_FLAG);
    localStorage.removeItem(SESSAO_LIDER_LEGACY_USER);

    return sessao;
}

function obterSessao() {
    try {
        const sessaoSalva = JSON.parse(localStorage.getItem(SESSAO_LIDER_KEY));

        if (sessaoSalva && sessaoSalva.usuario && sessaoSalva.usuario.email) {
            return sessaoSalva;
        }
    } catch (erro) {
        console.warn('Sessão salva inválida. Limpando dados locais.', erro);
        limparSessao();
        return null;
    }

    try {
        const liderLegadoLogado = localStorage.getItem(SESSAO_LIDER_LEGACY_FLAG) === 'true';
        const usuarioLegado = JSON.parse(localStorage.getItem(SESSAO_LIDER_LEGACY_USER));

        if (liderLegadoLogado && usuarioLegado && usuarioLegado.email) {
            return salvarSessao(usuarioLegado);
        }
    } catch (erro) {
        console.warn('Sessão antiga inválida. Limpando dados locais.', erro);
    }

    localStorage.removeItem(SESSAO_LIDER_LEGACY_FLAG);
    localStorage.removeItem(SESSAO_LIDER_LEGACY_USER);
    return null;
}

function limparSessao() {
    localStorage.removeItem(SESSAO_LIDER_KEY);
    localStorage.removeItem(SESSAO_LIDER_LEGACY_FLAG);
    localStorage.removeItem(SESSAO_LIDER_LEGACY_USER);
    localStorage.removeItem('ifpr_user_logged');
    localStorage.removeItem('usuarioRole');
    localStorage.removeItem('usuarioTurma');
    localStorage.removeItem('usuarioEmail');
}

function obterUsuarioLogado() {
    const sessao = obterSessao();
    if (sessao && sessao.usuario) return sessao.usuario;
    
    try {
        const userLogged = JSON.parse(localStorage.getItem('ifpr_user_logged'));
        if (userLogged && userLogged.email) return userLogged;
    } catch (e) {}

    const role = localStorage.getItem('usuarioRole');
    const email = localStorage.getItem('usuarioEmail');
    if (email) {
        return {
            email: email,
            role: role || 'user',
            turma: localStorage.getItem('usuarioTurma') || ''
        };
    }

    return null;
}

function usuarioEstaLogado() {
    return Boolean(obterUsuarioLogado());
}

function obterNomeUsuario(usuario) {
    if (!usuario) return '';
    return usuario.nome || usuario.name || usuario.email || 'Líder';
}

function atualizarInterfaceUsuario() {
    const usuario = obterUsuarioLogado();
    const menuIconText = document.getElementById('menuIconText');
    
    if (usuario) {
        if (menuIconText) menuIconText.textContent = 'Minha Conta';
        
        const nameEl = document.getElementById('loggedUserName');
        const emailEl = document.getElementById('loggedUserEmail');
        const turmaEl = document.getElementById('loggedUserTurma');
        
        if (nameEl) nameEl.textContent = obterNomeUsuario(usuario);
        if (emailEl) emailEl.textContent = usuario.email || '--';
        
        if (turmaEl) {
            const idTurmaLider = usuario.turma || usuario.turmaId || usuario._id;
            const turma = turmasCadastradas.find(t => String(t.id) === String(idTurmaLider) || String(t.nome) === String(idTurmaLider));
            turmaEl.textContent = turma ? turma.nome : (usuario.turma || 'Não definida');
        }
    } else {
        if (menuIconText) menuIconText.textContent = 'Login';
    }

    const adminFormArea = document.getElementById('adminFormArea');
    if (adminFormArea) {
        // Exibe o painel de criação somente se o usuário tiver privilégios na turma aberta
        adminFormArea.style.display = podeEditarTurma() ? 'block' : 'none';
    }
}

// =============================
// CARREGAR TURMAS DA API
// =============================
async function carregarTurmasDoServidor() {
    try {
        const res = await fetch(`${API_BASE}/turmas`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        turmasCadastradas = await res.json();
        return turmasCadastradas;
    } catch (err) {
        console.error("Erro ao carregar turmas do servidor:", err);
        turmasCadastradas = [];
        return [];
    }
}

function getTurmasCadastradas() {
    return turmasCadastradas;
}

// =============================
// RECESSOS ACADÊMICOS
// =============================

const RECESSOS_ACADEMICOS = [
    { inicio: "2024-03-28", fim: "2024-03-31", descricao: "Recesso Semana Santa" },
    { inicio: "2024-07-08", fim: "2024-07-22", descricao: "Recesso Escolar de Inverno" },
    { inicio: "2024-10-14", fim: "2024-10-15", descricao: "Recesso Dia do Professor" },
    { inicio: "2024-12-21", fim: "2025-01-31", descricao: "Férias de Verão" },
    { inicio: "2025-07-07", fim: "2025-07-21", descricao: "Recesso Escolar de Inverno 2025" },
    { inicio: "2026-07-10", fim: "2026-07-25", descricao: "Férias de Inverno 2026" }
];

function verificarRecesso(dataChave) {
    const dataAlvo = new Date(dataChave + "T12:00:00");

    const r = RECESSOS_ACADEMICOS.find(item => {
        const dataInicio = new Date(item.inicio + "T12:00:00");
        const dataFim = new Date(item.fim + "T12:00:00");
        return dataAlvo >= dataInicio && dataAlvo <= dataFim;
    });

    if (r) return r.descricao;

    const diaSemana = dataAlvo.getDay();

    if (diaSemana === 1) {
        const t = new Date(dataAlvo);
        t.setDate(t.getDate() + 1);
        const chaveAmanha = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        if (feriadosNacionais && feriadosNacionais[chaveAmanha]) {
            return `Recesso Ponte (${feriadosNacionais[chaveAmanha].name})`;
        }
    } else if (diaSemana === 5) {
        const t = new Date(dataAlvo);
        t.setDate(t.getDate() - 1);
        const chaveOntem = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        if (feriadosNacionais && feriadosNacionais[chaveOntem]) {
            return `Recesso Ponte (${feriadosNacionais[chaveOntem].name})`;
        }
    }

    return null;
}

// =============================
// INICIALIZAÇÃO
// =============================

async function inicializar() {
    await carregarTurmasDoServidor();  
    await carregarFeriadosNacionais(dataAtualDeVisualizacao.getFullYear());
    carregarConfiguracoesTema();
    liderLogado = usuarioEstaLogado(); 
    atualizarInterfaceUsuario(); 
    configurarEventosInterface();
    verificarEstadoInicial();
}

function verificarEstadoInicial() {
    const turmasSelection = document.getElementById('turmasSelection');
    const calendarApp = document.getElementById('calendarApp');

    if (turmaAtual) {
        turmasSelection.style.display = 'none';
        calendarApp.style.display = 'block';
        document.getElementById('turmaNomeDisplay').innerText = turmaAtual.nome;
        
        // Atualiza a visibilidade do painel administrativo ao alternar de turma
        const adminFormArea = document.getElementById('adminFormArea');
        if (adminFormArea) {
            adminFormArea.style.display = podeEditarTurma() ? 'block' : 'none';
        }

        carregarEExibirCalendario();
    } else {
        turmasSelection.style.display = 'block';
        calendarApp.style.display = 'none';
        renderizarTurmas();
    }
}

function renderizarTurmas() {
    const turmasList = document.getElementById('turmasList');
    if (!turmasList) return;
    turmasList.innerHTML = "";

    const turmas = getTurmasCadastradas();

    if (turmas.length === 0) {
        turmasList.innerHTML = "<p style='opacity:0.6; text-align:center;'>Nenhuma turma cadastrada no painel admin.</p>";
        return;
    }

    turmas.forEach(turma => {
        const btn = document.createElement('button');
        btn.className = 'turma-card';
        btn.innerHTML = `${turma.nome} <br><small style="font-size: 0.8rem; font-weight: normal; opacity: 0.8;">${turma.curso || ''}</small>`;
        btn.onclick = () => selecionarTurma(turma);
        turmasList.appendChild(btn);
    });
}

function selecionarTurma(turma) {
    turmaAtual = turma;
    localStorage.setItem('ifpr_selected_turma_v1', JSON.stringify(turma));
    verificarEstadoInicial();
}

// =============================
// FERIADOS API
// =============================

async function carregarFeriadosNacionais(ano) {
    try {
        const resposta = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        const lista = await resposta.json();

        feriadosNacionais = {};

        lista.forEach(f => {
            feriadosNacionais[f.date] = { name: f.name, type: "national" };
        });

        FERIADOS_ESTADUAIS.forEach(fe => {
            const chave = ano + fe.date;
            feriadosNacionais[chave] = { name: fe.name, type: "state" };
        });

    } catch (erro) {
        console.error("Erro ao carregar feriados:", erro);
    }
}

// =============================
// CARREGAR EVENTOS DO SERVIDOR
// =============================

async function carregarEventosDaAPI() {
    if (!turmaAtual) {
        eventosCarregados = [];
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/eventos/turma/${turmaAtual.id}`);
        eventosCarregados = await res.json();
    } catch (err) {
        console.error("Erro ao carregar eventos:", err);
        eventosCarregados = [];
    }
}

function getEventosPorData(chaveData) {
    return eventosCarregados.filter(e => e.data === chaveData);
}

// =============================
// RENDER CALENDÁRIO
// =============================

async function carregarEExibirCalendario() {
    await carregarEventosDaAPI();
    renderizarCalendario();
}

function renderizarCalendario() {
    const grid = document.getElementById('calendarGrid');
    const displayMes = document.getElementById('monthDisplay');
    const displayAno = document.getElementById('yearDisplay');

    grid.innerHTML = "";

    const ano = dataAtualDeVisualizacao.getFullYear();
    const mes = dataAtualDeVisualizacao.getMonth();

    const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(dataAtualDeVisualizacao);
    displayMes.innerText = nomeMes;
    displayAno.innerText = ano;

    const primeiroDiaDaSemana = new Date(ano, mes, 1).getDay();
    const totalDiasNoMes = new Date(ano, mes + 1, 0).getDate();

    for (let i = 0; i < primeiroDiaDaSemana; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let dia = 1; dia <= totalDiasNoMes; dia++) {
        const divDia = document.createElement('div');
        divDia.className = 'day';
        divDia.innerText = dia;

        const chaveData = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const diaSemana = new Date(ano, mes, dia).getDay();

        if (diaSemana === 0 || diaSemana === 6) {
            divDia.classList.add('day-off');
        }

        const nomeRecesso = verificarRecesso(chaveData);
        if (nomeRecesso) {
            divDia.classList.add('day-recesso');
            divDia.title = nomeRecesso;
        }

        if (feriadosNacionais[chaveData]) {
            const f = feriadosNacionais[chaveData];
            divDia.classList.add(f.type === "national" ? 'holiday-national' : 'holiday-state');
            divDia.title = `Feriado: ${f.name}`;
        }

        divDia.innerText = '';

        const numSpan = document.createElement('span');
        numSpan.className = 'day-number';
        numSpan.textContent = dia;
        divDia.appendChild(numSpan);

        const eventosDoDia = getEventosPorData(chaveData);

        if (eventosDoDia.length > 0) {
            const ORDEM = ['prova', 'trabalho', 'tarefa', 'evento'];
            const tiposPresentes = ORDEM.filter(t =>
                eventosDoDia.some(e => e.categoria === t)
            );

            const dotsWrapper = document.createElement('div');
            dotsWrapper.className = 'day-dots';
            tiposPresentes.forEach(tipo => {
                const dot = document.createElement('span');
                dot.className = `day-dot day-dot--${tipo}`;
                dotsWrapper.appendChild(dot);
            });
            divDia.appendChild(dotsWrapper);
        }

        divDia.onclick = () => abrirPopupDetalhes(chaveData);

        grid.appendChild(divDia);
    }
}

// =============================
// MODAL
// =============================

function abrirPopupDetalhes(chaveData) {
    document.getElementById('eventDate').value = chaveData;
    document.getElementById('modalDateTitle').innerText =
        chaveData.split('-').reverse().join('/');

    const badge = document.getElementById('specialBadge');
    const txt = document.getElementById('specialText');

    const recesso = verificarRecesso(chaveData);
    const feriado = feriadosNacionais[chaveData];

    if (recesso || feriado) {
        badge.style.display = "block";

        if (feriado) {
            txt.innerText = `🚩 Feriado: ${feriado.name}`;
            badge.style.backgroundColor = "var(--color-holiday-nat)";
        } else {
            txt.innerText = `🏖️ ${recesso}`;
            badge.style.backgroundColor = "var(--color-recesso)";
        }

    } else {
        badge.style.display = "none";
    }

    renderizarListaDeEventos(chaveData);

    const adminFormArea = document.getElementById('adminFormArea');
    if (adminFormArea) {
        // Exibe o painel de criação dentro do modal apenas se possuir permissão na turma aberta
        adminFormArea.style.display = podeEditarTurma() ? 'block' : 'none';
    }

    document.getElementById('eventModal').style.display = "flex";
}

function renderizarListaDeEventos(chaveData) {
    const listaHtml = document.getElementById('eventsList');
    listaHtml.innerHTML = "";

    const userLogged = obterUsuarioLogado() || {};
    const eventosDoDia = getEventosPorData(chaveData);

    if (eventosDoDia.length === 0) {
        listaHtml.innerHTML = "<p style='opacity:0.5;'>Nenhuma atividade.</p>";
    }

    eventosDoDia.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'event-item';
        item.style.borderLeftColor = `var(--cat-${ev.categoria})`;

        const badgeGeral = ev.tipo === 'geral'
            ? '<span style="font-size:0.65rem; background:var(--primary); color:white; padding:1px 6px; border-radius:8px; margin-left:6px;">GERAL</span>'
            : '';

        let podeEditar = false;
        
        // Validação estrita considerando a regra de turma atual aberta
        if (podeEditarTurma()) {
            if (userLogged.role === 'admin') {
                podeEditar = true; 
            } else {
                const idTurmaLider = userLogged.turma || userLogged.turmaId || userLogged._id;
                if (String(ev.turmaId) === String(idTurmaLider) && ev.tipo !== 'geral') {
                    podeEditar = true;
                }
            }
        }

        const btnRemover = podeEditar
            ? `<button onclick="removerAtividade('${ev._id}')">🗑️</button>` : '';

        const descHtml = ev.descricao ? `<p class="event-desc">${ev.descricao}</p>` : '';

        item.innerHTML = `
            <div style="display:flex;justify-content:space-between; align-items:flex-start;">
                <div>
                    <strong>${ev.titulo}${badgeGeral}</strong><br>
                    <small>${ev.hora || '--:--'} | ${(ev.categoria || '').toUpperCase()}</small>
                    ${descHtml}
                </div>
                ${btnRemover}
            </div>
        `;

        listaHtml.appendChild(item);
    });
}

// =============================
// NAVEGAÇÃO
// =============================

async function mudarMesCalendar(direcao) {
    const anoAnterior = dataAtualDeVisualizacao.getFullYear();
    dataAtualDeVisualizacao.setMonth(dataAtualDeVisualizacao.getMonth() + direcao);

    if (dataAtualDeVisualizacao.getFullYear() !== anoAnterior) {
        await carregarFeriadosNacionais(dataAtualDeVisualizacao.getFullYear());
    }

    renderizarCalendario();
}

// =============================
// EVENTOS (CRUD VIA API)
// =============================

/**
 * Helper para injetar os headers de autenticação exigidos pelo middleware nas requisições de eventos.
 */
function obterHeadersAutenticacao() {
    const user = obterUsuarioLogado() || {};
    
    const role = user.role || localStorage.getItem("usuarioRole") || '';
    const turma = user.turma || user.turmaId || localStorage.getItem("usuarioTurma") || '';
    const email = user.email || localStorage.getItem("usuarioEmail") || '';

    return {
        'Content-Type': 'application/json',
        'x-usuario-role': role,
        'x-usuario-turma': String(turma),
        'x-usuario-email': email
    };
}

window.removerAtividade = async (eventoId) => {
    if (!podeEditarTurma()) {
        showError('Acesso Negado: Você não possui permissão administrativa nesta turma.');
        return;
    }

    if (!confirm("Deseja apagar?")) return;

    try {
        const userLogged = obterUsuarioLogado() || {};
        
        if (userLogged.role === 'turma_admin' || userLogged.role === 'lider') {
            const evento = eventosCarregados.find(e => e._id === eventoId);
            
            if (!evento) {
                showError('Evento não encontrado no calendário.');
                return;
            }
            
            const idTurmaLider = userLogged.turma || userLogged.turmaId || userLogged._id;
            
            if (String(evento.turmaId) !== String(idTurmaLider) || evento.tipo === 'geral') {
                showError('Acesso Negado: Você só pode excluir eventos da sua própria turma.');
                return;
            }
        }

        const headers = obterHeadersAutenticacao();
        
        const res = await fetch(`${API_BASE}/eventos/${eventoId}`, { 
            method: 'DELETE',
            headers
        });

        if (!res.ok) {
            const erro = await res.json();
            throw new Error(erro.error || 'Erro ao deletar evento');
        }

        await carregarEventosDaAPI();
        renderizarCalendario();

        const chave = document.getElementById('eventDate').value;
        if (chave) renderizarListaDeEventos(chave);
    } catch (err) {
        console.error(err);
        showError(`Erro ao remover evento: ${err.message}`);
    }
};

function configurarEventosInterface() {
    const loginBtn = document.getElementById('menuIcon'); 
    const loginModal = document.getElementById('loginModal');
    const closeLoginBtn = document.getElementById('closeLoginModal');
    
    const userInfoModal = document.getElementById('userInfoModal');
    const closeUserInfoBtn = document.getElementById('closeUserInfoModal');

    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (usuarioEstaLogado()) {
                atualizarInterfaceUsuario(); 
                if (userInfoModal) userInfoModal.style.display = 'flex';
            } else {
                if (loginModal) loginModal.style.display = 'flex';
            }
        });
    }

    if (closeLoginBtn) {
        closeLoginBtn.addEventListener('click', () => {
            if (loginModal) loginModal.style.display = 'none';
        });
    }
    
    if (closeUserInfoBtn) {
        closeUserInfoBtn.addEventListener('click', () => {
            if (userInfoModal) userInfoModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.style.display = 'none';
        }
        if (e.target === userInfoModal) {
            userInfoModal.style.display = 'none';
        }
    });

    const sidebarLoginForm = document.getElementById('sidebarLoginForm');

    if (sidebarLoginForm) {
        sidebarLoginForm.onsubmit = async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value.trim();
            const senha = document.getElementById('loginPass').value.trim();

            if (!email || !senha) {
                showError("E-mail e senha são obrigatórios.");
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha })
                });

                const data = await res.json();

                if (res.ok) {
                    liderLogado = true;
                    localStorage.setItem('ifpr_lider_logado', 'true');
                    localStorage.setItem('ifpr_user_logged', JSON.stringify(data.user));

                    if (data.user.role) localStorage.setItem('usuarioRole', data.user.role);
                    if (data.user.turma || data.user.turmaId) localStorage.setItem('usuarioTurma', data.user.turma || data.user.turmaId);
                    if (data.user.email) localStorage.setItem('usuarioEmail', data.user.email);

                    if (loginModal) loginModal.style.display = 'none';
                    sidebarLoginForm.reset();
                    
                    atualizarInterfaceUsuario();
                    if (turmaAtual) renderizarCalendario();
                    
                    showSuccess("Login realizado com sucesso!");
                } else {
                    showError(data.error || "E-mail ou senha incorretos.");
                }
            } catch (erro) {
                console.error("Erro ao fazer login:", erro);
                showError("Erro de conexão com o servidor.");
            }
        };
    }

    const btnLogoutUser = document.getElementById('btnLogoutUser');
    if (btnLogoutUser) {
        btnLogoutUser.onclick = () => {
            if (confirm("Tem certeza que deseja sair?")) {
                liderLogado = false;
                limparSessao();

                if (userInfoModal) userInfoModal.style.display = 'none';
                atualizarInterfaceUsuario();

                if (turmaAtual) renderizarCalendario();
                
                showSuccess("Logout realizado com sucesso!");
            }
        };
    }

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.onchange = (e) => {
            const novoTema = e.target.checked ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', novoTema);
            localStorage.setItem('ifpr_tema', novoTema);
        };
    }

    document.getElementById('prevMonth').onclick = () => mudarMesCalendar(-1);
    document.getElementById('nextMonth').onclick = () => mudarMesCalendar(1);

    const btnVoltarTurmas = document.getElementById('btnVoltarTurmas');
    if (btnVoltarTurmas) {
        btnVoltarTurmas.onclick = () => {
            turmaAtual = null;
            localStorage.removeItem('ifpr_selected_turma_v1');
            verificarEstadoInicial();
        };
    }

    document.querySelector('.close-modal-btn').onclick =
        () => document.getElementById('eventModal').style.display = "none";

    document.getElementById('eventForm').onsubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!podeEditarTurma()) {
            showError('Acesso Negado: Você não possui permissão para criar eventos nesta turma.');
            return false;
        }

        const chave = document.getElementById('eventDate').value;
        const userLogged = obterUsuarioLogado() || {};

        let idTurmaEvento = turmaAtual ? (turmaAtual.id || turmaAtual.nome) : null;

        if (userLogged.role === 'turma_admin' || userLogged.role === 'lider') {
            const idTurmaLider = userLogged.turma || userLogged.turmaId || userLogged._id;
            if (idTurmaLider) {
                // Garante que o ID da turma enviado no payload seja estritamente o do líder logado
                idTurmaEvento = String(idTurmaLider); 
            }
        }

        if (!idTurmaEvento) {
            showError('Erro: Nenhuma turma identificada.');
            return false;
        }

        const novo = {
            titulo: document.getElementById('title').value,
            categoria: document.getElementById('type').value,
            tipo: 'turma',
            data: chave,
            hora: document.getElementById('time').value,
            descricao: document.getElementById('description').value,
            turmaId: idTurmaEvento,
            criadoPor: 'líder',
            usuarioId: userLogged.email || 'unknown'
        };

        try {
            const headers = obterHeadersAutenticacao();
            
            const res = await fetch(`${API_BASE}/eventos`, {
                method: 'POST',
                headers,
                body: JSON.stringify(novo)
            });

            if (!res.ok) {
                const erro = await res.json();
                throw new Error(erro.error || 'Erro ao salvar evento');
            }

            document.getElementById('eventModal').style.display = "none";

            showSuccess('Atividade cadastrada com sucesso!');
            await carregarEventosDaAPI();
            renderizarListaDeEventos(chave);
            renderizarCalendario();

            document.getElementById('title').value = '';
            document.getElementById('description').value = '';
            document.getElementById('time').value = '';
            document.getElementById('type').value = 'prova';

            return false;
        } catch (err) {
            console.error(err);
            showError(`Erro ao salvar evento: ${err.message}`);
            return false;
        }
    };
}

// =============================
// TEMA
// =============================

function carregarConfiguracoesTema() {
    const t = localStorage.getItem('ifpr_tema') || 'light';
    document.documentElement.setAttribute('data-theme', t);

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.checked = (t === 'dark');
    }
}

// =============================
// NAVEGAÇÃO ENTRE TELAS
// =============================

function navigateToAbout(event) {
    if (event) {
        event.preventDefault();
    }

    document.getElementById('turmasSelection').style.display = 'none';
    document.getElementById('calendarApp').style.display = 'none';
    document.getElementById('contactsScreen').style.display = 'none';
    document.getElementById('aboutScreen').style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    fecharMenuMobileSeAberto();
}

function navigateToHome(event) {
    if (event) {
        event.preventDefault();
    }

    turmaAtual = null;
    localStorage.removeItem('ifpr_selected_turma_v1');

    document.getElementById('aboutScreen').style.display = 'none';
    document.getElementById('contactsScreen').style.display = 'none';
    document.getElementById('calendarApp').style.display = 'none';
    document.getElementById('turmasSelection').style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    fecharMenuMobileSeAberto();
}

function navigateToContacts(event) {
    if (event) {
        event.preventDefault();
    }

    document.getElementById('turmasSelection').style.display = 'none';
    document.getElementById('calendarApp').style.display = 'none';
    document.getElementById('aboutScreen').style.display = 'none';
    document.getElementById('contactsScreen').style.display = 'block';

    carregarContatosPublico();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    fecharMenuMobileSeAberto();
}

function fecharMenuMobileSeAberto() {
    const navLinksWrapper = document.getElementById('navLinks');
    const navMobileToggle = document.getElementById('navMobileToggle');
    if (navLinksWrapper && navLinksWrapper.classList.contains('nav-open')) {
        navLinksWrapper.classList.remove('nav-open');
        if (navMobileToggle) {
            navMobileToggle.setAttribute('aria-expanded', 'false');
            navMobileToggle.classList.remove('nav-btn-active');
        }
    }
}

async function carregarContatosPublico() {
    const container = document.getElementById('contactsContainer');

    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/contatos`);

        if (!response.ok) {
            throw new Error(`Erro ao buscar contatos do servidor: ${response.status}`);
        }

        const contatos = await response.json();

        console.log("Contatos carregados da API:", contatos);

        renderizarContatosPublico(contatos);

    } catch (err) {

        console.error("Erro ao carregar contatos:", err);

        container.innerHTML = `
            <div class="contacts-empty">
                Não foi possível carregar os contatos no momento.
            </div>
        `;
    }
}

function renderizarContatosPublico(contatos) {
    const container = document.getElementById('contactsContainer');

    if (!container) return;

    container.innerHTML = '';

    if (!contatos || contatos.length === 0) {
        container.innerHTML = '<div class="contacts-empty">Nenhum contato disponível no momento.</div>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'contacts-grid';

    contatos.forEach(contato => {
        const card = document.createElement('div');
        card.className = 'contact-card';

        let telefoneHTML = '';
        if (contato.telefone) {
            telefoneHTML = `
                <div class="contact-info-item">
                    <strong>📱 Telefone:</strong>
                    <a href="tel:${contato.telefone}">${contato.telefone}</a>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="contact-card-header">
                <h3 class="contact-name">${contato.nome || 'Sem nome'}</h3>
                <p class="contact-setor">${contato.setor || 'Sem setor'}</p>
            </div>
            <div class="contact-card-body">
                ${contato.descricao ? `<p class="contact-description">${contato.descricao}</p>` : ''}
                <div class="contact-info">
                    <div class="contact-info-item">
                        <strong>📧 Email:</strong>
                        <a href="mailto:${contato.email}">${contato.email}</a>
                    </div>
                    ${telefoneHTML}
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    container.appendChild(grid);
}

// =============================
inicializar();