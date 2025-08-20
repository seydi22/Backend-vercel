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
        const {
            nom, secteur, typeCommerce, region, ville, commune,
            nomGerant, prenomGerant, dateNaissanceGerant,
            lieuNaissanceGerant, numeroCompteMoov, adresse,
            contact, nif, rc, typePiece, longitude, latitude
        } = req.body;

        // Récupère les URL des images depuis l'objet req.files
        const pieceIdentiteRectoUrl = req.files['pieceIdentiteRecto'] ? req.files['pieceIdentiteRecto'][0].path : null;
        const pieceIdentiteVersoUrl = req.files['pieceIdentiteVerso'] ? req.files['pieceIdentiteVerso'][0].path : null;
        const photoPasseportUrl = req.files['photoPasseport'] ? req.files['photoPasseport'][0].path : null;
        const photoEnseigneUrl = req.files['photoEnseigne'] ? req.files['photoEnseigne'][0].path : null;

        try {
            // Créer un nouvel objet marchand
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
                agentRecruteurId: req.user.id
            });

            const merchant = await newMerchant.save();

            // Mettre à jour la performance de l'agent recruteur
            const agent = await Agent.findById(req.user.id);
            if (agent) {
                agent.performance.enrôlements += 1;
                await agent.save();
            }

            res.status(201).json(merchant);

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
// Nouvelle route pour la création en masse de marchands
router.post(
    '/bulk-create',
    authMiddleware,
    roleMiddleware(['admin']),
    upload.single('file'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ msg: 'Aucun fichier n\'a été téléchargé.' });
            }

            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const merchantsData = xlsx.utils.sheet_to_json(worksheet);

            const createdMerchants = [];
            const errors = [];

            for (const data of merchantsData) {
                try {
                    // On vérifie si un marchand avec ce contact existe déjà pour éviter les doublons
                    const existingMerchant = await Merchant.findOne({ contact: data.contact });
                    if (existingMerchant) {
                        errors.push({
                            contact: data.contact,
                            error: 'Ce marchand existe déjà.',
                            data: data
                        });
                        continue;
                    }

                    // Mapping des données du fichier vers le schéma du modèle
                    const newMerchant = new Merchant({
                        nom: data.nom_enseigne_commerciale,
                        nomGerant: data.nom_representant_legal,
                        prenomGerant: data.prenom_representant_legal,
                        contact: data.contact,
                        adresse: data.adresse_physique,
                        nif: data.NIF,
                        rc: data.RC,
                        secteur: data.secteur_activite,
                        typeCommerce: data.type_commerce,
                        region: data.region,
                        ville: data.ville,
                        commune: data.commune,
                        // Assurez-vous que les champs latitude et longitude sont correctement formatés dans votre fichier
                        latitude: data.latitude,
                        longitude: data.longitude,
                        // Vous pouvez définir d'autres champs par défaut ici
                        statut: 'validé', // Statut par défaut pour le bulk create
                        agentRecruteurId: req.user.id // L'admin qui a fait l'upload
                    });

                    const savedMerchant = await newMerchant.save();
                    createdMerchants.push(savedMerchant);
                } catch (err) {
                    console.error(`Erreur lors de la création du marchand : ${data.contact}`, err.message);
                    errors.push({
                        contact: data.contact,
                        error: err.message,
                        data: data
                    });
                }
            }

            res.status(200).json({
                msg: `${createdMerchants.length} marchands créés avec succès.`,
                created: createdMerchants,
                errors: errors
            });

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur lors du traitement du fichier.');
        }
    }
);
//template 

// @route   GET /api/merchants/template
// @desc    Télécharger un fichier template Excel pour la création en masse de marchands
// @access  Private (Admin, Superviseur)
router.get(
    '/template',
    [authMiddleware, roleMiddleware(['admin', 'superviseur'])],
    async (req, res) => {
        try {
            // Définir les en-têtes de colonnes exacts comme dans le fichier fourni
            const headers = [
                'nom_enseigne_commerciale',
                'nom_representant_legal',
                'prenom_representant_legal',
                'contact',
                'adresse_physique',
                'NIF',
                'RC',
                'secteur_activite',
                'type_commerce',
                'region',
                'ville',
                'commune',
                'latitude',
                'longitude',
                'short_code'
            ];

            // Créer une feuille de calcul vide
            const ws = xlsx.utils.json_to_sheet([], { header: headers });
            
            // Créer un nouveau classeur
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Merchants');

            // Écrire le fichier en tant que buffer
            const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

            // Définir les en-têtes de réponse pour le téléchargement
            res.setHeader('Content-Disposition', 'attachment; filename="merchant_template.xlsx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            
            // Envoyer le buffer en réponse
            res.send(buf);

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur lors de la génération du fichier.');
        }
    }
);
// route  pour exporter
router.get(
    '/export',
    [authMiddleware, roleMiddleware(['admin', 'superviseur'])],
    async (req, res) => {
        try {
            // 1. Récupérer tous les marchands de la base de données
            const merchants = await Merchant.find().lean(); // Utilisation de .lean() pour un objet JS simple

            if (!merchants || merchants.length === 0) {
                return res.status(404).json({ msg: 'Aucun marchand à exporter.' });
            }

            // 2. Mapper les données au format d'export
            const exportData = merchants.map(merchant => {
                return {
                    'nom_enseigne_commerciale': merchant.nom,
                    'nom_representant_legal': merchant.nomGerant,
                    'prenom_representant_legal': merchant.prenomGerant,
                    'contact': merchant.contact,
                    'adresse_physique': merchant.adresse,
                    'NIF': merchant.nif,
                    'RC': merchant.rc,
                    'secteur_activite': merchant.secteur,
                    'type_commerce': merchant.typeCommerce,
                    'region': merchant.region,
                    'ville': merchant.ville,
                    'commune': merchant.commune,
                    'latitude': merchant.latitude,
                    'longitude': merchant.longitude,
                    'short_code': merchant.shortCode
                };
            });

            // 3. Créer une feuille de calcul avec les données
            const worksheet = xlsx.utils.json_to_sheet(exportData);
            const workbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Marchands');

            // 4. Définir les en-têtes de réponse pour le téléchargement
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader(
                'Content-Disposition',
                'attachment; filename=merchants_export.xlsx'
            );

            // 5. Envoyer le fichier en tant que buffer
            const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.send(buffer);

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur lors de l\'exportation des marchands.');
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
// Route pour valider un marchand (réservée aux superviseurs et admin )
// Correction : Remplacer router.put par router.post
router.post(
    '/validate/:id',
    authMiddleware,
    roleMiddleware(['admin','superviseur']),
    async (req, res) => {
        try {
            const merchant = await Merchant.findById(req.params.id);

            if (!merchant) {
                return res.status(404).json({ msg: 'Marchand non trouvé.' });
            }

            // Mettez à jour le statut du marchand
            merchant.statut = 'validé';
            merchant.validatedAt = Date.now();
            await merchant.save();
            
            // Mettez à jour la performance de l'agent recruteur
            const agent = await Agent.findById(merchant.agentRecruteurId._id);
            if (agent) {
                // Correction : Incrémentation de la propriété 'validations' de l'objet 'performance'
                agent.performance.validations += 1;
                await agent.save();
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