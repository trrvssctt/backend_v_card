# RBAC - Roles & Permissions (Portefolia V2.0.1)

Ce document décrit les rôles, permissions, middleware et recommandations d'usage pour le back-office.

## Rôles définis
- super_admin : accès total — toutes les opérations.
- admin_technique : backend, infra, accès logs et opérations système.
- admin_contenu : blog, pages légales, création/édition de contenu.
- admin_support : gestion utilisateurs et paiements (lecture seule par défaut).

## Tables BDD
- `roles` : liste des rôles.
- `permissions` : liste des permissions (chaînes, ex. `users:read`).
- `role_permissions` : mapping role -> permission.
- `admin_users` : comptes admin (email, password_hash, role_id).
- `admin_action_logs` : journal des actions admin.

Un fichier de migration SQL a été ajouté : `backend/migrations/005_create_rbac.sql`.

## Permissions exemples
- `users:read`, `users:write`
- `payments:read`, `payments:write`
- `content:read`, `content:write`
- `infra:access`, `system:admin`

## Middlewares fournis
- `authMiddleware` (existant) : valide le JWT et positionne `req.userId`.
- `rbac.requirePermission(perm)` : vérifie que l'utilisateur admin (dans `admin_users`) a la permission demandée. Le rôle `super_admin` bypass automatiquement.
  - Usage: `requirePermission('users:write')` ou `requirePermission(['a','b'])`.
- `adminLogger.logAdminAction(action, resource)` : middleware qui enregistre dans `admin_action_logs` l'action réalisée, le résultat HTTP et métadonnées (IP, UA). À placer avant le handler.
  - Usage: `logAdminAction('delete_user','users')`.

## Intégration recommandée (exemples)
- Lecture d'utilisateurs: `auth, requirePermission('users:read')`.
- Suppression d'utilisateur: `auth, requirePermission('users:write'), logAdminAction('delete_user','users')`.
- Opérations infra/système: limiter à `admin_technique` via permissions `infra:access` et/ou `system:admin`.

## Bonnes pratiques de sécurité
- Séparer comptes admin et utilisateurs normaux (`admin_users` vs `utilisateurs`).
- Utiliser JWTs signés avec une clé forte et vérifier `sub` revendication correspond au bon type (optionnel : insérer `type: 'admin'`).
- Vérifier la permission dans le middleware avant d'effectuer toute opération sensible.
- Journaliser toute action critique avec `admin_action_logs` pour audit.
- Protéger endpoints d'administration derrière TLS et réseau restreint si possible.

## Migration & seed
Exécuter la migration SQL dans `backend/migrations/005_create_rbac.sql` contre la base MySQL du backend. Les rôles et permissions de base sont seedés dans le fichier.

## Fichiers ajoutés

## Modules Utilisateurs (Back-office)

Endpoints clés (exemples) et permissions nécessaires:
- `GET /admin/users` : `users:read` (liste paginée + filtres: `email`, `date_from`, `date_to`, `plan_id`, `status`)
- `GET /admin/users/:id` : `users:read` (détails + plan courant + historique)
- `PUT /admin/users/:id` : `users:write` (mettre à jour informations utilisateur)
- `PUT /admin/users/:id/activate` : `users:write` (réactiver)
- `PUT /admin/users/:id/deactivate` : `users:write` (suspendre)
- `DELETE /admin/users/:id` : `users:write` (suppression logique — soft delete)
- `DELETE /admin/users/:id/permanent` : `system:admin` (suppression définitive restreinte)
- `GET /admin/users/:id/plans` : `users:read` (historique des plans)
- `POST /admin/users/:id/plan` : `payments:write` (changer/assigner un plan)
- `GET /admin/users/:id/cartes` : `users:read` (liste des cartes NFC liées)

Chaque route sensible est protégée par `requirePermission(...)` et les actions de modification/applications critiques sont journalisées via `logAdminAction(...)`.
Si vous voulez, j'intègre la vérification `type: 'admin'` dans le token et je mets à jour `authMiddleware` pour différencier comptes admin/utilisateur standard.
