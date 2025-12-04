-- =========================================
-- 🚀 BASE DE DONNÉES : Portfolio NFC
-- MySQL / AUTO_INCREMENT / InnoDB
-- =========================================

-- 1️⃣ TABLE UTILISATEURS
CREATE TABLE utilisateurs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    mot_de_passe TEXT NOT NULL,
    photo_profil TEXT,
    biographie TEXT,
    role VARCHAR(20) DEFAULT 'USER',
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dernier_login TIMESTAMP
) ENGINE=InnoDB;

-- 2️⃣ TABLE PORTFOLIOS
CREATE TABLE portfolios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utilisateur_id INT NOT NULL,
    titre VARCHAR(200),
    description TEXT,
    theme VARCHAR(100),
    url_slug VARCHAR(150) UNIQUE NOT NULL,
    est_public BOOLEAN DEFAULT TRUE,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_portfolio_utilisateur FOREIGN KEY (utilisateur_id) 
        REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3️⃣ TABLE PROJETS
CREATE TABLE projets (
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

-- 4️⃣ TABLE COMPETENCES
CREATE TABLE competences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    nom VARCHAR(150) NOT NULL,
    niveau ENUM('Débutant','Intermédiaire','Avancé','Expert'),
    categorie VARCHAR(100),
    CONSTRAINT fk_competence_portfolio FOREIGN KEY (portfolio_id) 
        REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5️⃣ TABLE EXPERIENCES
CREATE TABLE experiences (
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

-- 6️⃣ TABLE LIENS SOCIAUX
CREATE TABLE liens_sociaux (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    plateforme VARCHAR(100),
    url TEXT,
    CONSTRAINT fk_lien_portfolio FOREIGN KEY (portfolio_id) 
        REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7️⃣ TABLE COMMANDES
CREATE TABLE commandes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utilisateur_id INT NOT NULL,
    numero_commande VARCHAR(100) UNIQUE NOT NULL,
    statut ENUM('En_attente','En_traitement','Expédiée','Livrée','Annulée') DEFAULT 'En_attente',
    montant_total DECIMAL(10,2) DEFAULT 0,
    adresse_livraison TEXT,
    date_commande TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_livraison TIMESTAMP,
    CONSTRAINT fk_commande_utilisateur FOREIGN KEY (utilisateur_id) 
        REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8️⃣ TABLE CARTES NFC
CREATE TABLE cartes_nfc (
    id INT AUTO_INCREMENT PRIMARY KEY,
    commande_id INT NOT NULL,
    uid_nfc VARCHAR(150) UNIQUE NOT NULL,
    lien_portfolio TEXT,
    design TEXT,
    statut ENUM('En_attente','Gravée','Envoyée','Active') DEFAULT 'En_attente',
    date_activation TIMESTAMP,
    CONSTRAINT fk_carte_commande FOREIGN KEY (commande_id) 
        REFERENCES commandes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 9️⃣ TABLE PAIEMENTS
CREATE TABLE paiements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    commande_id INT NOT NULL UNIQUE,
    moyen_paiement ENUM('Carte','PayPal','Virement'),
    reference_transaction VARCHAR(200),
    montant DECIMAL(10,2),
    statut ENUM('En_attente','Réussi','Échoué','Remboursé') DEFAULT 'En_attente',
    date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_paiement_commande FOREIGN KEY (commande_id) 
        REFERENCES commandes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 🔟 TABLE VISITES
CREATE TABLE visites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    date_visite TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    adresse_ip VARCHAR(50),
    user_agent TEXT,
    pays VARCHAR(100),
    referer TEXT,
    CONSTRAINT fk_visite_portfolio FOREIGN KEY (portfolio_id) 
        REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 11️⃣ TABLE NOTIFICATIONS
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utilisateur_id INT NOT NULL,
    titre VARCHAR(200),
    message TEXT,
    type ENUM('Commande','Système','Paiement','Info'),
    est_lue BOOLEAN DEFAULT FALSE,
    date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_utilisateur FOREIGN KEY (utilisateur_id) 
        REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 12️⃣ INDEXES UTILES
CREATE INDEX idx_portfolio_utilisateur ON portfolios(utilisateur_id);
CREATE INDEX idx_projet_portfolio ON projets(portfolio_id);
CREATE INDEX idx_competence_portfolio ON competences(portfolio_id);
CREATE INDEX idx_experience_portfolio ON experiences(portfolio_id);
CREATE INDEX idx_lien_portfolio ON liens_sociaux(portfolio_id);
CREATE INDEX idx_commande_utilisateur ON commandes(utilisateur_id);
CREATE INDEX idx_carte_commande ON cartes_nfc(commande_id);
CREATE INDEX idx_visite_portfolio ON visites(portfolio_id);
CREATE INDEX idx_notification_utilisateur ON notifications(utilisateur_id);
