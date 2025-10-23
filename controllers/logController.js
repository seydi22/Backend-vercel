const Log = require("../models/Log");
const asyncHandler = require("express-async-handler");

/**
 * @desc    Récupérer tous les logs avec pagination et filtre
 * @route   GET /api/logs
 * @access  Private/Admin
 */
const getLogs = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 15;
  const search = req.query.search || '';

  const query = search
    ? {
        $or: [
          { matricule: { $regex: search, $options: 'i' } },
          { action: { $regex: search, $options: 'i' } },
        ],
      }
    : {};

  const totalLogs = await Log.countDocuments(query);
  const totalPages = Math.ceil(totalLogs / limit);

  const logs = await Log.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.status(200).json({
    logs,
    totalPages,
    currentPage: page,
    totalLogs,
  });
});

module.exports = {
  getLogs,
};
