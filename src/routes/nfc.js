import express from 'express';
import * as nfcController from '../controllers/nfcController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', nfcController.createNFCOrder);
router.get('/', nfcController.getMyNFCOrders);
router.get('/:id', nfcController.getNFCOrderById);

export default router;
