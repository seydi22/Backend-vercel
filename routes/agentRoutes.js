// backend/routes/agentRoutes.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Agent = require('../models/Agent'); // On importe le modèle Agent que l'on a créé
const authMiddleware = require('../middleware/authMiddleware'); // Importe le middleware
const jwt = require('jsonwebtoken'); 
const roleMiddleware = require('../middleware/roleMiddleware'); // Importez le middleware de rôle
const { check, validationResult } = require('express-validator'); // <-- LIGNE À AJOUTER

// Route pour enregistrer un nouvel agent (accessible uniquement par l'admin)
router.post('/register', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    const { matricule, motDePasse, role, affiliation } = req.body;


        // Vérifier si l'agent existe déjà
        let agent = await Agent.findOne({ matricule });
        if (agent) {
            return res.status(400).json({ msg: 'L\'agent existe déjà' });
        }

        // Créer un nouvel agent
        agent = new Agent({
            matricule,
            motDePasse,
            role,
            affiliation
        });

        // Hacher le mot de passe
        const salt = await bcrypt.genSalt(10);
        agent.motDePasse = await bcrypt.hash(motDePasse, salt);

        // Sauvegarder l'agent dans la base de données
        await agent.save();

        res.status(201).json({ msg: 'Agent enregistré avec succès' });

   
});

