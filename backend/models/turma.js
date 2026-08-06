const mongoose = require("mongoose");

const TurmaSchema = new mongoose.Schema({
  nome: String,
  curso: String,
  ano: String,

  lider: {
    nome: String,
    email: String,
    senha: String
  },

  vice: {
    nome: String,
    email: String,
    senha: String
  },

  id: String
}, {
  timestamps: true
});

module.exports = mongoose.model("Turma", TurmaSchema);