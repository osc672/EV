import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../lib/asyncHandler';
import { created } from '../../lib/response';
import { BadRequestError } from '../../lib/errors';
import { uploadBuffer } from '../../lib/storage';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) {
      return cb(new BadRequestError('Only JPEG, PNG, WebP, or HEIC images are allowed'));
    }
    return cb(null, true);
  },
});

const folderSchema = z.enum(['avatars', 'providers', 'documents']);

const router = Router();

/**
 * @openapi
 * /uploads/image:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload and optimize an image (multipart/form-data, field "file")
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/image',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError('No image uploaded');
    const folder = folderSchema.safeParse(req.query.folder);
    if (!folder.success) throw new BadRequestError('Invalid upload folder');

    const processed = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const host = req.get('host');
    const protocol = req.protocol || 'http';
    const baseUrl = host ? `${protocol}://${host}/uploads` : undefined;

    const stored = await uploadBuffer(processed, folder.data, 'image/webp', 'webp', baseUrl);
    return created(res, stored);
  }),
);

export default router;
