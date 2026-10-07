-- NorthSoft.AI.ContentCreator — Topic Clusters, Research Freshness & Editorial Seeds
-- Migration: 0026_topic_clusters_and_research_freshness

-- 1. Extend content_ideas with cluster keys and business transformation layers
ALTER TABLE content_ideas ADD COLUMN cluster_key TEXT;
ALTER TABLE content_ideas ADD COLUMN market_phenomenon TEXT;
ALTER TABLE content_ideas ADD COLUMN customer_opportunity TEXT;

CREATE INDEX IF NOT EXISTS idx_content_ideas_cluster ON content_ideas(cluster_key);

-- 2. Extend content_topic_history with cluster_key for cooldown tracking
ALTER TABLE content_topic_history ADD COLUMN cluster_key TEXT;

CREATE INDEX IF NOT EXISTS idx_topic_history_cluster ON content_topic_history(cluster_key);

-- 3. Extend research_sources with domain_category for better classification
ALTER TABLE research_sources ADD COLUMN domain_category TEXT DEFAULT 'general';

-- 4. Editorial Seeds (Evergreen Small Business & NorthSoft client pain points)
CREATE TABLE IF NOT EXISTS editorial_seeds (
  id TEXT PRIMARY KEY,
  pillar TEXT NOT NULL,
  cluster_key TEXT NOT NULL,
  title TEXT NOT NULL,
  business_problem TEXT NOT NULL,
  client_opportunity TEXT NOT NULL,
  suggested_angle TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT 'small_business_owner',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  times_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_editorial_seeds_cluster ON editorial_seeds(cluster_key);
CREATE INDEX IF NOT EXISTS idx_editorial_seeds_enabled ON editorial_seeds(enabled);

-- 5. Insert Curated Evergreen Editorial Seeds
INSERT OR IGNORE INTO editorial_seeds (id, pillar, cluster_key, title, business_problem, client_opportunity, suggested_angle) VALUES
  ('seed-speed-conversion', 'WEBSITE', 'website_speed_conversion', 'Slow Loading Websites Lose Clients Before They Read A Word', 'Over 50% of mobile visitors abandon sites taking more than 3 seconds to load.', 'A quick technical overhaul can instantly boost inquiry rates without spending more on ads.', 'Show local businesses how simple speed optimization prevents lost inquiries.'),
  ('seed-response-speed', 'SALES', 'lead_response_time', 'The 15-Minute Rule: Why Late Quotes Go To Competitors', 'Small business owners take 24-48 hours to reply to website quote forms.', 'Setting up an instant automated acknowledgment or SMS notification wins 3x more deals.', 'Highlight the commercial cost of slow response time and simple automated fix.'),
  ('seed-pricing-clarity', 'SALES', 'pricing_service_transparency', 'Why "Contact Us For Pricing" Scares Modern Buyers Away', 'Customers dislike mystery pricing and move to competitors with clear starter packages.', 'Publishing transparent starting estimates builds immediate trust and filters serious leads.', 'Address the fear of showing prices and provide a framework for starting ranges.'),
  ('seed-form-friction', 'WEBSITE', 'contact_form_friction', 'The 8-Field Form Trap: How Complicated Contact Pages Kill Leads', 'Too many mandatory fields cause 70% drop-off on mobile phones.', 'Trimming contact forms down to name, phone/email and message doubles conversion.', 'Give small owners an actionable audit of their contact page friction points.'),
  ('seed-local-maps', 'MARKETING', 'local_seo_maps', 'Why Being Invisible On Google Maps Is Costing Local Walk-Ins', 'Outdated opening hours, missing photos and zero Google reviews push customers to competitors.', 'A 30-minute monthly routine on Google Business Profile keeps local inquiries flowing.', 'Guide local business owners through high-impact Google Maps hygiene.'),
  ('seed-chatbots-weekend', 'AI', 'chatbot_first_touch', 'Weekend Inquiries: How AI Assistants Capture Leads While You Sleep', 'Potential clients browse services in the evening or weekends when offices are closed.', 'A trained AI assistant can qualify the lead, collect contact details, and schedule a call.', 'Demonstrate how a simple AI assistant prevents losing weekend prospects.'),
  ('seed-spreadsheet-overload', 'SMALL_BUSINESS', 'internal_workflow_automation', 'The Hidden Cost Of Running Your Business On Disconnected Spreadsheets', 'Owners waste 5-10 hours a week manually copy-pasting customer details across files.', 'Connecting web forms directly to email/CRM saves whole workdays every month.', 'Show the real hourly cost of manual administrative busywork.'),
  ('seed-reviews-proof', 'CUSTOMER_EXPERIENCE', 'reviews_social_proof', 'How To Turn Happy Offline Customers Into Powerful Online Advocates', 'Satisfied clients rarely leave reviews unless politely and conveniently prompted.', 'A direct link or follow-up SMS after service completion reliably generates 5-star social proof.', 'Actionable strategy for systematically gathering authentic local reviews.');

-- 6. Insert Expanded High-Quality Diverse RSS Sources (~30 curated sources across SMB, Marketing, Sales, CX, Tech)
INSERT OR IGNORE INTO research_sources (id, name, url, type, category, domain_category, enabled, priority) VALUES
  ('src-marketing-land', 'MarTech / Marketing Land', 'https://martech.org/feed/', 'rss', 'MARKETING', 'marketing', 1, 9),
  ('src-social-media-today', 'Social Media Today', 'https://www.socialmediatoday.com/rss.xml', 'rss', 'MARKETING', 'social_media', 1, 8),
  ('src-unbounce-blog', 'Unbounce Conversion Blog', 'https://unbounce.com/feed/', 'rss', 'WEBSITE', 'conversion_cro', 1, 9),
  ('src-nielsen-norman', 'Nielsen Norman Group UX', 'https://www.nngroup.com/feed/rss/', 'rss', 'CUSTOMER_EXPERIENCE', 'ux_design', 1, 8),
  ('src-zapier-blog', 'Zapier Automation Blog', 'https://zapier.com/blog/feeds/latest/', 'rss', 'AI', 'automation_productivity', 1, 9),
  ('src-forbes-smallbiz', 'Forbes Small Business', 'https://www.forbes.com/small-business/feed/', 'rss', 'SMALL_BUSINESS', 'business_strategy', 1, 8),
  ('src-growthhackers', 'GrowthHackers Community', 'https://growthhackers.com/posts/feed', 'rss', 'MARKETING', 'growth_marketing', 1, 7),
  ('src-practicalecommerce', 'Practical Ecommerce', 'https://www.practicalecommerce.com/feed', 'rss', 'WEBSITE', 'ecommerce_sales', 1, 8),
  ('src-content-marketing-inst', 'Content Marketing Institute', 'https://contentmarketinginstitute.com/feed/', 'rss', 'MARKETING', 'content_marketing', 1, 7),
  ('src-duct-tape-marketing', 'Duct Tape Marketing (SMB)', 'https://ducttapemarketing.com/feed/', 'rss', 'SMALL_BUSINESS', 'small_business_sales', 1, 8),
  ('src-convince-and-convert', 'Convince & Convert', 'https://www.convinceandconvert.com/feed/', 'rss', 'CUSTOMER_EXPERIENCE', 'cx_digital', 1, 8),
  ('src-copyblogger', 'Copyblogger Writing & Sales', 'https://copyblogger.com/feed/', 'rss', 'SALES', 'copywriting_sales', 1, 7);
