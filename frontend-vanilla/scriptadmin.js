/**
 * AGENDA ACADÊMICA DIGITAL IFPR - PAINEL ADMIN
 * Gerencia turmas + eventos (por turma e gerais)
 */

const API_BASE = 'https://agenda-academica-backend-w48m.onrender.com';
// =============================
// ESTADO GLOBAL
// =============================
const safeParse = (key, fallback = null) => {
    const val = localStorage.getItem(key);
    if (!val || val === 'undefined') return fallback;
    try {
        return JSON.parse(val);
    } catch (e) {
        return fallback;
    }
};

let turmas = []; // Carregado via API
let turmaEditandoEventos = safeParse('admin_turma_editando', null);
let eventoEditandoId = null;
let contatos = [];
let contatoEditandoId = null;
let currentUser = safeParse('ifpr_user_logged', null);
let currentTab = localStorage.getItem('admin_current_tab') || 'turmas';

// ✅ Helper para obter headers de autenticação
function obterHeadersAutenticacaoAdmin() {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (currentUser && currentUser.email) {
        headers['X-Usuario-Email'] = currentUser.email;
        headers['X-Usuario-Role'] = currentUser.role || 'admin';
        
        // Enviar X-Usuario-Turma para líderes
        if (currentUser.role === 'turma_admin' && currentUser._id) {
            headers['X-Usuario-Turma'] = currentUser._id;
        }
        
        // Só admin precisa de X-Admin-Auth
        if (currentUser.role === 'admin') {
            headers['X-Admin-Auth'] = 'true';
        }
    }

    return headers;
}

// =============================
// VERIFICAÇÃO DE LOGIN E DASHBOARD
// =============================
function verificarAutenticacao() {
    const loginSection = document.getElementById('adminLoginSection');
    const dashboardSection = document.getElementById('adminDashboardSection');
    const userInfoHeader = document.getElementById('userInfoHeader');
    const menuIcon = document.getElementById('menuIcon');

    if (!currentUser) {
        if (loginSection) loginSection.style.display = 'block';
        if (dashboardSection) dashboardSection.style.display = 'none';
        if (menuIcon) menuIcon.classList.remove('show-mobile');
        return;
    }

    // BLOQUEIO DE SEGURANÇA: Apenas Admins reais podem ver o painel
    if (currentUser.role !== 'admin') {
        alert("Acesso Negado: Apenas administradores podem acessar o painel administrativo.");
        localStorage.removeItem('ifpr_user_logged');
        currentUser = null;
        window.location.reload();
        return;
    }

    if (loginSection) loginSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';
    if (userInfoHeader) userInfoHeader.style.display = 'flex';
    if (menuIcon) menuIcon.classList.add('show-mobile');
    if (menuIcon) menuIcon.setAttribute('aria-expanded', 'false');

    if (document.getElementById('adminUserName')) {
        document.getElementById('adminUserName').innerText = currentUser.nome;
    }
    if (document.getElementById('adminUserRole')) {
        document.getElementById('adminUserRole').innerText = 'Administrador Principal';
    }
}

// =============================
// INICIALIZAÇÃO E SEGURANÇA
// =============================
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        verificarAutenticacao();
        
        const tabToRestore = document.querySelector(`.admin-tab-btn[data-tab="${currentTab}"]`);
        if (tabToRestore) {
            tabToRestore.click();
        }

        if (currentTab === 'turmas' && turmaEditandoEventos) {
            const index = turmas.findIndex(t => t.id === turmaEditandoEventos.id);
            if (index !== -1) {
                abrirEventosDaTurma(index);
            } else {
                turmaEditandoEventos = null;
                localStorage.removeItem('admin_turma_editando');
            }
        }

        carregarTurmasAdmin();
    } else {
        const loginSection = document.getElementById('adminLoginSection');
        const dashboardSection = document.getElementById('adminDashboardSection');
        if (loginSection) loginSection.style.display = 'block';
        if (dashboardSection) dashboardSection.style.display = 'none';
    }

    document.querySelectorAll('.btn-logout-action').forEach(btn => {
        btn.onclick = () => {
            if (confirm('Deseja realmente sair?')) {
                currentUser = null;
                localStorage.removeItem('admin_user');
                localStorage.removeItem('ifpr_user_logged');
                localStorage.removeItem('admin_turma_editando');
                localStorage.removeItem('admin_current_tab');

                sessionStorage.removeItem('admin_user');
                sessionStorage.removeItem('ifpr_user_logged');
                sessionStorage.removeItem('usuarioLogado');

                window.location.reload();
            }
        };
    });
});

