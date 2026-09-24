import { Router } from 'express';
import { authenticate, ensureOwnership } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { vendorIdParams } from '../schemas/booking.js';
import { contractIdParams, contractTokenParams, createContractSchema, signContractSchema } from '../schemas/contract.js';
import {
  listContracts, getContract, createStandaloneContract, sendContract,
  deleteContract, getPublicContract, signContract,
} from '../services/contractService.js';

const router = Router();

// --- Public (no auth) ---
router.get('/public/contracts/:token', validate(contractTokenParams, 'params'), async (req, res, next) => {
  try { res.json(await getPublicContract(req.params.token)); } catch (e) { next(e); }
});

router.post('/public/contracts/:token/sign', validate(contractTokenParams, 'params'), validate(signContractSchema), async (req, res, next) => {
  try { res.json(await signContract(req.params.token, req.body)); } catch (e) { next(e); }
});

// --- Authenticated vendor routes ---
router.use(authenticate);

router.get('/vendors/:vendorId/contracts', validate(vendorIdParams, 'params'), ensureOwnership(), async (req, res, next) => {
  try { res.json(await listContracts(req.params.vendorId)); } catch (e) { next(e); }
});

router.post('/vendors/:vendorId/contracts', validate(vendorIdParams, 'params'), ensureOwnership(), validate(createContractSchema), async (req, res, next) => {
  try { res.status(201).json(await createStandaloneContract(req.params.vendorId, req.body)); } catch (e) { next(e); }
});

router.get('/vendors/:vendorId/contracts/:contractId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(contractIdParams, 'params'), async (req, res, next) => {
  try { res.json(await getContract(req.params.vendorId, req.params.contractId)); } catch (e) { next(e); }
});

router.post('/vendors/:vendorId/contracts/:contractId/send', validate(vendorIdParams, 'params'), ensureOwnership(), validate(contractIdParams, 'params'), async (req, res, next) => {
  try {
    const baseUrl = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    res.json(await sendContract(req.params.vendorId, req.params.contractId, baseUrl));
  } catch (e) { next(e); }
});

router.delete('/vendors/:vendorId/contracts/:contractId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(contractIdParams, 'params'), async (req, res, next) => {
  try { await deleteContract(req.params.vendorId, req.params.contractId); res.status(204).end(); } catch (e) { next(e); }
});

export default router;
