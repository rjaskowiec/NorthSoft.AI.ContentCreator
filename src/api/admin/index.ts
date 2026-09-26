/**
 * NorthSoft.AI.ContentCreator — Admin API Routes Entry Point
 *
 * Mounts modular domain routers under /api/admin/*.
 * All admin endpoints are protected by requireAdmin middleware.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { requireAdmin } from '../../core/middleware/auth';
import { auditRouter } from './audit';
import { contentRouter } from './content';
import { dashboardRouter } from './dashboard';
import { facebookRouter } from './facebook';
import { pipelineRouter } from './pipeline';
import { publicationsRouter } from './publications';
import { researchRouter } from './research';
import { settingsRouter } from './settings';

export const adminRoutes = new Hono<AppEnv>();

// Apply requireAdmin middleware to all /api/admin/* endpoints
adminRoutes.use('*', requireAdmin);

// Mount modular domain sub-routers
adminRoutes.route('/', auditRouter);
adminRoutes.route('/', dashboardRouter);
adminRoutes.route('/', researchRouter);
adminRoutes.route('/', contentRouter);
adminRoutes.route('/', pipelineRouter);
adminRoutes.route('/', publicationsRouter);
adminRoutes.route('/', facebookRouter);
adminRoutes.route('/', settingsRouter);
