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
// (Assurez-vous que cette configuration est dans server.js ou que les variables sont bien chargées)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: (req, file) => {
        let folderName = 'enrolement_marchand';
        let public_id;
        
        // Détermine l'ID public en fonction du fichier
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
        // Déstructure toutes les données du corps de la requête, y compris les nouvelles informations de l'opérateur
        const {
            nom, secteur, typeCommerce, region, ville, commune,
            nomGerant, prenomGerant, dateNaissanceGerant,
            lieuNaissanceGerant, numeroCompteMoov, adresse,
            contact, nif, rc, typePiece, longitude, latitude,
            nomOperateur, codeOperateur // 👈 Nouveaux champs pour l'opérateur
        } = req.body;

        // Récupère les URL des images depuis l'objet req.files
        const pieceIdentiteRectoUrl = req.files['pieceIdentiteRecto'] ? req.files['pieceIdentiteRecto'][0].path : null;
        const pieceIdentiteVersoUrl = req.files['pieceIdentiteVerso'] ? req.files['pieceIdentiteVerso'][0].path : null;
        const photoPasseportUrl = req.files['photoPasseport'] ? req.files['photoPasseport'][0].path : null;
        const photoEnseigneUrl = req.files['photoEnseigne'] ? req.files['photoEnseigne'][0].path : null;

        // Valide la présence des données de l'opérateur, qui sont maintenant requises
        if (!nomOperateur || !codeOperateur) {
            return res.status(400).json({ msg: "Les informations de l'opérateur sont requises." });
        }

        try {
            // Créer un objet pour le premier opérateur
            const newOperator = { nom: nomOperateur, code: codeOperateur };

            // Créer un nouvel objet marchand avec les données du formulaire et le premier opérateur
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
                operators: [newOperator] // 👈 Ajoute l'opérateur au tableau
            });

            // Sauvegarder le nouveau marchand dans la base de données
            const merchant = await newMerchant.save();

            // Mettre à jour la performance de l'agent recruteur
            const agent = await Agent.findById(req.user.id);
            if (agent) {
                agent.performance.enrôlements += 1;
                await agent.save();
            }

            // Répondre avec l'objet marchand nouvellement créé
            res.status(201).json(merchant);

        } catch (err) {
            console.error(err.message);
            // Gérer les erreurs de la base de données (doublons, etc.)
            res.status(500).send('Erreur du serveur.');
        }
    }
);


