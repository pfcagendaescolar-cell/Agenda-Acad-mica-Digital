const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const connectDB = require("./config/db");
const Turma = require("./models/Turma");
const Evento = require("./models/Evento");
const Contato = require("./models/Contato");
const Admin = require("./models/Admin");

const app = express();

// Middlewares Globais
app.use(cors());
app.use(express.json());

// Servir frontend estático
app.use(express.static(path.join(__dirname, '..', 'frontend-vanilla')));

// Definição dos Caminhos dos Arquivos JSON Restantes para Migração
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
        console.log(`  ✅ Admin autorizado`);
        return next();
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

// =============================
// ROTAS DE AUTENTICAÇÃO (AUTH)
// =============================

app.post('/auth/login', async (req, res) => {
    console.log("--- DEBUG LOGIN (v6.1 - DETALHADO) ---");
    const { email, senha, password } = req.body;
    const passInput = (senha || password || "").trim();
    const emailInput = (email || "").trim().toLowerCase();

    console.log(`Recebido: Email=[${emailInput}], Senha=[${passInput}]`);

    const adminUser = await Admin.findOne({
        email: emailInput,
        password: passInput
    });

    if (adminUser) {
        console.log(`✅ Admin autenticado: ${adminUser.nome}`);
        return res.json({
            user: {
                _id: adminUser._id,
                nome: adminUser.nome,
                email: adminUser.email,
                cargo: 'principal',
                role: 'admin'
            }
        });
    }

    const turmas = await Turma.find();
    console.log(`Buscando em ${turmas.length} turmas...`);

    for (const t of turmas) {
        const storedLiderEmail = (t.lider?.email || "").trim().toLowerCase();
        const storedLiderPass = (t.lider?.senha || "").trim();
        const storedViceEmail = (t.vice?.email || "").trim().toLowerCase();
        const storedVicePass = (t.vice?.senha || "").trim();

        if (storedLiderEmail === emailInput && storedLiderPass === passInput) {
            console.log(`✅ Líder autenticado: ${t.lider.nome} (Turma: ${t.nome})`);
            return res.json({
                user: {
                    _id: t.id,
                    nome: t.lider.nome,
                    email: emailInput,
                    cargo: 'líder',
                    role: 'turma_admin',
                    turmaId: t.id,
                    turmaNome: t.nome
                }
            });
        }

        if (storedViceEmail === emailInput && storedVicePass === passInput) {
            console.log(`✅ Vice-Líder autenticado: ${t.vice.nome} (Turma: ${t.nome})`);
            return res.json({
                user: {
                    _id: t.id,
                    nome: t.vice.nome,
                    email: emailInput,
                    cargo: 'vice-líder',
                    role: 'turma_admin',
                    turmaId: t.id,
                    turmaNome: t.nome
                }
            });
        }
    }

    console.log(`❌ Login falhou para: [${emailInput}]`);
    res.status(401).json({ error: "E-mail ou senha incorretos." });
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

        if (admin.password !== senhaAtual) {
            return res.status(401).json({ error: "Senha atual incorreta." });
        }

        admin.password = novaSenha;
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
        if (t.lider.senha !== senhaAtual) return res.status(401).json({ error: "Senha atual incorreta." });
        t.lider.senha = novaSenha.trim();
    } else if (t.vice && t.vice.email.toLowerCase() === emailInput) {
        if (t.vice.senha !== senhaAtual) return res.status(401).json({ error: "Senha atual incorreta." });
        t.vice.senha = novaSenha.trim();
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
        res.json(eventos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/eventos/geral', async (req, res) => {
    try {
        const eventos = await Evento.find({ tipo: 'geral' });
        res.json(eventos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/eventos/turma/:id', async (req, res) => {
    try {
        const turmaIdSolicitada = req.params.id;
        const eventos = await Evento.find({ $or: [ { turmaId: turmaIdSolicitada, tipo: 'turma' }, { tipo: 'geral' } ] });
        res.json(eventos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/eventos", authMiddleware, async (req, res) => {
  try {
    console.log("[EVENTO] Criando evento:", req.body);

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

    console.log("✅ Evento salvo no MongoDB:", evento);

    res.status(201).json(evento);

  } catch (err) {
    console.error("❌ Erro ao salvar evento:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/eventos/:id', authMiddleware, async (req, res) => {
    try {
        const eventoAntigo = await Evento.findById(req.params.id);
        if (!eventoAntigo) return res.status(404).json({ error: "Evento não encontrado." });
        if (req.body.tipo && req.body.tipo !== eventoAntigo.tipo) {
            return res.status(403).json({ error: "Não é permitido mudar o tipo de evento." });
        }
        if (req.body.turmaId && req.body.turmaId !== eventoAntigo.turmaId) {
            return res.status(403).json({ error: "Não é permitido mudar a turma do evento." });
        }
        const evento = await Evento.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date().toISOString() },
            { returnDocument: "after" }
        );
        res.json(evento);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/eventos/:id', authMiddleware, async (req, res) => {
    try {
        const resultado = await Evento.findByIdAndDelete(req.params.id);
        if (!resultado) return res.status(404).json({ error: "Evento não encontrado." });
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
    res.json(turmas);
});

app.post('/turmas', async (req, res) => {
    const usuarioRole = req.headers['x-usuario-role'];

    if (usuarioRole !== 'admin' && !req.headers['x-admin-auth']) {
        return res.status(403).json({ error: "Apenas administradores podem criar turmas." });
    }

    const novo = req.body;

    if (!novo.id) novo.id = Date.now().toString();

    const turma = await Turma.create(novo);

    res.status(201).json(turma);
});

app.put('/turmas/:id', async (req, res) => {
    const usuarioRole = req.headers['x-usuario-role'];

    if (usuarioRole !== 'admin' && !req.headers['x-admin-auth']) {
        return res.status(403).json({ error: "Apenas administradores podem editar turmas." });
    }

    const turma = await Turma.findOneAndUpdate(
        { id: req.params.id },
        { $set: req.body },
        { returnDocument: "after" }
    );

    if (!turma) {
        return res.status(404).json({ error: "Turma não encontrada" });
    }

    res.json(turma);
});

app.delete('/turmas/:id', async (req, res) => {
    const usuarioRole = req.headers['x-usuario-role'];

    if (usuarioRole !== 'admin' && !req.headers['x-admin-auth']) {
        return res.status(403).json({ error: "Apenas administradores podem deletar turmas." });
    }

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
// INICIALIZAÇÃO DO SERVIDOR
// =============================

connectDB();

app.put("/admin/atualizar-perfil", async (req, res) => {
    try {
        console.log("=== ATUALIZANDO PERFIL ===");
        console.log(req.body);
        console.log("EMAIL DO HEADER:", req.headers["x-usuario-email"]);

        const { nome, email, senha } = req.body;
        const emailAtual = req.headers["x-usuario-email"];

        if (!emailAtual) {
            return res.status(401).json({ erro: "Usuário não identificado." });
        }

        const admin = await Admin.findOne({ email: emailAtual });
        if (!admin) {
            return res.status(404).json({ erro: "Administrador não encontrado." });
        }

        if (admin.password !== senha) {
            return res.status(401).json({ erro: "Senha atual incorreta." });
        }

        const emailExiste = await Admin.findOne({ email: email.toLowerCase() });
        if (emailExiste && emailExiste._id.toString() !== admin._id.toString()) {
            return res.status(400).json({ erro: "Esse email já está sendo utilizado." });
        }

        admin.nome = nome;
        admin.email = email.toLowerCase();
        await admin.save();

        console.log("Perfil atualizado:", admin);

        return res.json({
            mensagem: "Dados atualizados com sucesso!",
            user: {
                _id: admin._id,
                nome: admin.nome,
                email: admin.email,
                cargo: 'principal',
                role: 'admin'
            }
        });
    } catch(error) {
        console.error(error);
        return res.status(500).json({ erro: "Erro interno no servidor." });
    }
});


// ✅ SERVIDOR (separado)
const PORT = 3000;
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