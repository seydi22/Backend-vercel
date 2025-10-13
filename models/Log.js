const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  matricule: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Log", logSchema);
