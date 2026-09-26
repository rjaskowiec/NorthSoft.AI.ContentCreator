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
            <li class="nav-item active" id="nav-dashboard"><a href="#dashboard" onclick="switchTab('dashboard', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              Dashboard
            </a></li>
          </ul>

          <div class="nav-section-title">CONTENT</div>
          <ul class="nav-list">
            <li class="nav-item" id="nav-pipeline"><a href="#pipeline" onclick="switchTab('pipeline', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Pipeline Control
            </a></li>
            <li class="nav-item" id="nav-content"><a href="#content" onclick="switchTab('content', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Content Drafts
            </a></li>
            <li class="nav-item" id="nav-research"><a href="#research" onclick="switchTab('research', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Topic Research
            </a></li>
          </ul>

          <div class="nav-section-title">PUBLISHING</div>
          <ul class="nav-list">
            <li class="nav-item" id="nav-schedules"><a href="#schedules" onclick="switchTab('schedules', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Scheduled Queue
            </a></li>
            <li class="nav-item" id="nav-publications"><a href="#publications" onclick="switchTab('publications', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              Publications
            </a></li>
            <li class="nav-item" id="nav-manual-publisher"><a href="#manual-publisher" onclick="switchTab('manual-publisher', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Manual Publisher
            </a></li>
          </ul>

          <div class="nav-section-title">SYSTEM</div>
          <ul class="nav-list">
            <li class="nav-item" id="nav-audit"><a href="#audit" onclick="switchTab('audit', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Audit Log
            </a></li>
            <li class="nav-item" id="nav-security"><a href="#security" onclick="switchTab('security', event)">
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
        </head        <div class="content-body">

          <!-- TAB 1: DASHBOARD OVERVIEW -->
          <div id="tab-dashboard" class="tab-section active-tab">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Dashboard</h1>
                <p class="page-subtitle" style="margin-bottom:0;">NorthSoft AI ContentCreator — System Overview &amp; Content Performance</p>
              </div>
              <div>
                <button class="btn-primary" onclick="switchTab('pipeline', event)">
                  <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Pipeline Control &rarr;
                </button>
              </div>
            </div>

            <!-- Overview KPI Cards -->
            <div class="section-grid" id="pipeline-grid">
              <div class="card">
                <div class="card-label">Topics Available</div>
                <div class="card-val" id="cnt-ideas">0</div>
                <div class="card-sub">Discovered ideas</div>
              </div>
              <div class="card">
                <div class="card-label">Drafts Ready</div>
                <div class="card-val" id="cnt-drafts">0</div>
                <div class="card-sub">Pending QA / review</div>
              </div>
              <div class="card">
                <div class="card-label">Scheduled Posts</div>
                <div class="card-val" id="cnt-scheduled" style="color:var(--accent-blue);">0</div>
                <div class="card-sub">Queued for publication</div>
              </div>
              <div class="card">
                <div class="card-label">Published Posts</div>
                <div class="card-val" id="cnt-published" style="color:var(--accent-emerald);">0</div>
                <div class="card-sub">Live on Facebook</div>
              </div>
              <div class="card">
                <div class="card-label">Next Publication</div>
                <div class="card-val" id="cnt-next-pub" style="font-size:1.1rem;">Tomorrow, 09:00</div>
                <div class="card-sub">UTC Schedule</div>
              </div>
            </div>

            <!-- Automation Status Card -->
            <div class="panel" style="border-left: 4px solid var(--accent-blue);">
              <div class="panel-header" style="margin-bottom: 0.75rem;">
                <div class="panel-title" style="display:flex; align-items:center; gap:0.5rem;">
                  <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  Automation Status
                </div>
                <div id="dashboard-automation-badge">
                  <span class="status-badge status-healthy">● ON — ACTIVE</span>
                </div>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div id="dashboard-automation-text" style="font-size:0.925rem; color:var(--text-main);">
                  Automatic publishing is enabled. <strong>Next run:</strong> Tomorrow, 09:00 UTC.
                </div>
                <button class="btn-secondary" onclick="switchTab('pipeline', event)">Manage Automation &rarr;</button>
              </div>
            </div>

            <!-- Next Actions Panel -->
            <div class="panel" id="dashboard-next-actions-panel">
              <div class="panel-header">
                <div class="panel-title" style="display:flex; align-items:center; gap:0.5rem;">
                  <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Items Requiring Attention
                </div>
              </div>
              <div id="dashboard-actions-list" style="display:flex; flex-direction:column; gap:0.75rem;">
                <div style="color:var(--text-muted); font-size:0.875rem;">✓ All systems operating normally. No pending alerts.</div>
              </div>
            </div>

            <!-- Recent System Activity Log Preview -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Recent System Activity</div>
                <button class="btn-secondary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="switchTab('audit', event)">
                  View Audit Log &rarr;
                </button>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Actor</th>
                      <th>Entity</th>
                      <th>Summary</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody id="recent-activity-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Loading system activity...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 2: PIPELINE CONTROL -->
          <div id="tab-pipeline" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Pipeline Control &amp; Automation</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Control content discovery, post generation, quality evaluation, and automated publishing.</p>
              </div>
              <button id="run-full-pipeline-btn" class="btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); font-size:0.95rem; padding:0.75rem 1.4rem;" onclick="runFullPipelineNow()">
                🚀 RUN FULL PIPELINE NOW
              </button>
            </div>

            <div id="pipeline-control-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

            <!-- Live Progress Stepper Container -->
            <div id="pipeline-stepper-box" style="display:none;" class="panel">
              <div class="panel-header">
                <div class="panel-title" style="color:#60a5fa;">● Pipeline Execution Live Progress</div>
                <span class="status-badge badge-running">RUNNING</span>
              </div>
              <div class="pipeline-stepper">
                <div class="stepper-step" id="step-1"><span class="stepper-icon">1</span> <span>Finding topics...</span></div>
                <div class="stepper-step" id="step-2"><span class="stepper-icon">2</span> <span>Selecting candidate topic...</span></div>
                <div class="stepper-step" id="step-3"><span class="stepper-icon">3</span> <span>Generating post draft...</span></div>
                <div class="stepper-step" id="step-4"><span class="stepper-icon">4</span> <span>Quality &amp; Policy review...</span></div>
                <div class="stepper-step" id="step-5"><span class="stepper-icon">5</span> <span>Publishing to Facebook...</span></div>
              </div>
            </div>

            <!-- 4 Pipeline Stage Cards -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Pipeline Execution Stages</div>
              </div>

              <div class="section-grid" style="margin-bottom:0.5rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
                <!-- Stage 1 -->
                <div class="card" style="padding:1.25rem;">
                  <div class="card-label">1. Topic Research</div>
                  <p style="font-size:0.825rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.4;">
                    Find relevant content ideas and generate topic proposals from RSS sources.
                  </p>
                  <button id="stage-discovery-btn" class="btn-secondary" style="width:100%; justify-content:center;" onclick="runDiscoveryNow()">
                    🔎 Run now
                  </button>
                </div>

                <!-- Stage 2 -->
                <div class="card" style="padding:1.25rem;">
                  <div class="card-label">2. Content Generation</div>
                  <p style="font-size:0.825rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.4;">
                    Generate posts from selected topics and evaluate their quality &amp; policy rules.
                  </p>
                  <button id="stage-generation-btn" class="btn-secondary" style="width:100%; justify-content:center;" onclick="runPostGenerationNow()">
                    ✍ Run now
                  </button>
                </div>

                <!-- Stage 3 -->
                <div class="card" style="padding:1.25rem;">
                  <div class="card-label">3. Publishing</div>
                  <p style="font-size:0.825rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.4;">
                    Publish approved content directly to the configured Facebook Page.
                  </p>
                  <button id="stage-publishing-btn" class="btn-secondary" style="width:100%; justify-content:center;" onclick="runPublishNow()">
                    📤 Run now
                  </button>
                </div>
              </div>
            </div>

            <!-- Automatic Publishing Master Switch & Schedule -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Automatic Publishing Settings</div>
                <div id="scheduler-status-badge"><span class="status-badge status-disabled">SCHEDULER OFF</span></div>
              </div>

              <form id="scheduler-config-form" onsubmit="saveSchedulerConfig(event)">
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1.25rem; margin-bottom:1.25rem;">
                  <div>
                    <label class="form-label">Automatic Publishing</label>
                    <select id="sched-master-switch" class="form-input">
                      <option value="1">ON (Automated Execution)</option>
                      <option value="0">OFF (Manual Triggers Only)</option>
                    </select>
                  </div>

                  <div>
                    <label class="form-label">Frequency</label>
                    <select id="sched-frequency" class="form-input">
                      <option value="daily">Daily</option>
                      <option value="12h">Every 12 Hours</option>
                      <option value="6h">Every 6 Hours</option>
                    </select>
                  </div>

                  <div>
                    <label class="form-label">Publication Time (UTC)</label>
                    <input type="text" id="sched-time" class="form-input" value="09:00" placeholder="09:00" />
                  </div>

                  <div>
                    <label class="form-label">Days</label>
                    <div style="display:flex; gap:0.35rem; margin-top:0.4rem;">
                      <span class="status-badge status-active" style="font-size:0.75rem;">Mon - Sun</span>
                    </div>
                  </div>
                </div>

                <!-- Collapsible Advanced Settings -->
                <div style="margin-bottom:1.25rem;">
                  <button type="button" class="btn-secondary" style="font-size:0.8rem;" onclick="toggleAdvancedSchedulerSettings()">
                    ⚙ Advanced Settings <span id="adv-settings-arrow">&darr;</span>
                  </button>
                  <div id="adv-scheduler-panel" style="display:none; margin-top:0.85rem; padding:1rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px;">
                    <label class="form-label" style="margin-bottom:0.75rem;">Pipeline Stage Toggles</label>
                    <div style="display:flex; flex-wrap:wrap; gap:1.5rem; font-size:0.875rem;">
                      <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
                        <input type="checkbox" id="sched-stage-discovery" checked />
                        <span>Topic Research</span>
                      </label>
                      <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
                        <input type="checkbox" id="sched-stage-generation" checked />
                        <span>Post Generation</span>
                      </label>
                      <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
                        <input type="checkbox" id="sched-stage-evaluation" checked />
                        <span>Quality Review</span>
                      </label>
                      <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
                        <input type="checkbox" id="sched-stage-publishing" checked />
                        <span>Facebook Publishing</span>
                      </label>
                    </div>
                  </div>
                </div>

                <button type="submit" id="save-scheduler-btn" class="btn-primary">
                  Save Settings
                </button>
              </form>
            </div>

            <!-- Planned Runs Section -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Schedule a Planned Run</div>
              </div>
              <form id="planned-run-form" onsubmit="handlePlannedRunSubmit(event)" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1.25rem; align-items:end;">
                <div>
                  <label class="form-label">Date</label>
                  <input type="date" id="plan-run-date" class="form-input" required />
                </div>
                <div>
                  <label class="form-label">Time (UTC)</label>
                  <input type="time" id="plan-run-time" class="form-input" value="09:00" required />
                </div>
                <div>
                  <button type="submit" class="btn-primary" style="width:100%;">
                    📅 Schedule Planned Run
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- TAB 3: TOPIC RESEARCH -->
          <div id="tab-research" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Topic Research</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Find and manage ideas for future Facebook posts.</p>
              </div>
              <div style="display:flex; gap:0.75rem;">
                <button id="run-research-btn" class="btn-primary" onclick="runResearchNow()">
                  🔎 Find new topics
                </button>
                <button class="btn-secondary" onclick="openAddTopicModal()">
                  + Add topic
                </button>
              </div>
            </div>

            <div id="research-run-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

            <!-- Topics Table -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Topic Backlog</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="topics-table-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Loading topic proposals...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 4: CONTENT DRAFTS -->
          <div id="tab-content" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Content Drafts</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Review and manage posts before they are scheduled or published.</p>
              </div>
              <button class="btn-primary" onclick="openAddPostModal()">
                + Add post
              </button>
            </div>

            <div id="content-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

            <!-- Drafts Table -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Generated Post Drafts</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Topic Title</th>
                      <th>Post Preview</th>
                      <th>Status</th>
                      <th>Scheduled</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="posts-table-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Loading post drafts...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 5: SCHEDULED QUEUE -->
          <div id="tab-schedules" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Scheduled Queue</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Calendar and list view of upcoming automated publication posts.</p>
              </div>
              <div style="display:flex; gap:0.75rem; align-items:center;">
                <!-- View Toggle Buttons -->
                <div style="display:flex; background:rgba(255,255,255,0.05); border:1px solid var(--border-color); border-radius:8px; padding:0.2rem;">
                  <button id="btn-view-calendar" class="btn-secondary" style="font-size:0.8rem; padding:0.3rem 0.7rem; border:none; background:var(--accent-blue); color:white;" onclick="setQueueView('calendar')">Calendar</button>
                  <button id="btn-view-list" class="btn-secondary" style="font-size:0.8rem; padding:0.3rem 0.7rem; border:none; background:transparent;" onclick="setQueueView('list')">List</button>
                </div>
                <button class="btn-primary" onclick="openSchedulePostModal()">
                  + Schedule post
                </button>
              </div>
            </div>

            <!-- Calendar View Container -->
            <div id="schedules-calendar-view" class="calendar-container">
              <div class="calendar-controls">
                <button class="btn-secondary" style="font-size:0.85rem;" onclick="navigateCalendar(-1)">&larr; Previous</button>
                <div class="calendar-month-title" id="calendar-month-title">September 2026</div>
                <button class="btn-secondary" style="font-size:0.85rem;" onclick="navigateCalendar(1)">Next &rarr;</button>
              </div>

              <div class="calendar-grid-header">
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
              </div>

              <div class="calendar-grid" id="calendar-grid-days">
                <!-- Rendered dynamically by JS -->
              </div>
            </div>

            <!-- List View Container -->
            <div id="schedules-list-view" class="panel" style="display:none;">
              <div class="panel-header">
                <div class="panel-title">Scheduled Publications List</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Post Title</th>
                      <th>Scheduled Time (UTC)</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="schedules-table-body">
                    <tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Loading scheduled posts...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 6: PUBLICATIONS -->
          <div id="tab-publications" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Publications</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Published posts and performance history on Facebook.</p>
              </div>
            </div>

            <div id="publication-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Publication History</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Post Content</th>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Engagement</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="publications-table-body">
                    <tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Loading publication history...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 7: MANUAL FACEBOOK PUBLISHER -->
          <div id="tab-manual-publisher" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Manual Publisher</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Compose and publish a post directly to Facebook.</p>
              </div>
            </div>

            <div id="manual-pub-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

            <div class="manual-publisher-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items:start;">
              <div class="panel">
                <div class="panel-header">
                  <div class="panel-title">Compose Post</div>
                </div>

                <form id="manual-post-form" onsubmit="return false;">
                  <div class="form-group">
                    <label class="form-label" for="manual-post-content">Post Content (English)</label>
                    <textarea id="manual-post-content" class="form-input" style="min-height: 180px; resize: vertical; font-family: inherit; line-height: 1.5;" placeholder="Write your Facebook post in English..." required maxlength="63206"></textarea>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 0.4rem; font-size: 0.8rem; color: var(--text-muted);">
                      <span>Meta limit: 63,206 chars</span>
                      <span id="manual-char-counter">0 / 63206</span>
                    </div>
                  </div>

                  <div class="form-group" style="margin-top: 1.25rem;">
                    <label class="form-label" for="manual-post-link">Attachment Link (Optional)</label>
                    <input type="url" id="manual-post-link" class="form-input" placeholder="https://northsoft.is/article">
                  </div>

                  <div style="display:flex; gap: 0.75rem; justify-flex-end; margin-top: 1.5rem;">
                    <button type="button" class="btn-logout" onclick="clearManualForm()">Clear</button>
                    <button type="button" id="manual-publish-btn" class="btn-primary" style="background: linear-gradient(135deg, #1877f2, #0056b3);" onclick="openPublishConfirmation()">Publish to Facebook</button>
                  </div>
                </form>
              </div>

              <!-- Preview -->
              <div class="panel">
                <div class="panel-header">
                  <div class="panel-title">Post Preview</div>
                  <span class="status-badge status-healthy" style="font-size:0.7rem;">FACEBOOK</span>
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
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 8: AUDIT LOG -->
          <div id="tab-audit" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <div>
                <h1 class="page-title">Audit Log</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Technical audit ledger, security logs, and operational events.</p>
              </div>
              <button class="btn-secondary" style="font-size:0.8rem; padding:0.4rem 0.85rem;" onclick="loadAuditData()">
                🔄 Refresh
              </button>
            </div>

            <div class="panel">
              <div class="panel-header" style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:1rem;">
                <div id="audit-category-filters" style="display:flex; flex-wrap:wrap; gap:0.4rem;">
                  <button class="btn-secondary audit-cat-btn active" data-category="all" onclick="setAuditCategory('all')">All</button>
                  <button class="btn-secondary audit-cat-btn" data-category="errors" onclick="setAuditCategory('errors')">Errors</button>
                  <button class="btn-secondary audit-cat-btn" data-category="warnings" onclick="setAuditCategory('warnings')">Warnings</button>
                  <button class="btn-secondary audit-cat-btn" data-category="ai" onclick="setAuditCategory('ai')">AI</button>
                  <button class="btn-secondary audit-cat-btn" data-category="facebook" onclick="setAuditCategory('facebook')">Facebook</button>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem; min-width:240px;">
                  <input type="text" id="audit-search-input" class="form-input" style="padding:0.4rem 0.75rem; font-size:0.85rem;" placeholder="Search audit logs..." onkeyup="handleAuditSearch(event)" />
                </div>
              </div>

              <div class="table-container">
                <table style="width:100%; table-layout:fixed; border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th style="width:110px;">Status</th>
                      <th style="width:150px;">Event</th>
                      <th>Operation</th>
                      <th>Summary</th>
                      <th style="width:130px; text-align:right;">Time</th>
                    </tr>
                  </thead>
                  <tbody id="full-audit-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading audit records...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 9: ACCOUNT SECURITY -->
          <div id="tab-security" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Account &amp; Security</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Manage administrator credentials, recovery configuration, and active sessions.</p>
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
                Recovery email address configuration.
              </div>

              <form id="recovery-email-form">
                <div class="form-group">
                  <label class="form-label" for="recovery-email-input">Recovery Email Address</label>
                  <input type="email" id="recovery-email-input" class="form-input" required placeholder="admin@northsoft.is" autocomplete="email">
                </div>

                <button type="submit" id="save-recovery-email-btn" class="btn-primary" style="margin-top:0.5rem;">Save Email</button>
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

      <!-- 3. RIGHT FACEBOOK RAIL -->
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

  <!-- REUSABLE MODALS -->
  <!-- 1. ADD / EDIT TOPIC MODAL -->
  <div id="topic-modal" class="modal-backdrop">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title" id="topic-modal-title">Add New Topic</div>
        <button class="modal-close-btn" onclick="closeModal('topic-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="topic-form" onsubmit="handleSaveTopic(event)">
          <input type="hidden" id="topic-edit-id" value="" />
          <div class="form-group">
            <label class="form-label" for="topic-input-title">Topic Title (English)</label>
            <input type="text" id="topic-input-title" class="form-input" required placeholder="e.g. The Best Time to See the Northern Lights in Iceland" />
          </div>
          <div class="form-group">
            <label class="form-label" for="topic-input-desc">Description / Notes (English)</label>
            <textarea id="topic-input-desc" class="form-input" style="min-height:100px; font-family:inherit;" placeholder="Practical guidance for travelers..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="topic-input-pillar">Content Category / Pillar</label>
            <select id="topic-input-pillar" class="form-input">
              <option value="AI_AUTOMATION">AI &amp; Automation</option>
              <option value="SMALL_BUSINESS">Small Business Tips</option>
              <option value="WEB_TECHNOLOGY">Web Technology</option>
              <option value="MARKETING">Marketing &amp; Growth</option>
            </select>
          </div>
          <button type="submit" id="save-topic-btn" class="btn-primary" style="width:100%;">Save Topic</button>
        </form>
      </div>
    </div>
  </div>

  <!-- 2. ADD / EDIT POST DRAFT MODAL -->
  <div id="post-modal" class="modal-backdrop">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title" id="post-modal-title">Add Post Draft</div>
        <button class="modal-close-btn" onclick="closeModal('post-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="post-form" onsubmit="handleSavePost(event)">
          <input type="hidden" id="post-edit-id" value="" />
          <div class="form-group">
            <label class="form-label" for="post-input-topic">Associated Topic Title</label>
            <input type="text" id="post-input-topic" class="form-input" required placeholder="e.g. Northern Lights Photography Guide" />
          </div>
          <div class="form-group">
            <label class="form-label" for="post-input-content">Post Content (English)</label>
            <textarea id="post-input-content" class="form-input" style="min-height:140px; font-family:inherit;" required placeholder="Write post content..."></textarea>
          </div>
          <button type="submit" id="save-post-btn" class="btn-primary" style="width:100%;">Save Draft</button>
        </form>
      </div>
    </div>
  </div>

  <!-- 3. SCHEDULE POST MODAL -->
  <div id="schedule-post-modal" class="modal-backdrop">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">Schedule Post</div>
        <button class="modal-close-btn" onclick="closeModal('schedule-post-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="schedule-post-form" onsubmit="handleSaveSchedule(event)">
          <input type="hidden" id="schedule-edit-id" value="" />
          <div class="form-group">
            <label class="form-label" for="schedule-post-select">Select Post Draft</label>
            <select id="schedule-post-select" class="form-input" required>
              <option value="">-- Select an approved draft --</option>
            </select>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
            <div class="form-group">
              <label class="form-label" for="schedule-date">Date</label>
              <input type="date" id="schedule-date" class="form-input" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="schedule-time">Time (UTC)</label>
              <input type="time" id="schedule-time" class="form-input" value="09:00" required />
            </div>
          </div>
          <button type="submit" id="save-schedule-btn" class="btn-primary" style="width:100%;">Schedule Post</button>
        </form>
      </div>
    </div>
  </div>

  <!-- 4. PUBLISH CONFIRMATION MODAL -->
  <div id="publish-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:440px;">
      <div class="modal-header">
        <div class="modal-title">Publish to Facebook</div>
        <button class="modal-close-btn" onclick="closeModal('publish-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:0.9rem; color:var(--text-muted); line-height:1.5;">
          This will publish the post directly to your connected Facebook Page immediately.
        </p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-logout" onclick="closeModal('publish-modal')">Cancel</button>
        <button type="button" id="confirm-publish-btn" class="btn-primary" style="background: linear-gradient(135deg, #1877f2, #0056b3);" onclick="submitManualPublication()">Publish Now</button>
      </div>
    </div>
  </div>n()">Publish</button>
      </div>
    </div>
  </div>

  <script>
    ${getAdminScripts()}
  </script>
</body>
</html>`;
}
