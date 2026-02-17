import { generateProfessionalBio, auditPortfolioIA, generateAIInsights } from '../services/geminiService.js';

export const generateBio = async (req, res, next) => {
  try {
    const { portfolio, experiences, projects } = req.body;
    const text = await generateProfessionalBio(portfolio, experiences || [], projects || []);
    res.json({ success: true, data: text });
  } catch (err) {
    next(err);
  }
};

export const audit = async (req, res, next) => {
  try {
    const { portfolio, projects, experiences } = req.body;
    const result = await auditPortfolioIA(portfolio, projects || [], experiences || []);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const insights = async (req, res, next) => {
  try {
    const { portfolio, projects } = req.body;
    const result = await generateAIInsights(portfolio, projects || []);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export default {
  generateBio,
  audit,
  insights
};
