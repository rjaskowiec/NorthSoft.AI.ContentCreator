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
import { D1AuditLogger } from './core/audit';
import { errorHandler } from './core/errors';
import { requestLogger } from './core/middleware/logger';
import { FacebookPublisher } from './publishing/facebook-publisher';
import { ContentOrchestrator } from './services/content/content-orchestrator';
import { NorthSoftMailGatewayClient } from './services/mail/mail-service';
import { NotificationService } from './services/notifications/notification-service';
import { PublicationService } from './services/publishing/publication-service';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    adminUser: AdminUser;
    session: AdminSession;
  };
};

const app = new Hono<AppEnv>();

// Images are public by design so Facebook can fetch them when publishing.
// Object keys are random and uploads remain protected by the admin API.
app.get('/media/:key', async (c) => {
  const key = c.req.param('key');
  if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(key)) {
    return c.notFound();
  }
  let object = await c.env.IMAGE_BUCKET.get(`images/${key}`);
  if (!object) {
    object = await c.env.IMAGE_BUCKET.get(key);
  }
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);
  return new Response(object.body, { headers });
});

// --- Global Middleware ---
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://*.fbcdn.net', 'https://*.facebook.com', 'https://*.fbsbx.com', 'https:'],
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
    version: '0.4.0',
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

export { app };

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const orchestrator = new ContentOrchestrator(env.DB, env);
    const publisher = new FacebookPublisher(env);
    const mailClient = new NorthSoftMailGatewayClient(env);
    const pubService = new PublicationService(env.DB, publisher, new D1AuditLogger(env.DB), mailClient, env.IMAGE_BUCKET);

    const tasks: Array<[string, () => Promise<unknown>]> = [
      // Publishing first: it is time-critical and must not depend on the AI pipeline.
      ['publishScheduledDuePosts', () => pubService.publishScheduledDuePosts()],
      ['syncFacebookPostsToSystem', () => pubService.syncFacebookPostsToSystem()],
      ['runPipeline', () => orchestrator.runPipeline('cron')],
      ['sendWeeklyDigest', () => NotificationService.sendWeeklyDigest(env.DB, mailClient)],
    ];

    ctx.waitUntil(
      Promise.allSettled(tasks.map(([, run]) => run())).then((results) => {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.error(`[cron] ${tasks[i]?.[0] ?? 'task'} failed:`, r.reason);
          }
        });
      }),
    );
  },
};
