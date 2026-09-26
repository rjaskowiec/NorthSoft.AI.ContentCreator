/**
 * NorthSoft.AI.ContentCreator — Admin Dashboard UI Entry Point
 *
 * Renders the single-page Admin Interface at /admin.
 * Implements Facebook / Meta Business style 3-column layout:
 * - Left Sidebar (Navigation)
 * - Center Workspace (Main active tab)
 * - Right Facebook Rail (Persistent live feed preview & health status)
 */

import { getAdminScripts } from './ui/scripts.js';
import { getAdminCss } from './ui/styles.js';

export function renderAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard — NorthSoft AI Content Creator</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${getAdminCss()}
  </style>
</head>
<body>
  <!-- AUTHENTICATION SCREEN -->
  <div id="login-screen">
    <div class="auth-card">
      <div class="auth-header">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24" style="width:28px; height:28px; fill:none; stroke:white; stroke-width:2;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <h1 class="brand-title">NorthSoft AI</h1>
        <p class="brand-sub">Content Creator Admin Interface</p>
      </div>

      <div id="login-alert" class="alert-error"></div>

      <form id="login-form">
        <div class="form-group">
          <label class="form-label" for="username">Administrator Username</label>
          <input type="text" id="username" class="form-input" required autocomplete="username" autofocus>
        </div>

        <div class="form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
            <label class="form-label" for="password" style="margin-bottom:0;">Password</label>
            <a href="#" id="forgot-password-link" style="color:var(--accent-blue); font-size:0.85rem; text-decoration:none;">Forgot password?</a>
          </div>
          <input type="password" id="password" class="form-input" required autocomplete="current-password">
        </div>

        <button type="submit" id="login-btn" class="btn-primary" style="width:100%;">Authenticate</button>
      </form>

      <!-- FORGOT PASSWORD FORM -->
      <form id="forgot-form" style="display:none;">
        <div id="forgot-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>

        <div class="form-group">
          <label class="form-label" for="forgot-email">Administrator Email Address</label>
          <input type="email" id="forgot-email" class="form-input" required placeholder="admin@northsoft.is" autocomplete="email">
        </div>

        <button type="submit" id="forgot-btn" class="btn-primary" style="width:100%; margin-bottom:1rem;">Request Password Reset Link</button>
        <div style="text-align:center;">
          <a href="#" id="back-to-login-link" style="color:var(--text-muted); font-size:0.85rem; text-decoration:none;">&larr; Back to Sign In</a>
        </div>
      </form>

      <!-- RESET PASSWORD FORM -->
      <form id="reset-form" style="display:none;">
        <div id="reset-alert" class="alert-error" style="display:none; margin-bottom:1rem;"></div>

        <div class="form-group">
          <label class="form-label" for="reset-new-password">New Password (min. 12 characters)</label>
          <input type="password" id="reset-new-password" class="form-input" required minlength="12" autocomplete="new-password">
        </div>

        <div class="form-group">
          <label class="form-label" for="reset-confirm-password">Confirm New Password</label>
          <input type="password" id="reset-confirm-password" class="form-input" required minlength="12" autocomplete="new-password">
        </div>

        <button type="submit" id="reset-btn" class="btn-primary" style="width:100%; margin-bottom:1rem;">Reset Password</button>
        <div style="text-align:center;">
          <a href="#" id="reset-to-login-link" style="color:var(--text-muted); font-size:0.85rem; text-decoration:none;">&larr; Back to Sign In</a>
        </div>
      </form>
    </div>
  </div>

  <!-- DASHBOARD 3-COLUMN SCREEN -->
  <div id="dashboard-screen">
    <div class="app-layout">

      <!-- 1. LEFT SIDEBAR NAVIGATION -->
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-logo" style="width:36px; height:36px; margin-bottom:0;">
            <svg viewBox="0 0 24 24" style="width:20px; height:20px; fill:none; stroke:white; stroke-width:2;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <div class="sidebar-brand-name">NorthSoft AI</div>
            <div class="sidebar-brand-sub">ContentCreator</div>
          </div>
        </div>

        <nav style="flex:1;">
          <div class="nav-section-title">MAIN</div>
          <ul class="nav-list">
            <li class="nav-item active" id="nav-dashboard"><a href="#dashboard" onclick="switchTab('dashboard')">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              Dashboard
            </a></li>
          </ul>

          <div class="nav-section-title">CONTENT</div>
          <ul class="nav-list">
            <li class="nav-item" id="nav-content"><a href="#content" onclick="switchTab('content')">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Content Drafts
            </a></li>
            <li class="nav-item" id="nav-research"><a href="#research" onclick="switchTab('research')">
              <svg viewBox="0 0 24 24" class="nav-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Topic Research
            </a></li>
          </ul>

          <div class="nav-section-title">PUBLISHING</div>
          <ul class="nav-list">
            <li class="nav-item" id="nav-schedules"><a href="#schedules" onclick="switchTab('schedules')">
              <svg viewBox="0 0 24 24" class="nav-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Scheduled Queue
            </a></li>
            <li class="nav-item" id="nav-publications"><a href="#publications" onclick="switchTab('publications')">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              Publications
            </a></li>
            <li class="nav-item" id="nav-manual-publisher"><a href="#manual-publisher" onclick="switchTab('manual-publisher')">
              <svg viewBox="0 0 24 24" class="nav-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Manual Publisher
            </a></li>
          </ul>

          <div class="nav-section-title">SYSTEM</div>
          <ul class="nav-list">
            <li class="nav-item" id="nav-audit"><a href="#audit" onclick="switchTab('audit')">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Audit Log
            </a></li>
            <li class="nav-item" id="nav-security"><a href="#security" onclick="switchTab('security')">
              <svg viewBox="0 0 24 24" class="nav-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Account & Security
            </a></li>
          </ul>
        </nav>
      </aside>

      <!-- 2. CENTER WORKSPACE -->
      <main class="main-content">
        <header class="header">
          <div class="header-left">
            <div class="header-app-title">NorthSoft AI ContentCreator</div>
            <div class="header-app-sub">Automated Content Research, Generation & Publishing</div>
          </div>

          <div class="header-user">
            <span id="env-badge" class="env-tag env-staging">STAGING</span>
            <div class="user-pill">
              <span class="user-avatar">👤</span>
              <span id="user-display">Administrator</span>
            </div>
            <button id="logout-btn" class="btn-logout">Sign Out</button>
          </div>
        </header>

        <div class="content-body">

          <!-- TAB 1: DASHBOARD OVERVIEW -->
          <div id="tab-dashboard" class="tab-section active-tab">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Dashboard</h1>
                <p class="page-subtitle" style="margin-bottom:0;">NorthSoft AI ContentCreator — Automated content research, generation, and publishing control panel.</p>
              </div>
            </div>

            <!-- Truthful System & Integration Status Grid -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
              <h2 style="font-size:1.05rem; font-weight:700; color:var(--text-main);">System &amp; Integration Status</h2>
              <span id="system-status-summary-badge" class="status-badge status-healthy">OPERATIONAL</span>
            </div>

            <div class="section-grid" id="status-grid">
              <div class="card">
                <div class="card-label">Cloudflare Worker</div>
                <div class="card-val" id="val-worker"><span class="status-badge status-healthy">Healthy</span></div>
                <div class="card-sub">Edge Runtime</div>
              </div>
              <div class="card">
                <div class="card-label">Database (D1)</div>
                <div class="card-val" id="val-db"><span class="status-badge status-healthy">Connected</span></div>
                <div class="card-sub">SQLite Database</div>
              </div>
              <div class="card">
                <div class="card-label">AI Engine</div>
                <div class="card-val" id="val-ai"><span class="status-badge status-active">Configured</span></div>
                <div class="card-sub">Workers AI</div>
              </div>
              <div class="card">
                <div class="card-label">Facebook Configuration</div>
                <div class="card-val" id="val-fb-config"><span class="status-badge status-disabled">Checking...</span></div>
                <div class="card-sub">Page ID &amp; Token</div>
              </div>
              <div class="card">
                <div class="card-label">Facebook READ API</div>
                <div class="card-val" id="val-fb-read"><span class="status-badge status-active">Checking...</span></div>
                <div class="card-sub">Graph API v26.0 /posts</div>
              </div>
              <div class="card">
                <div class="card-label">Facebook Publishing</div>
                <div class="card-val" id="val-fb-publishing"><span class="status-badge status-disabled">Disabled</span></div>
                <div class="card-sub">FACEBOOK_PUBLISH_ENABLED</div>
              </div>
            </div>

            <!-- Content Pipeline Summary Cards -->
            <h2 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin-bottom:0.75rem;">Content Pipeline</h2>
            <div class="section-grid" id="pipeline-grid">
              <div class="card">
                <div class="card-label">Ideas</div>
                <div class="card-val" id="cnt-ideas">0</div>
                <div class="card-sub">Discovered topics</div>
              </div>
              <div class="card">
                <div class="card-label">Drafts</div>
                <div class="card-val" id="cnt-drafts">0</div>
                <div class="card-sub">Generated drafts</div>
              </div>
              <div class="card">
                <div class="card-label">Awaiting QA</div>
                <div class="card-val" id="cnt-qa">0</div>
                <div class="card-sub">Quality check queue</div>
              </div>
              <div class="card">
                <div class="card-label">Approved</div>
                <div class="card-val" id="cnt-approved">0</div>
                <div class="card-sub">Ready for schedule</div>
              </div>
              <div class="card">
                <div class="card-label">Scheduled</div>
                <div class="card-val" id="cnt-scheduled">0</div>
                <div class="card-sub">Pending publication</div>
              </div>
              <div class="card">
                <div class="card-label">Published</div>
                <div class="card-val" id="cnt-published">0</div>
                <div class="card-sub">Successfully posted</div>
              </div>
              <div class="card">
                <div class="card-label">Blocked</div>
                <div class="card-val" id="cnt-blocked" style="color:var(--accent-rose);">0</div>
                <div class="card-sub">Failed policy/QA check</div>
              </div>
            </div>

            <!-- Autonomous Content Orchestrator Panel -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Autonomous Content Orchestrator Pipeline</div>
                <button id="run-pipeline-btn" class="btn-primary" onclick="runPipelineNow()">
                  <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M5 3l14 9-14 9V3z"/></svg> Run Pipeline Now
                </button>
              </div>
              <div id="pipeline-run-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>
              <div class="section-grid" style="margin-bottom:0;">
                <div>
                  <div class="card-label">Last Pipeline Run</div>
                  <div style="font-weight:600;" id="orch-last-time">Never</div>
                  <div style="font-size:0.8rem; color:var(--text-muted);" id="orch-last-trigger">Trigger: —</div>
                </div>
                <div>
                  <div class="card-label">Execution Status</div>
                  <div style="font-weight:600;" id="orch-status-val"><span class="status-badge status-healthy">IDLE</span></div>
                  <div style="font-size:0.8rem; color:var(--text-muted);" id="orch-result-val">Result: —</div>
                </div>
                <div>
                  <div class="card-label">Est. Neurons (Last Run)</div>
                  <div style="font-weight:600; color:var(--accent-cyan);" id="orch-neurons-val">0 Est. Neurons</div>
                </div>
              </div>
            </div>

            <!-- AI Quota & Budget Enforcement Panel -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Cloudflare Workers AI Quota &amp; Budget Enforcement</div>
                <div id="ai-quota-badge"><span class="status-badge status-healthy">FREE CAPACITY AVAILABLE</span></div>
              </div>
              <div class="section-grid" style="margin-bottom:0;">
                <div>
                  <div class="card-label">AI Inference Engine</div>
                  <div style="font-size:1.1rem; font-weight:700;" id="ai-provider-name">Cloudflare Workers AI</div>
                  <div class="card-sub">Zero Financial Cost Target</div>
                </div>
                <div>
                  <div class="card-label">Daily Request Count</div>
                  <div style="font-size:1.1rem; font-weight:700;" id="ai-today-text">0 / 10,000 requests</div>
                  <div class="progress-bar-container">
                    <div id="ai-today-bar" class="progress-bar-fill" style="width: 0%;"></div>
                  </div>
                </div>
                <div>
                  <div class="card-label">Daily Est. Neuron Usage</div>
                  <div style="font-size:1.1rem; font-weight:700;" id="ai-neurons-text">0 / 7,500 Est. Neurons (Hard Stop)</div>
                  <div class="progress-bar-container">
                    <div id="ai-neurons-bar" class="progress-bar-fill" style="width: 0%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Recent System Audit Activity Log Preview -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Recent System Audit Activity</div>
                <button class="btn-secondary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="switchTab('audit')">
                  View Full Audit Log &rarr;
                </button>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Actor</th>
                      <th>Entity</th>
                      <th>Details</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody id="recent-activity-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Loading audit activity...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB: CONTENT DRAFTS -->
          <div id="tab-content" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Content Pipeline &amp; Post Drafts</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Autonomous post draft generation, static checks, independent QA review, policy evaluation, and quality gate results.</p>
              </div>
            </div>

            <div id="content-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Generated Post Drafts &amp; Quality Gate Status</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Post Title &amp; Version Body</th>
                      <th>Status</th>
                      <th>Current Version</th>
                      <th>QA Score</th>
                      <th>Quality Decision</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody id="posts-table-body">
                    <tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Loading generated post drafts...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB: TOPIC RESEARCH -->
          <div id="tab-research" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Research Engine &amp; Topic Discovery</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Autonomous discovery, curation, and prioritization of candidate tech topics.</p>
              </div>
              <button id="run-research-btn" class="btn-primary" onclick="runResearchNow()">
                <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M5 3l14 9-14 9V3z"/></svg> Run Research Pipeline Now
              </button>
            </div>

            <div id="research-run-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

            <div class="section-grid">
              <div class="card">
                <div class="card-label">Curated Sources</div>
                <div class="card-val" id="res-sources-cnt">0</div>
                <div class="card-sub" id="res-enabled-sub">0 Active Feeds</div>
              </div>
              <div class="card">
                <div class="card-label">Discovered Topics</div>
                <div class="card-val" id="res-topics-cnt">0</div>
                <div class="card-sub">Stored in Backlog</div>
              </div>
              <div class="card">
                <div class="card-label">Last Pipeline Run</div>
                <div class="card-val" id="res-last-run" style="font-size:1.1rem;">Never</div>
                <div class="card-sub">Cron / Manual Trigger</div>
              </div>
            </div>

            <!-- Last Research Run Diagnostics Summary Card -->
            <div class="panel" id="res-diag-panel" style="display:none;">
              <div class="panel-header" style="margin-bottom:0.75rem;">
                <div class="panel-title" style="font-size:0.95rem; font-weight:600;">Last Research Run Operational Diagnostics</div>
                <span id="res-diag-status" class="status-badge status-healthy">COMPLETED</span>
              </div>
              <div style="display:flex; gap:1.5rem; flex-wrap:wrap; font-size:0.85rem;" id="res-diag-content">
                <!-- Populated via JS -->
              </div>
            </div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Discovered Candidate Topics</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Title &amp; Description</th>
                      <th>Category / Pillar</th>
                      <th>Relevance Score</th>
                      <th>Status</th>
                      <th>Date Discovered</th>
                    </tr>
                  </thead>
                  <tbody id="topics-table-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Loading discovered candidate topics...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Configured Research Sources</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Source Name</th>
                      <th>Category</th>
                      <th>Feed URL</th>
                      <th>Status</th>
                      <th>Last Checked</th>
                    </tr>
                  </thead>
                  <tbody id="sources-table-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Loading research sources...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Research Pipeline Execution History</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Started At</th>
                      <th>Trigger</th>
                      <th>Status</th>
                      <th>Discovered</th>
                      <th>Unique</th>
                      <th>Filtered (Irr / Low Q / Dup)</th>
                      <th>Final Candidates</th>
                    </tr>
                  </thead>
                  <tbody id="runs-table-body">
                    <tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Loading execution log...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB: SCHEDULED QUEUE -->
          <div id="tab-schedules" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Scheduled Content Queue</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Quality Gate approved content scheduled for future automated publication.</p>
              </div>
            </div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Scheduled Publications Queue</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Post Title</th>
                      <th>Scheduled Time (UTC)</th>
                      <th>Status</th>
                      <th>Version</th>
                      <th>QA Score</th>
                      <th>Quality Decision</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody id="schedules-table-body">
                    <tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Loading scheduled publications...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB: PUBLICATIONS -->
          <div id="tab-publications" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Meta / Facebook Publications</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Official Meta Graph API Facebook Page publication management, idempotency status, and retry controls.</p>
              </div>
            </div>

            <div id="publication-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Meta Graph API Configuration Status</div>
                <div id="meta-config-badge"><span class="status-badge status-disabled">NOT CONFIGURED</span></div>
              </div>
              <div class="section-grid" style="margin-bottom:0;">
                <div>
                  <div class="card-label">Page ID</div>
                  <div style="font-weight:600;" id="meta-pageid-val">Missing</div>
                </div>
                <div>
                  <div class="card-label">Page Access Token</div>
                  <div style="font-weight:600;" id="meta-token-val">Missing</div>
                </div>
                <div>
                  <div class="card-label">Graph API Version</div>
                  <div style="font-weight:600; color:var(--accent-blue);" id="meta-version-val">v26.0</div>
                </div>
                <div>
                  <div class="card-label">Publishing Safety Lock</div>
                  <div style="font-weight:600;" id="meta-lock-val">DISABLED</div>
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Facebook Publications Log</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Post Title &amp; Version Preview</th>
                      <th>Provider</th>
                      <th>Quality Gate</th>
                      <th>Publication Status</th>
                      <th>Facebook Post ID</th>
                      <th>Published At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="publications-table-body">
                    <tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Loading publication history...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB: MANUAL FACEBOOK PUBLISHER -->
          <div id="tab-manual-publisher" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Manual Facebook Publisher</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Publish content directly to the configured NorthSoft Facebook Page via official Meta Publisher.</p>
              </div>
              <div id="manual-meta-status-badge">
                <span class="status-badge status-healthy">META READY</span>
              </div>
            </div>

            <div id="manual-pub-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

            <div class="manual-publisher-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items:start;">
              <!-- Left Column: Composer Form -->
              <div class="panel">
                <div class="panel-header">
                  <div class="panel-title">Post Content</div>
                </div>

                <form id="manual-post-form" onsubmit="return false;">
                  <div class="form-group">
                    <label class="form-label" for="manual-post-content">Facebook Post Content</label>
                    <textarea id="manual-post-content" class="form-input" style="min-height: 180px; resize: vertical; font-family: inherit; line-height: 1.5;" placeholder="Write your Facebook post..." required maxlength="63206"></textarea>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 0.4rem; font-size: 0.8rem; color: var(--text-muted);">
                      <span>Meta Graph API limit</span>
                      <span id="manual-char-counter">0 / 63206 characters</span>
                    </div>
                  </div>

                  <div class="form-group" style="margin-top: 1.25rem;">
                    <label class="form-label" for="manual-post-link">Attachment Link (Optional)</label>
                    <input type="url" id="manual-post-link" class="form-input" placeholder="https://northsoft.is/article">
                    <div class="card-sub" style="margin-top:0.3rem;">Attach an external website or article link to the post.</div>
                  </div>

                  <div style="background: rgba(255, 255, 255, 0.03); border: 1px dashed var(--border-color); border-radius: 8px; padding: 1rem; margin-top: 1.25rem;">
                    <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted);">
                      <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      Media Attachments
                    </div>
                    <div style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4;">
                      URL link attachments supported. Direct binary file upload requires Cloudflare R2 media storage integration.
                    </div>
                  </div>

                  <div style="display:flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem;">
                    <button type="button" id="manual-clear-btn" class="btn-logout" onclick="clearManualForm()">Clear</button>
                    <button type="button" id="manual-validate-btn" class="btn-secondary" onclick="validateManualForm()">Validate</button>
                    <button type="button" id="manual-publish-btn" class="btn-primary" style="background: linear-gradient(135deg, #1877f2, #0056b3);" onclick="openPublishConfirmation()">Publish to Facebook</button>
                  </div>
                </form>
              </div>

              <!-- Right Column: Live Facebook Post Preview -->
              <div class="panel">
                <div class="panel-header">
                  <div class="panel-title">Post Preview</div>
                  <span class="status-badge status-healthy" style="font-size:0.7rem;">META PREVIEW</span>
                </div>

                <div class="fb-preview-card" style="background: #18191a; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1.25rem; color: #e4e6eb;">
                  <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.85rem;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #1877f2, #0056b3); display: flex; align-items: center; justify-content: center; font-weight: 700; color: white; font-size: 0.95rem; flex-shrink:0;">
                      NS
                    </div>
                    <div>
                      <div style="font-weight: 600; font-size: 0.95rem; color: #e4e6eb;">NorthSoft</div>
                      <div style="font-size: 0.75rem; color: #b0b3b8; display: flex; align-items: center; gap: 0.25rem;">
                        <span>Just now</span> &middot; <span>🌐</span>
                      </div>
                    </div>
                  </div>

                  <div id="preview-text" style="font-size: 0.95rem; white-space: pre-wrap; word-break: break-word; line-height: 1.45; color: #e4e6eb; margin-bottom: 0.75rem; min-height: 80px;">Write your Facebook post...</div>

                  <div id="preview-link-card" style="display: none; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; overflow: hidden; background: #242526; margin-top: 0.75rem;">
                    <div style="padding: 0.75rem;">
                      <div style="font-size: 0.75rem; color: #b0b3b8; text-transform: uppercase;" id="preview-link-domain">NORTHSOFT.IS</div>
                      <div style="font-weight: 600; font-size: 0.9rem; color: #e4e6eb; margin-top: 0.2rem;" id="preview-link-title">Attached External Link</div>
                      <div style="font-size: 0.8rem; color: #b0b3b8; margin-top: 0.2rem;" id="preview-link-url">https://northsoft.is</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: AUDIT LOG -->
          <div id="tab-audit" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <div>
                <h1 class="page-title">System Audit Log</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Operational ledger, security events, AI research &amp; execution metrics.</p>
              </div>
              <button class="btn-secondary" style="font-size:0.8rem; padding:0.4rem 0.85rem;" onclick="loadAuditData()">
                🔄 Refresh
              </button>
            </div>

            <!-- Operational Summary Statistics Cards -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
              <div class="panel" style="padding:1rem;">
                <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Total Events</div>
                <div id="audit-stat-events" style="font-size:1.5rem; font-weight:700; color:var(--text-main); margin-top:0.25rem;">—</div>
              </div>
              <div class="panel" style="padding:1rem;">
                <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Errors</div>
                <div id="audit-stat-errors" style="font-size:1.5rem; font-weight:700; color:var(--accent-rose); margin-top:0.25rem;">—</div>
              </div>
              <div class="panel" style="padding:1rem;">
                <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Warnings</div>
                <div id="audit-stat-warnings" style="font-size:1.5rem; font-weight:700; color:var(--accent-amber); margin-top:0.25rem;">—</div>
              </div>
              <div class="panel" style="padding:1rem;">
                <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">AI Operations</div>
                <div id="audit-stat-ai" style="font-size:1.5rem; font-weight:700; color:var(--accent-cyan); margin-top:0.25rem;">—</div>
              </div>
              <div class="panel" style="padding:1rem;">
                <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">System</div>
                <div style="font-size:1.1rem; font-weight:700; color:var(--accent-emerald); margin-top:0.35rem; display:flex; align-items:center; gap:0.4rem;">
                  <span class="status-badge status-healthy">Healthy</span>
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-header" style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:1rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                <!-- Filter Buttons -->
                <div id="audit-category-filters" style="display:flex; flex-wrap:wrap; gap:0.4rem;">
                  <button class="btn-secondary audit-cat-btn active" data-category="all" onclick="setAuditCategory('all')">All</button>
                  <button class="btn-secondary audit-cat-btn" data-category="errors" onclick="setAuditCategory('errors')">Errors</button>
                  <button class="btn-secondary audit-cat-btn" data-category="warnings" onclick="setAuditCategory('warnings')">Warnings</button>
                  <button class="btn-secondary audit-cat-btn" data-category="ai" onclick="setAuditCategory('ai')">AI</button>
                  <button class="btn-secondary audit-cat-btn" data-category="facebook" onclick="setAuditCategory('facebook')">Facebook</button>
                  <button class="btn-secondary audit-cat-btn" data-category="auth" onclick="setAuditCategory('auth')">Auth</button>
                  <button class="btn-secondary audit-cat-btn" data-category="system" onclick="setAuditCategory('system')">System</button>
                </div>

                <!-- Search Input -->
                <div style="display:flex; align-items:center; gap:0.5rem; min-width:240px;">
                  <input type="text" id="audit-search-input" class="form-input" style="padding:0.4rem 0.75rem; font-size:0.85rem;" placeholder="Search events, operations..." onkeyup="handleAuditSearch(event)" />
                  <button class="btn-secondary" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="executeAuditSearch()">Search</button>
                </div>
              </div>

              <div class="table-container">
                <table style="width:100%; table-layout:fixed; border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th style="width:110px;">Status</th>
                      <th style="width:150px;">Event</th>
                      <th>Operation</th>
                      <th>Result / Summary</th>
                      <th style="width:130px; text-align:right;">Time</th>
                    </tr>
                  </thead>
                  <tbody id="full-audit-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading full audit log records...</td></tr>
                  </tbody>
                </table>
              </div>

              <!-- Pagination Controls -->
              <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; padding-top:0.75rem; border-top:1px solid var(--border-color);">
                <div id="audit-pagination-info" style="font-size:0.825rem; color:var(--text-muted);">
                  Showing 0 - 0 of 0 events
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <button id="audit-prev-btn" class="btn-secondary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="changeAuditPage(-1)" disabled>
                    Previous
                  </button>
                  <span id="audit-page-indicator" style="font-size:0.825rem; color:var(--text-main); font-weight:600;">Page 1</span>
                  <button id="audit-next-btn" class="btn-secondary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="changeAuditPage(1)" disabled>
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: ACCOUNT SECURITY -->
          <div id="tab-security" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Account &amp; Password Security</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Rotate administrator password, manage active recovery email, and review security status.</p>
              </div>
            </div>

            <div id="security-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>

            <!-- Password Recovery Email Panel -->
            <div class="panel" style="max-width: 600px; margin-bottom: 2rem;">
              <div class="panel-header">
                <div class="panel-title">Password Recovery Email</div>
                <div id="recovery-email-badge"><span class="status-badge status-disabled">Not configured</span></div>
              </div>

              <div id="recovery-email-status-box" style="margin-bottom: 1rem; font-size: 0.9rem; color: var(--text-muted);">
                Password recovery via email is currently <strong>unavailable</strong> because no recovery email address has been set.
              </div>

              <form id="recovery-email-form">
                <div class="form-group">
                  <label class="form-label" for="recovery-email-input">Recovery Email Address</label>
                  <input type="email" id="recovery-email-input" class="form-input" required placeholder="admin@northsoft.is" autocomplete="email">
                </div>

                <button type="submit" id="save-recovery-email-btn" class="btn-primary" style="margin-top:0.5rem;">Save Recovery Email</button>
              </form>
            </div>

            <!-- Change Password Panel -->
            <div class="panel" style="max-width: 600px;">
              <div class="panel-header">
                <div class="panel-title">Change Password</div>
              </div>

              <form id="change-password-form">
                <div class="form-group">
                  <label class="form-label" for="change-current-password">Current Password</label>
                  <input type="password" id="change-current-password" class="form-input" required autocomplete="current-password">
                </div>

                <div class="form-group">
                  <label class="form-label" for="change-new-password">New Password (min. 12 characters)</label>
                  <input type="password" id="change-new-password" class="form-input" required minlength="12" autocomplete="new-password">
                </div>

                <div class="form-group">
                  <label class="form-label" for="change-confirm-password">Confirm New Password</label>
                  <input type="password" id="change-confirm-password" class="form-input" required minlength="12" autocomplete="new-password">
                </div>

                <button type="submit" id="change-password-btn" class="btn-primary" style="margin-top:0.5rem;">Update Password</button>
              </form>
            </div>
          </div>

        </div>
      </main>

      <!-- 3. RIGHT FACEBOOK LIVE PREVIEW RAIL -->
      <aside class="facebook-rail">
        <div class="fb-rail-header">
          <div class="fb-rail-title">
            <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:#1877f2; flex-shrink:0;"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            <span>Facebook Feed</span>
          </div>
          <div id="fb-rail-status-badge"><span class="status-badge status-healthy">LIVE</span></div>
        </div>

        <div class="fb-rail-page-box">
          <div class="fb-rail-page-header">
            <div id="fb-rail-avatar" class="fb-rail-avatar">NS</div>
            <div>
              <div id="fb-rail-page-name" class="fb-rail-page-title">NorthSoft</div>
              <div id="fb-rail-page-id" class="fb-rail-page-sub">Page ID: 107455558114139</div>
            </div>
          </div>
          <div class="fb-rail-status-row">
            <div id="fb-rail-read-status" class="fb-rail-status-chip status-healthy">● READ: Connected</div>
            <div id="fb-rail-pub-status" class="fb-rail-status-chip status-active">● Pub: Enabled</div>
          </div>
        </div>

        <div class="fb-rail-feed-header">
          <span style="font-weight:600; font-size:0.85rem; color:var(--text-main);">Latest Page Posts</span>
          <button id="fb-rail-refresh-btn" class="btn-icon-refresh" onclick="loadFacebookPagePosts()" title="Refresh Facebook Feed">
            <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
        </div>

        <div id="fb-rail-posts-container" class="fb-rail-posts-list">
          <div style="text-align:center; padding:2rem 0; color:var(--text-muted);">
            <div class="fb-post-loading-spinner"></div>
            <div style="margin-top:0.75rem; font-size:0.825rem;">Loading Facebook feed...</div>
          </div>
        </div>

        <div id="fb-rail-load-more-wrap" style="display:none; margin-top:1rem; text-align:center;">
          <button id="fb-rail-load-more-btn" class="btn-secondary" style="width:100%; padding:0.5rem; font-size:0.825rem;" onclick="loadFacebookPagePosts(true)">
            Load More Posts
          </button>
        </div>
      </aside>

    </div>
  </div>

  <!-- CONFIRMATION MODAL -->
  <div id="publish-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:1000; align-items:center; justify-content:center;">
    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; max-width:480px; width:90%; padding:1.75rem; box-shadow:0 20px 40px rgba(0,0,0,0.6);">
      <h3 style="font-size:1.2rem; font-weight:600; margin-bottom:0.75rem; color:var(--text-primary);">Publish to Facebook?</h3>
      <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.5; margin-bottom:1.5rem;">
        This will publish the prepared content directly to the configured NorthSoft Facebook Page.
      </p>
      <div style="display:flex; gap:0.75rem; justify-flex-end;">
        <button type="button" class="btn-logout" onclick="closePublishConfirmation()">Cancel</button>
        <button type="button" id="confirm-publish-btn" class="btn-primary" style="background: linear-gradient(135deg, #1877f2, #0056b3);" onclick="submitManualPublication()">Publish</button>
      </div>
    </div>
  </div>

  <script>
    ${getAdminScripts()}
  </script>
</body>
</html>`;
}
