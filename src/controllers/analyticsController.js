const { pool } = require('../db');
const portfolioModel = require('../models/portfolioModel');
const analyticsEventModel = require('../models/analyticsEventModel');
const planModel = require('../models/planModel');

// ==================== FONCTIONS PRINCIPALES ====================

/**
 * Récupère toutes les données analytiques pour un portfolio
 */
async function getAnalytics(req, res) {
  try {
    const userId = req.userId;
    const period = (req.query.period || '30d').toString();
    let portfolioId = req.query.portfolio_id ? Number(req.query.portfolio_id) : null;

    // Si aucun portfolio_id fourni, prendre le premier portfolio de l'utilisateur
    if (!portfolioId) {
      const portfolios = await portfolioModel.findByUser(userId);
      if (!portfolios || portfolios.length === 0) {
        return res.status(404).json({ error: 'Aucun portfolio trouvé pour cet utilisateur' });
      }
      portfolioId = portfolios[0].id;
    }

    // Vérifier la propriété du portfolio
    const portfolio = await portfolioModel.findById(portfolioId);
    if (!portfolio) return res.status(404).json({ error: 'Portfolio non trouvé' });
    if (String(portfolio.utilisateur_id) !== String(userId)) {
      return res.status(403).json({ error: 'Accès non autorisé à ce portfolio' });
    }

    // Calculer la date de début en fonction de la période
    const { startDate, endDate } = calculateDateRange(period);
    
    // Récupérer toutes les données en parallèle
    const [
      liveVisitorsData,
      trafficSourcesData,
      topProjectsData,
      keyInteractionsData,
      performanceScoreData,
      overviewData,
      sessionsData,
      heatmapData
    ] = await Promise.all([
      getLiveVisitors(portfolioId),
      getTrafficSources(portfolioId, startDate, endDate),
      getTopProjects(portfolioId, 5, startDate),
      getKeyInteractions(portfolioId, startDate),
      calculatePerformanceScore(portfolioId),
      getAnalyticsOverview(portfolioId, startDate, endDate),
      getSessions(portfolioId, startDate, endDate),
      getHeatmapData(portfolioId, startDate, endDate)
    ]);

    // Détecter le plan de l'utilisateur
    const userPlans = await planModel.listUserPlans(userId);
    const latestPlan = userPlans && userPlans.length ? userPlans[0] : null;
    const planSlug = latestPlan && latestPlan.slug ? String(latestPlan.slug).toLowerCase() : '';
    const isPremium = planSlug.includes('premium') || planSlug.includes('business');
    const isPro = planSlug.includes('pro') || isPremium;

    // Construire la réponse
    const response = {
      // Données de base pour tous les plans
      live_visitors: liveVisitorsData.visitors || [],
      live_count: liveVisitorsData.count || 0,
      traffic_sources: trafficSourcesData,
      projects: topProjectsData,
      interactions: keyInteractionsData,
      performance_score: performanceScoreData,
      overview: overviewData,
      
      // Données pour les plans Pro et Premium
      ...(isPro && {
        sessions: sessionsData,
        visits_over_time: await getVisitsOverTime(portfolioId, period, startDate),
        device_breakdown: await getDeviceBreakdown(portfolioId, startDate, endDate),
        geographical_data: await getGeographicalData(portfolioId, startDate, endDate)
      }),
      
      // Données exclusives pour Premium
      ...(isPremium && {
        heatmap: heatmapData,
        ai_insights: await getAIInsights(portfolioId),
        badges: await getGamificationBadges(portfolioId),
        seo_keywords: await getSEOKeywords(portfolioId),
        conversion_funnel: await getConversionFunnel(portfolioId, startDate, endDate)
      }),
      
      metadata: {
        portfolio_id: portfolioId,
        portfolio_name: portfolio.titre || portfolio.name || 'Portfolio',
        period: period,
        period_dates: { start: startDate, end: endDate },
        plan: planSlug,
        is_pro: isPro,
        is_premium: isPremium
      }
    };

    return res.json(response);
  } catch (err) {
    console.error('analytics.getAnalytics error:', err);
    return res.status(500).json({ error: 'Erreur serveur lors de la récupération des analytics' });
  }
}

/**
 * Enregistre un événement analytique (visite, clic, scroll, etc.)
 */
