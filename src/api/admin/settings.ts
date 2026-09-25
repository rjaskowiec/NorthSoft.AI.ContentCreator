/**
 * Admin API — Settings Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';

export const settingsRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/settings
 * Returns content brand settings.
 */
settingsRouter.get('/settings', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare('SELECT key, value, description, updated_at FROM content_settings ORDER BY key ASC')
    .all<{
      key: string;
      value: string;
      description: string;
      updated_at: string;
    }>();

  return c.json({
    settings: rows.results || [],
  });
});
