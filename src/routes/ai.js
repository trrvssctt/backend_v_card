import express from 'express';
import { generateBio, audit, insights } from '../controllers/aiController.js';

const router = express.Router();

router.post('/generate-bio', generateBio);
router.post('/audit', audit);
router.post('/insights', insights);

export default router;
