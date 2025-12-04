Cheminement du projet — Career Card Link

Ce document décrit chaque étape de développement du projet, de la configuration initiale jusqu'au déploiement et à l'exploitation. Il est destiné à servir de feuille de route courte pour les développeurs et le product owner.

1. Initialisation du projet

   Objectif
   - Créer le squelette du backend et du frontend, initialiser le dépôt et les outils de qualité.

   Tâches
   - Créer dossiers `backend/` et `frontend/` si nécessaires.
   - Initialiser `package.json` côté backend et frontend.
   - Ajouter ESLint, Prettier, husky (hooks) si souhaité.
   - Choisir la base de données (Postgres recommandé) et préparer `.env.example`.

   Critères d'acceptation
   - `npm install` fonctionne côté backend.
   - Fichiers de configuration présents (`.env.example`, `README.md`).

2. Authentification utilisateur

   Objectif
   - Permettre aux utilisateurs de s'inscrire, se connecter et vérifier leur email.

   Tâches
   - Créer endpoints : POST `/api/auth/register`, POST `/api/auth/login`, POST `/api/auth/verify`.
   - Stocker mot de passe hashé (bcrypt).
   - Générer token JWT (access token) et refresh token optionnel.
   - Envoyer email de vérification via provider (Sendgrid/Mailgun).

   Critères d'acceptation
   - Un utilisateur peut s'inscrire et recevoir un email de vérification.
   - Un utilisateur vérifié peut se connecter et obtenir un token valide.

3. Modèle de données & CRUD portfolio

   Objectif
   - Permettre la création et modification d'un portfolio structuré.

   Tâches
   - Créer tables : `users`, `portfolios`, `sections`, `projects`, `assets`.
   - Endpoints CRUD : POST/GET/PUT/DELETE pour `portfolios` et `projects`.
   - API pour upload d'assets (images/CV) vers S3-compatible.

   Critères d'acceptation
   - L'utilisateur peut créer un portfolio avec au moins une section "Présentation" et un projet.
   - Les assets uploadés sont accessibles via URL publique.

4. Templates & Frontend editor

   Objectif
   - Offrir 2 templates responsive et un éditeur simple.

   Tâches
   - Intégrer 2 templates frontend (React components) et un mode preview.
   - Implémenter la sélection de template côté portfolio.
   - Sauvegarder le contenu structuré JSON pour chaque section.

   Critères d'acceptation
   - L'utilisateur peut sélectionner un template et voir le rendu en temps réel.

5. Publication & URL courte

   Objectif
   - Permettre la publication d'un portfolio avec une URL publique courte.

   Tâches
   - Générer un `slug` unique lors de la publication (ex: `portfolio.app/u/alex123`).
   - Endpoint POST `/api/portfolios/:id/publish` qui active `is_published=true`.
   - Option : service de raccourcissement interne (table `short_urls`) pour supporter tracking.

   Critères d'acceptation
   - L'utilisateur obtient une URL publique qui sert le portfolio lorsqu'on la visite.

6. Commande de carte NFC

   Objectif
   - Permettre la commande d'une carte NFC contenant l'URL du portfolio.

   Tâches
   - Formulaire de commande (design, quantité, adresse) -> POST `/api/nfc/orders`.
   - Intégration Stripe pour paiement (checkout ou payment intents).
   - Enregistrement de la commande (statuts : pending -> paid -> processing -> sent).

   Critères d'acceptation
   - Un utilisateur peut commander une carte NFC et payer en sandbox.
   - La commande apparaît dans l'admin (statut à jour).

7. Back-office admin

   Objectif
   - Gérer les commandes NFC, écrire/assigner tags, suivre les expéditions.

   Tâches
   - Dashboard admin : liste des commandes, filtres, détails, mise à jour de statut.
   - Endpoint pour écrire les tags via un fournisseur API ou pour exporter CSV.
   - Notifications email lors des changements de statut.

   Critères d'acceptation
   - L'admin peut marquer une commande comme "processing" puis "sent".

8. Écriture des tags NFC & processus fournisseur

   Objectif
   - S'assurer que les tags NFC sont programmés avec l'URL correcte.

   Tâches
   - Si fournisseur propose API : implémenter client API pour écrire tags.
   - Sinon : générer CSV avec `url,order_id,tag_index` à transmettre.
   - Mettre à jour `nfc_tags` avec `tag_uid` et `status`.

   Critères d'acceptation
   - Chaque tag a un enregistrement avec statut et URL écrite.

9. Analytics & redirections

   Objectif
   - Collecter des statistiques lorsqu'un tag est scanné et que l'URL est visitée.

   Tâches
   - Route publique `/r/:short` qui enregistre le scan et redirige vers la page publique.
   - Enregistrer `ip`, `user_agent`, `timestamp`, estimation géographique (service ip->geo).
   - Admin UI pour consulter counts et tendances.

   Critères d'acceptation
   - Les scans sont comptabilisés en temps réel et visibles dans l'admin.

10. Tests, sécurité & conformité

   Objectif
   - Garantir la qualité, la sécurité et la conformité RGPD.

   Tâches
   - Tests unitaires et d'intégration pour les endpoints critiques.
   - Mise en place d'une politique de suppression des données personnelles.
   - Cookie consent en frontend.

   Critères d'acceptation
   - Tests CI passants, endpoint de suppression de compte fonctionnel.

11. Déploiement & monitoring

   Objectif
   - Déployer l'application en production et surveiller son fonctionnement.

   Tâches
   - Déployer frontend (Vercel/Netlify), backend (Render/AWS), DB (RDS).
   - Configurer domaine, SSL, env variables, services de monitoring (Sentry).
   - Plan de sauvegarde DB.

   Critères d'acceptation
   - Application accessible via HTTPS, sauvegarde automatisée de la DB.

12. Améliorations futures

   - OAuth (Google/LinkedIn), templates supplémentaires, drag-and-drop, multi-langue.
   - Automatisation avancée de la production NFC et suivi logistique.

---

Pour toute étape que tu veux que j'implémente immédiatement (ex: migrations Postgres, OpenAPI YAML, scaffold backend Express + Prisma), dis laquelle et je la crée dans le repo.
