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
                if (e.agentRecruteurId) { // Check if agentRecruteurId exists
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
            const detailHeaders = [
                'Short Code', 'Équipe', 'Agent', 'Date Création', 'Statut', 'Nom Marchand', 'Secteur', 'Type Commerce',
                'Région', 'Ville', 'Commune', 'Adresse', 'Longitude', 'Latitude', 'Nom Gérant', 'Prénom Gérant',
                'Contact Gérant', 'NIF', 'RC', 'Type Pièce', 'URL CNI Recto', 'URL CNI Verso', 'URL Passeport',
                'URL Photo Enseigne', 'Date Validation', 'Raison Rejet', 'Date Validation Superviseur'
            ];
            const detailHeaderRow = detailSheet.addRow(detailHeaders);
            detailHeaderRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
            });

            enrollments.forEach(e => {
                detailSheet.addRow([
                    e.shortCode,
                    e.agentRecruteurId && e.agentRecruteurId.superviseurId ? e.agentRecruteurId.superviseurId.matricule : 'Aucune Équipe',
                    e.agentRecruteurId ? (e.agentRecruteurId.nom || e.agentRecruteurId.matricule) : 'N/A',
                    moment(e.createdAt).format('YYYY-MM-DD HH:mm:ss'),
                    e.statut,
                    e.nom,
                    e.secteur,
                    e.typeCommerce,
                    e.region,
                    e.ville,
                    e.commune,
                    e.adresse,
                    e.longitude,
                    e.latitude,
                    e.nomGerant,
                    e.prenomGerant,
                    e.contact,
                    e.nif,
                    e.rc,
                    e.pieceIdentite ? e.pieceIdentite.type : '',
                    e.pieceIdentite ? e.pieceIdentite.cniRectoUrl : '',
                    e.pieceIdentite ? e.pieceIdentite.cniVersoUrl : '',
                    e.pieceIdentite ? e.pieceIdentite.passeportUrl : '',
                    e.photoEnseigneUrl,
                    e.validatedAt ? moment(e.validatedAt).format('YYYY-MM-DD HH:mm:ss') : '',
                    e.rejectionReason,
                    e.validatedBySupervisorAt ? moment(e.validatedBySupervisorAt).format('YYYY-MM-DD HH:mm:ss') : ''
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

            // --- Operator Detail Sheet ---
            const operatorSheet = workbook.addWorksheet('Détails Opérateurs');
            operatorSheet.addRow(['Export généré le', new Date().toLocaleString()]);
            operatorSheet.getRow(1).getCell(1).font = { italic: true };
            operatorSheet.addRow([]);
            const operatorHeaders = [
                'Short Code Marchand', 'Nom Opérateur', 'Prénom Opérateur', 'NNI Opérateur',
                'Téléphone Opérateur', 'Date Création Opérateur'
            ];
            const operatorHeaderRow = operatorSheet.addRow(operatorHeaders);
            operatorHeaderRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
            });

            enrollments.forEach(e => {
                if (e.operators && e.operators.length > 0) {
                    e.operators.forEach(op => {
                        operatorSheet.addRow([
                            e.shortCode,
                            op.nom,
                            op.prenom,
                            op.nni,
                            op.telephone,
                            op.createdAt ? moment(op.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''
                        ]);
                    });
                }
            });
            operatorSheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    let columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            });
            operatorSheet.views = [{ state: 'frozen', ySplit: 3 }];
            operatorSheet.autoFilter = {
                from: 'A3',
                to: {
                    row: 3,
                    column: operatorHeaders.length
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

// @route   GET /api/export/suivi
// @desc    Export tracking report for merchants
// @access  Private (Admin)
router.get(
    '/suivi',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            let merchantFilter = { statut: 'validé' };
            if (startDate && endDate) {
                merchantFilter.createdAt = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate),
                };
            }

            const merchants = await Merchant.find(merchantFilter).sort({ createdAt: -1 });

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Moov Africa';
            workbook.created = new Date();
            const worksheet = workbook.addWorksheet('Rapport de Suivi');

            const headers = [
                'Shortcode',
                'Nom Marchand',
                'Prénom Gérant',
                'Date d\'enrôlement',
                'Date de validation superviseur',
                'Date de validation finale',
                'Numéro de téléphone',
                'Latitude',
                'Longitude'
            ];

            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
            });

            merchants.forEach(m => {
                worksheet.addRow([
                    m.shortCode,
                    m.nom,
                    m.prenomGerant,
                    m.createdAt ? moment(m.createdAt).format('YYYY-MM-DD HH:mm:ss') : '',
                    m.validatedBySupervisorAt ? moment(m.validatedBySupervisorAt).format('YYYY-MM-DD HH:mm:ss') : '',
                    m.validatedAt ? moment(m.validatedAt).format('YYYY-MM-DD HH:mm:ss') : '',
                    m.contact,
                    m.latitude,
                    m.longitude
                ]);
            });

            worksheet.columns.forEach(column => {
                column.width = 25;
            });

            const date = moment().format('YYYYMMDD');
            const time = moment().format('HHmm');
            const uniqueID = crypto.randomBytes(3).toString('hex');
            const filename = `rapport_de_suivi_${date}_${time}_${uniqueID}.xlsx`;

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            await workbook.xlsx.write(res);
            res.end();

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur lors de la génération du rapport de suivi.');
        }
    }
);

