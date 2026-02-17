
import express from 'express';
import * as billingController from '../controllers/billingController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.post('/upgrade', billingController.upgradePlan);
router.get('/invoices', billingController.getMyInvoices);

export default router;
