import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, setupTestDb, resetDb, registerAndLogin } from './helpers.js';

const app = buildTestApp();

beforeEach(() => setupTestDb());
afterEach(() => resetDb());

describe('GET /api/history', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(401);
  });

  it('returns empty list for new user', async () => {
    const { token } = await registerAndLogin(app);

    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('returns saved history items', async () => {
    const { token } = await registerAndLogin(app);

    await request(app)
      .post('/api/history')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'OCR Lab', path: '/ocr', kind: 'page_view' });

    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].label).toBe('OCR Lab');
  });
});

describe('POST /api/history', () => {
  it('requires auth', async () => {
    const res = await request(app)
      .post('/api/history')
      .send({ label: 'Test', path: '/test' });
    expect(res.status).toBe(401);
  });

  it('adds a history item', async () => {
    const { token } = await registerAndLogin(app);

    const res = await request(app)
      .post('/api/history')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Smart Gallery', path: '/gallery', kind: 'page_view' });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('rejects missing label', async () => {
    const { token } = await registerAndLogin(app);

    const res = await request(app)
      .post('/api/history')
      .set('Authorization', `Bearer ${token}`)
      .send({ path: '/test' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it('normalizes unknown kind to page_view', async () => {
    const { token } = await registerAndLogin(app);

    await request(app)
      .post('/api/history')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Test', kind: 'unknown_kind' });

    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.items[0].kind).toBe('page_view');
  });

  it('accepts search kind', async () => {
    const { token } = await registerAndLogin(app);

    await request(app)
      .post('/api/history')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'cat', kind: 'search' });

    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.items[0].kind).toBe('search');
  });
});

describe('DELETE /api/history/:id', () => {
  it('requires auth', async () => {
    const res = await request(app).delete('/api/history/some-id');
    expect(res.status).toBe(401);
  });

  it('deletes own history item', async () => {
    const { token } = await registerAndLogin(app);

    await request(app)
      .post('/api/history')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'To delete', path: '/del' });

    const list = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token}`);

    const id = list.body.items[0].id;

    const res = await request(app)
      .delete(`/api/history/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 for non-existent item', async () => {
    const { token } = await registerAndLogin(app);

    const res = await request(app)
      .delete('/api/history/non-existent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it("cannot delete another user's item", async () => {
    const { token: token1 } = await registerAndLogin(app, 'user1@example.com');
    const { token: token2 } = await registerAndLogin(app, 'user2@example.com');

    await request(app)
      .post('/api/history')
      .set('Authorization', `Bearer ${token1}`)
      .send({ label: 'User1 item', path: '/x' });

    const list = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token1}`);

    const id = list.body.items[0].id;

    const res = await request(app)
      .delete(`/api/history/${id}`)
      .set('Authorization', `Bearer ${token2}`);

    expect(res.status).toBe(404);
  });
});
