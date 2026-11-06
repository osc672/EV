import { Router } from 'express';
import health from './health';
import auth from '../modules/auth/auth.routes';
import users from '../modules/users/users.routes';
import providers from '../modules/providers/providers.routes';
import bookings from '../modules/bookings/bookings.routes';
import vehicles from '../modules/vehicles/vehicles.routes';
import reviews from '../modules/reviews/reviews.routes';
import favorites from '../modules/favorites/favorites.routes';
import notifications from '../modules/notifications/notifications.routes';
import admin from '../modules/admin/admin.routes';
import search from '../modules/search/search.routes';
import uploads from '../modules/uploads/uploads.routes';
import payments from '../modules/payments/payments.routes';

const router = Router();

router.use('/health', health);
router.use('/auth', auth);
router.use('/users', users);
router.use('/providers', providers);
router.use('/bookings', bookings);
router.use('/vehicles', vehicles);
router.use('/reviews', reviews);
router.use('/favorites', favorites);
router.use('/notifications', notifications);
router.use('/admin', admin);
router.use('/search', search);
router.use('/uploads', uploads);
router.use('/payments', payments);

export default router;
