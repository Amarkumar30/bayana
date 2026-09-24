import { Router } from 'express';
import { authenticate, ensureOwnership } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { vendorIdParams } from '../schemas/booking.js';
import { clientIdParams, createClientSchema, updateClientSchema } from '../schemas/client.js';
import { listClients, getClient, createClient, updateClient, deleteClient } from '../services/clientService.js';

const router = Router();

// All routes require auth + ownership
router.use(authenticate);

router.get('/vendors/:vendorId/clients', validate(vendorIdParams, 'params'), ensureOwnership(), async (req, res, next) => {
  try { res.json(await listClients(req.params.vendorId)); } catch (e) { next(e); }
});

router.post('/vendors/:vendorId/clients', validate(vendorIdParams, 'params'), ensureOwnership(), validate(createClientSchema), async (req, res, next) => {
  try { res.status(201).json(await createClient(req.params.vendorId, req.body)); } catch (e) { next(e); }
});

router.get('/vendors/:vendorId/clients/:clientId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(clientIdParams, 'params'), async (req, res, next) => {
  try { res.json(await getClient(req.params.vendorId, req.params.clientId)); } catch (e) { next(e); }
});

router.patch('/vendors/:vendorId/clients/:clientId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(clientIdParams, 'params'), validate(updateClientSchema), async (req, res, next) => {
  try { res.json(await updateClient(req.params.vendorId, req.params.clientId, req.body)); } catch (e) { next(e); }
});

router.delete('/vendors/:vendorId/clients/:clientId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(clientIdParams, 'params'), async (req, res, next) => {
  try { await deleteClient(req.params.vendorId, req.params.clientId); res.status(204).end(); } catch (e) { next(e); }
});

export default router;
