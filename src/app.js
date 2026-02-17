
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import errorHandler from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import portfolioRoutes from './routes/portfolios.js';
import adminRoutes from './routes/admin.js';
import planRoutes from './routes/plans.js';
import billingRoutes from './routes/billing.js';
import aiRoutes from './routes/ai.js';
import nfcRoutes from './routes/nfc.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/api/auth', authRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/nfc-orders', nfcRoutes);

app.get('/health', (req, res) => res.json({ status: 'OK', uptime: process.uptime() }));

// Fallback 404 JSON handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.method} ${req.originalUrl} non trouvée sur le serveur.` 
  });
});

app.use(errorHandler);

export default app;
