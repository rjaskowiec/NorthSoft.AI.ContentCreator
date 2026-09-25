/**
 * NorthSoft.AI.ContentCreator — Admin Dashboard UI Entry Point
 *
 * Renders the single-page Admin Interface at /admin and /admin/*.
 * Composes modular styles, component structure, and client-side JavaScript.
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

  <!-- DASHBOARD SCREEN -->
  <div id="dashboard-screen">
    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-logo" style="width:36px; height:36px;">
            <svg viewBox="0 0 24 24" style="width:20px; height:20px; fill:none; stroke:white; stroke-width:2;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <div class="sidebar-brand-name">NorthSoft AI</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Content Creator</div>
          </div>
        </div>

        <ul class="nav-list">
          <li class="nav-item active" id="nav-dashboard"><a href="#dashboard" onclick="switchTab('dashboard')">Dashboard</a></li>
          <li class="nav-item" id="nav-research"><a href="#research" onclick="switchTab('research')">Research <span class="status-badge status-healthy" style="font-size:0.65rem; padding:2px 6px;">Phase 3A</span></a></li>
          <li class="nav-item" id="nav-content"><a href="#content" onclick="switchTab('content')">Content <span class="status-badge status-healthy" style="font-size:0.65rem; padding:2px 6px;">Phase 3B</span></a></li>
          <li class="nav-item" id="nav-schedules"><a href="#schedules" onclick="switchTab('schedules')">Schedules <span class="status-badge status-healthy" style="font-size:0.65rem; padding:2px 6px;">Phase 3C</span></a></li>
          <li class="nav-item" id="nav-publications"><a href="#publications" onclick="switchTab('publications')">Publications <span class="status-badge status-healthy" style="font-size:0.65rem; padding:2px 6px;">Phase 4</span></a></li>
          <li class="nav-item" id="nav-security"><a href="#security" onclick="switchTab('security')">Account & Security <span class="status-badge status-healthy" style="font-size:0.65rem; padding:2px 6px;">Phase 5.3</span></a></li>
        </ul>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        <header class="header">
          <div style="font-weight:600; font-size:0.95rem;" id="header-app-name">NorthSoft AI — Content Creator</div>

          <div class="header-user">
            <span id="env-badge" class="env-tag env-staging">STAGING</span>
            <div style="font-size:0.85rem; font-weight:500;" id="user-display">Administrator</div>
            <button id="logout-btn" class="btn-logout">Sign Out</button>
          </div>
        </header>

        <div class="content-body">

          <!-- TAB 1: DASHBOARD OVERVIEW -->
          <div id="tab-dashboard" class="tab-section active-tab">
            <h1 class="page-title">Admin Dashboard</h1>
            <p class="page-subtitle">System status, content pipeline overview, and security controls.</p>

            <!-- System Status Grid -->
            <h2 style="font-size:1.1rem; margin-bottom:1rem;">System Status</h2>
            <div class="section-grid" id="status-grid">
              <div class="card">
                <div class="card-label">Worker Status</div>
                <div class="card-val" id="val-worker"><span class="status-badge status-healthy">Healthy</span></div>
                <div class="card-sub">Cloudflare Worker runtime</div>
              </div>
              <div class="card">
                <div class="card-label">Database (D1)</div>
                <div class="card-val" id="val-db"><span class="status-badge status-healthy">Connected</span></div>
                <div class="card-sub">SQLite at Edge</div>
              </div>
              <div class="card">
                <div class="card-label">AI Engine</div>
                <div class="card-val" id="val-ai"><span class="status-badge status-active">Configured</span></div>
                <div class="card-sub">Workers AI (Zero Cost)</div>
              </div>
              <div class="card">
                <div class="card-label">Facebook Publisher</div>
                <div class="card-val" id="val-fb"><span class="status-badge status-disabled">Not configured</span></div>
                <div class="card-sub">Meta Graph API v19.0</div>
              </div>
              <div class="card">
                <div class="card-label">Publishing Pipeline</div>
                <div class="card-val" id="val-publishing"><span class="status-badge status-disabled">Disabled</span></div>
                <div class="card-sub">Production Safety Lock</div>
              </div>
            </div>

            <!-- Content Pipeline Grid -->
            <h2 style="font-size:1.1rem; margin-bottom:1rem;">Content Pipeline</h2>
            <div class="section-grid" id="pipeline-grid">
              <div class="card">
                <div class="card-label">Ideas</div>
                <div class="card-val" id="cnt-ideas">0</div>
                <div class="card-sub">Backlog topics</div>
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
                <div class="card-val" id="cnt-blocked" style="color:var(--accent-red);">0</div>
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
                  <div class="card-label">Neurons Consumed (Last Run)</div>
                  <div style="font-weight:600; color:var(--accent-cyan);" id="orch-neurons-val">0 Neurons</div>
                </div>
              </div>
            </div>

            <!-- AI Quota & Neuron Usage Panel -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Cloudflare Workers AI Quota & Budget Enforcement</div>
                <div id="ai-quota-badge"><span class="status-badge status-healthy">FREE CAPACITY AVAILABLE</span></div>
              </div>
              <div class="section-grid" style="margin-bottom:1.5rem;">
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
                  <div class="card-label">Daily Neuron Usage</div>
                  <div style="font-size:1.1rem; font-weight:700;" id="ai-neurons-text">0 / 7,500 Neurons (Hard Stop)</div>
                  <div class="progress-bar-container">
                    <div id="ai-neurons-bar" class="progress-bar-fill" style="width: 0%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Recent Audit Activity Log -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">System Audit Log</div>
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
                    <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Loading audit log...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 2: RESEARCH ENGINE -->
          <div id="tab-research" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Research Engine & Topic Discovery</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Autonomous discovery, curation, and prioritization of candidate tech topics.</p>
              </div>
              <button id="run-research-btn" class="btn-primary" onclick="runResearchNow()">
                <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M5 3l14 9-14 9V3z"/></svg> Run Research Pipeline Now
              </button>
            </div>

            <div id="research-run-alert" class="alert-success"></div>

            <!-- Metrics Grid -->
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

            <!-- Candidate Topics List -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Discovered Candidate Topics</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Title & Description</th>
                      <th>Category</th>
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

            <!-- Research Sources Table -->
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

            <!-- Execution Log -->
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
                      <th>Sources Checked</th>
                      <th>Items Found</th>
                      <th>Topics Created</th>
                    </tr>
                  </thead>
                  <tbody id="runs-table-body">
                    <tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Loading execution log...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 3: CONTENT PIPELINE -->
          <div id="tab-content" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Content Pipeline & Post Drafts</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Autonomous post draft generation, static checks, independent QA review, policy evaluation, and quality gate results.</p>
              </div>
            </div>

            <div id="content-alert" class="alert-success"></div>

            <!-- Posts List Table -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Generated Post Drafts & Quality Gate Status</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Post Title & Version Body</th>
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

          <!-- TAB 4: SCHEDULED PUBLICATIONS -->
          <div id="tab-schedules" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Scheduled Content Queue</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Quality Gate approved content scheduled for future automated publication.</p>
              </div>
            </div>

            <!-- Schedules Table -->
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

          <!-- TAB 5: PUBLICATIONS & META ADAPTER -->
          <div id="tab-publications" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Meta / Facebook Publications</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Official Meta Graph API Facebook Page publication management, idempotency status, and retry controls.</p>
              </div>
            </div>

            <div id="publication-alert" class="alert-success" style="display:none; margin-bottom:1rem;"></div>

            <!-- Meta Configuration Status Panel -->
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
                  <div style="font-weight:600; color:var(--accent-blue);" id="meta-version-val">v19.0</div>
                </div>
                <div>
                  <div class="card-label">Publishing Safety Lock</div>
                  <div style="font-weight:600;" id="meta-lock-val">DISABLED</div>
                </div>
              </div>
            </div>

            <!-- Publications Table -->
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">Facebook Publications Log</div>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Post Title & Version Preview</th>
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

          <!-- TAB 6: ACCOUNT SECURITY & PASSWORD MANAGEMENT -->
          <div id="tab-security" class="tab-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
              <div>
                <h1 class="page-title">Account & Password Security</h1>
                <p class="page-subtitle" style="margin-bottom:0;">Rotate administrator password, manage active sessions, and review security invariants.</p>
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
    </div>
  </div>

  <script>
    ${getAdminScripts()}
  </script>
</body>
</html>`;
}
