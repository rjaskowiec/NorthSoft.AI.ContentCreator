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
              <span class="user-avatar">👤</span>
              <span id="user-display">Administrator</span>
            </div>
            <button id="logout-btn" class="btn-logout">Sign Out</button>
          </div>
        </header>

        <div class="content-body">

          <!-- TAB 1: DASHBOARD OVERVIEW -->
          <div id="tab-dashboard" class="tab-section active-tab">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
              <div>
                <h1 class="page-title">Dashboard</h1>
                <p class="page-subtitle" style="margin-bottom:0;">System overview and status.</p>
              </div>
              <div style="display:flex; gap:0.75rem;">
                <button class="btn-primary" onclick="switchTab('pipeline', event)">
                  Pipeline Control &rarr;
                </button>
              </div>
            </div>

            <!-- System Health Overview Cards -->
            <div class="section-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
              <div class="card">
                <div class="card-label">Pipeline Engine</div>
                <div class="card-val" id="dash-pipeline-status" style="font-size:1.1rem; color:var(--accent-emerald);">● READY</div>
                <div class="card-sub">Research &amp; Generation</div>
              </div>
              <div class="card">
                <div class="card-label">Automation Master</div>
                <div class="card-val" id="dash-automation-status" style="font-size:1.1rem; color:var(--accent-blue);">● ACTIVE</div>
                <div class="card-sub">Daily at 08:00 UTC</div>
              </div>
              <div class="card">
                <div class="card-label">Facebook Integration</div>
                <div class="card-val" id="dash-fb-status" style="font-size:1.1rem; color:var(--accent-emerald);">● CONNECTED</div>
                <div class="card-sub">Page ID: 107455558114139</div>
              </div>
              <div class="card">
                <div class="card-label">Next Scheduled Post</div>
                <div class="card-val" id="cnt-next-pub" style="font-size:1rem; color:var(--text-main);">Tomorrow, 08:00 UTC</div>
                <div class="card-sub">Automated Queue</div>
              </div>
            </div>

            <!-- Content Workflow Overview KPI Cards -->
            <div class="section-grid" id="pipeline-grid">
              <div class="card">
                <div class="card-label">Topics Available</div>
                <div class="card-val" id="cnt-ideas">0</div>
                <div class="card-sub">Discovered research ideas</div>
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
                  System is operational. No pipeline run currently in progress. <strong>Next scheduled publication:</strong> Tomorrow, 08:00 UTC.
                </div>
                <button class="btn-secondary" onclick="switchTab('pipeline', event)">Manage Pipeline &rarr;</button>
              </div>
            </div>

            <!-- Recent Activity Log Preview -->
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

            <div id="pipeline-control-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

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

            <div id="research-run-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

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
                      <th>Topic</th>
                      <th>Description</th>
                      <th>Category</th>
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
                  Generate from topic
                </button>
                <button class="btn-secondary" onclick="generatePostsForAllEligible()">
                  Generate all
                </button>
                <button class="btn-primary" onclick="openAddPostModal()">
                  + Add post
                </button>
              </div>
            </div>

            <div id="content-alert" class="alert-success" style="display:none; margin-bottom:1.5rem;"></div>

            <!-- Post Bulk Action Toolbar -->
            <div id="post-bulk-toolbar" class="bulk-toolbar" style="display:none;">
              <div class="bulk-toolbar-info">
                <span id="post-selected-count">0</span> drafts selected
              </div>
              <div class="bulk-toolbar-actions">
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
                      <th>Associated Topic</th>
                      <th>Post Content Preview</th>
                      <th>Status</th>
                      <th>Created Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="posts-table-body">
                    <tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading post drafts...</td></tr>
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
                      <th>Scheduled Time (UTC)</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="schedules-table-body">
                    <tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading scheduled posts...</td></tr>
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
                <p class="page-subtitle" style="margin-bottom:0;">History of published posts.</p>
              </div>
            </div>

            <div id="publication-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>

            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Facebook Publication Log</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Published Date</th>
                      <th>Post Snippet</th>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="publications-table-body">
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Loading publication history...</td></tr>
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
          <div class="form-group">
            <label class="form-label" for="topic-input-title">Topic</label>
            <input type="text" id="topic-input-title" class="form-input" required placeholder="e.g. 5 Reasons Your Small Business Needs Automated Booking" />
          </div>
          <div class="form-group">
            <label class="form-label" for="topic-input-desc">Description</label>
            <textarea id="topic-input-desc" class="form-input" style="min-height:90px; font-family:inherit;" placeholder="Key insights, angle, or source summary..."></textarea>
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
            <label class="form-label">Image</label>
            <img id="post-image-preview" alt="Post image preview" style="display:none; width:100%; max-height:220px; object-fit:contain; margin-bottom:0.5rem; border-radius:6px;" />
            <input type="url" id="post-input-image-url" class="form-input" placeholder="https://… image URL" />
            <input type="file" id="post-input-image-file" class="form-input" accept="image/jpeg,image/png,image/webp" style="margin-top:0.5rem;" />
            <label style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;"><input type="checkbox" id="post-remove-image" /> Remove image</label>
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
          <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
            <button type="button" class="btn-secondary" onclick="closeModal('post-modal')">Cancel</button>
            <button type="submit" id="save-post-btn" class="btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- 3. GENERATE POST FROM TOPIC MODAL -->
  <div id="generate-topic-modal" class="modal-backdrop">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">Generate Post from Topic</div>
        <button class="modal-close-btn" onclick="closeModal('generate-topic-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="generate-topic-form" onsubmit="handleGeneratePostFromTopicSubmit(event)">
          <div class="form-group">
            <label class="form-label" for="gen-topic-title">Topic</label>
            <input type="text" id="gen-topic-title" class="form-input" required placeholder="e.g. 5 Reasons Your Email Marketing Campaign Isn't Working" />
          </div>
          <div class="form-group">
            <label class="form-label" for="gen-topic-desc">Description (Optional)</label>
            <textarea id="gen-topic-desc" class="form-input" style="min-height:80px; font-family:inherit;" placeholder="Add specific context or focus angle..."></textarea>
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
            Generate
          </button>
        </form>
      </div>
    </div>
  </div>

  <!-- 4. BATCH GENERATION PROGRESS MODAL -->
  <div id="batch-progress-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:520px;">
      <div class="modal-header">
        <div class="modal-title" id="batch-progress-title">Generating Posts...</div>
      </div>
      <div class="modal-body">
        <div id="batch-progress-summary" style="font-size:0.875rem; color:var(--text-muted); margin-bottom:1rem;">
          Processing batch post generation sequentially.
        </div>
        <div id="batch-progress-list" class="batch-progress-list">
          <!-- Live item stepper rendered by JS -->
        </div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end;">
        <button id="batch-close-btn" class="btn-primary" style="display:none;" onclick="closeModal('batch-progress-modal')">Done</button>
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

  <!-- 7. SCHEDULE POST MODAL -->
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
            <label class="form-label" for="schedule-post-select">Select Approved Draft</label>
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
              <input type="time" id="schedule-time" class="form-input" value="08:00" required />
            </div>
          </div>
          <button type="submit" id="save-schedule-btn" class="btn-primary" style="width:100%;">Schedule</button>
        </form>
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
          <span id="sched-detail-time" style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">--</span>
        </div>

        <!-- Conflict Alert Banner -->
        <div id="sched-detail-conflict-banner" style="display:none; background:rgba(244, 63, 94, 0.1); border:1px solid rgba(244, 63, 94, 0.3); border-radius:8px; padding:1rem; margin-bottom:1rem;">
          <div style="color:#fda4af; font-weight:700; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.4rem;">
            <span>⚠️ Sync Conflict Detected</span>
          </div>
          <p style="font-size:0.825rem; color:var(--text-main); margin-bottom:0.75rem;">
            This post was edited on Facebook directly and also edited in the app. Choose which version to keep:
          </p>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn-primary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="resolvePostConflict('use_local')">Use Local Version</button>
            <button class="btn-secondary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="resolvePostConflict('use_facebook')">Use Facebook Version</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Post</label>
          <textarea id="sched-detail-post-body" class="form-input" rows="6"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('scheduled-post-detail-modal')">Close</button>
        <button type="button" id="sched-detail-save-btn" class="btn-primary" onclick="saveScheduledPostEdits()">Save</button>
        <button type="button" id="sched-detail-unschedule-btn" class="btn-logout" onclick="unscheduleSelectedPost()">Unschedule</button>
      </div>
    </div>
  </div>

  <!-- 9. INSTANT PUBLISH CONFIRMATION MODAL -->
  <div id="publish-modal" class="modal-backdrop">
    <div class="modal-box" style="max-width:440px;">
      <div class="modal-header">
        <div class="modal-title">Publish to Facebook</div>
        <button class="modal-close-btn" onclick="closeModal('publish-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:0.9rem; color:var(--text-muted); line-height:1.5;">
          This action will publish the selected post directly to your connected Facebook Page.
        </p>
        <input type="hidden" id="publish-modal-post-id" value="" />
        <input type="hidden" id="publish-modal-content-text" value="" />
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-logout" onclick="closeModal('publish-modal')">Cancel</button>
        <button type="button" id="confirm-publish-btn" class="btn-primary" style="background: linear-gradient(135deg, #1877f2, #0056b3);" onclick="executeInstantPublication()">Publish</button>
      </div>
    </div>
  </div>

  <script>
    ${getAdminScripts()}
  </script>
</body>
</html>`;
}
