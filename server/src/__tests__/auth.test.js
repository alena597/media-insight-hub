import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, setupTestDb, resetDb, registerAndLogin } from './helpers.js';

const app = buildTestApp();
let db;

beforeEach(() => { db = setupTestDb(); });
afterEach(() => resetDb());

describe('POST /api/auth/register', () => {
  it('registers a new user and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Password1', displayName: 'Test' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.displayName).toBe('Test');
  });

  it('rejects duplicate email', async () => {
    const data = { email: 'dup@example.com', password: 'Password1' };
    await request(app).post('/api/auth/register').send(data);
    const res = await request(app).post('/api/auth/register').send(data);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
  });

  it('rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'notanemail', password: 'Password1' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL');
  });

  it('rejects weak password (too short)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  it('rejects password without digit or special char', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'onlyletters' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'Password1' });
  });

  it('returns token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user for valid token', async () => {
    const { token } = await registerAndLogin(app, 'me@example.com');

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
  });

  it('rejects missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/auth/profile', () => {
  it('updates display name', async () => {
    const { token } = await registerAndLogin(app, 'profile@example.com');

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('New Name');
  });

  it('rejects without token', async () => {
    const res = await request(app)
      .patch('/api/auth/profile')
      .send({ displayName: 'Name' });
    expect(res.status).toBe(401);
  });

  it('clears display name when empty', async () => {
    const { token } = await registerAndLogin(app, 'profile2@example.com');

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: '' });

    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBeNull();
  });
});

describe('PATCH /api/auth/password', () => {
  it('changes password with correct current password', async () => {
    const { token } = await registerAndLogin(app, 'pass@example.com');

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Password1', newPassword: 'NewPass2!' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects wrong current password', async () => {
    const { token } = await registerAndLogin(app, 'pass2@example.com');

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass1', newPassword: 'NewPass2!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PASSWORD');
  });

  it('rejects weak new password', async () => {
    const { token } = await registerAndLogin(app, 'pass3@example.com');

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Password1', newPassword: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  it('rejects without token', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: 'Password1', newPassword: 'NewPass2!' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('returns ok for existing email', async () => {
    await registerAndLogin(app, 'forgot@example.com');

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'forgot@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns ok even for non-existent email (no leak)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'notanemail' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL');
  });
});

describe('POST /api/auth/reset-password', () => {
  it('resets password with valid token', async () => {
    const { user } = await registerAndLogin(app, 'reset@example.com');
    const token = 'valid-reset-token-abc123';
    db.prepare(
      'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(token, user.id, Date.now() + 3_600_000);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewPass2!' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects expired token', async () => {
    const { user } = await registerAndLogin(app, 'reset2@example.com');
    const token = 'expired-token-xyz';
    db.prepare(
      'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(token, user.id, Date.now() - 1000);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewPass2!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects already used token', async () => {
    const { user } = await registerAndLogin(app, 'reset3@example.com');
    const token = 'used-token-xyz';
    db.prepare(
      'INSERT INTO password_reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 1)'
    ).run(token, user.id, Date.now() + 3_600_000);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewPass2!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects missing token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ newPassword: 'NewPass2!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_TOKEN');
  });

  it('rejects weak new password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'sometoken', newPassword: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });
});