// =============================
// LÓGICA DE AUTH (LOGIN / REGISTRO)
// =============================

window.switchAuthTab = (tab) => {
    const tabLogin = document.getElementById('tabLogin');
    const loginForm = document.getElementById('loginForm');
    const authMessage = document.getElementById('authMessage');

    if (tabLogin) tabLogin.classList.toggle('active', tab === 'login');
    if (loginForm) loginForm.style.display = 'block';
    if (authMessage) authMessage.style.display = 'none';
};

function showAuthMessage(msg, type) {
    const box = document.getElementById('authMessage');
    box.innerText = msg;
    box.className = `message-box message-${type}`;
    box.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha: password })
                });

                const data = await res.json();
                if (res.ok) {
                    currentUser = data.user;
                    localStorage.setItem('ifpr_user_logged', JSON.stringify(currentUser));
                    verificarAutenticacao();
                    const btn = document.querySelector(`.admin-tab-btn[data-tab="${currentTab}"]`);
                    if (btn) btn.click();
                } else {
                    showAuthMessage(data.error || 'Erro ao logar', 'error');
                }
            } catch (err) {
                showAuthMessage('Erro de conexão com o servidor', 'error');
            }
        };
    }
});

// NAVEGAÇÃO ENTRE ABAS
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const tab = btn.getAttribute('data-tab');

            document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));

            let secId = '';
            if (tab === 'turmas') secId = 'secTurmas';
            else if (tab === 'geral') secId = 'secGeral';
            else if (tab === 'contatos') secId = 'secContatos';
            else if (tab === 'conta') secId = 'secConta';

            const section = document.getElementById(secId);
            if (section) {
                section.classList.add('active');
            }

            currentTab = tab;
            localStorage.setItem('admin_current_tab', tab);

            if (tab === 'turmas' && !turmaEditandoEventos) {
                const subLista = document.getElementById('subListaTurmas');
                const subEventos = document.getElementById('subEventosTurma');
                if (subLista) subLista.style.display = 'block';
                if (subEventos) subEventos.style.display = 'none';
            }

            if (tab === 'geral') carregarEventosGerais();
            if (tab === 'contatos') carregarContatosAdmin();
            if (tab === 'conta') carregarMinhaConta();
        };
    });

    if (currentUser) {
        const target = document.querySelector(`.admin-tab-btn[data-tab="${currentTab}"]`);
        if (target) target.click();
    }
});

// Mobile menu toggle
(function () {
    const adminMenuButton = document.getElementById('menuIcon');
    const adminTabsNav = document.querySelector('.admin-tabs-nav');

    const toggleAdminMobileMenu = (open) => {
        if (!adminTabsNav || !adminMenuButton) return;
        adminTabsNav.classList.toggle('open', open);
        adminMenuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    adminMenuButton?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleAdminMobileMenu(!adminTabsNav.classList.contains('open'));
    });

    document.addEventListener('click', (event) => {
        if (!adminTabsNav || !adminMenuButton) return;
        if (!adminTabsNav.contains(event.target) && !adminMenuButton.contains(event.target)) {
            toggleAdminMobileMenu(false);
        }
    });

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleAdminMobileMenu(false));
    });
})();

// =============================
// CARREGAR TURMAS DO SERVIDOR
// =============================
async function carregarTurmasAdmin() {
    try {
        const res = await fetch(`${API_BASE}/turmas`);
        if (!res.ok) throw new Error('Erro ao buscar turmas');
        turmas = await res.json();
        renderizarTurmas();
    } catch (err) {
        console.error("Erro ao carregar turmas:", err);
    }
}

// =============================
// RENDERIZAÇÃO DE TURMAS
// =============================
async function renderizarTurmas() {
    const lista = document.getElementById('turmasList');
    if (!lista) return;
    lista.innerHTML = '';

    if (turmas.length === 0) {
        lista.innerHTML = '<p class="empty-msg">Nenhuma turma cadastrada.</p>';
        return;
    }

    turmas.forEach((turma, index) => {
        const card = document.createElement('div');
        card.className = 'turma-card';

        const tId = turma.id || index;

        card.onclick = () => window.abrirModalVisualizarTurma(tId);

        card.innerHTML = `
            <div class="turma-header">
                <h3>${turma.nome}</h3>
                <span style="font-size:0.8rem; background:var(--primary); color:white; padding:3px 8px; border-radius:12px;">${turma.ano}</span>
            </div>
            <div class="turma-info">
                <p><strong>Curso:</strong> ${turma.curso}</p>
            </div>
        `;

        lista.appendChild(card);
    });
}

