-- Migration: create analytics_events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  portfolio_id INT NOT NULL,
  type VARCHAR(50) NOT NULL, -- e.g., 'click', 'scroll', 'move', 'interaction', 'project_view'
  page VARCHAR(200) DEFAULT NULL,
  payload JSON DEFAULT NULL,
  adresse_ip VARCHAR(50) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_analytics_portfolio FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
