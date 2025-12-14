const { pool } = require('../db');

async function init() {
  // Table principale des visites
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      adresse_ip VARCHAR(45) DEFAULT NULL,
      user_agent TEXT DEFAULT NULL,
      referer VARCHAR(500) DEFAULT NULL,
      page VARCHAR(500) NOT NULL,
      pays VARCHAR(2) DEFAULT NULL,
      ville VARCHAR(100) DEFAULT NULL,
      latitude DECIMAL(10, 8) DEFAULT NULL,
      longitude DECIMAL(11, 8) DEFAULT NULL,
      date_visite TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_new_session BOOLEAN DEFAULT TRUE,
      session_id VARCHAR(32) DEFAULT NULL,
      session_start TIMESTAMP NULL,
      session_end TIMESTAMP NULL,
      device_type ENUM('desktop', 'mobile', 'tablet', 'bot', 'other') DEFAULT NULL,
      browser VARCHAR(50) DEFAULT NULL,
      os VARCHAR(50) DEFAULT NULL,
      screen_width INT DEFAULT NULL,
      screen_height INT DEFAULT NULL,
      INDEX idx_portfolio (portfolio_id),
      INDEX idx_date (date_visite),
      INDEX idx_session (session_id),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des événements utilisateur (version améliorée)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      session_id VARCHAR(32) DEFAULT NULL,
      type ENUM(
        'click',
        'scroll',
        'hover',
        'form_submit',
        'download',
        'video_play',
        'social_share',
        'project_view',
        'contact_click',
        'cv_download',
        'appointment_book',
        'external_link'
      ) NOT NULL,
      page VARCHAR(500) NOT NULL,
      element_id VARCHAR(100) DEFAULT NULL,
      element_class VARCHAR(200) DEFAULT NULL,
      element_text TEXT DEFAULT NULL,
      coordinates_x DECIMAL(5, 2) DEFAULT NULL,
      coordinates_y DECIMAL(5, 2) DEFAULT NULL,
      scroll_depth DECIMAL(5, 2) DEFAULT NULL,
      metadata JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_portfolio_type (portfolio_id, type),
      INDEX idx_session (session_id),
      INDEX idx_created (created_at),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des projets/vues
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projet_views (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      projet_id INT NOT NULL,
      view_count INT DEFAULT 1,
      unique_views INT DEFAULT 1,
      total_time_ms BIGINT DEFAULT 0,
      last_viewed TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_portfolio_projet (portfolio_id, projet_id),
      INDEX idx_popularity (view_count DESC),
      UNIQUE KEY uniq_portfolio_projet (portfolio_id, projet_id),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
      FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des conversions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      type ENUM('contact', 'cv', 'appointment', 'newsletter', 'demo_request') NOT NULL,
      contact_method ENUM('form', 'email', 'phone', 'whatsapp') DEFAULT NULL,
      contact_name VARCHAR(150) DEFAULT NULL,
      contact_email VARCHAR(150) DEFAULT NULL,
      contact_phone VARCHAR(20) DEFAULT NULL,
      message TEXT DEFAULT NULL,
      source_page VARCHAR(500) NOT NULL,
      utm_source VARCHAR(100) DEFAULT NULL,
      utm_medium VARCHAR(100) DEFAULT NULL,
      utm_campaign VARCHAR(100) DEFAULT NULL,
      session_id VARCHAR(32) DEFAULT NULL,
      is_qualified BOOLEAN DEFAULT FALSE,
      qualification_score TINYINT DEFAULT 0,
      follow_up_status ENUM('new', 'contacted', 'responded', 'converted', 'lost') DEFAULT 'new',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_portfolio_type (portfolio_id, type),
      INDEX idx_date (created_at),
      INDEX idx_qualified (is_qualified),
      INDEX idx_session (session_id),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des performances techniques
  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_metrics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      page_url VARCHAR(500) NOT NULL,
      load_time_ms INT DEFAULT NULL,
      first_contentful_paint_ms INT DEFAULT NULL,
      largest_contentful_paint_ms INT DEFAULT NULL,
      first_input_delay_ms INT DEFAULT NULL,
      cumulative_layout_shift DECIMAL(5, 3) DEFAULT NULL,
      time_to_interactive_ms INT DEFAULT NULL,
      dom_size INT DEFAULT NULL,
      total_blocking_time_ms INT DEFAULT NULL,
      device_type ENUM('desktop', 'mobile') DEFAULT 'desktop',
      connection_type VARCHAR(50) DEFAULT NULL,
      tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_portfolio_page (portfolio_id, page_url),
      INDEX idx_tested (tested_at),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des scores de performance
  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      date DATE NOT NULL,
      overall_score TINYINT UNSIGNED DEFAULT 0,
      traffic_score TINYINT UNSIGNED DEFAULT 0,
      engagement_score TINYINT UNSIGNED DEFAULT 0,
      conversion_score TINYINT UNSIGNED DEFAULT 0,
      content_score TINYINT UNSIGNED DEFAULT 0,
      seo_score TINYINT UNSIGNED DEFAULT 0,
      technical_score TINYINT UNSIGNED DEFAULT 0,
      total_visits INT DEFAULT 0,
      unique_visitors INT DEFAULT 0,
      avg_session_duration_seconds INT DEFAULT 0,
      bounce_rate DECIMAL(5, 2) DEFAULT 0,
      conversion_rate DECIMAL(5, 2) DEFAULT 0,
      pages_per_session DECIMAL(5, 2) DEFAULT 0,
      trend_traffic DECIMAL(5, 2) DEFAULT 0,
      trend_engagement DECIMAL(5, 2) DEFAULT 0,
      trend_conversion DECIMAL(5, 2) DEFAULT 0,
      badges JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_portfolio_date (portfolio_id, date),
      INDEX idx_date (date),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des sources de trafic
  await pool.query(`
    CREATE TABLE IF NOT EXISTS traffic_sources (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      date DATE NOT NULL,
      source_type ENUM(
        'organic_search',
        'paid_search',
        'direct',
        'referral',
        'social',
        'email',
        'other'
      ) NOT NULL,
      source_detail VARCHAR(200) DEFAULT NULL,
      medium VARCHAR(50) DEFAULT NULL,
      campaign VARCHAR(100) DEFAULT NULL,
      keyword VARCHAR(200) DEFAULT NULL,
      visits INT DEFAULT 0,
      unique_visitors INT DEFAULT 0,
      conversions INT DEFAULT 0,
      conversion_value DECIMAL(10, 2) DEFAULT 0,
      bounce_rate DECIMAL(5, 2) DEFAULT 0,
      avg_duration_seconds INT DEFAULT 0,
      INDEX idx_portfolio_date (portfolio_id, date),
      INDEX idx_source (source_type),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des sessions utilisateur
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(32) PRIMARY KEY,
      portfolio_id INT NOT NULL,
      adresse_ip VARCHAR(45) DEFAULT NULL,
      user_agent TEXT DEFAULT NULL,
      referer VARCHAR(500) DEFAULT NULL,
      landing_page VARCHAR(500) NOT NULL,
      device_type ENUM('desktop', 'mobile', 'tablet') DEFAULT NULL,
      country VARCHAR(2) DEFAULT NULL,
      start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      end_time TIMESTAMP NULL,
      duration_seconds INT DEFAULT 0,
      page_count INT DEFAULT 1,
      is_bounced BOOLEAN DEFAULT TRUE,
      has_converted BOOLEAN DEFAULT FALSE,
      conversion_type VARCHAR(50) DEFAULT NULL,
      exit_page VARCHAR(500) DEFAULT NULL,
      INDEX idx_portfolio_time (portfolio_id, start_time),
      INDEX idx_duration (duration_seconds),
      INDEX idx_converted (has_converted),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des badges gamifiés
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gamification_badges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      badge_key VARCHAR(50) NOT NULL,
      badge_name VARCHAR(100) NOT NULL,
      badge_description TEXT DEFAULT NULL,
      badge_type ENUM('bronze', 'silver', 'gold', 'platinum', 'legendary') DEFAULT 'bronze',
      category ENUM('traffic', 'engagement', 'conversion', 'seo', 'technical', 'achievement') NOT NULL,
      required_value DECIMAL(10, 2) DEFAULT NULL,
      current_value DECIMAL(10, 2) DEFAULT 0,
      progress_percentage TINYINT UNSIGNED DEFAULT 0,
      is_earned BOOLEAN DEFAULT FALSE,
      earned_at TIMESTAMP NULL,
      metadata JSON DEFAULT NULL,
      INDEX idx_portfolio (portfolio_id),
      INDEX idx_earned (is_earned),
      UNIQUE KEY uniq_portfolio_badge (portfolio_id, badge_key),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Table des insights IA
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      insight_type ENUM('tip', 'warning', 'success', 'opportunity', 'prediction') NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      confidence_score TINYINT UNSIGNED DEFAULT 0,
      related_metrics JSON DEFAULT NULL,
      suggested_action TEXT DEFAULT NULL,
      action_url VARCHAR(500) DEFAULT NULL,
      is_applied BOOLEAN DEFAULT FALSE,
      applied_at TIMESTAMP NULL,
      impact_score TINYINT UNSIGNED DEFAULT NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      INDEX idx_portfolio_type (portfolio_id, insight_type),
      INDEX idx_generated (generated_at),
      INDEX idx_confidence (confidence_score DESC),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Index de performance supplémentaires
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_visites_composite ON visites (portfolio_id, date_visite, adresse_ip);
    CREATE INDEX IF NOT EXISTS idx_events_composite ON analytics_events (portfolio_id, created_at, type);
    CREATE INDEX IF NOT EXISTS idx_conversions_composite ON conversions (portfolio_id, created_at, type);
    CREATE INDEX IF NOT EXISTS idx_sessions_composite ON user_sessions (portfolio_id, start_time, has_converted);
    CREATE FULLTEXT INDEX IF NOT EXISTS idx_ai_insights_text ON ai_insights (title, description);
  `);
}

async function create(event) {
  if (!event || !event.portfolio_id || !event.type) {
    throw new Error('portfolio_id and type are required');
  }

  const sql = `
    INSERT INTO analytics_events (
      portfolio_id, session_id, type, page, element_id, element_class, 
      element_text, coordinates_x, coordinates_y, scroll_depth, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    event.portfolio_id,
    event.session_id || null,
    event.type,
    event.page || '/',
    event.element_id || null,
    event.element_class || null,
    event.element_text || null,
    event.coordinates_x || null,
    event.coordinates_y || null,
    event.scroll_depth || null,
    event.metadata ? JSON.stringify(event.metadata) : null
  ];

  try {
    const [result] = await pool.query(sql, params);
    return { id: result.insertId, ...event };
  } catch (error) {
    console.error('Error creating analytics event:', error);
    throw error;
  }
}

async function createVisit(v) {
  if (!v || !v.portfolio_id) {
    throw new Error('portfolio_id required for visit');
  }

  const sql = `
    INSERT INTO visites (
      portfolio_id, adresse_ip, user_agent, referer, page, pays, ville,
      latitude, longitude, is_new_session, session_id, session_start,
      session_end, device_type, browser, os, screen_width, screen_height
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    v.portfolio_id,
    v.adresse_ip || null,
    v.user_agent || null,
    v.referer || null,
    v.page || '/',
    v.pays || null,
    v.ville || null,
    v.latitude || null,
    v.longitude || null,
    v.is_new_session == null ? true : !!v.is_new_session,
    v.session_id || null,
    v.session_start || null,
    v.session_end || null,
    v.device_type || null,
    v.browser || null,
    v.os || null,
    v.screen_width || null,
    v.screen_height || null
  ];

  try {
    const [result] = await pool.query(sql, params);
    return { id: result.insertId, ...v };
  } catch (error) {
    console.error('Error creating visit:', error);
    throw error;
  }
}

async function createConversion(conversion) {
  if (!conversion || !conversion.portfolio_id || !conversion.type) {
    throw new Error('portfolio_id and type are required for conversion');
  }

  const sql = `
    INSERT INTO conversions (
      portfolio_id, type, contact_method, contact_name, contact_email,
      contact_phone, message, source_page, utm_source, utm_medium,
      utm_campaign, session_id, is_qualified, qualification_score,
      follow_up_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    conversion.portfolio_id,
    conversion.type,
    conversion.contact_method || null,
    conversion.contact_name || null,
    conversion.contact_email || null,
    conversion.contact_phone || null,
    conversion.message || null,
    conversion.source_page || '/',
    conversion.utm_source || null,
    conversion.utm_medium || null,
    conversion.utm_campaign || null,
    conversion.session_id || null,
    conversion.is_qualified || false,
    conversion.qualification_score || 0,
    conversion.follow_up_status || 'new'
  ];

  try {
    const [result] = await pool.query(sql, params);
    return { id: result.insertId, ...conversion };
  } catch (error) {
    console.error('Error creating conversion:', error);
    throw error;
  }
}

async function updateProjectView(portfolioId, projectId, timeSpentMs = 0) {
  const sql = `
    INSERT INTO projet_views (portfolio_id, projet_id, view_count, unique_views, total_time_ms)
    VALUES (?, ?, 1, 1, ?)
    ON DUPLICATE KEY UPDATE
      view_count = view_count + 1,
      total_time_ms = total_time_ms + ?,
      last_viewed = CURRENT_TIMESTAMP
  `;

  const params = [portfolioId, projectId, timeSpentMs, timeSpentMs];

  try {
    await pool.query(sql, params);
    return true;
  } catch (error) {
    console.error('Error updating project view:', error);
    throw error;
  }
}

async function findByPortfolio(portfolioId, since = null) {
  const params = [portfolioId];
  let sql = 'SELECT * FROM analytics_events WHERE portfolio_id = ?';
  
  if (since) {
    sql += ' AND created_at >= ?';
    params.push(since);
  }
  
  sql += ' ORDER BY created_at DESC';
  
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('Error finding events by portfolio:', error);
    throw error;
  }
}

async function countByType(portfolioId, since = null) {
  const params = [portfolioId];
  let sql = 'SELECT type, COUNT(*) AS cnt FROM analytics_events WHERE portfolio_id = ?';
  
  if (since) {
    sql += ' AND created_at >= ?';
    params.push(since);
  }
  
  sql += ' GROUP BY type';
  
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('Error counting events by type:', error);
    throw error;
  }
}

async function getPerformanceScore(portfolioId, date = null) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  const sql = `
    SELECT * FROM performance_scores 
    WHERE portfolio_id = ? AND date = ?
    ORDER BY created_at DESC LIMIT 1
  `;
  
  try {
    const [rows] = await pool.query(sql, [portfolioId, targetDate]);
    return rows[0] || null;
  } catch (error) {
    console.error('Error getting performance score:', error);
    throw error;
  }
}

async function getLiveVisitors(portfolioId, minutes = 5) {
  const sql = `
    SELECT 
      COUNT(DISTINCT adresse_ip) as count,
      GROUP_CONCAT(DISTINCT pays) as countries,
      AVG(TIMESTAMPDIFF(SECOND, session_start, COALESCE(session_end, NOW()))) as avg_duration
    FROM visites 
    WHERE portfolio_id = ? 
      AND date_visite >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
      AND is_new_session = TRUE
  `;
  
  try {
    const [rows] = await pool.query(sql, [portfolioId, minutes]);
    return rows[0] || { count: 0, countries: '', avg_duration: 0 };
  } catch (error) {
    console.error('Error getting live visitors:', error);
    throw error;
  }
}

async function getTrafficSources(portfolioId, startDate, endDate) {
  // Robust query: return simple visit counts per traffic source.
  // Avoid referencing session/user_session specific columns that may not exist in all schemas.
  const sql = `
    SELECT 
      ts.source_type,
      ts.source_detail,
      COUNT(*) as visits,
      COUNT(DISTINCT v.adresse_ip) as unique_visitors
    FROM traffic_sources ts
    LEFT JOIN visites v ON ts.portfolio_id = v.portfolio_id 
      AND DATE(v.date_visite) = ts.date
    WHERE ts.portfolio_id = ? 
      AND ts.date BETWEEN ? AND ?
    GROUP BY ts.source_type, ts.source_detail
    ORDER BY visits DESC
  `;

  try {
    const [rows] = await pool.query(sql, [portfolioId, startDate, endDate]);
    return rows;
  } catch (error) {
    console.error('Error getting traffic sources:', error);
    throw error;
  }
}

async function getTopProjects(portfolioId, limit = 5, since = null) {
  const params = [portfolioId];
  let sql = `
    SELECT 
      p.id,
      p.titre as name,
      pv.view_count as views,
      pv.unique_views,
      pv.total_time_ms / pv.view_count as avg_duration_ms,
      ROUND(pv.view_count / (SELECT MAX(view_count) FROM projet_views WHERE portfolio_id = ?) * 100, 0) as popularity_score
    FROM projet_views pv
    JOIN projets p ON pv.projet_id = p.id
    WHERE pv.portfolio_id = ?
  `;
  
  if (since) {
    sql += ' AND pv.last_viewed >= ?';
    params.push(since);
  }
  
  sql += ' ORDER BY pv.view_count DESC LIMIT ?';
  params.push(limit);
  
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('Error getting top projects:', error);
    throw error;
  }
}

async function getKeyInteractions(portfolioId, since = null) {
  // Try to query events table; some deployments may have older schema.
  const params = [portfolioId];
  let sql = `
    SELECT 
      type,
      element_id,
      element_text,
      COUNT(*) as count,
      COUNT(DISTINCT session_id) as unique_users,
      DATE(created_at) as last_date
    FROM analytics_events 
    WHERE portfolio_id = ? 
      AND type IN ('contact_click', 'cv_download', 'appointment_book', 'form_submit')
  `;

  if (since) {
    sql += ' AND created_at >= ?';
    params.push(since);
  }

  sql += ' GROUP BY type, element_id, element_text ORDER BY count DESC';

  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    // Fallback: older schema may not have session_id/element fields — provide coarse counts
    try {
      const paramsLegacy = [portfolioId];
      let sqlLegacy = `
        SELECT type, COUNT(*) as count, COUNT(DISTINCT adresse_ip) as unique_users, DATE(created_at) as last_date
        FROM analytics_events
        WHERE portfolio_id = ? AND type IN ('contact_click', 'cv_download', 'appointment_book', 'form_submit')
      `;
      if (since) {
        sqlLegacy += ' AND created_at >= ?';
        paramsLegacy.push(since);
      }
      sqlLegacy += ' GROUP BY type ORDER BY count DESC';
      const [rows2] = await pool.query(sqlLegacy, paramsLegacy);
      return rows2.map(r => ({ type: r.type, element_id: null, element_text: null, count: r.count, unique_users: r.unique_users, last_date: r.last_date }));
    } catch (e) {
      console.error('Error getting key interactions (fallback):', e);
      throw error;
    }
  }
}

async function calculatePerformanceScore(portfolioId) {
  try {
    // Calculer les métriques de base
    // total visits & unique visitors from visites
    const [visitsResult] = await pool.query(`
      SELECT 
        COUNT(*) as total_visits,
        COUNT(DISTINCT adresse_ip) as unique_visitors
      FROM visites 
      WHERE portfolio_id = ? 
        AND date_visite >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `, [portfolioId]);

    // average duration and bounce rate should come from user_sessions when available
    let avgDurationSeconds = 0;
    let bounceRate = 100;
    try {
      const [sessRows] = await pool.query(`
        SELECT
          AVG(TIMESTAMPDIFF(SECOND, start_time, COALESCE(end_time, NOW()))) as avg_duration_seconds,
          SUM(CASE WHEN page_count <= 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as bounce_rate
        FROM user_sessions
        WHERE portfolio_id = ?
          AND start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `, [portfolioId]);
      avgDurationSeconds = Number(sessRows[0]?.avg_duration_seconds || 0);
      bounceRate = Number(sessRows[0]?.bounce_rate || 100);
    } catch (e) {
      // fallback: try approximate from visites (if available)
      try {
        const [vrows] = await pool.query(`
          SELECT AVG(TIMESTAMPDIFF(SECOND, session_start, COALESCE(session_end, NOW()))) as avg_duration_seconds
          FROM visites
          WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `, [portfolioId]);
        avgDurationSeconds = Number(vrows[0]?.avg_duration_seconds || 0);
        bounceRate = 100;
      } catch (ee) {
        avgDurationSeconds = 0;
        bounceRate = 100;
      }
    }
    
    const [conversionsResult] = await pool.query(`
      SELECT COUNT(*) as total_conversions
      FROM conversions 
      WHERE portfolio_id = ? 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND type = 'contact'
    `, [portfolioId]);
    
    const [projectsResult] = await pool.query(`
      SELECT COUNT(*) as project_count, SUM(view_count) as total_project_views
      FROM projet_views 
      WHERE portfolio_id = ?
    `, [portfolioId]);
    
    // Calculer les scores (0-100)
    const metrics = visitsResult[0] || {};
    const totalVisits = metrics.total_visits || 0;
    const uniqueVisitors = metrics.unique_visitors || 0;
    const avgDuration = Math.round(avgDurationSeconds || Number(metrics.avg_duration_seconds || 0));
    // `bounceRate` was computed above (from user_sessions or fallback)
    const totalConversions = conversionsResult[0]?.total_conversions || 0;
    const conversionRate = totalVisits > 0 ? (totalConversions / totalVisits) * 100 : 0;
    const projectCount = projectsResult[0]?.project_count || 0;
    const projectViews = projectsResult[0]?.total_project_views || 0;
    
    // Scores individuels
    const trafficScore = Math.min(100, Math.round((uniqueVisitors / 1000) * 100));
    const engagementScore = Math.min(100, Math.round((avgDuration / 180) * 100));
    const conversionScore = Math.min(100, Math.round((conversionRate / 10) * 100));
    const contentScore = Math.min(100, Math.round((projectViews / 500) * 100));
    const technicalScore = Math.min(100, 100 - Math.round(bounceRate));
    
    // Score global pondéré
    const overallScore = Math.round((
      trafficScore * 0.25 +
      engagementScore * 0.25 +
      conversionScore * 0.30 +
      contentScore * 0.10 +
      technicalScore * 0.10
    ));
    
    // Enregistrer le score
    const today = new Date().toISOString().split('T')[0];
    const insertSql = `
      INSERT INTO performance_scores (
        portfolio_id, date, overall_score, traffic_score, engagement_score,
        conversion_score, content_score, technical_score, total_visits,
        unique_visitors, avg_session_duration_seconds, bounce_rate,
        conversion_rate, pages_per_session
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0)
      ON DUPLICATE KEY UPDATE
        overall_score = VALUES(overall_score),
        traffic_score = VALUES(traffic_score),
        engagement_score = VALUES(engagement_score),
        conversion_score = VALUES(conversion_score),
        content_score = VALUES(content_score),
        technical_score = VALUES(technical_score),
        total_visits = VALUES(total_visits),
        unique_visitors = VALUES(unique_visitors),
        avg_session_duration_seconds = VALUES(avg_session_duration_seconds),
        bounce_rate = VALUES(bounce_rate),
        conversion_rate = VALUES(conversion_rate)
    `;
    
    await pool.query(insertSql, [
      portfolioId, today, overallScore, trafficScore, engagementScore,
      conversionScore, contentScore, technicalScore, totalVisits,
      uniqueVisitors, Math.round(avgDuration), bounceRate, conversionRate
    ]);
    
    return {
      overall_score: overallScore,
      traffic_score: trafficScore,
      engagement_score: engagementScore,
      conversion_score: conversionScore,
      content_score: contentScore,
      technical_score: technicalScore,
      metrics: {
        total_visits: totalVisits,
        unique_visitors: uniqueVisitors,
        avg_duration_seconds: Math.round(avgDuration),
        bounce_rate: bounceRate,
        conversion_rate: conversionRate,
        project_count: projectCount,
        project_views: projectViews
      }
    };
    
  } catch (error) {
    console.error('Error calculating performance score:', error);
    throw error;
  }
}

module.exports = {
  init,
  create,
  createVisit,
  createConversion,
  updateProjectView,
  findByPortfolio,
  countByType,
  getPerformanceScore,
  getLiveVisitors,
  getTrafficSources,
  getTopProjects,
  getKeyInteractions,
  calculatePerformanceScore
};