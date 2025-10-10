// backend/routes/merchantRoutes.js

const express = require('express');
const router = express.Router();
const Merchant = require('../models/Merchant');
const authMiddleware = require('../middleware/authMiddleware'); // Middleware pour protéger la route 
const multer = require('multer'); // Importe multer
const roleMiddleware = require('../middleware/roleMiddleware'); // Importez le middleware
const Agent = require('../models/Agent'); // Ajoutez cette ligne pour importer le modèle Agent
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { agent } = require('supertest');
const xlsx = require('xlsx'); // <--- Assurez-vous que cette ligne est bien présente !


// Configuration de Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary:cloudinary,
    params: (req, file) => {
        let folderName = 'enrolement_marchand';
        let public_id;
        
        if (file.fieldname === 'pieceIdentiteRecto') {
            public_id = `piece_recto_${Date.now()}`;
        } else if (file.fieldname === 'pieceIdentiteVerso') {
            public_id = `piece_verso_${Date.now()}`;
        } else if (file.fieldname === 'photoPasseport') {
            public_id = `passeport_${Date.now()}`;
        } else if (file.fieldname === 'photoEnseigne') {
            public_id = `enseigne_${Date.now()}`;
        } else {
            public_id = `file_${Date.now()}`;
        }
        
        return {
            folder: folderName,
            format: 'jpg',
            public_id: public_id,
        };
    },
});

const upload = multer({ storage: storage });

// @route   POST /api/merchants/register
// @desc    Enregistrer un nouveau marchand
// @access  Private (Agent/Superviseur)
router.post(
    '/register',
    authMiddleware,
    roleMiddleware(['agent', 'superviseur']),
    upload.fields([
        { name: 'pieceIdentiteRecto', maxCount: 1 },
        { name: 'pieceIdentiteVerso', maxCount: 1 },
        { name: 'photoPasseport', maxCount: 1 },
        { name: 'photoEnseigne', maxCount: 1 }
    ]),
    async (req, res) => {
        const {
            nom, secteur, typeCommerce, region, ville, commune,
            nomGerant, prenomGerant, dateNaissanceGerant,
            lieuNaissanceGerant, numeroCompteMoov, adresse,
            contact, nif, rc, typePiece, longitude, latitude,
            operators // This should be a JSON string of the operators array
        } = req.body;

        const pieceIdentiteRectoUrl = req.files['pieceIdentiteRecto'] ? req.files['pieceIdentiteRecto'][0].path : null;
        const pieceIdentiteVersoUrl = req.files['pieceIdentiteVerso'] ? req.files['pieceIdentiteVerso'][0].path : null;
        const photoPasseportUrl = req.files['photoPasseport'] ? req.files['photoPasseport'][0].path : null;
        const photoEnseigneUrl = req.files['photoEnseigne'] ? req.files['photoEnseigne'][0].path : null;

        let parsedOperators = [];
        if (operators) {
            try {
                parsedOperators = JSON.parse(operators);
            } catch (error) {
                return res.status(400).json({ msg: "Le format des opérateurs est invalide." });
            }
        }

        if (!Array.isArray(parsedOperators) || parsedOperators.length === 0) {
            return res.status(400).json({ msg: "Au moins un opérateur est requis." });
        }

        try {
            const newMerchant = new Merchant({
                nom, secteur, typeCommerce, region, ville, commune,
                nomGerant, prenomGerant, dateNaissanceGerant,
                lieuNaissanceGerant, numeroCompteMoov, adresse,
                contact, nif, rc, longitude, latitude,
                pieceIdentite: {
                    type: typePiece,
                    cniRectoUrl: pieceIdentiteRectoUrl,
                    cniVersoUrl: pieceIdentiteVersoUrl,
                    passeportUrl: photoPasseportUrl
                },
                photoEnseigneUrl,
                agentRecruteurId: req.user.id,
                operators: parsedOperators // Assign the array of operators
            });

            const merchant = await newMerchant.save();

            const agent = await Agent.findById(req.user.id);
            if (agent) {
                agent.performance.enrôlements += 1;
                await agent.save();
            }

            res.status(201).json(merchant);

        } catch (err) {
            console.error(err.message);
            // Handle unique constraint error for operators
            if (err.code === 11000) {
                return res.status(400).json({ msg: "Un opérateur avec ce NNI ou téléphone existe déjà." });
            }
            res.status(500).send('Erreur du serveur.');
        }
    }
);