// =============================
// MODAL DE VISUALIZAÇÃO DE TURMA
// =============================
window.abrirModalVisualizarTurma = (id) => {
    const t = turmas.find(item => item.id == id);
    if (!t) return;

    const modal = document.getElementById('turmaViewModal');
    const content = document.getElementById('turmaViewContent');

    content.innerHTML = `
        <div class="info-row"><strong>Turma:</strong> ${t.nome}</div>
        <div class="info-row"><strong>Ano:</strong> ${t.ano}</div>
        <div class="info-row"><strong>Curso:</strong> ${t.curso}</div>
        <hr style="margin: 15px 0; border: none; border-top: 1px dashed var(--border);">
        <div class="info-row"><strong>Líder:</strong> ${t.lider.nome}</div>
        <div class="info-row"><strong>Vice-Líder:</strong> ${t.vice.nome}</div>
    `;

    document.getElementById('btnViewEdit').onclick = () => {
        modal.style.display = 'none';
        window.abrirModalEdicaoTurma(id);
    };

    document.getElementById('btnViewDelete').onclick = () => {
        if (confirm(`Tem certeza que deseja excluir a turma ${t.nome}?`)) {
            modal.style.display = 'none';
            window.excluirTurma(id);
        }
    };

    document.getElementById('btnViewEventos').onclick = () => {
        modal.style.display = 'none';
        window.abrirEventosDaTurma(id);
    };

    modal.style.display = 'flex';
};

document.getElementById('closeTurmaViewModal').onclick = () => {
    document.getElementById('turmaViewModal').style.display = 'none';
};

// =============================
// MODAL DE TURMA (CRIAR / EDITAR)
// =============================
let turmaModal, turmaForm;
document.addEventListener('DOMContentLoaded', () => {
    turmaModal = document.getElementById('turmaModal');
    turmaForm = document.getElementById('turmaForm');

    const btnNovaTurma = document.getElementById('btnNovaTurma');
    if (btnNovaTurma) {
        btnNovaTurma.onclick = () => {
            if (turmaForm) turmaForm.reset();
            document.getElementById('turmaId').value = '';
            document.getElementById('modalTurmaTitle').innerText = 'Nova Turma';
            if (turmaModal) turmaModal.style.display = 'flex';
        };
    }

    const closeTurmaModal = document.getElementById('closeTurmaModal');
    if (closeTurmaModal) {
        closeTurmaModal.onclick = () => {
            if (turmaModal) turmaModal.style.display = 'none';
        };
    }
});

window.abrirModalEdicaoTurma = (id) => {
    const t = turmas.find(item => item.id == id);
    if (!t) return;

    document.getElementById('turmaId').value = id;
    document.getElementById('modalTurmaTitle').innerText = 'Editar Turma';

    document.getElementById('tNome').value = t.nome;
    document.getElementById('tCurso').value = t.curso;
    document.getElementById('tAno').value = t.ano;

    document.getElementById('liderNome').value = t.lider.nome;
    document.getElementById('liderEmail').value = t.lider.email;
    document.getElementById('liderSenha').value = t.lider.senha;

    document.getElementById('viceNome').value = t.vice.nome;
    document.getElementById('viceEmail').value = t.vice.email;
    document.getElementById('viceSenha').value = t.vice.senha;

    if (turmaModal) turmaModal.style.display = 'flex';
};

