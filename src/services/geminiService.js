import * as GoogleGenAI from '@google/genai';

const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY || process.env.GENAI_API_KEY;
const ai = GoogleGenAI;

export const generateProfessionalBio = async (portfolio = {}, experiences = [], projects = []) => {
  const prompt = `Génère une biographie professionnelle captivante en français pour un portfolio. 
  Nom du profil: ${portfolio.titre || ''}. 
  Expériences: ${experiences.map(e => `${e.titre_poste} chez ${e.entreprise}`).join(', ')}. 
  Projets clés: ${projects.map(p => p.titre).join(', ')}.
  La biographie doit être orientée vers LinkedIn, courte (3-4 phrases) et souligner l'expertise.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt
  });

  return response?.text || null;
};

export const auditPortfolioIA = async (portfolio = {}, projects = [], experiences = []) => {
  const prompt = `Analyse en profondeur ce portfolio professionnel et attribue un score de 0 à 100.
  Portfolio: ${portfolio.titre || ''}
  Description: ${portfolio.description || ''}
  Nombre de projets: ${projects.length}
  Détails projets: ${projects.map(p => p.titre + ": " + (p.description || '')).join(' | ')}
  Nombre d'expériences: ${experiences.length}
  Compétences: ${(portfolio.competences || []).join(', ')}

  Répond uniquement en format JSON avec cette structure:
  {
    "score": number,
    "analysis": "résumé global",
    "strengths": ["force 1", ...],
    "weaknesses": ["faiblesse 1", ...],
    "recommendations": ["action 1", ...]
  }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json'
    }
  });

  const text = response?.text?.trim() || '{}';
  try {
    return JSON.parse(text);
  } catch (e) {
    return { score: 70, analysis: 'Analyse indisponible', strengths: [], weaknesses: [], recommendations: [] };
  }
};

export const generateAIInsights = async (portfolio = {}, projects = []) => {
  const prompt = `Analyse ce portfolio et suggère 3 actions d'amélioration pour attirer des recruteurs. 
  Titre: ${portfolio.titre || ''}. 
  Nombre de projets: ${projects.length}.
  Répond uniquement en format JSON.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json'
    }
  });

  const text = response?.text?.trim() || '[]';
  try {
    return JSON.parse(text);
  } catch (e) {
    return [];
  }
};

export default {
  generateProfessionalBio,
  auditPortfolioIA,
  generateAIInsights
};