router.get(
    '/export',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            let filter = { statut: 'validé' };

            if (startDate) {
                filter.validatedAt = { ...filter.validatedAt, $gte: new Date(startDate) };
            }
            if (endDate) {
                filter.validatedAt = { ...filter.validatedAt, $lte: new Date(endDate) };
            }

            const merchants = await Merchant.find(filter).lean();
            if (!merchants || merchants.length === 0) {
                return res.status(404).json({ msg: 'Aucun marchand validé à exporter.' });
            }

            const headers = [
                'ShortCode', 'OrganizationName', 'Country', 'Country Value', 'City', 'City Value',
                'Preferred Notification Channel', 'Preferred Notification Channel Value', 'Notification Receiving MSISDN',
                'Notification Receiving MSISDN Value', 'Preferred Notification Language', 'Preferred Notification Language Value',
                'Commercial Register', 'Commercial Register Value', 'NIF', 'NIF Value', 'Organization Type',
                'Organization Type Value', 'Contact Type', 'Contact Type Value', 'Contact First Name', 'Contact First Name Value',
                'Contact Second Name', 'Contact Second Name Value', 'Product', 'ChargeProfile', 'Purpose of the company ',
                'Purpose of the company Value'
            ];

            const exportData = merchants.map(m => ({
                'ShortCode': m.shortCode || '',
                'OrganizationName': m.nom || '',
                'Country': '[Address Details][Country]',
                'Country Value': 'MRT',
                'City': '[Address Details][City]',
                'City Value': m.ville || '',
                'Preferred Notification Channel': '[Contact Details][Preferred Notification Channel]',
                'Preferred Notification Channel Value': '1001',
                'Notification Receiving MSISDN': '[Contact Details][Notification Receiving MSISDN]',
                'Notification Receiving MSISDN Value': m.contact || '',
                'Preferred Notification Language': '[Contact Details][Preferred Notification Language]',
                'Preferred Notification Language Value': 'fr',
                'Commercial Register': '[Corporate Information][Commercial Register]',
                'Commercial Register Value': m.rc || '',
                'NIF': '[Corporate Information][NIF]',
                'NIF Value': m.nif || '',
                'Organization Type': '[Organization Type][Organization Type]',
                'Organization Type Value': 'MERCHANT',
                'Contact Type': '[Organization Contact Details][Contact Type]',
                'Contact Type Value': '02',
                'Contact First Name': '[Organization Contact Details][Contact First Name]',
                'Contact First Name Value': m.prenomGerant || '',
                'Contact Second Name': '[Organization Contact Details][Contact Second Name]',
                'Contact Second Name Value': m.nomGerant || "",
                'Product': '45071',
                'ChargeProfile': '55055',
                'Purpose of the company ': '[Corporate Information][Purpose of the company]',
                'Purpose of the company Value': '01'
            }));

            const XLSX = require('xlsx');
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(exportData, { header: headers });
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Marchands');

            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Disposition', 'attachment; filename="merchants_export.xlsx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);

        } catch (error) {
            console.error('Erreur export marchands:', error);
            res.status(500).json({ msg: 'Erreur lors de l’export des marchands.' });
        }
    }
);