document.addEventListener('DOMContentLoaded', () => {
    const tf = document.getElementById('turmaForm');
    if (tf) {
        tf.onsubmit = async (e) => {
            e.preventDefault();

            const id = document.getElementById('turmaId').value;
            const turmaObj = {
                nome: document.getElementById('tNome').value.trim(),
                curso: document.getElementById('tCurso').value.trim(),
                ano: document.getElementById('tAno').value.trim(),
                lider: {
                    nome: document.getElementById('liderNome').value.trim(),
                    email: document.getElementById('liderEmail').value.trim().toLowerCase(),
                    senha: document.getElementById('liderSenha').value.trim()
                },
                vice: {
                    nome: document.getElementById('viceNome').value.trim(),
                    email: document.getElementById('viceEmail').value.trim().toLowerCase(),
                    senha: document.getElementById('viceSenha').value.trim()
                }
            };

            try {
                // ✅ CONECTA COM OS SEUS HEADERS DE AUTENTICAÇÃO DO ADMIN
                const headers = obterHeadersAutenticacaoAdmin();

                if (id !== '') {
                    // Update
                    turmaObj.id = id;
                    const res = await fetch(`${API_BASE}/turmas/${id}`, {
                        method: 'PUT',
                        headers: headers, // 👈 Fix: Enviando as permissões corretas
                        body: JSON.stringify(turmaObj)
                    });

                    if (!res.ok) {
                        const erro = await res.json();
                        throw new Error(erro.error || 'Erro ao atualizar turma');
                    }
                } else {
                    // Create
                    const res = await fetch(`${API_BASE}/turmas`, {
                        method: 'POST',
                        headers: headers, // 👈 Fix: Padronizado para segurança
                        body: JSON.stringify(turmaObj)
                    });

                    if (!res.ok) {
                        const erro = await res.json();
                        throw new Error(erro.error || 'Erro ao criar turma');
                    }
                }

                if (turmaModal) turmaModal.style.display = 'none';
                carregarTurmasAdmin();
            } catch (err) {
                console.error("Erro ao salvar turma:", err);
                alert(`Erro ao salvar turma no servidor: ${err.message}`);
            }
        };
    }
});

window.excluirTurma = async (id) => {
    if (confirm("Tem certeza que deseja excluir esta turma?")) {
        try {
            const headers = obterHeadersAutenticacaoAdmin();
            await fetch(`${API_BASE}/turmas/${id}`, {
                method: 'DELETE',
                headers: headers
            });
            carregarTurmasAdmin();
        } catch (err) {
            console.error(err);
        }
    }
};

// =============================
// EVENTOS DE TURMA
// =============================
window.abrirEventosDaTurma = (id) => {
    turmaEditandoEventos = turmas.find(t => t.id == id);
    localStorage.setItem('admin_turma_editando', JSON.stringify(turmaEditandoEventos));
    document.getElementById('eventosTurmaNome').innerText = turmaEditandoEventos.nome;

    document.getElementById('subListaTurmas').style.display = 'none';
    document.getElementById('subEventosTurma').style.display = 'block';

    carregarEventosDaTurma();
};

document.getElementById('btnVoltarListaTurmas').onclick = () => {
    turmaEditandoEventos = null;
    localStorage.removeItem('admin_turma_editando');
    document.getElementById('subListaTurmas').style.display = 'block';
    document.getElementById('subEventosTurma').style.display = 'none';
};

async function carregarEventosDaTurma() {
    const container = document.getElementById('eventosListaTurma');
    container.innerHTML = '<p class="empty-msg">Carregando...</p>';

    try {
        const res = await fetch(`${API_BASE}/eventos?turmaId=${turmaEditandoEventos.id}`);
        const eventos = await res.json();
        renderizarListaEventos(container, eventos);
    } catch (err) {
        container.innerHTML = '<p class="empty-msg">Erro ao carregar eventos.</p>';
        console.error(err);
    }
}

// =============================
// EVENTOS GERAIS
// =============================
async function carregarEventosGerais() {
    const container = document.getElementById('eventosListaGeral');
    container.innerHTML = '<p class="empty-msg">Carregando...</p>';

    try {
        const res = await fetch(`${API_BASE}/eventos/geral`);

        if (!res.ok) {
            console.error(`Status erro: ${res.status}`);
            throw new Error(`Erro ao buscar eventos gerais (Status: ${res.status})`);
        }

        const texto = await res.text();
        let eventos = [];
        try {
            eventos = JSON.parse(texto);
        } catch (e) {
            console.error("Servidor não retornou JSON válido:", texto.substring(0, 100));
            throw new Error("O servidor retornou um formato inválido.");
        }

        renderizarListaEventos(container, eventos);
    } catch (err) {
        container.innerHTML = `<p class="empty-msg" style="color:red;">❌ ${err.message}</p>`;
        console.error(err);
    }
}

