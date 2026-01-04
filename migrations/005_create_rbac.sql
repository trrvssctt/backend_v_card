-- Migration: 005_create_rbac.sql
-- Adds RBAC tables: roles, permissions, role_permissions, admin_users, admin_action_logs

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role_id INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_action_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT,
  action VARCHAR(255) NOT NULL,
  resource VARCHAR(255),
  details TEXT,
  ip_address VARCHAR(45),
  user_agent VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default roles
INSERT IGNORE INTO roles (name, description) VALUES
  ('super_admin', 'Accès total'),
  ('admin_technique', 'Backend, infra, logs'),
  ('admin_contenu', 'Blog et pages légales'),
  ('admin_support', 'Gestion utilisateurs et paiements (lecture seule)');

-- Seed permissions (examples)
INSERT IGNORE INTO permissions (name, description) VALUES
  ('users:read', 'Lire les utilisateurs'),
  ('users:write', 'Créer/modifier/supprimer utilisateurs'),
  ('payments:read', 'Lire paiements'),
  ('payments:write', 'Gérer paiements'),
  ('content:read', 'Lire contenu'),
  ('content:write', 'Publier/éditer contenu'),
  ('infra:access', 'Accès infra/logs'),
  ('system:admin', 'Opérations système sensibles');

-- Grant permissions to roles
-- super_admin gets all permissions (we'll map programmatically if needed)

-- Example mapping for admin_support: read users and payments only
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.name IN ('users:read','payments:read') WHERE r.name='admin_support';

-- admin_contenu: content read/write
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.name IN ('content:read','content:write') WHERE r.name='admin_contenu';

-- admin_technique: infra and system
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.name IN ('infra:access','system:admin') WHERE r.name='admin_technique';

-- Note: super_admin role should be treated as having all permissions in middleware.
