/**
 * NorthSoft.AI.ContentCreator — Admin Dashboard UI Entry Point
 *
 * Renders the single-page Admin Interface at /admin.
 * Implements modern 8-tab Information Architecture:
 * 1. Dashboard
 * 2. Pipeline Control
 * 3. Topic Research
 * 4. Content Drafts
 * 5. Scheduled Queue
 * 6. Publications
 * 7. Account & Security
 * 8. Audit Log
 */

import { getAdminScripts } from './ui/scripts.js';
import { getAdminCss } from './ui/styles.js';

export function renderAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Control Center — NorthSoft AI Content Creator</title>
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
          <label class="form-label" for="username">Username</label>
          <input type="text" id="username" class="form-input" required autocomplete="username" autofocus>
        </div>

        <div class="form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
            <label class="form-label" for="password" style="margin-bottom:0;">Password</label>
            <a href="#" id="forgot-password-link" style="color:var(--accent-blue); font-size:0.85rem; text-decoration:none;">Forgot password?</a>
          </div>
          <input type="password" id="password" class="form-input" required autocomplete="current-password">
        </div>

        <button type="submit" id="login-btn" class="btn-primary" style="width:100%;">Sign in</button>
      </form>

      <!-- FORGOT PASSWORD FORM -->
      <form id="forgot-form" style="display:none;">
        <div id="forgot-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>

        <div class="form-group">
          <label class="form-label" for="forgot-email">Email Address</label>
          <input type="email" id="forgot-email" class="form-input" required placeholder="admin@northsoft.is" autocomplete="email">
        </div>

        <button type="submit" id="forgot-btn" class="btn-primary" style="width:100%; margin-bottom:1rem;">Send reset link</button>
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

  <!-- DASHBOARD MAIN SCREEN -->
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

          <div class="nav-section-title">CONTENT PIPELINE</div>
          <ul class="nav-list">
            <li class="nav-item" id="nav-pipeline"><a href="#pipeline" onclick="switchTab('pipeline', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Pipeline Control
            </a></li>
            <li class="nav-item" id="nav-research"><a href="#research" onclick="switchTab('research', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Topic Research
            </a></li>
            <li class="nav-item" id="nav-content"><a href="#content" onclick="switchTab('content', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Content Drafts
            </a></li>
            <li class="nav-item" id="nav-images"><a href="#images" onclick="switchTab('images', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Image Library
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
            <li class="nav-item" id="nav-intelligence"><a href="#intelligence" onclick="switchTab('intelligence', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              Content Intelligence
            </a></li>
          </ul>

          <div class="nav-section-title">SYSTEM</div>
          <ul class="nav-list">
            <li class="nav-item" id="nav-security"><a href="#security" onclick="switchTab('security', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Account &amp; Security
            </a></li>
            <li class="nav-item" id="nav-audit"><a href="#audit" onclick="switchTab('audit', event)">
              <svg viewBox="0 0 24 24" class="nav-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Audit Log
            </a></li>
          </ul>
        </nav>
      </aside>

      <!-- 2. CENTER WORKSPACE -->
      <main class="main-content">
        <header class="header">
          <div class="header-left">
            <div class="header-app-title">NorthSoft AI ContentCreator</div>
            <div class="header-app-sub">Automated Content Research, Generation &amp; Publishing</div>
          </div>

          <div class="header-user">
            <span id="env-badge" class="env-tag env-production">PRODUCTION</span>
            <div class="user-pill">
              <span class="user-avatar" style="display:inline-flex; align-items:center;">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <span id="user-display">Administrator</span>
            </div>
            <button id="logout-btn" class="btn-logout">Sign Out</button>
          </div>
        </header>

        <div class="content-body">

          <!-- TAB 1: DASHBOARD OVERVIEW -->
          <div id="tab-dashboard" class="tab-section active-tab">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Dashboard</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Operational overview and live publication status.</p>
              </div>
              <div style="display:flex; gap:0.75rem; align-items:center;">
                <div id="dash-op-status-badge">
                  <span class="status-badge status-healthy">● OPERATIONAL</span>
                </div>
                <button class="btn-primary" onclick="switchTab('pipeline', event)">
                  Pipeline Control &rarr;
                </button>
              </div>
            </div>

            <!-- Attention Alerts Section (Shown only if issues exist) -->
            <div id="dash-attention-container" style="display:none; margin-bottom:1.5rem;"></div>

            <!-- Primary Operational Metrics Grid -->
            <div class="section-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-bottom:1.5rem;">
              <div class="card" style="border-top:3px solid var(--accent-cyan);">
                <div class="card-label">Next Publication</div>
                <div class="card-val" id="cnt-next-pub" style="font-size:1.05rem; color:var(--text-main); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  No posts scheduled
                </div>
                <div class="card-sub" id="cnt-next-pub-sub" style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
                  Scheduled queue is empty
                </div>
              </div>

              <div class="card">
                <div class="card-label">Scheduled Queue</div>
                <div class="card-val" id="cnt-scheduled" style="color:var(--accent-blue);">0</div>
                <div class="card-sub" id="cnt-scheduled-sub">Upcoming publications</div>
              </div>

              <div class="card">
                <div class="card-label">Drafts Awaiting Review</div>
                <div class="card-val" id="cnt-drafts">0</div>
                <div class="card-sub">Pending QA / review</div>
              </div>

              <div class="card">
                <div class="card-label">Published Posts</div>
                <div class="card-val" id="cnt-published" style="color:var(--accent-emerald);">0</div>
                <div class="card-sub">Successfully published</div>
              </div>
            </div>

            <!-- Integrations & Automation Overview Cards -->
            <div class="section-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-bottom:1.5rem;">
              <div class="card">
                <div class="card-label">Facebook Connection</div>
                <div class="card-val" id="dash-fb-status" style="font-size:1.05rem; color:var(--accent-emerald);">● CONNECTED</div>
                <div class="card-sub" id="dash-fb-sub">Page configured &amp; active</div>
              </div>

              <div class="card">
                <div class="card-label">Automation Master</div>
                <div class="card-val" id="dash-automation-status" style="font-size:1.05rem; color:var(--accent-blue);">● ACTIVE</div>
                <div class="card-sub" id="dash-automation-sub">Cron: Every 5 minutes</div>
              </div>

              <div class="card">
                <div class="card-label">Research Topics</div>
                <div class="card-val" id="cnt-ideas">0</div>
                <div class="card-sub">Discovered &amp; available</div>
              </div>
            </div>

            <!-- Current Activity & Status Panel -->
            <div class="panel" style="border-left: 4px solid var(--accent-blue);">
              <div class="panel-header" style="margin-bottom: 0.75rem;">
                <div class="panel-title" style="display:flex; align-items:center; gap:0.5rem;">
                  <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  Current Activity &amp; Status
                </div>
                <div id="dashboard-activity-badge">
                  <span class="status-badge status-healthy">IDLE — READY</span>
                </div>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div id="dashboard-automation-text" style="font-size:0.925rem; color:var(--text-main);">
                  All systems are running normally. No pipeline run currently in progress.
                </div>
                <button class="btn-secondary" onclick="switchTab('pipeline', event)">Manage Pipeline &rarr;</button>
              </div>
            </div>

            <!-- Recent System Activity -->
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
                      <th>Summary</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody id="recent-activity-body">
                    <tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Loading system activity...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 2: PIPELINE CONTROL -->
          <div id="tab-pipeline" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Pipeline Control</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Manage automation and content pipeline execution.</p>
              </div>
              <button id="run-full-pipeline-btn" class="btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); font-size:0.95rem; padding:0.75rem 1.4rem;" onclick="runFullPipelineNow()">
                Run full pipeline
              </button>
            </div>

            <!-- Live Progress Stepper Container -->
            <div id="pipeline-stepper-box" style="display:none;" class="panel">
              <div class="panel-header">
                <div class="panel-title" style="color:#60a5fa;">● Pipeline Execution Live Progress</div>
                <span class="status-badge badge-running">RUNNING</span>
              </div>
              <div class="pipeline-stepper">
                <div class="stepper-step" id="step-1"><span class="stepper-icon">1</span> <span>Finding topics...</span></div>
                <div class="stepper-step" id="step-2"><span class="stepper-icon">2</span> <span>Selecting topic...</span></div>
                <div class="stepper-step" id="step-3"><span class="stepper-icon">3</span> <span>Generating post draft...</span></div>
                <div class="stepper-step" id="step-4"><span class="stepper-icon">4</span> <span>Evaluating content quality...</span></div>
                <div class="stepper-step" id="step-5"><span class="stepper-icon">5</span> <span>Publishing to Facebook...</span></div>
              </div>
            </div>

            <!-- 3 Pipeline Stage Cards -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Pipeline Stages</div>
              </div>

              <div class="section-grid" style="margin-bottom:0.5rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));">
                <!-- Stage 1 -->
                <div class="card" style="padding:1.25rem;">
                  <div class="card-label">Topic Research</div>
                  <p style="font-size:0.825rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.4;">
                    Find content ideas from configured sources.
                  </p>
                  <button id="stage-discovery-btn" class="btn-secondary" style="width:100%; justify-content:center;" onclick="runDiscoveryNow()">
                    Find topics
                  </button>
                </div>

                <!-- Stage 2 -->
                <div class="card" style="padding:1.25rem;">
                  <div class="card-label">Post Generation</div>
                  <p style="font-size:0.825rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.4;">
                    Generate post drafts from active topics.
                  </p>
                  <button id="stage-generation-btn" class="btn-secondary" style="width:100%; justify-content:center;" onclick="runPostGenerationNow()">
                    Generate post
                  </button>
                </div>

                <!-- Stage 3 -->
                <div class="card" style="padding:1.25rem;">
                  <div class="card-label">Facebook Publishing</div>
                  <p style="font-size:0.825rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.4;">
                    Publish approved drafts to Facebook.
                  </p>
                  <button id="stage-publishing-btn" class="btn-secondary" style="width:100%; justify-content:center;" onclick="runPublishNow()">
                    Publish now
                  </button>
                </div>
              </div>
            </div>

            <!-- Master Automation Settings -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Automation Settings</div>
                <div id="scheduler-status-badge"><span class="status-badge status-healthy">AUTOMATION ON</span></div>
              </div>

              <form id="scheduler-config-form" onsubmit="saveSchedulerConfig(event)">
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:1.25rem; margin-bottom:1.25rem;">
                  <div>
                    <label class="form-label" for="sched-master-switch">Automation</label>
                    <select id="sched-master-switch" class="form-input">
                      <option value="1">ON — Enabled</option>
                      <option value="0">OFF — Disabled</option>
                    </select>
                  </div>

                  <div>
                    <label class="form-label" for="sched-frequency">Frequency</label>
                    <select id="sched-frequency" class="form-input">
                      <option value="daily">Daily (Once per 24 hours)</option>
                      <option value="12h">Every 12 Hours</option>
                    </select>
                  </div>

                  <div>
                    <label class="form-label" for="sched-time">Schedule Time (UTC)</label>
                    <input type="text" id="sched-time" class="form-input" value="08:00" placeholder="08:00" />
                  </div>
                </div>

                <button type="submit" id="save-scheduler-btn" class="btn-primary">
                  Save settings
                </button>
              </form>
            </div>
          </div>

          <!-- TAB 3: TOPIC RESEARCH -->
          <div id="tab-research" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Topic Research</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Discover and manage topic proposals for posts.</p>
              </div>
              <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                <button id="run-research-btn" class="btn-primary" onclick="runResearchNow()">
                  Find topics
                </button>
                <button class="btn-secondary" onclick="openAddTopicModal()">
                  + Add topic
                </button>
              </div>
            </div>

            <!-- Content Performance Engine Card -->
            <div class="panel" style="border-left: 4px solid var(--accent-emerald); margin-bottom:1.5rem;">
              <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                <div class="panel-title" style="display:flex; align-items:center; gap:0.5rem;">
                  <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:none; stroke:var(--accent-emerald); stroke-width:2;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  Content Performance Engine (Dynamic Feedback)
                </div>
                <button class="btn-secondary" style="font-size:0.8rem; padding:0.3rem 0.6rem;" onclick="reevaluatePerformanceEngine()">Re-calculate Profile</button>
              </div>
              <div id="performance-engine-summary" style="font-size:0.875rem; color:var(--text-main); line-height:1.5;">
                Loading performance insights from Facebook analytics...
              </div>
            </div>

            <!-- Topic Bulk Action Toolbar -->
            <div id="topic-bulk-toolbar" class="bulk-toolbar" style="display:none;">
              <div class="bulk-toolbar-info">
                <span id="topic-selected-count">0</span> topics selected
              </div>
              <div class="bulk-toolbar-actions">
                <select id="topic-bulk-status-select" class="bulk-select-status" onchange="executeTopicBulkStatusChange(this.value)">
                  <option value="">Change Status...</option>
                  <option value="queued">Set Status: Queued</option>
                  <option value="accepted">Set Status: Accepted</option>
                  <option value="rejected">Set Status: Rejected</option>
                </select>
                <button class="btn-primary" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="generatePostsForSelectedTopics()">
                  Generate selected
                </button>
                <button class="btn-logout" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="confirmDeleteSelectedTopics()">
                  Delete selected
                </button>
              </div>
            </div>

            <!-- Topics Table / Cards -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Topic Proposals Backlog</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style="width:36px; text-align:center;">
                        <input type="checkbox" id="topic-select-all" onclick="toggleSelectAllTopics(this)" title="Select all topics" />
                      </th>
                      <th>Idea / source</th>
                      <th>Category</th>
                      <th>Progress</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="topics-table-body">
                    <tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading topic proposals...</td></tr>
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
                <p class="page-subtitle" style="margin-bottom:0;">Review, edit, schedule, or publish post drafts.</p>
              </div>
              <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                <button class="btn-secondary" onclick="openGenerateSingleTopicModal()">
                  Generate post from idea
                </button>
                <button class="btn-secondary" onclick="generatePostsForAllEligible()">
                  Generate all
                </button>
                <button class="btn-secondary" style="border-color:var(--accent-blue); color:var(--accent-blue);" onclick="scheduleAllEligibleIntelligently()">
                  Schedule all eligible
                </button>
                <button class="btn-primary" onclick="openAddPostModal()">
                  + Add post
                </button>
              </div>
            </div>

            <!-- Post Bulk Action Toolbar -->
            <div id="post-bulk-toolbar" class="bulk-toolbar" style="display:none;">
              <div class="bulk-toolbar-info">
                <span id="post-selected-count">0</span> drafts selected
              </div>
              <div class="bulk-toolbar-actions">
                <button class="btn-primary" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="openBulkScheduleModal()">
                  Schedule selected
                </button>
                <select id="post-bulk-status-select" class="bulk-select-status" onchange="executePostBulkStatusChange(this.value)">
                  <option value="">Change Status...</option>
                  <option value="draft">Set Status: Draft</option>
                  <option value="approved">Set Status: Approved</option>
                  <option value="scheduled">Set Status: Scheduled</option>
                  <option value="rejected">Set Status: Rejected</option>
                </select>
                <button class="btn-logout" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="confirmDeleteSelectedPosts()">
                  Delete selected
                </button>
              </div>
            </div>

            <!-- Post Drafts Table -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Post Drafts Backlog</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style="width:36px; text-align:center;">
                        <input type="checkbox" id="post-select-all" onclick="toggleSelectAllPosts(this)" title="Select all drafts" />
                      </th>
                      <th style="width:110px;">Thumbnail</th>
                      <th>Snippet</th>
                      <th style="width:180px;">Progress</th>
                      <th style="width:120px;">Status</th>
                      <th style="width:150px;">Creation Date</th>
                      <th style="width:160px; text-align:right;">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="posts-table-body">
                    <tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading post drafts...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB: IMAGE LIBRARY -->
          <div id="tab-images" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Curated Image Library</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Review candidate illustrations, edit metadata, and manage administrator-approved image assets.</p>
              </div>
              <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                <button id="discover-candidates-btn" class="btn-secondary" onclick="openDiscoverImageModal()">
                  Discover Candidates
                </button>
                <button id="add-image-btn" class="btn-primary" onclick="openAddImageModal()">
                  + Add Image
                </button>
              </div>
            </div>

            <!-- Status Tabs Bar -->
            <div style="display:flex; gap:0.5rem; margin-bottom:1.25rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; flex-wrap:wrap;">
              <button class="btn-tab active" id="img-tab-pending" onclick="setImageStatusTab('PENDING')">
                Pending Review <span class="badge-count" id="img-count-pending">0</span>
              </button>
              <button class="btn-tab" id="img-tab-approved" onclick="setImageStatusTab('APPROVED')">
                Approved Pool <span class="badge-count" id="img-count-approved">0</span>
              </button>
              <button class="btn-tab" id="img-tab-rejected" onclick="setImageStatusTab('REJECTED')">
                Rejected <span class="badge-count" id="img-count-rejected">0</span>
              </button>
              <button class="btn-tab" id="img-tab-used" onclick="setImageStatusTab('USED')">
                Used Assets <span class="badge-count" id="img-count-used">0</span>
              </button>
              <button class="btn-tab" id="img-tab-all" onclick="setImageStatusTab('ALL')">
                All Assets <span class="badge-count" id="img-count-all">0</span>
              </button>
            </div>

            <!-- Filters & Search Bar -->
            <div style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap; align-items:center; justify-space-between;">
              <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
                <select id="image-category-filter" class="bulk-select-status" style="width:230px;" onchange="loadImagesData()">
                  <option value="">All Categories</option>
                  <option value="AI & Business Automation">AI & Business Automation</option>
                  <option value="Websites & Landing Pages">Websites & Landing Pages</option>
                  <option value="Marketing & Customer Acquisition">Marketing & Customer Acquisition</option>
                  <option value="Sales & Conversion Process">Sales & Conversion Process</option>
                  <option value="Small Business Productivity & Ops">Small Business Productivity & Ops</option>
                  <option value="Customer Experience & Trust">Customer Experience & Trust</option>
                  <option value="Local Business & Regional Context">Local Business & Regional Context</option>
                  <option value="General">General</option>
                </select>
                <input type="text" id="image-search-input" class="bulk-select-status" style="width:260px; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="Search keywords, title, description..." onkeyup="debounceImageSearch()" />
              </div>

              <div id="image-bulk-toolbar" style="display:none; gap:0.5rem; align-items:center;">
                <span id="image-selected-count" style="font-size:0.85rem; color:var(--text-muted);">0 selected</span>
                <button class="btn-primary" style="font-size:0.8rem; padding:0.35rem 0.7rem;" onclick="executeImageBulkAction('approve')">Approve</button>
                <button class="btn-secondary" style="font-size:0.8rem; padding:0.35rem 0.7rem; color:var(--accent-amber);" onclick="executeImageBulkAction('reject')">Reject</button>
                <button class="btn-logout" style="font-size:0.8rem; padding:0.35rem 0.7rem;" onclick="executeImageBulkAction('delete')">Delete</button>
              </div>
            </div>

            <!-- Image Grid Container -->
            <div id="image-library-grid" class="image-library-grid">
              <div style="grid-column: 1 / -1; text-align:center; color:var(--text-muted); padding:3rem;">Loading Image Library...</div>
            </div>
          </div>

          <!-- TAB 5: SCHEDULED QUEUE -->
          <div id="tab-schedules" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Scheduled Queue</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Publication calendar and scheduled queue.</p>
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
                      <th>Post</th>
                      <th>Progress</th>
                      <th>Scheduled Time (UTC)</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="schedules-table-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading scheduled posts...</td></tr>
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
                <p class="page-subtitle" style="margin-bottom:0;">Published posts and current Facebook performance.</p>
              </div>
              <button id="sync-facebook-publications" class="btn-secondary" onclick="syncFacebookPublications()">Sync with Facebook</button>
            </div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Facebook Posts</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Published</th>
                      <th>Post</th>
                      <th>Progress</th>
                      <th>Views</th>
                      <th>Reactions</th>
                      <th>Comments</th>
                      <th>Shares</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="publications-table-body">
                    <tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading Facebook posts...</td></tr>
                  </tbody>
                </table>
              </div>
              <div id="publications-load-more-wrap" style="display:none; padding:1rem; text-align:center;">
                <button class="btn-secondary" onclick="loadMoreFacebookPublications()">Load more posts</button>
              </div>
            </div>
          </div>

          <!-- TAB: CONTENT INTELLIGENCE -->
          <div id="tab-intelligence" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Content Intelligence</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Performance benchmarks, active post pools, and dynamic generator guidance.</p>
              </div>
              <div style="display:flex; gap:0.5rem;">
                <button class="btn-secondary" onclick="previewGeneratorContext()">Preview Context</button>
                <button class="btn-primary" onclick="reevaluatePerformanceEngine()">Refresh Insights</button>
              </div>
            </div>

            <!-- Early Stage Learning Notice Banner -->
            <div id="intel-early-notice" style="display:none; margin-bottom:1.5rem; background:rgba(59, 130, 246, 0.1); border:1px solid var(--accent-blue); color:var(--accent-blue); padding:0.85rem 1.1rem; border-radius:8px; font-size:0.875rem; align-items:center; gap:0.5rem;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><strong>Early Learning Stage</strong> — Reference pools currently utilize relative performance snapshots while historical post data accumulates.
            </div>

            <!-- Intelligence Overview KPI Cards -->

            <div class="section-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom:1.5rem;">
              <div class="card">
                <div class="card-label">Learning Phase</div>
                <div class="card-val" id="intel-learning-mode" style="font-size:1.1rem; color:var(--accent-blue); margin-top:0.25rem;"><span class="status-badge status-healthy">EARLY</span></div>
                <div class="card-sub">Adaptive Cold-Start</div>
              </div>
              <div class="card">
                <div class="card-label">Evaluated Posts</div>
                <div class="card-val" id="intel-eval-count">0</div>
                <div class="card-sub">Published post history</div>
              </div>
              <div class="card">
                <div class="card-label">Median Benchmark</div>
                <div class="card-val" id="intel-median-rate" style="color:var(--accent-blue);">0.00%</div>
                <div class="card-sub">Engagement rate threshold</div>
              </div>
              <div class="card">
                <div class="card-label">Low Confidence</div>
                <div class="card-val" id="intel-low-conf-count" style="color:var(--text-muted);">0</div>
                <div class="card-sub">Early exposure observations</div>
              </div>
              <div class="card">
                <div class="card-label">Strong Examples</div>
                <div class="card-val" id="intel-strong-count" style="color:var(--accent-emerald);">0</div>
                <div class="card-sub">Top performer pool</div>
              </div>
              <div class="card">
                <div class="card-label">Weak Examples</div>
                <div class="card-val" id="intel-weak-count" style="color:var(--accent-rose);">0</div>
                <div class="card-sub">Below benchmark pool</div>
              </div>
            </div>

            <!-- Learned & Manual Guidelines Panel -->
            <div class="panel" style="margin-bottom:1.5rem;">
              <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
                <div class="panel-title">Current Guidelines</div>
                <button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.55rem;" onclick="openAddGuidelineModal()">+ Add Manual Rule</button>
              </div>
              <div style="padding:1rem;">
                <div id="intel-guidelines-list" style="display:flex; flex-direction:column; gap:0.5rem;">
                  <div style="color:var(--text-muted); font-size:0.85rem;">Loading generator guidelines...</div>
                </div>
              </div>
            </div>

            <!-- Active Strong Posts Pool -->
            <div class="panel" style="margin-bottom:1.5rem;">
              <div class="panel-header">
                <div class="panel-title" style="color:var(--accent-emerald); display:inline-flex; align-items:center; gap:0.4rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Strong Examples (Active Pool)</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style="min-width:320px;">Content Snippet</th>
                      <th>Confidence</th>
                      <th>Score</th>
                      <th>Percentile</th>
                      <th>Reach / Views</th>
                      <th>Engagement</th>
                      <th>Qualification Reason</th>
                    </tr>
                  </thead>
                  <tbody id="intel-strong-table">
                    <tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No active strong examples.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Active Weak Posts Pool -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title" style="color:var(--accent-rose); display:inline-flex; align-items:center; gap:0.4rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Weak Examples (Avoid Patterns)</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style="min-width:320px;">Content Snippet</th>
                      <th>Confidence</th>
                      <th>Score</th>
                      <th>Percentile</th>
                      <th>Reach / Views</th>
                      <th>Engagement</th>
                      <th>Qualification Reason</th>
                    </tr>
                  </thead>
                  <tbody id="intel-weak-table">
                    <tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No active weak examples.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 7: ACCOUNT & SECURITY -->
          <div id="tab-security" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Account &amp; Security</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Account security and password settings.</p>
              </div>
            </div>

            <div id="security-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>

            <!-- Password Recovery Email Panel -->
            <div class="panel" style="max-width: 600px; margin-bottom: 2rem;">
              <div class="panel-header">
                <div class="panel-title">Password Recovery Email</div>
                <div id="recovery-email-badge"><span class="status-badge status-disabled">Not configured</span></div>
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

          <!-- TAB 8: AUDIT LOG -->
          <div id="tab-audit" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <div>
                <h1 class="page-title">Audit Log</h1>
                <p class="page-subtitle" style="margin-bottom:0;">System activity and audit logs.</p>
              </div>
              <button class="btn-secondary" style="font-size:0.8rem; padding:0.4rem 0.85rem; display:inline-flex; align-items:center; gap:0.4rem;" onclick="loadAuditData()">
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Refresh
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

        </div>
      </main>

      <!-- 3. RIGHT FACEBOOK RAIL PREVIEW -->
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
            <div id="fb-rail-read-status" class="fb-rail-status-chip status-healthy">● Meta Graph Connected</div>
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
          <input type="hidden" id="topic-input-title" value="" />
          <div class="form-group">
            <label class="form-label" for="topic-input-desc">Idea / Inspiration / Source</label>
            <textarea id="topic-input-desc" class="form-input" style="min-height:120px; font-family:inherit;" required placeholder="Describe the idea, key insights, source snippet, or paste notes..."></textarea>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
            <div class="form-group">
              <label class="form-label" for="topic-input-pillar">Category</label>
              <select id="topic-input-pillar" class="form-input">
                <option value="WEBSITE">Websites &amp; UX</option>
                <option value="MARKETING">Marketing &amp; SEO</option>
                <option value="AI">AI &amp; Automation</option>
                <option value="LOCAL_BUSINESS">Local Business</option>
                <option value="SMALL_BUSINESS">Small Business</option>
                <option value="SALES">Sales &amp; Growth</option>
                <option value="CUSTOMER_EXPERIENCE">Customer Experience</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="topic-input-status">Status</label>
              <select id="topic-input-status" class="form-input">
                <option value="queued">Queued</option>
                <option value="new">New</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="used">Used</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="topic-input-priority">Priority (1 - 100)</label>
            <input type="number" id="topic-input-priority" class="form-input" value="50" min="1" max="100" />
          </div>
          <button type="submit" id="save-topic-btn" class="btn-primary" style="width:100%;">Save</button>
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
            <label class="form-label" for="post-input-content">Post</label>
            <textarea id="post-input-content" class="form-input" style="min-height:140px; font-family:inherit;" required placeholder="Write post content..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight:600;">Post Image</label>
            <div id="post-image-preview-wrap" style="display:none; margin-bottom:0.75rem; position:relative;">
              <img id="post-image-preview" alt="Post image preview" style="display:block; width:100%; max-height:220px; object-fit:contain; border-radius:6px; background:#18191a;" />
              <button type="button" class="btn-secondary" style="position:absolute; top:8px; right:8px; font-size:0.75rem; padding:0.25rem 0.5rem; background:rgba(0,0,0,0.7);" onclick="removePostModalImage()">Remove image</button>
            </div>
            <input type="hidden" id="post-selected-image-id" value="" />
            <input type="hidden" id="post-remove-image-flag" value="false" />
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <button type="button" class="btn-secondary" style="font-size:0.85rem; display:inline-flex; align-items:center; gap:0.4rem;" onclick="openDraftImageSelectorModalForDraft()">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Choose from Image Library
              </button>
              <span id="post-image-name-badge" style="font-size:0.8rem; color:var(--text-muted);">No image selected</span>
            </div>
            <div id="post-image-sync-note" style="display:none; color:var(--text-muted); font-size:0.8rem; margin-top:0.4rem;">Image changes are sent to Facebook. Meta may reject media edits on an existing post.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="post-input-status">Status</label>
            <select id="post-input-status" class="form-input">
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="scheduled">Scheduled</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div id="post-modal-actions-bar" style="display:none; margin-top:1.25rem; padding-top:1rem; border-top:1px solid var(--border-color);">
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin-bottom:0.6rem; font-weight:600;">Draft Actions</div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
              <button type="button" id="post-modal-publish-btn" class="btn-primary" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="handleModalPublishNow()">Publish Now</button>
              <button type="button" id="post-modal-schedule-btn" class="btn-secondary" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="handleModalSchedule()">Schedule</button>
              <button type="button" id="post-modal-regen-btn" class="btn-secondary" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="handleModalRegenerate()">Regenerate Post</button>
              <button type="button" id="post-modal-idea-btn" class="btn-secondary" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="handleModalViewIdea()">View Idea</button>
              <div style="flex:1;"></div>
              <button type="button" id="post-modal-delete-btn" class="btn-logout" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="handleModalDelete()">Delete Draft</button>
            </div>
          </div>
          <div style="display:flex; gap:0.75rem; justify-content:flex-end; margin-top:1.25rem;">
            <button type="button" class="btn-secondary" onclick="closeModal('post-modal')">Cancel</button>
            <button type="submit" id="save-post-btn" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- 3. GENERATE POST FROM TOPIC MODAL -->
  <div id="generate-topic-modal" class="modal-backdrop">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">Generate Post from Idea</div>
        <button class="modal-close-btn" onclick="closeModal('generate-topic-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="generate-topic-form" onsubmit="handleGeneratePostFromTopicSubmit(event)">
          <input type="hidden" id="gen-topic-title" value="" />
          <div class="form-group">
            <label class="form-label" for="gen-topic-desc">Idea / Context</label>
            <textarea id="gen-topic-desc" class="form-input" style="min-height:100px; font-family:inherit;" required placeholder="Enter key topic insights, angle, or source summary..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="gen-topic-pillar">Category</label>
            <select id="gen-topic-pillar" class="form-input">
              <option value="MARKETING">Marketing &amp; SEO</option>
              <option value="WEBSITE">Websites &amp; UX</option>
              <option value="AI">AI &amp; Automation</option>
              <option value="LOCAL_BUSINESS">Local Business</option>
              <option value="SMALL_BUSINESS">Small Business</option>
            </select>
          </div>
          <button type="submit" id="gen-topic-submit-btn" class="btn-primary" style="width:100%;">
            Generate Post
          </button>
        </form>
      </div>
    </div>
  </div>



  <!-- 5. REUSABLE DELETE CONFIRMATION MODAL -->
  <div id="delete-confirm-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:440px;">
      <div class="modal-header">
        <div class="modal-title" id="delete-confirm-title">Confirm Deletion</div>
        <button class="modal-close-btn" onclick="closeModal('delete-confirm-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <p id="delete-confirm-message" style="font-size:0.9rem; color:var(--text-muted); line-height:1.5;">
          Are you sure you want to delete this item? This action cannot be undone.
        </p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('delete-confirm-modal')">Cancel</button>
        <button type="button" id="execute-delete-btn" class="btn-logout" onclick="executePendingDelete()">Delete</button>
      </div>
    </div>
  </div>

  <!-- 6. PUBLICATION DELETE CONFIRMATION MODAL -->
  <div id="publication-delete-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:460px;">
      <div class="modal-header">
        <div class="modal-title">Delete Publication Record</div>
        <button class="modal-close-btn" onclick="closeModal('publication-delete-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:0.9rem; color:var(--text-main); font-weight:600; margin-bottom:0.5rem;">
          Delete from Content Creator history?
        </p>
        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5; margin-bottom:1rem;">
          This action deletes the local publication history record from the Content Creator database.
          <br/><br/>
          <strong style="color:var(--accent-amber);">Important:</strong> This does NOT delete the actual post published on Facebook.
        </p>
        <input type="hidden" id="pub-delete-id" value="" />
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('publication-delete-modal')">Cancel</button>
        <button type="button" class="btn-logout" onclick="executePublicationDelete()">Delete</button>
      </div>
    </div>
  </div>

  <!-- Facebook post details and editing -->
  <div id="facebook-post-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:760px;">
      <div class="modal-header">
        <div class="modal-title">Facebook post</div>
        <button class="modal-close-btn" onclick="closeModal('facebook-post-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <div id="fb-post-detail-meta" style="display:flex; flex-wrap:wrap; gap:0.6rem; margin-bottom:1rem; color:var(--text-muted); font-size:0.82rem;"></div>
        <div id="fb-post-detail-stats" class="section-grid" style="margin-bottom:1rem;"></div>
        <div class="form-group">
          <label class="form-label" for="fb-post-detail-content">Post content</label>
          <textarea id="fb-post-detail-content" class="form-input" style="min-height:180px; font-family:inherit;"></textarea>
        </div>
        <div id="fb-post-detail-image-wrap" style="display:none; margin-bottom:1rem;">
          <img id="fb-post-detail-image" alt="Facebook post image" style="display:block; width:100%; max-height:420px; object-fit:contain; border-radius:8px; background:#18191a;" />
        </div>
        <div class="form-group" style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
          <label class="form-label" style="font-weight:600;">Attached Post Image</label>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.75rem;">
            Images must be selected from the approved Image Library to maintain full referential consistency across Facebook and local history.
          </p>
          <button type="button" class="btn-primary" style="display:inline-flex; align-items:center; gap:0.4rem;" onclick="openDraftImageSelectorModalForPublication()">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Choose Image from Library
          </button>
        </div>
        <a id="fb-post-detail-link" href="#" target="_blank" rel="noopener noreferrer" class="fb-rail-post-link">View on Facebook →</a>
        <div id="fb-post-detail-error" class="alert-error" style="display:none; margin-top:1rem;"></div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between; gap:0.5rem; flex-wrap:wrap;">
        <div style="display:flex; gap:0.5rem;">
          <button id="fb-post-hide-button" type="button" class="btn-secondary" onclick="toggleFacebookPostHidden()">Hide</button>
          <button type="button" class="btn-logout" onclick="deleteFacebookPost()">Delete from Facebook</button>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="btn-secondary" onclick="closeModal('facebook-post-modal')">Close</button>
          <button type="button" class="btn-primary" onclick="saveFacebookPostEdit()">Save changes</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 7. SCHEDULE POST MODAL (SINGLE POST) -->
  <div id="schedule-post-modal" class="modal-backdrop">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">Schedule Post Publication</div>
        <button class="modal-close-btn" onclick="closeModal('schedule-post-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="schedule-post-form" onsubmit="handleSaveSchedule(event)">
          <input type="hidden" id="schedule-edit-id" value="" />
          <div class="form-group">
            <label class="form-label" for="schedule-post-select">Post Draft</label>
            <select id="schedule-post-select" class="form-input" required onchange="onSchedulePostSelectChange()">
              <option value="">-- Select draft --</option>
            </select>
          </div>

          <!-- Mode Selector: Auto vs Manual -->
          <div class="form-group" style="margin-bottom:1.25rem;">
            <label class="form-label">Scheduling Mode</label>
            <div style="display:flex; gap:0.5rem; background:rgba(255,255,255,0.04); padding:0.3rem; border-radius:8px; border:1px solid var(--border-color);">
              <button type="button" id="sched-mode-auto-btn" class="btn-secondary" style="flex:1; font-size:0.825rem; padding:0.4rem 0.6rem; background:var(--accent-blue); color:white; border:none;" onclick="setScheduleModalMode('auto')">
                Automatic (AI Suggested)
              </button>
              <button type="button" id="sched-mode-manual-btn" class="btn-secondary" style="flex:1; font-size:0.825rem; padding:0.4rem 0.6rem; background:transparent; border:none;" onclick="setScheduleModalMode('manual')">
                Manual (Select Date &amp; Time)
              </button>
            </div>
            <input type="hidden" id="schedule-mode-val" value="auto" />
          </div>

          <!-- Auto Mode Container -->
          <div id="sched-auto-container" style="background:rgba(96,165,250,0.08); border:1px solid rgba(96,165,250,0.25); border-radius:8px; padding:1rem; margin-bottom:1.25rem;">
            <div style="font-size:0.85rem; font-weight:600; color:var(--accent-blue); margin-bottom:0.35rem;">
              Automatic Publication Schedule
            </div>
            <div id="sched-auto-suggestion-text" style="font-size:0.825rem; color:var(--text-main); margin-bottom:0.5rem;">
              Calculating optimal publication time...
            </div>
            <button type="button" class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="fetchSinglePostIntelligentSlot()">
              Refresh Suggested Time
            </button>
          </div>

          <!-- Manual Mode Container -->
          <div id="sched-manual-container" style="display:none; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1.25rem;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="schedule-date">Date</label>
              <input type="date" id="schedule-date" class="form-input" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="schedule-time">Time (UTC)</label>
              <input type="time" id="schedule-time" class="form-input" value="10:00" />
            </div>
          </div>

          <button type="submit" id="save-schedule-btn" class="btn-primary" style="width:100%;">Schedule Publication</button>
        </form>
      </div>
    </div>
  </div>

  <!-- 7B. BULK SCHEDULE MODAL (MULTIPLE POSTS) -->
  <div id="bulk-schedule-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:560px;">
      <div class="modal-header">
        <div class="modal-title" id="bulk-schedule-title">Schedule Selected Posts</div>
        <button class="modal-close-btn" onclick="closeModal('bulk-schedule-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1.25rem;">
          Choose scheduling method for <strong id="bulk-schedule-count" style="color:var(--text-main);">0</strong> selected post drafts:
        </p>

        <!-- Mode selector: Auto vs Manual -->
        <div style="display:flex; gap:0.5rem; background:rgba(255,255,255,0.04); padding:0.3rem; border-radius:8px; border:1px solid var(--border-color); margin-bottom:1.25rem;">
          <button type="button" id="bulk-sched-mode-auto-btn" class="btn-secondary" style="flex:1; font-size:0.825rem; padding:0.4rem 0.6rem; background:var(--accent-blue); color:white; border:none;" onclick="setBulkScheduleModalMode('auto')">
            Automatic (AI Suggested)
          </button>
          <button type="button" id="bulk-sched-mode-manual-btn" class="btn-secondary" style="flex:1; font-size:0.825rem; padding:0.4rem 0.6rem; background:transparent; border:none;" onclick="setBulkScheduleModalMode('manual')">
            Manual (Fixed Interval)
          </button>
        </div>
        <input type="hidden" id="bulk-schedule-mode-val" value="auto" />

        <!-- Auto Container -->
        <div id="bulk-sched-auto-container" style="background:rgba(96,165,250,0.08); border:1px solid rgba(96,165,250,0.25); border-radius:8px; padding:1rem; margin-bottom:1.25rem;">
          <div style="font-size:0.85rem; font-weight:600; color:var(--accent-blue); margin-bottom:0.35rem;">
            Intelligent Bulk Scheduling
          </div>
          <p style="font-size:0.825rem; color:var(--text-muted); margin-bottom:0.75rem;">
            The system will automatically assign optimal publication dates and times for all selected posts, enforcing minimum spacing and engagement optimization.
          </p>
          <button type="button" class="btn-primary" style="width:100%;" onclick="confirmBulkScheduleAuto()">
            Calculate &amp; Review Proposed Slots &rarr;
          </button>
        </div>

        <!-- Manual Container -->
        <div id="bulk-sched-manual-container" style="display:none; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:1rem; margin-bottom:1.25rem;">
          <div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.75rem;">
            Manual Bulk Schedule Settings
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="bulk-sched-start-date">First Post Date</label>
              <input type="date" id="bulk-sched-start-date" class="form-input" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="bulk-sched-start-time">Time (UTC)</label>
              <input type="time" id="bulk-sched-start-time" class="form-input" value="10:00" />
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="bulk-sched-interval">Spacing Between Posts</label>
            <select id="bulk-sched-interval" class="form-input">
              <option value="24">Every 24 hours (1 day)</option>
              <option value="12">Every 12 hours</option>
              <option value="48">Every 48 hours (2 days)</option>
              <option value="6">Every 6 hours</option>
            </select>
          </div>
          <button type="button" class="btn-primary" style="width:100%; margin-top:1rem;" onclick="confirmBulkScheduleManual()">
            Save Manual Schedule
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 8. SCHEDULED POST DETAIL MODAL -->
  <div id="scheduled-post-detail-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:620px;">
      <div class="modal-header">
        <div class="modal-title" id="sched-detail-title">Scheduled Post</div>
        <button class="modal-close-btn" onclick="closeModal('scheduled-post-detail-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="sched-detail-post-id" value="" />
        <input type="hidden" id="sched-detail-schedule-id" value="" />

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
          <span id="sched-detail-status-badge" class="status-badge status-healthy">Scheduled</span>
          <span id="sched-detail-header-time" style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">--</span>
        </div>

        <!-- Conflict Alert Banner -->
        <div id="sched-detail-conflict-banner" style="display:none; background:rgba(244, 63, 94, 0.1); border:1px solid rgba(244, 63, 94, 0.3); border-radius:8px; padding:1rem; margin-bottom:1rem;">
          <div style="color:#fda4af; font-weight:700; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.4rem;">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Sync Conflict Detected</span>
          </div>
          <p style="font-size:0.825rem; color:var(--text-main); margin-bottom:0.75rem;">
            This post was edited on Facebook directly and also edited in the app. Choose which version to keep:
          </p>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn-primary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="resolvePostConflict('use_local')">Use Local Version</button>
            <button class="btn-secondary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="resolvePostConflict('use_facebook')">Use Facebook Version</button>
          </div>
        </div>

        <!-- Failure Alert Banner -->
        <div id="sched-detail-error-banner" style="display:none; background:rgba(239, 68, 68, 0.12); border:1px solid rgba(239, 68, 68, 0.4); border-radius:8px; padding:0.85rem 1rem; margin-bottom:1rem;">
          <div style="color:var(--accent-rose); font-weight:700; margin-bottom:0.25rem; display:flex; align-items:center; gap:0.4rem; font-size:0.85rem;">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>Publication Failed</span>
          </div>
          <div id="sched-detail-error-text" style="font-size:0.8rem; color:var(--text-main); font-family:monospace; word-break:break-word;"></div>
        </div>

        <div class="form-group">
          <label class="form-label" for="sched-detail-post-body">Post Content</label>
          <textarea id="sched-detail-post-body" class="form-input" rows="6"></textarea>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:1rem;">
          <div class="form-group">
            <label class="form-label" for="sched-detail-date">Scheduled Date (UTC)</label>
            <input type="date" id="sched-detail-date" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="sched-detail-time">Scheduled Time (UTC)</label>
            <input type="time" id="sched-detail-time" class="form-input" />
          </div>
        </div>

        <div class="form-group" style="border-top:1px solid var(--border-color); padding-top:1rem; margin-top:1rem;">
          <label class="form-label" style="font-weight:600;">Attached Post Image</label>
          <div id="sched-detail-image-wrap" style="display:none; margin-bottom:0.75rem; position:relative;">
            <img id="sched-detail-image" alt="Scheduled post image" style="display:block; width:100%; max-height:220px; object-fit:contain; border-radius:6px; background:#18191a;" />
            <button type="button" class="btn-secondary" style="position:absolute; top:8px; right:8px; font-size:0.75rem; padding:0.25rem 0.5rem; background:rgba(0,0,0,0.7);" onclick="removeScheduledModalImage()">Remove image</button>
          </div>
          <input type="hidden" id="sched-detail-image-id" value="" />
          <input type="hidden" id="sched-detail-remove-image-flag" value="false" />
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button type="button" class="btn-secondary" style="font-size:0.85rem; display:inline-flex; align-items:center; gap:0.4rem;" onclick="openDraftImageSelectorModalForScheduled()">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Choose from Image Library
            </button>
            <span id="sched-detail-image-name" style="font-size:0.8rem; color:var(--text-muted);">No image attached</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('scheduled-post-detail-modal')">Close</button>
        <button type="button" id="sched-detail-save-btn" class="btn-primary" onclick="saveScheduledPostEdits()">Save</button>
        <button type="button" id="sched-detail-unschedule-btn" class="btn-logout" onclick="unscheduleSelectedPost()">Unschedule</button>
      </div>
    </div>
  </div>

  <!-- 10. PREVIEW GENERATOR CONTEXT MODAL -->
  <div id="preview-context-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:700px;">
      <div class="modal-header">
        <div class="modal-title">Generator Context Preview</div>
        <button class="modal-close-btn" onclick="closeModal('preview-context-modal')">&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh; overflow-y:auto;">
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
          Below is the exact structured prompt context injected into <code>WriterService</code> when generating new posts.
        </p>
        <pre id="preview-context-code" style="background:#0f172a; color:#e2e8f0; padding:1rem; border-radius:6px; font-size:0.8rem; white-space:pre-wrap; word-break:break-word;"></pre>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('preview-context-modal')">Close</button>
      </div>
    </div>
  </div>

  <!-- 11. ADD MANUAL GUIDELINE MODAL -->
  <div id="add-guideline-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:500px;">
      <div class="modal-header">
        <div class="modal-title">Add Manual Generator Guideline</div>
        <button class="modal-close-btn" onclick="closeModal('add-guideline-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="guideline-category-select">Category</label>
          <select id="guideline-category-select" class="form-input">
            <option value="DO_MORE">DO MORE OF (Recommended)</option>
            <option value="AVOID">AVOID (Negative Guidance)</option>
            <option value="STYLE">STYLE &amp; TONE</option>
            <option value="STRUCTURE">STRUCTURE &amp; FORMAT</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="guideline-text-input">Guideline Instruction</label>
          <textarea id="guideline-text-input" class="form-input" rows="3" placeholder="e.g. Always emphasize practical cost savings in the opening hook."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('add-guideline-modal')">Cancel</button>
        <button type="button" class="btn-primary" onclick="saveManualGuideline()">Save Guideline</button>
      </div>
    </div>
  </div>

  <!-- 11B. EDIT MANUAL GUIDELINE MODAL -->
  <div id="edit-guideline-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:500px;">
      <div class="modal-header">
        <div class="modal-title">Edit Generator Guideline</div>
        <button class="modal-close-btn" onclick="closeModal('edit-guideline-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="edit-guideline-id" />
        <div class="form-group">
          <label class="form-label" for="edit-guideline-text-input">Guideline Instruction</label>
          <textarea id="edit-guideline-text-input" class="form-input" rows="3"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('edit-guideline-modal')">Cancel</button>
        <button type="button" class="btn-primary" onclick="submitUpdateManualGuideline()">Update Guideline</button>
      </div>
    </div>
  </div>

  <!-- 11C. GENERATOR CONTEXT EDITOR / PREVIEW MODAL -->
  <div id="generator-context-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:850px; width:90%;">
      <div class="modal-header">
        <div class="modal-title">Generator Context &amp; Prompt Preview</div>
        <button class="modal-close-btn" onclick="closeModal('generator-context-modal')">&times;</button>
      </div>
      <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1.25rem;">
          Inspect exact rules, admin guidelines, learned insights, and reference pools passed to the AI Writer Agent.
        </p>

        <!-- System Rules Section -->
        <div style="margin-bottom:1.25rem;">
          <h4 style="font-size:0.85rem; color:var(--accent-blue); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">1. System Rules (Read-Only Safety Rules)</h4>
          <div id="ctx-system-rules" style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:0.75rem 1rem; font-size:0.825rem;">
            Loading rules...
          </div>
        </div>

        <!-- Manual Guidelines Section -->
        <div style="margin-bottom:1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <h4 style="font-size:0.85rem; color:var(--accent-emerald); text-transform:uppercase; letter-spacing:0.05em;">2. Manual Admin Guidelines (Editable)</h4>
            <button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.6rem;" onclick="openAddGuidelineModal()">+ Add Guideline</button>
          </div>
          <div id="ctx-manual-guidelines" style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:0.75rem 1rem; font-size:0.825rem;">
            Loading guidelines...
          </div>
        </div>

        <!-- Learned Guidelines Section -->
        <div style="margin-bottom:1.25rem;">
          <h4 style="font-size:0.85rem; color:var(--accent-cyan); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">3. Learned Performance Guidelines (Auto-Extracted)</h4>
          <div id="ctx-learned-guidelines" style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:0.75rem 1rem; font-size:0.825rem;">
            Loading learned insights...
          </div>
        </div>

        <!-- Active Reference Pools Section -->
        <div style="margin-bottom:1.25rem;">
          <h4 style="font-size:0.85rem; color:var(--text-main); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">4. Active Reference Pools (Structural Examples)</h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
            <div>
              <strong style="color:var(--accent-emerald); font-size:0.8rem;">Active Strong Examples (Top Ranks)</strong>
              <div id="ctx-strong-examples" style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:0.6rem; font-size:0.8rem; margin-top:0.35rem;">None</div>
            </div>
            <div>
              <strong style="color:var(--accent-rose); font-size:0.8rem;">Active Weak Examples (Patterns to Avoid)</strong>
              <div id="ctx-weak-examples" style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:0.6rem; font-size:0.8rem; margin-top:0.35rem;">None</div>
            </div>
          </div>
        </div>

        <!-- Final Raw Text Section -->
        <div>
          <h4 style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">5. Final Assembled Writer Prompt Instructions</h4>
          <pre id="ctx-raw-instructions" style="background:#090d16; border:1px solid var(--border-color); border-radius:8px; padding:1rem; font-size:0.775rem; color:var(--text-muted); white-space:pre-wrap; font-family:monospace; max-height:220px; overflow-y:auto;"></pre>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-primary" onclick="closeModal('generator-context-modal')">Close Preview</button>
      </div>
    </div>
  </div>

  <!-- 12. INTELLIGENT SCHEDULE PREVIEW MODAL -->
  <div id="intelligent-schedule-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:750px;">
      <div class="modal-header">
        <div class="modal-title">Intelligent Schedule Proposals</div>
        <button class="modal-close-btn" onclick="closeModal('intelligent-schedule-modal')">&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh; overflow-y:auto;">
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
          Review proposed publication dates and times calculated using historical performance benchmarks, minimum spacing, and backlog depth limits.
        </p>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Post</th>
                <th>Proposed Date</th>
                <th>Time Window</th>
                <th>Selection Reason</th>
              </tr>
            </thead>
            <tbody id="intelligent-slots-table-body">
              <tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Calculating intelligent proposals...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('intelligent-schedule-modal')">Cancel</button>
        <button type="button" id="commit-intelligent-schedule-btn" class="btn-primary" onclick="executeCommitIntelligentSchedule()">Accept &amp; Commit Schedule</button>
      </div>
    </div>
  </div>

  <!-- 14. ADD IMAGE MODAL -->
  <div id="add-image-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:620px;">
      <div class="modal-header">
        <div class="modal-title">+ Add Image to Library</div>
        <button class="modal-close-btn" onclick="closeModal('add-image-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; gap:0.5rem; margin-bottom:1.25rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
          <button type="button" class="btn-tab active" id="add-img-type-file-btn" onclick="setAddImageSourceType('file')">Upload File</button>
          <button type="button" class="btn-tab" id="add-img-type-url-btn" onclick="setAddImageSourceType('url')">HTTPS URL</button>
        </div>

        <form id="add-image-form" onsubmit="submitAddImageForm(event)">
          <div id="add-img-file-group" style="margin-bottom:1rem;">
            <label class="form-label">Image File (JPEG, PNG, WebP &lt; 10MB)</label>
            <input type="file" id="add-img-file-input" accept="image/jpeg,image/png,image/webp" class="bulk-select-status" style="width:100%; padding:0.5rem;" onchange="handleImageFileSelected(event)" />
            <div id="add-img-extracting-status" style="display:none; font-size:0.75rem; color:var(--accent-blue); margin-top:0.35rem;">
              Analyzing image file and intelligently generating metadata...
            </div>
          </div>

          <div id="add-img-url-group" style="margin-bottom:1rem; display:none;">
            <label class="form-label">Image HTTPS URL</label>
            <input type="url" id="add-img-url-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="https://example.com/image.jpg" oninput="handleImageUrlInput(event)" onpaste="setTimeout(handleImageUrlChanged, 50)" onblur="handleImageUrlChanged()" onchange="handleImageUrlChanged()" />
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
            <div>
              <label class="form-label">Title / Name *</label>
              <input type="text" id="add-img-title-input" required class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="e.g. Cybersecurity Network" oninput="this.dataset.autoFilled='false'" />
            </div>
            <div>
              <label class="form-label">Category *</label>
              <select id="add-img-category-select" required class="bulk-select-status" style="width:100%; padding:0.5rem;" onchange="handleImageCategoryChanged()">
                <option value="AI &amp; Business Automation" selected>AI &amp; Business Automation</option>
                <option value="Websites &amp; Landing Pages">Websites &amp; Landing Pages</option>
                <option value="Marketing &amp; Customer Acquisition">Marketing &amp; Customer Acquisition</option>
                <option value="Sales &amp; Conversion Process">Sales &amp; Conversion Process</option>
                <option value="Small Business Productivity &amp; Ops">Small Business Productivity &amp; Ops</option>
                <option value="Customer Experience &amp; Trust">Customer Experience &amp; Trust</option>
                <option value="Local Business &amp; Regional Context">Local Business &amp; Regional Context</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom:1rem;">
            <label class="form-label">Keywords / Tags (comma-separated)</label>
            <input type="text" id="add-img-keywords-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="security, cloud, data protection, network" oninput="this.dataset.autoFilled='false'" />
          </div>

          <div style="margin-bottom:1rem;">
            <label class="form-label">Semantic Description ("what this image represents")</label>
            <textarea id="add-img-description-input" rows="2" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="Abstract visualization of computer security and data locks" oninput="this.dataset.autoFilled='false'"></textarea>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
            <div>
              <label class="form-label">Author / Creator</label>
              <input type="text" id="add-img-author-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="Creator name" />
            </div>
            <div>
              <label class="form-label">License</label>
              <input type="text" id="add-img-license-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="CC BY, Unsplash, Custom" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.25rem;">
            <div>
              <label class="form-label">Initial Status</label>
              <select id="add-img-status-select" class="bulk-select-status" style="width:100%; padding:0.5rem;">
                <option value="APPROVED" selected>APPROVED (Publishable)</option>
                <option value="PENDING">PENDING (Review needed)</option>
              </select>
            </div>
            <div>
              <label class="form-label">Notes</label>
              <input type="text" id="add-img-notes-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="Internal notes..." />
            </div>
          </div>

          <div class="modal-footer" style="padding:0; margin-top:1rem;">
            <button type="button" class="btn-secondary" onclick="closeModal('add-image-modal')">Cancel</button>
            <button type="submit" class="btn-primary">Save to Library</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- 15. EDIT IMAGE METADATA MODAL -->
  <div id="edit-image-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:620px;">
      <div class="modal-header">
        <div class="modal-title">Edit Image Metadata</div>
        <button class="modal-close-btn" onclick="closeModal('edit-image-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="edit-image-form" onsubmit="submitEditImageForm(event)">
          <input type="hidden" id="edit-img-id" />
          
          <div style="display:flex; gap:1rem; margin-bottom:1rem; align-items:center;">
            <img id="edit-img-preview" src="" alt="Preview" style="width:100px; height:75px; object-fit:cover; border-radius:6px; border:1px solid var(--border-color);" />
            <div style="font-size:0.8rem; color:var(--text-muted);">
              <div><strong id="edit-img-source-type">DISCOVERED</strong></div>
              <div id="edit-img-url-display" style="max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
            <div>
              <label class="form-label">Title / Name *</label>
              <input type="text" id="edit-img-title-input" required class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" />
            </div>
            <div>
              <label class="form-label">Category *</label>
              <select id="edit-img-category-select" required class="bulk-select-status" style="width:100%; padding:0.5rem;">
                <option value="AI &amp; Business Automation">AI &amp; Business Automation</option>
                <option value="Websites &amp; Landing Pages">Websites &amp; Landing Pages</option>
                <option value="Marketing &amp; Customer Acquisition">Marketing &amp; Customer Acquisition</option>
                <option value="Sales &amp; Conversion Process">Sales &amp; Conversion Process</option>
                <option value="Small Business Productivity &amp; Ops">Small Business Productivity &amp; Ops</option>
                <option value="Customer Experience &amp; Trust">Customer Experience &amp; Trust</option>
                <option value="Local Business &amp; Regional Context">Local Business &amp; Regional Context</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom:1rem;">
            <label class="form-label">Keywords / Tags (comma-separated)</label>
            <input type="text" id="edit-img-keywords-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" />
          </div>

          <div style="margin-bottom:1rem;">
            <label class="form-label">Semantic Description ("what this image represents")</label>
            <textarea id="edit-img-description-input" rows="2" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);"></textarea>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
            <div>
              <label class="form-label">Author / Creator</label>
              <input type="text" id="edit-img-author-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" />
            </div>
            <div>
              <label class="form-label">License</label>
              <input type="text" id="edit-img-license-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.25rem;">
            <div>
              <label class="form-label">Review Status *</label>
              <select id="edit-img-status-select" required class="bulk-select-status" style="width:100%; padding:0.5rem;">
                <option value="APPROVED">APPROVED (Publishable)</option>
                <option value="PENDING">PENDING (In Review)</option>
                <option value="REJECTED">REJECTED (Do Not Use)</option>
              </select>
            </div>
            <div>
              <label class="form-label">Notes</label>
              <input type="text" id="edit-img-notes-input" class="bulk-select-status" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); color:var(--text-main);" />
            </div>
          </div>

          <div class="modal-footer" style="padding:0; margin-top:1rem;">
            <button type="button" class="btn-secondary" onclick="closeModal('edit-image-modal')">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- 17. DISCOVER IMAGE CANDIDATES MODAL -->
  <div id="discover-image-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:600px;">
      <div class="modal-header">
        <div class="modal-title" id="discover-modal-title">Discover Image Candidates</div>
        <button class="modal-close-btn" onclick="closeModal('discover-image-modal')">&times;</button>
      </div>

      <!-- VIEW 1: Topic Selection Form -->
      <div id="discover-view-form" class="modal-body">
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1.25rem;">
          Select a default content category, active research topic, or choose <strong>Custom Search</strong> to enter your own keywords.
        </p>

        <div class="form-group">
          <label class="form-label" for="discover-topic-select" style="font-weight:600;">Topic / Search Category</label>
          <select id="discover-topic-select" class="form-input" onchange="handleDiscoverTopicSelectChange()">
            <option value="">-- Loading categories &amp; topics... --</option>
          </select>
        </div>

        <div class="form-group" id="discover-custom-topic-group" style="display:none; background:rgba(96,165,250,0.08); border:1px solid rgba(96,165,250,0.25); border-radius:8px; padding:1rem;">
          <label class="form-label" for="discover-custom-topic-input" style="color:var(--accent-blue); font-weight:600;">Enter custom topic / keywords (Custom Search)</label>
          <input type="text" id="discover-custom-topic-input" class="form-input" placeholder="e.g. Cloud Data Security, Business Website, Customer Service" oninput="validateDiscoverForm()" />
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.35rem;">The system will search for high-quality royalty-free imagery matching your keywords.</div>
        </div>

        <div class="form-group" style="margin-bottom:0.5rem;">
          <label class="form-label" for="discover-category-select">Assigned Library Category</label>
          <select id="discover-category-select" class="form-input">
            <option value="AI &amp; Business Automation">AI &amp; Business Automation</option>
            <option value="Websites &amp; Landing Pages">Websites &amp; Landing Pages</option>
            <option value="Marketing &amp; Customer Acquisition">Marketing &amp; Customer Acquisition</option>
            <option value="Sales &amp; Conversion Process">Sales &amp; Conversion Process</option>
            <option value="Small Business Productivity &amp; Ops">Small Business Productivity &amp; Ops</option>
            <option value="Customer Experience &amp; Trust">Customer Experience &amp; Trust</option>
            <option value="Local Business &amp; Regional Context">Local Business &amp; Regional Context</option>
            <option value="General">General</option>
          </select>
        </div>
      </div>
      <div id="discover-footer-form" class="modal-footer" style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <button type="button" class="btn-secondary" onclick="closeModal('discover-image-modal')">Cancel</button>
        <button type="button" id="start-discovery-btn" class="btn-primary" onclick="startCandidateDiscovery()">
          Discover Images
        </button>
      </div>

      <!-- VIEW 2: Live Progress & Step Indicator -->
      <div id="discover-view-progress" class="modal-body" style="display:none; text-align:left;">
        <div style="text-align:center; margin-bottom:1.5rem;">
          <div style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin-bottom:0.35rem;" id="discover-progress-title">Discovering images...</div>
          <div style="font-size:0.875rem; color:var(--accent-cyan); font-weight:500;" id="discover-progress-topic">--</div>
        </div>

        <div class="discovery-steps-list" style="display:flex; flex-direction:column; gap:0.85rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:1.25rem;">
          <div class="disc-step-item" id="disc-step-1" style="display:flex; align-items:center; gap:0.75rem;">
            <span class="disc-step-icon" id="disc-step-icon-1" style="width:24px; height:24px; border-radius:50%; background:var(--accent-blue); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">●</span>
            <div>
              <div class="disc-step-label" style="font-size:0.875rem; font-weight:600; color:var(--text-main);">Building search strategy</div>
              <div class="disc-step-sub" id="disc-step-sub-1" style="font-size:0.75rem; color:var(--text-muted);">Initializing topic scope &amp; search query</div>
            </div>
          </div>
          <div class="disc-step-item" id="disc-step-2" style="display:flex; align-items:center; gap:0.75rem; opacity:0.5;">
            <span class="disc-step-icon" id="disc-step-icon-2" style="width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,0.1); color:var(--text-muted); display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">○</span>
            <div>
              <div class="disc-step-label" style="font-size:0.875rem; font-weight:600; color:var(--text-main);">Searching image sources</div>
              <div class="disc-step-sub" id="disc-step-sub-2" style="font-size:0.75rem; color:var(--text-muted);">Querying Openverse API for open-license illustrations</div>
            </div>
          </div>
          <div class="disc-step-item" id="disc-step-3" style="display:flex; align-items:center; gap:0.75rem; opacity:0.5;">
            <span class="disc-step-icon" id="disc-step-icon-3" style="width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,0.1); color:var(--text-muted); display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">○</span>
            <div>
              <div class="disc-step-label" style="font-size:0.875rem; font-weight:600; color:var(--text-main);">Evaluating candidate metadata</div>
              <div class="disc-step-sub" id="disc-step-sub-3" style="font-size:0.75rem; color:var(--text-muted);">Validating license compliance, titles &amp; authors</div>
            </div>
          </div>
          <div class="disc-step-item" id="disc-step-4" style="display:flex; align-items:center; gap:0.75rem; opacity:0.5;">
            <span class="disc-step-icon" id="disc-step-icon-4" style="width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,0.1); color:var(--text-muted); display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">○</span>
            <div>
              <div class="disc-step-label" style="font-size:0.875rem; font-weight:600; color:var(--text-main);">Checking duplicate usage</div>
              <div class="disc-step-sub" id="disc-step-sub-4" style="font-size:0.75rem; color:var(--text-muted);">Skipping previously imported assets &amp; 90-day window</div>
            </div>
          </div>
          <div class="disc-step-item" id="disc-step-5" style="display:flex; align-items:center; gap:0.75rem; opacity:0.5;">
            <span class="disc-step-icon" id="disc-step-icon-5" style="width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,0.1); color:var(--text-muted); display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">○</span>
            <div>
              <div class="disc-step-label" style="font-size:0.875rem; font-weight:600; color:var(--text-main);">Saving candidates to Image Library</div>
              <div class="disc-step-sub" id="disc-step-sub-5" style="font-size:0.75rem; color:var(--text-muted);">Storing candidate records as PENDING for admin review</div>
            </div>
          </div>
        </div>

        <div id="discover-live-detail-box" style="margin-top:1rem; text-align:center; font-size:0.825rem; color:var(--text-muted); font-style:italic;">
          Please wait while candidate discovery is running...
        </div>
      </div>
      <div id="discover-footer-progress" class="modal-footer" style="display:none; justify-content:center;">
        <span style="font-size:0.8rem; color:var(--text-muted);">Operation in progress... Please do not close window.</span>
      </div>

      <!-- VIEW 3: Completion & Results Summary -->
      <div id="discover-view-result" class="modal-body" style="display:none;">
        <div style="text-align:center; margin-bottom:1.5rem;">
          <div style="font-size:2.5rem; margin-bottom:0.5rem; display:flex; justify-content:center;" id="discover-result-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
          <h3 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin-bottom:0.25rem;" id="discover-result-title">Discovery Complete</h3>
          <p style="font-size:0.85rem; color:var(--text-muted);" id="discover-result-sub">New candidate illustrations found and added to Image Library.</p>
        </div>

        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:1.25rem; margin-bottom:1rem;">
          <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin-bottom:0.5rem;">Topic Searched</div>
          <div id="discover-result-topic-name" style="font-size:0.95rem; font-weight:600; color:var(--accent-cyan); margin-bottom:1rem;">--</div>

          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.75rem; text-align:center;">
            <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:0.75rem;">
              <div style="font-size:1.25rem; font-weight:700; color:var(--text-main);" id="discover-stat-total">0</div>
              <div style="font-size:0.7rem; color:var(--text-muted);">Candidates Found</div>
            </div>
            <div style="background:rgba(16, 185, 129, 0.1); border:1px solid rgba(16, 185, 129, 0.2); border-radius:6px; padding:0.75rem;">
              <div style="font-size:1.25rem; font-weight:700; color:var(--accent-emerald);" id="discover-stat-added">0</div>
              <div style="font-size:0.7rem; color:var(--accent-emerald);">New Candidates</div>
            </div>
            <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:0.75rem;">
              <div style="font-size:1.25rem; font-weight:700; color:var(--text-muted);" id="discover-stat-skipped">0</div>
              <div style="font-size:0.7rem; color:var(--text-muted);">Duplicates Skipped</div>
            </div>
          </div>
        </div>

        <div style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-bottom:0.5rem;">
          Discovered candidates are saved as <strong style="color:var(--accent-amber);">PENDING</strong> for administrator review and approval.
        </div>
      </div>
      <div id="discover-footer-result" class="modal-footer" style="display:none; justify-content:space-between; gap:0.5rem;">
        <button type="button" class="btn-secondary" onclick="resetDiscoverModalForm()">Search Another Topic</button>
        <button type="button" class="btn-primary" onclick="closeDiscoverModalAndViewPending()">View Candidates &rarr;</button>
      </div>

      <!-- VIEW 4: Error State -->
      <div id="discover-view-error" class="modal-body" style="display:none;">
        <div style="text-align:center; margin-bottom:1.25rem;">
          <div style="font-size:2.5rem; margin-bottom:0.5rem; display:flex; justify-content:center;">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h3 style="font-size:1.1rem; font-weight:700; color:#fda4af; margin-bottom:0.25rem;">Image Discovery Failed</h3>
          <p style="font-size:0.85rem; color:var(--text-muted);" id="discover-error-sub">We couldn't complete the search.</p>
        </div>

        <div style="background:rgba(244, 63, 94, 0.1); border:1px solid rgba(244, 63, 94, 0.25); border-radius:8px; padding:1rem; margin-bottom:1rem; font-size:0.85rem; color:#fda4af;" id="discover-error-reason">
          Error details...
        </div>
      </div>
      <div id="discover-footer-error" class="modal-footer" style="display:none; justify-content:flex-end; gap:0.5rem;">
        <button type="button" class="btn-secondary" onclick="closeModal('discover-image-modal')">Close</button>
        <button type="button" class="btn-primary" onclick="resetDiscoverModalForm()">Try Again</button>
      </div>

      <!-- VIEW 5: 0 Candidates Found State -->
      <div id="discover-view-empty" class="modal-body" style="display:none;">
        <div style="text-align:center; margin-bottom:1.25rem;">
          <div style="font-size:2.5rem; margin-bottom:0.5rem; display:flex; justify-content:center;">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <h3 style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin-bottom:0.25rem;">No Suitable Candidates Found</h3>
          <p style="font-size:0.85rem; color:var(--text-muted);">No new open-license image candidates were found for:</p>
          <div style="font-size:0.95rem; font-weight:600; color:var(--accent-cyan); margin-top:0.5rem;" id="discover-empty-topic-name">--</div>
        </div>

        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:1rem; font-size:0.825rem; color:var(--text-muted); text-align:center; margin-bottom:1rem;">
          Try searching for a broader term or using a custom topic search query.
        </div>
      </div>
      <div id="discover-footer-empty" class="modal-footer" style="display:none; justify-content:flex-end; gap:0.5rem;">
        <button type="button" class="btn-secondary" onclick="closeModal('discover-image-modal')">Close</button>
        <button type="button" class="btn-primary" onclick="resetDiscoverModalForm()">Try Another Topic</button>
      </div>
    </div>
  </div>

  <!-- 16. DRAFT ILLUSTRATION SELECTOR MODAL -->
  <div id="draft-image-selector-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:850px;">
      <div class="modal-header">
        <div class="modal-title">Select Illustration from Approved Library</div>
        <button class="modal-close-btn" onclick="closeModal('draft-image-selector-modal')">&times;</button>
      </div>
      <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
        <input type="hidden" id="draft-selector-post-id" />
        <div style="display:flex; gap:0.75rem; margin-bottom:1rem; flex-wrap:wrap;">
          <input type="text" id="draft-selector-search" class="bulk-select-status" style="flex:1; min-width:220px; background:rgba(255,255,255,0.05); color:var(--text-main);" placeholder="Search approved images by title, keywords..." onkeyup="filterDraftImageSelector()" />
          <select id="draft-selector-category" class="bulk-select-status" style="width:180px;" onchange="filterDraftImageSelector()">
            <option value="">All Categories</option>
            <option value="AI">AI & Machine Learning</option>
            <option value="Website">Website & WebDev</option>
            <option value="Marketing">Marketing & SEO</option>
            <option value="Sales">Sales & Growth</option>
            <option value="Small Business">Small Business</option>
            <option value="Customer Experience">Customer Experience</option>
            <option value="Cybersecurity">Cybersecurity & Cloud</option>
            <option value="Technology">Technology & Software</option>
            <option value="General">General</option>
          </select>
        </div>

        <div id="draft-selector-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:1rem;">
          <div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">Loading approved illustrations...</div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
        <button type="button" class="btn-logout" style="font-size:0.8rem;" onclick="removeDraftIllustration()">Remove Image</button>
        <div>
          <button type="button" class="btn-secondary" onclick="closeModal('draft-image-selector-modal')">Cancel</button>
          <button type="button" id="confirm-assign-draft-img-btn" class="btn-primary" disabled onclick="confirmAssignDraftIllustration()">Use Selected Illustration</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 17. IMAGE LIGHTBOX MODAL -->
  <div id="image-lightbox-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Image preview" onclick="handleLightboxBackdropClick(event)">
    <div class="lightbox-content-box" onclick="event.stopPropagation()">
      <div class="lightbox-header">
        <div id="image-lightbox-title" class="lightbox-title">Image preview</div>
        <button type="button" class="modal-close-btn" onclick="closeImageLightboxModal()" aria-label="Close image preview">&times;</button>
      </div>
      <div class="lightbox-body">
        <img id="image-lightbox-img" src="" alt="Image preview" class="lightbox-img" />
      </div>
    </div>
  </div>

  <!-- 13. ACTIVITY CENTER WIDGET -->
  <div id="activity-center-widget" style="display:none; pointer-events:none;">
    <div class="ac-body" id="ac-body-container" style="pointer-events:auto;">
    </div>
  </div>

  <script>
    ${getAdminScripts()}
  </script>
</body>
</html>`;
}
