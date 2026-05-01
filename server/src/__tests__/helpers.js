import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { setDb, resetDb, initSchemaForTest } from '../db.js';
import authRoutes from '../routes/authRoutes.js';
import reportsRoutes from '../routes/reportsRoutes.js';
import historyRoutes from '../routes/historyRoutes.js';
import favoritesRoutes from '../routes/favoritesRoutes.js';
import { requestContextMiddleware } from '../middleware/requestContext.js';

export function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use('/api/auth', authRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/favorites', favoritesRoutes);
  return app;
}

export function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchemaForTest(db);
  setDb(db);
  return db;
}

export { resetDb };

export async function registerAndLogin(app, email = 'user@example.com', password = 'Password1') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password, displayName: 'Test User' });
  return { token: res.body.token, user: res.body.user };
}
