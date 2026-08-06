const mongoose = require("mongoose");

const connectDB = async () => {
  console.log("Tentando conectar ao MongoDB...");

  try {
await mongoose.connect("mongodb+srv://pfcagendaescolar_db_user:agendaescolar@agendaescolar.5kryiad.mongodb.net/agenda-escolar");    console.log("MongoDB conectado 🚀");
  } catch (error) {
    console.error("Erro ao conectar:", error);
    process.exit(1);
  }
};

module.exports = connectDB;