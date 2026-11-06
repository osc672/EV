import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('HTTP surface', () => {
  it('exposes service metadata at the root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('EV Rescue API');
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('EV Rescue API');
  });

  it('returns 422 with field details for an invalid registration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: 'bad', fullName: 'A', password: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
