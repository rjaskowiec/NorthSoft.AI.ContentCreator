/**
 * NorthSoft.AI.ContentCreator — Application Entry Point
 *
 * Cloudflare Worker entry point using Hono framework.
 * Routes are organized by domain responsibility: health, auth, admin, and UI.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { renderAdminHtml } from './admin/ui.js';
import { adminRoutes } from './api/admin';
import { authRoutes } from './api/auth';
import { healthRoutes } from './api/health';
import { D1AuditLogger } from './core/audit';
import { errorHandler } from './core/errors';
import { requestLogger } from './core/middleware/logger';
import { FacebookPublisher } from './publishing/facebook-publisher';
import { ImageLibraryService } from './services/content/image-library-service';
import { PipelineOrchestratorService } from './services/content/pipeline-orchestrator-service';
import { D1QuotaService } from './services/cloudflare/d1-quota-service';
import { NorthSoftMailGatewayClient } from './services/mail/mail-service';
import { NotificationService } from './services/notifications/notification-service';
import { PublicationService } from './services/publishing/publication-service';
import type { AppEnv } from './core/types';

export type { AppEnv };

const app = new Hono<AppEnv>();

// Images are public by design so Facebook can fetch them when publishing.
// Object keys are random and uploads remain protected by the admin API.
app.get('/media/:key', async (c) => {
  let key = c.req.param('key');
  if (!/^(?:gen-)?[0-9a-f-]{36}(?:\.(?:jpe?g|png|webp))?$/i.test(key)) {
    return c.notFound();
  }

  let object = await c.env.IMAGE_BUCKET.get(`images/${key}`);
  if (!object) {
    object = await c.env.IMAGE_BUCKET.get(key);
  }

  // If no extension was provided in the request, probe common extensions
  if (!object && !/\.[a-z0-9]+$/i.test(key)) {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      object = await c.env.IMAGE_BUCKET.get(`images/${key}.${ext}`);
      if (!object) {
        object = await c.env.IMAGE_BUCKET.get(`${key}.${ext}`);
      }
      if (object) {
        key = `${key}.${ext}`;
        break;
      }
    }
  }

  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);
  if (!headers.get('content-type') || headers.get('content-type') === 'application/octet-stream') {
    const ext = key.split('.').pop()?.toLowerCase();
    if (ext === 'png') headers.set('content-type', 'image/png');
    else if (ext === 'jpg' || ext === 'jpeg') headers.set('content-type', 'image/jpeg');
    else if (ext === 'webp') headers.set('content-type', 'image/webp');
  }
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
    const publisher = new FacebookPublisher(env);
    const mailClient = new NorthSoftMailGatewayClient(env);
    const pubService = new PublicationService(env.DB, publisher, new D1AuditLogger(env.DB), mailClient, env.IMAGE_BUCKET);

    // 1. Time-critical: Process scheduled due posts first with isolated error boundary.
    // Scheduled publication must ALWAYS execute regardless of automation switches or non-fatal quota warnings.
    try {
      await pubService.publishScheduledDuePosts();
    } catch (err: unknown) {
      console.error('[cron] Critical scheduled publishing task failed:', err);
    }

    // 2. Background maintenance, sync, and generation tasks.
    // Guarded by D1 Quota Protective Mode & intelligent scheduling controls.
    const pipelineService = new PipelineOrchestratorService(env.DB, env);
    const d1QuotaService = new D1QuotaService();

    ctx.waitUntil(
      (async () => {
        try {
          const schedulerConfig = await pipelineService.getSchedulerConfig();
          const d1Status = await d1QuotaService.getD1UsageStatus(env.DB);

          // If protective mode is active (due to high writes OR reads), skip non-critical maintenance & batch runs
          if (d1Status.isProtectiveModeActive) {
            console.warn('[cron] Skipping background tasks — D1 Protective Mode Active:', d1Status.reason);
            return;
          }

          const backgroundTasks: Array<[string, () => Promise<unknown>]> = [];

          // Facebook Sync: only run if automation is enabled and interval throttle matches (at most once every 60m in cron)
          if (schedulerConfig.enabled) {
            const currentMinute = new Date().getUTCMinutes();
            // Run at the top of the hour (:00) during 5-minute cron
            if (currentMinute < 5) {
              backgroundTasks.push(['syncFacebookPostsToSystem', () => pubService.syncFacebookPostsToSystem()]);
            }
          }

          // Content generation / scouting automation tick (self-checks config.enabled and AI window)
          if (schedulerConfig.enabled) {
            backgroundTasks.push(['runAutomationTick', () => pipelineService.runAutomationTick()]);
          }

          // Maintenance tasks: Weekly digest (runs once a week on Monday morning) & Image purge (runs daily at 03:00 UTC)
          const now = new Date();
          if (now.getUTCHours() === 9 && now.getUTCMinutes() < 5 && now.getUTCDay() === 1) {
            backgroundTasks.push(['sendWeeklyDigest', () => NotificationService.sendWeeklyDigest(env.DB, mailClient)]);
          }

          if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
            backgroundTasks.push([
              'purgeExpiredRejectedImages',
              () => new ImageLibraryService(env.DB).purgeExpiredRejectedImages(7, env.IMAGE_BUCKET),
            ]);
          }

          if (backgroundTasks.length > 0) {
            const results = await Promise.allSettled(backgroundTasks.map(([, run]) => run()));
            results.forEach((r, i) => {
              if (r.status === 'rejected') {
                console.error(`[cron] ${backgroundTasks[i]?.[0] ?? 'task'} failed:`, r.reason);
              }
            });
          }
        } catch (bgErr: unknown) {
          console.error('[cron] Background task execution error:', bgErr);
        }
      })(),
    );
  },
};