// @route   GET /api/export/nearby
// @desc    Export nearby items for merchants
// @access  Private (Admin)
router.get(
    '/nearby',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            
            // 1. Données de Location Map (hardcodées)
            const locationMapData = [
                {
                    provinceName: '湖南省',
                    provinceCode: 'HUNAN',
                    cityName: '长沙市',
                    cityCode: 'CHANGSHA',
                    zoneName: '岳麓区',
                    zoneCode: 'YUELU'
                },
                {
                    provinceName: '湖南省',
                    provinceCode: 'HUNAN',
                    cityName: '长沙市',
                    cityCode: 'CHANGSHA',
                    zoneName: '开福区',
                    zoneCode: 'KAIFU'
                },
                {
                    provinceName: '湖南省',
                    provinceCode: 'HUNAN',
                    cityName: '湘潭市',
                    cityCode: 'XIANGRAN',
                    zoneName: '雨湖区',
                    zoneCode: 'YUHU'
                },
                {
                    provinceName: '湖南省',
                    provinceCode: 'HUNAN',
                    cityName: '湘潭市',
                    cityCode: 'XIANGRAN',
                    zoneName: '岳塘区',
                    zoneCode: 'YUETANG'
                },
                {
                    provinceName: '湖北省',
                    provinceCode: 'HUBEI',
                    cityName: '武汉市',
                    cityCode: 'WUHAN',
                    zoneName: '江岸区',
                    zoneCode: 'JIANGAN'
                },
                {
                    provinceName: '湖北省',
                    provinceCode: 'HUBEI',
                    cityName: '武汉市',
                    cityCode: 'WUHAN',
                    zoneName: '洪山区',
                    zoneCode: 'HONGSHAN'
                },
                {
                    provinceName: '湖北省',
                    provinceCode: 'HUBEI',
                    cityName: '黄石市',
                    cityCode: 'HUANGSHI',
                    zoneName: '鄂城区',
                    zoneCode: 'ECHENG'
                },
                {
                    provinceName: '湖北省',
                    provinceCode: 'HUBEI',
                    cityName: '黄石市',
                    cityCode: 'HUANGSHI',
                    zoneName: '江夏区',
                    zoneCode: 'JIANGXIA'
                }
            ];
            
            // Utiliser le premier élément comme valeurs par défaut (HUNAN, CHANGSHA, YUELU)
            const defaultProvinceCode = locationMapData[0].provinceCode;
            const defaultCityCode = locationMapData[0].cityCode;
            const defaultZoneCode = locationMapData[0].zoneCode;
            
            // 2. Récupérer les marchands validés avec filtres par date
            let merchantFilter = { statut: 'validé' };
            if (startDate && endDate) {
                merchantFilter.validatedAt = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate),
                };
            } else if (startDate) {
                merchantFilter.validatedAt = { ...merchantFilter.validatedAt, $gte: new Date(startDate) };
            } else if (endDate) {
                merchantFilter.validatedAt = { ...merchantFilter.validatedAt, $lte: new Date(endDate) };
            }
            
            const merchants = await Merchant.find(merchantFilter).sort({ createdAt: -1 });
            
            if (!merchants || merchants.length === 0) {
                return res.status(404).json({ msg: 'Aucun marchand validé à exporter.' });
            }
            
            // 3. Créer le nouveau workbook
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Moov Africa';
            workbook.created = new Date();
            
            // 4. Créer la feuille "Nearby Item"
            const nearbyItemSheet = workbook.addWorksheet('Nearby Item');
            
            // En-têtes de la première feuille
            const nearbyItemHeaders = [
                'Item Name',
                'Nearby Type ID',
                'Province Code',
                'City Code',
                'Zone Code',
                'Longitude',
                'Latitude',
                'Phone Number',
                'Title',
                'Detailed Address'
            ];
            
            const headerRow = nearbyItemSheet.addRow(nearbyItemHeaders);
            headerRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            
            // Ajouter les données des marchands
            merchants.forEach(merchant => {
                // Item Name : nom de l'enseigne suivi du shortcode séparé par un "-"
                const itemName = merchant.shortCode 
                    ? `${merchant.nom}-${merchant.shortCode}` 
                    : merchant.nom;
                
                // Nearby Type ID : fixe, toujours 40001
                const nearbyTypeId = 40001;
                
                // Province Code, City Code, Zone Code : valeurs fixes (premier élément de Location Map)
                const provinceCode = defaultProvinceCode;
                const cityCode = defaultCityCode;
                const zoneCode = defaultZoneCode;
                
                // Longitude et Latitude du marchand
                const longitude = merchant.longitude || '';
                const latitude = merchant.latitude || '';
                
                // Numéro de téléphone du marchand
                const phoneNumber = merchant.contact || '';
                
                // Title : nom de l'enseigne
                const title = merchant.nom || '';
                
                // Detailed Address : adresse du marchand
                const detailedAddress = merchant.adresse || '';
                
                nearbyItemSheet.addRow([
                    itemName,
                    nearbyTypeId,
                    provinceCode,
                    cityCode,
                    zoneCode,
                    longitude,
                    latitude,
                    phoneNumber,
                    title,
                    detailedAddress
                ]);
            });
            
            // Ajuster la largeur des colonnes
            nearbyItemSheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    let columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            });
            
            nearbyItemSheet.views = [{ state: 'frozen', ySplit: 1 }];
            
            // 5. Créer la feuille "Location Map" (copie du template)
            const locationMapSheetNew = workbook.addWorksheet('Location Map');
            
            // Copier les en-têtes depuis le template
            const locationMapHeaders = ['Province', 'Province', 'City', 'City', 'Zone', 'Zone'];
            const locationMapSubHeaders = ['Name', 'Code', 'Name', 'Code', 'Name', 'Code'];
            
            const headerRow1 = locationMapSheetNew.addRow(locationMapHeaders);
            headerRow1.eachCell(cell => {
                cell.font = { bold: true };
            });
            
            const headerRow2 = locationMapSheetNew.addRow(locationMapSubHeaders);
            headerRow2.eachCell(cell => {
                cell.font = { bold: true };
            });
            
            // Copier les données depuis le template
            locationMapData.forEach(location => {
                locationMapSheetNew.addRow([
                    location.provinceName,
                    location.provinceCode,
                    location.cityName,
                    location.cityCode,
                    location.zoneName,
                    location.zoneCode
                ]);
            });
            
            // Ajuster la largeur des colonnes
            locationMapSheetNew.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    let columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            });
            
            locationMapSheetNew.views = [{ state: 'frozen', ySplit: 2 }];
            
            // 6. Envoyer le fichier
            const date = moment().format('YYYYMMDD');
            const time = moment().format('HHmm');
            const uniqueID = crypto.randomBytes(3).toString('hex');
            const filename = `export_nearby_${date}_${time}_${uniqueID}.xlsx`;
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
            
            await workbook.xlsx.write(res);
            res.end();
            
        } catch (err) {
            console.error('Erreur export nearby:', err.message);
            res.status(500).send('Erreur du serveur lors de la génération de l\'export nearby.');
        }
    }
);

module.exports = router;