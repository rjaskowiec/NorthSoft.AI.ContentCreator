/**
 * Admin Dashboard UI — CSS Stylesheet Module
 *
 * Implements Facebook / Meta Business inspired 3-column layout:
 * - Left Sidebar (240px navigation)
 * - Center Workspace (flexible content area)
 * - Right Facebook Live Preview Rail (330px persistent feed)
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
      --accent-blue: #1877f2;
      --accent-blue-hover: #166fe5;
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
      box-shadow: 0 8px 16px -4px rgba(24, 119, 242, 0.3);
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
      box-shadow: 0 0 0 3px rgba(24, 119, 242, 0.15);
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
      box-shadow: 0 4px 12px rgba(24, 119, 242, 0.25);
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

    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-main);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 0.5rem 1rem;
      font-weight: 500;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--border-color-hover);
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

    /* DASHBOARD 3-COLUMN LAYOUT */
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

    /* 1. LEFT SIDEBAR */
    .sidebar {
      width: 240px;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      padding: 1.25rem 0.85rem;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      z-index: 100;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 0.5rem 1rem 0.5rem;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 0.75rem;
    }

    .sidebar-brand-name {
      font-weight: 700;
      font-size: 1.05rem;
      letter-spacing: -0.01em;
      color: var(--text-main);
    }

    .sidebar-brand-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .nav-section-title {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--text-subtle);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 1.15rem 0.75rem 0.35rem 0.75rem;
    }

    .nav-section-title:first-of-type {
      padding-top: 0.35rem;
    }

    .nav-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .nav-item a {
      display: flex;
      align-items: center;
      padding: 0.55rem 0.75rem;
      color: var(--text-muted);
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.85rem;
      transition: all 0.15s ease;
      border: 1px solid transparent;
    }

    .nav-item a:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-main);
    }

    .nav-item.active a {
      background: rgba(24, 119, 242, 0.15);
      color: #60a5fa;
      font-weight: 600;
      border-color: rgba(24, 119, 242, 0.3);
    }

    .nav-icon {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      margin-right: 0.6rem;
      flex-shrink: 0;
    }

    /* 2. CENTER WORKSPACE */
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
      padding: 0 1.75rem;
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      flex-direction: column;
    }

    .header-app-title {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-main);
      letter-spacing: -0.01em;
    }

    .header-app-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .header-user {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .user-pill {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-color);
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
    }

    .user-avatar {
      font-size: 0.9rem;
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
      padding: 1.75rem;
      flex: 1;
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
      margin-bottom: 1.5rem;
    }

    /* GRID & CARDS */
    .section-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
      font-size: 0.725rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .card-val {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.02em;
    }

    .card-sub {
      font-size: 0.78rem;
      color: var(--text-subtle);
      margin-top: 0.35rem;
    }

    /* STATUS BADGES & DOTS */
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

    .status-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .status-dot-healthy { background-color: #34d399; box-shadow: 0 0 6px rgba(52, 211, 153, 0.6); }
    .status-dot-active { background-color: #60a5fa; box-shadow: 0 0 6px rgba(96, 165, 250, 0.6); }
    .status-dot-alert { background-color: #fda4af; box-shadow: 0 0 6px rgba(253, 164, 175, 0.6); }
    .status-dot-disabled { background-color: #94a3b8; }

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
      color: var(--text-main);
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

    .audit-details-compact {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      max-width: 400px;
    }

    .detail-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: #090d16;
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.775rem;
    }

    .detail-key {
      color: var(--text-muted);
      font-weight: 500;
    }

    .detail-val {
      color: var(--text-main);
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    /* 3. RIGHT FACEBOOK LIVE PREVIEW RAIL */
    .facebook-rail {
      width: 330px;
      background: var(--bg-sidebar);
      border-left: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      padding: 1.25rem 1rem;
      z-index: 90;
    }

    .fb-rail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.85rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-color);
    }

    .fb-rail-title {
      font-weight: 700;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--text-main);
    }

    .fb-rail-page-box {
      background: rgba(24, 119, 242, 0.06);
      border: 1px solid rgba(24, 119, 242, 0.18);
      border-radius: 10px;
      padding: 0.85rem;
      margin-bottom: 1rem;
    }

    .fb-rail-page-header {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      margin-bottom: 0.6rem;
    }

    .fb-rail-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1877f2, #0056b3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: white;
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .fb-rail-page-title {
      font-weight: 700;
      font-size: 0.9rem;
      color: var(--text-main);
      line-height: 1.2;
    }

    .fb-rail-page-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .fb-rail-status-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .fb-rail-status-chip {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }

    .fb-rail-feed-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    .btn-icon-refresh {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 0.25rem 0.45rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
    }

    .btn-icon-refresh:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
    }

    .fb-rail-posts-list {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      flex: 1;
    }

    .fb-rail-post-card {
      background: #18191a;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0.85rem;
      transition: border-color 0.15s ease;
    }

    .fb-rail-post-card:hover {
      border-color: rgba(24, 119, 242, 0.3);
    }

    .fb-rail-post-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .fb-rail-post-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1877f2, #0056b3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: white;
      font-size: 0.7rem;
      flex-shrink: 0;
    }

    .fb-rail-post-name {
      font-weight: 600;
      font-size: 0.825rem;
      color: #e4e6eb;
      line-height: 1.2;
    }

    .fb-rail-post-time {
      font-size: 0.7rem;
      color: #b0b3b8;
    }

    .fb-rail-post-text {
      font-size: 0.825rem;
      color: #e4e6eb;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
      margin-bottom: 0.5rem;
      max-height: 120px;
      overflow-y: auto;
    }

    .fb-rail-post-img-wrap {
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 0.5rem;
      max-height: 160px;
      background: #242526;
    }

    .fb-rail-post-img-wrap img {
      width: 100%;
      max-height: 160px;
      object-fit: cover;
      display: block;
    }

    .fb-rail-post-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 0.4rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 0.75rem;
    }

    .fb-rail-post-link {
      color: var(--accent-blue);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s ease;
    }

    .fb-rail-post-link:hover {
      text-decoration: underline;
    }

    /* Loading Spinner */
    .fb-post-loading-spinner {
      width: 24px;
      height: 24px;
      border: 3px solid rgba(24, 119, 242, 0.15);
      border-top-color: #1877f2;
      border-radius: 50%;
      margin: 0 auto;
      animation: fbSpinner 0.75s linear infinite;
    }

    @keyframes fbSpinner {
      to { transform: rotate(360deg); }
    }

    /* RESPONSIVE BREAKPOINTS */
    @media (max-width: 1200px) {
      .facebook-rail {
        width: 300px;
      }
    }

    @media (max-width: 960px) {
      .app-layout {
        flex-direction: column;
      }

      .sidebar {
        width: 100%;
        height: auto;
        position: relative;
        border-right: none;
        border-bottom: 1px solid var(--border-color);
        padding: 1rem;
      }

      .sidebar-brand {
        margin-bottom: 0.5rem;
        padding-bottom: 0.5rem;
      }

      .nav-list {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 0.35rem;
      }

      .nav-section-title {
        display: none;
      }

      .nav-item a {
        padding: 0.45rem 0.65rem;
        white-space: nowrap;
      }

      .facebook-rail {
        width: 100%;
        height: auto;
        position: relative;
        border-left: none;
        border-top: 1px solid var(--border-color);
        padding: 1.25rem 1rem;
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

    /* AUDIT LOG REDESIGN STYLES */
    .audit-cat-btn.active {
      background: var(--accent-blue) !important;
      color: #ffffff !important;
      border-color: var(--accent-blue) !important;
    }

    .audit-row-clickable {
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .audit-row-clickable:hover {
      background-color: var(--bg-card-hover) !important;
    }

    .audit-detail-panel {
      background: #090d16;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.25rem;
      margin: 0.5rem 0;
      font-size: 0.85rem;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
    }

    .audit-detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .audit-detail-field {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .audit-detail-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .audit-detail-value {
      color: var(--text-main);
      font-size: 0.875rem;
      word-break: break-word;
    }

    .audit-error-box {
      background: rgba(244, 63, 94, 0.08);
      border: 1px solid rgba(244, 63, 94, 0.25);
      border-radius: 6px;
      padding: 0.75rem 1rem;
      color: #fda4af;
      font-family: monospace;
      font-size: 0.825rem;
      white-space: pre-wrap;
      word-break: break-all;
      margin-top: 0.75rem;
      max-height: 250px;
      overflow-y: auto;
    }
  `;
}
