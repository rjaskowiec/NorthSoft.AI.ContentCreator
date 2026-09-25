/**
 * Admin Dashboard UI — CSS Stylesheet Module
 */

export function getAdminCss(): string {
  return `
    :root {
      --bg-dark: #0b0f19;
      --bg-card: #131b2e;
      --bg-card-hover: #19243c;
      --bg-sidebar: #0e1422;
      --border-color: rgba(255, 255, 255, 0.08);
      --border-color-hover: rgba(255, 255, 255, 0.16);
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --text-subtle: #64748b;
      --accent-blue: #3b82f6;
      --accent-blue-hover: #2563eb;
      --accent-cyan: #06b6d4;
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --accent-rose: #f43f5e;
      --font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: var(--font-family);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* ACCESSIBILITY & FOCUS VISIBILITY */
    :focus-visible {
      outline: 2px solid var(--accent-blue);
      outline-offset: 2px;
    }

    /* AUTH SCREEN */
    #login-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      width: 100%;
      padding: 1.5rem;
      background: radial-gradient(circle at top center, #172036 0%, #0b0f19 70%);
    }

    .auth-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 2.5rem;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }

    .auth-header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .brand-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
      border-radius: 10px;
      margin-bottom: 1rem;
      box-shadow: 0 8px 16px -4px rgba(59, 130, 246, 0.3);
    }

    .brand-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.025em;
    }

    .brand-sub {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-label {
      display: block;
      font-size: 0.825rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
      letter-spacing: 0.01em;
    }

    .form-input {
      width: 100%;
      background: #090d16;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 0.7rem 0.9rem;
      color: var(--text-main);
      font-size: 0.925rem;
      font-family: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .btn-primary {
      background: var(--accent-blue);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.7rem 1.25rem;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
    }

    .btn-primary:hover {
      background: var(--accent-blue-hover);
      transform: translateY(-1px);
    }

    .btn-primary:active {
      transform: translateY(0);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .alert-error {
      background: rgba(244, 63, 94, 0.1);
      border: 1px solid rgba(244, 63, 94, 0.25);
      color: #fda4af;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      margin-bottom: 1.25rem;
      display: none;
    }

    .alert-success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #6ee7b7;
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
      flex-shrink: 0;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 0.5rem 1.25rem 0.5rem;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 1.25rem;
    }

    .sidebar-brand-name {
      font-weight: 700;
      font-size: 1.05rem;
      letter-spacing: -0.01em;
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
      padding: 0.65rem 0.85rem;
      color: var(--text-muted);
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.875rem;
      transition: all 0.15s ease;
    }

    .nav-item a:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-main);
    }

    .nav-item.active a {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      font-weight: 600;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .nav-item.disabled a {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Main Content Area */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-x: hidden;
    }

    .header {
      height: 64px;
      background: var(--bg-sidebar);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 2rem;
      flex-shrink: 0;
    }

    .header-user {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .env-tag {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .env-staging { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .env-production { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .env-development { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }

    .btn-logout {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 0.4rem 0.85rem;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-logout:hover {
      background: rgba(244, 63, 94, 0.1);
      color: #fda4af;
      border-color: rgba(244, 63, 94, 0.3);
    }

    .content-body {
      padding: 2rem;
      flex: 1;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.25rem;
    }

    .page-subtitle {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-bottom: 1.75rem;
    }

    /* GRID & CARDS */
    .section-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.75rem;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 1.15rem;
      display: flex;
      flex-direction: column;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    .card:hover {
      border-color: var(--border-color-hover);
      background: var(--bg-card-hover);
    }

    .card-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .card-val {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.02em;
    }

    .card-sub {
      font-size: 0.8rem;
      color: var(--text-subtle);
      margin-top: 0.35rem;
    }

    /* STATUS BADGES */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.725rem;
      font-weight: 600;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      letter-spacing: 0.02em;
    }

    .status-healthy { background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.25); }
    .status-active { background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25); }
    .status-disabled { background: rgba(148, 163, 184, 0.12); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.25); }
    .status-alert { background: rgba(244, 63, 94, 0.12); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.25); }

    /* PANELS & TABLES */
    .panel {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.75rem;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-color);
    }

    .panel-title {
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .table-container {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    th {
      text-align: left;
      padding: 0.7rem 0.9rem;
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }

    td {
      padding: 0.85rem 0.9rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      vertical-align: middle;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    tr:last-child td {
      border-bottom: none;
    }

    .code-tag {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #090d16;
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.8rem;
      color: var(--accent-cyan);
    }

    .progress-bar-container {
      width: 100%;
      background: #090d16;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      height: 8px;
      overflow: hidden;
      margin-top: 0.5rem;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-blue), var(--accent-cyan));
      border-radius: 6px;
      transition: width 0.3s ease;
    }

    .tab-section {
      display: none;
    }

    .active-tab {
      display: block;
    }

    .badge-disabled {
      font-size: 0.65rem;
      padding: 2px 6px;
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
      border-radius: 4px;
    }

    /* RESPONSIVE LAYOUT ADJUSTMENTS */
    @media (max-width: 1024px) {
      .section-grid {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
    }

    @media (max-width: 768px) {
      .app-layout {
        flex-direction: column;
      }

      .sidebar {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid var(--border-color);
        padding: 1rem;
      }

      .sidebar-brand {
        margin-bottom: 0.75rem;
        padding-bottom: 0.75rem;
      }

      .nav-list {
        flex-direction: row;
        overflow-x: auto;
        padding-bottom: 0.25rem;
      }

      .nav-item a {
        padding: 0.5rem 0.75rem;
        white-space: nowrap;
      }

      .header {
        padding: 0 1rem;
        height: 56px;
      }

      .content-body {
        padding: 1rem;
      }

      .section-grid {
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0.75rem;
      }

      .card {
        padding: 0.9rem;
      }

      .card-val {
        font-size: 1.35rem;
      }
    }
  `;
}
