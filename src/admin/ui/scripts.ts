/**
 * Admin Dashboard UI — Client-Side JavaScript Module
 */

export function getAdminScripts(): string {
  return `
    let csrfToken = '';
    let currentTab = 'dashboard';
    let selectedTopicIds = new Set();
    let selectedPostIds = new Set();
    let cachedTopics = [];
    let cachedPosts = [];
    let cachedSchedules = [];
    let pendingDeleteType = null;
    let pendingDeleteId = null;

    // Safe String & Utility Normalizers for API Resilience
    function safeStr(val, defaultVal = '') {
      if (val === null || val === undefined) return defaultVal;
      if (typeof val === 'object') {
        if (typeof val.message === 'string' && val.message) return val.message;
        if (typeof val.error === 'string' && val.error) return val.error;
        if (typeof val.code === 'string' && val.code) return val.code;
      }
      return String(val);
    }

    function extractApiErrorMessage(data, httpStatus) {
      if (data && typeof data === 'object') {
        if (data.error) {
          if (typeof data.error === 'string' && data.error) return data.error;
          if (typeof data.error.message === 'string' && data.error.message) return data.error.message;
        }
        if (data.result && typeof data.result.errorMessage === 'string' && data.result.errorMessage) {
          return data.result.errorMessage;
        }
        if (typeof data.message === 'string' && data.message) return data.message;
      }
      if (httpStatus === 422) {
        return 'Post generation failed. The AI model or Quality Gate was unable to process this topic.';
      }
      if (httpStatus) {
        return 'Server returned HTTP ' + httpStatus;
      }
      return 'Post generation failed. Please try again.';
    }

    function safeUpper(val, defaultVal = '') {
      return safeStr(val, defaultVal).toUpperCase();
    }

    function safeLower(val, defaultVal = '') {
      return safeStr(val, defaultVal).toLowerCase();
    }

    let isCheckingSession = false;
    let initialSessionLoaded = false;
    const activeInFlightRequests = new Map();

    async function guardedFetch(url, options = {}) {
      const method = safeUpper(options ? options.method : 'GET', 'GET');
      const key = method + ':' + url;

      if (method === 'GET' && activeInFlightRequests.has(key)) {
        return activeInFlightRequests.get(key).then(res => typeof res.clone === 'function' ? res.clone() : res);
      }

      const fetchPromise = (async () => {
        try {
          const res = await fetch(url, options);
          return typeof res.clone === 'function' ? res.clone() : res;
        } finally {
          activeInFlightRequests.delete(key);
        }
      })();

      if (method === 'GET') {
        activeInFlightRequests.set(key, fetchPromise);
      }

      return fetchPromise;
    }

    // Initialize State Check
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkSession);
    } else {
      checkSession();
    }

    async function checkSession() {
      if (isCheckingSession) return;
      isCheckingSession = true;

      const urlParams = new URLSearchParams(window.location.search);
      const resetToken = urlParams.get('resetToken') || urlParams.get('token');

      if (resetToken) {
        showResetForm(resetToken);
        isCheckingSession = false;
        return;
      }

      try {
        const res = await guardedFetch('/api/auth/session');
        const data = await res.json();
        if (data && data.authenticated) {
          csrfToken = safeStr(data.csrfToken);
          showDashboard(data.user || {});
          if (!initialSessionLoaded) {
            initialSessionLoaded = true;
            const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
            const validTabs = ['dashboard', 'pipeline', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
            if (hash && validTabs.includes(hash)) {
              switchTab(hash);
            } else {
              switchTab('dashboard');
            }
          }
          // Auto-trigger Facebook Page Posts feed load for rail sidebar
          loadFacebookPagePosts();
        } else {
          showLoginForm();
        }
      } catch (err) {
        showLoginForm();
      } finally {
        isCheckingSession = false;
      }
    }

    function showLoginForm() {
      const loginScr = document.getElementById('login-screen');
      const dashScr = document.getElementById('dashboard-screen');
      if (loginScr) loginScr.style.display = 'flex';
      if (dashScr) dashScr.style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
      document.getElementById('forgot-form').style.display = 'none';
      document.getElementById('reset-form').style.display = 'none';
    }

    function showForgotForm() {
      const loginScr = document.getElementById('login-screen');
      const dashScr = document.getElementById('dashboard-screen');
      if (loginScr) loginScr.style.display = 'flex';
      if (dashScr) dashScr.style.display = 'none';
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('forgot-form').style.display = 'block';
      document.getElementById('reset-form').style.display = 'none';
      document.getElementById('forgot-alert').style.display = 'none';
    }

    let activeResetToken = '';
    function showResetForm(token) {
      activeResetToken = safeStr(token);
      const loginScr = document.getElementById('login-screen');
      const dashScr = document.getElementById('dashboard-screen');
      if (loginScr) loginScr.style.display = 'flex';
      if (dashScr) dashScr.style.display = 'none';
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
      const loginScr = document.getElementById('login-screen');
      const dashScr = document.getElementById('dashboard-screen');
      if (loginScr) loginScr.style.display = 'none';
      if (dashScr) dashScr.style.display = 'flex';
      const userDisp = document.getElementById('user-display');
      if (userDisp) userDisp.textContent = safeStr(user.username, 'Administrator');
    }

    async function switchTab(tabName, evt) {
      if (evt && typeof evt.preventDefault === 'function') {
        evt.preventDefault();
      }
      if (tabName === 'manual-publisher') {
        tabName = 'content';
      }
      const validTabs = ['dashboard', 'pipeline', 'research', 'content', 'schedules', 'publications', 'security', 'audit'];
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
      const validTabs = ['dashboard', 'pipeline', 'research', 'content', 'schedules', 'publications', 'security', 'audit'];
      if (hash && (validTabs.includes(hash) || hash === 'manual-publisher')) {
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
        const res = await guardedFetch('/api/auth/recovery-email');
        if (!res.ok) {
          console.error('Failed to fetch security data:', res.status, res.statusText);
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
        const res = await guardedFetch('/api/admin/dashboard');
        if (!res.ok) {
          console.error('Failed to fetch dashboard data:', res.status, res.statusText);
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

        const res = await guardedFetch('/api/admin/audit?' + queryParams.toString());
        if (!res.ok) {
          console.error('Failed to fetch audit data:', res.status, res.statusText);
          const fullBody = document.getElementById('full-audit-body');
          if (fullBody) {
            fullBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-rose); padding:1.5rem;">Failed to load audit events (HTTP ' + res.status + ').</td></tr>';
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
        const res = await guardedFetch('/api/admin/research');
        if (!res.ok) {
          console.error('Failed to fetch research data:', res.status, res.statusText);
          const topicsBody = document.getElementById('topics-table-body');
          if (topicsBody) {
            topicsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-rose);">Failed to load candidate topics (HTTP ' + res.status + ').</td></tr>';
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
        cachedTopics = Array.isArray(data.topics) ? data.topics : [];
        const topicsBody = document.getElementById('topics-table-body');
        if (topicsBody) {
          if (cachedTopics.length > 0) {
            topicsBody.innerHTML = cachedTopics.map(t => {
              if (!t) return '';
              const id = safeStr(t.id);
              const title = escapeHtml(safeStr(t.title, 'Untitled Topic'));
              const desc = escapeHtml(safeStr(t.description));
              const category = escapeHtml(safeStr(t.content_pillar || t.category, 'WEBSITE'));
              const status = safeStr(t.status || 'queued').toLowerCase();
              const statusUpper = safeUpper(t.status, 'QUEUED');
              const statusClass = (status === 'accepted' || status === 'queued' || status === 'new' || status === 'discovered') ? 'status-active' : status === 'used' ? 'status-healthy' : 'status-disabled';
              const isChecked = selectedTopicIds.has(id) ? 'checked' : '';

              return \`
              <tr data-id="\${id}">
                <td style="text-align:center;">
                  <input type="checkbox" class="topic-select-checkbox" data-id="\${id}" \${isChecked} onchange="updateTopicSelectionState()" />
                </td>
                <td>
                  <strong>\${title}</strong>
                  \${desc ? \`<div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">\${desc}</div>\` : ''}
                </td>
                <td><span class="code-tag">\${category}</span></td>
                <td><span class="status-badge \${statusClass}">\${statusUpper}</span></td>
                <td>
                  <div style="display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center;">
                    <button class="btn-primary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="generatePostFromTopic('\${id}')">⚡ Generate Post</button>
                    <button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="openEditTopicModal('\${id}')">Edit</button>
                    <button class="btn-logout" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="confirmDeleteTopic('\${id}')">Delete</button>
                  </div>
                </td>
              </tr>
            \`;
            }).join('');
          } else {
            topicsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No candidate topics discovered yet.<br/><button class="btn-primary" style="margin-top:0.75rem;" onclick="openAddTopicModal()">+ Add Topic</button></td></tr>';
          }
          updateTopicSelectionState();
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
        btn.textContent = 'Finding topics...';
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
          btn.textContent = 'Find topics';
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
        const res = await guardedFetch('/api/admin/content/posts');
        if (!res.ok) {
          console.error('Failed to fetch content data:', res.status, res.statusText);
          const postsBody = document.getElementById('posts-table-body');
          if (postsBody) {
            postsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-rose); padding:1.5rem;">Failed to load post drafts (HTTP ' + res.status + ').</td></tr>';
          }
          return;
        }

        const data = await res.json();
        cachedPosts = Array.isArray(data.posts) ? data.posts : [];
        const postsBody = document.getElementById('posts-table-body');

        if (postsBody) {
          if (cachedPosts.length > 0) {
            postsBody.innerHTML = cachedPosts.map(p => {
              if (!p) return '';
              const statusStr = safeUpper(p.status, 'DRAFT');
              const syncStatus = safeUpper(p.sync_status, 'SYNCED');
              let statusClass = statusStr === 'PUBLISHED' ? 'status-healthy' : statusStr === 'SCHEDULED' ? 'status-active' : (statusStr === 'REJECTED' || statusStr === 'BLOCKED') ? 'status-alert' : 'status-disabled';
              if (syncStatus === 'CONFLICT') {
                statusClass = 'status-alert';
              }
              
              const pId = safeStr(p.id);
              const pIdeaId = safeStr(p.idea_id);
              const pTitle = safeStr(p.title, 'Untitled Post');
              const pBody = safeStr(p.latest_body || p.body);
              const isChecked = selectedPostIds.has(pId) ? 'checked' : '';

              return \`
              <tr data-id="\${pId}">
                <td style="text-align:center;">
                  <input type="checkbox" class="post-select-checkbox" data-id="\${pId}" \${isChecked} onchange="updatePostSelectionState()" />
                </td>
                <td>
                  <strong>Topic:</strong> \${escapeHtml(pTitle)}
                  \${p.image_url ? \`
                    <div style="margin-top:0.75rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:6px; padding:0.5rem;">
                      <a href="\${escapeHtml(p.source_url || p.image_url)}" target="_blank" rel="noopener noreferrer">
                        <img src="\${escapeHtml(p.image_url)}" alt="Verified Post Image" style="width:100%; max-width:200px; border-radius:4px; display:block;"/>
                      </a>
                      <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.4rem; line-height:1.4;">
                        \${p.author ? \`<div><strong>Author:</strong> \${escapeHtml(p.author)}</div>\` : ''}
                        \${p.license ? \`<div><strong>License:</strong> \${p.license_url ? \`<a href="\${escapeHtml(p.license_url)}" target="_blank" style="color:var(--accent-blue);">\${escapeHtml(p.license)}</a>\` : escapeHtml(p.license)}</div>\` : ''}
                        \${p.source_url ? \`<div><strong>Source:</strong> <a href="\${escapeHtml(p.source_url)}" target="_blank" style="color:var(--accent-blue); word-break:break-all;">\${escapeHtml(p.source_url)}</a></div>\` : ''}
                      </div>
                    </div>
                  \` : \`
                    <div style="margin-top:0.75rem; padding:0.75rem; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:6px; color:var(--text-muted); font-size:0.8rem; text-align:center;">
                      No verified image found.
                    </div>
                  \`}
                </td>
                <td>
                  <div style="font-size:0.85rem; color:var(--text-main); max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHtml(pBody)}</div>
                </td>
                <td>
                  <span class="status-badge \${statusClass}">\${syncStatus === 'CONFLICT' ? 'SYNC CONFLICT' : escapeHtml(statusStr)}</span>
                </td>
                <td class="code-tag">\${formatDateOnlySafe(p.created_at)}</td>
                <td>
                  <div style="display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center;">
                    <button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="openEditPostModal('\${pId}')">Edit</button>
                    \${pIdeaId ? \`<button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="generatePostFromTopic('\${pIdeaId}')">Regenerate</button>\` : ''}
                    \${statusStr !== 'PUBLISHED' ? \`
                      <button class="btn-primary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="openInstantPublishModal('\${pId}', '\${escapeHtml(pTitle)}')">Publish Now</button>
                      <button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="openSchedulePostModal('\${pId}')">Schedule</button>
                    \` : syncStatus === 'CONFLICT' ? \`
                      <button class="btn-primary" style="padding:0.25rem 0.55rem; font-size:0.75rem; background:var(--accent-rose);" onclick="resolveConflict('\${pId}')">Resolve Conflict</button>
                    \` : \`
                      <span style="color:var(--accent-emerald); font-weight:600; font-size:0.8rem;">Live on Facebook</span>
                    \`}
                    <button class="btn-logout" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="confirmDeletePost('\${pId}')">Delete</button>
                  </div>
                </td>
              </tr>
            \`;
            }).join('');
          } else {
            postsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No post drafts created yet.<br/><button class="btn-primary" style="margin-top:0.75rem;" onclick="openAddPostModal()">+ Add Post</button></td></tr>';
          }
          updatePostSelectionState();
        }
      } catch (err) {
        console.error('Failed to load content data:', err);
      }
    }

    function openInstantPublishModal(postId, text) {
      const modalPostId = document.getElementById('publish-modal-post-id');
      const modalText = document.getElementById('publish-modal-content-text');
      if (modalPostId) modalPostId.value = safeStr(postId);
      if (modalText) modalText.value = safeStr(text);
      openModal('publish-modal');
    }

    async function executeInstantPublication() {
      const modalPostId = document.getElementById('publish-modal-post-id');
      const postId = modalPostId ? safeStr(modalPostId.value) : '';
      closeModal('publish-modal');
      if (postId) {
        await publishNow(postId);
      }
    }

    window.openInstantPublishModal = openInstantPublishModal;
    window.executeInstantPublication = executeInstantPublication;

    // Run Autonomous Pipeline
    async function runPipelineNow() {
      const btn = document.getElementById('run-pipeline-btn');
      const alertEl = document.getElementById('pipeline-run-alert');
      if (alertEl) alertEl.style.display = 'none';

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Running full pipeline...';
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
            alertEl.textContent = 'Pipeline run completed successfully.';
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
            loadDashboardData();
          } else {
            alertEl.textContent = safeStr(data.result?.errorMessage || data.error, 'Pipeline run encountered an error.');
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
          btn.textContent = 'Run full pipeline';
        }
      }
    }

    // Load Scheduled Publications Tab Data
    async function loadSchedulesData() {
      try {
        const res = await guardedFetch('/api/admin/schedules');
        if (!res.ok) {
          console.error('Failed to fetch schedules:', res.status, res.statusText);
          const schedBody = document.getElementById('schedules-table-body');
          if (schedBody) {
            schedBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-rose);">Failed to load scheduled queue (HTTP ' + res.status + ').</td></tr>';
          }
          return;
        }

        const data = await res.json();
        const schedBody = document.getElementById('schedules-table-body');
        const schedules = Array.isArray(data.schedules) ? data.schedules : [];
        cachedSchedules = schedules;

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
                  '<button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="openSchedulePostModal(&quot;' + schedIdStr + '&quot;)">Edit</button>' +
                  '<button class="btn-logout" style="font-size:0.75rem; padding:0.25rem 0.5rem; margin-left:0.25rem;" onclick="unschedulePost(&quot;' + schedIdStr + '&quot;)">Unschedule</button>' +
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
        const res = await guardedFetch('/api/admin/publications');
        if (!res.ok) {
          console.error('Failed to fetch publications:', res.status, res.statusText);
          const pubBody = document.getElementById('publications-table-body');
          if (pubBody) {
            pubBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-rose);">Failed to load publication log (HTTP ' + res.status + ').</td></tr>';
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
            pubBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No publication records found. Scheduled posts will publish automatically.</td></tr>';
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
    let fbPostsLoading = false;

    async function loadFacebookPagePosts(append) {
      if (fbPostsLoading && !append) return;
      fbPostsLoading = true;

      const railContainer = document.getElementById('fb-rail-posts-container');
      const pageContainer = document.getElementById('fb-posts-container');
      const railBadge = document.getElementById('fb-rail-status-badge');
      const pageBadge = document.getElementById('fb-posts-status-badge');
      const railReadStatus = document.getElementById('fb-rail-read-status');
      const fbReadCard = document.getElementById('val-fb-read');
      const fbConfigCard = document.getElementById('val-fb-config');
      const loadMoreWrap = document.getElementById('fb-rail-load-more-wrap');
      const isAppend = Boolean(append);

      try {
        if (!isAppend) {
          fbNextCursor = null;
          fbHasMore = false;
          loadedFbPostIds = new Set();
          if (railContainer) {
            railContainer.innerHTML = '<div style="text-align:center; padding:2rem 0; color:var(--text-muted);"><div class="fb-post-loading-spinner"></div><div style="margin-top:0.75rem; font-size:0.825rem;">Loading Facebook posts...</div></div>';
          }
          if (pageContainer) {
            pageContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);"><div class="fb-post-loading-spinner"></div><div style="margin-top:0.75rem; font-size:0.85rem;">Fetching posts...</div></div>';
          }
          if (loadMoreWrap) loadMoreWrap.style.display = 'none';
        }

        let fetchUrl = '/api/admin/facebook/page-posts?limit=10';
        if (isAppend && fbNextCursor) {
          fetchUrl += '&after=' + encodeURIComponent(fbNextCursor);
        }

        const res = await guardedFetch(fetchUrl);
        if (!res.ok) {
          console.error('Failed to fetch Facebook page posts:', res.status);
          if (fbReadCard) fbReadCard.innerHTML = '<span class="status-badge status-alert">● Error</span>';
          if (railReadStatus) {
            railReadStatus.className = 'fb-rail-status-chip status-alert';
            railReadStatus.innerHTML = '● READ: Error';
          }
          if (railBadge) railBadge.innerHTML = '<span class="status-badge status-alert">HTTP ' + res.status + '</span>';
          if (pageBadge) pageBadge.innerHTML = '<span class="status-badge status-alert">HTTP ' + res.status + '</span>';

          const errorHtml = '<div style="text-align:center; padding:1.5rem 0.5rem;"><div style="font-weight:600; color:var(--accent-rose); font-size:0.85rem; margin-bottom:0.25rem;">Unable to load Facebook feed</div><div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.75rem;">HTTP ' + res.status + '</div><button class="btn-secondary" style="font-size:0.78rem; padding:0.3rem 0.75rem;" onclick="loadFacebookPagePosts()">Retry</button></div>';
          if (railContainer && !isAppend) railContainer.innerHTML = errorHtml;
          if (pageContainer && !isAppend) pageContainer.innerHTML = errorHtml;
          if (loadMoreWrap) loadMoreWrap.style.display = 'none';
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
      } finally {
        fbPostsLoading = false;
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
          alertEl.textContent = 'Post content exceeds maximum character limit.';
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
        const res = await guardedFetch('/api/admin/pipeline/scheduler');
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
        } else {
          console.error('Failed to fetch pipeline scheduler config:', res.status);
        }
      } catch (err) {
        console.error('Failed to load scheduler config:', err);
      }

      try {
        const res = await guardedFetch('/api/admin/pipeline/history');
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
          let html = '<strong>Topic discovery completed.</strong><br>' +
            'Discovered ' + (r.newProposalsCount || 0) + ' new topics.';

          if (Array.isArray(r.proposals) && r.proposals.length > 0) {
            html += '<br><br><strong>Topic Proposals:</strong><ul style="margin-top:0.4rem; padding-left:1.2rem;">';
            r.proposals.forEach(p => {
              if (p) html += '<li><strong>' + escapeHtml(safeStr(p.title)) + '</strong> (' + escapeHtml(safeStr(p.contentPillar)) + ')</li>';
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
            alertEl.innerHTML = '<strong>Topic discovery failed.</strong> Please try again.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error while running Topic Discovery.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Find topics'; }
        loadPipelineData();
      }
    }

    async function runPostGenerationNow() {
      const btn = document.getElementById('stage-generation-btn');
      const alertEl = document.getElementById('pipeline-control-alert');
      if (btn) { btn.disabled = true; btn.textContent = 'Generating post...'; }
      if (alertEl) alertEl.style.display = 'none';

      try {
        const res = await fetch('/api/admin/pipeline/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }
        });
        const data = await res.json();
        const r = data.result || {};

        if (res.ok && data.success && r.finalDecision === 'PASS') {
          let html = '<strong>Post generated successfully.</strong><br>' +
            'Draft: <strong>"' + escapeHtml(safeStr(r.title, 'Untitled Draft')) + '"</strong>';

          if (alertEl) {
            alertEl.innerHTML = html;
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          let html = '<strong>Post generation failed.</strong> Please try again.';
          if (alertEl) {
            alertEl.innerHTML = html;
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error while generating post.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Generate post'; }
        loadPipelineData();
      }
    }

    async function runPublishNow() {
      const btn = document.getElementById('stage-publishing-btn');
      const alertEl = document.getElementById('pipeline-control-alert');
      if (btn) { btn.disabled = true; btn.textContent = 'Publishing...'; }
      if (alertEl) alertEl.style.display = 'none';

      try {
        const postsRes = await fetch('/api/admin/content');
        const postsData = await postsRes.json();
        const readyPost = (Array.isArray(postsData.posts) ? postsData.posts : []).find(p => p && (p.quality_decision === 'PASS' || p.status === 'approved' || p.status === 'draft'));

        if (!readyPost) {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Publishing failed:</strong> No approved posts available to publish.';
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
            alertEl.innerHTML = '<strong>Post published successfully.</strong>';
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Publication failed.</strong> Please verify Facebook connection and try again.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error while publishing post.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Publish now'; }
        loadPipelineData();
      }
    }

    async function runFullPipelineNow() {
      const btn = document.getElementById('run-full-pipeline-btn');
      const alertEl = document.getElementById('pipeline-control-alert');
      if (btn) { btn.disabled = true; btn.textContent = 'Executing full pipeline...'; }
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
            alertEl.innerHTML = '<strong>Pipeline currently running.</strong> Please wait for it to complete.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
          return;
        }

        if (res.ok && data.success && r.status === 'SUCCESS') {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Pipeline execution completed successfully.</strong>';
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          if (alertEl) {
            alertEl.innerHTML = '<strong>Pipeline execution failed.</strong> Please try again.';
            alertEl.className = 'alert-error';
            alertEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = 'Network error while executing pipeline.';
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } finally {
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

    // ======================================================================
    // TOPIC RESEARCH — CRUD & BULK ACTIONS
    // ======================================================================
    function updateTopicSelectionState() {
      const checkboxes = document.querySelectorAll('.topic-select-checkbox');
      selectedTopicIds = new Set();
      checkboxes.forEach(cb => {
        if (cb.checked) {
          selectedTopicIds.add(cb.getAttribute('data-id'));
        }
      });
      const toolbar = document.getElementById('topic-bulk-toolbar');
      const countEl = document.getElementById('topic-selected-count');
      const masterCb = document.getElementById('topic-select-all');

      if (countEl) countEl.textContent = selectedTopicIds.size;
      if (toolbar) toolbar.style.display = selectedTopicIds.size > 0 ? 'flex' : 'none';
      if (masterCb) masterCb.checked = checkboxes.length > 0 && selectedTopicIds.size === checkboxes.length;
    }

    function toggleSelectAllTopics(master) {
      const checkboxes = document.querySelectorAll('.topic-select-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = Boolean(master && master.checked);
      });
      updateTopicSelectionState();
    }

    async function executeTopicBulkStatusChange(newStatus) {
      if (!newStatus || selectedTopicIds.size === 0) return;
      try {
        const res = await fetch('/api/admin/research/topics/bulk-status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ ids: Array.from(selectedTopicIds), status: newStatus })
        });
        if (res.ok) {
          selectedTopicIds.clear();
          const sel = document.getElementById('topic-bulk-status-select');
          if (sel) sel.value = '';
          loadResearchData();
        }
      } catch (err) {
        console.error('Failed bulk topic status update:', err);
      }
    }

    function confirmDeleteSelectedTopics() {
      if (selectedTopicIds.size === 0) return;
      pendingDeleteType = 'topics_bulk';
      pendingDeleteId = null;
      const title = document.getElementById('delete-confirm-title');
      const msg = document.getElementById('delete-confirm-message');
      if (title) title.textContent = 'Delete Selected Topics';
      if (msg) msg.textContent = 'Are you sure you want to delete ' + selectedTopicIds.size + ' selected topics? This action cannot be undone.';
      openModal('delete-confirm-modal');
    }

    function openAddTopicModal() {
      const idInput = document.getElementById('topic-edit-id');
      const titleInput = document.getElementById('topic-input-title');
      const descInput = document.getElementById('topic-input-desc');
      const pillarInput = document.getElementById('topic-input-pillar');
      const statusInput = document.getElementById('topic-input-status');
      const prioInput = document.getElementById('topic-input-priority');
      const modalTitle = document.getElementById('topic-modal-title');

      if (idInput) idInput.value = '';
      if (titleInput) titleInput.value = '';
      if (descInput) descInput.value = '';
      if (pillarInput) pillarInput.value = 'WEBSITE';
      if (statusInput) statusInput.value = 'queued';
      if (prioInput) prioInput.value = '50';
      if (modalTitle) modalTitle.textContent = 'Add New Topic';

      openModal('topic-modal');
    }

    function openEditTopicModal(id) {
      const t = cachedTopics.find(item => item && item.id === id);
      if (!t) return;

      const idInput = document.getElementById('topic-edit-id');
      const titleInput = document.getElementById('topic-input-title');
      const descInput = document.getElementById('topic-input-desc');
      const pillarInput = document.getElementById('topic-input-pillar');
      const statusInput = document.getElementById('topic-input-status');
      const prioInput = document.getElementById('topic-input-priority');
      const modalTitle = document.getElementById('topic-modal-title');

      if (idInput) idInput.value = safeStr(t.id);
      if (titleInput) titleInput.value = safeStr(t.title);
      if (descInput) descInput.value = safeStr(t.description);
      if (pillarInput) pillarInput.value = safeStr(t.content_pillar || t.category, 'WEBSITE');
      if (statusInput) statusInput.value = safeStr(t.status || 'queued').toLowerCase();
      if (prioInput) prioInput.value = safeStr(t.priority, '50');
      if (modalTitle) modalTitle.textContent = 'Edit Topic';

      openModal('topic-modal');
    }

    async function handleSaveTopic(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const id = safeStr(document.getElementById('topic-edit-id')?.value).trim();
      const title = safeStr(document.getElementById('topic-input-title')?.value).trim();
      const desc = safeStr(document.getElementById('topic-input-desc')?.value).trim();
      const category = safeStr(document.getElementById('topic-input-pillar')?.value, 'WEBSITE');
      const status = safeStr(document.getElementById('topic-input-status')?.value, 'queued');
      const priority = parseInt(safeStr(document.getElementById('topic-input-priority')?.value, '50'), 10);

      if (!title) return;

      const url = id ? '/api/admin/research/topics/' + encodeURIComponent(id) : '/api/admin/research/topics';
      const method = id ? 'PATCH' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ title, description: desc, category, status, priority })
        });
        if (res.ok) {
          closeModal('topic-modal');
          loadResearchData();
        }
      } catch (err) {
        console.error('Failed to save topic:', err);
      }
    }

    function confirmDeleteTopic(id) {
      pendingDeleteType = 'topic';
      pendingDeleteId = id;
      const t = cachedTopics.find(item => item && item.id === id);
      const title = document.getElementById('delete-confirm-title');
      const msg = document.getElementById('delete-confirm-message');
      if (title) title.textContent = 'Delete Topic';
      if (msg) msg.textContent = 'Are you sure you want to delete topic "' + safeStr(t?.title, id) + '"? This action cannot be undone.';
      openModal('delete-confirm-modal');
    }

    async function generatePostFromTopic(topicId) {
      if (!topicId) return;
      const alertEl = document.getElementById('research-run-alert');
      if (alertEl) {
        alertEl.textContent = 'Generating post draft...';
        alertEl.className = 'alert-info';
        alertEl.style.display = 'block';
      }

      try {
        const res = await fetch('/api/admin/content/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ topicId })
        });
        let data = {};
        try {
          data = await res.json();
        } catch (_) {
          data = {};
        }

        if (res.ok && data.success) {
          if (alertEl) {
            alertEl.textContent = 'Post draft generated successfully.';
            alertEl.className = 'alert-success';
          }
          switchTab('content');
        } else {
          const errMsg = extractApiErrorMessage(data, res.status);
          if (alertEl) {
            alertEl.textContent = 'Post generation failed: ' + errMsg;
            alertEl.className = 'alert-error';
          }
        }
      } catch (err) {
        console.error('Failed to generate post from topic:', err);
        if (alertEl) {
          alertEl.textContent = 'Post generation failed: ' + safeStr(err?.message, 'Network or server error');
          alertEl.className = 'alert-error';
        }
      }
    }

    // ======================================================================
    // CONTENT DRAFTS — CRUD & BULK ACTIONS
    // ======================================================================
    function updatePostSelectionState() {
      const checkboxes = document.querySelectorAll('.post-select-checkbox');
      selectedPostIds = new Set();
      checkboxes.forEach(cb => {
        if (cb.checked) {
          selectedPostIds.add(cb.getAttribute('data-id'));
        }
      });
      const toolbar = document.getElementById('post-bulk-toolbar');
      const countEl = document.getElementById('post-selected-count');
      const masterCb = document.getElementById('post-select-all');

      if (countEl) countEl.textContent = selectedPostIds.size;
      if (toolbar) toolbar.style.display = selectedPostIds.size > 0 ? 'flex' : 'none';
      if (masterCb) masterCb.checked = checkboxes.length > 0 && selectedPostIds.size === checkboxes.length;
    }

    function toggleSelectAllPosts(master) {
      const checkboxes = document.querySelectorAll('.post-select-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = Boolean(master && master.checked);
      });
      updatePostSelectionState();
    }

    async function executePostBulkStatusChange(newStatus) {
      if (!newStatus || selectedPostIds.size === 0) return;
      try {
        const res = await fetch('/api/admin/content/posts/bulk-status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ ids: Array.from(selectedPostIds), status: newStatus })
        });
        if (res.ok) {
          selectedPostIds.clear();
          const sel = document.getElementById('post-bulk-status-select');
          if (sel) sel.value = '';
          loadContentData();
        }
      } catch (err) {
        console.error('Failed bulk post status update:', err);
      }
    }

    function confirmDeleteSelectedPosts() {
      if (selectedPostIds.size === 0) return;
      pendingDeleteType = 'posts_bulk';
      pendingDeleteId = null;
      const title = document.getElementById('delete-confirm-title');
      const msg = document.getElementById('delete-confirm-message');
      if (title) title.textContent = 'Delete Selected Drafts';
      if (msg) msg.textContent = 'Are you sure you want to delete ' + selectedPostIds.size + ' selected post drafts? This action cannot be undone.';
      openModal('delete-confirm-modal');
    }

    function openAddPostModal() {
      const idInput = document.getElementById('post-edit-id');
      const topicInput = document.getElementById('post-input-topic');
      const contentInput = document.getElementById('post-input-content');
      const statusInput = document.getElementById('post-input-status');
      const modalTitle = document.getElementById('post-modal-title');

      if (idInput) idInput.value = '';
      if (topicInput) topicInput.value = '';
      if (contentInput) contentInput.value = '';
      if (statusInput) statusInput.value = 'draft';
      if (modalTitle) modalTitle.textContent = 'Add Post Draft';

      openModal('post-modal');
    }

    function openEditPostModal(id) {
      const p = cachedPosts.find(item => item && item.id === id);
      if (!p) return;

      const idInput = document.getElementById('post-edit-id');
      const topicInput = document.getElementById('post-input-topic');
      const contentInput = document.getElementById('post-input-content');
      const statusInput = document.getElementById('post-input-status');
      const modalTitle = document.getElementById('post-modal-title');

      if (idInput) idInput.value = safeStr(p.id);
      if (topicInput) topicInput.value = safeStr(p.title);
      if (contentInput) contentInput.value = safeStr(p.latest_body || p.body);
      if (statusInput) statusInput.value = safeStr(p.status || 'draft').toLowerCase();
      if (modalTitle) modalTitle.textContent = 'Edit Post Draft';

      openModal('post-modal');
    }

    async function handleSavePost(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const id = safeStr(document.getElementById('post-edit-id')?.value).trim();
      const topic = safeStr(document.getElementById('post-input-topic')?.value).trim();
      const content = safeStr(document.getElementById('post-input-content')?.value).trim();
      const status = safeStr(document.getElementById('post-input-status')?.value, 'draft');

      if (!content) return;

      const url = id ? '/api/admin/content/posts/' + encodeURIComponent(id) : '/api/admin/content/manual-post';
      const method = id ? 'PATCH' : 'POST';
      const payload = id ? { title: topic, body: content, status } : { topicTitle: topic, content, status };

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const p = cachedPosts.find(item => item && item.id === id);
          if (p && (p.status === 'published' || p.facebook_post_id)) {
            // Push to Facebook immediately
            const fbRes = await fetch('/api/admin/facebook/posts/' + encodeURIComponent(id) + '/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
              body: JSON.stringify({ content })
            });
            
            if (fbRes.ok) {
              alert('Saved locally and pushed to Facebook successfully.');
            } else {
              const fbData = await fbRes.json();
              if (fbData.conflict) {
                alert('Saved locally, but a CONFLICT was detected with Facebook! Please resolve it using the "Resolve Conflict" button.');
              } else {
                alert('Saved locally, but failed to push to Facebook: ' + safeStr(fbData.error));
              }
            }
          }
          closeModal('post-modal');
          loadContentData();
        }
      } catch (err) {
        console.error('Failed to save post draft:', err);
      }
    }

    function confirmDeletePost(id) {
      pendingDeleteType = 'post';
      pendingDeleteId = id;
      const p = cachedPosts.find(item => item && item.id === id);
      const title = document.getElementById('delete-confirm-title');
      const msg = document.getElementById('delete-confirm-message');
      if (title) title.textContent = 'Delete Post Draft';
      if (msg) msg.textContent = 'Are you sure you want to delete draft "' + safeStr(p?.title, id) + '"? This action cannot be undone.';
      openModal('delete-confirm-modal');
    }

    async function resolveConflict(id) {
      if (!confirm('A sync conflict was detected for this post.\\n\\nDo you want to overwrite Facebook with the Local version? (Click OK for Local, Cancel for Facebook)')) {
        // User wants to use Facebook version
        try {
          const res = await fetch('/api/admin/facebook/posts/' + encodeURIComponent(id) + '/resolve-conflict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ resolution: 'use_facebook' })
          });
          if (res.ok) {
            alert('Conflict resolved using Facebook version.');
            loadContentData();
          } else {
            alert('Failed to resolve conflict.');
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        // User wants to use Local version
        try {
          const res = await fetch('/api/admin/facebook/posts/' + encodeURIComponent(id) + '/resolve-conflict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ resolution: 'use_local' })
          });
          if (res.ok) {
            alert('Conflict resolved using Local version. Content was pushed to Facebook.');
            loadContentData();
          } else {
            alert('Failed to resolve conflict.');
          }
        } catch (err) {
          console.error(err);
        }
      }
    }

    function openGenerateSingleTopicModal() {
      const titleInput = document.getElementById('gen-topic-title');
      const descInput = document.getElementById('gen-topic-desc');
      if (titleInput) titleInput.value = '';
      if (descInput) descInput.value = '';
      openModal('generate-topic-modal');
    }

    async function handleGeneratePostFromTopicSubmit(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const title = safeStr(document.getElementById('gen-topic-title')?.value).trim();
      const desc = safeStr(document.getElementById('gen-topic-desc')?.value).trim();
      const pillar = safeStr(document.getElementById('gen-topic-pillar')?.value, 'MARKETING');

      if (!title) return;
      closeModal('generate-topic-modal');

      const alertEl = document.getElementById('content-alert');
      if (alertEl) {
        alertEl.textContent = 'Generating post draft for topic "' + title + '"...';
        alertEl.className = 'alert-info';
        alertEl.style.display = 'block';
      }

      try {
        const res = await fetch('/api/admin/content/manual-topic-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ title, description: desc, category: pillar })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (alertEl) {
            alertEl.textContent = 'Post generated successfully from topic.';
            alertEl.className = 'alert-success';
          }
          loadContentData();
        } else {
          if (alertEl) {
            alertEl.textContent = 'Failed to generate post: ' + safeStr(data.error || data.result?.errorMessage, 'Unknown error');
            alertEl.className = 'alert-error';
          }
        }
      } catch (err) {
        console.error('Failed manual topic post generation:', err);
      }
    }

    function openSchedulePostModal(postId) {
      if (postId) {
        const p = cachedPosts.find(item => item && item.id === postId);
        if (p && (p.status === 'published' || p.status === 'publishing')) {
          // Redirect to edit modal if already published
          openEditPostModal(postId);
          return;
        }
      }

      const idInput = document.getElementById('schedule-edit-id');
      const dateInput = document.getElementById('schedule-date');
      const timeInput = document.getElementById('schedule-time');
      const selectEl = document.getElementById('schedule-post-select');

      // Default to tomorrow 10:00 AM UTC to strictly enforce future scheduling
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tomorrowDateStr = tomorrow.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];

      if (idInput) idInput.value = safeStr(postId);
      if (dateInput) {
        dateInput.value = tomorrowDateStr;
        dateInput.min = todayStr;
      }
      if (timeInput) {
        timeInput.value = '10:00';
      }

      if (selectEl) {
        selectEl.innerHTML = '<option value="">-- Select draft --</option>' + cachedPosts.filter(p => p && p.status !== 'published' && p.status !== 'publishing').map(p => {
          if (!p) return '';
          const selectedAttr = (postId && p.id === postId) ? 'selected' : '';
          return '<option value="' + safeStr(p.id) + '" ' + selectedAttr + '>' + escapeHtml(safeStr(p.title)) + '</option>';
        }).join('');
      }

      openModal('schedule-post-modal');
    }

    async function handleSaveSchedule(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const selectEl = document.getElementById('schedule-post-select');
      const dateVal = safeStr(document.getElementById('schedule-date')?.value);
      const timeVal = safeStr(document.getElementById('schedule-time')?.value, '10:00');
      const postId = selectEl ? safeStr(selectEl.value) : '';

      if (!postId || !dateVal) {
        alert('Please select a post draft and publication date.');
        return;
      }

      const scheduledMs = new Date(dateVal + 'T' + timeVal + ':00Z').getTime();
      if (isNaN(scheduledMs) || scheduledMs < Date.now()) {
        alert('A post cannot be scheduled in the past. Please select a date and time in the future.');
        return;
      }

      const scheduledAt = new Date(scheduledMs).toISOString();

      try {
        const res = await fetch('/api/admin/content/posts/' + encodeURIComponent(postId) + '/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ scheduledAt })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeModal('schedule-post-modal');
          loadContentData();
          loadSchedulesData();
        } else {
          const errorMsg = safeStr(data.error || data.message, 'A post cannot be scheduled in the past.');
          alert('Scheduling failed: ' + errorMsg);
        }
      } catch (err) {
        console.error('Failed to schedule post:', err);
        alert('Failed to connect to server when saving schedule.');
      }
    }

    function openScheduledPostDetailModal(scheduleId, postId) {
      const idInput = document.getElementById('sched-detail-schedule-id');
      const postInput = document.getElementById('sched-detail-post-id');
      const titleInput = document.getElementById('sched-detail-post-title');
      const bodyInput = document.getElementById('sched-detail-post-body');
      const statusBadge = document.getElementById('sched-detail-status-badge');
      const timeSpan = document.getElementById('sched-detail-time');
      const conflictBanner = document.getElementById('sched-detail-conflict-banner');

      const sched = (Array.isArray(cachedSchedules) ? cachedSchedules : []).find(s => s && (s.id === scheduleId || s.post_id === postId));
      const post = (Array.isArray(cachedPosts) ? cachedPosts : []).find(p => p && p.id === postId) || (sched ? { title: sched.post_title, body: sched.post_body, status: sched.status } : null);

      if (idInput) idInput.value = safeStr(scheduleId);
      if (postInput) postInput.value = safeStr(postId);
      if (titleInput) titleInput.value = safeStr(post?.title || sched?.post_title, 'Scheduled Post');
      if (bodyInput) bodyInput.value = safeStr(post?.latest_body || post?.body || sched?.post_body, '');

      if (statusBadge) {
        const st = safeUpper(sched?.status || post?.status, 'SCHEDULED');
        statusBadge.textContent = st;
        statusBadge.className = 'status-badge ' + (st === 'PUBLISHED' ? 'status-healthy' : st === 'SCHEDULED' || st === 'PENDING' ? 'status-active' : 'status-alert');
      }

      if (timeSpan) {
        timeSpan.textContent = sched?.scheduled_at ? formatDateUtcSafe(sched.scheduled_at) : 'Future';
      }

      if (conflictBanner) {
        const isConflict = post?.sync_status === 'CONFLICT' || sched?.sync_status === 'CONFLICT';
        conflictBanner.style.display = isConflict ? 'block' : 'none';
      }

      openModal('scheduled-post-detail-modal');
    }

    async function saveScheduledPostEdits() {
      const postId = safeStr(document.getElementById('sched-detail-post-id')?.value).trim();
      const body = safeStr(document.getElementById('sched-detail-post-body')?.value).trim();

      if (!postId || !body) return;

      try {
        const res = await fetch('/api/admin/content/posts/' + encodeURIComponent(postId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ body })
        });
        if (res.ok) {
          closeModal('scheduled-post-detail-modal');
          loadSchedulesData();
          loadContentData();

          const post = (Array.isArray(cachedPosts) ? cachedPosts : []).find(p => p && p.id === postId);
          if (post && (post.status === 'published' || post.facebook_post_id)) {
            await fetch('/api/admin/facebook/posts/' + encodeURIComponent(postId) + '/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
              body: JSON.stringify({ content: body })
            });
          }
        }
      } catch (err) {
        console.error('Failed to save scheduled post edits:', err);
      }
    }

    async function unscheduleSelectedPost() {
      const scheduleId = safeStr(document.getElementById('sched-detail-schedule-id')?.value).trim();
      const postId = safeStr(document.getElementById('sched-detail-post-id')?.value).trim();
      const idToDelete = scheduleId || postId;
      if (!idToDelete) return;

      try {
        const res = await fetch('/api/admin/content/schedules/' + encodeURIComponent(idToDelete), {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken }
        });
        if (res.ok) {
          closeModal('scheduled-post-detail-modal');
          loadSchedulesData();
          loadContentData();
        }
      } catch (err) {
        console.error('Failed to unschedule post:', err);
      }
    }

    async function unschedulePost(scheduleId) {
      if (!scheduleId) return;
      try {
        const res = await fetch('/api/admin/content/schedules/' + encodeURIComponent(scheduleId), {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken }
        });
        if (res.ok) {
          loadSchedulesData();
          loadContentData();
        }
      } catch (err) {
        console.error('Failed to unschedule post:', err);
      }
    }

    async function resolvePostConflict(resolution) {
      const postId = safeStr(document.getElementById('sched-detail-post-id')?.value).trim();
      if (!postId) return;

      try {
        const res = await fetch('/api/admin/facebook/posts/' + encodeURIComponent(postId) + '/resolve-conflict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ resolution })
        });
        if (res.ok) {
          closeModal('scheduled-post-detail-modal');
          loadSchedulesData();
          loadContentData();
          loadPublicationsData();
        }
      } catch (err) {
        console.error('Failed to resolve conflict:', err);
      }
    }

    async function syncFacebook() {
      try {
        await fetch('/api/admin/facebook/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }
        });
      } catch (err) {
        console.error('Failed to trigger Facebook sync:', err);
      }
    }


    // ======================================================================
    // BATCH POST GENERATION (CONTROLLED SEQUENCE)
    // ======================================================================
    function generatePostsForSelectedTopics() {
      if (selectedTopicIds.size === 0) return;
      const topics = cachedTopics.filter(t => t && selectedTopicIds.has(t.id));
      runBatchPostGeneration(topics);
    }

    async function generatePostsForAllEligible() {
      const eligible = cachedTopics.filter(t => {
        if (!t) return false;
        const st = safeLower(t.status);
        return st === 'queued' || st === 'new' || st === 'accepted' || st === 'discovered';
      });
      if (eligible.length === 0) {
        alert('No eligible topics available for generation. Add or discover new topics first.');
        return;
      }
      runBatchPostGeneration(eligible);
    }

    async function runBatchPostGeneration(topicsList) {
      if (!topicsList || topicsList.length === 0) return;

      const titleEl = document.getElementById('batch-progress-title');
      const summaryEl = document.getElementById('batch-progress-summary');
      const listEl = document.getElementById('batch-progress-list');
      const closeBtn = document.getElementById('batch-close-btn');

      if (titleEl) titleEl.textContent = 'Generating Posts (' + topicsList.length + ' topics)...';
      if (summaryEl) summaryEl.textContent = 'Processing post generation in controlled sequence...';
      if (closeBtn) closeBtn.style.display = 'none';

      if (listEl) {
        listEl.innerHTML = topicsList.map(t => \`
          <div id="batch-item-\${safeStr(t.id)}" class="batch-progress-item">
            <div>
              <strong>\${escapeHtml(safeStr(t.title, 'Topic'))}</strong>
              <div class="batch-item-status-msg" style="font-size:0.75rem; color:var(--text-muted);">Waiting in queue...</div>
            </div>
            <span class="batch-status-icon batch-status-pending">○</span>
          </div>
        \`).join('');
      }

      openModal('batch-progress-modal');

      for (const t of topicsList) {
        const itemEl = document.getElementById('batch-item-' + safeStr(t.id));
        if (itemEl) {
          const icon = itemEl.querySelector('.batch-status-icon');
          const msg = itemEl.querySelector('.batch-item-status-msg');
          if (icon) { icon.className = 'batch-status-icon batch-status-running'; icon.textContent = '⏳'; }
          if (msg) { msg.textContent = 'Generating post...'; msg.style.color = 'var(--accent-cyan)'; }
        }

        try {
          const res = await fetch('/api/admin/content/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ topicId: t.id })
          });
          let data = {};
          try {
            data = await res.json();
          } catch (_) {
            data = {};
          }

          if (itemEl) {
            const icon = itemEl.querySelector('.batch-status-icon');
            const msg = itemEl.querySelector('.batch-item-status-msg');
            if (res.ok && data.success) {
              if (icon) { icon.className = 'batch-status-icon batch-status-completed'; icon.textContent = '✓'; }
              if (msg) { msg.textContent = 'Completed successfully'; msg.style.color = 'var(--accent-emerald)'; }
            } else {
              const errMsg = extractApiErrorMessage(data, res.status);
              if (icon) { icon.className = 'batch-status-icon batch-status-failed'; icon.textContent = '✗'; }
              if (msg) { msg.textContent = errMsg; msg.style.color = 'var(--accent-rose)'; }
            }
          }
        } catch (err) {
          if (itemEl) {
            const icon = itemEl.querySelector('.batch-status-icon');
            const msg = itemEl.querySelector('.batch-item-status-msg');
            if (icon) { icon.className = 'batch-status-icon batch-status-failed'; icon.textContent = '✗'; }
            if (msg) { msg.textContent = 'Network error'; msg.style.color = 'var(--accent-rose)'; }
          }
        }
      }

      if (titleEl) titleEl.textContent = 'Batch Generation Finished';
      if (summaryEl) summaryEl.textContent = 'All selected topics have been processed.';
      if (closeBtn) closeBtn.style.display = 'block';

      selectedTopicIds.clear();
      updateTopicSelectionState();
      loadContentData();
      loadResearchData();
    }

    // ======================================================================
    // PUBLICATIONS — DELETION & HISTORY MANAGEMENT
    // ======================================================================
    function openDeletePublicationModal(id) {
      const idInput = document.getElementById('pub-delete-id');
      if (idInput) idInput.value = safeStr(id);
      openModal('publication-delete-modal');
    }

    async function executePublicationDelete() {
      const idInput = document.getElementById('pub-delete-id');
      const id = idInput ? safeStr(idInput.value) : '';
      closeModal('publication-delete-modal');

      if (!id) return;
      try {
        const res = await fetch('/api/admin/publications/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken }
        });
        if (res.ok) {
          const alertEl = document.getElementById('publication-alert');
          if (alertEl) {
            alertEl.textContent = 'Publication record removed from Content Creator history.';
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
          loadPublicationsData();
        }
      } catch (err) {
        console.error('Failed to delete publication record:', err);
      }
    }

    // Generic Delete Router
    async function executePendingDelete() {
      closeModal('delete-confirm-modal');
      const type = pendingDeleteType;
      const id = pendingDeleteId;

      try {
        if (type === 'topic' && id) {
          const res = await fetch('/api/admin/research/topics/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: { 'x-csrf-token': csrfToken }
          });
          if (res.ok) {
            loadResearchData();
          }
        } else if (type === 'topics_bulk' && selectedTopicIds.size > 0) {
          const res = await fetch('/api/admin/research/topics/bulk-delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ ids: Array.from(selectedTopicIds) })
          });
          if (res.ok) {
            selectedTopicIds.clear();
            loadResearchData();
          }
        } else if (type === 'post' && id) {
          const res = await fetch('/api/admin/content/posts/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: { 'x-csrf-token': csrfToken }
          });
          if (res.ok) {
            loadContentData();
          }
        } else if (type === 'posts_bulk' && selectedPostIds.size > 0) {
          const res = await fetch('/api/admin/content/posts/bulk-delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ ids: Array.from(selectedPostIds) })
          });
          if (res.ok) {
            selectedPostIds.clear();
            loadContentData();
          }
        }
      } catch (err) {
        console.error('Failed executing delete operation:', err);
      } finally {
        pendingDeleteType = null;
        pendingDeleteId = null;
      }
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
          const schedIdStr = safeStr(item.id);
          const postIdStr = safeStr(item.post_id);
          html += '<div class="calendar-item-chip" style="cursor:pointer;" title="' + title + '" onclick="openScheduledPostDetailModal(&quot;' + schedIdStr + '&quot;, &quot;' + postIdStr + '&quot;)">';
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
    window.openEditTopicModal = openEditTopicModal;
    window.openAddPostModal = openAddPostModal;
    window.openEditPostModal = openEditPostModal;
    window.resolveConflict = resolveConflict;
    window.openSchedulePostModal = openSchedulePostModal;
    window.handleSaveTopic = handleSaveTopic;
    window.handleSavePost = handleSavePost;
    window.handleSaveSchedule = handleSaveSchedule;
    window.toggleAdvancedSchedulerSettings = toggleAdvancedSchedulerSettings;
    window.handlePlannedRunSubmit = handlePlannedRunSubmit;
    window.setQueueView = setQueueView;
    window.navigateCalendar = navigateCalendar;
    window.renderCalendarGrid = renderCalendarGrid;
    window.updateTopicSelectionState = updateTopicSelectionState;
    window.toggleSelectAllTopics = toggleSelectAllTopics;
    window.executeTopicBulkStatusChange = executeTopicBulkStatusChange;
    window.confirmDeleteSelectedTopics = confirmDeleteSelectedTopics;
    window.generatePostsForSelectedTopics = generatePostsForSelectedTopics;
    window.generatePostsForAllEligible = generatePostsForAllEligible;
    window.confirmDeleteTopic = confirmDeleteTopic;
    window.generatePostFromTopic = generatePostFromTopic;
    window.updatePostSelectionState = updatePostSelectionState;
    window.toggleSelectAllPosts = toggleSelectAllPosts;
    window.executePostBulkStatusChange = executePostBulkStatusChange;
    window.confirmDeleteSelectedPosts = confirmDeleteSelectedPosts;
    window.confirmDeletePost = confirmDeletePost;
    window.openGenerateSingleTopicModal = openGenerateSingleTopicModal;
    window.handleGeneratePostFromTopicSubmit = handleGeneratePostFromTopicSubmit;
    window.openDeletePublicationModal = openDeletePublicationModal;
    window.executePublicationDelete = executePublicationDelete;
    window.executePendingDelete = executePendingDelete;
    window.openScheduledPostDetailModal = openScheduledPostDetailModal;
    window.saveScheduledPostEdits = saveScheduledPostEdits;
    window.unscheduleSelectedPost = unscheduleSelectedPost;
    window.unschedulePost = unschedulePost;
    window.resolvePostConflict = resolvePostConflict;
    window.syncFacebook = syncFacebook;

  `;
}
