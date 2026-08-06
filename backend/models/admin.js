const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
  _id: {
    type: String
  },
  nome: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("Admin", AdminSchema);