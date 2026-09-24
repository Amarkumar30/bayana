import { Router } from 'express';
import { authenticate, ensureOwnership } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { vendorIdParams } from '../schemas/booking.js';
import { updateProfileSchema } from '../schemas/vendor.js';
import { getVendorProfile, updateVendorProfile } from '../services/vendorService.js';
import { getDashboardStats } from '../services/dashboardService.js';

const router = Router();

router.get(
  '/vendors/:vendorId/profile',
  authenticate,
  validate(vendorIdParams, 'params'),
  ensureOwnership(),
  async (req, res, next) => {
    try { res.json(await getVendorProfile(req.params.vendorId)); } catch (e) { next(e); }
  }
);

router.patch(
  '/vendors/:vendorId/profile',
  authenticate,
  validate(vendorIdParams, 'params'),
  ensureOwnership(),
  validate(updateProfileSchema),
  async (req, res, next) => {
    try { res.json(await updateVendorProfile(req.params.vendorId, req.body)); } catch (e) { next(e); }
  }
);

router.get(
  '/vendors/:vendorId/dashboard',
  authenticate,
  validate(vendorIdParams, 'params'),
  ensureOwnership(),
  async (req, res, next) => {
    try { res.json(await getDashboardStats(req.params.vendorId)); } catch (e) { next(e); }
  }
);

export default router;
