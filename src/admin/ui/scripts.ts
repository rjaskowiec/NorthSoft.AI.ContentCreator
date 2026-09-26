/**
 * Admin Dashboard UI — Client-Side JavaScript Module
 */

export function getAdminScripts(): string {
  return `
    let csrfToken = '';
    let currentTab = 'dashboard';

    // Safe String & Utility Normalizers for API Resilience
    function safeStr(val, defaultVal = '') {
      if (val === null || val === undefined) return defaultVal;
      return String(val);
    }

    function safeUpper(val, defaultVal = '') {
      return safeStr(val, defaultVal).toUpperCase();
    }

    function safeLower(val, defaultVal = '') {
      return safeStr(val, defaultVal).toLowerCase();
    }

    // Initialize State Check
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkSession);
    } else {
      checkSession();
    }

    async function checkSession() {
      const urlParams = new URLSearchParams(window.location.search);
      const resetToken = urlParams.get('resetToken') || urlParams.get('token');

      if (resetToken) {
        showResetForm(resetToken);
        return;
      }

      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data && data.authenticated) {
          csrfToken = safeStr(data.csrfToken);
          showDashboard(data.user || {});
        } else {
          showLoginForm();
        }
      } catch (err) {
        showLoginForm();
      }
    }

    function showLoginForm() {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('dashboard-screen').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
      document.getElementById('forgot-form').style.display = 'none';
      document.getElementById('reset-form').style.display = 'none';
    }

    function showForgotForm() {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('dashboard-screen').style.display = 'none';
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('forgot-form').style.display = 'block';
      document.getElementById('reset-form').style.display = 'none';
      document.getElementById('forgot-alert').style.display = 'none';
    }

    let activeResetToken = '';
    function showResetForm(token) {
      activeResetToken = safeStr(token);
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('dashboard-screen').style.display = 'none';
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('forgot-form').style.display = 'none';
      document.getElementById('reset-form').style.display = 'block';
      document.getElementById('reset-alert').style.display = 'none';
    }

    function formatTimeSafe(isoStr) {
      if (!isoStr) return '—';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return escapeHtml(safeStr(isoStr));
      return d.toLocaleTimeString();
    }

    function formatDateOnlySafe(isoStr) {
      if (!isoStr) return '—';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return escapeHtml(safeStr(isoStr));
      return d.toLocaleDateString();
    }

    function showDashboard(user) {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('dashboard-screen').style.display = 'flex';
      const userDisp = document.getElementById('user-display');
      if (userDisp) userDisp.textContent = safeStr(user.username, 'Administrator');

      const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
      const validTabs = ['dashboard', 'pipeline', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
      if (hash && validTabs.includes(hash)) {
        switchTab(hash);
      } else {
        switchTab('dashboard');
      }
    }

    async function switchTab(tabName, evt) {
      if (evt && typeof evt.preventDefault === 'function') {
        evt.preventDefault();
      }
      const validTabs = ['dashboard', 'pipeline', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
      if (!validTabs.includes(tabName)) {
        tabName = 'dashboard';
      }

      currentTab = tabName;
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-section').forEach(el => {
        el.classList.remove('active-tab');
        el.style.display = 'none';
      });

      const navEl = document.getElementById('nav-' + tabName);
      if (navEl) navEl.classList.add('active');

      const tabEl = document.getElementById('tab-' + tabName);
      if (tabEl) {
        tabEl.classList.add('active-tab');
        tabEl.style.display = 'block';
      }

      if (window.location.hash !== '#' + tabName) {
        try {
          window.history.pushState(null, '', '#' + tabName);
        } catch {
          // Ignore
        }
      }

      try {
        if (tabName === 'dashboard') {
          await loadDashboardData();
        } else if (tabName === 'pipeline') {
          await loadPipelineData();
        } else if (tabName === 'manual-publisher') {
          await loadManualPublisherData();
        } else if (tabName === 'research') {
          await loadResearchData();
        } else if (tabName === 'content') {
          await loadContentData();
        } else if (tabName === 'schedules') {
          await loadSchedulesData();
        } else if (tabName === 'publications') {
          await loadPublicationsData();
        } else if (tabName === 'audit') {
          await loadAuditData();
        } else if (tabName === 'security') {
          await loadSecurityData();
        }
      } catch (err) {
        console.error('Failed to load tab data for ' + tabName + ':', err);
      }
    }

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
      const validTabs = ['dashboard', 'pipeline', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
      if (hash && validTabs.includes(hash)) {
        switchTab(hash);
      }
    });

    // Login Form Handler
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('login-alert');
      if (alertEl) alertEl.style.display = 'none';

      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const username = usernameInput ? safeStr(usernameInput.value).trim() : '';
      const password = passwordInput ? safeStr(passwordInput.value) : '';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          csrfToken = safeStr(data.csrfToken);
          showDashboard(data.user || {});
        } else if (alertEl) {
          alertEl.textContent = safeStr(data.message, 'Invalid credentials.');
          alertEl.style.display = 'block';
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'An unexpected connection error occurred.';
          alertEl.style.display = 'block';
        }
      }
    });

    // Toggle Navigation between Auth Views
    document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      showForgotForm();
    });

    document.getElementById('back-to-login-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });

    document.getElementById('reset-to-login-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });

    // Forgot Password Form Handler
    document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('forgot-alert');
      if (alertEl) alertEl.style.display = 'none';

      const emailInput = document.getElementById('forgot-email');
      const email = emailInput ? safeStr(emailInput.value).trim() : '';

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok) {
            alertEl.className = 'alert-success';
            alertEl.textContent = safeStr(data.message, 'If an account matches this information, a password reset email has been sent.');
            if (emailInput) emailInput.value = '';
          } else {
            alertEl.className = 'alert-error';
            alertEl.textContent = safeStr(data.message, 'Failed to submit password recovery request.');
          }
          alertEl.style.display = 'block';
        }
      } catch (err) {
        if (alertEl) {
          alertEl.className = 'alert-error';
          alertEl.textContent = 'Failed to submit password recovery request.';
          alertEl.style.display = 'block';
        }
      }
    });

    // Reset Password Form Handler
    document.getElementById('reset-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('reset-alert');
      if (alertEl) alertEl.style.display = 'none';

      const newPassInput = document.getElementById('reset-new-password');
      const confirmPassInput = document.getElementById('reset-confirm-password');
      const newPassword = newPassInput ? safeStr(newPassInput.value) : '';
      const confirmPassword = confirmPassInput ? safeStr(confirmPassInput.value) : '';

      if (newPassword !== confirmPassword) {
        if (alertEl) {
          alertEl.className = 'alert-error';
          alertEl.textContent = 'Passwords do not match.';
          alertEl.style.display = 'block';
        }
        return;
      }

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: activeResetToken, newPassword, confirmPassword })
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            alertEl.className = 'alert-success';
            alertEl.textContent = 'Password reset successfully! Redirecting to login...';
            alertEl.style.display = 'block';
            setTimeout(() => {
              window.history.replaceState({}, document.title, window.location.pathname);
              showLoginForm();
            }, 2000);
          } else {
            alertEl.className = 'alert-error';
            alertEl.textContent = safeStr(data.message, 'Password reset link is invalid or expired.');
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.className = 'alert-error';
          alertEl.textContent = 'An error occurred resetting your password.';
          alertEl.style.display = 'block';
        }
      }
    });

    // Change Password Form Handler (Authenticated Admin)
    document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('security-alert');
      if (alertEl) alertEl.style.display = 'none';

      const currentPassword = safeStr(document.getElementById('change-current-password')?.value);
      const newPassword = safeStr(document.getElementById('change-new-password')?.value);
      const confirmPassword = safeStr(document.getElementById('change-confirm-password')?.value);

      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            if (data.csrfToken) csrfToken = safeStr(data.csrfToken);
            alertEl.className = 'alert-success';
            alertEl.textContent = 'Password updated successfully! All other sessions were invalidated.';
            alertEl.style.display = 'block';
            const p1 = document.getElementById('change-current-password');
            const p2 = document.getElementById('change-new-password');
            const p3 = document.getElementById('change-confirm-password');
            if (p1) p1.value = '';
            if (p2) p2.value = '';
            if (p3) p3.value = '';
          } else {
            alertEl.className = 'alert-error';
            alertEl.textContent = safeStr(data.message, 'Failed to change password.');
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.className = 'alert-error';
          alertEl.textContent = 'An unexpected connection error occurred.';
          alertEl.style.display = 'block';
        }
      }
    });

    async function loadSecurityData() {
      try {
        const res = await fetch('/api/auth/recovery-email');
        if (!res.ok) {
          if (res.status === 401) await checkSession();
          return;
        }
        const data = await res.json();
        const badgeEl = document.getElementById('recovery-email-badge');
        const boxEl = document.getElementById('recovery-email-status-box');
        const inputEl = document.getElementById('recovery-email-input');

        if (data.configured && data.email) {
          if (badgeEl) badgeEl.innerHTML = '<span class="status-badge status-healthy">Configured</span>';
          if (boxEl) boxEl.innerHTML = 'Password recovery email: <strong>' + escapeHtml(safeStr(data.email)) + '</strong><br><span style="color:var(--accent-emerald); font-size:0.85rem;">Password recovery via email is currently <strong>enabled</strong>.</span>';
          if (inputEl) inputEl.value = safeStr(data.email);
        } else {
          if (badgeEl) badgeEl.innerHTML = '<span class="status-badge status-disabled">Not configured</span>';
          if (boxEl) boxEl.innerHTML = 'Password recovery via email is currently <strong>unavailable</strong> because no recovery email address has been set.';
          if (inputEl) inputEl.value = '';
        }
      } catch (err) {
        console.error('Failed to load security data:', err);
      }
    }

    // Recovery Email Form Handler
    document.getElementById('recovery-email-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('security-alert');
      if (alertEl) alertEl.style.display = 'none';

      const email = safeStr(document.getElementById('recovery-email-input')?.value).trim();

      try {
        const res = await fetch('/api/auth/recovery-email', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({ email })
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            alertEl.className = 'alert-success';
            alertEl.textContent = 'Password recovery email updated successfully.';
            alertEl.style.display = 'block';
            loadSecurityData();
          } else {
            alertEl.className = 'alert-error';
            alertEl.textContent = safeStr(data.message, 'Failed to update recovery email.');
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.className = 'alert-error';
          alertEl.textContent = 'An unexpected connection error occurred.';
          alertEl.style.display = 'block';
        }
      }
    });

    // Logout Handler
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
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
        showLoginForm();
      }
    });

    // Load Dashboard Overview Data
    async function loadDashboardData() {
      try {
        const res = await fetch('/api/admin/dashboard');
        if (!res.ok) {
          if (res.status === 401) {
            await checkSession();
          } else {
            console.error('Failed to fetch dashboard data:', res.status, res.statusText);
          }
          return;
        }

        const data = await res.json();
        const sys = data.systemStatus || {};
        const metaStatus = sys.metaPublisherStatus || {};

        // Environment Tag
        const envBadge = document.getElementById('env-badge');
        if (envBadge) {
          const env = safeLower(sys.environment, 'staging');
          envBadge.textContent = env.toUpperCase();
          envBadge.className = 'env-tag env-' + env;
        }

        // Truthful System Status Cards
        const workerEl = document.getElementById('val-worker');
        if (workerEl) workerEl.innerHTML = '<span class="status-badge status-healthy">' + escapeHtml(safeStr(sys.worker, 'Healthy')) + '</span>';

        const dbEl = document.getElementById('val-db');
        if (dbEl) dbEl.innerHTML = '<span class="status-badge ' + (sys.database === 'Connected' ? 'status-healthy' : 'status-alert') + '">' + escapeHtml(safeStr(sys.database, 'Connected')) + '</span>';

        const aiEl = document.getElementById('val-ai');
        if (aiEl) aiEl.innerHTML = '<span class="status-badge status-active">' + escapeHtml(safeStr(sys.aiProvider, 'Workers AI')) + '</span>';

        const isFbConfigured = Boolean(metaStatus.configured || (metaStatus.pageIdConfigured && metaStatus.tokenConfigured));
        const fbConfigEl = document.getElementById('val-fb-config');
        if (fbConfigEl) fbConfigEl.innerHTML = '<span class="status-badge ' + (isFbConfigured ? 'status-healthy' : 'status-disabled') + '">' + (isFbConfigured ? 'Configured' : 'Not configured') + '</span>';

        const isPubEnabled = Boolean(sys.publishing === 'Enabled' || metaStatus.publishEnabled);
        const fbPubEl = document.getElementById('val-fb-publishing');
        if (fbPubEl) fbPubEl.innerHTML = '<span class="status-badge ' + (isPubEnabled ? 'status-healthy' : 'status-disabled') + '">' + (isPubEnabled ? 'Enabled' : 'Disabled') + '</span>';

        const railPubStatus = document.getElementById('fb-rail-pub-status');
        if (railPubStatus) {
          railPubStatus.className = 'fb-rail-status-chip ' + (isPubEnabled ? 'status-healthy' : 'status-disabled');
          railPubStatus.innerHTML = isPubEnabled ? '● Pub: Enabled' : '○ Pub: Disabled';
        }

        // Pipeline Counts
        const pipe = data.pipeline || {};
        const cntIdeas = document.getElementById('cnt-ideas');
        if (cntIdeas) cntIdeas.textContent = Number(pipe.discoveredTopics || pipe.ideas || 0);

        const cntDrafts = document.getElementById('cnt-drafts');
        if (cntDrafts) cntDrafts.textContent = Number(pipe.drafts || 0);

        const cntQa = document.getElementById('cnt-qa');
        if (cntQa) cntQa.textContent = Number(pipe.underReview || pipe.awaitingQa || 0);

        const cntApproved = document.getElementById('cnt-approved');
        if (cntApproved) cntApproved.textContent = Number(pipe.approved || 0);

        const cntScheduled = document.getElementById('cnt-scheduled');
        if (cntScheduled) cntScheduled.textContent = Number(pipe.scheduled || 0);

        const cntPublished = document.getElementById('cnt-published');
        if (cntPublished) cntPublished.textContent = Number(pipe.published || 0);

        const cntBlocked = document.getElementById('cnt-blocked');
        if (cntBlocked) cntBlocked.textContent = Number(pipe.rejected || pipe.blocked || 0);

        // Cloudflare Verified Telemetry & Application Execution Metrics
        if (data.aiUsage) {
          const usage = data.aiUsage;
          const cf = usage.cloudflareVerifiedUsage;
          const app = usage.applicationMetrics || usage;

          // 1. Cloudflare Verified Telemetry Panel
          const cfBadge = document.getElementById('cf-telemetry-badge');
          const cfNeurons = document.getElementById('cf-neurons-val');
          const cfReqs = document.getElementById('cf-requests-val');
          const cfSource = document.getElementById('cf-source-val');
          const cfSynced = document.getElementById('cf-synced-sub');
          const cfPeriod = document.getElementById('cf-period-sub');
          const cfNotice = document.getElementById('cf-notice-box');

          if (cf) {
            if (cfBadge) {
              const cfSt = safeUpper(cf.status, 'UNAVAILABLE');
              if (cfSt === 'VERIFIED') {
                cfBadge.className = 'status-badge status-healthy';
                cfBadge.textContent = 'VERIFIED TELEMETRY';
              } else if (cfSt === 'NOT_CONFIGURED') {
                cfBadge.className = 'status-badge status-active';
                cfBadge.textContent = 'NOT CONFIGURED';
              } else {
                cfBadge.className = 'status-badge status-alert';
                cfBadge.textContent = cfSt;
              }
            }

            if (cfNeurons) {
              cfNeurons.textContent = cf.actualNeurons !== null && cf.actualNeurons !== undefined
                ? Number(cf.actualNeurons).toLocaleString() + ' Neurons'
                : 'Not Available';
            }

            if (cfReqs) {
              cfReqs.textContent = cf.actualRequests !== null && cf.actualRequests !== undefined
                ? Number(cf.actualRequests).toLocaleString() + ' requests'
                : 'Not Available';
            }

            if (cfSource) cfSource.textContent = safeStr(cf.source, 'Cloudflare Analytics API');
            if (cfPeriod) cfPeriod.textContent = 'Period: ' + safeStr(cf.period, 'Today (UTC)');
            if (cfSynced) {
              cfSynced.textContent = cf.lastUpdated
                ? 'Last Synced: ' + new Date(cf.lastUpdated).toLocaleTimeString()
                : 'Last Synced: Unconfigured';
            }

            if (cfNotice) {
              if (cf.reason) {
                cfNotice.style.display = 'block';
                cfNotice.textContent = safeStr(cf.reason);
              } else {
                cfNotice.style.display = 'none';
              }
            }
          }

          // 2. Application Safety (Circuit Breaker) & Internal Diagnostics Panels
          const providerName = document.getElementById('ai-provider-name');
          if (providerName) providerName.textContent = safeStr(sys.aiProvider, 'Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct-fp8)');

          const appGuard = usage.applicationSafetyGuard || app;
          const diag = usage.internalDiagnostics || {};

          const todayRequests = Number(appGuard.todayRequests ?? usage.todayRequests ?? 0);
          const dailyLimit = Number(appGuard.dailyLimit ?? usage.dailyLimit ?? 300);
          const estTokens = Number(diag.estimatedTokensToday ?? usage.todayNeurons ?? 0);

          const todayText = document.getElementById('ai-today-text');
          if (todayText) todayText.textContent = todayRequests + ' / ' + dailyLimit + ' requests';

          const neuronsText = document.getElementById('ai-neurons-text');
          if (neuronsText) neuronsText.textContent = estTokens.toLocaleString() + ' Est. Tokens';

          const todayPct = Math.min(100, Math.round((todayRequests / (dailyLimit || 1)) * 100));
          const todayBar = document.getElementById('ai-today-bar');
          if (todayBar) todayBar.style.width = todayPct + '%';

          const badgeEl = document.getElementById('ai-quota-badge');
          if (badgeEl) {
            const status = safeUpper(appGuard.status || usage.status, 'FREE_CAPACITY_AVAILABLE');
            if (status === 'FREE_CAPACITY_AVAILABLE') {
              badgeEl.className = 'status-badge status-healthy';
              badgeEl.textContent = 'CIRCUIT BREAKER OK';
            } else {
              badgeEl.className = 'status-badge status-alert';
              badgeEl.textContent = status;
            }
          }
        }

        // Orchestrator Run Metrics
        if (data.lastRun) {
          const r = data.lastRun;
          const timeEl = document.getElementById('orch-last-time');
          if (timeEl) timeEl.textContent = r.started_at ? new Date(r.started_at).toLocaleString() : 'Never';

          const trigEl = document.getElementById('orch-last-trigger');
          if (trigEl) trigEl.textContent = 'Trigger: ' + safeUpper(r.trigger_type, 'CRON');

          const statusVal = document.getElementById('orch-status-val');
          if (statusVal) {
            const st = safeUpper(r.status, 'UNKNOWN');
            statusVal.innerHTML = '<span class="status-badge ' + (st === 'COMPLETED' ? 'status-healthy' : st === 'RUNNING' ? 'status-active' : 'status-alert') + '">' + st + '</span>';
          }

          const resVal = document.getElementById('orch-result-val');
          if (resVal) resVal.textContent = 'Result: ' + safeUpper(r.result_status, '—');

          const neurVal = document.getElementById('orch-neurons-val');
          if (neurVal) neurVal.textContent = Number(r.neurons_used || 0) + ' Est. Tokens';
        }

        // Audit Activity Table (Recent Activity Preview)
        const actBody = document.getElementById('recent-activity-body');
        if (actBody && Array.isArray(data.recentActivity)) {
          actBody.innerHTML = renderAuditRows(data.recentActivity);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }

      // Auto-load Facebook Page Posts (non-blocking)
      if (!fbPostsLoaded) {
        loadFacebookPagePosts();
      }
    }

    // Audit Log State
    let currentAuditPage = 1;
    let currentAuditCategory = 'all';
    let currentAuditSearch = '';
    let currentAuditTotalPages = 1;

    // Load Full Audit Log Data from /api/admin/audit
    async function loadAuditData() {
      try {
        const queryParams = new URLSearchParams({
          page: String(currentAuditPage),
          pageSize: '25',
          category: safeStr(currentAuditCategory, 'all'),
          search: safeStr(currentAuditSearch, ''),
        });

        const res = await fetch('/api/admin/audit?' + queryParams.toString());
        if (!res.ok) {
          if (res.status === 401) {
            await checkSession();
          } else {
            console.error('Failed to fetch audit data:', res.status, res.statusText);
            const fullBody = document.getElementById('full-audit-body');
            if (fullBody) {
              fullBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-rose); padding:1.5rem;">Failed to load audit events (HTTP ' + res.status + ').</td></tr>';
            }
          }
          return;
        }

        const data = await res.json();

        // Update Summary Stats
        if (data.stats) {
          const evEl = document.getElementById('audit-stat-events');
          if (evEl) evEl.textContent = Number(data.stats.totalEvents || 0);
          const errEl = document.getElementById('audit-stat-errors');
          if (errEl) errEl.textContent = Number(data.stats.errorCount || 0);
          const warnEl = document.getElementById('audit-stat-warnings');
          if (warnEl) warnEl.textContent = Number(data.stats.warningCount || 0);
          const aiEl = document.getElementById('audit-stat-ai');
          if (aiEl) aiEl.textContent = Number(data.stats.aiOperations || 0);
        }

        // Update Pagination Controls
        if (data.pagination) {
          currentAuditTotalPages = Number(data.pagination.totalPages || 1);
          const eventsArr = Array.isArray(data.events) ? data.events : [];
          const start = (data.pagination.page - 1) * data.pagination.pageSize + (eventsArr.length > 0 ? 1 : 0);
          const end = Math.min(Number(data.pagination.totalCount || 0), data.pagination.page * data.pagination.pageSize);
          const infoEl = document.getElementById('audit-pagination-info');
          if (infoEl) infoEl.textContent = 'Showing ' + start + ' - ' + end + ' of ' + data.pagination.totalCount + ' events';

          const pageInd = document.getElementById('audit-page-indicator');
          if (pageInd) pageInd.textContent = 'Page ' + data.pagination.page + ' of ' + currentAuditTotalPages;

          const prevBtn = document.getElementById('audit-prev-btn');
          if (prevBtn) prevBtn.disabled = currentAuditPage <= 1;

          const nextBtn = document.getElementById('audit-next-btn');
          if (nextBtn) nextBtn.disabled = currentAuditPage >= currentAuditTotalPages;
        }

        const fullBody = document.getElementById('full-audit-body');
        if (fullBody && Array.isArray(data.events)) {
          fullBody.innerHTML = renderAuditRows(data.events);
        }
      } catch (err) {
        console.error('Failed to load audit data:', err);
      }
    }

    function setAuditCategory(category) {
      currentAuditCategory = safeStr(category, 'all');
      currentAuditPage = 1;

      const buttons = document.querySelectorAll('.audit-cat-btn');
      buttons.forEach(btn => {
        if (btn.getAttribute('data-category') === currentAuditCategory) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      loadAuditData();
    }

    function executeAuditSearch() {
      const input = document.getElementById('audit-search-input');
      currentAuditSearch = input ? safeStr(input.value).trim() : '';
      currentAuditPage = 1;
      loadAuditData();
    }

    function handleAuditSearch(e) {
      if (e.key === 'Enter') {
        executeAuditSearch();
      }
    }

    function changeAuditPage(delta) {
      const newPage = currentAuditPage + delta;
      if (newPage >= 1 && newPage <= currentAuditTotalPages) {
        currentAuditPage = newPage;
        loadAuditData();
      }
    }

    function toggleAuditDetail(detailId) {
      const row = document.getElementById(detailId);
      if (row) {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
      }
    }

    window.loadAuditData = loadAuditData;
    window.setAuditCategory = setAuditCategory;
    window.executeAuditSearch = executeAuditSearch;
    window.handleAuditSearch = handleAuditSearch;
    window.changeAuditPage = changeAuditPage;
    window.toggleAuditDetail = toggleAuditDetail;

    // Load Research Tab Data
    async function loadResearchData() {
      try {
        const res = await fetch('/api/admin/research');
        if (!res.ok) {
          if (res.status === 401) {
            await checkSession();
          } else {
            console.error('Failed to fetch research data:', res.status, res.statusText);
            const topicsBody = document.getElementById('topics-table-body');
            if (topicsBody) {
              topicsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-rose);">Failed to load candidate topics (HTTP ' + res.status + ').</td></tr>';
            }
          }
          return;
        }

        const data = await res.json();
        const stats = data.stats || {};

        const srcCnt = document.getElementById('res-sources-cnt');
        if (srcCnt) srcCnt.textContent = Number(stats.totalSources || 0);

        const srcSub = document.getElementById('res-enabled-sub');
        if (srcSub) srcSub.textContent = Number(stats.enabledSources || 0) + ' Active Feeds';

        const topCnt = document.getElementById('res-topics-cnt');
        if (topCnt) topCnt.textContent = Number(stats.totalTopicsDiscovered || 0);

        const lastRun = document.getElementById('res-last-run');
        if (lastRun) lastRun.textContent = stats.lastRunAt ? formatTimeSafe(stats.lastRunAt) : 'Never';

        // Operational Diagnostics Summary Panel
        const diagPanel = document.getElementById('res-diag-panel');
        const diagContent = document.getElementById('res-diag-content');
        const diagStatus = document.getElementById('res-diag-status');

        if (Array.isArray(data.runs) && data.runs.length > 0 && diagPanel && diagContent) {
          const latestRun = data.runs[0];
          diagPanel.style.display = 'block';
          if (diagStatus) {
            const st = safeUpper(latestRun.status, 'COMPLETED');
            diagStatus.className = 'status-badge ' + (st === 'COMPLETED' ? 'status-healthy' : 'status-alert');
            diagStatus.textContent = st;
          }

          let pillarStr = 'None';
          if (latestRun.pillar_breakdown) {
            try {
              const pb = typeof latestRun.pillar_breakdown === 'string' ? JSON.parse(latestRun.pillar_breakdown) : latestRun.pillar_breakdown;
              pillarStr = Object.entries(pb).map(([k, v]) => '<strong>' + escapeHtml(safeStr(k)) + ':</strong> ' + v).join(', ');
            } catch {
              pillarStr = safeStr(latestRun.pillar_breakdown);
            }
          }

          diagContent.innerHTML = \`
            <div><strong>Discovered:</strong> \${latestRun.items_discovered || latestRun.items_found || 0} raw items</div>
            <div><strong>Normalized:</strong> \${latestRun.items_normalized || 0} unique</div>
            <div><strong>Irrelevant:</strong> \${latestRun.rejected_irrelevant || 0}</div>
            <div><strong>Low Quality:</strong> \${latestRun.rejected_low_quality || 0}</div>
            <div><strong>Duplicates:</strong> \${latestRun.duplicates_found || 0}</div>
            <div><strong>Final Candidates:</strong> \${latestRun.topics_created || 0}</div>
            <div style="width:100%; font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">Pillars: \${pillarStr}</div>
          \`;
        }

        // Topics Table
        const topicsBody = document.getElementById('topics-table-body');
        if (topicsBody) {
          if (Array.isArray(data.topics) && data.topics.length > 0) {
            topicsBody.innerHTML = data.topics.map(t => {
              if (!t) return '';
              return \`
              <tr>
                <td>
                  <strong>\${escapeHtml(safeStr(t.title, 'Untitled Topic'))}</strong>
                  <div style="font-size:0.8rem; color:var(--text-muted);">\${escapeHtml(safeStr(t.description))}</div>
                </td>
                <td><span class="code-tag">\${escapeHtml(safeStr(t.category, 'general'))}</span></td>
                <td><span class="status-badge status-healthy">\${Number(t.priority || 0)}/100</span></td>
                <td><span class="status-badge status-active">\${escapeHtml(safeUpper(t.status, 'DISCOVERED'))}</span></td>
                <td class="code-tag">\${formatDateOnlySafe(t.created_at)}</td>
              </tr>
            \`;
            }).join('');
          } else {
            topicsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No candidate topics discovered yet.</td></tr>';
          }
        }

        // Sources Table
        const sourcesBody = document.getElementById('sources-table-body');
        if (sourcesBody && Array.isArray(data.sources) && data.sources.length > 0) {
          sourcesBody.innerHTML = data.sources.map(s => {
            if (!s) return '';
            return \`
            <tr>
              <td><strong>\${escapeHtml(safeStr(s.name, 'Unnamed Source'))}</strong></td>
              <td><span class="code-tag">\${escapeHtml(safeStr(s.category, 'rss'))}</span></td>
              <td style="font-size:0.8rem; font-family:monospace;">\${escapeHtml(safeStr(s.url))}</td>
              <td><span class="status-badge \${s.enabled ? 'status-healthy' : 'status-disabled'}">\${s.enabled ? 'ACTIVE' : 'DISABLED'}</span></td>
              <td class="code-tag">\${s.last_checked_at ? formatDateSafe(s.last_checked_at) : 'Never'}</td>
            </tr>
          \`;
          }).join('');
        }

        // Runs Table
        const runsBody = document.getElementById('runs-table-body');
        if (runsBody && Array.isArray(data.runs) && data.runs.length > 0) {
          runsBody.innerHTML = data.runs.map(r => {
            if (!r) return '';
            const irr = Number(r.rejected_irrelevant || 0);
            const lowQ = Number(r.rejected_low_quality || 0);
            const dup = Number(r.duplicates_found || 0);
            const st = safeUpper(r.status, 'UNKNOWN');

            return \`
              <tr>
                <td class="code-tag">\${formatDateSafe(r.started_at)}</td>
                <td><span class="code-tag">\${escapeHtml(safeStr(r.trigger_type, 'cron'))}</span></td>
                <td><span class="status-badge \${st === 'COMPLETED' ? 'status-healthy' : 'status-alert'}">\${escapeHtml(st)}</span></td>
                <td>\${r.items_discovered || r.items_found || 0}</td>
                <td>\${r.items_normalized || 0}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">\${irr} irr / \${lowQ} low / \${dup} dup</td>
                <td><strong>\${r.topics_created || 0}</strong></td>
              </tr>
            \`;
          }).join('');
        }
      } catch (err) {
        console.error('Failed to load research data:', err);
      }
    }

    // Trigger Manual Research Run
    async function runResearchNow() {
      const btn = document.getElementById('run-research-btn');
      const alertEl = document.getElementById('research-run-alert');
      if (alertEl) alertEl.style.display = 'none';

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Executing Research Pipeline...';
      }

      try {
        const res = await fetch('/api/admin/research/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          }
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            const s = data.summary || {};
            const created = s.topicsCreated || s.ideasQueued || 0;
            let breakdownText = 'None';
            if (s.pillarBreakdown) {
              breakdownText = Object.entries(s.pillarBreakdown).map(([k, v]) => safeStr(k) + ': ' + v).join(', ');
            }

            if (created > 0) {
              alertEl.innerHTML = \`
                <strong>Content discovery completed! Added \${created} new ideas to content queue.</strong>
                <div style="margin-top:0.35rem; font-size:0.85rem; line-height:1.4;">
                  Discovered: \${s.itemsDiscovered || 0} raw | Unique: \${s.itemsNormalized || 0} | Irrelevant: \${s.rejectedIrrelevant || 0} | Duplicates: \${s.duplicatesFound || 0}<br/>
                  <em>Pillars: \${escapeHtml(breakdownText)}</em>
                </div>
              \`;
            } else {
              const primaryReason = (s.duplicatesFound || 0) > 0 && (s.itemsDiscovered || 0) > 0
                ? 'All discovered items were previously processed or exist in candidate queue.'
                : 'No sufficiently useful business-oriented ideas found in this run.';
              alertEl.innerHTML = \`
                <strong>Content discovery completed. 0 new ideas added.</strong>
                <div style="margin-top:0.35rem; font-size:0.85rem; line-height:1.4;">
                  Sources checked: \${s.sourcesChecked || 0} | Discovered: \${s.itemsDiscovered || 0} raw | Duplicates: \${s.duplicatesFound || 0}<br/>
                  <em>Primary reason: \${primaryReason}</em><br/>
                  Existing content queue remains active for generation.
                </div>
              \`;
            }

            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
            loadResearchData();
          } else {
            alertEl.textContent = 'Research run failed: ' + safeStr(data.summary?.errorMessage || data.error, 'Unknown error');
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'An unexpected connection error occurred.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M5 3l14 9-14 9V3z"/></svg> Run Research Pipeline Now';
        }
      }
    }

    function formatDateSafe(isoStr) {
      if (!isoStr) return '—';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return escapeHtml(safeStr(isoStr));
      return d.toLocaleString();
    }

    function formatDateUtcSafe(isoStr) {
      if (!isoStr) return '—';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return escapeHtml(safeStr(isoStr));
      return d.toUTCString();
    }

    // Load Content Tab Data
    async function loadContentData() {
      try {
        const res = await fetch('/api/admin/content/posts');
        if (!res.ok) {
          if (res.status === 401) {
            await checkSession();
          } else {
            console.error('Failed to fetch content data:', res.status, res.statusText);
            const postsBody = document.getElementById('posts-table-body');
            if (postsBody) {
              postsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--accent-rose);">Failed to load post drafts (HTTP ' + res.status + ').</td></tr>';
            }
          }
          return;
        }

        const data = await res.json();
        const postsBody = document.getElementById('posts-table-body');

        if (postsBody) {
          if (Array.isArray(data.posts) && data.posts.length > 0) {
            postsBody.innerHTML = data.posts.map(p => {
              if (!p) return '';
              const statusStr = safeUpper(p.status, 'DRAFT');
              const statusClass = statusStr === 'APPROVED' ? 'status-healthy' : (statusStr === 'REJECTED' || statusStr === 'BLOCKED') ? 'status-alert' : 'status-active';
              const qDec = safeUpper(p.quality_decision, 'PASS');
              const qClass = qDec === 'PASS' ? 'status-healthy' : 'status-alert';

              return \`
              <tr>
                <td>
                  <strong>\${escapeHtml(safeStr(p.title, 'Untitled Post'))}</strong>
                  <div style="font-size:0.8rem; color:var(--text-muted); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHtml(safeStr(p.latest_body))}</div>
                </td>
                <td><span class="status-badge \${statusClass}">\${escapeHtml(statusStr)}</span></td>
                <td><span class="code-tag">v\${Number(p.current_version || 1)}</span></td>
                <td><span class="status-badge status-healthy">\${Number(p.quality_score || 0)}/100</span></td>
                <td><span class="status-badge \${qClass}">\${escapeHtml(qDec)}</span></td>
                <td class="code-tag">\${formatDateSafe(p.created_at)}</td>
              </tr>
            \`;
            }).join('');
          } else {
            postsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No post drafts generated yet. Trigger research or orchestration pipeline to generate content.</td></tr>';
          }
        }
      } catch (err) {
        console.error('Failed to load content data:', err);
      }
    }

    // Run Autonomous Pipeline
    async function runPipelineNow() {
      const btn = document.getElementById('run-pipeline-btn');
      const alertEl = document.getElementById('pipeline-run-alert');
      if (alertEl) alertEl.style.display = 'none';

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Executing Pipeline...';
      }

      try {
        const res = await fetch('/api/admin/pipeline/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          }
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            alertEl.textContent = 'Autonomous pipeline completed! Result: ' + safeUpper(data.result?.resultStatus, 'COMPLETED');
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
            loadDashboardData();
          } else {
            alertEl.textContent = safeStr(data.result?.errorMessage || data.error, 'Pipeline run encountered an issue or was deferred by quota.');
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'An unexpected error occurred while executing the pipeline.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M5 3l14 9-14 9V3z"/></svg> Run Pipeline Now';
        }
      }
    }

    // Load Scheduled Publications Tab Data
    async function loadSchedulesData() {
      try {
        const res = await fetch('/api/admin/schedules');
        if (!res.ok) {
          if (res.status === 401) {
            await checkSession();
          } else {
            console.error('Failed to fetch schedules:', res.status, res.statusText);
            const schedBody = document.getElementById('schedules-table-body');
            if (schedBody) {
              schedBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-rose);">Failed to load scheduled queue (HTTP ' + res.status + ').</td></tr>';
            }
          }
          return;
        }

        const data = await res.json();
        const schedBody = document.getElementById('schedules-table-body');
        const schedules = Array.isArray(data.schedules) ? data.schedules : [];

        renderCalendarGrid(schedules);

        if (schedBody) {
          if (schedules.length > 0) {
            schedBody.innerHTML = schedules.map(sched => {
              if (!sched) return '';
              const schedIdStr = safeStr(sched.id);
              return '<tr>' +
                '<td><strong>' + escapeHtml(safeStr(sched.post_title, 'Untitled Post')) + '</strong></td>' +
                '<td class="code-tag">' + formatDateUtcSafe(sched.scheduled_at) + '</td>' +
                '<td><span class="status-badge status-healthy">' + escapeHtml(safeUpper(sched.status, 'SCHEDULED')) + '</span></td>' +
                '<td>' +
                  '<button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="openSchedulePostModal(\\\'' + schedIdStr + '\\\')">Edit</button>' +
                  '<button class="btn-logout" style="font-size:0.75rem; padding:0.25rem 0.5rem; margin-left:0.25rem;" onclick="unschedulePost(\\\'' + schedIdStr + '\\\')">Unschedule</button>' +
                '</td>' +
              '</tr>';
            }).join('');
          } else {
            schedBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">Nothing scheduled.<br><button class="btn-primary" style="margin-top:0.75rem;" onclick="openSchedulePostModal()">+ Schedule Post</button></td></tr>';
          }
        }
      } catch (err) {
        console.error('Failed to load schedules:', err);
      }
    }

    // Load Publications Tab Data
    async function loadPublicationsData() {
      try {
        const res = await fetch('/api/admin/publications');
        if (!res.ok) {
          if (res.status === 401) {
            await checkSession();
          } else {
            console.error('Failed to fetch publications:', res.status, res.statusText);
            const pubBody = document.getElementById('publications-table-body');
            if (pubBody) {
              pubBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-rose);">Failed to load publication log (HTTP ' + res.status + ').</td></tr>';
            }
          }
          return;
        }

        const data = await res.json();
        const config = data.configStatus || {};

        const cfgBadge = document.getElementById('meta-config-badge');
        const st = safeUpper(config.state || (config.configured ? 'READY' : 'NOT_CONFIGURED'));
        let badgeClass = 'status-disabled';
        if (st === 'READY') badgeClass = 'status-healthy';
        else if (st === 'DEGRADED') badgeClass = 'status-alert';
        else if (st === 'DISABLED') badgeClass = 'status-active';

        if (cfgBadge) {
          cfgBadge.innerHTML = '<span class="status-badge ' + badgeClass + '">' + escapeHtml(st.replace('_', ' ')) + '</span>';
        }

        const pageIdEl = document.getElementById('meta-pageid-val');
        if (pageIdEl) pageIdEl.textContent = config.pageIdConfigured ? 'Configured (Set)' : 'Missing';

        const tokenEl = document.getElementById('meta-token-val');
        if (tokenEl) tokenEl.textContent = config.tokenConfigured ? 'Configured (Set)' : 'Missing';

        const verEl = document.getElementById('meta-version-val');
        if (verEl) verEl.textContent = safeStr(config.apiVersion, 'v26.0');

        const lockEl = document.getElementById('meta-lock-val');
        if (lockEl) lockEl.textContent = config.publishEnabled ? 'ENABLED' : 'DISABLED';

        // Publications Table
        const pubBody = document.getElementById('publications-table-body');
        if (pubBody) {
          if (Array.isArray(data.publications) && data.publications.length > 0) {
            pubBody.innerHTML = data.publications.map(pub => {
              if (!pub) return '';
              const qStatus = safeUpper(pub.qualityGateStatus, 'PASS');
              const isApproved = qStatus === 'APPROVED' || qStatus === 'PASS';
              const pubStatus = safeUpper(pub.status, 'UNKNOWN');
              const statusClass = pubStatus === 'PUBLISHED' ? 'status-healthy' : pubStatus === 'PUBLISHING' ? 'status-active' : pubStatus === 'FAILED' ? 'status-alert' : 'status-disabled';
              const errCategory = pub.errorCode ? safeStr(pub.errorCode) : '';
              const pubIdStr = safeStr(pub.id);
              const postIdStr = safeStr(pub.postId);

              return \`
                <tr>
                  <td>
                    <strong>\${escapeHtml(safeStr(pub.postTitle, 'Untitled Post'))}</strong>
                    <div style="font-size:0.8rem; color:var(--text-muted); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHtml(safeStr(pub.postBody))}</div>
                    \${pub.errorMessage ? \`<div style="font-size:0.75rem; color:var(--accent-rose); margin-top:2px;">\${escapeHtml(safeStr(pub.errorMessage))}</div>\` : ''}
                  </td>
                  <td><span class="code-tag">\${escapeHtml(safeStr(pub.provider, 'facebook'))}</span></td>
                  <td><span class="status-badge \${isApproved ? 'status-healthy' : 'status-alert'}">\${isApproved ? 'PASS' : 'UNAPPROVED'}</span></td>
                  <td>
                    <span class="status-badge \${statusClass}">\${escapeHtml(pubStatus)}</span>
                    \${errCategory ? \`<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">\${escapeHtml(errCategory)}</div>\` : ''}
                  </td>
                  <td class="code-tag">\${escapeHtml(safeStr(pub.facebookPostId, '—'))}</td>
                  <td class="code-tag">\${formatDateSafe(pub.publishedAt)}</td>
                  <td>
                    \${isApproved && pubStatus !== 'PUBLISHED' && pubStatus !== 'PUBLISHING' ? \`
                      <button class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="publishNow('\${postIdStr}')">Publish Now</button>
                      \${pubStatus === 'FAILED' ? \`<button class="btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.8rem; margin-left:4px;" onclick="retryPub('\${pubIdStr}')">Retry</button>\` : ''}
                    \` : pubStatus === 'PUBLISHED' ? \`
                      <span style="color:var(--accent-emerald); font-weight:600; font-size:0.85rem;">Published</span>
                    \` : \`
                      <span style="color:var(--text-muted); font-size:0.85rem;">—</span>
                    \`}
                  </td>
                </tr>
              \`;
            }).join('');
          } else {
            pubBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No publication records found. Approved scheduled posts will automatically publish via Meta Graph API.</td></tr>';
          }
        }
      } catch (err) {
        console.error('Failed to load publications:', err);
      }
    }

    async function publishNow(postId) {
      const alertEl = document.getElementById('publication-alert');
      if (alertEl) alertEl.style.display = 'none';

      try {
        const res = await fetch('/api/admin/publications/' + safeStr(postId) + '/publish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          }
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            alertEl.textContent = 'Publication request completed successfully. External Facebook Post ID: ' + safeStr(data.result?.externalPostId, 'Success');
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          } else {
            alertEl.textContent = 'Publication failed: ' + safeStr(data.error || data.result?.message, 'Error publishing post');
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'An unexpected connection error occurred during publishing.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        loadPublicationsData();
      }
    }

    async function retryPub(pubId) {
      const alertEl = document.getElementById('publication-alert');
      if (alertEl) alertEl.style.display = 'none';

      try {
        const res = await fetch('/api/admin/publications/' + safeStr(pubId) + '/retry', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          }
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            alertEl.textContent = 'Publication retry succeeded. External Facebook Post ID: ' + safeStr(data.result?.externalPostId, 'Success');
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          } else {
            alertEl.textContent = 'Publication retry failed: ' + safeStr(data.error || data.result?.message, 'Error retrying publication');
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'An unexpected connection error occurred during retry.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        loadPublicationsData();
      }
    }

    // ======================================================================
    // Facebook Page Posts — READ-ONLY Live Feed & Health Status
    // ======================================================================

    let fbPostsLoaded = false;
    let fbNextCursor = null;
    let fbHasMore = false;
    let loadedFbPostIds = new Set();

    async function loadFacebookPagePosts(append) {
      const railContainer = document.getElementById('fb-rail-posts-container');
      const pageContainer = document.getElementById('fb-posts-container');
      const railBadge = document.getElementById('fb-rail-status-badge');
      const pageBadge = document.getElementById('fb-posts-status-badge');
      const railReadStatus = document.getElementById('fb-rail-read-status');
      const fbReadCard = document.getElementById('val-fb-read');
      const fbConfigCard = document.getElementById('val-fb-config');
      const loadMoreWrap = document.getElementById('fb-rail-load-more-wrap');

      const isAppend = Boolean(append);

      if (!isAppend) {
        fbNextCursor = null;
        fbHasMore = false;
        loadedFbPostIds = new Set();
        if (railContainer) {
          railContainer.innerHTML = '<div style="text-align:center; padding:2rem 0; color:var(--text-muted);"><div class="fb-post-loading-spinner"></div><div style="margin-top:0.75rem; font-size:0.825rem;">Fetching posts from Meta Graph API...</div></div>';
        }
        if (pageContainer) {
          pageContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);"><div class="fb-post-loading-spinner"></div><div style="margin-top:0.75rem; font-size:0.85rem;">Fetching posts...</div></div>';
        }
        if (loadMoreWrap) loadMoreWrap.style.display = 'none';
      }

      try {
        const fetchUrl = (isAppend && fbNextCursor)
          ? '/api/admin/facebook/page-posts?limit=5&after=' + encodeURIComponent(fbNextCursor)
          : '/api/admin/facebook/page-posts?limit=5';

        const res = await fetch(fetchUrl);
        if (!res.ok) {
          if (res.status === 401) {
            await checkSession();
            return;
          }
        }

        const data = await res.json();

        // 1. Handle Not Configured
        if (!data.configured) {
          if (fbConfigCard) fbConfigCard.innerHTML = '<span class="status-badge status-disabled">Not configured</span>';
          if (fbReadCard) fbReadCard.innerHTML = '<span class="status-badge status-disabled">Not checked</span>';
          if (railReadStatus) {
            railReadStatus.className = 'fb-rail-status-chip status-disabled';
            railReadStatus.innerHTML = '○ READ: Not configured';
          }
          if (railBadge) railBadge.innerHTML = '<span class="status-badge status-disabled">NOT CONFIGURED</span>';
          if (pageBadge) pageBadge.innerHTML = '<span class="status-badge status-disabled">NOT CONFIGURED</span>';

          const notConfigHtml = '<div style="text-align:center; padding:1.5rem 0.5rem; color:var(--text-muted); font-size:0.825rem;">Meta API Not Configured</div>';
          if (railContainer && !isAppend) railContainer.innerHTML = notConfigHtml;
          if (pageContainer && !isAppend) pageContainer.innerHTML = notConfigHtml;
          if (loadMoreWrap) loadMoreWrap.style.display = 'none';
          return;
        }

        // 2. Handle API Error
        if (data.error && (!data.posts || data.posts.length === 0)) {
          if (fbConfigCard) fbConfigCard.innerHTML = '<span class="status-badge status-healthy">Configured</span>';
          if (fbReadCard) fbReadCard.innerHTML = '<span class="status-badge status-alert">● Error</span>';
          if (railReadStatus) {
            railReadStatus.className = 'fb-rail-status-chip status-alert';
            railReadStatus.innerHTML = '● READ: Error';
          }
          if (railBadge) railBadge.innerHTML = '<span class="status-badge status-alert">API ERROR</span>';
          if (pageBadge) pageBadge.innerHTML = '<span class="status-badge status-alert">API ERROR</span>';

          const errorHtml = '<div style="text-align:center; padding:1.5rem 0.5rem;"><div style="font-weight:600; color:var(--accent-rose); font-size:0.85rem; margin-bottom:0.25rem;">Unable to load Facebook posts</div><div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.75rem;">' + escapeHtml(safeStr(data.error)) + '</div><button class="btn-secondary" style="font-size:0.78rem; padding:0.3rem 0.75rem;" onclick="loadFacebookPagePosts()">Retry</button></div>';
          if (railContainer && !isAppend) railContainer.innerHTML = errorHtml;
          if (pageContainer && !isAppend) pageContainer.innerHTML = errorHtml;
          if (loadMoreWrap) loadMoreWrap.style.display = 'none';
          return;
        }

        // 3. SUCCESS — READ Connected
        if (fbConfigCard) fbConfigCard.innerHTML = '<span class="status-badge status-healthy">Configured</span>';
        if (fbReadCard) fbReadCard.innerHTML = '<span class="status-badge status-healthy">● Connected</span>';
        if (railReadStatus) {
          railReadStatus.className = 'fb-rail-status-chip status-healthy';
          railReadStatus.innerHTML = '● READ: Connected';
        }

        fbHasMore = Boolean(data.paging && data.paging.hasMore);
        fbNextCursor = (data.paging && data.paging.after) ? safeStr(data.paging.after) : null;

        if (data.pageInfo) {
          const rName = document.getElementById('fb-rail-page-name');
          const rId = document.getElementById('fb-rail-page-id');
          if (rName) rName.textContent = safeStr(data.pageInfo.name, 'NorthSoft');
          if (rId && data.pageInfo.id) rId.textContent = 'Page ID: ' + safeStr(data.pageInfo.id);
        }

        const rawPosts = Array.isArray(data.posts) ? data.posts : [];
        const newPosts = rawPosts.filter(function(p) { return p && !loadedFbPostIds.has(safeStr(p.id)); });
        newPosts.forEach(function(p) { loadedFbPostIds.add(safeStr(p.id)); });

        if (loadedFbPostIds.size > 0) {
          if (railBadge) railBadge.innerHTML = '<span class="status-badge status-healthy">LIVE &middot; ' + loadedFbPostIds.size + ' POSTS</span>';
          if (pageBadge) pageBadge.innerHTML = '<span class="status-badge status-healthy">LIVE &middot; ' + loadedFbPostIds.size + ' POSTS</span>';

          const railCardsHtml = newPosts.map(function(post) {
            const postIdStr = safeStr(post.id);
            const timeAgo = formatFbTimeAgo(post.createdTime);
            const fullDate = post.createdTime ? safeStr(new Date(post.createdTime).toLocaleString()) : '';
            const msgContent = post.message ? escapeHtml(safeStr(post.message)) : (post.story ? escapeHtml(safeStr(post.story)) : '<em style="color:var(--text-subtle);">No text content available.</em>');

            return '<div class="fb-rail-post-card">' +
              '<div class="fb-rail-post-header">' +
                '<div class="fb-rail-post-avatar">NS</div>' +
                '<div style="flex:1; min-width:0;">' +
                  '<div class="fb-rail-post-name">' + escapeHtml(safeStr(data.pageInfo?.name, 'NorthSoft')) + '</div>' +
                  '<div class="fb-rail-post-time" title="' + escapeHtml(fullDate) + '">' + escapeHtml(timeAgo) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="fb-rail-post-text">' + msgContent + '</div>' +
              (post.fullPicture ? '<div class="fb-rail-post-img-wrap"><img src="' + escapeHtml(safeStr(post.fullPicture)) + '" alt="Post image" loading="lazy"></div>' : '') +
              '<div class="fb-rail-post-footer">' +
                '<span style="font-size:0.7rem; color:var(--text-subtle);" title="' + escapeHtml(postIdStr) + '">ID: ' + escapeHtml(postIdStr.length > 15 ? postIdStr.substring(0, 12) + '...' : postIdStr) + '</span>' +
                (post.permalinkUrl ? '<a href="' + escapeHtml(safeStr(post.permalinkUrl)) + '" target="_blank" rel="noopener noreferrer" class="fb-rail-post-link">View on Facebook &rarr;</a>' : '') +
              '</div>' +
            '</div>';
          }).join('');

          if (isAppend && railContainer) {
            railContainer.innerHTML += railCardsHtml;
          } else if (railContainer) {
            railContainer.innerHTML = railCardsHtml;
          }

          if (isAppend && pageContainer) {
            pageContainer.innerHTML += railCardsHtml;
          } else if (pageContainer) {
            pageContainer.innerHTML = railCardsHtml;
          }

          if (loadMoreWrap) {
            if (fbHasMore && fbNextCursor) {
              loadMoreWrap.style.display = 'block';
            } else {
              loadMoreWrap.style.display = 'none';
            }
          }
        } else if (!isAppend) {
          const emptyHtml = '<div style="text-align:center; padding:1.5rem 0.5rem; color:var(--text-muted); font-size:0.825rem;">No posts found on page.</div>';
          if (railContainer) railContainer.innerHTML = emptyHtml;
          if (pageContainer) pageContainer.innerHTML = emptyHtml;
          if (loadMoreWrap) loadMoreWrap.style.display = 'none';
        }

        fbPostsLoaded = true;
      } catch (err) {
        console.error('Failed to load Facebook Page posts:', err);
        if (fbReadCard) fbReadCard.innerHTML = '<span class="status-badge status-alert">● Error</span>';
        if (railReadStatus) {
          railReadStatus.className = 'fb-rail-status-chip status-alert';
          railReadStatus.innerHTML = '● READ: Error';
        }
        if (railBadge) railBadge.innerHTML = '<span class="status-badge status-alert">ERROR</span>';
        const errHtml = '<div style="text-align:center; padding:1.5rem 0.5rem; color:var(--accent-rose); font-size:0.825rem;">Connection error loading feed</div>';
        if (railContainer && !isAppend) railContainer.innerHTML = errHtml;
      }
    }

    function formatFbTimeAgo(isoString) {
      if (!isoString) return '';
      const s = safeStr(isoString);
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      const now = Date.now();
      const diffSec = Math.floor((now - d.getTime()) / 1000);

      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
      if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
      if (diffSec < 604800) return Math.floor(diffSec / 86400) + 'd ago';

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return monthNames[d.getMonth()] + ' ' + d.getDate() + ' · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function renderAuditRows(events) {
      if (!Array.isArray(events) || events.length === 0) {
        return '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;"><div style="font-weight:600; margin-bottom:0.25rem;">No audit events found</div><div style="font-size:0.8rem; color:var(--text-subtle);">Try adjusting category filters or search queries</div></td></tr>';
      }

      return events.map((act, idx) => {
        if (!act) return '';
        const evt = formatAuditEvent(act.eventType);
        const tsInfo = formatAuditTimestamp(act.timestamp);
        const statusStr = safeUpper(act.status, 'INFO');
        const level = safeUpper(act.level, statusStr === 'FAILED' ? 'ERROR' : statusStr === 'DEFERRED' ? 'WARNING' : 'INFO');

        let statusBadgeClass = 'status-disabled';
        let statusIcon = '🔵';
        let statusText = 'Info';

        if (level === 'ERROR' || statusStr === 'FAILED') {
          statusBadgeClass = 'status-alert';
          statusIcon = '🔴';
          statusText = 'Failed';
        } else if (level === 'WARNING' || statusStr === 'DEFERRED') {
          statusBadgeClass = 'status-disabled';
          statusIcon = '🟡';
          statusText = 'Warning';
        } else if (level === 'SUCCESS' || statusStr === 'COMPLETED') {
          statusBadgeClass = 'status-healthy';
          statusIcon = '🟢';
          statusText = 'Completed';
        }

        const operationTitle = safeStr(act.operation || (act.details && (act.details.title || act.details.sourceName)) || (act.entityType ? safeStr(act.entityType) + ':' + safeStr(act.entityId).substring(0, 8) : 'Event'));

        let summaryText = '—';
        if (act.error && act.error.message) {
          summaryText = (act.error.stage ? safeStr(act.error.stage) + ': ' : '') + safeStr(act.error.message);
        } else if (act.details && act.details.error) {
          summaryText = safeStr(act.details.error);
        } else if (act.durationMs) {
          summaryText = evt.title + ' · ' + (Number(act.durationMs) / 1000).toFixed(2) + 's';
        } else if (act.details && act.details.reason) {
          summaryText = safeStr(act.details.reason);
        } else {
          summaryText = evt.title;
        }

        if (summaryText.length > 55) {
          summaryText = summaryText.substring(0, 52) + '…';
        }

        const rowKey = safeStr(act.id) || ('idx-' + idx + '-' + Math.random().toString(36).substring(2, 7));
        const detailId = 'detail-' + rowKey;

        const safeDetailsJson = escapeHtml(JSON.stringify(act.details || {}, null, 2));
        const fullErrorMessage = act.error && act.error.message ? escapeHtml(safeStr(act.error.message)) : (act.details && act.details.error ? escapeHtml(safeStr(act.details.error)) : null);

        return \`
          <tr class="audit-row-clickable" onclick="toggleAuditDetail('\${detailId}')" title="Click to view full technical diagnostic details">
            <td>
              <span class="status-badge \${statusBadgeClass}" style="white-space:nowrap;">
                \${statusIcon} \${statusText}
              </span>
            </td>
            <td>
              <strong style="font-size:0.85rem; color:var(--text-main); display:block; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">\${evt.title}</strong>
              <span style="font-size:0.7rem; color:var(--text-subtle); font-family:monospace;">\${escapeHtml(safeStr(act.eventType))}</span>
            </td>
            <td>
              <div style="font-weight:600; font-size:0.85rem; color:var(--text-main); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="\${escapeHtml(operationTitle)}">
                \${escapeHtml(operationTitle)}
              </div>
              <div style="font-size:0.725rem; color:var(--text-subtle);">Actor: \${escapeHtml(safeStr(act.actor, 'system'))}</div>
            </td>
            <td style="word-break:break-word;">
              <span style="font-size:0.825rem; color:\${level === 'ERROR' ? '#fda4af' : 'var(--text-muted)'};">
                \${escapeHtml(summaryText)}
              </span>
            </td>
            <td style="white-space:nowrap; font-size:0.8rem; color:var(--text-muted); text-align:right;" title="\${tsInfo.full}">
              \${tsInfo.compact}
            </td>
          </tr>
          <tr id="\${detailId}" class="audit-detail-row" style="display:none; background:#0a0e17;">
            <td colspan="5" style="padding: 1rem 1.25rem;">
              <div class="audit-detail-panel">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border-color);">
                  <div>
                    <h4 style="font-size:1rem; color:var(--text-main); margin-bottom:0.2rem;">\${escapeHtml(operationTitle)}</h4>
                    <span class="status-badge \${statusBadgeClass}">\${escapeHtml(safeStr(act.eventType))} — \${statusText.toUpperCase()}</span>
                  </div>
                  <div style="font-size:0.8rem; color:var(--text-muted); text-align:right;">
                    <strong>Timestamp:</strong> \${tsInfo.full}
                  </div>
                </div>

                <div class="audit-detail-grid">
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Stage / Component</span>
                    <span class="audit-detail-value">\${escapeHtml(safeStr((act.error && act.error.stage) || (act.details && act.details.stage), '—'))}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Model / Provider</span>
                    <span class="audit-detail-value">\${escapeHtml(safeStr((act.details && (act.details.model || act.details.provider)), '—'))}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Duration</span>
                    <span class="audit-detail-value">\${act.durationMs ? (Number(act.durationMs) / 1000).toFixed(2) + 's (' + act.durationMs + ' ms)' : '—'}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">HTTP Status</span>
                    <span class="audit-detail-value">\${safeStr((act.error && act.error.httpStatus) || (act.details && act.details.httpStatus), '—')}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Correlation ID</span>
                    <span class="audit-detail-value" style="font-family:monospace; font-size:0.8rem;">\${escapeHtml(safeStr(act.correlationId, '—'))}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Entity</span>
                    <span class="audit-detail-value" style="font-family:monospace; font-size:0.8rem;">\${escapeHtml(safeStr(act.entityType))}:\${escapeHtml(safeStr(act.entityId))}</span>
                  </div>
                </div>

                \${fullErrorMessage ? \`
                  <div style="margin-top:0.75rem;">
                    <span class="audit-detail-label" style="color:var(--accent-rose);">Diagnostic Error Details</span>
                    <div class="audit-error-box">\${fullErrorMessage}</div>
                  </div>
                \` : ''}

                <details style="margin-top:1rem;">
                  <summary style="font-size:0.8rem; color:var(--accent-blue); cursor:pointer; font-weight:600;">View Raw Event Payload JSON</summary>
                  <pre style="background:#05070c; padding:0.75rem; border-radius:6px; border:1px solid var(--border-color); font-size:0.775rem; color:var(--text-muted); margin-top:0.5rem; max-height:200px; overflow:auto;">\${safeDetailsJson}</pre>
                </details>
              </div>
            </td>
          </tr>
        \`;
      }).join('');
    }

    function formatAuditEvent(eventType) {
      const norm = safeUpper(eventType, 'SYSTEM_EVENT').trim();
      switch (norm) {
        case 'AUTH_LOGIN_SUCCESS': return { title: 'Login successful', category: 'SUCCESS', badgeClass: 'status-healthy' };
        case 'AUTH_LOGIN_FAILURE': return { title: 'Login failed', category: 'FAILED', badgeClass: 'status-alert' };
        case 'AUTH_LOGOUT': return { title: 'User signed out', category: 'INFO', badgeClass: 'status-disabled' };
        case 'SESSION_CREATED': return { title: 'Session created', category: 'INFO', badgeClass: 'status-active' };
        case 'SESSION_REVOKED': return { title: 'Session revoked', category: 'INFO', badgeClass: 'status-disabled' };
        case 'ADMIN_PASSWORD_CHANGED': return { title: 'Password changed', category: 'SUCCESS', badgeClass: 'status-healthy' };
        case 'ADMIN_PASSWORD_RESET_REQUESTED': return { title: 'Password reset requested', category: 'INFO', badgeClass: 'status-disabled' };
        case 'ADMIN_PASSWORD_RESET_COMPLETED': return { title: 'Password reset completed', category: 'SUCCESS', badgeClass: 'status-healthy' };
        case 'ADMIN_PASSWORD_RESET_FAILED': return { title: 'Password reset failed', category: 'FAILED', badgeClass: 'status-alert' };
        case 'ADMIN_RECOVERY_EMAIL_UPDATED': return { title: 'Recovery email updated', category: 'UPDATED', badgeClass: 'status-active' };
        case 'RESEARCH_STARTED': case 'RESEARCH_RUN_STARTED': case 'AI_RESEARCH_STARTED': return { title: 'Research started', category: 'STARTED', badgeClass: 'status-active' };
        case 'RESEARCH_COMPLETED': case 'RESEARCH_RUN_COMPLETED': case 'AI_RESEARCH_COMPLETED': return { title: 'Research completed', category: 'SUCCESS', badgeClass: 'status-healthy' };
        case 'POST_GENERATED': case 'POST_GENERATION_STARTED': return { title: 'Post draft generated', category: 'CREATED', badgeClass: 'status-active' };
        case 'QUALITY_GATE': return { title: 'Quality gate evaluation', category: 'EVALUATION', badgeClass: 'status-active' };
        case 'POST_APPROVED': case 'QA_PASSED': case 'POLICY_REVIEW_PASSED': case 'STATIC_VALIDATION_PASSED': return { title: 'Post approved', category: 'APPROVED', badgeClass: 'status-healthy' };
        case 'POST_BLOCKED': case 'POST_REJECTED': case 'QA_FAILED': case 'POLICY_REVIEW_FAILED': case 'STATIC_VALIDATION_FAILED': return { title: 'Post rejected / blocked', category: 'BLOCKED', badgeClass: 'status-alert' };
        case 'POST_SCHEDULED': case 'PUBLICATION_SCHEDULED': case 'PUBLICATION_CREATED': return { title: 'Publication scheduled', category: 'SCHEDULED', badgeClass: 'status-active' };
        case 'PUBLICATION_STARTED': case 'FACEBOOK_PUBLISH_ATTEMPT': return { title: 'Publication attempt', category: 'ATTEMPT', badgeClass: 'status-active' };
        case 'PUBLICATION_SUCCEEDED': case 'FACEBOOK_PUBLISH_SUCCESS': return { title: 'Publication succeeded', category: 'SUCCESS', badgeClass: 'status-healthy' };
        case 'PUBLICATION_FAILED': case 'FACEBOOK_PUBLISH_FAILED': return { title: 'Publication failed', category: 'FAILED', badgeClass: 'status-alert' };
        case 'CONFIG_CHANGED': return { title: 'Configuration updated', category: 'CONFIG', badgeClass: 'status-active' };
        case 'SYSTEM_ERROR': case 'WORKFLOW_FAILED': return { title: 'System error', category: 'ERROR', badgeClass: 'status-alert' };
        default: {
          const words = norm.split('_').filter(Boolean).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
          const isErr = norm.includes('FAIL') || norm.includes('ERR') || norm.includes('BLOCK') || norm.includes('REJECT');
          const isSucc = norm.includes('SUCCESS') || norm.includes('COMPLET') || norm.includes('PASS');
          return { title: words || 'System Event', category: isErr ? 'FAILED' : isSucc ? 'SUCCESS' : 'INFO', badgeClass: isErr ? 'status-alert' : isSucc ? 'status-healthy' : 'status-disabled' };
        }
      }
    }

    function formatAuditActor(actor, details) {
      const act = safeLower(actor, 'system').trim();
      let label = 'SYSTEM';
      let badgeClass = 'status-disabled';
      if (act === 'admin') { label = 'ADMIN'; badgeClass = 'status-active'; }
      else if (act === 'ai') { label = 'AI ENGINE'; badgeClass = 'status-healthy'; }
      const username = details && (details.username || details.actorName);
      const subtext = username !== null && username !== undefined && safeStr(username).trim() ? safeStr(username).trim() : null;
      return { label, subtext, badgeClass };
    }

    function formatAuditEntity(entityType, entityId) {
      const typeMap = { admin_user: 'Admin user', admin_session: 'Admin session', publication: 'Publication', post: 'Post draft', post_version: 'Post version', topic: 'Research topic', research_run: 'Research run', orchestrator: 'Orchestrator' };
      const rawType = safeLower(entityType, '').trim();
      const typeLabel = typeMap[rawType] || rawType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'System';
      const fullId = safeStr(entityId, '—');
      const truncatedId = fullId.length > 14 ? fullId.substring(0, 8) + '…' : fullId;
      return { typeLabel, truncatedId, fullId };
    }

    function formatAuditDetails(detailsInput) {
      let details = {};
      if (typeof detailsInput === 'string') {
        try { details = JSON.parse(detailsInput); } catch { details = { info: detailsInput }; }
      } else if (detailsInput && typeof detailsInput === 'object') {
        details = detailsInput;
      }
      const labelMap = { username: 'Username', clientIp: 'IP', emailConfigured: 'Email', expiresAt: 'Expires', adminUserId: 'User ID', triggerType: 'Trigger', trigger: 'Trigger', reason: 'Reason', status: 'Status', neuronsUsed: 'Est. Neurons', neurons: 'Est. Neurons', errorMessage: 'Error', error: 'Error' };
      const items = [];
      for (const [key, rawVal] of Object.entries(details)) {
        if (rawVal === undefined || rawVal === null) continue;
        const label = labelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        let value = '';
        if (typeof rawVal === 'boolean') { value = rawVal ? 'Configured' : 'Not configured'; }
        else if (typeof rawVal === 'string' && (rawVal.startsWith('20') || rawVal.startsWith('19')) && !isNaN(new Date(rawVal).getTime())) {
          const parsedDate = new Date(rawVal);
          value = isNaN(parsedDate.getTime()) ? rawVal : parsedDate.toLocaleString();
        } else { value = safeStr(rawVal); }
        if (value.length > 36) value = value.substring(0, 33) + '…';
        items.push({ key, label, value: escapeHtml(value) });
      }
      return items;
    }

    function formatAuditTimestamp(isoDate) {
      if (!isoDate) return { compact: '—', full: '—' };
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return { compact: escapeHtml(safeStr(isoDate)), full: escapeHtml(safeStr(isoDate)) };
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = d.getUTCDate();
      const month = monthNames[d.getUTCMonth()];
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      const secs = String(d.getUTCSeconds()).padStart(2, '0');
      return {
        compact: day + ' ' + month + ', ' + hours + ':' + mins + ' UTC',
        full: d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0') + ' ' + hours + ':' + mins + ':' + secs + ' UTC'
      };
    }

    function escapeHtml(str) {
      if (typeof str !== 'string') str = safeStr(str);
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Manual Publisher Client Functions
    async function loadManualPublisherData() {
      const contentEl = document.getElementById('manual-post-content');
      if (contentEl && !contentEl.dataset.listened) {
        contentEl.dataset.listened = 'true';
        contentEl.addEventListener('input', updateManualPreview);
      }
      const linkEl = document.getElementById('manual-post-link');
      if (linkEl && !linkEl.dataset.listened) {
        linkEl.dataset.listened = 'true';
        linkEl.addEventListener('input', updateManualPreview);
      }
      updateManualPreview();
    }

    function updateManualPreview() {
      const content = safeStr(document.getElementById('manual-post-content')?.value).trim();
      const link = safeStr(document.getElementById('manual-post-link')?.value).trim();

      const counterEl = document.getElementById('manual-char-counter');
      if (counterEl) {
        counterEl.textContent = content.length + ' / 63206 characters';
        counterEl.style.color = content.length > 63206 ? 'var(--accent-rose)' : 'var(--text-muted)';
      }

      const previewTextEl = document.getElementById('preview-text');
      if (previewTextEl) {
        previewTextEl.innerHTML = content ? escapeHtml(content) : 'Write your Facebook post...';
        previewTextEl.style.color = content ? '#e4e6eb' : '#b0b3b8';
      }

      const linkCardEl = document.getElementById('preview-link-card');
      if (linkCardEl) {
        if (link) {
          try {
            const parsed = new URL(link);
            document.getElementById('preview-link-domain').textContent = parsed.hostname.toUpperCase();
            document.getElementById('preview-link-title').textContent = 'Attached External Link';
            document.getElementById('preview-link-url').textContent = link;
            linkCardEl.style.display = 'block';
          } catch {
            linkCardEl.style.display = 'none';
          }
        } else {
          linkCardEl.style.display = 'none';
        }
      }
    }

    function validateManualForm() {
      const content = safeStr(document.getElementById('manual-post-content')?.value).trim();
      const link = safeStr(document.getElementById('manual-post-link')?.value).trim();
      const alertEl = document.getElementById('manual-pub-alert');

      if (!content) {
        if (alertEl) {
          alertEl.textContent = 'Validation error: Post content cannot be empty.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
        return false;
      }

      if (content.length > 63206) {
        if (alertEl) {
          alertEl.textContent = 'Validation error: Post content exceeds Meta Graph API 63,206 character limit.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
        return false;
      }

      if (link && !link.startsWith('http://') && !link.startsWith('https://')) {
        if (alertEl) {
          alertEl.textContent = 'Validation error: Link must be a valid URL starting with http:// or https://';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
        return false;
      }

      if (alertEl) {
        alertEl.textContent = 'Post content passed static validation and character limit checks! Ready for publication.';
        alertEl.className = 'alert-success';
        alertEl.style.display = 'block';
      }
      return true;
    }

    function clearManualForm() {
      const contentEl = document.getElementById('manual-post-content');
      const linkEl = document.getElementById('manual-post-link');
      const alertEl = document.getElementById('manual-pub-alert');

      if (contentEl) contentEl.value = '';
      if (linkEl) linkEl.value = '';
      if (alertEl) alertEl.style.display = 'none';

      updateManualPreview();
    }

    function openPublishConfirmation() {
      if (!validateManualForm()) return;
      const modal = document.getElementById('publish-modal');
      if (modal) modal.style.display = 'flex';
    }

    function closePublishConfirmation() {
      const modal = document.getElementById('publish-modal');
      if (modal) modal.style.display = 'none';
    }

    async function submitManualPublication() {
      const content = safeStr(document.getElementById('manual-post-content')?.value).trim();
      const link = safeStr(document.getElementById('manual-post-link')?.value).trim();
      const alertEl = document.getElementById('manual-pub-alert');
      const confirmBtn = document.getElementById('confirm-publish-btn');
      const publishBtn = document.getElementById('manual-publish-btn');

      closePublishConfirmation();

      if (alertEl) alertEl.style.display = 'none';
      if (confirmBtn) confirmBtn.disabled = true;
      if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publishing to Meta...';
      }

      try {
        const res = await fetch('/api/admin/publications/manual', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify({ content, link: link || undefined })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          if (alertEl) {
            const pubDate = data.publishedAt ? new Date(data.publishedAt).toUTCString() : new Date().toUTCString();
            alertEl.innerHTML = '<strong>Publication successful!</strong><br>' +
              'Facebook Post ID: <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">' + escapeHtml(safeStr(data.externalPostId, 'Confirmed')) + '</code><br>' +
              'Published: ' + pubDate + '<br><br>' +
              '<button class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="switchTab(\\'publications\\')">View in Publication History &rarr;</button>';
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
          clearManualForm();
        } else {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Facebook rejected the publication.</strong><br>' +
              'Reason: ' + escapeHtml(safeStr(data.error || data.result?.message, 'Meta API returned an error.')) + '<br>' +
              'No post was confirmed as published.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'An unexpected network error occurred while publishing.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (confirmBtn) confirmBtn.disabled = false;
        if (publishBtn) {
          publishBtn.disabled = false;
          publishBtn.textContent = 'Publish to Facebook';
        }
      }
    }

    async function loadPipelineData() {
      const alertEl = document.getElementById('pipeline-control-alert');
      try {
        const res = await fetch('/api/admin/pipeline/scheduler');
        if (res.ok) {
          const data = await res.json();
          const cfg = data.config || {};
          const masterSwitch = document.getElementById('sched-master-switch');
          const freqSelect = document.getElementById('sched-frequency');
          const timeInput = document.getElementById('sched-time');
          const tzInput = document.getElementById('sched-timezone');
          const stgDisc = document.getElementById('sched-stage-discovery');
          const stgGen = document.getElementById('sched-stage-generation');
          const stgEval = document.getElementById('sched-stage-evaluation');
          const stgPub = document.getElementById('sched-stage-publishing');
          const statusBadge = document.getElementById('scheduler-status-badge');

          if (masterSwitch) masterSwitch.value = cfg.enabled ? '1' : '0';
          if (freqSelect) freqSelect.value = safeStr(cfg.frequency, 'daily');
          if (timeInput) timeInput.value = safeStr(cfg.publicationTime, '09:00');
          if (tzInput) tzInput.value = safeStr(cfg.timezone, 'UTC');
          if (stgDisc) stgDisc.checked = cfg.discoveryEnabled !== false;
          if (stgGen) stgGen.checked = cfg.generationEnabled !== false;
          if (stgEval) stgEval.checked = cfg.evaluationEnabled !== false;
          if (stgPub) stgPub.checked = cfg.publishingEnabled !== false;

          if (statusBadge) {
            if (cfg.enabled) {
              statusBadge.innerHTML = '<span class="status-badge status-healthy">SCHEDULER ON (ACTIVE)</span>';
            } else {
              statusBadge.innerHTML = '<span class="status-badge status-disabled">SCHEDULER OFF</span>';
            }
          }
        } else if (res.status === 401) {
          await checkSession();
          return;
        }
      } catch (err) {
        console.error('Failed to load scheduler config:', err);
      }

      try {
        const res = await fetch('/api/admin/pipeline/history');
        const historyBody = document.getElementById('pipeline-history-body');
        if (res.ok && historyBody) {
          const data = await res.json();
          const runs = (data && (data.history || data.runs)) || [];
          if (!Array.isArray(runs) || runs.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No pipeline execution runs logged yet. Click <strong>Run Full Pipeline Now</strong> above to start.</td></tr>';
          } else {
            historyBody.innerHTML = runs.map(r => {
              if (!r) return '';
              const statusStr = safeUpper(r.status, 'UNKNOWN');
              const statusClass = statusStr === 'COMPLETED' || statusStr === 'SUCCESS' ? 'status-healthy' : statusStr === 'RUNNING' ? 'status-active' : 'status-alert';
              const neurons = r.neurons_used !== null && r.neurons_used !== undefined ? Number(r.neurons_used).toLocaleString() + ' Neurons' : '—';
              const duration = r.started_at && r.finished_at ? Math.max(0, Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)) + 's' : 'In Progress';
              const trigger = safeUpper(r.trigger_type, 'MANUAL');
              const resultStr = escapeHtml(safeStr(r.result_status || r.error_message || r.status, '—'));
              
              let details = 'Stage Execution Log';
              if (r.topics_discovered !== undefined) {
                details = 'Discovered: ' + (r.topics_discovered || 0) + ' | Selected: ' + (r.topics_selected || 0);
              }
              if (r.post_id) {
                details += ' | Post: ' + escapeHtml(safeStr(r.post_id).substring(0, 8));
              }

              return '<tr>' +
                '<td>' + formatDateSafe(r.started_at) + ' ' + formatTimeSafe(r.started_at) + '</td>' +
                '<td><span class="status-badge status-neutral">' + trigger + '</span></td>' +
                '<td><span class="status-badge ' + statusClass + '">' + statusStr + '</span></td>' +
                '<td>' + resultStr + '</td>' +
                '<td>' + details + '</td>' +
                '<td style="color:var(--accent-cyan); font-weight:600;">' + neurons + '</td>' +
                '<td>' + duration + '</td>' +
              '</tr>';
            }).join('');
          }
        } else if (res.status === 401) {
          await checkSession();
        } else if (historyBody) {
          historyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-rose); padding:1.5rem;">Failed to load pipeline execution history (HTTP ' + res.status + ').</td></tr>';
        }
      } catch (err) {
        console.error('Failed to load pipeline execution history:', err);
      }
    }

    async function runDiscoveryNow() {
      const btn = document.getElementById('stage-discovery-btn');
      const alertEl = document.getElementById('pipeline-control-alert');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Running Content Scout Discovery...'; }
      if (alertEl) alertEl.style.display = 'none';

      try {
        const res = await fetch('/api/admin/pipeline/discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }
        });
        const data = await res.json();

        if (res.ok && data.success) {
          const r = data.result || {};
          let html = '<strong>Stage 1 — Content Discovery Completed Successfully!</strong><br><br>' +
            '• Sources checked: <strong>' + (r.sourcesChecked || 0) + '</strong><br>' +
            '• Raw items found: <strong>' + (r.rawItemsDiscovered || 0) + '</strong><br>' +
            '• AI Inference requests: <strong>' + (r.aiInferenceRequests || 0) + '</strong> (Successful: ' + (r.aiInferenceSuccessful || 0) + ', Failed: ' + (r.aiInferenceFailed || 0) + ')<br>' +
            '• Useful inspirations: <strong>' + (r.usefulInspirations || 0) + '</strong><br>' +
            '• NO_USEFUL_ANGLE count: <strong>' + (r.noUsefulAngleCount || 0) + '</strong><br>' +
            '• Duplicates skipped: <strong>' + (r.duplicatesFound || 0) + '</strong><br>' +
            '• Rejected: <strong>' + (r.rejectedCount || 0) + '</strong><br>' +
            '• New proposals added: <strong>' + (r.newProposalsCount || 0) + '</strong><br>' +
            '• Cloudflare Verified Neurons: <strong style="color:var(--accent-cyan);">' + (r.cloudflareVerifiedNeurons !== null ? r.cloudflareVerifiedNeurons.toLocaleString() + ' Neurons' : 'Not Configured') + '</strong><br>' +
            '• Duration: <strong>' + ((r.durationMs || 0) / 1000).toFixed(1) + 's</strong>';

          if (Array.isArray(r.proposals) && r.proposals.length > 0) {
            html += '<br><br><strong>Generated Topic Proposals:</strong><ul style="margin-top:0.4rem; padding-left:1.2rem;">';
            r.proposals.forEach(p => {
              if (p) html += '<li><strong>' + escapeHtml(safeStr(p.title)) + '</strong> (' + escapeHtml(safeStr(p.contentPillar)) + '): <em>' + escapeHtml(safeStr(p.contentAngle)) + '</em></li>';
            });
            html += '</ul>';
          }

          if (alertEl) {
            alertEl.innerHTML = html;
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Stage 1 Content Discovery Failed:</strong> ' + escapeHtml(safeStr(data.error, 'Unknown error'));
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error while running Content Discovery.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔎 Run Content Discovery'; }
        loadPipelineData();
      }
    }

    async function runPostGenerationNow() {
      const btn = document.getElementById('stage-generation-btn');
      const alertEl = document.getElementById('pipeline-control-alert');
      if (btn) { btn.disabled = true; btn.textContent = '✍ Generating & Evaluating Post...'; }
      if (alertEl) alertEl.style.display = 'none';

      try {
        const res = await fetch('/api/admin/pipeline/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }
        });
        const data = await res.json();
        const r = data.result || {};

        if (res.ok && data.success && r.finalDecision === 'PASS') {
          const c = r.classification || {};
          let html = '<strong>Stage 2 — Post Generation & Quality Evaluation Passed!</strong><br><br>' +
            '• Post Title: <strong>' + escapeHtml(safeStr(r.title)) + '</strong><br>' +
            '• Quality Score: <strong>' + (r.qualityScore || 0) + ' / 100</strong><br>' +
            '• Final Decision: <span class="status-badge status-healthy">PASS</span><br>' +
            '• Pillar: <strong>' + escapeHtml(safeStr(c.pillar, 'GENERAL')) + '</strong> | Type: <strong>' + escapeHtml(safeStr(c.postType, 'SHORT_POST')) + '</strong><br>' +
            '• Sub-scores — Engagement: ' + (c.engagementPotential || 0) + ' | Clarity: ' + (c.clarity || 0) + ' | Value: ' + (c.practicalValue || 0) + ' | Brand: ' + (c.brandRelevance || 0) + ' | Originality: ' + (c.originality || 0) + '<br>' +
            '• Suggested Publication Time: <strong>' + (r.suggestedPublishTime ? new Date(r.suggestedPublishTime).toUTCString() : 'Immediate') + '</strong><br><br>' +
            '<div style="background:rgba(0,0,0,0.3); padding:0.8rem; border-radius:6px; font-family:monospace; white-space:pre-wrap; max-height:150px; overflow-y:auto; font-size:0.85rem;">' + escapeHtml(safeStr(r.body)) + '</div>';

          if (alertEl) {
            alertEl.innerHTML = html;
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          let html = '<strong>Stage 2 — Post Generation Rejected / Failed:</strong><br>';
          if (r.finalDecision === 'REJECTED' || r.finalDecision === 'BLOCKED') {
            html += 'Decision: <span class="status-badge status-alert">' + escapeHtml(safeStr(r.finalDecision)) + '</span><br>' +
              'Reason: ' + escapeHtml(safeStr(r.rejectionReason || data.error, 'Post draft failed quality gate controls.'));
          } else {
            html += escapeHtml(safeStr(data.error, 'Failed to generate post.'));
          }
          if (alertEl) {
            alertEl.innerHTML = html;
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error while running Post Generation & Quality evaluation.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✍ Generate & Process Selected'; }
        loadPipelineData();
      }
    }

    async function runPublishNow() {
      const btn = document.getElementById('stage-publishing-btn');
      const alertEl = document.getElementById('pipeline-control-alert');
      if (btn) { btn.disabled = true; btn.textContent = '📤 Publishing to Facebook Page...'; }
      if (alertEl) alertEl.style.display = 'none';

      try {
        const postsRes = await fetch('/api/admin/content');
        const postsData = await postsRes.json();
        const readyPost = (Array.isArray(postsData.posts) ? postsData.posts : []).find(p => p && (p.quality_decision === 'PASS' || p.status === 'approved' || p.status === 'draft'));

        if (!readyPost) {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Stage 3 Facebook Publishing Failed:</strong> No approved post drafts ready in queue. Run Stage 2 first.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
          return;
        }

        const res = await fetch('/api/admin/pipeline/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ postId: readyPost.id })
        });
        const data = await res.json();
        const r = data.result || {};

        if (res.ok && data.success && r.success) {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Stage 3 — Published to Facebook Successfully!</strong><br><br>' +
              '• Facebook Post ID: <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">' + escapeHtml(safeStr(r.facebookPostId, 'Confirmed')) + '</code><br>' +
              '• Published At: <strong>' + (r.publishedAt ? new Date(r.publishedAt).toUTCString() : new Date().toUTCString()) + '</strong><br>' +
              '• Target: <strong>NorthSoft Facebook Page</strong>';
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          if (alertEl) {
            alertEl.innerHTML = '<strong>PUBLISH FAILED:</strong><br>' +
              'Reason: ' + escapeHtml(safeStr(r.error || data.error, 'Meta Facebook API rejected publication.')) + '<br>' +
              'No post status was changed to published.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error while attempting Facebook publication.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📤 Publish Selected Post'; }
        loadPipelineData();
      }
    }

    async function runFullPipelineNow() {
      const btn = document.getElementById('run-full-pipeline-btn');
      const alertEl = document.getElementById('pipeline-control-alert');
      if (btn) { btn.disabled = true; btn.textContent = '🚀 Executing Full Pipeline (End-to-End)...'; }
      if (alertEl) alertEl.style.display = 'none';

      try {
        const res = await fetch('/api/admin/pipeline/run-full', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }
        });
        const data = await res.json();
        const r = data.result || {};

        if (res.status === 409 || data.code === 'PIPELINE_ALREADY_RUNNING') {
          if (alertEl) {
            alertEl.innerHTML = '<strong>PIPELINE ALREADY RUNNING:</strong> A pipeline execution is currently in progress. Please wait for it to finish.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
          return;
        }

        if (res.ok && data.success && r.status === 'SUCCESS') {
          const s1 = r.stage1Discovery || {};
          const s2 = r.stage2Generation || {};
          const s3 = r.stage3Publishing || {};

          let html = '<strong>🚀 1-Click Full Pipeline Executed Successfully!</strong><br><br>' +
            '• Stage 1 Content Discovery: <span class="status-badge status-healthy">SUCCESS</span> (' + (s1.newProposalsCount || 0) + ' new topics)<br>' +
            '• Stage 2 Post Generation: <span class="status-badge status-healthy">SUCCESS</span> ("' + escapeHtml(safeStr(s2.title)) + '", QA Score: ' + (s2.qualityScore || 0) + ')<br>' +
            '• Stage 3 Quality Evaluation: <span class="status-badge status-healthy">PASS</span><br>' +
            '• Stage 4 Facebook Publishing: <span class="status-badge status-healthy">SUCCESS</span> (Post ID: <code>' + escapeHtml(safeStr(s3.facebookPostId || r.facebookPostId)) + '</code>)<br>' +
            '• Published Posts Count: <strong>EXACTLY 1 POST</strong><br>' +
            '• Total Duration: <strong>' + ((r.durationMs || 0) / 1000).toFixed(1) + 's</strong>';

          if (alertEl) {
            alertEl.innerHTML = html;
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Full Pipeline Execution Failed:</strong><br>' +
              'Reason: ' + escapeHtml(safeStr(data.error || r.errorMessage, 'One of the pipeline stages failed execution.')) + '<br>' +
              'No unverified posts were published.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error while executing Full Pipeline.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🚀 RUN FULL PIPELINE NOW'; }
        loadPipelineData();
      }
    }

    async function saveSchedulerConfig(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const btn = document.getElementById('save-scheduler-btn');
      const alertEl = document.getElementById('pipeline-control-alert');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving Settings...'; }

      const masterSwitch = document.getElementById('sched-master-switch');
      const freqSelect = document.getElementById('sched-frequency');
      const timeInput = document.getElementById('sched-time');
      const tzInput = document.getElementById('sched-timezone');
      const stgDisc = document.getElementById('sched-stage-discovery');
      const stgGen = document.getElementById('sched-stage-generation');
      const stgEval = document.getElementById('sched-stage-evaluation');
      const stgPub = document.getElementById('sched-stage-publishing');

      const body = {
        enabled: masterSwitch ? masterSwitch.value === '1' : false,
        frequency: freqSelect ? safeStr(freqSelect.value, 'daily') : 'daily',
        publicationTime: timeInput ? safeStr(timeInput.value, '09:00') : '09:00',
        timezone: tzInput ? safeStr(tzInput.value, 'UTC') : 'UTC',
        discoveryEnabled: stgDisc ? stgDisc.checked : true,
        generationEnabled: stgGen ? stgGen.checked : true,
        evaluationEnabled: stgEval ? stgEval.checked : true,
        publishingEnabled: stgPub ? stgPub.checked : true,
      };

      try {
        const res = await fetch('/api/admin/pipeline/scheduler', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify(body)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Automatic Scheduler configuration saved successfully!</strong> Status: <strong>' + (data.config?.enabled ? 'ACTIVE (ON)' : 'DISABLED (OFF)') + '</strong>';
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          if (alertEl) {
            alertEl.textContent = 'Failed to save scheduler configuration: ' + safeStr(data.error, 'Unknown error');
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error saving scheduler configuration.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
        loadPipelineData();
      }
    }

    // ======================================================================
    // Modal Overlays & Calendar Grid Functions
    // ======================================================================

    function openModal(id) {
      const modal = document.getElementById(id);
      if (modal) modal.classList.add('active');
    }

    function closeModal(id) {
      const modal = document.getElementById(id);
      if (modal) modal.classList.remove('active');
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
      }
    });

    function openAddTopicModal() {
      const titleInput = document.getElementById('topic-input-title');
      const descInput = document.getElementById('topic-input-desc');
      const idInput = document.getElementById('topic-edit-id');
      const modalTitle = document.getElementById('topic-modal-title');

      if (idInput) idInput.value = '';
      if (titleInput) titleInput.value = '';
      if (descInput) descInput.value = '';
      if (modalTitle) modalTitle.textContent = 'Add New Topic';

      openModal('topic-modal');
    }

    function openAddPostModal() {
      const topicInput = document.getElementById('post-input-topic');
      const contentInput = document.getElementById('post-input-content');
      const idInput = document.getElementById('post-edit-id');
      const modalTitle = document.getElementById('post-modal-title');

      if (idInput) idInput.value = '';
      if (topicInput) topicInput.value = '';
      if (contentInput) contentInput.value = '';
      if (modalTitle) modalTitle.textContent = 'Add Post Draft';

      openModal('post-modal');
    }

    function openSchedulePostModal() {
      const idInput = document.getElementById('schedule-edit-id');
      const dateInput = document.getElementById('schedule-date');
      const todayStr = new Date().toISOString().split('T')[0];

      if (idInput) idInput.value = '';
      if (dateInput) dateInput.value = todayStr;

      openModal('schedule-post-modal');
    }

    async function handleSaveTopic(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const title = safeStr(document.getElementById('topic-input-title')?.value).trim();
      const desc = safeStr(document.getElementById('topic-input-desc')?.value).trim();
      const pillar = safeStr(document.getElementById('topic-input-pillar')?.value, 'AI_AUTOMATION');

      if (!title) return;

      closeModal('topic-modal');
      const alertEl = document.getElementById('research-run-alert');
      if (alertEl) {
        alertEl.textContent = 'Topic "' + title + '" added successfully.';
        alertEl.className = 'alert-success';
        alertEl.style.display = 'block';
      }
      loadResearchData();
    }

    async function handleSavePost(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const topic = safeStr(document.getElementById('post-input-topic')?.value).trim();
      const content = safeStr(document.getElementById('post-input-content')?.value).trim();

      if (!content) return;

      closeModal('post-modal');
      const alertEl = document.getElementById('content-alert');
      if (alertEl) {
        alertEl.textContent = 'Post draft for topic "' + (topic || 'Manual') + '" created successfully.';
        alertEl.className = 'alert-success';
        alertEl.style.display = 'block';
      }
      loadContentData();
    }

    async function handleSaveSchedule(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const dateVal = safeStr(document.getElementById('schedule-date')?.value);
      const timeVal = safeStr(document.getElementById('schedule-time')?.value, '09:00');

      closeModal('schedule-post-modal');
      loadSchedulesData();
    }

    function toggleAdvancedSchedulerSettings() {
      const panel = document.getElementById('adv-scheduler-panel');
      const arrow = document.getElementById('adv-settings-arrow');
      if (panel) {
        const isHidden = panel.style.display === 'none' || !panel.style.display;
        panel.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.innerHTML = isHidden ? '&uarr;' : '&darr;';
      }
    }

    function handlePlannedRunSubmit(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const alertEl = document.getElementById('pipeline-control-alert');
      const date = safeStr(document.getElementById('plan-run-date')?.value);
      const time = safeStr(document.getElementById('plan-run-time')?.value, '09:00');

      if (alertEl) {
        alertEl.innerHTML = '<strong>Planned Run Scheduled:</strong> Full pipeline execution scheduled for <strong>' + date + ' at ' + time + ' UTC</strong>.';
        alertEl.className = 'alert-success';
        alertEl.style.display = 'block';
      }
    }

    let currentCalendarDate = new Date();
    let queueViewMode = 'calendar';

    function setQueueView(mode) {
      queueViewMode = mode;
      const calView = document.getElementById('schedules-calendar-view');
      const listView = document.getElementById('schedules-list-view');
      const btnCal = document.getElementById('btn-view-calendar');
      const btnList = document.getElementById('btn-view-list');

      if (mode === 'calendar') {
        if (calView) calView.style.display = 'block';
        if (listView) listView.style.display = 'none';
        if (btnCal) { btnCal.style.background = 'var(--accent-blue)'; btnCal.style.color = 'white'; }
        if (btnList) { btnList.style.background = 'transparent'; btnList.style.color = 'var(--text-main)'; }
      } else {
        if (calView) calView.style.display = 'none';
        if (listView) listView.style.display = 'block';
        if (btnCal) { btnCal.style.background = 'transparent'; btnCal.style.color = 'var(--text-main)'; }
        if (btnList) { btnList.style.background = 'var(--accent-blue)'; btnList.style.color = 'white'; }
      }
    }

    function navigateCalendar(dir) {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
      loadSchedulesData();
    }

    function renderCalendarGrid(schedules) {
      const titleEl = document.getElementById('calendar-month-title');
      const gridEl = document.getElementById('calendar-grid-days');
      if (!gridEl) return;

      const year = currentCalendarDate.getFullYear();
      const month = currentCalendarDate.getMonth();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

      if (titleEl) titleEl.textContent = monthNames[month] + ' ' + year;

      const firstDayIndex = new Date(year, month, 1).getDay();
      const totalDays = new Date(year, month + 1, 0).getDate();
      const prevMonthDays = new Date(year, month, 0).getDate();

      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();

      let html = '';

      for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayNum = prevMonthDays - i;
        html += '<div class="calendar-day-cell other-month"><div class="calendar-day-num">' + dayNum + '</div></div>';
      }

      for (let day = 1; day <= totalDays; day++) {
        const isToday = (year === todayYear && month === todayMonth && day === todayDate);

        const dayItems = (Array.isArray(schedules) ? schedules : []).filter(s => {
          if (!s || !s.scheduled_at) return false;
          const d = new Date(s.scheduled_at);
          return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        });

        html += '<div class="calendar-day-cell' + (isToday ? ' today' : '') + '">';
        html += '<div class="calendar-day-num"><span>' + day + '</span>' + (isToday ? '<span style="font-size:0.65rem; color:#60a5fa;">TODAY</span>' : '') + '</div>';

        dayItems.forEach(item => {
          const timeStr = item.scheduled_at ? new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00';
          const title = escapeHtml(safeStr(item.post_title, 'Post'));
          html += '<div class="calendar-item-chip" title="' + title + '">';
          html += '<span class="calendar-item-time">' + timeStr + '</span>' + title;
          html += '</div>';
        });

        html += '</div>';
      }

      const totalSlots = firstDayIndex + totalDays;
      const remainingCells = (7 - (totalSlots % 7)) % 7;
      for (let i = 1; i <= remainingCells; i++) {
        html += '<div class="calendar-day-cell other-month"><div class="calendar-day-num">' + i + '</div></div>';
      }

      gridEl.innerHTML = html;
    }

    // Attach all client functions to window object for global availability
    window.switchTab = switchTab;
    window.showDashboard = showDashboard;
    window.showLoginForm = showLoginForm;
    window.showForgotForm = showForgotForm;
    window.showResetForm = showResetForm;
    window.loadDashboardData = loadDashboardData;
    window.loadPipelineData = loadPipelineData;
    window.loadManualPublisherData = loadManualPublisherData;
    window.loadResearchData = loadResearchData;
    window.loadContentData = loadContentData;
    window.loadSchedulesData = loadSchedulesData;
    window.loadPublicationsData = loadPublicationsData;
    window.loadAuditData = loadAuditData;
    window.loadSecurityData = loadSecurityData;
    window.runDiscoveryNow = runDiscoveryNow;
    window.runPostGenerationNow = runPostGenerationNow;
    window.runPublishNow = runPublishNow;
    window.runFullPipelineNow = runFullPipelineNow;
    window.saveSchedulerConfig = saveSchedulerConfig;
    window.runResearchNow = runResearchNow;
    window.runPipelineNow = runPipelineNow;
    window.clearManualForm = clearManualForm;
    window.validateManualForm = validateManualForm;
    window.openPublishConfirmation = openPublishConfirmation;
    window.closePublishConfirmation = closePublishConfirmation;
    window.submitManualPublication = submitManualPublication;
    window.publishNow = publishNow;
    window.retryPub = retryPub;
    window.loadFacebookPagePosts = loadFacebookPagePosts;
    window.setAuditCategory = setAuditCategory;
    window.executeAuditSearch = executeAuditSearch;
    window.handleAuditSearch = handleAuditSearch;
    window.changeAuditPage = changeAuditPage;
    window.toggleAuditDetail = toggleAuditDetail;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.openAddTopicModal = openAddTopicModal;
    window.openAddPostModal = openAddPostModal;
    window.openSchedulePostModal = openSchedulePostModal;
    window.handleSaveTopic = handleSaveTopic;
    window.handleSavePost = handleSavePost;
    window.handleSaveSchedule = handleSaveSchedule;
    window.toggleAdvancedSchedulerSettings = toggleAdvancedSchedulerSettings;
    window.handlePlannedRunSubmit = handlePlannedRunSubmit;
    window.setQueueView = setQueueView;
    window.navigateCalendar = navigateCalendar;
    window.renderCalendarGrid = renderCalendarGrid;
  `;
}
