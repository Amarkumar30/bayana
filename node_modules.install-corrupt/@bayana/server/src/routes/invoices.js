import { Router } from 'express';
import { authenticate, ensureOwnership } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { vendorIdParams } from '../schemas/booking.js';
import { invoiceIdParams, invoiceTokenParams, createInvoiceSchema, updateInvoiceSchema, markPaidSchema, invoicePaymentConfirmSchema } from '../schemas/invoice.js';
import {
  listInvoices, getInvoice, createInvoice, updateInvoice, sendInvoice,
  markInvoicePaid, deleteInvoice, getPublicInvoice, createInvoiceOrder, confirmInvoicePayment,
} from '../services/invoiceService.js';
import { config } from '../lib/config.js';

const router = Router();

// --- Public (no auth) ---
router.get('/public/invoices/:token', validate(invoiceTokenParams, 'params'), async (req, res, next) => {
  try { res.json(await getPublicInvoice(req.params.token)); } catch (e) { next(e); }
});

router.post('/public/invoices/:token/order', validate(invoiceTokenParams, 'params'), async (req, res, next) => {
  try { res.status(201).json(await createInvoiceOrder(req.params.token)); } catch (e) { next(e); }
});

router.post('/public/invoices/:token/confirm-payment', validate(invoiceTokenParams, 'params'), validate(invoicePaymentConfirmSchema), async (req, res, next) => {
  try { res.json(await confirmInvoicePayment(req.params.token, req.body)); } catch (e) { next(e); }
});

// --- Authenticated vendor routes ---
router.use(authenticate);

router.get('/vendors/:vendorId/invoices', validate(vendorIdParams, 'params'), ensureOwnership(), async (req, res, next) => {
  try { res.json(await listInvoices(req.params.vendorId)); } catch (e) { next(e); }
});

router.post('/vendors/:vendorId/invoices', validate(vendorIdParams, 'params'), ensureOwnership(), validate(createInvoiceSchema), async (req, res, next) => {
  try { res.status(201).json(await createInvoice(req.params.vendorId, req.body)); } catch (e) { next(e); }
});

router.get('/vendors/:vendorId/invoices/:invoiceId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(invoiceIdParams, 'params'), async (req, res, next) => {
  try { res.json(await getInvoice(req.params.vendorId, req.params.invoiceId)); } catch (e) { next(e); }
});

router.patch('/vendors/:vendorId/invoices/:invoiceId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(invoiceIdParams, 'params'), validate(updateInvoiceSchema), async (req, res, next) => {
  try { res.json(await updateInvoice(req.params.vendorId, req.params.invoiceId, req.body)); } catch (e) { next(e); }
});

router.post('/vendors/:vendorId/invoices/:invoiceId/send', validate(vendorIdParams, 'params'), ensureOwnership(), validate(invoiceIdParams, 'params'), async (req, res, next) => {
  try { res.json(await sendInvoice(req.params.vendorId, req.params.invoiceId, config.CLIENT_ORIGIN)); } catch (e) { next(e); }
});

router.post('/vendors/:vendorId/invoices/:invoiceId/mark-paid', validate(vendorIdParams, 'params'), ensureOwnership(), validate(invoiceIdParams, 'params'), validate(markPaidSchema), async (req, res, next) => {
  try { res.json(await markInvoicePaid(req.params.vendorId, req.params.invoiceId, req.body.amount)); } catch (e) { next(e); }
});

router.delete('/vendors/:vendorId/invoices/:invoiceId', validate(vendorIdParams, 'params'), ensureOwnership(), validate(invoiceIdParams, 'params'), async (req, res, next) => {
  try { await deleteInvoice(req.params.vendorId, req.params.invoiceId); res.status(204).end(); } catch (e) { next(e); }
});

export default router;
