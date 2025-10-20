// backend/routes/exportRoutes.js

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const moment = require('moment');
const Merchant = require('../models/Merchant');
const Agent = require('../models/Agent');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const crypto = require('crypto');

// @route   GET /api/export/performance
// @desc    Export agent and team performance to Excel
// @access  Private (Admin)
router.get(
    '/performance',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const { startDate, endDate, teamId, agentId } = req.query;

            // 1. Data Fetching and Filtering
            let merchantFilter = {};
            if (startDate && endDate) {
                merchantFilter.createdAt = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate),
                };
            }

            if (agentId) {
                merchantFilter.agentRecruteurId = agentId;
            } else if (teamId) {
                const agentsInTeam = await Agent.find({ superviseurId: teamId }).select('_id');
                const agentIds = agentsInTeam.map(a => a._id);
                merchantFilter.agentRecruteurId = { $in: agentIds };
            }

            const enrollments = await Merchant.find(merchantFilter)
                .populate({
                    path: 'agentRecruteurId',
                    select: 'matricule nom superviseurId',
                    populate: {
                        path: 'superviseurId',
                        select: 'matricule nom'
                    }
                })
                .sort({ createdAt: -1 });

            const allAgents = await Agent.find({ role: 'agent' }).populate('superviseurId', 'matricule nom');

            // 2. Data Processing
            const agentPerformance = {};
            const teamPerformance = {};

            allAgents.forEach(agent => {
                const teamName = agent.superviseurId ? agent.superviseurId.matricule : null;

                if (teamName) {
                    if (!teamPerformance[teamName]) {
                        teamPerformance[teamName] = {
                            supervisor: agent.superviseurId ? agent.superviseurId.nom : 'N/A',
                            agents: new Set(),
                            totalEnrollments: 0,
                            valid: 0,
                            rejected: 0,
                            dailyActivity: {}
                        };
                    }
                    teamPerformance[teamName].agents.add(agent._id.toString());
                }

                agentPerformance[agent._id] = {
                    team: teamName || 'Aucune Équipe',
                    agentName: agent.nom || agent.matricule,
                    agentId: agent.matricule,
                    total: 0,
                    valid: 0,
                    rejected: 0,
                    pending: 0,
                    lastEnrollment: null,
                    activeDays: new Set()
                };
            });

            enrollments.forEach(e => {
                const agent = agentPerformance[e.agentRecruteurId._id];
                if (agent) {
                    agent.total++;
                    if (e.statut === 'validé') agent.valid++;
                    else if (e.statut === 'rejeté') agent.rejected++;
                    else agent.pending++;

                    const enrollmentDate = moment(e.createdAt);
                    if (!agent.lastEnrollment || enrollmentDate.isAfter(agent.lastEnrollment)) {
                        agent.lastEnrollment = enrollmentDate;
                    }
                    agent.activeDays.add(enrollmentDate.format('YYYY-MM-DD'));
                }

                const teamName = e.agentRecruteurId.superviseurId ? e.agentRecruteurId.superviseurId.matricule : null;
                if (teamName) {
                    const team = teamPerformance[teamName];
                    if (team) {
                        team.totalEnrollments++;
                        if (e.statut === 'validé') team.valid++;
                        if (e.statut === 'rejeté') team.rejected++;
                        const day = moment(e.createdAt).format('YYYY-MM-DD');
                        team.dailyActivity[day] = (team.dailyActivity[day] || 0) + 1;
                    }
                }
            });

            // 3. Excel Generation
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Moov Africa';
            workbook.created = new Date();

            // --- Summary Sheet ---
            const summarySheet = workbook.addWorksheet('Résumé');
            summarySheet.addRow(['Export généré le', new Date().toLocaleString()]);
            summarySheet.addRow([]);
            summarySheet.addRow(['Statistiques Globales']);
            summarySheet.getCell('A3').font = { bold: true, size: 14 };
            const totalEquipes = await Agent.countDocuments({ role: 'superviseur' });
            summarySheet.addRow(['Total Enrôlements', enrollments.length]);
            summarySheet.addRow(['Total Équipes', totalEquipes]);
            summarySheet.addRow(['Total Agents', allAgents.length]);
            const totalValid = enrollments.filter(e => e.statut === 'validé').length;
            const totalRate = enrollments.length > 0 ? (totalValid / enrollments.length) * 100 : 0;
            summarySheet.addRow(['Taux de Réussite Général', `${totalRate.toFixed(2)}%`]);


            // --- Agent Performance Sheet ---
            const agentSheet = workbook.addWorksheet('Performances Agents');
            agentSheet.addRow(['Export généré le', new Date().toLocaleString()]);
            agentSheet.getRow(1).getCell(1).font = { italic: true };
            agentSheet.addRow([]);
            const agentHeaders = ['Équipe', 'Nom Agent', 'ID Agent', 'Total', 'Valides', 'Rejetés', 'En attente', 'Taux (%)', 'Dernier enrôlement', 'Moy. journalière'];
            const agentHeaderRow = agentSheet.addRow(agentHeaders);
            agentHeaderRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            Object.values(agentPerformance).forEach(data => {
                const rate = data.total > 0 ? (data.valid / data.total) * 100 : 0;
                const dailyAvg = data.activeDays.size > 0 ? data.total / data.activeDays.size : 0;
                agentSheet.addRow([
                    data.team,
                    data.agentName,
                    data.agentId,
                    data.total,
                    data.valid,
                    data.rejected,
                    data.pending,
                    `${rate.toFixed(2)}%`,
                    data.lastEnrollment ? data.lastEnrollment.format('YYYY-MM-DD HH:mm') : 'N/A',
                    dailyAvg.toFixed(2)
                ]);
            });
            agentSheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    let columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            });
            agentSheet.views = [{ state: 'frozen', ySplit: 3 }];

            // --- Team Performance Sheet ---
            const teamSheet = workbook.addWorksheet('Performances Équipes');
            teamSheet.addRow(['Export généré le', new Date().toLocaleString()]);
            teamSheet.getRow(1).getCell(1).font = { italic: true };
            teamSheet.addRow([]);
            const teamHeaders = ['Équipe', 'Superviseur', 'Nb Agents', 'Total Enrôlements', 'Moyenne par agent', 'Valides', 'Rejetés', 'Taux (%)', 'Jour le plus actif'];
            const teamHeaderRow = teamSheet.addRow(teamHeaders);
            teamHeaderRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
            });

            Object.entries(teamPerformance).forEach(([teamName, data]) => {
                const rate = data.totalEnrollments > 0 ? (data.valid / data.totalEnrollments) * 100 : 0;
                const avgPerAgent = data.agents.size > 0 ? data.totalEnrollments / data.agents.size : 0;
                const mostActiveDay = Object.keys(data.dailyActivity).reduce((a, b) => data.dailyActivity[a] > data.dailyActivity[b] ? a : b, null);
                teamSheet.addRow([
                    teamName,
                    data.supervisor,
                    data.agents.size,
                    data.totalEnrollments,
                    avgPerAgent.toFixed(2),
                    data.valid,
                    data.rejected,
                    `${rate.toFixed(2)}%`,
                    mostActiveDay || 'N/A'
                ]);
            });
            teamSheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    let columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            });
            teamSheet.views = [{ state: 'frozen', ySplit: 3 }];

            // --- Enrollments Detail Sheet ---
            const detailSheet = workbook.addWorksheet('Détails Enrôlements');
            detailSheet.addRow(['Export généré le', new Date().toLocaleString()]);
            detailSheet.getRow(1).getCell(1).font = { italic: true };
            detailSheet.addRow([]);
            const detailHeaders = ['Équipe', 'Agent', 'Marchand', 'Téléphone', 'Localité', 'Statut', 'Date', 'Source'];
            const detailHeaderRow = detailSheet.addRow(detailHeaders);
            detailHeaderRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
            });

            enrollments.forEach(e => {
                detailSheet.addRow([
                    e.agentRecruteurId.superviseurId ? e.agentRecruteurId.superviseurId.matricule : 'Aucune Équipe',
                    e.agentRecruteurId.nom || e.agentRecruteurId.matricule,
                    e.nom,
                    e.contact,
                    `${e.ville}, ${e.commune}`,
                    e.statut,
                    moment(e.createdAt).format('YYYY-MM-DD HH:mm:ss'),
                    'Mobile App' // Assuming source, can be dynamic if available
                ]);
            });
            detailSheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    let columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            });
            detailSheet.views = [{ state: 'frozen', ySplit: 3 }];
            detailSheet.autoFilter = {
                from: 'A3',
                to: {
                    row: 3,
                    column: detailHeaders.length
                }
            };

            // 4. HTTP Response
            const date = moment().format('YYYYMMDD');
            const time = moment().format('HHmm');
            const uniqueID = crypto.randomBytes(3).toString('hex');
            const filename = `export_performances_${date}_${time}_${uniqueID}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            await workbook.xlsx.write(res);
            res.end();

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur lors de la génération du fichier Excel.');
        }
    }
);

module.exports = router;