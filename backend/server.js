const express = require('express');
const cors = require("cors");
const app = express();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const connectDB = require("./config/db");
const Turma = require("./models/turma");
const Evento = require("./models/evento");
const Contato = require("./models/contato");
const Admin = require("./models/admin");

const authRoutes = require('./routes/auth');

// Helper para comparar senhas — aceitar APENAS bcrypt hashes
// 🔐 SEGURANÇA: Remover qualquer comparação de texto puro; retornar false se não for hash bcrypt.
async function compareStored(stored, input) {
    if (!stored || typeof stored !== 'string') return false;

    // Apenas aceitar hashes bcrypt (prefixo $2a/$2b/$2y)
    if (!stored.startsWith('$2')) {
        console.warn('compareStored: valor de senha armazenado não é hash bcrypt. Negando autenticação.');
        return false;
    }

    try {
        return await bcrypt.compare(String(input || ''), stored);
    } catch (err) {
        console.error('Erro ao comparar senha via bcrypt:', err);
        return false;
    }
}

// ✅ 2. MIDDLEWARES
// CORS único e validado
// 🔐 SEGURANÇA: Removidos formatos incorretos e consolidado em apenas uma configuração CORS.
app.use(cors({
    origin: '*',
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: [
        "Content-Type",
        "X-Usuario-Email",
        "X-Usuario-Role",
        "X-Usuario-Turma"
    ]
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 3. ROTAS
app.use('/auth', authRoutes);

// ✅ 4. FRONTEND ESTÁTICO
app.use(express.static(path.join(__dirname, '..', 'frontend-vanilla')));

// ✅ 5. BANCO
// connectDB será chamado uma única vez mais abaixo, antes de iniciar o servidor
// 🔐 SEGURANÇA: Removida chamada precoce para evitar conexão duplicada e inicialização prematura

// Caminhos de arquivos JSON (se ainda usa em partes do sistema)
const TURMAS_FILE = path.join(__dirname, 'turmas.json');

// =============================
// FUNÇÕES AUXILIARES (I/O)
// =============================

// (contatos agora são gerenciados via MongoDB)

// =============================
// MIDDLEWARE DE AUTORIZAÇÃO
// =============================

const validarAcessoTurma = async (req, res, next) => {
    const turmaIdHeader = req.headers['x-turma-id'];
    const turmaIdBody = req.body?.turmaId;
    const turmaIdParam = req.params?.id;  
    const usuarioLider = req.headers['x-usuario-role'];  
    const usuarioTurmaId = req.headers['x-usuario-turma'];  
    const usuarioEmail = req.headers['x-usuario-email'];

    console.log(`\n[AUTH] ${req.method} ${req.path}`);
    console.log(`  - Role: ${usuarioLider}, Turma do Usuário: ${usuarioTurmaId}`);
    console.log(`  - Email: ${usuarioEmail}`);

    let turmaIdRequisicao = turmaIdHeader || turmaIdBody;

    if ((req.method === 'PUT' || req.method === 'DELETE') && turmaIdParam) {
        try {
            const evento = await Evento.findById(turmaIdParam);
            if (evento) {
                turmaIdRequisicao = evento.turmaId;
                console.log(`  - Turma do evento: ${evento.turmaId}`);
            }
        } catch (e) {
            console.error("Erro ao buscar evento no middleware de auth:", e);
        }
    }

    if (usuarioLider === 'admin' || req.headers['x-admin-auth']) {
        // 🔐 SEGURANÇA: Não confiar apenas no header; validar se o e-mail do header pertence a um Admin no DB
        try {
            const emailLower = String(usuarioEmail || '').toLowerCase();
            if (!emailLower) {
                console.warn(`🚫 [SEGURANÇA] Tentativa de admin sem email no header`);
                return res.status(403).json({ error: "Admin inválido." });
            }
            const admin = await Admin.findOne({ email: emailLower });
            if (admin) {
                console.log(`  ✅ Admin autorizado (validado no DB)`);
                return next();
            } else {
                console.warn(`🚫 [SEGURANÇA] Header admin presente, mas email não encontrado no DB: ${emailLower}`);
                return res.status(403).json({ error: "Admin inválido." });
            }
        } catch (e) {
            console.error("Erro ao validar admin no DB:", e);
            return res.status(500).json({ error: "Erro ao validar credenciais." });
        }
    }

    if (usuarioLider === 'turma_admin' || usuarioLider === 'lider') {
        if (!usuarioTurmaId) {
            console.warn(`🚫 [SEGURANÇA] Requisição de líder sem turmaId do usuário:`, {
                method: req.method,
                path: req.path,
                email: usuarioEmail,
                ip: req.ip
            });
            return res.status(401).json({ error: "Usuário não autenticado corretamente." });
        }

        // 🔐 SEGURANÇA: Verificar no banco se o email do header corresponde ao líder/vice da turma declarada
        try {
            const turmaValid = await Turma.findOne({ id: usuarioTurmaId });
            const emailLower = String(usuarioEmail || '').toLowerCase();
            const isLeaderMatch = turmaValid && turmaValid.lider && (String(turmaValid.lider.email || '').toLowerCase() === emailLower);
            const isViceMatch = turmaValid && turmaValid.vice && (String(turmaValid.vice.email || '').toLowerCase() === emailLower);
            if (!isLeaderMatch && !isViceMatch) {
                console.warn(`🚫 [SEGURANÇA] Header claims lider/turma_admin but email not found in turma:`, { usuarioTurmaId, email: emailLower });
                return res.status(403).json({ error: "Usuário não autorizado para essa turma." });
            }
        } catch (e) {
            console.error("Erro ao validar usuário da turma no DB:", e);
            return res.status(500).json({ error: "Erro ao validar credenciais." });
        }

        if (turmaIdRequisicao && turmaIdRequisicao !== '__geral__' && turmaIdRequisicao !== usuarioTurmaId) {
            console.warn(`🚫 [SEGURANÇA] Tentativa não autorizada de acesso à turma:`, {
                usuarioTurmaId,
                turmaIdRequisicao,
                usuarioLider,
                method: req.method,
                path: req.path,
                ip: req.ip,
                email: usuarioEmail
            });
            
            return res.status(403).json({
                error: "Você só pode acessar eventos da sua própria turma.",
                detalhe: `Sua turma: ${usuarioTurmaId}, Turma solicitada: ${turmaIdRequisicao}`
            });
        }

        console.log(`  ✅ Líder autorizado para turma ${usuarioTurmaId}`);
        return next();
    }

    console.warn(`🚫 [SEGURANÇA] Acesso não autorizado:`, {
        role: usuarioLider,
        method: req.method,
        path: req.path,
        ip: req.ip,
        email: usuarioEmail
    });

    res.status(403).json({ error: "Acesso não autorizado." });
};

// Mapeamento interno para compatibilidade com o middleware existente
const authMiddleware = validarAcessoTurma;

// 🔐 SEGURANÇA: Função utilitária para sanitizar turmas e remover senhas antes de enviar ao cliente
function sanitizeTurma(turma) {
    const obj = (turma && turma.toObject) ? turma.toObject() : (turma || {});
    if (obj.lider && Object.prototype.hasOwnProperty.call(obj.lider, 'senha')) delete obj.lider.senha; // 🔐 SEGURANÇA
    if (obj.vice && Object.prototype.hasOwnProperty.call(obj.vice, 'senha')) delete obj.vice.senha; // 🔐 SEGURANÇA
    return obj;
}

// 🔐 SEGURANÇA: DTOs para resposta da API — NUNCA expor campos sensíveis
function adminDTO(admin) {
    if (!admin) return null;
    const a = (admin && admin.toObject) ? admin.toObject() : admin;
    return {
        _id: a._id,
        nome: a.nome,
        email: a.email,
        cargo: a.cargo || null,
        role: a.role || null
    };
}

function turmaDTO(turma) {
    if (!turma) return null;
    const t = sanitizeTurma(turma);
    return {
        _id: t._id || null,
        id: t.id || t._id || null,
        nome: t.nome,
        curso: t.curso,
        ano: t.ano,
        lider: t.lider
    ? {
        nome: t.lider.nome,
        email: t.lider.email
    }
    : null,

vice: t.vice
    ? {
        nome: t.vice.nome,
        email: t.vice.email
    }
    : null
    };
}

function eventoDTO(ev) {
    if (!ev) return null;
    const e = (ev && ev.toObject) ? ev.toObject() : ev;
    return {
        _id: e._id,
        titulo: e.titulo,
        tipo: e.tipo || e.categoria,
        categoria: e.categoria,
        data: e.data,
        hora: e.hora,
        descricao: e.descricao,
        turmaId: e.turmaId,
        criadoPor: e.criadoPor,
        usuarioId: e.usuarioId,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt
    };
}

// =============================
// ROTAS DE AUTENTICAÇÃO (AUTH)
// =============================

app.post('/auth/login', async (req, res) => {
    try {
        console.log("--- LOGIN ---");

        const { email, senha, password } = req.body || {};

        const passInput = (senha || password || "").trim();
        const emailInput = (email || "").trim().toLowerCase();

        if (!emailInput || !passInput) {
            return res.status(400).json({
                error: "E-mail e senha são obrigatórios."
            });
        }

                // =========================
        // ADMIN LOGIN
        // =========================
        const adminUser = await Admin.findOne({ email: emailInput });

        // 🔐 validação do admin — usar apenas bcrypt.compare via compareStored
        if (adminUser && await compareStored(adminUser.password, passInput)) {
            console.log("✅ Admin autenticado (email:", adminUser.email, ")");

            return res.json({
                user: {
                    _id: adminUser._id,
                    nome: adminUser.nome,
                    email: adminUser.email,
                    cargo: "principal",
                    role: "admin"
                }
            });
        }

        // =========================
        // TURMAS LOGIN
        // =========================
        const turmas = await Turma.find();

        for (const t of turmas) {
            const liderEmail = (t.lider?.email || "").toLowerCase().trim();
            const liderSenha = t.lider?.senha;

            const viceEmail = (t.vice?.email || "").toLowerCase().trim();
            const viceSenha = t.vice?.senha;

            // LÍDER
            if (liderEmail === emailInput && await compareStored(liderSenha, passInput)) {
                console.log("✅ Líder autenticado");

                return res.json({
                    user: {
                        _id: t.id,
                        nome: t.lider.nome,
                        email: emailInput,
                        cargo: "líder",
                        role: "turma_admin",
                        turmaId: t.id,
                        turmaNome: t.nome
                    }
                });
            }

            // VICE
            if (viceEmail === emailInput && await compareStored(viceSenha, passInput)) {
                console.log("✅ Vice-líder autenticado");

                return res.json({
                    user: {
                        _id: t.id,
                        nome: t.vice.nome,
                        email: emailInput,
                        cargo: "vice-líder",
                        role: "turma_admin",
                        turmaId: t.id,
                        turmaNome: t.nome
                    }
                });
            }
        }

        return res.status(401).json({
            error: "E-mail ou senha incorretos."
        });

    } catch (error) {
        console.error("Erro login:", error);
        return res.status(500).json({
            error: "Erro interno no servidor."
        });
    }
});
app.put('/admin/alterar-senha', async (req, res) => {
    try {
        console.log("=== ALTERANDO SENHA ===");
        const { senhaAtual, novaSenha } = req.body;
        const email = req.headers["x-usuario-email"];
        console.log("EMAIL DO HEADER:", email);

        const admin = await Admin.findOne({ email: email });
        if (!admin) {
            return res.status(404).json({ error: "Admin não encontrado." });
        }

        if (!await compareStored(admin.password, senhaAtual)) {
            return res.status(401).json({ error: "Senha atual incorreta." });
        }

        admin.password = await bcrypt.hash(novaSenha, 10);
        await admin.save();

        console.log("Senha atualizada com sucesso!");
        return res.json({ message: "Senha alterada com sucesso!" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro ao alterar senha." });
    }
});

app.put('/auth/lider/senha', async (req, res) => {
    const { email, senhaAtual, novaSenha } = req.body;
    const emailInput = (email || "").trim().toLowerCase();

    const t = await Turma.findOne({
        $or: [
            { "lider.email": emailInput },
            { "vice.email": emailInput }
        ]
    });

    if (!t) return res.status(404).json({ error: "Usuário não encontrado." });

    if (t.lider && t.lider.email.toLowerCase() === emailInput) {
        if (!await compareStored(t.lider.senha, senhaAtual)) return res.status(401).json({ error: "Senha atual incorreta." });
        t.lider.senha = await bcrypt.hash(novaSenha.trim(), 10);
    } else if (t.vice && t.vice.email.toLowerCase() === emailInput) {
        if (!await compareStored(t.vice.senha, senhaAtual)) return res.status(401).json({ error: "Senha atual incorreta." });
        t.vice.senha = await bcrypt.hash(novaSenha.trim(), 10);
    }

    await t.save();
    return res.json({ message: "Senha alterada com sucesso!" });
});

// =============================
// ROTAS DE EVENTOS (100% MONGODB)
// =============================

app.get('/eventos', async (req, res) => {
    try {
        const usuarioRole = req.headers['x-usuario-role'];
        const usuarioEmail = req.headers['x-usuario-email'];
        if (usuarioRole === 'turma_admin') {
            console.warn(`🚫 [SEGURANÇA] Líder tentou listar todos os eventos:`, {
                email: usuarioEmail,
                ip: req.ip
            });
            return res.status(403).json({
                error: "Você não tem permissão para listar todos os eventos. Use /eventos/turma/:id"
            });
        }
        const eventos = await Evento.find();
        // 🔐 SEGURANÇA: Mapear via DTO para não retornar campos inesperados
        res.json(eventos.map(eventoDTO));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/eventos/geral', async (req, res) => {
    try {
        const eventos = await Evento.find({ tipo: 'geral' });
        res.json(eventos.map(eventoDTO));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/eventos/turma/:id', async (req, res) => {
    try {
        const turmaIdSolicitada = req.params.id;
        const eventos = await Evento.find({ $or: [ { turmaId: turmaIdSolicitada, tipo: 'turma' }, { tipo: 'geral' } ] });
        res.json(eventos.map(eventoDTO));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/eventos", authMiddleware, async (req, res) => {
    try {
        // Não logar corpo da requisição (pode conter dados sensíveis). Log mínimo.
        console.log("[EVENTO] Criando evento: turmaId=", req.body && req.body.turmaId ? req.body.turmaId : 'n/a');

        const evento = new Evento({
      titulo: req.body.titulo,
      tipo: req.body.tipo,
      categoria: req.body.categoria,
      data: req.body.data,
      hora: req.body.hora,
      descricao: req.body.descricao,
      turmaId: req.body.turmaId,
      criadoPor: req.body.criadoPor,
      usuarioId: req.body.usuarioId
    });

    await evento.save();

    console.log("✅ Evento salvo no MongoDB: id=", evento._id);
    // 🔐 SEGURANÇA: retornar via DTO
    res.status(201).json(eventoDTO(evento));

  } catch (err) {
    console.error("❌ Erro ao salvar evento:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/eventos/:id', authMiddleware, async (req, res) => {
    try {
        const eventoAntigo = await Evento.findById(req.params.id);
        if (!eventoAntigo) return res.status(404).json({ message: "Evento não encontrado" });

        // Debug info antes da validação
        console.log({
            role: req.headers["x-usuario-role"],
            turmaUsuario: req.headers["x-usuario-turma"],
            turmaEvento: eventoAntigo.turmaId
        });

        // Regras de autorização: admin pode tudo; líder só sua turma
        const roleHeader = String(req.headers['x-usuario-role'] || '').toLowerCase();
        const turmaUsuario = req.headers['x-usuario-turma'] || '';
        const turmaEvento = eventoAntigo.turmaId || '';

        const isAdmin = roleHeader === 'admin';
        const isLider = roleHeader === 'lider' || roleHeader === 'turma_admin' || roleHeader === 'líder';

        if (!isAdmin) {
            if (isLider) {
                if (String(turmaEvento) !== String(turmaUsuario)) {
                    return res.status(403).json({ message: "Acesso não autorizado" });
                }
            } else {
                return res.status(403).json({ message: "Acesso não autorizado" });
            }
        }

        if (req.body.tipo && req.body.tipo !== eventoAntigo.tipo) {
            return res.status(403).json({ error: "Não é permitido mudar o tipo de evento." });
        }
        if (req.body.turmaId && req.body.turmaId !== eventoAntigo.turmaId) {
            return res.status(403).json({ error: "Não é permitido mudar a turma do evento." });
        }

        const evento = await Evento.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date().toISOString() },
            { new: true }
        );
        res.json(eventoDTO(evento));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/eventos/:id', authMiddleware, async (req, res) => {
    try {
        const evento = await Evento.findById(req.params.id);
        if (!evento) return res.status(404).json({ message: "Evento não encontrado" });

        // Debug info antes da validação
        console.log({
            role: req.headers["x-usuario-role"],
            turmaUsuario: req.headers["x-usuario-turma"],
            turmaEvento: evento.turmaId
        });

        const roleHeader = String(req.headers['x-usuario-role'] || '').toLowerCase();
        const turmaUsuario = req.headers['x-usuario-turma'] || '';
        const turmaEvento = evento.turmaId || '';

        const isAdmin = roleHeader === 'admin';
        const isLider = roleHeader === 'lider' || roleHeader === 'turma_admin' || roleHeader === 'líder';

        if (!isAdmin) {
            if (isLider) {
                if (String(turmaEvento) !== String(turmaUsuario)) {
                    return res.status(403).json({ message: "Acesso não autorizado" });
                }
            } else {
                return res.status(403).json({ message: "Acesso não autorizado" });
            }
        }

        await Evento.findByIdAndDelete(req.params.id);
        res.json({ message: 'Evento removido com sucesso' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================
// ROTAS DE CONTATOS (100% MONGODB)
// =============================

app.post("/contatos", authMiddleware, async (req, res) => {
  try {
    const contato = new Contato(req.body);
    await contato.save();

    return res.status(201).json(contato);
  } catch (err) {
    console.error("Erro ao criar contato:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/contatos', async (req,res)=>{
    try {
    const contatos = await Contato.find();
    res.json(contatos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

app.get('/contatos/:id', authMiddleware, async (req, res) => {
  try {
    const contato = await Contato.findById(req.params.id);
    if (!contato) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }
    res.json(contato);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contato' });
  }
});

app.put("/contatos/:id", authMiddleware, async (req, res) => {
  try {
    const contato = await Contato.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: "after" }
    );

    return res.json(contato);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/contatos/:id", authMiddleware, async (req, res) => {
  try {
    await Contato.findByIdAndDelete(req.params.id);
    return res.json({ message: "Contato removido com sucesso" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// =============================
// ROTAS DE TURMAS (100% MONGODB)
// =============================

app.get('/turmas', async (req, res) => {
    const turmas = await Turma.find();

    const safe = turmas.map(t => {
        const obj = t.toObject();

        if (obj.lider) delete obj.lider.senha;
        if (obj.vice) delete obj.vice.senha;

        return obj;
    });

    res.json(safe);
});

app.post('/turmas', async (req, res) => {
    // 🔐 SEGURANÇA: Validar admin header contra o banco (não confiar apenas no header)
    const usuarioRole = req.headers['x-usuario-role'];
    const usuarioEmail = req.headers['x-usuario-email'];
    if (usuarioRole !== 'admin' && !req.headers['x-admin-auth']) {
        return res.status(403).json({ error: "Apenas administradores podem criar turmas." });
    }
    const emailLower = String(usuarioEmail || '').toLowerCase();
    const admin = await Admin.findOne({ email: emailLower });
    if (!admin) return res.status(403).json({ error: "Admin inválido." });

    const novo = req.body;
    if (!novo.id) novo.id = Date.now().toString();

    // 🔐 SEGURANÇA: Hash senhas de lider/vice se fornecidas
    if (novo.lider && novo.lider.senha) {
        novo.lider.senha = await bcrypt.hash(String(novo.lider.senha), 10);
    }
    if (novo.vice && novo.vice.senha) {
        novo.vice.senha = await bcrypt.hash(String(novo.vice.senha), 10);
    }

    const turma = await Turma.create(novo);
    // 🔐 SEGURANÇA: Usar turmaDTO para retornar objeto sem senhas e campos controlados
    res.status(201).json(turmaDTO(turma));
});

app.put('/turmas/:id', async (req, res) => {
    // 🔐 SEGURANÇA: Validar admin header contra o banco
    const usuarioRole = req.headers['x-usuario-role'];
    const usuarioEmail = req.headers['x-usuario-email'];
    if (usuarioRole !== 'admin' && !req.headers['x-admin-auth']) {
        return res.status(403).json({ error: "Apenas administradores podem editar turmas." });
    }
    const emailLower = String(usuarioEmail || '').toLowerCase();
    const admin = await Admin.findOne({ email: emailLower });
    if (!admin) return res.status(403).json({ error: "Admin inválido." });

    // 🔐 SEGURANÇA: Se vier alteração de senha de lider/vice, hash antes de salvar
    if (req.body && req.body.lider && req.body.lider.senha) {
        req.body.lider.senha = await bcrypt.hash(String(req.body.lider.senha), 10);
    }
    if (req.body && req.body.vice && req.body.vice.senha) {
        req.body.vice.senha = await bcrypt.hash(String(req.body.vice.senha), 10);
    }

    const turma = await Turma.findOneAndUpdate(
        { id: req.params.id },
        { $set: req.body },
        { returnDocument: "after" }
    );

    if (!turma) {
        return res.status(404).json({ error: "Turma não encontrada" });
    }

    // 🔐 SEGURANÇA: Retornar objeto sanitizado via DTO
    res.json(turmaDTO(turma));
});

app.delete('/turmas/:id', async (req, res) => {
    // 🔐 SEGURANÇA: Validar admin header contra o banco
    const usuarioRole = req.headers['x-usuario-role'];
    const usuarioEmail = req.headers['x-usuario-email'];
    if (usuarioRole !== 'admin' && !req.headers['x-admin-auth']) {
        return res.status(403).json({ error: "Apenas administradores podem deletar turmas." });
    }
    const emailLower = String(usuarioEmail || '').toLowerCase();
    const admin = await Admin.findOne({ email: emailLower });
    if (!admin) return res.status(403).json({ error: "Admin inválido." });

    const turma = await Turma.findOneAndDelete({ id: req.params.id });

    if (!turma) {
        return res.status(404).json({ error: "Turma não encontrada" });
    }

    res.json({ ok: true });
});

// =============================
// ROTAS DE DEBUG & MIGRAÇÃO
// =============================

app.post('/debug/validar-headers', (req, res) => {
    res.json({
        headers: {
            'x-usuario-email': req.headers['x-usuario-email'],
            'x-usuario-role': req.headers['x-usuario-role'],
            'x-usuario-turma': req.headers['x-usuario-turma'],
            'x-admin-auth': req.headers['x-admin-auth']
        },
        body: req.body,
        method: req.method,
        ip: req.ip
    });
});

// Migrar turmas json → MongoDB
app.post("/migrar/turmas", async (req, res) => {
    try {
        const dados = JSON.parse(fs.readFileSync(TURMAS_FILE, "utf8"));
        let criados = 0;

        for (const turma of dados) {
            const existe = await Turma.findOne({ id: turma.id });

            if (!existe) {
                await Turma.create(turma);
                criados++;
            }
        }

        res.json({
            message: "Migração de turmas concluída",
            criados
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro na migração de turmas" });
    }
});
// =============================
// MIGRAÇÃO DE SENHAS LEGADAS (plaintext -> bcrypt)
// =============================

async function hashLegacyPasswords() {
    try {
        // Admins
        const admins = await Admin.find();
        let migratedAdmins = 0;
        for (const a of admins) {
            if (a.password && typeof a.password === 'string' && !a.password.startsWith('$2')) {
                // Não logar o valor da senha
                a.password = await bcrypt.hash(String(a.password), 10);
                await a.save();
                migratedAdmins++;
            }
        }
        if (migratedAdmins > 0) console.log(`Migrated ${migratedAdmins} admin password(s) to bcrypt.`);

        // Turmas: lider/vice
        const turmasAll = await Turma.find();
        let migratedTurmas = 0;
        for (const t of turmasAll) {
            let changed = false;
            if (t.lider && t.lider.senha && typeof t.lider.senha === 'string' && !t.lider.senha.startsWith('$2')) {
                t.lider.senha = await bcrypt.hash(String(t.lider.senha), 10);
                changed = true;
            }
            if (t.vice && t.vice.senha && typeof t.vice.senha === 'string' && !t.vice.senha.startsWith('$2')) {
                t.vice.senha = await bcrypt.hash(String(t.vice.senha), 10);
                changed = true;
            }
            if (changed) {
                await t.save();
                migratedTurmas++;
            }
        }
        if (migratedTurmas > 0) console.log(`Migrated ${migratedTurmas} turma leader/vice password(s) to bcrypt.`);

    } catch (err) {
        console.error('Erro na migração de senhas legadas:', err);
    }
}

// =============================
// INICIALIZAÇÃO DO SERVIDOR
// =============================

async function startServer() {
    await connectDB();
    await hashLegacyPasswords();

}

app.put("/admin/atualizar-perfil", async (req, res) => {
    try {
        console.log("=== ATUALIZANDO PERFIL === email=", req.headers["x-usuario-email"]);

        const { nome, email, senha } = req.body;
        const emailAtual = req.headers["x-usuario-email"];

        if (!emailAtual) {
            return res.status(401).json({ erro: "Usuário não identificado." });
        }

        const admin = await Admin.findOne({ email: emailAtual });
        if (!admin) {
            return res.status(404).json({ erro: "Administrador não encontrado." });
        }

        if (!await compareStored(admin.password, senha)) {
            return res.status(401).json({ erro: "Senha atual incorreta." });
        }

        const emailExiste = await Admin.findOne({ email: email.toLowerCase() });
        if (emailExiste && emailExiste._id.toString() !== admin._id.toString()) {
            return res.status(400).json({ erro: "Esse email já está sendo utilizado." });
        }

        admin.nome = nome;
        admin.email = email.toLowerCase();
        await admin.save();

        console.log("Perfil atualizado: _id=", admin._id, " email=", admin.email);

        const userOut = adminDTO(admin);
        userOut.cargo = 'principal';
        userOut.role = 'admin';
        return res.json({ mensagem: "Dados atualizados com sucesso!", user: userOut });
    } catch(error) {
        console.error(error);
        return res.status(500).json({ erro: "Erro interno no servidor." });
    }
});


// ✅ SERVIDOR (separado)
const PORT = process.env.PORT || 3000;

startServer().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`--- SERVIDOR REPARADO NA PORTA ${PORT} ---`);
        console.log(`--- Acesso local: http://localhost:${PORT} ---`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`!!! ERRO: A porta ${PORT} já está em uso por outro programa. !!!`);
        } else {
            console.error("Erro ao iniciar o servidor:", err);
        }
    });
}).catch(err => {
    console.error('Falha ao iniciar servidor:', err);
    process.exit(1);
});