router.post('/login', async (req, res) => {
    // Utilisez un bloc try...catch pour une meilleure gestion des erreurs
    try {
        const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Agent = require('../models/Agent'); // On importe le modèle Agent que l'on a créé
const authMiddleware = require('../middleware/authMiddleware'); // Importe le middleware
const jwt = require('jsonwebtoken'); 
const roleMiddleware = require('../middleware/roleMiddleware'); // Importez le middleware de rôle
const { check, validationResult } = require('express-validator'); // <-- LIGNE À AJOUTER

// Route pour enregistrer un nouvel agent (accessible uniquement par l'admin)
router.post('/register', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    const { matricule, motDePasse, role, affiliation } = req.body;


        // Vérifier si l'agent existe déjà
        let agent = await Agent.findOne({ matricule });
        if (agent) {
            return res.status(400).json({ msg: 'L\'agent existe déjà' });
        }

        // Créer un nouvel agent
        agent = new Agent({
            matricule,
            motDePasse,
            role,
            affiliation
        });

        // Hacher le mot de passe
        const salt = await bcrypt.genSalt(10);
        agent.motDePasse = await bcrypt.hash(motDePasse, salt);

        // Sauvegarder l'agent dans la base de données
        await agent.save();

        res.status(201).json({ msg: 'Agent enregistré avec succès' });

   
});

router.post('/login', async (req, res) => {
    // Utilisez un bloc try...catch pour une meilleure gestion des erreurs
    try {
        const { matricule, motDePasse } = req.body;

        console.log('>>> Vercel Debug: Attempting Agent.findOne() for matricule:', matricule, 'Connection state:', mongoose.connection.readyState);
        // 1. Sélectionner explicitement le mot de passe pour la vérification
        const agent = await Agent.findOne({ matricule }).select('+motDePasse');

        // 2. Vérifier si l'agent existe et si le mot de passe est correct
        if (!agent || !(await agent.matchPassword(motDePasse))) {
            return res.status(401).json({ msg: 'Identifiants invalides.' });
        }

        // 3. Créer la "payload" et le token
        const payload = {
            user: {
                id: agent.id,
                role: agent.role,
                affiliation: agent.affiliation
            }
        };

        // 4. Générer le token JWT
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ msg: 'Erreur du serveur.' });
                }
                // Optionnel: renvoyer un objet agent sans mot de passe
                const agentSansMdp = {
                    id: agent.id,
                    matricule: agent.matricule,
                    role: agent.role,
                    affiliation: agent.affiliation,
                    // ... autres champs
                };
                res.json({ token, agent: agentSansMdp });
            }
        );

    } catch (err) {
        // Gérer les erreurs inattendues
        console.error(err.message);
        res.status(500).send('Erreur du serveur.');
    }
});
// Route pour obtenir la performance de tous les agents (réservée aux superviseurs et admins)
router.get(
    '/performance',
    authMiddleware,
    roleMiddleware(['superviseur', 'admin',]),
    async (req, res) => {
        
            // Sélectionne uniquement les champs matricule, role et performance
            const agentsPerformance = await Agent.find().select('matricule role performance');
            res.json(agentsPerformance);
      
    }
);
router.get(
    '/my-performance', // <-- Nouveau nom de route plus spécifique pour éviter les conflits
    authMiddleware,
    // Note : Le rôle 'agent' est suffisant car la requête concerne l'agent lui-même.
    roleMiddleware(['agent', 'superviseur', 'admin']), 
    async (req, res) => {
        try {
            // Utiliser req.user.id pour trouver la performance de l'agent connecté
            const agent = await Agent.findById(req.user.id).select('matricule role performance');

            if (!agent) {
                return res.status(404).json({ msg: 'Agent non trouvé.' });
            }

            res.json(agent.performance); // Ne renvoie que l'objet de performance
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
// backend/routes/agentRoutes.js

// ... (vos importations et configurations existantes) ...

// @route   GET /api/agents/all-performance
// @desc    Obtenir les statistiques de performance de tous les agents pour un superviseur
// @access  Private (Superviseur, Admin)
router.get(
    '/all-performance',
    authMiddleware,
    roleMiddleware(['superviseur']), // Accès uniquement aux superviseurs
    async (req, res) => {
        try {
            // Filtrer les agents par leur superviseurId
            const agentsPerformance = await Agent.find({ superviseurId: req.user.id }).select('matricule role performance');

            if (!agentsPerformance) {
                return res.status(404).json({ msg: 'Aucun agent trouvé sous votre supervision.' });
            }

            res.json(agentsPerformance);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
// --- NOUVELLES ROUTES POUR LE CRUD DES AGENTS ---

router.post(
    '/',
    [
        authMiddleware,
        roleMiddleware(['superviseur', 'admin']),
        check('matricule', 'Le matricule est requis').not().isEmpty(),
        check('motDePasse', 'Le mot de passe doit contenir au moins 6 caractères').isLength({ min: 6 })
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { matricule, motDePasse, affiliation, role } = req.body;
        
        try {
            let agent = await Agent.findOne({ matricule });
            if (agent) {
                return res.status(400).json({ msg: 'L\'agent existe déjà.' });
            }

            let superviseurId = null;
            if (req.user.role === 'superviseur') {
                superviseurId = req.user.id;
            }
            else if (req.user.role === 'admin' && req.body.superviseurId) {
                superviseurId = req.body.superviseurId;
            }
            
            agent = new Agent({
                matricule,
                motDePasse, // Utilisation de motDePasse
                affiliation, // Utilisation de affiliation
                role: role || 'agent',
                superviseurId
            });

            const salt = await bcrypt.genSalt(10);
            agent.motDePasse = await bcrypt.hash(motDePasse, salt);

            await agent.save();
            res.json({ msg: 'Agent créé avec succès', agent });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);


// @route   PUT /api/agents/:id
// @desc    Modifier un agent (uniquement par superviseur/admin)
// @access  Private
router.put(
    '/:id',
    [
        authMiddleware,
        roleMiddleware(['superviseur', 'admin'])
    ],
    async (req, res) => {
        const { motDePasse, role } = req.body;
        const agentId = req.params.id;
        
        try {
            let agent = await Agent.findById(agentId);
            if (!agent) {
                return res.status(404).json({ msg: 'Agent non trouvé.' });
            }

            // --- NOUVELLE VÉRIFICATION DE SÉCURITÉ ---
            // Un superviseur ne peut pas changer le rôle d'un agent en 'superviseur' ou 'admin'.
            if (req.user.role === 'superviseur' && (role === 'superviseur' || role === 'admin')) {
                return res.status(403).json({ msg: 'Accès refusé : vous ne pouvez pas promouvoir un agent au rang de superviseur ou d\'administrateur.' });
            }

            if (role) agent.role = role;
            if (motDePasse) {
                const salt = await bcrypt.genSalt(10);
                agent.motDePasse = await bcrypt.hash(motDePasse, salt);
            }
            
            await agent.save();
            res.json({ msg: 'Agent mis à jour avec succès', agent });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
router.get(
    '/all-supervisors',
    [authMiddleware, roleMiddleware(['admin','superviseur'])],
    async (req, res) => {
        try {
            const supervisors = await Agent.find({ role: 'superviseur' }).select('-motDePasse');
            res.json(supervisors);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

// @route   GET /api/agents/all-agents
// @desc    Obtenir la liste de tous les agents
// @access  Private (Admin)
router.get(
    '/all-agents',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const agents = await Agent.find({ role: 'agent' }).populate('superviseurId', 'matricule').select('-motDePasse');
            res.json(agents);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
router.post(
    '/create-saisie-agent',
    [authMiddleware, roleMiddleware(['superviseur_call_centre'])],
    async (req, res) => {
        const { matricule, password } = req.body;
        try {
            let user = await User.findOne({ matricule });
            if (user) {
                return res.status(400).json({ msg: 'Matricule déjà utilisé.' });
            }
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = new User({
                matricule,
                password: hashedPassword,
                role: 'agent_de_saisie'
            });
            await user.save();
            res.status(201).json({ msg: 'Agent de saisie créé avec succès.' });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur serveur.');
        }
    }
);



// @route   DELETE /api/agents/:id
// @desc    Supprimer un agent (uniquement par superviseur/admin)
// @access  Private
router.delete(
    '/:id',
    [authMiddleware, roleMiddleware(['superviseur', 'admin'])],
    async (req, res) => {
        try {
            const agent = await Agent.findById(req.params.id);

            if (!agent) {
                return res.status(404).json({ msg: 'Agent non trouvé.' });
            }

            // Vérifier que le superviseur ne peut pas se supprimer
            if (agent._id.toString() === req.user.id) {
                return res.status(401).json({ msg: 'Vous ne pouvez pas supprimer votre propre compte.' });
            }

            // Le superviseur ne peut supprimer que ses propres agents
            if (req.user.role === 'superviseur' && agent.superviseurId.toString() !== req.user.id) {
                 return res.status(401).json({ msg: 'Non autorisé à supprimer cet agent.' });
            }
            
            await agent.deleteOne();
            res.json({ msg: 'Agent supprimé avec succès.' });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

module.exports = router;

// Route protégée pour récupérer les informations de l'agent connecté
router.get('/me', authMiddleware, async (req, res) => {
    
        // req.user contient l'objet décodé par le middleware
        const agent = await Agent.findById(req.user.id).select('-motDePasse');
        res.json(agent);
    
});



module.exports = router;

        // 2. Vérifier si l'agent existe et si le mot de passe est correct
        if (!agent || !(await agent.matchPassword(motDePasse))) {
            return res.status(401).json({ msg: 'Identifiants invalides.' });
        }

        // 3. Créer la "payload" et le token
        const payload = {
            user: {
                id: agent.id,
                role: agent.role,
                affiliation: agent.affiliation
            }
        };

        // 4. Générer le token JWT
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ msg: 'Erreur du serveur.' });
                }
                // Optionnel: renvoyer un objet agent sans mot de passe
                const agentSansMdp = {
                    id: agent.id,
                    matricule: agent.matricule,
                    role: agent.role,
                    affiliation: agent.affiliation,
                    // ... autres champs
                };
                res.json({ token, agent: agentSansMdp });
            }
        );

    } catch (err) {
        // Gérer les erreurs inattendues
        console.error(err.message);
        res.status(500).send('Erreur du serveur.');
    }
});
// Route pour obtenir la performance de tous les agents (réservée aux superviseurs et admins)
router.get(
    '/performance',
    authMiddleware,
    roleMiddleware(['superviseur', 'admin',]),
    async (req, res) => {
        
            // Sélectionne uniquement les champs matricule, role et performance
            const agentsPerformance = await Agent.find().select('matricule role performance');
            res.json(agentsPerformance);
      
    }
);
router.get(
    '/my-performance', // <-- Nouveau nom de route plus spécifique pour éviter les conflits
    authMiddleware,
    // Note : Le rôle 'agent' est suffisant car la requête concerne l'agent lui-même.
    roleMiddleware(['agent', 'superviseur', 'admin']), 
    async (req, res) => {
        try {
            // Utiliser req.user.id pour trouver la performance de l'agent connecté
            const agent = await Agent.findById(req.user.id).select('matricule role performance');

            if (!agent) {
                return res.status(404).json({ msg: 'Agent non trouvé.' });
            }

            res.json(agent.performance); // Ne renvoie que l'objet de performance
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
// backend/routes/agentRoutes.js

// ... (vos importations et configurations existantes) ...

// @route   GET /api/agents/all-performance
// @desc    Obtenir les statistiques de performance de tous les agents pour un superviseur
// @access  Private (Superviseur, Admin)
router.get(
    '/all-performance',
    authMiddleware,
    roleMiddleware(['superviseur']), // Accès uniquement aux superviseurs
    async (req, res) => {
        try {
            // Filtrer les agents par leur superviseurId
            const agentsPerformance = await Agent.find({ superviseurId: req.user.id }).select('matricule role performance');

            if (!agentsPerformance) {
                return res.status(404).json({ msg: 'Aucun agent trouvé sous votre supervision.' });
            }

            res.json(agentsPerformance);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
// --- NOUVELLES ROUTES POUR LE CRUD DES AGENTS ---

router.post(
    '/',
    [
        authMiddleware,
        roleMiddleware(['superviseur', 'admin']),
        check('matricule', 'Le matricule est requis').not().isEmpty(),
        check('motDePasse', 'Le mot de passe doit contenir au moins 6 caractères').isLength({ min: 6 })
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { matricule, motDePasse, affiliation, role } = req.body;
        
        try {
            let agent = await Agent.findOne({ matricule });
            if (agent) {
                return res.status(400).json({ msg: 'L\'agent existe déjà.' });
            }

            let superviseurId = null;
            if (req.user.role === 'superviseur') {
                superviseurId = req.user.id;
            } else if (req.user.role === 'admin' && req.body.superviseurId) {
                superviseurId = req.body.superviseurId;
            }
            
            agent = new Agent({
                matricule,
                motDePasse, // Utilisation de motDePasse
                affiliation, // Utilisation de affiliation
                role: role || 'agent',
                superviseurId
            });

            const salt = await bcrypt.genSalt(10);
            agent.motDePasse = await bcrypt.hash(motDePasse, salt);

            await agent.save();
            res.json({ msg: 'Agent créé avec succès', agent });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);


// @route   PUT /api/agents/:id
// @desc    Modifier un agent (uniquement par superviseur/admin)
// @access  Private
router.put(
    '/:id',
    [
        authMiddleware,
        roleMiddleware(['superviseur', 'admin'])
    ],
    async (req, res) => {
        const { motDePasse, role } = req.body;
        const agentId = req.params.id;
        
        try {
            let agent = await Agent.findById(agentId);
            if (!agent) {
                return res.status(404).json({ msg: 'Agent non trouvé.' });
            }

            // --- NOUVELLE VÉRIFICATION DE SÉCURITÉ ---
            // Un superviseur ne peut pas changer le rôle d'un agent en 'superviseur' ou 'admin'.
            if (req.user.role === 'superviseur' && (role === 'superviseur' || role === 'admin')) {
                return res.status(403).json({ msg: 'Accès refusé : vous ne pouvez pas promouvoir un agent au rang de superviseur ou d\'administrateur.' });
            }

            if (role) agent.role = role;
            if (motDePasse) {
                const salt = await bcrypt.genSalt(10);
                agent.motDePasse = await bcrypt.hash(motDePasse, salt);
            }
            
            await agent.save();
            res.json({ msg: 'Agent mis à jour avec succès', agent });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
router.get(
    '/all-supervisors',
    [authMiddleware, roleMiddleware(['admin','superviseur'])],
    async (req, res) => {
        try {
            const supervisors = await Agent.find({ role: 'superviseur' }).select('-motDePasse');
            res.json(supervisors);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

// @route   GET /api/agents/all-agents
// @desc    Obtenir la liste de tous les agents
// @access  Private (Admin)
router.get(
    '/all-agents',
    [authMiddleware, roleMiddleware(['admin'])],
    async (req, res) => {
        try {
            const agents = await Agent.find({ role: 'agent' }).populate('superviseurId', 'matricule').select('-motDePasse');
            res.json(agents);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);
router.post(
    '/create-saisie-agent',
    [authMiddleware, roleMiddleware(['superviseur_call_centre'])],
    async (req, res) => {
        const { matricule, password } = req.body;
        try {
            let user = await User.findOne({ matricule });
            if (user) {
                return res.status(400).json({ msg: 'Matricule déjà utilisé.' });
            }
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = new User({
                matricule,
                password: hashedPassword,
                role: 'agent_de_saisie'
            });
            await user.save();
            res.status(201).json({ msg: 'Agent de saisie créé avec succès.' });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur serveur.');
        }
    }
);



// @route   DELETE /api/agents/:id
// @desc    Supprimer un agent (uniquement par superviseur/admin)
// @access  Private
router.delete(
    '/:id',
    [authMiddleware, roleMiddleware(['superviseur', 'admin'])],
    async (req, res) => {
        try {
            const agent = await Agent.findById(req.params.id);

            if (!agent) {
                return res.status(404).json({ msg: 'Agent non trouvé.' });
            }

            // Vérifier que le superviseur ne peut pas se supprimer
            if (agent._id.toString() === req.user.id) {
                return res.status(401).json({ msg: 'Vous ne pouvez pas supprimer votre propre compte.' });
            }

            // Le superviseur ne peut supprimer que ses propres agents
            if (req.user.role === 'superviseur' && agent.superviseurId.toString() !== req.user.id) {
                 return res.status(401).json({ msg: 'Non autorisé à supprimer cet agent.' });
            }
            
            await agent.deleteOne();
            res.json({ msg: 'Agent supprimé avec succès.' });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Erreur du serveur.');
        }
    }
);

module.exports = router;

// Route protégée pour récupérer les informations de l'agent connecté
router.get('/me', authMiddleware, async (req, res) => {
    
        // req.user contient l'objet décodé par le middleware
        const agent = await Agent.findById(req.user.id).select('-motDePasse');
        res.json(agent);
    
});



module.exports = router; 