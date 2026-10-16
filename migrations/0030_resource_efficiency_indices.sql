-- NorthSoft.AI.ContentCreator — Resource Efficiency Indices Migration
-- Migration: 0030_resource_efficiency_indices
--
-- Eliminates full-table scans and N+1 query overhead across critical production paths:
-- 1. Facebook Post ID lookup & batch reconciliation (publications)
-- 2. Publication status and timestamp ordering (publications)
-- 3. Stale publication lock resolution (publications)
-- 4. Curated image asset referencing (post_images)
-- 5. Post version image association (post_images)
-- 6. Publication due scheduling & coverage calculation (schedules)
-- 7. Post performance metric history & latest snapshot seeking (post_performance_metrics)

-- Publications optimizations
CREATE INDEX IF NOT EXISTS idx_publications_fb_post_id ON publications(facebook_post_id);
CREATE INDEX IF NOT EXISTS idx_publications_status_published ON publications(status, published_at);
CREATE INDEX IF NOT EXISTS idx_publications_status_updated ON publications(status, updated_at);

-- Post images optimizations
CREATE INDEX IF NOT EXISTS idx_post_images_curated_image ON post_images(curated_image_id);
CREATE INDEX IF NOT EXISTS idx_post_images_post_version ON post_images(post_id, version_number);

-- Schedules optimizations
CREATE INDEX IF NOT EXISTS idx_schedules_status_sched ON schedules(status, scheduled_at);

-- Post performance snapshot seek optimization
CREATE INDEX IF NOT EXISTS idx_post_perf_post_measured ON post_performance_metrics(post_id, measured_at);
