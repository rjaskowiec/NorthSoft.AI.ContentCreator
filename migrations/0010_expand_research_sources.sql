-- NorthSoft.AI.ContentCreator — Expand Research Sources & Add Run Diagnostics
-- Migration: 0010_expand_research_sources

ALTER TABLE research_runs ADD COLUMN items_discovered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_runs ADD COLUMN items_normalized INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_runs ADD COLUMN duplicates_found INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_runs ADD COLUMN rejected_irrelevant INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_runs ADD COLUMN rejected_low_quality INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_runs ADD COLUMN pillar_breakdown TEXT; -- JSON breakdown per ContentPillar

-- Expand research sources across Level 1, Level 2, and Level 3 content pillars
INSERT OR IGNORE INTO research_sources (id, name, url, type, category, enabled, priority) VALUES
  ('src-web-dev', 'Google Web.dev', 'https://web.dev/feed.xml', 'rss', 'WEB_TECHNOLOGY', 1, 10),
  ('src-smashing', 'Smashing Magazine', 'https://www.smashingmagazine.com/feed/', 'rss', 'WEB_TECHNOLOGY', 1, 9),
  ('src-search-engine-journal', 'Search Engine Journal', 'https://www.searchenginejournal.com/feed/', 'rss', 'MARKETING', 1, 10),
  ('src-google-search-blog', 'Google Search Central', 'https://feeds.feedburner.com/blogspot/amDG', 'rss', 'MARKETING', 1, 10),
  ('src-hubspot-blog', 'HubSpot Marketing', 'https://blog.hubspot.com/marketing/rss.xml', 'rss', 'ONLINE_PRESENCE', 1, 9),
  ('src-smallbiz-trends', 'Small Business Trends', 'https://smallbiztrends.com/feed', 'rss', 'SMALL_BUSINESS', 1, 8),
  ('src-entrepreneur', 'Entrepreneur Tech', 'https://www.entrepreneur.com/latest.rss', 'rss', 'SMALL_BUSINESS', 1, 8);
