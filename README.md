# Backend pour Career Card Link

Minimal Node.js + Express backend avec MySQL.

Fichiers importants:
- `src/index.js` - point d'entrée
- `src/db.js` - connexion MySQL
- `src/models/userModel.js` - modèle utilisateur
- `src/controllers/userController.js` - logique d'API utilisateur
- `src/routes/userRoutes.js` - routes utilisateur
- `src/middlewares/authMiddleware.js` - middleware d'authentification JWT

Installation rapide:

1. Copier `.env.example` en `.env` et remplir les valeurs.
2. Installer les dépendances:

```bash
cd backend
npm install
```

3. Démarrer en mode développement:

```bash
npm run dev
```

Endpoints:
- `POST /api/users/register` - register
- `POST /api/users/login` - login
- `GET /api/users/me` - profile (protégé)




Sécurité et préparation (prérequis)
Ajouter champ admin/role aux utilisateurs et middleware adminAuth (obligatoire avant d'exposer l'admin UI).
API basique d'administration (backend)
Utilisateurs : list, get, activate/deactivate, delete, count portfolios.
Portfolios : list, get (avec statistiques visites), edit, delete, feature/unfeature.
Commandes : list, get, update-status, ajouter filtres/pagination.
Cartes : list, assigner UID/lien, activer/désactiver.
Paiements : list, get, mark confirmed/refunded (peut être mock au début).
Notifications : créer/send (stockage + envoi via email/sonner).
UI Admin (frontend)
Routes protégées (admin), pages : Users, Portfolios, Commandes, Cartes, Paiements, Stats.
Widgets : counts, charts (visites mensuelles, revenu mensuel).
Extras opérationnels
Webhooks paiement, rapports, export CSV.
Tests & déploiement