/**
 * Admin API — Audit Log Router
 *
 * Exposes GET /api/admin/audit endpoint with rich search, filtering,
 * pagination metadata, and summary operational statistics.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { D1AuditLogger, type AuditEventType, type AuditLevel, type AuditQueryFilters, type AuditStatus } from '../../core/audit';

export const auditRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/audit
 * Returns paginated, filtered audit events and operational summary stats.
 */
auditRouter.get('/audit', async (c) => {
  const db = c.env.DB;
  const logger = new D1AuditLogger(db);

  const query = c.req.query();
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || query.limit || '25', 10)));
  const offset = (page - 1) * pageSize;

  const filters: AuditQueryFilters = {
    search: query.search || undefined,
    category: query.category as AuditQueryFilters['category'],
    level: (query.level as AuditLevel) || undefined,
    eventType: (query.eventType as AuditEventType) || undefined,
    status: (query.status as AuditStatus) || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    limit: pageSize,
    offset,
  };

  const [result, stats] = await Promise.all([
    logger.queryWithCount(filters),
    logger.getStats(),
  ]);

  const totalPages = Math.ceil(result.totalCount / pageSize) || 1;

  return c.json({
    events: result.events,
    pagination: {
      page,
      pageSize,
      totalCount: result.totalCount,
      totalPages,
    },
    stats,
  });
});
