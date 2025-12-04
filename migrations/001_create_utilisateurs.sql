-- Migration: create utilisateurs table (from class.md)
CREATE TABLE IF NOT EXISTS utilisateurs (
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
