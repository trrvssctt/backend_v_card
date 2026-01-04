const { pool } = require('../db');
const portfolioModel = require('../models/portfolioModel');
const analyticsEventModel = require('../models/analyticsEventModel');
const planModel = require('../models/planModel');

// Return aggregated summary for a portfolio and a time range (days)
async function summary(req, res) {
  try {
    const userId = req.userId; // from auth middleware
    const portfolioId = Number(req.query.portfolio_id);
    const rangeDays = Math.max(Number(req.query.range) || 30, 1);
    if (!portfolioId) return res.status(400).json({ error: 'portfolio_id is required' });

    // ownership check — allow if requester is owner OR an admin
    const portfolio = await portfolioModel.findById(portfolioId);
    if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });
    const isOwner = String(portfolio.utilisateur_id) === String(userId);
    const payload = req.userPayload || {};
    const role = (payload.role || '').toString().toLowerCase();
    const isAdminToken = role.includes('admin') || (payload.token_type && String(payload.token_type).toLowerCase() === 'admin');
    if (!isOwner && !isAdminToken) return res.status(403).json({ error: 'Forbidden' });

    // date range
    const [totRows] = await pool.query(
      `SELECT COUNT(*) AS total_visits, COUNT(DISTINCT adresse_ip) AS unique_visitors
       FROM visites
       WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL ? DAY)`, [portfolioId, rangeDays]
    );
    const totals = totRows && totRows[0] ? totRows[0] : { total_visits: 0, unique_visitors: 0 };

    // top countries
    const [countries] = await pool.query(
      `SELECT pays AS country, COUNT(*) AS cnt FROM visites WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY country ORDER BY cnt DESC LIMIT 10`, [portfolioId, rangeDays]
    );

    // top referrers
    const [referrers] = await pool.query(
      `SELECT COALESCE(NULLIF(SUBSTRING_INDEX(referer, '/', 3),''), 'direct') AS ref, COUNT(*) AS cnt
       FROM visites
       WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY ref ORDER BY cnt DESC LIMIT 10`, [portfolioId, rangeDays]
    );

    // devices: naive user agent parsing
    const [agents] = await pool.query(
      `SELECT user_agent FROM visites WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL ? DAY)`, [portfolioId, rangeDays]
    );
    const deviceCounts = { Desktop: 0, Mobile: 0, Tablet: 0 };
    for (const r of agents) {
      const ua = (r.user_agent || '').toLowerCase();
      if (/mobile|android|iphone|ipod/.test(ua)) deviceCounts.Mobile++;
      else if (/tablet|ipad/.test(ua)) deviceCounts.Tablet++;
      else deviceCounts.Desktop++;
    }

    // visits over time (per day)
    const [perDay] = await pool.query(
      `SELECT DATE(date_visite) AS day, COUNT(*) AS visits
       FROM visites
       WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY day ORDER BY day ASC`, [portfolioId, rangeDays]
    );

    return res.json({
      totals: { total_visits: Number(totals.total_visits || 0), unique_visitors: Number(totals.unique_visitors || 0) },
      countries: countries || [],
      referrers: referrers || [],
      deviceCounts,
      perDay: perDay || [],
    });
  } catch (err) {
    console.error('analytics.summary error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Simple SSE stream that pushes recent visits and current active count for a portfolio
async function streamVisits(req, res) {
  try {
    const tokenUserId = req.userId; // from auth
    const portfolioId = Number(req.query.portfolio_id);
    if (!portfolioId) return res.status(400).json({ error: 'portfolio_id is required' });

    // ownership check
    const portfolio = await portfolioModel.findById(portfolioId);
    if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });
    if (String(portfolio.utilisateur_id) !== String(tokenUserId)) return res.status(403).json({ error: 'Forbidden' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    let stopped = false;
    req.on('close', () => { stopped = true; });

    const sendSnapshot = async () => {
      try {
        // active in last 2 minutes
        const [activeRows] = await pool.query(`SELECT COUNT(*) AS active FROM visites WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)`, [portfolioId]);
        const active = activeRows && activeRows[0] ? Number(activeRows[0].active) : 0;

        // recent visits (last 10)
        const [recent] = await pool.query(`SELECT id, adresse_ip AS visitor_ip, user_agent, referer, pays AS country, date_visite FROM visites WHERE portfolio_id = ? ORDER BY date_visite DESC LIMIT 10`, [portfolioId]);

        const payload = { active, recent: recent || [], timestamp: Date.now() };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (e) {
        console.warn('analytics.streamVisits send error', e.message || e);
      }
    };

    // initial
    await sendSnapshot();

    const iv = setInterval(async () => {
      if (stopped) { clearInterval(iv); return; }
      await sendSnapshot();
    }, 3000); // every 3s

  } catch (err) {
    console.error('analytics.streamVisits error:', err);
    try { res.end(); } catch (e) {}
  }
}

// Public endpoint for recording analytics events (click, scroll, move, interaction, project_view)
async function recordEvent(req, res) {
  try {
    const { portfolio_id, type, page = null, payload = null } = req.body;
    const adresse_ip = req.body.adresse_ip || req.ip || req.headers['x-forwarded-for'] || null;
    const user_agent = req.body.user_agent || req.headers['user-agent'] || null;
    if (!portfolio_id || !type) return res.status(400).json({ error: 'portfolio_id and type required' });
    // store event
    const ev = await analyticsEventModel.create({ portfolio_id, type, page, payload, adresse_ip, user_agent });
    return res.status(201).json({ ok: true, event: ev });
  } catch (err) {
    console.error('analytics.recordEvent error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Helper: aggregate interactions and project_views from analytics_events
async function aggregateEvents(portfolioId, since) {
  const counts = await analyticsEventModel.countByType(portfolioId, since);
  const map = {};
  for (const r of counts) map[r.type] = Number(r.cnt);
  // project views: fetch latest project_view events and aggregate per payload.project_id
  const events = await analyticsEventModel.findByPortfolio(portfolioId, since);
  const projectViews = {};
  const interactions = {};
  const clicks = [];
  for (const e of events) {
    try {
      const payload = e.payload ? JSON.parse(e.payload) : null;
      if (e.type === 'project_view' && payload && payload.project_id) {
        projectViews[payload.project_id] = (projectViews[payload.project_id] || 0) + 1;
      }
      if (e.type === 'interaction' && payload && payload.name) {
        interactions[payload.name] = (interactions[payload.name] || 0) + 1;
      }
      if (e.type === 'click' && payload && typeof payload.x === 'number' && typeof payload.y === 'number') {
        clicks.push({ x: payload.x, y: payload.y, page: e.page });
      }
    } catch (e) { /* ignore parse errors */ }
  }
  const projectViewsArr = Object.entries(projectViews).map(([id, views]) => ({ id, views }));
  const interactionsArr = Object.entries(interactions).map(([name, cnt]) => ({ name, cnt }));

  // heatmap bucket aggregation (simple grid 10x10)
  const heatmap = {};
  for (const c of clicks) {
    const page = c.page || 'default';
    const gx = Math.floor(Math.min(Math.max(c.x, 0), 1) * 9); // assuming normalized 0..1
    const gy = Math.floor(Math.min(Math.max(c.y, 0), 1) * 9);
    const key = `${page}:${gx}:${gy}`;
    heatmap[key] = (heatmap[key] || 0) + 1;
  }

  return { counts: map, projectViews: projectViewsArr, interactions: interactionsArr, heatmap }; 
}

module.exports = { summary, streamVisits, recordEvent, getAnalytics, aggregateEvents };

async function getAnalytics(req, res) {
  try {
    const userId = req.userId;
    const period = (req.query.period || '30d').toString();
    let portfolioId = req.query.portfolio_id ? Number(req.query.portfolio_id) : null;

    // if no portfolio_id provided, pick the first portfolio of the user
    if (!portfolioId) {
      const portfolioModel = require('../models/portfolioModel');
      const portfolios = await portfolioModel.findByUser(userId);
      if (!portfolios || portfolios.length === 0) return res.status(404).json({ error: 'No portfolio found for user' });
      portfolioId = portfolios[0].id;
    }

    const now = new Date();
    let startDate = new Date();
    if (period === '24h') startDate.setHours(now.getHours() - 24);
    else if (period === '7d') startDate.setDate(now.getDate() - 7);
    else if (period === '30d') startDate.setDate(now.getDate() - 30);
    else if (period === '90d') startDate.setDate(now.getDate() - 90);
    else startDate = new Date(0);

    // total visits and unique visitors
    const [totRows] = await pool.query(`SELECT COUNT(*) AS total_visits, COUNT(DISTINCT adresse_ip) AS unique_visitors FROM visites WHERE portfolio_id = ? AND date_visite >= ?`, [portfolioId, startDate]);
    const totals = totRows && totRows[0] ? totRows[0] : { total_visits: 0, unique_visitors: 0 };

    // recent live visitors (last 2 minutes)
    const [liveRows] = await pool.query(`SELECT COUNT(*) AS live FROM visites WHERE portfolio_id = ? AND date_visite >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)`, [portfolioId]);
    const live = liveRows && liveRows[0] ? Number(liveRows[0].live) : 0;

    // device counts
    const [uaRows] = await pool.query(`SELECT user_agent FROM visites WHERE portfolio_id = ? AND date_visite >= ?`, [portfolioId, startDate]);
    let mobile = 0, tablet = 0, desktop = 0;
    const uaList = uaRows || [];
    for (const r of uaList) {
      const ua = (r.user_agent || '').toLowerCase();
      if (/mobile|android|iphone|ipod/.test(ua)) mobile++;
      else if (/tablet|ipad/.test(ua)) tablet++;
      else desktop++;
    }
    const totalUa = mobile + tablet + desktop || 1;

    // top country
    const [countries] = await pool.query(`SELECT pays AS country, COUNT(*) AS cnt FROM visites WHERE portfolio_id = ? AND date_visite >= ? GROUP BY country ORDER BY cnt DESC LIMIT 1`, [portfolioId, startDate]);
    const topCountry = countries && countries[0] ? countries[0].country || '' : '';

    // visits over time (per day or per hour for 24h)
    let visitsOver = [];
    if (period === '24h') {
      const [rows] = await pool.query(`SELECT DATE_FORMAT(date_visite, '%Y-%m-%d %H:00:00') AS slot, COUNT(*) AS visits FROM visites WHERE portfolio_id = ? AND date_visite >= ? GROUP BY slot ORDER BY slot ASC`, [portfolioId, startDate]);
      visitsOver = rows.map(r => ({ date: r.slot, visites: Number(r.visits) }));
    } else {
      const [rows] = await pool.query(`SELECT DATE(date_visite) AS day, COUNT(*) AS visits, COUNT(DISTINCT adresse_ip) AS uniques FROM visites WHERE portfolio_id = ? AND date_visite >= ? GROUP BY day ORDER BY day ASC`, [portfolioId, startDate]);
      visitsOver = rows.map(r => ({ date: r.day, visites: Number(r.visits), uniques: Number(r.uniques) }));
    }

    // traffic sources (simple host-based grouping)
    const [refRows] = await pool.query(`SELECT referer FROM visites WHERE portfolio_id = ? AND date_visite >= ?`, [portfolioId, startDate]);
    const refCounts = {};
    for (const r of refRows) {
      const ref = r.referer || '';
      let key = 'Direct';
      try {
        if (ref && ref.length > 0) {
          const url = new URL(ref, 'http://example.com');
          const host = url.hostname.replace('www.', '').toLowerCase();
          if (host.includes('google')) key = 'Google';
          else if (host.includes('instagram')) key = 'Instagram';
          else if (host.includes('linkedin')) key = 'LinkedIn';
          else if (host.includes('tiktok')) key = 'TikTok';
          else if (host.includes('whatsapp')) key = 'WhatsApp';
          else key = host;
        }
      } catch (e) { key = 'Other'; }
      refCounts[key] = (refCounts[key] || 0) + 1;
    }
    const trafficSources = Object.entries(refCounts).map(([name, value]) => ({ name, value }));

    // sessions approximation: group by adresse_ip with 30min gap
    const [visRows] = await pool.query(`SELECT id, adresse_ip, date_visite FROM visites WHERE portfolio_id = ? AND date_visite >= ? ORDER BY adresse_ip, date_visite ASC`, [portfolioId, startDate]);
    const sessions = [];
    let currentSession = null;
    for (const v of visRows) {
      const ip = v.adresse_ip || 'unknown';
      const ts = new Date(v.date_visite).getTime();
      if (!currentSession || currentSession.ip !== ip || (ts - currentSession.lastTs) > (30 * 60 * 1000)) {
        // push previous
        if (currentSession) sessions.push(currentSession);
        currentSession = { ip, firstTs: ts, lastTs: ts, count: 1 };
      } else {
        currentSession.lastTs = ts;
        currentSession.count += 1;
      }
    }
    if (currentSession) sessions.push(currentSession);

    const sessionCount = sessions.length || 1;
    const totalSessionTime = sessions.reduce((acc, s) => acc + Math.max(0, s.lastTs - s.firstTs), 0);
    const avgTimeSeconds = Math.round((totalSessionTime / sessionCount) / 1000);
    const bounceCount = sessions.filter(s => s.count <= 1).length;
    const bounceRate = Math.round((bounceCount / sessionCount) * 100);
    const engagedCount = sessions.filter(s => (s.lastTs - s.firstTs) >= 30 * 1000).length;
    const engagementRate = Math.round((engagedCount / sessionCount) * 100);

    // include event-based aggregates for premium/business plans
    // detect user's plan
    const userPlans = await planModel.listUserPlans(userId);
    const latestPlan = userPlans && userPlans.length ? userPlans[0] : null;
    const planSlug = latestPlan && latestPlan.slug ? String(latestPlan.slug).toLowerCase() : '';
    const isPremium = planSlug.includes('premium') || planSlug.includes('business');

    // base response
    const baseResponse = {
      live_visitors: live,
      device_mobile: Math.round((mobile / totalUa) * 100),
      device_tablet: Math.round((tablet / totalUa) * 100),
      device_desktop: Math.round((desktop / totalUa) * 100),
      top_country: topCountry || null,
      visits_over_time: visitsOver,
      traffic_sources: trafficSources,
      total_visitors: Number(totals.unique_visitors || 0),
      total_visits: Number(totals.total_visits || 0),
      avg_time: `${avgTimeSeconds}s`,
      bounce_rate: bounceRate,
      engagement_rate: engagementRate,
      interactions: [],
      project_views: [],
    };

    if (isPremium) {
      try {
        const agg = await aggregateEvents(portfolioId, startDate);
        // map projectViews to include project name
        const projectViews = [];
        for (const pv of agg.projectViews || []) {
          let name = null;
          try {
            const [rows] = await pool.query('SELECT titre FROM projets WHERE id = ? LIMIT 1', [pv.id]);
            if (rows && rows[0]) name = rows[0].titre || null;
          } catch (e) { /* ignore */ }
          projectViews.push({ id: pv.id, name: name || `#${pv.id}`, views: pv.views });
        }

        const interactions = (agg.interactions || []).map(i => ({ name: i.name, clics: i.cnt || i.count || i.clics || 0 }));

        // heatmap: convert keys to structured buckets
        const heatmap = Object.entries(agg.heatmap || {}).map(([k, v]) => {
          const [page, gx, gy] = k.split(':');
          return { page, gx: Number(gx), gy: Number(gy), count: Number(v) };
        });

        // include sessions approximation computed earlier
        const sessionsOut = sessions.map(s => ({ ip: s.ip, duration_seconds: Math.round((s.lastTs - s.firstTs) / 1000), events: s.count }));

        return res.json({ ...baseResponse, interactions, project_views: projectViews, heatmap, sessions: sessionsOut });
      } catch (e) {
        console.warn('analytics.getAnalytics: failed to include premium aggregates', e.message || e);
        return res.json(baseResponse);
      }
    }

    return res.json(baseResponse);
  } catch (err) {
    console.error('analytics.getAnalytics error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { summary, streamVisits, recordEvent, getAnalytics, aggregateEvents };
