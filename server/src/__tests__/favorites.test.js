import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, setupTestDb, resetDb, registerAndLogin } from './helpers.js';

const app = buildTestApp();

beforeEach(() => setupTestDb());
afterEach(() => resetDb());

describe('GET /api/favorites', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/favorites');
    expect(res.status).toBe(401);
  });

  it('returns empty list for new user', async () => {
    const { token } = await registerAndLogin(app);

    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('returns saved favorites', async () => {
    const { token } = await registerAndLogin(app);

    await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'OCR Lab', path: '/ocr' });

    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe('OCR Lab');
  });
});

describe('POST /api/favorites', () => {
  it('requires auth', async () => {
    const res = await request(app)
      .post('/api/favorites')
      .send({ title: 'Test', path: '/test' });
    expect(res.status).toBe(401);
  });

  it('adds a favorite', async () => {
    const { token } = await registerAndLogin(app);

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Smart Gallery', path: '/gallery', kind: 'module' });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.id).toBe('string');
  });

  it('rejects missing title', async () => {
    const { token } = await registerAndLogin(app);

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ path: '/test' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it('defaults kind to module', async () => {
    const { token } = await registerAndLogin(app);

    await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', path: '/test' });

    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.items[0].kind).toBe('module');
  });

  it('stores result kind correctly', async () => {
    const { token } = await registerAndLogin(app);

    await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My result', path: '/ocr', kind: 'result' });

    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.items[0].kind).toBe('result');
  });
});

describe('DELETE /api/favorites/:id', () => {
  it('requires auth', async () => {
    const res = await request(app).delete('/api/favorites/some-id');
    expect(res.status).toBe(401);
  });

  it('deletes own favorite', async () => {
    const { token } = await registerAndLogin(app);

    const created = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'To delete', path: '/del' });

    const id = created.body.id;

    const res = await request(app)
      .delete(`/api/favorites/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 for non-existent item', async () => {
    const { token } = await registerAndLogin(app);

    const res = await request(app)
      .delete('/api/favorites/non-existent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it("cannot delete another user's favorite", async () => {
    const { token: token1 } = await registerAndLogin(app, 'user1@example.com');
    const { token: token2 } = await registerAndLogin(app, 'user2@example.com');

    const created = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token1}`)
      .send({ title: 'User1 fav', path: '/x' });

    const id = created.body.id;

    const res = await request(app)
      .delete(`/api/favorites/${id}`)
      .set('Authorization', `Bearer ${token2}`);

    expect(res.status).toBe(404);
  });
});
