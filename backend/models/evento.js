const mongoose = require("mongoose");

const EventoSchema = new mongoose.Schema({
  titulo: String,
  tipo: {
    type: String,
    enum: ["turma", "geral"]
  },
  categoria: String,
  data: String,
  hora: String,
  descricao: String,
  turmaId: String,
  criadoPor: String,
  usuarioId: String
}, {
  timestamps: true
});

module.exports = mongoose.model("Evento", EventoSchema);