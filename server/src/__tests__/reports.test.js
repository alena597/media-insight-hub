import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, setupTestDb, resetDb } from './helpers.js';

const app = buildTestApp();

beforeEach(() => setupTestDb());
afterEach(() => resetDb());

describe('POST /api/reports', () => {
  it('creates a report with required field only', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ whatHappened: 'Something broke' });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.reportId).toBe('string');
  });

  it('creates a report with all optional fields', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({
        whatHappened: 'OCR gave wrong result',
        steps: '1. Upload image\n2. Click run',
        contact: 'user@example.com',
        userId: 'some-user-id',
        viewport: '375x812',
        language: 'uk',
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('rejects missing whatHappened', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ steps: 'some steps' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FIELD');
  });

  it('rejects empty whatHappened', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ whatHappened: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FIELD');
  });

  it('rejects empty body', async () => {
    const res = await request(app).post('/api/reports').send({});
    expect(res.status).toBe(400);
  });

  it('each report gets a unique id', async () => {
    const r1 = await request(app).post('/api/reports').send({ whatHappened: 'Bug A' });
    const r2 = await request(app).post('/api/reports').send({ whatHappened: 'Bug B' });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.reportId).not.toBe(r2.body.reportId);
  });
});
