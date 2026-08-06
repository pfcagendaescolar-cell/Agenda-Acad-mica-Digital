const mongoose = require("mongoose");

const ContatoSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  setor: String,
  descricao: String,
  email: String,
  telefone: String
}, {
  timestamps: true
});

module.exports = mongoose.model("Contato", ContatoSchema);