const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');

// ROTA DE CADASTRO
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    // verifica se já existe usuário
    const usuarioExistente = await User.findOne({ email });
    if (usuarioExistente) {
      return res.status(400).json({ erro: "Email já cadastrado" });
    }

    // criptografar senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // criar usuário
    const novoUsuario = new User({
      nome,
      email,
      senha: senhaHash
    });

    await novoUsuario.save();

    res.status(201).json({ mensagem: "Usuário criado com sucesso" });

  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao criar usuário" });
  }
});

module.exports = router;