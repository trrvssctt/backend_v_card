-- Migration: projets, competences, experiences

CREATE TABLE IF NOT EXISTS projets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    titre VARCHAR(200) NOT NULL,
    description TEXT,
    image TEXT,
    lien_demo TEXT,
    lien_code TEXT,
    date_debut DATE,
    date_fin DATE,
    CONSTRAINT fk_projet_portfolio FOREIGN KEY (portfolio_id) 
        REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS competences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    nom VARCHAR(150) NOT NULL,
    niveau ENUM('Débutant','Intermédiaire','Avancé','Expert'),
    categorie VARCHAR(100),
    CONSTRAINT fk_competence_portfolio FOREIGN KEY (portfolio_id) 
        REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS experiences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    titre_poste VARCHAR(200) NOT NULL,
    entreprise VARCHAR(150),
    description TEXT,
    date_debut DATE,
    date_fin DATE,
    CONSTRAINT fk_experience_portfolio FOREIGN KEY (portfolio_id) 
        REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
