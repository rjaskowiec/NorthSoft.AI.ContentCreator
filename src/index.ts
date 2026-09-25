/**
 * NorthSoft.AI.ContentCreator — Application Entry Point
 *
 * Cloudflare Worker entry point using Hono framework.
 * Routes are organized by domain responsibility: health, auth, admin, and UI.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { renderAdminHtml } from './admin/ui';
import { adminRoutes } from './api/admin';
import { authRoutes } from './api/auth';
import { healthRoutes } from './api/health';
import type { AdminSession, AdminUser } from './core/auth/session';
import { errorHandler } from './core/errors';
import { requestLogger } from './core/middleware/logger';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    adminUser: AdminUser;
    session: AdminSession;
  };
};

const app = new Hono<AppEnv>();

// --- Global Middleware ---
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
    },
  }),
);
app.use('*', cors());
app.use('*', requestLogger());

// --- Global Error Handler ---
app.onError(errorHandler);

// --- API Routes ---
app.route('/api/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);

// --- Admin UI Dashboard ---
app.get('/admin', (c) => c.html(renderAdminHtml()));
app.get('/admin/*', (c) => c.html(renderAdminHtml()));

// --- Root ---
app.get('/', (c) => {
  return c.json({
    name: 'NorthSoft.AI.ContentCreator',
    version: '0.2.0',
    status: 'operational',
    admin: 'https://ai.northsoft.is/admin',
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
