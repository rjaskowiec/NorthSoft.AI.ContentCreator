/**
 * Admin Dashboard UI — Client-Side JavaScript Module
 */

export function getAdminScripts(): string {
  return `
    let csrfToken = '';
    let currentTab = 'dashboard';

    // Initialize State Check
    document.addEventListener('DOMContentLoaded', checkSession);

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
        if (data.authenticated) {
          csrfToken = data.csrfToken;
          showDashboard(data.user);
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
      activeResetToken = token;
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
      if (isNaN(d.getTime())) return escapeHtml(String(isoStr));
      return d.toLocaleTimeString();
    }

    function formatDateOnlySafe(isoStr) {
      if (!isoStr) return '—';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return escapeHtml(String(isoStr));
      return d.toLocaleDateString();
    }

    function showDashboard(user) {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('dashboard-screen').style.display = 'flex';
      const userDisp = document.getElementById('user-display');
      if (userDisp) userDisp.textContent = user.username;

      const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
      const validTabs = ['dashboard', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
      if (hash && validTabs.includes(hash)) {
        switchTab(hash);
      } else {
        switchTab('dashboard');
      }
    }

    function switchTab(tabName, evt) {
      if (evt && typeof evt.preventDefault === 'function') {
        evt.preventDefault();
      }
      const validTabs = ['dashboard', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
      if (!validTabs.includes(tabName)) {
        tabName = 'dashboard';
      }

      currentTab = tabName;
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-section').forEach(el => el.classList.remove('active-tab'));

      const navEl = document.getElementById('nav-' + tabName);
      if (navEl) navEl.classList.add('active');

      const tabEl = document.getElementById('tab-' + tabName);
      if (tabEl) {
        tabEl.classList.add('active-tab');
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
          loadDashboardData();
        } else if (tabName === 'manual-publisher') {
          loadManualPublisherData();
        } else if (tabName === 'research') {
          loadResearchData();
        } else if (tabName === 'content') {
          loadContentData();
        } else if (tabName === 'schedules') {
          loadSchedulesData();
        } else if (tabName === 'publications') {
          loadPublicationsData();
        } else if (tabName === 'audit') {
          loadAuditData();
        } else if (tabName === 'security') {
          loadSecurityData();
        }
      } catch (err) {
        console.error('Failed to load tab data for ' + tabName + ':', err);
      }
    }

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
      const validTabs = ['dashboard', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
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
      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

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
        } else if (alertEl) {
          alertEl.textContent = data.message || 'Invalid credentials.';
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
      const email = emailInput ? emailInput.value.trim() : '';

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
            alertEl.textContent = data.message || 'If an account matches this information, a password reset email has been sent.';
            if (emailInput) emailInput.value = '';
          } else {
            alertEl.className = 'alert-error';
            alertEl.textContent = data.message || 'Failed to submit password recovery request.';
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
      const newPassword = newPassInput ? newPassInput.value : '';
      const confirmPassword = confirmPassInput ? confirmPassInput.value : '';

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
            alertEl.textContent = data.message || 'Password reset link is invalid or expired.';
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

      const currentPassword = (document.getElementById('change-current-password')?.value || '');
      const newPassword = (document.getElementById('change-new-password')?.value || '');
      const confirmPassword = (document.getElementById('change-confirm-password')?.value || '');

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
            if (data.csrfToken) csrfToken = data.csrfToken;
            alertEl.className = 'alert-success';
            alertEl.textContent = 'Password updated successfully! All other sessions were invalidated.';
            alertEl.style.display = 'block';
            document.getElementById('change-current-password').value = '';
            document.getElementById('change-new-password').value = '';
            document.getElementById('change-confirm-password').value = '';
          } else {
            alertEl.className = 'alert-error';
            alertEl.textContent = data.message || 'Failed to change password.';
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
        const data = await res.json();
        const badgeEl = document.getElementById('recovery-email-badge');
        const boxEl = document.getElementById('recovery-email-status-box');
        const inputEl = document.getElementById('recovery-email-input');

        if (data.configured && data.email) {
          if (badgeEl) badgeEl.innerHTML = '<span class="status-badge status-healthy">Configured</span>';
          if (boxEl) boxEl.innerHTML = 'Password recovery email: <strong>' + escapeHtml(data.email) + '</strong><br><span style="color:var(--accent-emerald); font-size:0.85rem;">Password recovery via email is currently <strong>enabled</strong>.</span>';
          if (inputEl) inputEl.value = data.email;
        } else {
          if (badgeEl) badgeEl.innerHTML = '<span class="status-badge status-disabled">Not configured</span>';
          if (boxEl) boxEl.innerHTML = 'Password recovery via email is currently <strong>unavailable</strong> because no recovery email address has been set.';
          if (inputEl) inputEl.value = '';
        }
      } catch (err) {
        // Ignore
      }
    }

    // Recovery Email Form Handler
    document.getElementById('recovery-email-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('security-alert');
      if (alertEl) alertEl.style.display = 'none';

      const email = (document.getElementById('recovery-email-input')?.value || '').trim();

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
            alertEl.textContent = data.message || 'Failed to update recovery email.';
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
          if (res.status === 401) showLoginForm();
          return;
        }

        const data = await res.json();
        const sys = data.systemStatus || {};
        const metaStatus = sys.metaPublisherStatus || {};

        // Environment Tag
        const envBadge = document.getElementById('env-badge');
        if (envBadge) {
          const env = (sys.environment || 'staging').toLowerCase();
          envBadge.textContent = env.toUpperCase();
          envBadge.className = 'env-tag env-' + env;
        }

        // Truthful System Status Cards
        const workerEl = document.getElementById('val-worker');
        if (workerEl) workerEl.innerHTML = '<span class="status-badge status-healthy">' + escapeHtml(sys.worker || 'Healthy') + '</span>';

        const dbEl = document.getElementById('val-db');
        if (dbEl) dbEl.innerHTML = '<span class="status-badge ' + (sys.database === 'Connected' ? 'status-healthy' : 'status-alert') + '">' + escapeHtml(sys.database || 'Connected') + '</span>';

        const aiEl = document.getElementById('val-ai');
        if (aiEl) aiEl.innerHTML = '<span class="status-badge status-active">' + escapeHtml(sys.aiProvider || 'Workers AI') + '</span>';

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
        const cntIdeas = document.getElementById('cnt-ideas');
        if (cntIdeas) cntIdeas.textContent = data.pipeline.discoveredTopics || data.pipeline.ideas || 0;

        const cntDrafts = document.getElementById('cnt-drafts');
        if (cntDrafts) cntDrafts.textContent = data.pipeline.drafts || 0;

        const cntQa = document.getElementById('cnt-qa');
        if (cntQa) cntQa.textContent = data.pipeline.underReview || data.pipeline.awaitingQa || 0;

        const cntApproved = document.getElementById('cnt-approved');
        if (cntApproved) cntApproved.textContent = data.pipeline.approved || 0;

        const cntScheduled = document.getElementById('cnt-scheduled');
        if (cntScheduled) cntScheduled.textContent = data.pipeline.scheduled || 0;

        const cntPublished = document.getElementById('cnt-published');
        if (cntPublished) cntPublished.textContent = data.pipeline.published || 0;

        const cntBlocked = document.getElementById('cnt-blocked');
        if (cntBlocked) cntBlocked.textContent = data.pipeline.rejected || data.pipeline.blocked || 0;

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
              if (cf.status === 'VERIFIED') {
                cfBadge.className = 'status-badge status-healthy';
                cfBadge.textContent = 'VERIFIED TELEMETRY';
              } else if (cf.status === 'NOT_CONFIGURED') {
                cfBadge.className = 'status-badge status-active';
                cfBadge.textContent = 'NOT CONFIGURED';
              } else {
                cfBadge.className = 'status-badge status-alert';
                cfBadge.textContent = cf.status || 'UNAVAILABLE';
              }
            }

            if (cfNeurons) {
              cfNeurons.textContent = cf.actualNeurons !== null && cf.actualNeurons !== undefined
                ? cf.actualNeurons.toLocaleString() + ' Neurons'
                : 'Not Available';
            }

            if (cfReqs) {
              cfReqs.textContent = cf.actualRequests !== null && cf.actualRequests !== undefined
                ? cf.actualRequests.toLocaleString() + ' requests'
                : 'Not Available';
            }

            if (cfSource) cfSource.textContent = cf.source || 'Cloudflare Analytics API';
            if (cfPeriod) cfPeriod.textContent = 'Period: ' + (cf.period || 'Today (UTC)');
            if (cfSynced) {
              cfSynced.textContent = cf.lastUpdated
                ? 'Last Synced: ' + new Date(cf.lastUpdated).toLocaleTimeString()
                : 'Last Synced: Unconfigured';
            }

            if (cfNotice) {
              if (cf.reason) {
                cfNotice.style.display = 'block';
                cfNotice.textContent = cf.reason;
              } else {
                cfNotice.style.display = 'none';
              }
            }
          }

          // 2. Application Safety (Circuit Breaker) & Internal Diagnostics Panels
          const providerName = document.getElementById('ai-provider-name');
          if (providerName) providerName.textContent = sys.aiProvider || 'Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct-fp8)';

          const appGuard = usage.applicationSafetyGuard || app;
          const diag = usage.internalDiagnostics || {};

          const todayRequests = appGuard.todayRequests ?? usage.todayRequests ?? 0;
          const dailyLimit = appGuard.dailyLimit ?? usage.dailyLimit ?? 300;
          const estTokens = diag.estimatedTokensToday ?? usage.todayNeurons ?? 0;

          const todayText = document.getElementById('ai-today-text');
          if (todayText) todayText.textContent = todayRequests + ' / ' + dailyLimit + ' requests';

          const neuronsText = document.getElementById('ai-neurons-text');
          if (neuronsText) neuronsText.textContent = estTokens.toLocaleString() + ' Est. Tokens';

          const todayPct = Math.min(100, Math.round((todayRequests / dailyLimit) * 100));
          const todayBar = document.getElementById('ai-today-bar');
          if (todayBar) todayBar.style.width = todayPct + '%';

          const badgeEl = document.getElementById('ai-quota-badge');
          if (badgeEl) {
            const status = appGuard.status || usage.status;
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
          if (trigEl) trigEl.textContent = 'Trigger: ' + String(r.trigger_type || 'cron').toUpperCase();

          const statusVal = document.getElementById('orch-status-val');
          if (statusVal) statusVal.innerHTML = '<span class="status-badge ' + (r.status === 'completed' ? 'status-healthy' : r.status === 'running' ? 'status-active' : 'status-alert') + '">' + String(r.status || 'UNKNOWN').toUpperCase() + '</span>';

          const resVal = document.getElementById('orch-result-val');
          if (resVal) resVal.textContent = 'Result: ' + String(r.result_status || '—').toUpperCase();

          const neurVal = document.getElementById('orch-neurons-val');
          if (neurVal) neurVal.textContent = (r.neurons_used || 0) + ' Est. Tokens';
        }

        // Audit Activity Table (Recent Activity Preview)
        const actBody = document.getElementById('recent-activity-body');
        if (actBody && data.recentActivity) {
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
          category: currentAuditCategory,
          search: currentAuditSearch,
        });

        const res = await fetch('/api/admin/audit?' + queryParams.toString());
        if (!res.ok) {
          if (res.status === 401) showLoginForm();
          return;
        }

        const data = await res.json();

        // Update Summary Stats
        if (data.stats) {
          const evEl = document.getElementById('audit-stat-events');
          if (evEl) evEl.textContent = data.stats.totalEvents || 0;
          const errEl = document.getElementById('audit-stat-errors');
          if (errEl) errEl.textContent = data.stats.errorCount || 0;
          const warnEl = document.getElementById('audit-stat-warnings');
          if (warnEl) warnEl.textContent = data.stats.warningCount || 0;
          const aiEl = document.getElementById('audit-stat-ai');
          if (aiEl) aiEl.textContent = data.stats.aiOperations || 0;
        }

        // Update Pagination Controls
        if (data.pagination) {
          currentAuditTotalPages = data.pagination.totalPages || 1;
          const start = (data.pagination.page - 1) * data.pagination.pageSize + (data.events.length > 0 ? 1 : 0);
          const end = Math.min(data.pagination.totalCount, data.pagination.page * data.pagination.pageSize);
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
        if (fullBody && data.events) {
          fullBody.innerHTML = renderAuditRows(data.events);
        }
      } catch (err) {
        console.error('Failed to load audit data:', err);
      }
    }

    function setAuditCategory(category) {
      currentAuditCategory = category;
      currentAuditPage = 1;

      const buttons = document.querySelectorAll('.audit-cat-btn');
      buttons.forEach(btn => {
        if (btn.getAttribute('data-category') === category) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      loadAuditData();
    }

    function executeAuditSearch() {
      const input = document.getElementById('audit-search-input');
      currentAuditSearch = input ? input.value.trim() : '';
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
          if (res.status === 401) showLoginForm();
          return;
        }

        const data = await res.json();
        const stats = data.stats || {};

        const srcCnt = document.getElementById('res-sources-cnt');
        if (srcCnt) srcCnt.textContent = stats.totalSources || 0;

        const srcSub = document.getElementById('res-enabled-sub');
        if (srcSub) srcSub.textContent = (stats.enabledSources || 0) + ' Active Feeds';

        const topCnt = document.getElementById('res-topics-cnt');
        if (topCnt) topCnt.textContent = stats.totalTopicsDiscovered || 0;

        const lastRun = document.getElementById('res-last-run');
        if (lastRun) lastRun.textContent = stats.lastRunAt ? formatTimeSafe(stats.lastRunAt) : 'Never';

        // Operational Diagnostics Summary Panel
        const diagPanel = document.getElementById('res-diag-panel');
        const diagContent = document.getElementById('res-diag-content');
        const diagStatus = document.getElementById('res-diag-status');

        if (data.runs && data.runs.length > 0 && diagPanel && diagContent) {
          const latestRun = data.runs[0];
          diagPanel.style.display = 'block';
          if (diagStatus) {
            diagStatus.className = 'status-badge ' + (latestRun.status === 'completed' ? 'status-healthy' : 'status-alert');
            diagStatus.textContent = String(latestRun.status || 'COMPLETED').toUpperCase();
          }

          let pillarStr = 'None';
          if (latestRun.pillar_breakdown) {
            try {
              const pb = typeof latestRun.pillar_breakdown === 'string' ? JSON.parse(latestRun.pillar_breakdown) : latestRun.pillar_breakdown;
              pillarStr = Object.entries(pb).map(([k, v]) => '<strong>' + escapeHtml(k) + ':</strong> ' + v).join(', ');
            } catch {
              pillarStr = String(latestRun.pillar_breakdown);
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
          if (data.topics && data.topics.length > 0) {
            topicsBody.innerHTML = data.topics.map(t => \`
              <tr>
                <td>
                  <strong>\${escapeHtml(t.title || 'Untitled Topic')}</strong>
                  <div style="font-size:0.8rem; color:var(--text-muted);">\${escapeHtml(t.description || '')}</div>
                </td>
                <td><span class="code-tag">\${escapeHtml(t.category || 'general')}</span></td>
                <td><span class="status-badge status-healthy">\${t.priority || 0}/100</span></td>
                <td><span class="status-badge status-active">\${escapeHtml(t.status || '').toUpperCase()}</span></td>
                <td class="code-tag">\${formatDateOnlySafe(t.created_at)}</td>
              </tr>
            \`).join('');
          } else {
            topicsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No candidate topics discovered yet.</td></tr>';
          }
        }

        // Sources Table
        const sourcesBody = document.getElementById('sources-table-body');
        if (sourcesBody && data.sources && data.sources.length > 0) {
          sourcesBody.innerHTML = data.sources.map(s => \`
            <tr>
              <td><strong>\${escapeHtml(s.name || 'Unnamed Source')}</strong></td>
              <td><span class="code-tag">\${escapeHtml(s.category || 'rss')}</span></td>
              <td style="font-size:0.8rem; font-family:monospace;">\${escapeHtml(s.url || '')}</td>
              <td><span class="status-badge \${s.enabled ? 'status-healthy' : 'status-disabled'}">\${s.enabled ? 'ACTIVE' : 'DISABLED'}</span></td>
              <td class="code-tag">\${s.last_checked_at ? formatDateSafe(s.last_checked_at) : 'Never'}</td>
            </tr>
          \`).join('');
        }

        // Runs Table
        const runsBody = document.getElementById('runs-table-body');
        if (runsBody && data.runs && data.runs.length > 0) {
          runsBody.innerHTML = data.runs.map(r => {
            const irr = r.rejected_irrelevant || 0;
            const lowQ = r.rejected_low_quality || 0;
            const dup = r.duplicates_found || 0;

            return \`
              <tr>
                <td class="code-tag">\${formatDateSafe(r.started_at)}</td>
                <td><span class="code-tag">\${escapeHtml(r.trigger_type || 'cron')}</span></td>
                <td><span class="status-badge \${r.status === 'completed' ? 'status-healthy' : 'status-alert'}">\${escapeHtml(r.status || '').toUpperCase()}</span></td>
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
              breakdownText = Object.entries(s.pillarBreakdown).map(([k, v]) => k + ': ' + v).join(', ');
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
            alertEl.textContent = 'Research run failed: ' + (data.summary?.errorMessage || 'Unknown error');
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
      if (isNaN(d.getTime())) return escapeHtml(String(isoStr));
      return d.toLocaleString();
    }

    function formatDateUtcSafe(isoStr) {
      if (!isoStr) return '—';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return escapeHtml(String(isoStr));
      return d.toUTCString();
    }

    // Load Content Tab Data
    async function loadContentData() {
      try {
        const res = await fetch('/api/admin/content/posts');
        if (!res.ok) {
          if (res.status === 401) showLoginForm();
          return;
        }

        const data = await res.json();
        const postsBody = document.getElementById('posts-table-body');

        if (postsBody) {
          if (data.posts && data.posts.length > 0) {
            postsBody.innerHTML = data.posts.map(p => \`
              <tr>
                <td>
                  <strong>\${escapeHtml(p.title || 'Untitled Post')}</strong>
                  <div style="font-size:0.8rem; color:var(--text-muted); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHtml(p.latest_body || '')}</div>
                </td>
                <td><span class="status-badge \${p.status === 'approved' ? 'status-healthy' : p.status === 'rejected' || p.status === 'blocked' ? 'status-alert' : 'status-active'}">\${escapeHtml(p.status || '').toUpperCase()}</span></td>
                <td><span class="code-tag">v\${p.current_version || 1}</span></td>
                <td><span class="status-badge status-healthy">\${p.quality_score || 0}/100</span></td>
                <td><span class="status-badge \${p.quality_decision === 'PASS' ? 'status-healthy' : 'status-alert'}">\${escapeHtml(p.quality_decision || 'PASS')}</span></td>
                <td class="code-tag">\${formatDateSafe(p.created_at)}</td>
              </tr>
            \`).join('');
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
            alertEl.textContent = 'Autonomous pipeline completed! Result: ' + (data.result?.resultStatus || 'COMPLETED').toUpperCase();
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
            loadDashboardData();
          } else {
            alertEl.textContent = data.result?.errorMessage || 'Pipeline run encountered an issue or was deferred by quota.';
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
          if (res.status === 401) showLoginForm();
          return;
        }

        const data = await res.json();
        const schedBody = document.getElementById('schedules-table-body');

        if (schedBody) {
          if (data.schedules && data.schedules.length > 0) {
            schedBody.innerHTML = data.schedules.map(sched => \`
              <tr>
                <td><strong>\${escapeHtml(sched.post_title || 'Untitled Post')}</strong></td>
                <td class="code-tag">\${formatDateUtcSafe(sched.scheduled_at)}</td>
                <td><span class="status-badge status-healthy">\${escapeHtml(sched.status || '').toUpperCase()}</span></td>
                <td><span class="code-tag">v\${sched.current_version || 1}</span></td>
                <td><span class="status-badge status-healthy">\${sched.quality_score || 0}/100</span></td>
                <td><span class="status-badge \${sched.quality_decision === 'PASS' ? 'status-healthy' : 'status-alert'}">\${escapeHtml(sched.quality_decision || 'PASS')}</span></td>
                <td class="code-tag">\${formatDateSafe(sched.created_at)}</td>
              </tr>
            \`).join('');
          } else {
            schedBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No scheduled publications queue entries found. Approved posts will automatically appear here when scheduled.</td></tr>';
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
          if (res.status === 401) showLoginForm();
          return;
        }

        const data = await res.json();
        const config = data.configStatus || {};

        const cfgBadge = document.getElementById('meta-config-badge');
        const st = (config.state || (config.configured ? 'READY' : 'NOT_CONFIGURED')).toUpperCase();
        let badgeClass = 'status-disabled';
        if (st === 'READY') badgeClass = 'status-healthy';
        else if (st === 'DEGRADED') badgeClass = 'status-alert';
        else if (st === 'DISABLED') badgeClass = 'status-active';

        if (cfgBadge) {
          cfgBadge.innerHTML = '<span class="status-badge ' + badgeClass + '">' + st.replace('_', ' ') + '</span>';
        }

        const pageIdEl = document.getElementById('meta-pageid-val');
        if (pageIdEl) pageIdEl.textContent = config.pageIdConfigured ? 'Configured (Set)' : 'Missing';

        const tokenEl = document.getElementById('meta-token-val');
        if (tokenEl) tokenEl.textContent = config.tokenConfigured ? 'Configured (Set)' : 'Missing';

        const verEl = document.getElementById('meta-version-val');
        if (verEl) verEl.textContent = config.apiVersion || 'v26.0';

        const lockEl = document.getElementById('meta-lock-val');
        if (lockEl) lockEl.textContent = config.publishEnabled ? 'ENABLED' : 'DISABLED';

        // Publications Table
        const pubBody = document.getElementById('publications-table-body');
        if (pubBody) {
          if (data.publications && data.publications.length > 0) {
            pubBody.innerHTML = data.publications.map(pub => {
              const isApproved = pub.qualityGateStatus === 'approved' || pub.qualityGateStatus === 'PASS';
              const statusClass = pub.status === 'published' ? 'status-healthy' : pub.status === 'publishing' ? 'status-active' : pub.status === 'failed' ? 'status-alert' : 'status-disabled';
              const errCategory = pub.errorCode ? pub.errorCode : '';

              return \`
                <tr>
                  <td>
                    <strong>\${escapeHtml(pub.postTitle || 'Untitled Post')}</strong>
                    <div style="font-size:0.8rem; color:var(--text-muted); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHtml(pub.postBody || '')}</div>
                    \${pub.errorMessage ? \`<div style="font-size:0.75rem; color:var(--accent-rose); margin-top:2px;">\${escapeHtml(pub.errorMessage)}</div>\` : ''}
                  </td>
                  <td><span class="code-tag">\${escapeHtml(pub.provider || 'facebook')}</span></td>
                  <td><span class="status-badge \${isApproved ? 'status-healthy' : 'status-alert'}">\${isApproved ? 'PASS' : 'UNAPPROVED'}</span></td>
                  <td>
                    <span class="status-badge \${statusClass}">\${escapeHtml(pub.status || '').toUpperCase()}</span>
                    \${errCategory ? \`<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">\${escapeHtml(errCategory)}</div>\` : ''}
                  </td>
                  <td class="code-tag">\${escapeHtml(pub.facebookPostId || '—')}</td>
                  <td class="code-tag">\${formatDateSafe(pub.publishedAt)}</td>
                  <td>
                    \${isApproved && pub.status !== 'published' && pub.status !== 'publishing' ? \`
                      <button class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="publishNow('\${pub.postId}')">Publish Now</button>
                      \${pub.status === 'failed' ? \`<button class="btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.8rem; margin-left:4px;" onclick="retryPub('\${pub.id}')">Retry</button>\` : ''}
                    \` : pub.status === 'published' ? \`
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
        const res = await fetch('/api/admin/publications/' + postId + '/publish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          }
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            alertEl.textContent = 'Publication request completed successfully. External Facebook Post ID: ' + (data.result?.externalPostId || 'Success');
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          } else {
            alertEl.textContent = 'Publication failed: ' + (data.error || data.result?.message || 'Error publishing post');
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
        const res = await fetch('/api/admin/publications/' + pubId + '/retry', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          }
        });

        const data = await res.json();
        if (alertEl) {
          if (res.ok && data.success) {
            alertEl.textContent = 'Publication retry succeeded. External Facebook Post ID: ' + (data.result?.externalPostId || 'Success');
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          } else {
            alertEl.textContent = 'Publication retry failed: ' + (data.error || data.result?.message || 'Error retrying publication');
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
        if (!res.ok && res.status === 401) {
          showLoginForm();
          return;
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

          const errorHtml = '<div style="text-align:center; padding:1.5rem 0.5rem;"><div style="font-weight:600; color:var(--accent-rose); font-size:0.85rem; margin-bottom:0.25rem;">Unable to load Facebook posts</div><div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.75rem;">' + escapeHtml(data.error) + '</div><button class="btn-secondary" style="font-size:0.78rem; padding:0.3rem 0.75rem;" onclick="loadFacebookPagePosts()">Retry</button></div>';
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
        fbNextCursor = (data.paging && data.paging.after) ? data.paging.after : null;

        if (data.pageInfo) {
          const rName = document.getElementById('fb-rail-page-name');
          const rId = document.getElementById('fb-rail-page-id');
          if (rName) rName.textContent = data.pageInfo.name || 'NorthSoft';
          if (rId && data.pageInfo.id) rId.textContent = 'Page ID: ' + data.pageInfo.id;
        }

        const rawPosts = data.posts || [];
        const newPosts = rawPosts.filter(function(p) { return !loadedFbPostIds.has(p.id); });
        newPosts.forEach(function(p) { loadedFbPostIds.add(p.id); });

        if (loadedFbPostIds.size > 0) {
          if (railBadge) railBadge.innerHTML = '<span class="status-badge status-healthy">LIVE &middot; ' + loadedFbPostIds.size + ' POSTS</span>';
          if (pageBadge) pageBadge.innerHTML = '<span class="status-badge status-healthy">LIVE &middot; ' + loadedFbPostIds.size + ' POSTS</span>';

          const railCardsHtml = newPosts.map(function(post) {
            const timeAgo = formatFbTimeAgo(post.createdTime);
            const fullDate = post.createdTime ? new Date(post.createdTime).toLocaleString() : '';
            const msgContent = post.message ? escapeHtml(post.message) : (post.story ? escapeHtml(post.story) : '<em style="color:var(--text-subtle);">No text content available.</em>');

            return '<div class="fb-rail-post-card">' +
              '<div class="fb-rail-post-header">' +
                '<div class="fb-rail-post-avatar">NS</div>' +
                '<div style="flex:1; min-width:0;">' +
                  '<div class="fb-rail-post-name">' + escapeHtml(data.pageInfo?.name || 'NorthSoft') + '</div>' +
                  '<div class="fb-rail-post-time" title="' + escapeHtml(fullDate) + '">' + escapeHtml(timeAgo) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="fb-rail-post-text">' + msgContent + '</div>' +
              (post.fullPicture ? '<div class="fb-rail-post-img-wrap"><img src="' + escapeHtml(post.fullPicture) + '" alt="Post image" loading="lazy"></div>' : '') +
              '<div class="fb-rail-post-footer">' +
                '<span style="font-size:0.7rem; color:var(--text-subtle);" title="' + escapeHtml(post.id) + '">ID: ' + escapeHtml(post.id.length > 15 ? post.id.substring(0, 12) + '...' : post.id) + '</span>' +
                (post.permalinkUrl ? '<a href="' + escapeHtml(post.permalinkUrl) + '" target="_blank" rel="noopener noreferrer" class="fb-rail-post-link">View on Facebook &rarr;</a>' : '') +
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
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
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
      if (!events || events.length === 0) {
        return '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;"><div style="font-weight:600; margin-bottom:0.25rem;">No audit events found</div><div style="font-size:0.8rem; color:var(--text-subtle);">Try adjusting category filters or search queries</div></td></tr>';
      }

      return events.map((act, idx) => {
        const evt = formatAuditEvent(act.eventType);
        const tsInfo = formatAuditTimestamp(act.timestamp);
        const level = act.level || (act.status === 'FAILED' ? 'ERROR' : act.status === 'DEFERRED' ? 'WARNING' : 'INFO');

        let statusBadgeClass = 'status-disabled';
        let statusIcon = '🔵';
        let statusText = 'Info';

        if (level === 'ERROR' || act.status === 'FAILED') {
          statusBadgeClass = 'status-alert';
          statusIcon = '🔴';
          statusText = 'Failed';
        } else if (level === 'WARNING' || act.status === 'DEFERRED') {
          statusBadgeClass = 'status-disabled';
          statusIcon = '🟡';
          statusText = 'Warning';
        } else if (level === 'SUCCESS' || act.status === 'COMPLETED') {
          statusBadgeClass = 'status-healthy';
          statusIcon = '🟢';
          statusText = 'Completed';
        }

        const operationTitle = act.operation || (act.details && (act.details.title || act.details.sourceName)) || act.entityType + ':' + (act.entityId ? act.entityId.substring(0, 8) : '—');

        let summaryText = '—';
        if (act.error && act.error.message) {
          summaryText = (act.error.stage ? act.error.stage + ': ' : '') + act.error.message;
        } else if (act.details && act.details.error) {
          summaryText = String(act.details.error);
        } else if (act.durationMs) {
          summaryText = evt.title + ' · ' + (act.durationMs / 1000).toFixed(2) + 's';
        } else if (act.details && act.details.reason) {
          summaryText = String(act.details.reason);
        } else {
          summaryText = evt.title;
        }

        if (summaryText.length > 55) {
          summaryText = summaryText.substring(0, 52) + '…';
        }

        const rowKey = act.id || ('idx-' + idx + '-' + Math.random().toString(36).substring(2, 7));
        const detailId = 'detail-' + rowKey;

        const safeDetailsJson = escapeHtml(JSON.stringify(act.details || {}, null, 2));
        const fullErrorMessage = act.error && act.error.message ? escapeHtml(act.error.message) : (act.details && act.details.error ? escapeHtml(String(act.details.error)) : null);

        return \`
          <tr class="audit-row-clickable" onclick="toggleAuditDetail('\${detailId}')" title="Click to view full technical diagnostic details">
            <td>
              <span class="status-badge \${statusBadgeClass}" style="white-space:nowrap;">
                \${statusIcon} \${statusText}
              </span>
            </td>
            <td>
              <strong style="font-size:0.85rem; color:var(--text-main); display:block; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">\${evt.title}</strong>
              <span style="font-size:0.7rem; color:var(--text-subtle); font-family:monospace;">\${act.eventType}</span>
            </td>
            <td>
              <div style="font-weight:600; font-size:0.85rem; color:var(--text-main); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="\${escapeHtml(operationTitle)}">
                \${escapeHtml(operationTitle)}
              </div>
              <div style="font-size:0.725rem; color:var(--text-subtle);">Actor: \${act.actor || 'system'}</div>
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
                    <span class="status-badge \${statusBadgeClass}">\${act.eventType} — \${statusText.toUpperCase()}</span>
                  </div>
                  <div style="font-size:0.8rem; color:var(--text-muted); text-align:right;">
                    <strong>Timestamp:</strong> \${tsInfo.full}
                  </div>
                </div>

                <div class="audit-detail-grid">
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Stage / Component</span>
                    <span class="audit-detail-value">\${escapeHtml((act.error && act.error.stage) || (act.details && act.details.stage) || '—')}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Model / Provider</span>
                    <span class="audit-detail-value">\${escapeHtml((act.details && (act.details.model || act.details.provider)) || '—')}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Duration</span>
                    <span class="audit-detail-value">\${act.durationMs ? (act.durationMs / 1000).toFixed(2) + 's (' + act.durationMs + ' ms)' : '—'}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">HTTP Status</span>
                    <span class="audit-detail-value">\${(act.error && act.error.httpStatus) || (act.details && act.details.httpStatus) || '—'}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Correlation ID</span>
                    <span class="audit-detail-value" style="font-family:monospace; font-size:0.8rem;">\${escapeHtml(act.correlationId || '—')}</span>
                  </div>
                  <div class="audit-detail-field">
                    <span class="audit-detail-label">Entity</span>
                    <span class="audit-detail-value" style="font-family:monospace; font-size:0.8rem;">\${act.entityType}:\${act.entityId}</span>
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
      const norm = (eventType || '').toUpperCase().trim();
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
      const act = (actor || 'system').toLowerCase().trim();
      let label = 'SYSTEM';
      let badgeClass = 'status-disabled';
      if (act === 'admin') { label = 'ADMIN'; badgeClass = 'status-active'; }
      else if (act === 'ai') { label = 'AI ENGINE'; badgeClass = 'status-healthy'; }
      const username = details && (details.username || details.actorName);
      return { label, subtext: typeof username === 'string' && username.trim() ? username.trim() : null, badgeClass };
    }

    function formatAuditEntity(entityType, entityId) {
      const typeMap = { admin_user: 'Admin user', admin_session: 'Admin session', publication: 'Publication', post: 'Post draft', post_version: 'Post version', topic: 'Research topic', research_run: 'Research run', orchestrator: 'Orchestrator' };
      const rawType = (entityType || '').toLowerCase().trim();
      const typeLabel = typeMap[rawType] || rawType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'System';
      const fullId = String(entityId || '—');
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
        else if (typeof rawVal === 'object') { value = JSON.stringify(rawVal); }
        else if (key.toLowerCase().includes('time') || key.toLowerCase().includes('expires')) {
          const parsedDate = new Date(String(rawVal));
          value = isNaN(parsedDate.getTime()) ? String(rawVal) : parsedDate.toLocaleString();
        } else { value = String(rawVal); }
        if (value.length > 36) value = value.substring(0, 33) + '…';
        items.push({ key, label, value: escapeHtml(value) });
      }
      return items;
    }

    function formatAuditTimestamp(isoDate) {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return { compact: isoDate || '—', full: isoDate || '—' };
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
      if (typeof str !== 'string') return '';
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
      const content = (document.getElementById('manual-post-content')?.value || '').trim();
      const link = (document.getElementById('manual-post-link')?.value || '').trim();

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
      const content = (document.getElementById('manual-post-content')?.value || '').trim();
      const link = (document.getElementById('manual-post-link')?.value || '').trim();
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
      const content = (document.getElementById('manual-post-content')?.value || '').trim();
      const link = (document.getElementById('manual-post-link')?.value || '').trim();
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
              'Facebook Post ID: <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">' + (data.externalPostId || 'Confirmed') + '</code><br>' +
              'Published: ' + pubDate + '<br><br>' +
              '<button class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="switchTab(\\'publications\\')">View in Publication History &rarr;</button>';
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
          clearManualForm();
        } else {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Facebook rejected the publication.</strong><br>' +
              'Reason: ' + (data.error || data.result?.message || 'Meta API returned an error.') + '<br>' +
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

    // Attach all client functions to window object for global availability
    window.switchTab = switchTab;
    window.showDashboard = showDashboard;
    window.showLoginForm = showLoginForm;
    window.showForgotForm = showForgotForm;
    window.showResetForm = showResetForm;
    window.loadDashboardData = loadDashboardData;
    window.loadManualPublisherData = loadManualPublisherData;
    window.loadResearchData = loadResearchData;
    window.loadContentData = loadContentData;
    window.loadSchedulesData = loadSchedulesData;
    window.loadPublicationsData = loadPublicationsData;
    window.loadAuditData = loadAuditData;
    window.loadSecurityData = loadSecurityData;
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
  `;
}
