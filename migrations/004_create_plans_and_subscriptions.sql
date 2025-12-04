-- Migration: create plans, plan_features and user_plans tables
-- This migration adds basic tables to manage offered plans, their features,
-- and user subscriptions/purchases.

CREATE TABLE IF NOT EXISTS plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  price_cents INT DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'XOF',
  billing_interval VARCHAR(50) DEFAULT 'one_time', -- 'one_time', 'monthly', 'yearly'
  is_public TINYINT(1) DEFAULT 1,
  metadata JSON DEFAULT NULL,
  external_price_id VARCHAR(255) DEFAULT NULL, -- optional reference to Stripe/other
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan_features (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  feature VARCHAR(255) NOT NULL,
  value VARCHAR(255) DEFAULT NULL,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT NOT NULL,
  plan_id INT NULL,
  start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_date TIMESTAMP NULL DEFAULT NULL,
  status VARCHAR(50) DEFAULT 'active', -- 'active','cancelled','expired','pending'
  payment_reference VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: add indexes to speed up common queries (these may error if index already exists on some MySQL versions)
ALTER TABLE plans ADD INDEX idx_plans_slug (slug);
ALTER TABLE user_plans ADD INDEX idx_user_plans_user (utilisateur_id);
