require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = async () => {
  console.log("Tentando conectar ao MongoDB...");

  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB conectado 🚀");
  } catch (error) {
    console.error("Erro ao conectar:", error);
    process.exit(1);
  }
};

module.exports = connectDB;