// =============================
// RENDERIZAÇÃO DE LISTA DE EVENTOS
// =============================
function renderizarListaEventos(container, eventos) {
    container.innerHTML = '';

    if (eventos.length === 0) {
        container.innerHTML = '<p class="empty-msg">Nenhum evento cadastrado.</p>';
        return;
    }

    eventos.sort((a, b) => (a.data || '').localeCompare(b.data || ''));

    eventos.forEach(ev => {
        const catLow = (ev.categoria || ev.tipo || '').toLowerCase();
        const card = document.createElement('div');
        card.className = `evento-card evento-cat-${catLow}`;

        const dataFormatada = ev.data ? ev.data.split('-').reverse().join('/') : '—';

        card.innerHTML = `
            <div class="evento-card-info">
                <strong>${ev.titulo}</strong>
                <small>${dataFormatada} · ${ev.hora || '--:--'} · ${(ev.categoria || '').toUpperCase()}</small>
                ${ev.descricao ? `<p style="font-size:0.85rem; opacity:0.8; margin-top:8px; line-height:1.4;">${ev.descricao}</p>` : ''}
            </div>
            <div class="evento-card-actions">
                <button title="Editar" onclick="abrirModalEditarEvento('${ev._id}')">✏️</button>
                <button title="Excluir" onclick="excluirEvento('${ev._id}')">🗑️</button>
            </div>
        `;

        container.appendChild(card);
    });
}

// =============================
// MODAL DE EVENTO (CRIAR / EDITAR)
// =============================
let eventoModal, eventoForm;
document.addEventListener('DOMContentLoaded', () => {
    eventoModal = document.getElementById('eventoModal');
    eventoForm = document.getElementById('eventoForm');

    const btnNovoEventoTurma = document.getElementById('btnNovoEventoTurma');
    if (btnNovoEventoTurma) {
        btnNovoEventoTurma.onclick = () => {
            if (eventoForm) eventoForm.reset();
            eventoEditandoId = null;
            document.getElementById('eventoId').value = '';
            document.getElementById('eventoTurmaId').value = turmaEditandoEventos.id;
            document.getElementById('modalEventoTitle').innerText = `Novo Evento – ${turmaEditandoEventos.nome}`;
            if (eventoModal) eventoModal.style.display = 'flex';
        };
    }

    const btnNovoEventoGeral = document.getElementById('btnNovoEventoGeral');
    if (btnNovoEventoGeral) {
        btnNovoEventoGeral.onclick = () => {
            if (eventoForm) eventoForm.reset();
            eventoEditandoId = null;
            document.getElementById('eventoId').value = '';
            document.getElementById('eventoTurmaId').value = '__geral__';
            document.getElementById('modalEventoTitle').innerText = 'Novo Evento Geral';
            if (eventoModal) eventoModal.style.display = 'flex';
        };
    }

    const closeEventoModal = document.getElementById('closeEventoModal');
    if (closeEventoModal) {
        closeEventoModal.onclick = () => {
            if (eventoModal) eventoModal.style.display = 'none';
        };
    }
});

