/**
 * NorthSoft.AI.ContentCreator — Admin Dashboard UI
 *
 * Serves the single-page Admin Interface at /admin and /admin/*.
 * Includes responsive modern UI with dark theme, secure authentication state machine,
 * system status monitoring, content pipeline metrics, and recent activity logs.
 */

export function renderAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard — NorthSoft AI Content Creator</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0b0f19;
      --bg-card: #111827;
      --bg-card-hover: #1f2937;
      --bg-sidebar: #0d1322;
      --border-color: #1f293d;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent-blue: #3b82f6;
      --accent-cyan: #06b6d4;
      --accent-green: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --accent-purple: #8b5cf6;
      --glass-bg: rgba(17, 24, 39, 0.75);
      --glass-border: rgba(255, 255, 255, 0.08);
      --font-main: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: var(--font-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Background Glows */
    .glow-bg {
      position: fixed;
      top: -200px;
      right: -200px;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }

    /* LOGIN CONTAINER */
    #login-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
      z-index: 10;
    }

    .login-card {
      background: var(--glass-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      padding: 2.5rem;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }

    .brand-header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .brand-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      border-radius: 12px;
      margin-bottom: 1rem;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .brand-logo svg {
      width: 28px;
      height: 28px;
      fill: none;
      stroke: white;
      stroke-width: 2;
    }

    .brand-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .brand-subtitle {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }

    .form-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      color: var(--text-main);
      font-family: inherit;
      font-size: 0.95rem;
      transition: all 0.2s ease;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }

    .btn-primary {
      width: 100%;
      background: linear-gradient(135deg, var(--accent-blue), #2563eb);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.85rem;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }

    .btn-primary:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }

    .alert-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      margin-bottom: 1.25rem;
      display: none;
    }

    /* DASHBOARD LAYOUT */
    #dashboard-screen {
      display: none;
      flex: 1;
      z-index: 10;
    }

    .app-layout {
      display: flex;
      min-height: 100vh;
      width: 100%;
    }

    /* Sidebar */
    .sidebar {
      width: 260px;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      padding: 1.5rem 1rem;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 0.5rem 1.5rem 0.5rem;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 1.5rem;
    }

    .sidebar-brand-name {
      font-weight: 700;
      font-size: 1.1rem;
    }

    .nav-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .nav-item a {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 0.85rem;
      border-radius: 8px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .nav-item.active a, .nav-item a:hover:not(.disabled) {
      background: var(--bg-card);
      color: var(--text-main);
    }

    .nav-item.disabled a {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .badge-disabled {
      font-size: 0.7rem;
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Main Content */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .header {
      height: 64px;
      border-bottom: 1px solid var(--border-color);
      padding: 0 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(11, 15, 25, 0.8);
      backdrop-filter: blur(8px);
    }

    .header-user {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .user-tag {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .env-tag {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 12px;
      text-transform: uppercase;
    }

    .env-production {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .env-staging {
      background: rgba(245, 158, 11, 0.15);
      color: #fde68a;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .env-development {
      background: rgba(59, 130, 246, 0.15);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .btn-logout {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 0.4rem 0.85rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }

    .btn-logout:hover {
      background: rgba(239, 68, 68, 0.15);
      color: var(--accent-red);
      border-color: rgba(239, 68, 68, 0.3);
    }

    .content-body {
      padding: 2rem;
      max-width: 1400px;
      width: 100%;
    }

    .page-title {
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .page-subtitle {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .section-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.25rem;
      transition: transform 0.2s, border-color 0.2s;
    }

    .card:hover {
      border-color: rgba(59, 130, 246, 0.3);
    }

    .card-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .card-val {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .card-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
    }

    .status-healthy { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }
    .status-disabled { background: rgba(156, 163, 175, 0.15); color: #d1d5db; }
    .status-alert { background: rgba(245, 158, 11, 0.15); color: #fde68a; }

    /* Tables */
    .panel {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
    }

    .panel-title {
      font-size: 1.1rem;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.875rem;
    }

    th {
      color: var(--text-muted);
      font-weight: 500;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    tr:last-child td {
      border-bottom: none;
    }

    .code-tag {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      background: rgba(255, 255, 255, 0.05);
      padding: 2px 6px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="glow-bg"></div>

  <!-- LOGIN SCREEN -->
  <div id="login-screen">
    <div class="login-card">
      <div class="brand-header">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <h1 class="brand-title">NorthSoft AI</h1>
        <p class="brand-subtitle">Content Creator Admin Interface</p>
      </div>

      <div id="login-alert" class="alert-error"></div>

      <form id="login-form">
        <div class="form-group">
          <label class="form-label" for="username">Administrator Username</label>
          <input type="text" id="username" class="form-input" required autocomplete="username" autofocus>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Password</label>
          <input type="password" id="password" class="form-input" required autocomplete="current-password">
        </div>

        <button type="submit" id="login-btn" class="btn-primary">Authenticate</button>
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
            <svg viewBox="0 0 24 24" style="width:20px; height:20px;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <div class="sidebar-brand-name">NorthSoft AI</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Content Creator</div>
          </div>
        </div>

        <ul class="nav-list">
          <li class="nav-item active"><a href="#dashboard">Dashboard</a></li>
          <li class="nav-item disabled"><a href="#content">Content <span class="badge-disabled">Phase 3</span></a></li>
          <li class="nav-item disabled"><a href="#ideas">Ideas <span class="badge-disabled">Phase 3</span></a></li>
          <li class="nav-item disabled"><a href="#calendar">Calendar <span class="badge-disabled">Phase 3</span></a></li>
          <li class="nav-item disabled"><a href="#research">Research <span class="badge-disabled">Phase 3</span></a></li>
          <li class="nav-item disabled"><a href="#settings">Settings <span class="badge-disabled">Phase 3</span></a></li>
          <li class="nav-item disabled"><a href="#audit">Audit Log <span class="badge-disabled">Phase 3</span></a></li>
        </ul>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        <header class="header">
          <div style="font-weight:600; font-size:0.95rem;" id="header-app-name">NorthSoft AI — Content Creator</div>
          <div class="header-user">
            <span id="env-badge" class="env-tag env-staging">Staging</span>
            <span class="user-tag" id="user-display">admin</span>
            <button id="logout-btn" class="btn-logout">Sign Out</button>
          </div>
        </header>

        <div class="content-body">
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
              <div class="card-val" id="val-ai"><span class="status-badge status-disabled">Not configured</span></div>
              <div class="card-sub">AI Research Engine</div>
            </div>
            <div class="card">
              <div class="card-label">Facebook Publisher</div>
              <div class="card-val" id="val-fb"><span class="status-badge status-disabled">Not configured</span></div>
              <div class="card-sub">Meta Graph API</div>
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

          <!-- Security Status Panel -->
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">Security & Architecture Status</div>
            </div>
            <div class="section-grid" style="margin-bottom:0;">
              <div>
                <div class="card-label">Authentication</div>
                <div style="font-weight:600; color:var(--accent-green);">Enabled (HttpOnly Cookie)</div>
              </div>
              <div>
                <div class="card-label">CSRF Protection</div>
                <div style="font-weight:600; color:var(--accent-green);">Enabled (Session-Bound)</div>
              </div>
              <div>
                <div class="card-label">Brute-Force Limit</div>
                <div style="font-weight:600; color:var(--accent-green);">Enabled (D1 Tracked)</div>
              </div>
              <div>
                <div class="card-label">Facebook Publishing</div>
                <div style="font-weight:600; color:var(--accent-red);">LOCKED / DISABLED</div>
              </div>
            </div>
          </div>

          <!-- Recent Activity Panel -->
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">Recent Audit Events</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Event Type</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody id="audit-table-body">
                <tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Loading audit history...</td></tr>
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  </div>

  <script>
    let csrfToken = '';

    // Initialize State Check
    document.addEventListener('DOMContentLoaded', checkSession);

    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.authenticated) {
          csrfToken = data.csrfToken;
          showDashboard(data.user);
        } else {
          showLogin();
        }
      } catch (err) {
        showLogin();
      }
    }

    function showLogin() {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('dashboard-screen').style.display = 'none';
    }

    function showDashboard(user) {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('dashboard-screen').style.display = 'flex';
      document.getElementById('user-display').textContent = user.username;
      loadDashboardData();
    }

    // Login Form Handler
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('login-alert');
      alertEl.style.display = 'none';

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          csrfToken = data.csrfToken;
          showDashboard(data.user);
        } else {
          alertEl.textContent = data.message || 'Invalid credentials.';
          alertEl.style.display = 'block';
        }
      } catch (err) {
        alertEl.textContent = 'An unexpected connection error occurred.';
        alertEl.style.display = 'block';
      }
    });

    // Logout Handler
    document.getElementById('logout-btn').addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          }
        });
      } finally {
        csrfToken = '';
        showLogin();
      }
    });

    // Load Dashboard Data
    async function loadDashboardData() {
      try {
        const res = await fetch('/api/admin/dashboard');
        if (!res.ok) {
          if (res.status === 401) showLogin();
          return;
        }

        const data = await res.json();

        // Environment Tag
        const envBadge = document.getElementById('env-badge');
        const env = (data.systemStatus.environment || 'staging').toLowerCase();
        envBadge.textContent = env.toUpperCase();
        envBadge.className = 'env-tag env-' + env;

        // Pipeline Counts
        document.getElementById('cnt-ideas').textContent = data.pipeline.ideas;
        document.getElementById('cnt-drafts').textContent = data.pipeline.drafts;
        document.getElementById('cnt-qa').textContent = data.pipeline.awaitingQa;
        document.getElementById('cnt-approved').textContent = data.pipeline.approved;
        document.getElementById('cnt-scheduled').textContent = data.pipeline.scheduled;
        document.getElementById('cnt-published').textContent = data.pipeline.published;
        document.getElementById('cnt-blocked').textContent = data.pipeline.blocked;

        // Audit Events Table
        const tableBody = document.getElementById('audit-table-body');
        if (data.recentActivity && data.recentActivity.length > 0) {
          tableBody.innerHTML = data.recentActivity.map(act => \`
            <tr>
              <td class="code-tag">\${new Date(act.timestamp).toLocaleString()}</td>
              <td><span class="code-tag">\${act.actor}</span></td>
              <td><strong>\${act.eventType}</strong></td>
              <td style="color:var(--text-muted);">\${act.summary}</td>
            </tr>
          \`).join('');
        } else {
          tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No recent activity logged.</td></tr>';
        }

      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }
  </script>
</body>
</html>`;
}