// @route   GET /api/merchants/all
// @desc    Obtenir la liste des marchands (filtrée pour l'admin)
// @access  Private (Admin)
router.get(
    '/all',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const { statut, search } = req.query;

            // L'admin ne doit voir que les marchands qui ont passé l'étape superviseur.
            const filter = {
                statut: { $in: ['validé_par_superviseur', 'validé'] }
            };

            // Si un statut est passé en query par l'admin, on s'assure qu'il est autorisé
            if (statut) {
                if (filter.statut.$in.includes(statut)) {
                    filter.statut = statut;
                } else {
                    // Si le statut demandé n'est pas autorisé pour un admin,
                    // on retourne un tableau vide pour ne pas exposer d'autres données.
                    return res.json([]);
                }
            }
            
            if (search) {
                filter.$or = [
                    { nom: { $regex: search, $options: 'i' } },
                    { nomGerant: { $regex: search, $options: 'i' } },
                    { contact: { $regex: search, $options: 'i' } },
                ];
            }

            const merchants = await Merchant.find(filter)
                .populate('agentRecruteurId', 'matricule')
                .select('-documents');

            res.json(merchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

// Route pour obtenir les statistiques du tableau de bord
router.get(
    '/dashboard-stats',
    [authMiddleware, roleMiddleware(['superviseur', 'admin'])],
    async (req, res) => {
        try {
            let stats;
            let responsePayload = {};

            const formattedStats = {
                'en attente': 0,
                'validé_par_superviseur': 0,
                'validé': 0,
                'rejeté': 0,
            };

            if (req.user.role === 'admin') {
                // Pour l'admin, agréger sur tous les marchands
                stats = await Merchant.aggregate([
                    { $group: { _id: '$statut', count: { $sum: 1 } } }
                ]);
                
                stats.forEach(s => {
                    if (formattedStats.hasOwnProperty(s._id)) {
                        formattedStats[s._id] = s.count;
                    }
                });

                const totalMerchants = await Merchant.countDocuments();
                const totalAgents = await Agent.countDocuments();
                
                responsePayload = {
                    stats: {
                        ...formattedStats,
                        total: totalMerchants,
                    },
                    totalAgents: totalAgents
                };

            } else { // Pour le superviseur
                const myAgents = await Agent.find({ superviseurId: req.user.id });
                const agentIds = myAgents.map(agent => agent._id);

                stats = await Merchant.aggregate([
                    { $match: { agentRecruteurId: { $in: agentIds } } },
                    { $group: { _id: '$statut', count: { $sum: 1 } } }
                ]);

                stats.forEach(s => {
                    if (formattedStats.hasOwnProperty(s._id)) {
                        formattedStats[s._id] = s.count;
                    }
                });

                const pendingMerchants = await Merchant.find({
                    statut: 'en attente',
                    agentRecruteurId: { $in: agentIds }
                }).select('-__v');

                responsePayload = {
                    stats: formattedStats,
                    pendingMerchants: pendingMerchants
                };
            }

            res.json(responsePayload);

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);

// --- MODIFIED VALIDATION WORKFLOW ROUTES ---

// @route   POST /api/merchants/supervisor-validate/:id
// @desc    Pre-validate a merchant (supervisor)
// @access  Private (Superviseur)
router.post(
    '/supervisor-validate/:id',
    [authMiddleware, roleMiddleware(['superviseur'])],
    async (req, res) => {
        try {
            const merchant = await Merchant.findById(req.params.id);
            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }
            if (merchant.statut !== 'en attente') {
                return res.status(400).json({ msg: `Le marchand n'est pas en attente de validation. Statut actuel: ${merchant.statut}` });
            }
            
            const agent = await Agent.findById(merchant.agentRecruteurId);
            if (!agent || !agent.superviseurId || agent.superviseurId.toString() !== req.user.id) {
                return res.status(403).json({ msg: 'Action non autorisée. Vous ne pouvez valider que les marchands de vos agents.' });
            }

            // Mise à jour des champs de validation
            merchant.statut = 'validé_par_superviseur';
            merchant.validatedBySupervisor = req.user.id; // ID du superviseur
            merchant.validatedBySupervisorAt = Date.now(); // Date de validation
            merchant.rejectionReason = ''; // Clear previous rejection reasons

            await merchant.save();
            res.json({ msg: 'Marchand pré-validé avec succès.', merchant });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

// @route   POST /api/merchants/admin-validate/:id
// @desc    Finally validate a merchant (admin)
// @access  Private (Admin)
router.post(
    '/admin-validate/:id',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const merchant = await Merchant.findById(req.params.id);
            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }
            if (merchant.statut !== 'validé_par_superviseur') {
                return res.status(400).json({ msg: 'Le marchand n est pas en attente de validation finale.' });
            }

            const lastMerchant = await Merchant.findOne({ shortCode: { $exists: true } }).sort({ shortCode: -1 });
            let newShortCode = "003000";
            if (lastMerchant && lastMerchant.shortCode) {
                const incremented = (parseInt(lastMerchant.shortCode, 10) + 1).toString().padStart(6, '0');
                newShortCode = incremented;
            }

            // Mise à jour du statut sans écraser les données du superviseur
            merchant.shortCode = newShortCode;
            merchant.statut = 'validé';
            merchant.validatedAt = Date.now();
            merchant.rejectionReason = '';

            merchant.operators.forEach(operator => {
                operator.shortCode = newShortCode;
            });

            await merchant.save();

            if (merchant.agentRecruteurId) {
                await Agent.findByIdAndUpdate(merchant.agentRecruteurId, { $inc: { 'performance.validations': 1 } });
            }

            res.json({ msg: 'Marchand validé avec succès.', merchant });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

// --- NEW SUPERVISOR PERFORMANCE ROUTE ---

// @route   GET /api/supervisors/performance
// @desc    Get a list of all supervisors with their validation counts
// @access  Private (Admin)
router.get(
    '/supervisors/performance',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const performanceData = await Merchant.aggregate([
                {
                    $match: {
                        validatedBySupervisor: { $exists: true, $ne: null }
                    }
                },
                {
                    $group: {
                        _id: '$validatedBySupervisor',
                        validationCount: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'agents', // La collection des agents/superviseurs
                        localField: '_id',
                        foreignField: '_id',
                        as: 'supervisorDetails'
                    }
                },
                {
                    $unwind: '$supervisorDetails'
                },
                {
                    $project: {
                        _id: 0,
                        supervisorId: '$_id',
                        supervisorName: '$supervisorDetails.nom', // ou le champ approprié comme 'username'
                        supervisorMatricule: '$supervisorDetails.matricule',
                        validationCount: 1
                    }
                },
                {
                    $sort: {
                        validationCount: -1
                    }
                }
            ]);

            res.json(performanceData);

        } catch (err) {
            console.error("Erreur lors de la récupération de la performance des superviseurs:", err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);


// @route   POST /api/merchants/admin-reject/:id
// @desc    Reject a pre-validated merchant (admin)
// @access  Private (Admin)
router.post(
    '/admin-reject/:id',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const { rejectionReason } = req.body;
            if (!rejectionReason) {
                return res.status(400).json({ msg: 'La raison du rejet est requise.' });
            }

            const merchant = await Merchant.findById(req.params.id);
            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }
            if (merchant.statut !== 'validé_par_superviseur') {
                return res.status(400).json({ msg: 'Ce marchand n est pas en attente de validation finale.' });
            }

            merchant.statut = 'en attente';
            merchant.rejectionReason = `Rejeté par l admin: ${rejectionReason}`;
            await merchant.save();

            res.json({ msg: 'Marchand renvoyé au superviseur pour correction.', merchant });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

// @route   POST /api/merchants/reject/:id
// @desc    Reject a pending merchant (supervisor)
// @access  Private (Superviseur)
router.post(
    '/reject/:id',
    [authMiddleware, roleMiddleware(['superviseur'])],
    async (req, res) => {
        const { rejectionReason } = req.body;
        if (!rejectionReason) {
            return res.status(400).json({ msg: 'La raison du rejet est requise.' });
        }

        try {
            const merchant = await Merchant.findById(req.params.id);
            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }
            if (merchant.statut !== 'en attente') {
                return res.status(400).json({ msg: 'Ce marchand ne peut pas être rejeté à cette étape.' });
            }

            const agent = await Agent.findById(merchant.agentRecruteurId);
            if (!agent || !agent.superviseurId || agent.superviseurId.toString() !== req.user.id) {
                return res.status(403).json({ msg: 'Action non autorisée.' });
            }

            merchant.statut = 'rejeté';
            merchant.rejectionReason = `Rejeté par le superviseur: ${rejectionReason}`;
            await merchant.save();
            
            res.json({ msg: 'Marchand rejeté avec succès', merchant });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

// --- QUEUE AND LISTING ROUTES ---

// @route   GET /api/merchants/pending
// @desc    Get pending merchants for the logged-in supervisor
// @access  Private (Superviseur)
router.get(
    '/pending',
    [authMiddleware, roleMiddleware(['superviseur'])],
    async (req, res) => {
        try {
            const myAgents = await Agent.find({ superviseurId: req.user.id }).select('_id');
            const agentIds = myAgents.map(agent => agent._id);

            const pendingMerchants = await Merchant.find({
                statut: 'en attente',
                agentRecruteurId: { $in: agentIds }
            }).populate('agentRecruteurId', 'matricule').select('-__v');
            res.json(pendingMerchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);

// @route   GET /api/merchants/pending-admin-validation
// @desc    Get merchants awaiting final admin validation
// @access  Private (Admin)
router.get(
    '/pending-admin-validation',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const merchants = await Merchant.find({ statut: 'validé_par_superviseur' })
                .populate('agentRecruteurId', 'matricule nom');
            res.json(merchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

// @route   GET /api/merchants/by-agent/:agentId
// @desc    Get merchants for a specific agent
// @access  Private (Superviseur, Admin)
router.get(
    '/by-agent/:agentId',
    [authMiddleware, roleMiddleware(['superviseur', 'admin'])],
    async (req, res) => {
        try {
            const merchants = await Merchant.find({ agentRecruteurId: req.params.agentId }).select('-__v');
            if (merchants.length === 0) {
                return res.status(404).json({ msg: 'Aucun marchand trouvé pour cet agent.' });
            }
            res.json(merchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);

// @route   GET /api/merchants/my-merchants
// @desc    Get merchants for the logged-in agent
// @access  Private (Agent)
router.get(
    '/my-merchants',
    [authMiddleware, roleMiddleware(['agent'])],
    async (req, res) => {
        try {
            const merchants = await Merchant.find({ agentRecruteurId: req.user.id }).select('-__v');
            if (merchants.length === 0) {
                return res.status(404).json({ msg: 'Aucun marchand trouvé pour cet agent.' });
            }
            res.json(merchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);

// @route   GET /api/merchants/superviseur-merchants
// @desc    Get merchants for all agents of a supervisor
// @access  Private (Superviseur)
router.get(
    '/superviseur-merchants',
    [authMiddleware, roleMiddleware(['superviseur'])],
    async (req, res) => {
        try {
            const superviseurId = req.user.id;
            const agents = await Agent.find({ superviseurId: superviseurId });
            const agentIds = agents.map(agent => agent._id);

            const { statut, search } = req.query;
            const filter = { agentRecruteurId: { $in: agentIds } };

            if (statut && statut !== 'Tous') {
                filter.statut = statut;
            }
            if (search) {
                const searchRegex = new RegExp(search, 'i');
                filter.$or = [
                    { nom: searchRegex },
                    { nomGerant: searchRegex },
                    { contact: searchRegex },
                ];
            }

            const merchants = await Merchant.find(filter).populate('agentRecruteurId', 'nom matricule');
            res.json(merchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);
// @route   GET /api/merchants/export-operators
// @desc    Exporter tous les opérateurs au format Excel
// @access  Private (Admin)
router.get(
    '/export-operators',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            let filter = {
                statut: 'validé',
                "operators.0": { "$exists": true }
            };

            if (startDate) {
                filter.validatedAt = { ...filter.validatedAt, $gte: new Date(startDate) };
            }
            if (endDate) {
                filter.validatedAt = { ...filter.validatedAt, $lte: new Date(endDate) };
            }

            const merchants = await Merchant.find(filter).lean();

            if (!merchants || merchants.length === 0) {
                return res.status(404).json({ msg: 'Aucun opérateur à exporter.' });
            }

            const exportData = [];
            const headers = [
                'Notification Language', 'Organization ShortCode', 'AuthenticationType', 'UserName', 'OperatorID',
                'MSISDN', 'First Name', 'First Name Value', 'Middle Name', 'Middle Name Value', 'Last name',
                'Last name Value', 'Date of Birth', 'Date of Birth Value', 'id1 type', 'id1 type value',
                'ID 1 Number', 'ID 1 Number Value', 'Preferred Notification Channel', 'Preferred Notification Channel Value',
                'Notification Receiving MSISDN', 'Notification Receiving MSISDN Value', 'Preferred Notification Language',
                'Preferred Notification Language Value', 'Role ID'
            ];

            merchants.forEach(merchant => {
                if (merchant.operators && merchant.operators.length > 0) {
                    merchant.operators.forEach(op => {
                        exportData.push({
                            'Notification Language': 'fr',
                            'Organization ShortCode': merchant.shortCode || '',
                            'AuthenticationType': 'HANDSET',
                            'UserName': '',
                            'OperatorID': op.telephone || '' ,
                            'MSISDN': op.telephone || '',
                            'First Name': '[Personal Details][First Name]',
                            'First Name Value': op.prenom || '',
                            'Middle Name': '[Personal Details][Middle Name]',
                            'Middle Name Value': '',
                            'Last name': '[Personal Details][Last Name]',
                            'Last name Value': op.nom || '',
                            'Date of Birth': '[Personal Details][Date of Birth]',
                            'Date of Birth Value': '',
                            'id1 type': '[ID Details][ID Type]',
                            'id1 type value': '01',
                            'ID 1 Number': '[ID Details][ID Number]',
                            'ID 1 Number Value': op.nni || '',
                            'Preferred Notification Channel': '[Contact Details][Preferred Notification Channel]',
                            'Preferred Notification Channel Value': '1001',
                            'Notification Receiving MSISDN': '[Contact Details][Notification Receiving MSISDN]',
                            'Notification Receiving MSISDN Value': op.telephone ? `222${op.telephone}` : '',
                            'Preferred Notification Language': '[Contact Details][Preferred Notification Language]',
                            'Preferred Notification Language Value': 'fr',
                            'Role ID': '500000000000011509'
                        });
                    });
                }
            });

            if (exportData.length === 0) {
                return res.status(404).json({ msg: 'Aucun opérateur à exporter.' });
            }

            const workbook = xlsx.utils.book_new();
            const worksheet = xlsx.utils.json_to_sheet(exportData, { header: headers });

            xlsx.utils.book_append_sheet(workbook, worksheet, 'Operateurs');

            const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Disposition', 'attachment; filename="operateurs_export.xlsx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);

        } catch (error) {
            console.error('Erreur export opérateurs:', error);
            res.status(500).json({ msg: 'Erreur lors de l’export des opérateurs.' });
        }
    }
);


// @route   GET /api/merchants/:id
// @desc    Get a single merchant's details
// @access  Private
router.get(
    '/:id',
    authMiddleware,
    async (req, res) => {
        try {
            const merchant = await Merchant.findById(req.params.id).select('-__v');
            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }
            res.json(merchant);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);


module.exports = router;