async function recordEvent(req, res) {
  try {
    const { 
      portfolio_id, 
      type, 
      page = '/', 
      metadata = {}, 
      session_id = null,
      element_id = null,
      element_class = null,
      element_text = null,
      coordinates_x = null,
      coordinates_y = null,
      scroll_depth = null,
      duration_ms = 0
    } = req.body;

    const adresse_ip = req.body.adresse_ip || req.ip || req.headers['x-forwarded-for'] || null;
    const user_agent = req.body.user_agent || req.headers['user-agent'] || null;
    const referer = req.body.referer || req.headers.referer || null;

    if (!portfolio_id || !type) {
      return res.status(400).json({ error: 'portfolio_id et type sont requis' });
    }

    // Vérifier que le portfolio existe
    const portfolio = await portfolioModel.findById(portfolioId);
    if (!portfolio) return res.status(404).json({ error: 'Portfolio non trouvé' });

    let eventResult, visitResult, conversionResult;

    // 1. Enregistrer l'événement
    try {
      const eventData = {
        portfolio_id,
        type,
        page,
        session_id,
        element_id,
        element_class,
        element_text,
        coordinates_x,
        coordinates_y,
        scroll_depth,
        metadata: JSON.stringify(metadata),
        adresse_ip,
        user_agent
      };

      eventResult = await analyticsEventModel.create(eventData);
    } catch (eventErr) {
      console.error('Error creating analytics event:', eventErr);
      // Continuer même en cas d'erreur sur l'événement
    }

    // 2. Enregistrer une visite si c'est une nouvelle session
    const isNewVisit = type === 'page_view' || type === 'session_start';
    if (isNewVisit) {
      try {
        const visitData = {
          portfolio_id,
          adresse_ip,
          user_agent,
          referer,
          page,
          session_id,
          session_start: new Date(),
          is_new_session: metadata.is_new_session || true,
          device_type: detectDeviceType(user_agent),
          browser: detectBrowser(user_agent),
          os: detectOS(user_agent)
        };

        visitResult = await analyticsEventModel.createVisit(visitData);

        // Mettre à jour ou créer la session utilisateur
        await updateUserSession(session_id, portfolio_id, {
          adresse_ip,
          user_agent,
          referer,
          landing_page: page,
          device_type: visitData.device_type,
          start_time: new Date()
        });

      } catch (visitErr) {
        console.error('Error creating visit:', visitErr);
      }
    }

    // 3. Gérer les types spéciaux d'événements
    switch (type) {
      case 'project_view':
        try {
          const projectId = metadata.project_id;
          if (projectId) {
            await analyticsEventModel.updateProjectView(portfolio_id, projectId, duration_ms);
          }
        } catch (projectErr) {
          console.error('Error updating project view:', projectErr);
        }
        break;

      case 'contact_submit':
      case 'form_submit':
        try {
          const conversionData = {
            portfolio_id,
            type: 'contact',
            contact_method: metadata.method || 'form',
            contact_name: metadata.name || metadata.contact_name || null,
            contact_email: metadata.email || metadata.contact_email || null,
            contact_phone: metadata.phone || metadata.contact_phone || null,
            message: metadata.message || null,
            source_page: page,
            utm_source: metadata.utm_source || null,
            utm_medium: metadata.utm_medium || null,
            utm_campaign: metadata.utm_campaign || null,
            session_id,
            is_qualified: metadata.is_qualified || false
          };

          conversionResult = await analyticsEventModel.createConversion(conversionData);

          // Mettre à jour la session comme convertie
          if (session_id) {
            await pool.query(
              'UPDATE user_sessions SET has_converted = TRUE, conversion_type = ? WHERE id = ?',
              ['contact', session_id]
            );
          }
        } catch (conversionErr) {
          console.error('Error creating conversion:', conversionErr);
        }
        break;

      case 'cv_download':
        try {
          const conversionData = {
            portfolio_id,
            type: 'cv',
            source_page: page,
            session_id,
            is_qualified: true
          };
          conversionResult = await analyticsEventModel.createConversion(conversionData);
        } catch (conversionErr) {
          console.error('Error creating CV conversion:', conversionErr);
        }
        break;
    }

    // 4. Mettre à jour les métriques en temps réel si nécessaire
    if (isNewVisit) {
      await updateRealTimeMetrics(portfolio_id);
    }

    return res.status(201).json({
      success: true,
      event_id: eventResult?.id,
      visit_id: visitResult?.id,
      conversion_id: conversionResult?.id,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('analytics.recordEvent error:', err);
    return res.status(500).json({ error: 'Erreur serveur lors de l\'enregistrement de l\'événement' });
  }
}

/**
 * Flux SSE pour les visiteurs en temps réel
 */
async function streamVisits(req, res) {
  try {
    const userId = req.userId;
    let portfolioId = req.query.portfolio_id ? Number(req.query.portfolio_id) : null;

    // Prendre le premier portfolio si aucun n'est fourni
    if (!portfolioId) {
      const portfolios = await portfolioModel.findByUser(userId);
      if (portfolios && portfolios.length) portfolioId = portfolios[0].id;
    }

    if (!portfolioId) return res.status(400).json({ error: 'portfolio_id est requis' });

    // Vérifier la propriété
    const portfolio = await portfolioModel.findById(portfolioId);
    if (!portfolio) return res.status(404).json({ error: 'Portfolio non trouvé' });
    if (String(portfolio.utilisateur_id) !== String(userId)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Configurer les headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders && res.flushHeaders();

    let stopped = false;
    req.on('close', () => { stopped = true; });

    const sendLiveData = async () => {
      try {
        // Récupérer les données en temps réel
        const liveVisitors = await getLiveVisitors(portfolioId);
        const realTimeMetrics = await getRealTimeMetrics(portfolioId);

        const payload = {
          timestamp: Date.now(),
          live_visitors: liveVisitors.visitors || [],
          live_count: liveVisitors.count || 0,
          metrics: realTimeMetrics,
          updates: await getRecentUpdates(portfolioId)
        };

        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (e) {
        console.warn('Error sending SSE data:', e.message || e);
        // Envoyer un message d'erreur
        res.write(`data: ${JSON.stringify({ error: 'Failed to fetch live data', timestamp: Date.now() })}\n\n`);
      }
    };

    // Envoyer les données initiales
    await sendLiveData();

    // Configurer l'intervalle pour les mises à jour
    const interval = setInterval(async () => {
      if (stopped) {
        clearInterval(interval);
        return;
      }
      await sendLiveData();
    }, 3000); // Toutes les 3 secondes

  } catch (err) {
    console.error('analytics.streamVisits error:', err);
    try { res.end(); } catch (e) {}
  }
}

// ==================== FONCTIONS D'AGGRÉGATION ====================

/**
 * Récupère les visiteurs en direct (dernières 5 minutes)
 */
async function getLiveVisitors(portfolioId) {
  try {
    const [visitors] = await pool.query(`
      SELECT 
        v.id,
        v.adresse_ip,
        v.pays as country,
        v.ville as city,
        v.page,
        v.user_agent,
        v.device_type as device,
        v.browser,
        v.os,
        TIMESTAMPDIFF(SECOND, v.date_visite, NOW()) as duration_seconds,
        v.session_id,
        ts.source_detail as source
      FROM visites v
      LEFT JOIN traffic_sources ts ON DATE(v.date_visite) = ts.date 
        AND v.portfolio_id = ts.portfolio_id
      WHERE v.portfolio_id = ?
        AND v.date_visite >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      ORDER BY v.date_visite DESC
      LIMIT 50
    `, [portfolioId]);

    // Enrichir les données
    const enrichedVisitors = visitors.map(visitor => ({
      id: visitor.id,
      ip: visitor.adresse_ip,
      country: visitor.country,
      city: visitor.city,
      page: visitor.page,
      device: visitor.device || 'desktop',
      browser: visitor.browser || 'Unknown',
      os: visitor.os || 'Unknown',
      duration: formatDuration(visitor.duration_seconds),
      source: visitor.source || 'Direct',
      session_id: visitor.session_id
    }));

    return {
      count: visitors.length,
      visitors: enrichedVisitors,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting live visitors:', error);
    return { count: 0, visitors: [], timestamp: new Date().toISOString() };
  }
}

/**
 * Récupère les sources de trafic
 */
async function getTrafficSources(portfolioId, startDate, endDate) {
  try {
    const [sources] = await pool.query(`
      SELECT 
        source_type,
        source_detail,
        SUM(visits) as total_visits,
        SUM(unique_visitors) as unique_visitors,
        SUM(conversions) as conversions,
        AVG(bounce_rate) as avg_bounce_rate,
        AVG(avg_duration_seconds) as avg_duration
      FROM traffic_sources
      WHERE portfolio_id = ? 
        AND date BETWEEN ? AND ?
      GROUP BY source_type, source_detail
      ORDER BY total_visits DESC
    `, [portfolioId, startDate, endDate]);

    // Calculer les pourcentages
    const totalVisits = sources.reduce((sum, source) => sum + (source.total_visits || 0), 0);

    return sources.map(source => ({
      name: source.source_detail || source.source_type,
      type: source.source_type,
      value: source.total_visits || 0,
      unique_visitors: source.unique_visitors || 0,
      conversions: source.conversions || 0,
      bounce_rate: source.avg_bounce_rate || 0,
      avg_duration: source.avg_duration || 0,
      percentage: totalVisits > 0 ? (source.total_visits / totalVisits * 100).toFixed(1) : 0,
      conversion_rate: source.total_visits > 0 ? ((source.conversions || 0) / source.total_visits * 100).toFixed(1) : 0
    }));
  } catch (error) {
    console.error('Error getting traffic sources:', error);
    return [];
  }
}

/**
 * Récupère les projets les plus consultés
 */
async function getTopProjects(portfolioId, limit = 5, since = null) {
  try {
    const params = [portfolioId];
    let whereClause = 'WHERE pv.portfolio_id = ?';
    
    if (since) {
      whereClause += ' AND pv.last_viewed >= ?';
      params.push(since);
    }

    const [projects] = await pool.query(`
      SELECT 
        p.id,
        p.titre as name,
        pv.view_count as views,
        pv.unique_views,
        pv.total_time_ms,
        pv.last_viewed,
        ROUND(pv.total_time_ms / NULLIF(pv.view_count, 0)) as avg_duration_ms,
        ROUND((pv.view_count / (
          SELECT MAX(view_count) FROM projet_views WHERE portfolio_id = ?
        )) * 100) as popularity_score
      FROM projet_views pv
      JOIN projets p ON pv.projet_id = p.id
      ${whereClause}
      ORDER BY pv.view_count DESC
      LIMIT ?
    `, [...params, portfolioId, limit]);

    return projects.map(project => ({
      id: project.id,
      name: project.name,
      views: project.views,
      unique_views: project.unique_views,
      total_time_ms: project.total_time_ms,
      avg_duration: formatDuration(Math.round(project.avg_duration_ms / 1000)),
      popularity_score: project.popularity_score || 0,
      last_viewed: project.last_viewed
    }));
  } catch (error) {
    console.error('Error getting top projects:', error);
    return [];
  }
}

/**
 * Récupère les interactions clés (contacts, CV, etc.)
 */
async function getKeyInteractions(portfolioId, since = null) {
  try {
    const params = [portfolioId];
    let whereClause = 'WHERE portfolio_id = ? AND type IN (\'contact_submit\', \'form_submit\', \'cv_download\', \'appointment_book\')';
    
    if (since) {
      whereClause += ' AND created_at >= ?';
      params.push(since);
    }

    // Interactions des événements
    const [eventInteractions] = await pool.query(`
      SELECT 
        type,
        COUNT(*) as count,
        COUNT(DISTINCT session_id) as unique_users,
        DATE(created_at) as interaction_date
      FROM analytics_events
      ${whereClause}
      GROUP BY type, DATE(created_at)
      ORDER BY interaction_date DESC, count DESC
    `, params);

    // Conversions (contacts réussis)
    const [conversions] = await pool.query(`
      SELECT 
        type,
        COUNT(*) as count,
        COUNT(DISTINCT session_id) as unique_users,
        DATE(created_at) as conversion_date,
        SUM(CASE WHEN is_qualified THEN 1 ELSE 0 END) as qualified_count
      FROM conversions
      WHERE portfolio_id = ? ${since ? 'AND created_at >= ?' : ''}
      GROUP BY type, DATE(created_at)
      ORDER BY conversion_date DESC, count DESC
    `, since ? [portfolioId, since] : [portfolioId]);

    // Calculer les taux de conversion
    const totalEvents = eventInteractions.reduce((sum, item) => sum + item.count, 0);
    const totalConversions = conversions.reduce((sum, item) => sum + item.count, 0);
    const conversionRate = totalEvents > 0 ? (totalConversions / totalEvents * 100).toFixed(1) : 0;

    return {
      event_interactions: eventInteractions,
      conversions: conversions,
      totals: {
        total_events: totalEvents,
        total_conversions: totalConversions,
        conversion_rate: conversionRate,
        qualified_conversions: conversions.reduce((sum, item) => sum + (item.qualified_count || 0), 0)
      },
      by_type: groupInteractionsByType([...eventInteractions, ...conversions])
    };
  } catch (error) {
    console.error('Error getting key interactions:', error);
    return { event_interactions: [], conversions: [], totals: {}, by_type: {} };
  }
}

/**
 * Calcule le score de performance
 */
async function calculatePerformanceScore(portfolioId) {
  try {
    // Utiliser la fonction du modèle pour calculer le score
    const scoreData = await analyticsEventModel.calculatePerformanceScore(portfolioId);
    
    if (scoreData) {
      return {
        overall_score: scoreData.overall_score,
        breakdown: {
          traffic: {
            score: scoreData.traffic_score,
            visits: scoreData.metrics.total_visits,
            unique_visitors: scoreData.metrics.unique_visitors,
            target: 1000
          },
          engagement: {
            score: scoreData.engagement_score,
            avg_duration: formatDuration(scoreData.metrics.avg_duration_seconds),
            bounce_rate: scoreData.metrics.bounce_rate,
            target_duration: '3:00'
          },
          conversion: {
            score: scoreData.conversion_score,
            rate: `${scoreData.metrics.conversion_rate.toFixed(1)}%`,
            conversions: scoreData.metrics.conversion_rate * scoreData.metrics.total_visits / 100,
            target_rate: '5%'
          },
          content: {
            score: scoreData.content_score,
            project_count: scoreData.metrics.project_count,
            project_views: scoreData.metrics.project_views,
            target_views: 500
          },
          technical: {
            score: scoreData.technical_score,
            issues: [],
            recommendations: []
          }
        },
        trends: {
          traffic: scoreData.trend_traffic || 0,
          engagement: scoreData.trend_engagement || 0,
          conversion: scoreData.trend_conversion || 0
        },
        last_updated: new Date().toISOString()
      };
    }

    // Fallback si le score n'est pas calculé
    return await calculateFallbackScore(portfolioId);
    
  } catch (error) {
    console.error('Error calculating performance score:', error);
    return await calculateFallbackScore(portfolioId);
  }
}

/**
 * Vue d'ensemble des analytics
 */
async function getAnalyticsOverview(portfolioId, startDate, endDate) {
  try {
    const [
      totals,
      realtime,
      devices,
      geolocation
    ] = await Promise.all([
      // Totaux
      pool.query(`
        SELECT 
          COUNT(*) as total_visits,
          COUNT(DISTINCT adresse_ip) as unique_visitors,
          AVG(TIMESTAMPDIFF(SECOND, session_start, COALESCE(session_end, NOW()))) as avg_session_duration,
          SUM(CASE WHEN page_count <= 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as bounce_rate
        FROM user_sessions
        WHERE portfolio_id = ? 
          AND start_time BETWEEN ? AND ?
      `, [portfolioId, startDate, endDate]),
      
      // En temps réel
      getLiveVisitors(portfolioId),
      
      // Appareils
      pool.query(`
        SELECT 
          device_type,
          COUNT(*) as count,
          COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
        FROM visites
        WHERE portfolio_id = ? 
          AND date_visite BETWEEN ? AND ?
        GROUP BY device_type
      `, [portfolioId, startDate, endDate]),
      
      // Géolocalisation
      pool.query(`
        SELECT 
          pays as country,
          COUNT(*) as visits,
          COUNT(DISTINCT adresse_ip) as unique_visitors
        FROM visites
        WHERE portfolio_id = ? 
          AND date_visite BETWEEN ? AND ?
          AND pays IS NOT NULL
        GROUP BY pays
        ORDER BY visits DESC
        LIMIT 10
      `, [portfolioId, startDate, endDate])
    ]);

    const totalsData = totals[0] && totals[0][0];
    const devicesData = devices[0] || [];
    const geolocationData = geolocation[0] || [];

    return {
      totals: {
        visits: totalsData?.total_visits || 0,
        unique_visitors: totalsData?.unique_visitors || 0,
        avg_session_duration: formatDuration(totalsData?.avg_session_duration || 0),
        bounce_rate: totalsData?.bounce_rate ? parseFloat(totalsData.bounce_rate).toFixed(1) : '0.0'
      },
      realtime: {
        live_visitors: realtime.count,
        active_sessions: await getActiveSessionsCount(portfolioId)
      },
      devices: devicesData.map(device => ({
        type: device.device_type,
        count: device.count,
        percentage: parseFloat(device.percentage).toFixed(1)
      })),
      top_countries: geolocationData.map(country => ({
        country: country.country,
        visits: country.visits,
        unique_visitors: country.unique_visitors
      }))
    };
  } catch (error) {
    console.error('Error getting analytics overview:', error);
    return {
      totals: { visits: 0, unique_visitors: 0, avg_session_duration: '0:00', bounce_rate: '0.0' },
      realtime: { live_visitors: 0, active_sessions: 0 },
      devices: [],
      top_countries: []
    };
  }
}

// ==================== FONCTIONS AUXILIAIRES ====================

function calculateDateRange(period) {
  const now = new Date();
  const startDate = new Date(now);
  
  switch (period) {
    case '24h':
      startDate.setHours(now.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
      break;
    case 'all':
      startDate.setFullYear(2000); // Date très ancienne
      break;
    default:
      startDate.setDate(now.getDate() - 30);
  }
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: now.toISOString().split('T')[0]
  };
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function detectDeviceType(userAgent) {
  if (!userAgent) return 'other';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod/.test(ua)) return 'mobile';
  if (/tablet|ipad/.test(ua)) return 'tablet';
  if (/bot|crawl|spider/.test(ua)) return 'bot';
  return 'desktop';
}

function detectBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (/chrome/.test(ua)) return 'Chrome';
  if (/firefox/.test(ua)) return 'Firefox';
  if (/safari/.test(ua)) return 'Safari';
  if (/edge/.test(ua)) return 'Edge';
  if (/opera/.test(ua)) return 'Opera';
  return 'Other';
}

function detectOS(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (/windows/.test(ua)) return 'Windows';
  if (/mac os|macos/.test(ua)) return 'macOS';
  if (/linux/.test(ua)) return 'Linux';
  if (/android/.test(ua)) return 'Android';
  if (/iphone|ipad|ios/.test(ua)) return 'iOS';
  return 'Other';
}

async function updateUserSession(sessionId, portfolioId, data) {
  if (!sessionId) return;
  
  try {
    await pool.query(`
      INSERT INTO user_sessions (id, portfolio_id, adresse_ip, user_agent, referer, landing_page, device_type, start_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        page_count = page_count + 1,
        end_time = NOW(),
        duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW()),
        exit_page = ?,
        is_bounced = page_count <= 1
    `, [
      sessionId, portfolioId, data.adresse_ip, data.user_agent, data.referer,
      data.landing_page, data.device_type, data.start_time,
      data.landing_page
    ]);
  } catch (error) {
    console.error('Error updating user session:', error);
  }
}

async function updateRealTimeMetrics(portfolioId) {
  try {
    // Cette fonction pourrait être utilisée pour mettre à jour des métriques en cache
    // ou déclencher des calculs en arrière-plan
    console.log(`Real-time metrics updated for portfolio ${portfolioId}`);
  } catch (error) {
    console.error('Error updating real-time metrics:', error);
  }
}

async function getRealTimeMetrics(portfolioId) {
  try {
    const [metrics] = await pool.query(`
      SELECT 
        COUNT(*) as visits_today,
        COUNT(DISTINCT adresse_ip) as unique_today,
        (SELECT COUNT(*) FROM conversions WHERE portfolio_id = ? AND DATE(created_at) = CURDATE()) as conversions_today
      FROM visites
      WHERE portfolio_id = ? AND DATE(date_visite) = CURDATE()
    `, [portfolioId, portfolioId]);

    return metrics[0] || { visits_today: 0, unique_today: 0, conversions_today: 0 };
  } catch (error) {
    console.error('Error getting real-time metrics:', error);
    return { visits_today: 0, unique_today: 0, conversions_today: 0 };
  }
}

async function getRecentUpdates(portfolioId) {
  try {
    const [updates] = await pool.query(`
      SELECT 
        'conversion' as type,
        contact_name as title,
        created_at
      FROM conversions
      WHERE portfolio_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      UNION ALL
      SELECT 
        'project_view' as type,
        p.titre as title,
        pv.last_viewed as created_at
      FROM projet_views pv
      JOIN projets p ON pv.projet_id = p.id
      WHERE pv.portfolio_id = ?
        AND pv.last_viewed >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      ORDER BY created_at DESC
      LIMIT 10
    `, [portfolioId, portfolioId]);

    return updates;
  } catch (error) {
    console.error('Error getting recent updates:', error);
    return [];
  }
}

async function getActiveSessionsCount(portfolioId) {
  try {
    const [result] = await pool.query(`
      SELECT COUNT(*) as active_sessions
      FROM user_sessions
      WHERE portfolio_id = ?
        AND end_time IS NULL
        AND start_time >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
    `, [portfolioId]);

    return result[0]?.active_sessions || 0;
  } catch (error) {
    console.error('Error getting active sessions count:', error);
    return 0;
  }
}

function groupInteractionsByType(interactions) {
  const grouped = {};
  
  interactions.forEach(interaction => {
    const type = interaction.type;
    if (!grouped[type]) {
      grouped[type] = {
        total_count: 0,
        unique_users: 0,
        qualified_count: 0,
        dates: {}
      };
    }
    
    grouped[type].total_count += interaction.count || 0;
    grouped[type].unique_users += interaction.unique_users || 0;
    grouped[type].qualified_count += interaction.qualified_count || 0;
    
    const date = interaction.interaction_date || interaction.conversion_date;
    if (date) {
      if (!grouped[type].dates[date]) {
        grouped[type].dates[date] = {
          count: 0,
          unique_users: 0
        };
      }
      grouped[type].dates[date].count += interaction.count || 0;
      grouped[type].dates[date].unique_users += interaction.unique_users || 0;
    }
  });
  
  return grouped;
}

async function calculateFallbackScore(portfolioId) {
  // Calcul de secours si le calcul principal échoue
  try {
    const [visits] = await pool.query(
      'SELECT COUNT(*) as total_visits FROM visites WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
      [portfolioId]
    );
    
    const totalVisits = visits[0]?.total_visits || 0;
    const baseScore = Math.min(100, Math.round((totalVisits / 100) * 100));
    
    return {
      overall_score: baseScore,
      breakdown: {
        traffic: { score: baseScore, visits: totalVisits, target: 1000 },
        engagement: { score: Math.min(100, baseScore + 10), avg_duration: '1:30', bounce_rate: 45, target_duration: '3:00' },
        conversion: { score: Math.min(100, baseScore - 20), rate: '2.5%', conversions: Math.round(totalVisits * 0.025), target_rate: '5%' },
        content: { score: 70, project_count: 3, project_views: 150, target_views: 500 },
        technical: { score: 85, issues: [], recommendations: [] }
      },
      trends: { traffic: 5, engagement: 2, conversion: 1 },
      last_updated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error calculating fallback score:', error);
    return {
      overall_score: 50,
      breakdown: {
        traffic: { score: 50, visits: 0, target: 1000 },
        engagement: { score: 50, avg_duration: '0:00', bounce_rate: 0, target_duration: '3:00' },
        conversion: { score: 50, rate: '0%', conversions: 0, target_rate: '5%' },
        content: { score: 50, project_count: 0, project_views: 0, target_views: 500 },
        technical: { score: 50, issues: [], recommendations: [] }
      },
      trends: { traffic: 0, engagement: 0, conversion: 0 },
      last_updated: new Date().toISOString()
    };
  }
}

// ==================== FONCTIONS POUR PLANS PREMIUM ====================

async function getSessions(portfolioId, startDate, endDate) {
  try {
    const [sessions] = await pool.query(`
      SELECT 
        id,
        landing_page,
        device_type,
        country,
        start_time,
        end_time,
        duration_seconds,
        page_count,
        is_bounced,
        has_converted,
        conversion_type,
        exit_page
      FROM user_sessions
      WHERE portfolio_id = ? 
        AND start_time BETWEEN ? AND ?
      ORDER BY start_time DESC
      LIMIT 100
    `, [portfolioId, startDate, endDate]);

    return sessions.map(session => ({
      id: session.id,
      landing_page: session.landing_page,
      device: session.device_type,
      country: session.country,
      start_time: session.start_time,
      duration: formatDuration(session.duration_seconds),
      page_count: session.page_count,
      is_bounced: session.is_bounced,
      has_converted: session.has_converted,
      conversion_type: session.conversion_type,
      exit_page: session.exit_page
    }));
  } catch (error) {
    console.error('Error getting sessions:', error);
    return [];
  }
}

async function getVisitsOverTime(portfolioId, period, startDate) {
  try {
    let groupBy, dateFormat;
    
    if (period === '24h') {
      groupBy = 'HOUR(date_visite)';
      dateFormat = '%H:00';
    } else {
      groupBy = 'DATE(date_visite)';
      dateFormat = '%Y-%m-%d';
    }

    const [visits] = await pool.query(`
      SELECT 
        DATE_FORMAT(date_visite, ?) as date,
        COUNT(*) as visites,
        COUNT(DISTINCT adresse_ip) as uniques
      FROM visites
      WHERE portfolio_id = ? 
        AND date_visite >= ?
      GROUP BY ${groupBy}
      ORDER BY date_visite ASC
    `, [dateFormat, portfolioId, startDate]);

    return visits;
  } catch (error) {
    console.error('Error getting visits over time:', error);
    return [];
  }
}

async function getDeviceBreakdown(portfolioId, startDate, endDate) {
  try {
    const [devices] = await pool.query(`
      SELECT 
        device_type,
        COUNT(*) as visits,
        COUNT(DISTINCT adresse_ip) as unique_visitors,
        AVG(TIMESTAMPDIFF(SECOND, session_start, COALESCE(session_end, NOW()))) as avg_duration,
        SUM(CASE WHEN page_count <= 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as bounce_rate
      FROM visites v
      LEFT JOIN user_sessions us ON v.session_id = us.id
      WHERE v.portfolio_id = ? 
        AND v.date_visite BETWEEN ? AND ?
      GROUP BY device_type
    `, [portfolioId, startDate, endDate]);

    return devices;
  } catch (error) {
    console.error('Error getting device breakdown:', error);
    return [];
  }
}

async function getGeographicalData(portfolioId, startDate, endDate) {
  try {
    const [geoData] = await pool.query(`
      SELECT 
        pays as country,
        ville as city,
        COUNT(*) as visits,
        COUNT(DISTINCT adresse_ip) as unique_visitors,
        AVG(latitude) as avg_lat,
        AVG(longitude) as avg_lng
      FROM visites
      WHERE portfolio_id = ? 
        AND date_visite BETWEEN ? AND ?
        AND pays IS NOT NULL
      GROUP BY pays, ville
      ORDER BY visits DESC
    `, [portfolioId, startDate, endDate]);

    return geoData;
  } catch (error) {
    console.error('Error getting geographical data:', error);
    return [];
  }
}

async function getHeatmapData(portfolioId, startDate, endDate) {
  try {
    const [heatmap] = await pool.query(`
      SELECT 
        page,
        ROUND(coordinates_x, 2) as x,
        ROUND(coordinates_y, 2) as y,
        COUNT(*) as intensity
      FROM analytics_events
      WHERE portfolio_id = ? 
        AND created_at BETWEEN ? AND ?
        AND coordinates_x IS NOT NULL 
        AND coordinates_y IS NOT NULL
        AND type = 'click'
      GROUP BY page, ROUND(coordinates_x, 2), ROUND(coordinates_y, 2)
      ORDER BY intensity DESC
      LIMIT 1000
    `, [portfolioId, startDate, endDate]);

    return heatmap;
  } catch (error) {
    console.error('Error getting heatmap data:', error);
    return [];
  }
}

async function getAIInsights(portfolioId) {
  try {
    const [insights] = await pool.query(`
      SELECT 
        insight_type,
        title,
        description,
        confidence_score,
        related_metrics,
        suggested_action,
        action_url,
        impact_score,
        generated_at
      FROM ai_insights
      WHERE portfolio_id = ?
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY confidence_score DESC, generated_at DESC
      LIMIT 10
    `, [portfolioId]);

    return insights;
  } catch (error) {
    console.error('Error getting AI insights:', error);
    return [];
  }
}

async function getGamificationBadges(portfolioId) {
  try {
    const [badges] = await pool.query(`
      SELECT 
        badge_key,
        badge_name,
        badge_description,
        badge_type,
        category,
        current_value,
        required_value,
        progress_percentage,
        is_earned,
        earned_at,
        metadata
      FROM gamification_badges
      WHERE portfolio_id = ?
      ORDER BY 
        is_earned DESC,
        badge_type DESC,
        earned_at DESC
    `, [portfolioId]);

    return badges;
  } catch (error) {
    console.error('Error getting gamification badges:', error);
    return [];
  }
}

async function getSEOKeywords(portfolioId) {
  try {
    // Cette fonction est un placeholder - à implémenter avec un service SEO
    return [
      { keyword: 'développeur react', position: 3, volume: 1200, difficulty: 25, change: 2 },
      { keyword: 'portfolio développeur web', position: 7, volume: 2400, difficulty: 45, change: -1 },
      { keyword: 'freelance javascript', position: 12, volume: 890, difficulty: 18, change: 0 }
    ];
  } catch (error) {
    console.error('Error getting SEO keywords:', error);
    return [];
  }
}

async function getConversionFunnel(portfolioId, startDate, endDate) {
  try {
    const [funnel] = await pool.query(`
      SELECT 
        'Visites' as step,
        COUNT(*) as count
      FROM visites
      WHERE portfolio_id = ? 
        AND date_visite BETWEEN ? AND ?
      UNION ALL
      SELECT 
        'Projets vus' as step,
        COUNT(DISTINCT projet_id) as count
      FROM projet_views
      WHERE portfolio_id = ?
        AND last_viewed BETWEEN ? AND ?
      UNION ALL
      SELECT 
        'Interactions' as step,
        COUNT(*) as count
      FROM analytics_events
      WHERE portfolio_id = ?
        AND created_at BETWEEN ? AND ?
        AND type IN ('contact_click', 'cv_download', 'form_submit')
      UNION ALL
      SELECT 
        'Conversions' as step,
        COUNT(*) as count
      FROM conversions
      WHERE portfolio_id = ?
        AND created_at BETWEEN ? AND ?
        AND is_qualified = TRUE
    `, [
      portfolioId, startDate, endDate,
      portfolioId, startDate, endDate,
      portfolioId, startDate, endDate,
      portfolioId, startDate, endDate
    ]);

    return funnel;
  } catch (error) {
    console.error('Error getting conversion funnel:', error);
    return [];
  }
}

// ==================== EXPORTS ====================

module.exports = {
  getAnalytics,
  recordEvent,
  streamVisits,
  getLiveVisitors,
  getTrafficSources,
  getTopProjects,
  getKeyInteractions,
  calculatePerformanceScore,
  getAnalyticsOverview
};

// Backwards-compatible alias for routes expecting `summary`
async function summary(req, res) {
  return getAnalytics(req, res);
}

module.exports.summary = summary;