router.get(
    '/export',
    [authMiddleware, roleMiddleware(['admin', 'superviseur'])],
    async (req, res) => {
        try {
            // Récupérer uniquement les marchands validés
            const merchants = await Merchant.find({ statut: 'validé' }).lean();
            if (!merchants || merchants.length === 0) {
                return res.status(404).json({ msg: 'Aucun marchand validé à exporter.' });
            }

            // Colonnes du template (ordre exact)
            const headers = [
                'ShortCode',
                'OrganizationName',
                'Country',
                'Country Value',
                'City',
                'City Value',
                'Preferred Notification Channel',
                'Preferred Notification Channel Value',
                'Notification Receiving MSISDN',
                'Notification Receiving MSISDN Value',
                'Preferred Notification Language',
                'Preferred Notification Language Value',
                'Commercial Register',
                'Commercial Register Value',
                'NIF',
                'NIF Value',
                'Organization Type',
                'Organization Type Value',
                'Contact Type',
                'Contact Type Value',
                'Contact First Name',
                'Contact First Name Value',
                'Contact Second Name',
                'Contact Second Name Value',
                'Product',
                'ChargeProfile',
                'Purpose of the company ',
                'Purpose of the company Value'
            ];

            // Construire les données pour l'export
            const exportData = merchants.map(m => ({
                'ShortCode': m.shortCode || '',
                'OrganizationName': m.nom || '',
                'Country': '[Address Details][Country]', // FIXE
                'Country Value': 'MRT', // FIXE
                'City': '[Address Details][City]', // FIXE
                'City Value': m.ville || '',
                'Preferred Notification Channel': '[Contact Details][Preferred Notification Channel]', // FIXE
                'Preferred Notification Channel Value': '1001',
                'Notification Receiving MSISDN': '[Contact Details][Notification Receiving MSISDN]', // FIXE
                'Notification Receiving MSISDN Value': m.contact || '',
                'Preferred Notification Language': '[Contact Details][Preferred Notification Language]', // FIXE
                'Preferred Notification Language Value': 'fr',
                'Commercial Register': '[Corporate Information][Commercial Register]', // FIXE
                'Commercial Register Value': m.rc || '',
                'NIF': '[Corporate Information][NIF]', // FIXE
                'NIF Value': m.nif || '',
                'Organization Type': '[Organization Type][Organization Type]', // FIXE
                'Organization Type Value': 'MERCHANT',
                'Contact Type': '[Organization Contact Details][Contact Type]', // FIXE
                'Contact Type Value': '02',
                'Contact First Name': '[Organization Contact Details][Contact First Name]', // FIXE
                'Contact First Name Value': m.prenomGerant || '',
                'Contact Second Name': '[Organization Contact Details][Contact Second Name]', // FIXE
                'Contact Second Name Value': m.nomGerant || "",
                'Product': '45071',
                'ChargeProfile': '55055',
                'Purpose of the company ': '[Corporate Information][Purpose of the company]', // FIXE
                'Purpose of the company Value': '01'
            }));

            // Création du fichier Excel
            const XLSX = require('xlsx');
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(exportData, { header: headers });
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Marchands');

            // Envoi du fichier au client
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
// @desc    Obtenir la liste de tous les marchands, tous statuts confondus
// @access  Private (Admin)
router.get(
    '/all',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const { statut, search } = req.query;

            // Construction du filtre
            const filter = {};
            if (statut) {
                filter.statut = statut;
            }
            if (search) {
                // Recherche sur nom, nomGerant ou contact (insensible à la casse)
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

router.get(
    '/all',
    authMiddleware,
    roleMiddleware(['superviseur','admin']),
    async (req, res) => {
        try {
            // 1. Trouver les agents de ce superviseur
            const myAgents = await Agent.find({ superviseurId: req.user.id });
            const agentIds = myAgents.map(agent => agent._id);

            // 2. Construire la requête pour les marchands
            const { statut, search } = req.query;
            let query = {
                agentRecruteurId: { $in: agentIds } // Filtre par les agents du superviseur
            };

            // ... (votre logique de filtre par statut et de recherche existante) ...

            const allMerchants = await Merchant.find(query).sort({ createdAt: -1 });
            res.json(allMerchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
// Route pour obtenir les statistiques du tableau de bord du superviseur
router.get(
    '/dashboard-stats',
    authMiddleware,
    roleMiddleware(['superviseur', 'admin']),
    async (req, res) => {
        try {
            // 1. Trouver les agents de ce superviseur
            const myAgents = await Agent.find({ superviseurId: req.user.id });
            const agentIds = myAgents.map(agent => agent._id);

            // 2. Agréger les statistiques pour les marchands de ces agents
            const stats = await Merchant.aggregate([
                { $match: { agentRecruteurId: { $in: agentIds } } }, // <-- Filtre ajouté
                { $group: { _id: '$statut', count: { $sum: 1 } } }
            ]);

            const formattedStats = {
                'en attente': 0,
                'validé': 0,
                'rejeté': 0,
            };
            stats.forEach(s => {
                formattedStats[s._id] = s.count;
            });

            // 3. Récupérer la liste des marchands en attente pour le tableau
            const pendingMerchants = await Merchant.find({
                statut: 'en attente',
                agentRecruteurId: { $in: agentIds } // <-- Filtre ajouté
            }).select('-__v');

            res.json({
                stats: formattedStats,
                pendingMerchants: pendingMerchants
            });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);
router.post(
    '/validate/:id',
    authMiddleware,
    roleMiddleware(['admin', 'superviseur']),
    async (req, res) => {
        try {
            const merchant = await Merchant.findById(req.params.id);

            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }
            if (merchant.statut === 'validé') {
                return res.status(400).json({ msg: 'Ce marchand est déjà validé.' });
            }

            const lastMerchant = await Merchant.findOne({ shortCode: { $exists: true } })
                .sort({ shortCode: -1 });

            let newShortCode = 3000;
            if (lastMerchant && lastMerchant.shortCode) {
                newShortCode = lastMerchant.shortCode + 1;
            }

            // Attribuer le shortCode au marchand
            merchant.shortCode = newShortCode;
            merchant.statut = 'validé';
            merchant.validatedAt = Date.now();
            
            // 👈 PROPAAGATION DU SHORT CODE AUX OPÉRATEURS
            merchant.operators.forEach(operator => {
                operator.shortCode = newShortCode;
            });

            await merchant.save();

            if (merchant.agentRecruteurId) {
                const agent = await Agent.findById(merchant.agentRecruteurId);
                if (agent) {
                    agent.performance.validations += 1;
                    await agent.save();
                }
            }

            res.json({ msg: 'Marchand validé avec succès.', merchant });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);



// Route pour rejeter un marchand (réservée aux superviseurs)
router.post('/reject/:id', authMiddleware, roleMiddleware(['superviseur','admin']), async (req, res) => {
    
        const merchantId = req.params.id;
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({ msg: 'La raison du rejet est requise.' });
        }

        const updatedMerchant = await Merchant.findByIdAndUpdate(
            merchantId,
            { statut: 'rejeté', rejectionReason },
            { new: true }
        );

        if (!updatedMerchant) {
            return res.status(404).json({ msg: 'Marchand non trouvé.' });
        }

        res.json({ msg: 'Marchand rejeté avec succès', merchant: updatedMerchant });

    
});
//Cette route sera utile pour le superviseur qui veut voir une liste de tous les marchands qui n'ont pas encore été validés, rejetés ou enrôlés.
router.get(
    '/pending',
    authMiddleware,
    roleMiddleware(['superviseur', 'admin']),
    async (req, res) => {
        try {
            const pendingMerchants = await Merchant.find({ statut: 'en attente' }).select('-__v');
            res.json(pendingMerchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);
//Cette route permettra à un superviseur ou à un administrateur de consulter tous les marchands enrôlés par un agent précis, en utilisant l'ID de cet agent.
router.get(
    '/by-agent/:agentId',
    authMiddleware,
    roleMiddleware(['superviseur', 'admin']),
    async (req, res) => {
        try {
            const agentId = req.params.agentId;
            const merchants = await Merchant.find({ agentRecruteurId: agentId }).select('-__v');

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
//permettra à un agent de voir la liste de tous les marchands qu'il a enrôlés
    router.get(
        '/my-merchants',
        authMiddleware,
        roleMiddleware(['agent']),
        async (req, res) => {
            try {
                const agentId = req.user.id;
                const merchants = await Merchant.find({ agentRecruteurId: agentId }).select('-__v');

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
    router.get(
    '/superviseur-merchants',
    authMiddleware,
    roleMiddleware(['superviseur']),
    async (req, res) => {
        try {
            const superviseurId = req.user.id;

            // 1. Trouver tous les agents qui sont supervisés par cet utilisateur
            const agents = await Agent.find({ superviseurId: superviseurId });
            const agentIds = agents.map(agent => agent._id);

            // 2. Préparer les filtres de la requête
            const { statut, search } = req.query;
            const filter = { agentRecruteurId: { $in: agentIds } };

            if (statut && statut !== 'Tous') {
                filter.statut = statut;
            }
            if (search) {
                // Utilisation d'une expression régulière pour une recherche flexible
                const searchRegex = new RegExp(search, 'i');
                filter.$or = [
                    { nom: searchRegex },
                    { nomGerant: searchRegex },
                    { contact: searchRegex },
                ];
            }

            // 3. Exécuter la requête avec les filtres
            // Peupler le nom de l'agent pour l'affichage
            const merchants = await Merchant.find(filter).populate('agentRecruteurId', 'nom');

            if (merchants.length === 0) {
                return res.status(404).json({ msg: 'Aucun marchand trouvé pour vos agents.' });
            }

            res.json(merchants);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur');
        }
    }
);
//route pour afficher les détails d'un marchand
router.get(
    '/:id',
    authMiddleware,
    async (req, res) => {
        try {
            const merchantId = req.params.id;
            const merchant = await Merchant.findById(merchantId).select('-__v');

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
//-----------------------------------------------------
// ROUTES DYNAMIQUES
//-----------------------------------------------------

// @route   POST /api/merchants/create/:id
// @desc    Créer un marchand (Ajout du short code)
// @access  Privé (Agent de saisie, Superviseur Call Centre)
router.post(
    '/create/:id',
    [authMiddleware, roleMiddleware(['superviseur_call_centre', 'agent_de_saisie'])],
    async (req, res) => {
        try {
            const { shortCode } = req.body;
            if (!shortCode || shortCode.trim() === '') {
                return res.status(400).json({ msg: 'Le short code est requis pour créer un marchand.' });
            }

            const merchant = await Merchant.findById(req.params.id);
            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }

            merchant.shortCode = shortCode;
            merchant.statut = 'créé';
            await merchant.save();

            // Incrémenter le compteur 'created' de l'agent de saisie
            await User.findByIdAndUpdate(merchant.agentSaisieId, {
                $inc: { 'performance_saisie.created': 1 }
            });

            res.json(merchant);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
// @route   GET /api/agents/performance
// @desc    Obtenir le rapport de performance des agents de saisie
// @access  Privé (Superviseur Call Centre, Admin)
router.get(
    '/performance',
    [authMiddleware, roleMiddleware(['superviseur_call_centre', 'admin'])],
    async (req, res) => {
        try {
            const agents = await User.find({ role: 'agent_de_saisie' }).select('matricule performance_saisie');
            res.json(agents);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur serveur.');
        }
    }
);


// @route   POST /api/merchants/reject/:id
// @desc    Rejeter un marchand (Ajout de la raison et incrémentation du compteur)
// @access  Privé (Agent de saisie, Superviseur Call Centre)
router.post(
    '/reject/:id',
    [authMiddleware, roleMiddleware(['superviseur_call_centre', 'agent_de_saisie'])],
    async (req, res) => {
        try {
            const { rejectionReason } = req.body;
            if (!rejectionReason || rejectionReason.trim() === '') {
                return res.status(400).json({ msg: 'Une raison de rejet de création est requise.' });
            }

            const merchant = await Merchant.findById(req.params.id);
            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }

            merchant.rejectionReason = rejectionReason;
            merchant.statut = 'rejeté';
            await merchant.save();

            // Incrémenter le compteur 'rejected' de l'agent de saisie
            await User.findByIdAndUpdate(merchant.agentSaisieId, {
                $inc: { 'performance_saisie.rejected': 1 }
            });

            res.json(merchant);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
//assigner a  un Agent de saise
router.post(
    '/dispatch/:id',
    [authMiddleware, roleMiddleware(['superviseur_call_centre'])],
    async (req, res) => {
        try {
            const { agentSaisieId } = req.body;
            const merchantId = req.params.id;

            // Vérifier que le marchand et l'agent existent
            const merchant = await Merchant.findById(merchantId);
            const agent = await User.findById(agentSaisieId);

            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }
            if (!agent || agent.role !== 'agent_de_saisie') {
                return res.status(404).json({ msg: 'Agent de saisie non valide.' });
            }

            // Assignation de l'agent au marchand
            merchant.agentSaisieId = agentSaisieId;
            await merchant.save();

            res.json({ msg: `Marchand ${merchant.nom} assigné à l'agent ${agent.matricule}.` });

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur lors de l\'assignation.');
        }
    }
);


module.exports = router;