window.abrirModalEditarEvento = async (id) => {
    try {
        const res = await fetch(`${API_BASE}/eventos`);
        const todos = await res.json();
        const ev = todos.find(e => e._id === id);
        if (!ev) return alert('Evento não encontrado.');

        eventoEditandoId = id;
        document.getElementById('eventoId').value = id;
        document.getElementById('eventoTurmaId').value = ev.turmaId;
        document.getElementById('evTitulo').value = ev.titulo;
        document.getElementById('evTipo').value = ev.categoria || ev.tipo;
        document.getElementById('evData').value = ev.data;
        document.getElementById('evHora').value = ev.hora || '';
        document.getElementById('evDescricao').value = ev.descricao || '';
        document.getElementById('modalEventoTitle').innerText = 'Editar Evento';

        eventoModal.style.display = 'flex';
    } catch (err) {
        console.error(err);
        alert('Erro ao buscar evento.');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const ef = document.getElementById('eventoForm');
    if (ef) {
        ef.onsubmit = async (e) => {
            e.preventDefault();

            const turmaId = document.getElementById('eventoTurmaId').value;
            const dados = {
                titulo: document.getElementById('evTitulo').value,
                tipo: turmaId === '__geral__' ? 'geral' : 'turma',
                categoria: document.getElementById('evTipo').value,
                data: document.getElementById('evData').value,
                hora: document.getElementById('evHora').value,
                descricao: document.getElementById('evDescricao').value,
                turmaId: turmaId,
                criadoPor: 'admin',
                usuarioId: (currentUser && currentUser.email) ? currentUser.email : 'admin'
            };

            try {
                const headers = obterHeadersAutenticacaoAdmin();
                let res;

                if (eventoEditandoId) {
                    res = await fetch(`${API_BASE}/eventos/${eventoEditandoId}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(dados)
                    });
                } else {
                    res = await fetch(`${API_BASE}/eventos`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(dados)
                    });
                }

                if (!res.ok) {
                    const erro = await res.json();
                    throw new Error(erro.error || 'Erro ao salvar evento');
                }

                if (eventoModal) eventoModal.style.display = 'none';
                eventoEditandoId = null;

                if (turmaId === '__geral__') {
                    carregarEventosGerais();
                } else {
                    carregarEventosDaTurma();
                }
            } catch (err) {
                console.error(err);
                alert(`Erro ao salvar evento: ${err.message}`);
            }
        };
    }
});

window.excluirEvento = async (id) => {
    if (!confirm('Deseja realmente excluir este evento?')) return;

    try {
        const headers = obterHeadersAutenticacaoAdmin();
        const res = await fetch(`${API_BASE}/eventos/${id}`, { 
            method: 'DELETE',
            headers
        });

        if (!res.ok) {
            const erro = await res.json();
            throw new Error(erro.error || 'Erro ao deletar evento');
        }

        if (turmaEditandoEventos) {
            carregarEventosDaTurma();
        } else {
            carregarEventosGerais();
        }
    } catch (err) {
        console.error(err);
        alert(`Erro ao excluir evento: ${err.message}`);
    }
};

// =============================
// GERENCIAMENTO DE CONTATOS (100% MONGODB)
// =============================

async function carregarContatosAdmin() {
    const container = document.getElementById('contatosListaAdmin');
    console.log('🔍 Container encontrado?', !!container);
    if (!container) {
        console.error('❌ Container #contatosListaAdmin não encontrado no DOM!');
        return;
    }

    container.innerHTML = '<p class="empty-msg">Carregando contatos...</p>';
    console.log('📡 Iniciando carregamento de contatos...');

    try {
        const headers = obterHeadersAutenticacaoAdmin();
        console.log('📦 Headers:', headers);
        console.log('📡 URL:', `${API_BASE}/contatos`);

        const res = await fetch(`${API_BASE}/contatos`, { headers });
        console.log('📥 Status da resposta:', res.status);

        if (!res.ok) {
            const texto = await res.text();
            console.error('❌ Erro HTTP:', res.status, texto);
            throw new Error(`Erro ${res.status}: ${texto}`);
        }

        contatos = await res.json();
        console.log('✅ Contatos carregados:', contatos);
        console.log('📊 Total de contatos:', contatos.length);
        
        renderizarContatosAdmin();

    } catch (err) {
        console.error('❌ Erro ao carregar contatos:', err.message);
        container.innerHTML = `<p class="empty-msg">Erro ao buscar contatos: ${err.message}</p>`;
    }
}

// =============================
// RENDERIZAR CONTATOS
// =============================
function renderizarContatosAdmin() {
    const container = document.getElementById('contatosListaAdmin');
    console.log('🖼️ Renderizando contatos. Container encontrado?', !!container);
    if (!container) {
        console.error('❌ Container #contatosListaAdmin não encontrado!');
        return;
    }

    container.innerHTML = '';

    if (!contatos || contatos.length === 0) {
        console.warn('⚠️ Nenhum contato para renderizar');
        container.innerHTML = '<p class="empty-msg">Nenhum contato cadastrado.</p>';
        return;
    }

    console.log('📊 Renderizando', contatos.length, 'contatos...');
    
    contatos.forEach((c, idx) => {
        console.log(`🔍 [${idx}] Contato:`, c);  // DEBUG LOG
        
        const card = document.createElement('div');
        card.className = 'contato-card';
        
        // FIX: Proper ID extraction with fallback
        const contatoId = c._id || c.id;
        
        if (!contatoId) {
            console.error('❌ ERRO: Contato sem ID!', c);
            return;
        }

        card.innerHTML = `
            <div>
                <strong>${c.nome}</strong> (${c.setor || 'Geral'})<br>
                <small>📧 ${c.email || 'N/A'} · 📞 ${c.telefone || 'N/A'}</small>
            </div>

            <div>
                <button onclick="editarContato('${contatoId}')">✏️</button>
                <button onclick="excluirContato('${contatoId}')">🗑️</button>
            </div>
        `;

        container.appendChild(card);
    });
    console.log('✅ Renderização completa');
}

// =============================
// EDITAR CONTATO
// =============================
window.editarContato = async (id) => {
    // ✅ Validação: se ID for undefined ou vazio, não fazer nada
    if (!id || id === 'undefined') {
        console.error('❌ ERRO: ID do contato é inválido!', id);
        alert('Erro: ID do contato é inválido!');
        return;
    }

    console.log('📝 Editando contato com ID:', id);

    try {
        const headers = obterHeadersAutenticacaoAdmin();

        console.log('🔗 Requisição:', `${API_BASE}/contatos/${id}`);
        console.log('📦 Headers:', headers);

        const res = await fetch(`${API_BASE}/contatos/${id}`, { headers });

        console.log('📥 Resposta status:', res.status);

        if (!res.ok) {
            const erro = await res.json().catch(() => ({ error: 'Erro ao buscar contato' }));
            throw new Error(erro.error || `Erro ${res.status}: Contato não encontrado`);
        }

        const contato = await res.json();
        console.log('✅ Contato recebido:', contato);

        // Preencher o formulário com os dados do contato
        document.getElementById('contatoId').value = contato._id;
        document.getElementById('ctNome').value = contato.nome || '';
        document.getElementById('ctSetor').value = contato.setor || '';
        document.getElementById('ctEmail').value = contato.email || '';
        document.getElementById('ctTelefone').value = contato.telefone || '';
        document.getElementById('ctDescricao').value = contato.descricao || '';

        // Alterar título e abrir modal
        document.getElementById('modalContatoTitle').innerText = 'Editar Contato';
        document.getElementById('contatoModal').style.display = 'flex';

        console.log('✅ Modal aberto com sucesso');

    } catch (err) {
        console.error('❌ Erro ao editar contato:', err);
        alert('Erro ao buscar dados do contato: ' + err.message);
    }
};

// =============================
// EXCLUIR CONTATO
// =============================
window.excluirContato = async (id) => {
    if (!confirm('Deseja excluir este contato?')) return;

    try {
        const headers = obterHeadersAutenticacaoAdmin();

        const res = await fetch(`${API_BASE}/contatos/${id}`, {
            method: 'DELETE',
            headers
        });

        if (!res.ok) {
            const erro = await res.json();
            throw new Error(erro.error || 'Erro ao excluir');
        }

        carregarContatosAdmin();

    } catch (err) {
        console.error(err);
        alert(`Erro ao excluir contato: ${err.message}`);
    }
};

// =============================
// MINHA CONTA
// =============================
async function carregarMinhaConta() {
    if (!currentUser) return;

    const nomeInput = document.getElementById('editNome');
    const emailInput = document.getElementById('editEmail');
    const messageBox = document.getElementById('accountMessage');

    if (nomeInput) nomeInput.value = currentUser.nome || '';
    if (emailInput) emailInput.value = currentUser.email || '';

    if (messageBox) {
        messageBox.style.display = 'none';
        messageBox.innerText = '';
    }
}

// =============================
// ✅ ADIÇÕES SOLICITADAS ABAIXO
// =============================

// ABRIR MODAL
document.getElementById('btnNovoContato')?.addEventListener('click', () => {
    // Resetar o form e o ID caso tenha ficado lixo de edição anterior
    const form = document.getElementById('contatoForm');
    if(form) form.reset();
    
    const idField = document.getElementById('contatoId');
    if(idField) idField.value = '';
    
    const title = document.getElementById('modalContatoTitle');
    if(title) title.innerText = 'Novo Contato';

    const modal = document.getElementById('contatoModal');
    if (modal) modal.style.display = 'flex';
});

// FECHAR MODAL
document.getElementById('closeContatoModal')?.addEventListener('click', () => {
    const modal = document.getElementById('contatoModal');
    if (modal) modal.style.display = 'none';
});
// SUBMIT FORM (SALVAR OU EDITAR CONTATO)
document.getElementById('contatoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('contatoId').value;

    const dados = {
        nome: document.getElementById('ctNome').value,
        setor: document.getElementById('ctSetor').value,
        email: document.getElementById('ctEmail').value,
        telefone: document.getElementById('ctTelefone').value,
        descricao: document.getElementById('ctDescricao').value
    };

    try {
        const headers = obterHeadersAutenticacaoAdmin();
        let res;

        if (id) {
            // EDITAR
            res = await fetch(`${API_BASE}/contatos/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(dados)
            });
        } else {
            // CRIAR
            res = await fetch(`${API_BASE}/contatos`, {
                method: 'POST',
                headers,
                body: JSON.stringify(dados)
            });
        }

        if (!res.ok) {
            const erro = await res.json();
            throw new Error(erro.error || 'Erro ao salvar contato');
        }

        // fechar modal
        document.getElementById('contatoModal').style.display = 'none';

        // recarregar lista
        carregarContatosAdmin();

    } catch (err) {
        console.error('Erro ao salvar contato:', err);
        alert('Erro ao salvar contato: ' + err.message);
    }
});

document.getElementById("formEditPerfil").addEventListener("submit", async function(e){
    e.preventDefault();

    const nome = document.getElementById("editNome").value;
    const email = document.getElementById("editEmail").value;
    const senha = document.getElementById("editPassConfirm").value;

    const messageBox = document.getElementById("accountMessage");

    try {

        const usuarioLogado = JSON.parse(localStorage.getItem("ifpr_user_logged")) || currentUser;

    const response = await fetch("/admin/atualizar-perfil", {
    method: "PUT",
    headers: {
        "Content-Type": "application/json",
        "x-usuario-email": usuarioLogado.email
    },
    body: JSON.stringify({
        nome,
        email,
        senha
    })
});

        const data = await response.json();

        if(response.ok){
            if (data.user) {
                currentUser = data.user;
                localStorage.setItem('ifpr_user_logged', JSON.stringify(currentUser));
            }

            messageBox.style.display = "block";
            messageBox.style.background = "#d1fae5";
            messageBox.style.color = "#065f46";
            messageBox.style.border = "1px solid #6ee7b7";
            messageBox.style.padding = "15px";
            messageBox.style.borderRadius = "10px";

            messageBox.innerText = "✅ Dados atualizados com sucesso!";

            setTimeout(() => {
                messageBox.style.display = "none";
            }, 4000);
        }

    } catch (error){

        messageBox.style.display = "block";
        messageBox.style.background = "#ffe6e6";
        messageBox.style.color = "#7f1d1d";
        messageBox.innerText = "Erro de conexão com o servidor.";

    }
});

document.getElementById("formEditSenha")?.addEventListener("submit", async function(e){
    e.preventDefault();

    const senhaAtual = document.getElementById("passAtual").value;
    const novaSenha = document.getElementById("passNova").value;
    const confirmaSenha = document.getElementById("passConfirma").value;
    const messageBox = document.getElementById("accountMessage");

    if (novaSenha !== confirmaSenha) {
        messageBox.style.display = "block";
        messageBox.style.background = "#ffe6e6";
        messageBox.style.color = "#7f1d1d";
        messageBox.innerText = "A confirmação da nova senha não corresponde.";
        return;
    }

    if (novaSenha.length < 4) {
        messageBox.style.display = "block";
        messageBox.style.background = "#ffe6e6";
        messageBox.style.color = "#7f1d1d";
        messageBox.innerText = "A nova senha deve ter pelo menos 4 caracteres.";
        return;
    }

    try {
        const response = await fetch("/admin/alterar-senha", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "x-usuario-email": currentUser?.email || ''
            },
            body: JSON.stringify({
                senhaAtual,
                novaSenha
            })
        });

        const data = await response.json();

        if(response.ok){
            messageBox.style.display = "block";
            messageBox.style.background = "#e6fffa";
            messageBox.style.color = "#065f46";
            messageBox.innerText = data.message || "Senha atualizada com sucesso.";
            document.getElementById("formEditSenha").reset();
        } else {
            messageBox.style.display = "block";
            messageBox.style.background = "#ffe6e6";
            messageBox.style.color = "#7f1d1d";
            messageBox.innerText = data.error || data.erro || "Erro ao atualizar senha.";
        }
    } catch (error) {
        messageBox.style.display = "block";
        messageBox.style.background = "#ffe6e6";
        messageBox.style.color = "#7f1d1d";
        messageBox.innerText = "Erro de conexão com o servidor.";
    }
});
