const Log = require("../models/Log");
const asyncHandler = require("express-async-handler");

/**
 * @desc    Récupérer tous les logs
 * @route   GET /api/logs
 * @access  Private/Admin
 */
const getLogs = asyncHandler(async (req, res) => {
  const logs = await Log.find({}).sort({ createdAt: -1 });
  res.status(200).json(logs);
});

module.exports = {
  getLogs,
};
