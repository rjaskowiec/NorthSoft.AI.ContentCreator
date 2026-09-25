/**
 * NorthSoft.AI.ContentCreator — Application Entry Point
 *
 * Cloudflare Worker entry point using Hono framework.
 * Routes are organized by domain responsibility.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { healthRoutes } from './api/health';
import { errorHandler } from './core/errors';
import { requestLogger } from './core/middleware/logger';

export type AppEnv = {
  Bindings: Env;
};

const app = new Hono<AppEnv>();

// --- Global Middleware ---
app.use('*', secureHeaders());
app.use('*', cors());
app.use('*', requestLogger());

// --- Global Error Handler ---
app.onError(errorHandler);

// --- Routes ---
app.route('/api/health', healthRoutes);

// --- Root ---
app.get('/', (c) => {
  return c.json({
    name: 'NorthSoft.AI.ContentCreator',
    version: '0.1.0',
    status: 'operational',
    docs: 'https://github.com/rjaskowiec/NorthSoft.AI.ContentCreator',
  });
});

// --- 404 ---
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404,
  );
});

export default app;
