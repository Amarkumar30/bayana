import { Router } from 'express';
import { authenticate, ensureOwnership } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { vendorIdParams } from '../schemas/booking.js';
import { proposalIdParams, proposalTokenParams, createProposalSchema, updateProposalSchema, acceptProposalSchema } from '../schemas/proposal.js';
import {
  listProposals, getProposal, createProposal, updateProposal,
  sendProposal, deleteProposal, getPublicProposal, acceptProposal,
} from '../services/proposalService.js';
import { config } from '../lib/config.js';

const router = Router();

// --- Public (no auth) ---
router.get('/public/proposals/:token', validate(proposalTokenParams, 'params'), async (req, res, next) => {
  try { res.json(await getPublicProposal(req.params.token)); } catch (e) { next(e); }
});

router.post('/public/proposals/:token/accept', validate(proposalTokenParams, 'params'), validate(acceptProposalSchema), async (req, res, next) => {
  try { res.json(await acceptProposal(req.params.token, req.body)); } catch (e) { next(e); }
});

// --- Authenticated vendor routes ---
router.use(authenticate);

router.get('/vendors/:vendorId/proposals', validate(vendorIdParams, 'params'), ensureOwnership(), async (req, res, next) => {
  try { res.json(await listProposals(req.params.vendorId)); } catch (e) { next(e); }
});

router.post('/vendors/:vendorId/proposals', validate(vendorIdParams, 'params'), ensureOwnership(), validate(createProposalSchema), async (req, res, next) => {
  try { res.status(201).json(await createProposal(req.params.vendorId, req.body)); } catch (e) { next(e); }
});

router.get('/vendors/:vendorId/proposals/:proposalId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(proposalIdParams, 'params'), async (req, res, next) => {
  try { res.json(await getProposal(req.params.vendorId, req.params.proposalId)); } catch (e) { next(e); }
});

router.patch('/vendors/:vendorId/proposals/:proposalId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(proposalIdParams, 'params'), validate(updateProposalSchema), async (req, res, next) => {
  try { res.json(await updateProposal(req.params.vendorId, req.params.proposalId, req.body)); } catch (e) { next(e); }
});

router.post('/vendors/:vendorId/proposals/:proposalId/send', validate(vendorIdParams, 'params'), ensureOwnership(), validate(proposalIdParams, 'params'), async (req, res, next) => {
  try {
    const baseUrl = config.CLIENT_ORIGIN;
    res.json(await sendProposal(req.params.vendorId, req.params.proposalId, baseUrl));
  } catch (e) { next(e); }
});

router.delete('/vendors/:vendorId/proposals/:proposalId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(proposalIdParams, 'params'), async (req, res, next) => {
  try { await deleteProposal(req.params.vendorId, req.params.proposalId); res.status(204).end(); } catch (e) { next(e); }
});

export default router;
