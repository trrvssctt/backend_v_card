-- Migration: create templates table and add template fields to portfolios
CREATE TABLE IF NOT EXISTS templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  thumbnail_url VARCHAR(1024),
  preview_url VARCHAR(1024),
  price_cents INT DEFAULT 0,
  currency VARCHAR(16) DEFAULT 'F CFA',
  is_public TINYINT DEFAULT 1,
  author VARCHAR(255),
  version VARCHAR(50),
  supported_sections JSON,
  required_fields JSON,
  allowed_plans JSON,
  default_settings JSON,
  settings_schema JSON,
  assets JSON,
  custom_css TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Add relation columns to portfolios if they do not exist
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS selected_template_id INT NULL,
  ADD COLUMN IF NOT EXISTS template_settings JSON NULL;

-- Optional: add foreign key (will fail if portfolios table uses existing rows without constraint support)
-- ALTER TABLE portfolios ADD CONSTRAINT fk_portfolio_template FOREIGN KEY (selected_template_id) REFERENCES templates(id) ON DELETE SET NULL;
