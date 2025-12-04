-- Migration: create portfolios table

-- Schema based on backend/class.md
CREATE TABLE IF NOT EXISTS portfolios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utilisateur_id INT NOT NULL,
    titre VARCHAR(200),
    description TEXT,
    theme VARCHAR(100),
    url_slug VARCHAR(150) UNIQUE NOT NULL,
    est_public BOOLEAN DEFAULT TRUE,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_portfolio_utilisateur FOREIGN KEY (utilisateur_id) 
        REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
