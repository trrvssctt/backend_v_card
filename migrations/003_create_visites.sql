-- Migration: create visites table
CREATE TABLE IF NOT EXISTS visites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    date_visite TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    adresse_ip VARCHAR(50),
    user_agent TEXT,
    pays VARCHAR(100),
    referer TEXT,
    CONSTRAINT fk_visite_portfolio FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
