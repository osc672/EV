import { Router } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/response';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { appCache, TTL } from '../../lib/cache';
import { connectorEnum, providerTypeEnum } from '../providers/providers.schema';

const geocodeSchema = z.object({ q: z.string().trim().min(2).max(200) });
const routeSchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLng: z.coerce.number().min(-180).max(180),
});
const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  connector: connectorEnum.optional(),
  providerType: providerTypeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const router = Router();

/**
 * @openapi
 * /search/providers:
 *   get:
 *     tags: [Search]
 *     summary: Keyword search across approved providers
 */
router.get(
  '/providers',
  validate(searchSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q, connector, providerType, limit } = req.query as never as {
      q: string;
      connector?: never;
      providerType?: never;
      limit: number;
    };
    const providers = await prisma.providerProfile.findMany({
      where: {
        verificationStatus: 'APPROVED',
        ...(connector ? { connectorTypes: { has: connector } } : {}),
        ...(providerType ? { providerType } : {}),
        OR: [
          { businessName: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { addressLine: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { _count: { select: { reviews: true } } },
      orderBy: [{ rating: 'desc' }, { totalReviews: 'desc' }],
      take: limit,
    });
    return ok(res, providers, { count: providers.length });
  }),
);

/**
 * @openapi
 * /search/geocode:
 *   get:
 *     tags: [Search]
 *     summary: Forward-geocode an address (Google / Mapbox / OSM fallback)
 */
router.get(
  '/geocode',
  validate(geocodeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q } = req.query as never as { q: string };

    if (env.GOOGLE_MAPS_API_KEY) {
      const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { address: q, key: env.GOOGLE_MAPS_API_KEY },
      });
      const results = (data.results ?? []).map((r: any) => ({
        label: r.formatted_address,
        latitude: r.geometry.location.lat,
        longitude: r.geometry.location.lng,
        provider: 'google',
      }));
      return ok(res, results);
    }

    if (env.MAPBOX_ACCESS_TOKEN) {
      const { data } = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`,
        { params: { access_token: env.MAPBOX_ACCESS_TOKEN, limit: 5 } },
      );
      const results = (data.features ?? []).map((f: any) => ({
        label: f.place_name,
        longitude: f.center[0],
        latitude: f.center[1],
        provider: 'mapbox',
      }));
      return ok(res, results);
    }

    // Free fallback for local development.
    const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q, format: 'json', limit: 5 },
      headers: { 'User-Agent': 'EVRescue/1.0 (dev)' },
    });
    return ok(
      res,
      (data as any[]).map((r) => ({
        label: r.display_name,
        latitude: Number(r.lat),
        longitude: Number(r.lon),
        provider: 'osm',
      })),
    );
  }),
);

/**
 * @openapi
 * /search/route:
 *   get:
 *     tags: [Search]
 *     summary: Route directions between two points (Google / OSRM fallback)
 */
router.get(
  '/route',
  validate(routeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { fromLat, fromLng, toLat, toLng } = req.query as never as Record<string, number>;
    const cacheKey = `route:${Number(fromLat).toFixed(3)}:${Number(fromLng).toFixed(3)}:${Number(toLat).toFixed(3)}:${Number(toLng).toFixed(3)}`;
    const cachedRoute = appCache.get(cacheKey);
    if (cachedRoute) {
      return ok(res, cachedRoute);
    }

    if (env.GOOGLE_MAPS_API_KEY) {
      try {
        const { data } = await axios.get(
          'https://maps.googleapis.com/maps/api/directions/json',
          {
            params: {
              origin: `${fromLat},${fromLng}`,
              destination: `${toLat},${toLng}`,
              key: env.GOOGLE_MAPS_API_KEY,
            },
            timeout: 6000,
          },
        );
        const leg = data.routes?.[0]?.legs?.[0];
        const result = {
          distanceMeters: leg?.distance?.value ?? null,
          durationSeconds: leg?.duration?.value ?? null,
          polyline: data.routes?.[0]?.overview_polyline?.points ?? null,
          provider: 'google',
        };
        appCache.set(cacheKey, result, TTL.LONG);
        return ok(res, result);
      } catch (err) {
        logger.warn('google_route_failed', { error: (err as Error).message });
      }
    }

    try {
      const { data } = await axios.get(
        `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}`,
        {
          params: { overview: 'full', geometries: 'polyline' },
          headers: { 'User-Agent': 'EVRescueApp/1.0 (dev)' },
          timeout: 4000,
        },
      );
      const route = data.routes?.[0];
      const result = {
        distanceMeters: route?.distance ?? null,
        durationSeconds: route?.duration ?? null,
        polyline: route?.geometry ?? null,
        provider: 'osrm',
      };
      if (result.polyline) {
        appCache.set(cacheKey, result, TTL.LONG);
      }
      return ok(res, result);
    } catch (error) {
      logger.warn('route_lookup_failed', { error: (error as Error).message });
      return ok(res, { distanceMeters: null, durationSeconds: null, polyline: null, provider: null });
    }
  }),
);

export default router;
