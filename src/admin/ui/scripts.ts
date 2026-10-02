/**
 * Admin Dashboard UI — Client-Side JavaScript Module
 */

export function getAdminScripts(): string {
  return `
    let csrfToken = '';
    let sessionToken = (function() { try { return localStorage.getItem('admin_session_token') || ''; } catch(e) { return ''; } })();
    let currentTab = 'dashboard';
    let selectedTopicIds = new Set();
    let selectedPostIds = new Set();
    let cachedTopics = [];
    let cachedPosts = [];
    let cachedSchedules = [];
    let facebookPublicationPosts = new Map();
    let facebookPublicationCursor = null;
    let facebookPublicationHasMore = false;
    let facebookPublicationLoading = false;
    let pendingDeleteType = null;
    let pendingDeleteId = null;

    function renderWorkflowStages(item) {
      const isTopic = item && item.post_count !== undefined;
      const topicDone = isTopic || Boolean(item?.idea_id || item?.topicId || item?.topicTitle || item?.topic_title);
      const postDone = isTopic
        ? Number(item.post_count || 0) > 0
        : Boolean(item?.internalPostId || item?.postId || item?.id);
      const publishedDone = Boolean(item?.published_at || item?.publishedAt || item?.facebook_post_id || item?.isPublished);
      const stages = [
        ['Topic', topicDone],
        ['Post', postDone],
        ['Image', Boolean(item?.image_url || item?.imageUrl || (item?.latest_image_status && item.latest_image_status !== 'rejected') || (publishedDone && item?.hasImage === true))],
        ['Scheduled', Boolean(item?.scheduled_at || item?.scheduledAt || item?.latest_scheduled_at || publishedDone)],
        ['Published', publishedDone],
      ];
      const firstPending = stages.findIndex(stage => !stage[1]);
      return '<div class="workflow-stage-track" aria-label="Publication progress">' + stages.map((stage, index) => {
        const className = stage[1] ? 'is-done' : index === firstPending ? 'is-current' : 'is-pending';
        const label = stage[1] ? stage[0] : stage[0] + ' pending';
        return '<span class="workflow-stage ' + className + '" title="' + escapeHtml(label) + '">' + escapeHtml(stage[0]) + '</span>';
      }).join('') + '</div>';
    }

    async function highlightWorkflowRow(idPrefix, itemId) {
      const row = document.getElementById(idPrefix + safeStr(itemId));
      if (!row) return false;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('workflow-highlight');
      window.setTimeout(() => row.classList.remove('workflow-highlight'), 2400);
      return true;
    }

    async function openTopicFromPost(topicId) {
      if (!topicId) return;
      await switchTab('research');
      if (!(await highlightWorkflowRow('topic-row-', topicId))) {
        await loadResearchData(topicId);
        await highlightWorkflowRow('topic-row-', topicId);
      }
    }

    async function openPostFromTopic(postId) {
      if (!postId) return;
      await switchTab('content');
      if (!(await highlightWorkflowRow('post-row-', postId))) {
        await loadContentData(postId);
        await highlightWorkflowRow('post-row-', postId);
      }
    }

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

    const tableSortStates = new WeakMap();
    const observedSortableTables = new WeakSet();
    const activeSortObservers = new WeakMap();

    function getTableCellSortValue(cell) {
      if (!cell) return '';
      const explicitValue = cell.getAttribute('data-sort-value');
      return explicitValue !== null ? explicitValue : safeStr(cell.innerText || cell.textContent).trim();
    }

    function sortTableRows(table, columnIndex, direction) {
      const observer = activeSortObservers.get(table);
      if (observer) observer.disconnect();

      const body = table.tBodies && table.tBodies[0];
      if (!body) return;

      try {
        const rows = Array.from(body.rows).filter(row => row.cells.length > columnIndex && !row.querySelector('[colspan]'));
        if (rows.length < 2) return;
        const header = table.tHead && table.tHead.rows[0] && table.tHead.rows[0].cells[columnIndex];
        const heading = safeLower(header ? header.textContent.replace(/[▲▼↕]/g, '') : '');
        const isDate = /date|time|published|timestamp|created|scheduled|checked|started/.test(heading);
        const isNumeric = /views|reactions|comments|shares|count|items|topics|duration|number|total|priority/.test(heading);
        const keyedRows = rows.map((row, index) => {
          const value = getTableCellSortValue(row.cells[columnIndex]);
          const trimmed = value.trim();
          let key = trimmed.toLocaleLowerCase();
          let empty = !trimmed || trimmed === '—' || trimmed === '-';
          if (isDate && !empty) {
            const parsed = Date.parse(trimmed);
            if (Number.isFinite(parsed)) key = parsed;
            else empty = true;
          } else if (isNumeric && !empty) {
            const parsed = Number(trimmed.replace(/[^0-9.-]/g, ''));
            if (Number.isFinite(parsed)) key = parsed;
          } else if (!empty && /^-?[0-9]+(?:[.,][0-9]+)?$/.test(trimmed)) {
            key = Number(trimmed.replace(',', '.'));
          }
          return { row, key, empty, index };
        });

        keyedRows.sort((a, b) => {
          if (a.empty !== b.empty) return a.empty ? 1 : -1;
          let comparison = typeof a.key === 'number' && typeof b.key === 'number'
            ? a.key - b.key
            : String(a.key).localeCompare(String(b.key), undefined, { numeric: true, sensitivity: 'base' });
          if (direction === 'desc') comparison *= -1;
          return comparison || a.index - b.index;
        });

        const currentRows = Array.from(body.rows);
        const sortedRows = keyedRows.map(item => item.row);
        if (sortedRows.length !== currentRows.length || sortedRows.some((row, index) => row !== currentRows[index])) {
          sortedRows.forEach(row => body.appendChild(row));
        }
      } finally {
        if (observer && body) {
          observer.observe(body, { childList: true });
        }
      }
    }

    function setupSortableTable(table) {
      if (observedSortableTables.has(table)) return;
      observedSortableTables.add(table);
      const headerRow = table.tHead && table.tHead.rows[0];
      if (!headerRow) return;
      Array.from(headerRow.cells).forEach((header, index) => {
        const label = safeLower(header.textContent.replace(/[▲▼↕]/g, '').trim());
        if (!label || /^(actions?|select|checkbox)$/.test(label) || header.querySelector('input[type="checkbox"]')) return;
        header.classList.add('sortable-header');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-label', 'Sort by ' + header.textContent.trim());
        if (!header.querySelector('.table-sort-indicator')) {
          const indicator = document.createElement('span');
          indicator.className = 'table-sort-indicator';
          indicator.setAttribute('aria-hidden', 'true');
          indicator.textContent = '↕';
          header.appendChild(indicator);
        }
        header.dataset.sortColumn = String(index);
      });
      const body = table.tBodies && table.tBodies[0];
      if (body) {
        const observer = new MutationObserver(() => {
          const state = tableSortStates.get(table);
          if (state) sortTableRows(table, state.column, state.direction);
        });
        activeSortObservers.set(table, observer);
        observer.observe(body, { childList: true });
      }
    }

    function initializeSortableTables() {
      document.querySelectorAll('table').forEach(setupSortableTable);
    }

    function activateTableSort(header) {
      const table = header.closest('table');
      const column = Number(header.dataset.sortColumn);
      if (!table || !Number.isInteger(column)) return;
      const previous = tableSortStates.get(table);
      const direction = previous && previous.column === column && previous.direction === 'asc' ? 'desc' : 'asc';
      tableSortStates.set(table, { column, direction });
      Array.from(table.tHead.rows[0].cells).forEach(cell => {
        cell.removeAttribute('aria-sort');
        const indicator = cell.querySelector('.table-sort-indicator');
        if (indicator) indicator.textContent = '↕';
      });
      header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
      const indicator = header.querySelector('.table-sort-indicator');
      if (indicator) indicator.textContent = direction === 'asc' ? '▲' : '▼';
      sortTableRows(table, column, direction);
    }

    document.addEventListener('click', event => {
      const header = event.target && event.target.closest ? event.target.closest('th.sortable-header') : null;
      if (header) activateTableSort(header);
    });
    document.addEventListener('keydown', event => {
      const header = event.target && event.target.closest ? event.target.closest('th.sortable-header') : null;
      if (header && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        activateTableSort(header);
      }
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeSortableTables, { once: true });
    else initializeSortableTables();

    let isCheckingSession = false;
    let initialSessionLoaded = false;
    const activeInFlightRequests = new Map();

    async function guardedFetch(url, options = {}) {
      const method = safeUpper(options ? options.method : 'GET', 'GET');
      const key = method + ':' + url;

      if (method === 'GET' && activeInFlightRequests.has(key)) {
        return activeInFlightRequests.get(key).then(res => typeof res.clone === 'function' ? res.clone() : res);
      }

      const opts = { ...options };
      opts.credentials = opts.credentials || 'same-origin';
      opts.headers = { ...(opts.headers || {}) };
      if (csrfToken && !opts.headers['x-csrf-token']) {
        opts.headers['x-csrf-token'] = csrfToken;
      }
      if (sessionToken && !opts.headers['x-session-token']) {
        opts.headers['x-session-token'] = sessionToken;
      }

      const fetchPromise = (async () => {
        try {
          const res = await fetch(url, opts);
          if (res.status === 401 && !url.includes('/api/auth/session') && !url.includes('/api/auth/login')) {
            showLoginForm();
          }
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
          if (data.sessionToken) {
            sessionToken = safeStr(data.sessionToken);
            try { localStorage.setItem('admin_session_token', sessionToken); } catch (e) {}
          }
          showDashboard(data.user || {});
          if (!initialSessionLoaded) {
            initialSessionLoaded = true;
            const hash = getHashTabName();
            if (hash && (VALID_TABS.includes(hash) || hash === 'manual-publisher')) {
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

    const VALID_TABS = ['dashboard', 'pipeline', 'research', 'content', 'images', 'schedules', 'publications', 'intelligence', 'security', 'audit'];

    function getHashTabName() {
      let h = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
      if (!h && window.location.search && window.location.search.includes('#')) {
        h = window.location.search.split('#')[1] || '';
      }
      if (h && h.includes('?')) {
        h = h.split('?')[0];
      }
      return safeLower(h.trim());
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
      if (!VALID_TABS.includes(tabName)) {
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
        } else if (tabName === 'images') {
          await loadImagesData();
        } else if (tabName === 'schedules') {
          await loadSchedulesData();
        } else if (tabName === 'publications') {
          await loadPublicationsData();
        } else if (tabName === 'intelligence') {
          await loadIntelligenceData();
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
      const hash = getHashTabName();
      if (hash && (VALID_TABS.includes(hash) || hash === 'manual-publisher')) {
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

    function formatScheduleDateHuman(isoString) {
      if (!isoString) return '—';
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;

      const now = new Date();
      const isToday = date.getUTCFullYear() === now.getUTCFullYear() &&
                      date.getUTCMonth() === now.getUTCMonth() &&
                      date.getUTCDate() === now.getUTCDate();

      const tomorrow = new Date(now);
      tomorrow.setUTCDate(now.getUTCDate() + 1);
      const isTomorrow = date.getUTCFullYear() === tomorrow.getUTCFullYear() &&
                         date.getUTCMonth() === tomorrow.getUTCMonth() &&
                         date.getUTCDate() === tomorrow.getUTCDate();

      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const timeStr = hours + ':' + minutes + ' UTC';

      if (isToday) return 'Today, ' + timeStr;
      if (isTomorrow) return 'Tomorrow, ' + timeStr;

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + timeStr;
    }

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

        // 1. Overall Operational Status Badge
        const opBadge = document.getElementById('dash-op-status-badge');
        if (opBadge) {
          const opSt = data.operationalStatus || 'operational';
          if (opSt === 'operational') {
            opBadge.innerHTML = '<span class="status-badge status-healthy">● OPERATIONAL</span>';
          } else if (opSt === 'degraded') {
            opBadge.innerHTML = '<span class="status-badge status-active">● DEGRADED</span>';
          } else {
            opBadge.innerHTML = '<span class="status-badge status-alert">● ATTENTION REQUIRED</span>';
          }
        }

        // 2. Attention Alerts Container
        const attContainer = document.getElementById('dash-attention-container');
        if (attContainer) {
          const items = Array.isArray(data.attentionItems) ? data.attentionItems : [];
          if (items.length > 0) {
            attContainer.style.display = 'block';
            attContainer.innerHTML = items.map(item => {
              const alertClass = item.type === 'error' ? 'alert-error' : 'alert-warning';
              return '<div class="' + alertClass + '" style="margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">' +
                '<div><strong>' + escapeHtml(item.title) + ':</strong> ' + escapeHtml(item.message) + '</div>' +
              '</div>';
            }).join('');
          } else {
            attContainer.style.display = 'none';
            attContainer.innerHTML = '';
          }
        }

        // 3. Next Publication Card (Real D1 Schedule Date!)
        const nextPub = data.nextPublication || {};
        const nextPubEl = document.getElementById('cnt-next-pub');
        const nextPubSub = document.getElementById('cnt-next-pub-sub');

        if (nextPubEl && nextPubSub) {
          if (nextPub.scheduledAt) {
            const dateFormatted = formatScheduleDateHuman(nextPub.scheduledAt);
            if (nextPub.isOverdue) {
              nextPubEl.style.color = 'var(--accent-rose)';
              nextPubEl.innerHTML = '⚠️ Overdue (' + escapeHtml(dateFormatted) + ')';
            } else {
              nextPubEl.style.color = 'var(--text-main)';
              nextPubEl.innerHTML = escapeHtml(dateFormatted);
            }
            const titleSnippet = nextPub.postTitle ? safeStr(nextPub.postTitle).slice(0, 40) + '...' : 'Post queued';
            const remainingStr = nextPub.remainingCount > 1 ? ' (+' + (nextPub.remainingCount - 1) + ' upcoming)' : '';
            nextPubSub.textContent = '"' + titleSnippet + '"' + remainingStr;
          } else {
            nextPubEl.style.color = 'var(--text-muted)';
            nextPubEl.textContent = 'No posts scheduled';
            nextPubSub.textContent = 'Scheduled queue is empty';
          }
        }

        // 4. Facebook Integration Card
        const fbData = data.facebook || {};
        const fbStatusEl = document.getElementById('dash-fb-status');
        const fbSubEl = document.getElementById('dash-fb-sub');
        if (fbStatusEl && fbSubEl) {
          if (fbData.status === 'Connected') {
            fbStatusEl.style.color = 'var(--accent-emerald)';
            fbStatusEl.innerHTML = '● CONNECTED';
            fbSubEl.textContent = fbData.lastPublishedAt
              ? 'Last published ' + formatDateSafe(fbData.lastPublishedAt)
              : 'Page configured & active';
          } else if (fbData.status === 'Disabled') {
            fbStatusEl.style.color = 'var(--accent-amber)';
            fbStatusEl.innerHTML = '○ DISABLED';
            fbSubEl.textContent = 'Publishing disabled in config';
          } else {
            fbStatusEl.style.color = 'var(--accent-rose)';
            fbStatusEl.innerHTML = '✕ NOT CONFIGURED';
            fbSubEl.textContent = 'Missing Meta credentials';
          }
        }

        // 5. Automation Master Card
        const autoData = data.automation || {};
        const autoStatusEl = document.getElementById('dash-automation-status');
        const autoSubEl = document.getElementById('dash-automation-sub');
        if (autoStatusEl && autoSubEl) {
          if (autoData.status === 'Active') {
            autoStatusEl.style.color = 'var(--accent-blue)';
            autoStatusEl.innerHTML = '● ACTIVE';
            autoSubEl.textContent = autoData.schedule || 'Cron: Every 5 minutes';
          } else {
            autoStatusEl.style.color = 'var(--text-muted)';
            autoStatusEl.innerHTML = '○ INACTIVE';
            autoSubEl.textContent = 'Automation disabled';
          }
        }

        // 6. Environment Tag
        const envBadge = document.getElementById('env-badge');
        if (envBadge) {
          const env = safeLower(sys.environment, 'staging');
          envBadge.textContent = env.toUpperCase();
          envBadge.className = 'env-tag env-' + env;
        }

        // 7. Pipeline Counts
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

        // 8. Current Activity Text
        const autoTextEl = document.getElementById('dashboard-automation-text');
        if (autoTextEl) {
          if (nextPub.scheduledAt) {
            autoTextEl.innerHTML = 'All systems operational. Next publication: <strong>' + escapeHtml(formatScheduleDateHuman(nextPub.scheduledAt)) + '</strong>.';
          } else {
            autoTextEl.innerHTML = 'All systems operational. Queue is currently empty.';
          }
        }

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

    async function loadPerformanceData() {
      const summaryEl = document.getElementById('performance-engine-summary');
      if (!summaryEl) return;
      try {
        const res = await guardedFetch('/api/admin/performance');
        if (!res.ok) {
          summaryEl.innerHTML = '<span style="color:var(--text-muted);">Performance Engine offline (HTTP ' + res.status + ')</span>';
          return;
        }
        const data = await res.json();
        const profile = data.profile || {};
        const successPatterns = Array.isArray(profile.successful_patterns) ? profile.successful_patterns : [];
        const failurePatterns = Array.isArray(profile.failure_patterns) ? profile.failure_patterns : [];

        let html = '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:0.75rem;">';
        html += '<div><strong>Evaluation State:</strong> <span class="status-badge ' + (profile.status === 'EVALUATED' ? 'status-healthy' : 'status-disabled') + '">' + escapeHtml(safeStr(profile.status || 'INSUFFICIENT_DATA')) + '</span></div>';
        html += '<div><strong>Evaluated Posts:</strong> ' + Number(profile.total_posts_evaluated || 0) + '</div>';
        html += '<div><strong>Median Engagement:</strong> ' + (Number(profile.median_engagement_rate || 0) * 100).toFixed(2) + '%</div>';
        html += '<div><strong>Last Updated:</strong> ' + (profile.updated_at ? formatDateSafe(profile.updated_at) : 'Never') + '</div>';
        html += '</div>';

        if (successPatterns.length > 0 || failurePatterns.length > 0) {
          html += '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; margin-top:0.5rem; background:rgba(255,255,255,0.02); padding:0.75rem; border-radius:6px;">';
          
          html += '<div>';
          html += '<div style="font-weight:600; color:var(--accent-emerald); margin-bottom:0.35rem;">✓ High-Performing Patterns</div>';
          if (successPatterns.length > 0) {
            html += '<ul style="margin:0; padding-left:1.2rem; font-size:0.8rem; color:var(--text-main);">';
            for (let i = 0; i < successPatterns.length; i++) {
              html += '<li>' + escapeHtml(safeStr(successPatterns[i])) + '</li>';
            }
            html += '</ul>';
          } else {
            html += '<div style="font-size:0.8rem; color:var(--text-muted);">Insufficient data for positive pattern extraction yet.</div>';
          }
          html += '</div>';

          html += '<div>';
          html += '<div style="font-weight:600; color:var(--accent-rose); margin-bottom:0.35rem;">✕ Underperforming Patterns (Avoid)</div>';
          if (failurePatterns.length > 0) {
            html += '<ul style="margin:0; padding-left:1.2rem; font-size:0.8rem; color:var(--text-main);">';
            for (let j = 0; j < failurePatterns.length; j++) {
              html += '<li>' + escapeHtml(safeStr(failurePatterns[j])) + '</li>';
            }
            html += '</ul>';
          } else {
            html += '<div style="font-size:0.8rem; color:var(--text-muted);">No weak pattern triggers detected.</div>';
          }
          html += '</div>';

          html += '</div>';
        } else {
          html += '<div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.35rem;"><em>Collecting publication metrics from Facebook page. Dynamic guidelines will update automatically as post engagement data accumulates.</em></div>';
        }

        summaryEl.innerHTML = html;
      } catch (err) {
        summaryEl.innerHTML = '<span style="color:var(--accent-rose);">Failed to load performance profile.</span>';
      }
    }

    async function loadIntelligenceData() {
      try {
        const res = await guardedFetch('/api/admin/performance');
        if (!res.ok) return;

        const data = await res.json();
        const profile = data.activeProfile || {};
        const metrics = profile.metricsSummary || {};
        const diag = profile.diagnostics || {};

        const modeStr = diag.learningMode || 'EARLY';
        const noticeEl = document.getElementById('intel-early-notice');
        if (noticeEl) {
          noticeEl.style.display = (modeStr === 'EARLY' || modeStr === 'DEVELOPING') ? 'block' : 'none';
        }

        const modeEl = document.getElementById('intel-learning-mode');
        if (modeEl) {
          const badgeClass = modeStr === 'EARLY' ? 'status-healthy' : modeStr === 'DEVELOPING' ? 'status-active' : 'status-healthy';
          modeEl.innerHTML = '<span class="status-badge ' + badgeClass + '">' + modeStr + '</span>';
        }

        const evalCnt = document.getElementById('intel-eval-count');
        if (evalCnt) evalCnt.textContent = Number(diag.evaluatedPostsCount || metrics.totalEvaluated || 0);

        const medRate = document.getElementById('intel-median-rate');
        if (medRate) medRate.textContent = ((Number(diag.medianEngagementRate || metrics.medianEngagementRate || 0)) * 100).toFixed(2) + '%';

        const lowConfCnt = document.getElementById('intel-low-conf-count');
        if (lowConfCnt) lowConfCnt.textContent = Number(diag.lowConfidenceCount || 0);

        const strongCnt = document.getElementById('intel-strong-count');
        if (strongCnt) strongCnt.textContent = Array.isArray(data.strongPosts) ? data.strongPosts.length : Number(diag.activeStrongCount || metrics.outperformingCount || 0);

        const weakCnt = document.getElementById('intel-weak-count');
        if (weakCnt) weakCnt.textContent = Array.isArray(data.weakPosts) ? data.weakPosts.length : Number(diag.activeWeakCount || metrics.underperformingCount || 0);

        // Render Guidelines List
        const guideEl = document.getElementById('intel-guidelines-list');
        if (guideEl) {
          const guidelines = Array.isArray(data.guidelines) ? data.guidelines : [];
          if (guidelines.length > 0) {
            guideEl.innerHTML = guidelines.map((g) => {
              const tier = safeUpper(g.tier || g.type, 'LEARNED');
              const tierClass = tier === 'SYSTEM' ? 'status-disabled' : tier === 'MANUAL' ? 'status-active' : 'status-healthy';
              const text = escapeHtml(safeStr(g.guideline_text || g.text));
              const gId = safeStr(g.id);
              return '<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid var(--border-color);">' +
                '<div><span class="status-badge ' + tierClass + '" style="margin-right:0.5rem;">' + tier + '</span><span>' + text + '</span></div>' +
                (tier === 'MANUAL' ? '<button class="btn-logout" style="font-size:0.7rem; padding:0.15rem 0.4rem;" onclick="deleteManualGuideline(&quot;' + gId + '&quot;)">Delete</button>' : '') +
              '</div>';
            }).join('');
          } else {
            guideEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No active guidelines. Dynamic insights will populate as Facebook post data accumulates.</div>';
          }
        }

        // Helper for confidence badge
        function getConfBadgeHtml(val) {
          var num = Number(val || 0.4);
          var label = num >= 0.8 ? 'HIGH' : num >= 0.6 ? 'MEDIUM' : 'LOW';
          var badgeClass = label === 'HIGH' ? 'status-healthy' : label === 'MEDIUM' ? 'status-active' : 'status-disabled';
          return '<span class="status-badge ' + badgeClass + '">' + label + '</span>';
        }

        // Helper for formatting content snippet
        function formatContentSnippet(content, title, maxLen) {
          maxLen = maxLen || 160;
          var rawContent = safeStr(content).trim();
          var rawTitle = safeStr(title).trim();
          var isFbImportedTitle = rawTitle.toLowerCase() === 'imported facebook post';

          var rawText = rawContent;
          if (!rawText || (isFbImportedTitle && rawContent.toLowerCase() === 'imported facebook post')) {
            if (rawTitle && !isFbImportedTitle) {
              rawText = rawTitle;
            } else {
              rawText = '';
            }
          }

          if (!rawText) {
            return 'No content available';
          }

          var clean = rawText
            .replace(/<[^>]*>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .split(/\\s+/)
            .filter(Boolean)
            .join(' ');

          if (!clean || (isFbImportedTitle && clean.toLowerCase() === 'imported facebook post')) {
            if (rawTitle && !isFbImportedTitle) {
              return rawTitle;
            }
            return 'No content available';
          }

          if (clean.length > maxLen) {
            return clean.slice(0, maxLen).trim() + '…';
          }

          return clean;
        }

        // Render Strong Examples Table
        const strongTable = document.getElementById('intel-strong-table');
        if (strongTable) {
          const strongPosts = Array.isArray(data.strongPosts) ? data.strongPosts : [];
          if (strongPosts.length > 0) {
            strongTable.innerHTML = strongPosts.map((p) => {
              const viewsText = p.exposure_views != null ? Number(p.exposure_views) + ' views' : '<span style="color:var(--text-muted);">N/A</span>';
              const engText = p.weighted_engagement != null ? Number(p.weighted_engagement).toFixed(1) + ' eng. pts' : '<span style="color:var(--text-muted);">N/A</span>';
              const snippetText = p.post_snippet || formatContentSnippet(p.post_content || p.content, p.post_title || p.title, 160);
              const origTitle = safeStr(p.post_title || p.title);
              const tooltipAttr = origTitle ? ' title="' + escapeHtml(origTitle) + '"' : '';

              return '<tr>' +
                '<td style="max-width:380px; white-space:normal; word-break:break-word; line-height:1.45;"' + tooltipAttr + '><strong style="color:var(--text-main); font-weight:600;">' + escapeHtml(snippetText) + '</strong></td>' +
                '<td>' + getConfBadgeHtml(p.confidence) + '</td>' +
                '<td><span class="status-badge status-healthy">' + Number(p.success_score || p.score || 1).toFixed(2) + 'x median</span></td>' +
                '<td>' + Number(p.percentile || 50).toFixed(0) + 'th percentile</td>' +
                '<td>' + viewsText + '</td>' +
                '<td>' + engText + '</td>' +
                '<td><span style="font-size:0.75rem; color:var(--text-muted);">' + escapeHtml(safeStr(p.reason_for_inclusion || 'Top performer')) + '</span></td>' +
              '</tr>';
            }).join('');
          } else {
            strongTable.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No active strong examples.</td></tr>';
          }
        }

        // Render Weak Examples Table
        const weakTable = document.getElementById('intel-weak-table');
        if (weakTable) {
          const weakPosts = Array.isArray(data.weakPosts) ? data.weakPosts : [];
          if (weakPosts.length > 0) {
            weakTable.innerHTML = weakPosts.map((p) => {
              const viewsText = p.exposure_views != null ? Number(p.exposure_views) + ' views' : '<span style="color:var(--text-muted);">N/A</span>';
              const engText = p.weighted_engagement != null ? Number(p.weighted_engagement).toFixed(1) + ' eng. pts' : '<span style="color:var(--text-muted);">N/A</span>';
              const snippetText = p.post_snippet || formatContentSnippet(p.post_content || p.content, p.post_title || p.title, 160);
              const origTitle = safeStr(p.post_title || p.title);
              const tooltipAttr = origTitle ? ' title="' + escapeHtml(origTitle) + '"' : '';

              return '<tr>' +
                '<td style="max-width:380px; white-space:normal; word-break:break-word; line-height:1.45;"' + tooltipAttr + '><strong style="color:var(--text-main); font-weight:600;">' + escapeHtml(snippetText) + '</strong></td>' +
                '<td>' + getConfBadgeHtml(p.confidence) + '</td>' +
                '<td><span class="status-badge status-alert">' + Number(p.success_score || p.score || 0.5).toFixed(2) + 'x median</span></td>' +
                '<td>' + Number(p.percentile || 50).toFixed(0) + 'th percentile</td>' +
                '<td>' + viewsText + '</td>' +
                '<td>' + engText + '</td>' +
                '<td><span style="font-size:0.75rem; color:var(--text-muted);">' + escapeHtml(safeStr(p.reason_for_inclusion || 'Underperforming')) + '</span></td>' +
              '</tr>';
            }).join('');
          } else {
            weakTable.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No active weak examples.</td></tr>';
          }
        }
      } catch (err) {
        console.error('Failed to load Content Intelligence data:', err);
      }
    }

    async function previewGeneratorContext() {
      try {
        const res = await guardedFetch('/api/admin/performance/preview-context');
        if (!res.ok) return;
        const data = await res.json();
        const codeEl = document.getElementById('preview-context-code');
        if (codeEl) {
          codeEl.textContent = JSON.stringify(data.previewPayload || {}, null, 2);
        }
        openModal('preview-context-modal');
      } catch (err) {
        alert('Failed to load generator context preview.');
      }
    }

    // ======================================================================
    // GLOBAL TASK QUEUE / ACTIVITY CENTER SERVICE
    // ======================================================================
    window.TaskQueue = {
      tasks: [],
      isExpanded: true,
      add: function(title, options) {
        var opts = options || {};
        var task = {
          id: 'task_' + Math.random().toString(36).substring(2, 9),
          title: title,
          type: opts.type || 'manual',
          status: 'QUEUED',
          progress: opts.total ? { completed: 0, total: opts.total } : null,
          detail: opts.detail || 'Waiting in queue...',
          errorMessage: null,
          errorDetail: null,
          createdAt: new Date().toISOString(),
          completedAt: null
        };
        this.tasks.unshift(task);
        this.render();
        return task.id;
      },
      start: function(id, detail) {
        var task = this.getTask(id);
        if (!task) return;
        task.status = 'RUNNING';
        if (detail) task.detail = detail;
        this.render();
      },
      updateProgress: function(id, completed, total, detail) {
        var task = this.getTask(id);
        if (!task) return;
        task.status = 'RUNNING';
        task.progress = { completed: completed, total: total };
        if (detail) task.detail = detail;
        this.render();
      },
      complete: function(id, summary) {
        var task = this.getTask(id);
        if (!task) return;
        task.status = 'COMPLETED';
        task.detail = summary || 'Completed successfully.';
        task.completedAt = new Date().toISOString();
        this.render();
        setTimeout(function() {
          window.TaskQueue.render();
        }, 5000);
      },
      fail: function(id, errorMessage, userAdvice) {
        var task = this.getTask(id);
        if (!task) return;
        task.status = 'FAILED';
        task.errorMessage = errorMessage || 'Operation failed.';
        task.detail = userAdvice || errorMessage || 'An unexpected error occurred.';
        task.completedAt = new Date().toISOString();
        this.render();
      },
      getTask: function(id) {
        return this.tasks.find(function(t) { return t.id === id; });
      },
      toggle: function() {
        this.isExpanded = !this.isExpanded;
        var container = document.getElementById('tq-body-container');
        var icon = document.getElementById('tq-toggle-icon');
        if (container) container.style.display = this.isExpanded ? 'flex' : 'none';
        if (icon) icon.textContent = this.isExpanded ? '▲' : '▼';
      },
      render: function() {
        var widget = document.getElementById('global-task-queue-widget');
        var container = document.getElementById('tq-body-container');
        var badge = document.getElementById('tq-header-badge');
        if (!widget || !container) return;

        if (this.tasks.length === 0) {
          widget.style.display = 'none';
          return;
        }

        widget.style.display = 'block';
        var activeTasks = this.tasks.filter(function(t) { return t.status === 'RUNNING' || t.status === 'QUEUED'; });
        if (badge) {
          badge.textContent = activeTasks.length > 0 ? (activeTasks.length + ' Active') : '✓ Completed';
        }

        container.innerHTML = this.tasks.slice(0, 8).map(function(t) {
          var statusClass = 'tq-status-' + t.status.toLowerCase();
          var pct = t.progress && t.progress.total > 0 ? Math.round((t.progress.completed / t.progress.total) * 100) : 0;
          
          return '<div class="tq-item">' +
            '<div class="tq-item-top">' +
              '<div class="tq-item-title" title="' + escapeHtml(safeStr(t.title)) + '">' + escapeHtml(safeStr(t.title)) + '</div>' +
              '<span class="tq-status-badge ' + statusClass + '">' + escapeHtml(t.status) + '</span>' +
            '</div>' +
            '<div class="tq-item-detail">' + escapeHtml(safeStr(t.detail)) + '</div>' +
            (t.progress ? '<div class="tq-progress-bar"><div class="tq-progress-fill" style="width:' + pct + '%;"></div></div>' : '') +
            (t.errorMessage ? '<div class="tq-item-error">' + escapeHtml(safeStr(t.errorMessage)) + '</div>' : '') +
          '</div>';
        }).join('');
      }
    };

    function toggleTaskQueueWidget() {
      if (window.TaskQueue) window.TaskQueue.toggle();
    }
    window.toggleTaskQueueWidget = toggleTaskQueueWidget;

    // ======================================================================
    // MANUAL GUIDELINES & CONTEXT EDITOR HANDLERS
    // ======================================================================
    function openAddGuidelineModal() {
      const input = document.getElementById('guideline-text-input');
      if (input) input.value = '';
      openModal('add-guideline-modal');
    }

    async function saveManualGuideline() {
      const catEl = document.getElementById('guideline-category-select');
      const textEl = document.getElementById('guideline-text-input');
      const category = catEl ? safeStr(catEl.value) : 'DO_MORE';
      const guidelineText = textEl ? safeStr(textEl.value).trim() : '';
      if (!guidelineText) return;

      const taskId = window.TaskQueue.add('Saving Manual Guideline', { type: 'manual' });
      window.TaskQueue.start(taskId, 'Saving guideline to D1...');

      try {
        const res = await fetch('/api/admin/performance/guidelines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ category, guidelineText })
        });
        if (res.ok) {
          closeModal('add-guideline-modal');
          window.TaskQueue.complete(taskId, 'Manual guideline saved.');
          await loadIntelligenceData();
        } else {
          window.TaskQueue.fail(taskId, 'Could not save guideline', 'Server returned error status.');
        }
      } catch (err) {
        window.TaskQueue.fail(taskId, 'Connection Error', 'Network error saving guideline.');
      }
    }

    function openEditGuidelineModal(id, currentText) {
      const idEl = document.getElementById('edit-guideline-id');
      const textEl = document.getElementById('edit-guideline-text-input');
      if (idEl) idEl.value = safeStr(id);
      if (textEl) textEl.value = safeStr(currentText);
      openModal('edit-guideline-modal');
    }

    async function submitUpdateManualGuideline() {
      const idEl = document.getElementById('edit-guideline-id');
      const textEl = document.getElementById('edit-guideline-text-input');
      const id = idEl ? safeStr(idEl.value) : '';
      const text = textEl ? safeStr(textEl.value).trim() : '';
      if (!id || !text) return;

      const taskId = window.TaskQueue.add('Updating Manual Guideline', { type: 'manual' });
      window.TaskQueue.start(taskId, 'Updating guideline...');

      try {
        const res = await fetch('/api/admin/performance/guidelines/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ guidelineText: text, isActive: true })
        });
        if (res.ok) {
          closeModal('edit-guideline-modal');
          window.TaskQueue.complete(taskId, 'Guideline updated.');
          await loadIntelligenceData();
        } else {
          window.TaskQueue.fail(taskId, 'Could not update guideline', 'Server returned error status.');
        }
      } catch (err) {
        window.TaskQueue.fail(taskId, 'Connection Error', 'Failed to update guideline.');
      }
    }

    async function deleteManualGuideline(id) {
      if (!confirm('Are you sure you want to remove this manual guideline?')) return;
      const taskId = window.TaskQueue.add('Deleting Manual Guideline', { type: 'manual' });
      window.TaskQueue.start(taskId, 'Removing guideline...');

      try {
        const res = await fetch('/api/admin/performance/guidelines/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken }
        });
        if (res.ok) {
          window.TaskQueue.complete(taskId, 'Guideline deleted.');
          await loadIntelligenceData();
        } else {
          window.TaskQueue.fail(taskId, 'Could not delete guideline', 'Server error deleting guideline.');
        }
      } catch (err) {
        window.TaskQueue.fail(taskId, 'Connection Error', 'Network failure deleting guideline.');
      }
    }

    async function openGeneratorContextModal() {
      openModal('generator-context-modal');
      const sysEl = document.getElementById('ctx-system-rules');
      const manEl = document.getElementById('ctx-manual-guidelines');
      const lrnEl = document.getElementById('ctx-learned-guidelines');
      const strEl = document.getElementById('ctx-strong-examples');
      const awkEl = document.getElementById('ctx-weak-examples');
      const rawEl = document.getElementById('ctx-raw-instructions');

      if (sysEl) sysEl.innerHTML = '<em>Loading generator context...</em>';

      try {
        const res = await guardedFetch('/api/admin/performance/preview-context');
        const data = await res.json();
        if (res.ok && data.success && data.previewPayload) {
          const payload = data.previewPayload;
          if (sysEl) sysEl.innerHTML = (payload.systemRules || []).map(r => '<div>• ' + escapeHtml(safeStr(r)) + '</div>').join('');
          if (manEl) {
            manEl.innerHTML = (payload.manualGuidelines || []).length > 0
              ? (payload.manualGuidelines || []).map(g => {
                  const id = safeStr(g.id);
                  const text = safeStr(g.guidelineText || g);
                  return '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">' +
                    '<span>☑ ' + escapeHtml(text) + '</span>' +
                    (id ? '<div style="display:flex; gap:0.25rem;">' +
                      '<button class="btn-secondary edit-gl-btn" style="font-size:0.7rem; padding:0.15rem 0.4rem;" data-id="' + escapeHtml(id) + '" data-text="' + escapeHtml(text) + '" onclick="openEditGuidelineModal(this.dataset.id, this.dataset.text)">Edit</button>' +
                      '<button class="btn-logout" style="font-size:0.7rem; padding:0.15rem 0.4rem;" data-id="' + escapeHtml(id) + '" onclick="deleteManualGuideline(this.dataset.id)">Delete</button>' +
                    '</div>' : '') +
                  '</div>';
                }).join('')
              : '<span style="color:var(--text-muted);">No manual guidelines added yet. Click "+ Add Guideline" above to create one.</span>';
          }
          if (lrnEl) {
            lrnEl.innerHTML = (payload.learnedGuidelines || []).length > 0
              ? (payload.learnedGuidelines || []).map(g => '<div>• [' + escapeHtml(safeStr(g.category || 'PATTERN')) + '] ' + escapeHtml(safeStr(g.guidelineText || g)) + '</div>').join('')
              : '<span style="color:var(--text-muted);">No learned insights extracted yet. Evaluates automatically as publications mature.</span>';
          }
          if (strEl) {
            strEl.innerHTML = (payload.activeStrongExamples || []).length > 0
              ? (payload.activeStrongExamples || []).map(e => '<div style="margin-bottom:0.35rem;"><strong>' + escapeHtml(safeStr(e.title)) + '</strong>: <span style="color:var(--text-muted); font-size:0.75rem;">' + escapeHtml(safeStr(e.reasonForInclusion)) + '</span></div>').join('')
              : '<span style="color:var(--text-muted);">No active strong reference posts yet.</span>';
          }
          if (awkEl) {
            awkEl.innerHTML = (payload.activeWeakExamples || []).length > 0
              ? (payload.activeWeakExamples || []).map(e => '<div style="margin-bottom:0.35rem;"><strong>' + escapeHtml(safeStr(e.title)) + '</strong>: <span style="color:var(--text-muted); font-size:0.75rem;">' + escapeHtml(safeStr(e.reasonForInclusion)) + '</span></div>').join('')
              : '<span style="color:var(--text-muted);">No active weak reference posts yet.</span>';
          }
          if (rawEl) rawEl.textContent = safeStr(payload.finalInstructionsText || JSON.stringify(payload, null, 2));
        } else if (sysEl) {
          sysEl.innerHTML = '<span style="color:var(--accent-rose);">Failed to load generator context payload.</span>';
        }
      } catch (err) {
        if (sysEl) sysEl.innerHTML = '<span style="color:var(--accent-rose);">Error connecting to context service.</span>';
      }
    }

    let activeProposedSlots = [];

    async function scheduleSelectedIntelligently() {
      const selectedIds = Array.from(selectedPostIds);
      if (selectedIds.length === 0) {
        alert('Please select at least one post draft.');
        return;
      }
      await runIntelligentSchedulePreview(selectedIds);
    }

    async function scheduleAllEligibleIntelligently() {
      const eligibleIds = cachedPosts
        .filter((p) => p && (p.status === 'approved' || p.status === 'draft') && !p.schedule_id)
        .map((p) => p.id);

      if (eligibleIds.length === 0) {
        alert('No un-scheduled approved or draft posts available.');
        return;
      }
      await runIntelligentSchedulePreview(eligibleIds);
    }

    async function runIntelligentSchedulePreview(postIds) {
      const taskId = window.TaskQueue.add('Calculating Intelligent Schedule', { type: 'manual', total: postIds.length });
      window.TaskQueue.start(taskId, 'Calculating optimal publication slots for ' + postIds.length + ' posts...');

      const tbody = document.getElementById('intelligent-slots-table-body');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Calculating intelligent proposals...</td></tr>';
      }
      openModal('intelligent-schedule-modal');

      try {
        const res = await fetch('/api/admin/content/schedules/intelligent-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ postIds }),
        });
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.proposedSlots)) {
          activeProposedSlots = data.proposedSlots;
          window.TaskQueue.complete(taskId, 'Calculated ' + activeProposedSlots.length + ' proposed schedule slots.');

          if (tbody) {
            if (activeProposedSlots.length > 0) {
              tbody.innerHTML = activeProposedSlots.map((slot) => {
                return '<tr>' +
                  '<td><strong>' + escapeHtml(safeStr(slot.postTitle)) + '</strong></td>' +
                  '<td><span class="code-tag">' + escapeHtml(safeStr(slot.scheduledDate)) + '</span></td>' +
                  '<td><span class="status-badge status-healthy">' + escapeHtml(safeStr(slot.scheduledTime)) + '</span></td>' +
                  '<td><span style="font-size:0.75rem; color:var(--text-muted);">' + escapeHtml(safeStr(slot.reason)) + '</span></td>' +
                '</tr>';
              }).join('');
            } else {
              tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No valid schedule slots could be proposed for the selected posts.</td></tr>';
            }
          }
        } else {
          window.TaskQueue.fail(taskId, 'Schedule Calculation Failed', 'Unable to find available slots.');
          if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--accent-rose); padding:1.5rem;">Failed to calculate schedule proposals.</td></tr>';
          }
        }
      } catch (err) {
        window.TaskQueue.fail(taskId, 'Connection Failure', 'Error calculating schedule proposals.');
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--accent-rose); padding:1.5rem;">Error calculating schedule proposals.</td></tr>';
        }
      }
    }

    async function executeCommitIntelligentSchedule() {
      if (!activeProposedSlots || activeProposedSlots.length === 0) return;
      const taskId = window.TaskQueue.add('Committing Publication Schedule', { type: 'manual', total: activeProposedSlots.length });
      window.TaskQueue.start(taskId, 'Saving ' + activeProposedSlots.length + ' proposed slots to database...');

      const commitBtn = document.getElementById('commit-intelligent-schedule-btn');
      if (commitBtn) commitBtn.textContent = 'Saving schedule...';

      try {
        const res = await fetch('/api/admin/content/schedules/intelligent-commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ slots: activeProposedSlots }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeModal('intelligent-schedule-modal');
          selectedPostIds.clear();
          window.TaskQueue.complete(taskId, 'Successfully scheduled ' + data.committedCount + ' posts.');
          await loadContentData();
          await loadSchedulesData();
        } else {
          window.TaskQueue.fail(taskId, 'Commit Schedule Failed', safeStr(data.error, 'Server rejected schedule commit.'));
        }
      } catch (err) {
        window.TaskQueue.fail(taskId, 'Connection Failure', 'Network error committing schedule.');
      } finally {
        if (commitBtn) commitBtn.textContent = 'Accept & Commit Schedule';
      }
    }

    async function reevaluatePerformanceEngine() {
      const summaryEl = document.getElementById('performance-engine-summary');
      if (summaryEl) summaryEl.innerHTML = '<em>Re-calculating Content Performance Profile...</em>';
      try {
        const res = await fetch('/api/admin/performance/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadIntelligenceData();
        } else {
          if (summaryEl) summaryEl.innerHTML = '<span style="color:var(--accent-rose);">Re-evaluation failed: ' + escapeHtml(safeStr(data.error)) + '</span>';
        }
      } catch (err) {
        if (summaryEl) summaryEl.innerHTML = '<span style="color:var(--accent-rose);">Error connecting to Performance Engine service.</span>';
      }
    }

    // Load Research Tab Data
    async function loadResearchData(topicId) {
      try {
        loadPerformanceData();
        const researchUrl = '/api/admin/research' + (topicId ? '?topicId=' + encodeURIComponent(topicId) : '');
        const res = await guardedFetch(researchUrl);
        if (!res.ok) {
          console.error('Failed to fetch research data:', res.status, res.statusText);
          const topicsBody = document.getElementById('topics-table-body');
          if (topicsBody) {
            topicsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-rose);">Failed to load candidate topics (HTTP ' + res.status + ').</td></tr>';
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

          diagContent.innerHTML = '<div><strong>Discovered:</strong> ' + (latestRun.items_discovered || latestRun.items_found || 0) + ' raw items</div>' +
            '<div><strong>Normalized:</strong> ' + (latestRun.items_normalized || 0) + ' unique</div>' +
            '<div><strong>Irrelevant:</strong> ' + (latestRun.rejected_irrelevant || 0) + '</div>' +
            '<div><strong>Low Quality:</strong> ' + (latestRun.rejected_low_quality || 0) + '</div>' +
            '<div><strong>Duplicates:</strong> ' + (latestRun.duplicates_found || 0) + '</div>' +
            '<div><strong>Final Candidates:</strong> ' + (latestRun.topics_created || 0) + '</div>' +
            '<div style="width:100%; font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">Pillars: ' + pillarStr + '</div>';
        }

        // Topics Table — Lifecycle Separated: Active Queue vs Used
        cachedTopics = Array.isArray(data.topics) ? data.topics : [];
        const topicsBody = document.getElementById('topics-table-body');
        if (topicsBody) {
          if (cachedTopics.length > 0) {
            function isUsedStatus(t) {
              if (!t) return false;
              const st = safeLower(t.status);
              return ['published', 'used', 'rejected', 'post_generated', 'scheduled'].includes(st) || Number(t.post_count || 0) > 0;
            }
            const activeTopics = cachedTopics.filter(function(t) { return t && !isUsedStatus(t); });
            const usedTopics = cachedTopics.filter(function(t) { return t && isUsedStatus(t); });

            function renderRow(t) {
              const id = safeStr(t.id);
              const title = escapeHtml(safeStr(t.title, 'Untitled Topic'));
              const desc = escapeHtml(safeStr(t.description));
              const category = escapeHtml(safeStr(t.content_pillar || t.category, 'WEBSITE'));
              const status = safeStr(t.status || 'queued').toLowerCase();
              const statusUpper = safeUpper(t.status, 'QUEUED');
              const statusClass = (status === 'accepted' || status === 'queued' || status === 'new' || status === 'discovered' || status === 'ready') 
                ? 'status-active' 
                : (status === 'post_generated' || status === 'scheduled')
                ? 'status-active'
                : (status === 'used' || status === 'published')
                ? 'status-healthy' 
                : 'status-disabled';

              const isChecked = selectedTopicIds.has(id) ? 'checked' : '';
              const hasPost = Number(t.post_count || 0) > 0;
              const sourceTitle = safeStr(t.source_title);
              const sourceUrl = safeStr(t.source_url);
              const sourceLink = sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))
                ? '<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-blue);">' + escapeHtml(sourceTitle || 'Source article') + '</a>'
                : escapeHtml(sourceTitle);

              return '<tr data-id="' + id + '" id="topic-row-' + id + '">' +
                '<td style="text-align:center;">' +
                  '<input type="checkbox" class="topic-select-checkbox" data-id="' + id + '" ' + isChecked + ' onchange="updateTopicSelectionState()" />' +
                '</td>' +
                '<td>' +
                  '<strong>' + title + '</strong>' +
                '</td>' +
                '<td>' +
                  (desc ? '<div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">' + desc + '</div>' : '') +
                  (sourceTitle ? '<div style="font-size:0.75rem; margin-top:0.35rem;"><span style="color:var(--text-muted);">Inspired by: </span>' + sourceLink + '</div>' : '') +
                '</td>' +
                '<td><span class="code-tag">' + category + '</span></td>' +
                '<td>' + renderWorkflowStages(t) + (hasPost && t.latest_post_id ? '<button class="btn-secondary" style="margin-top:0.35rem;padding:0.2rem 0.45rem;font-size:0.7rem;" onclick="openPostFromTopic(&quot;' + escapeHtml(safeStr(t.latest_post_id)) + '&quot;)">Open post</button>' : '') + '</td>' +
                '<td><span class="status-badge ' + statusClass + '">' + statusUpper + '</span></td>' +
                '<td>' +
                  '<div style="display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center;">' +
                    '<button class="btn-primary" title="' + (hasPost ? 'Generate a new version of the existing post' : 'Generate the first post for this topic') + '" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="generatePostFromTopic(&quot;' + id + '&quot;)">' + (hasPost ? 'Regenerate post' : 'Generate post') + '</button>' +
                    '<button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="openEditTopicModal(&quot;' + id + '&quot;)">Edit</button>' +
                    '<button class="btn-logout" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="confirmDeleteTopic(&quot;' + id + '&quot;)">Delete</button>' +
                  '</div>' +
                '</td>' +
              '</tr>';
            };

            let bodyHtml = '';
            if (activeTopics.length > 0) {
              if (usedTopics.length > 0) {
                bodyHtml += '<tr><td colspan="7" style="background:rgba(96,165,250,0.1); font-weight:600; color:var(--accent-blue); padding:0.4rem 0.8rem; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">★ Work Queue (Active Topics)</td></tr>';
              }
              bodyHtml += activeTopics.map(renderRow).join('');
            }
            if (usedTopics.length > 0) {
              if (activeTopics.length > 0) {
                bodyHtml += '<tr><td colspan="7" style="background:rgba(255,255,255,0.03); font-weight:600; color:var(--text-muted); padding:0.4rem 0.8rem; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">✓ Completed / Used Topics</td></tr>';
              }
              bodyHtml += usedTopics.map(renderRow).join('');
            }

            topicsBody.innerHTML = bodyHtml;
          } else {
            topicsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">No candidate topics discovered yet.<br/><button class="btn-primary" style="margin-top:0.75rem;" onclick="openAddTopicModal()">+ Add Topic</button></td></tr>';
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
              <td data-sort-value="\${escapeHtml(safeStr(s.last_checked_at))}">\${s.last_checked_at ? formatDateSafe(s.last_checked_at) : 'Never'}</td>
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
                <td data-sort-value="\${escapeHtml(safeStr(r.started_at))}">\${formatDateSafe(r.started_at)}</td>
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
    async function loadContentData(postId) {
      try {
        const contentUrl = '/api/admin/content/posts' + (postId ? '?postId=' + encodeURIComponent(postId) : '');
        const res = await guardedFetch(contentUrl);
        if (!res.ok) {
          console.error('Failed to fetch content data:', res.status, res.statusText);
          const postsBody = document.getElementById('posts-table-body');
          if (postsBody) {
            postsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-rose); padding:1.5rem;">Failed to load post drafts (HTTP ' + res.status + ').</td></tr>';
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
              } else if (syncStatus === 'LOCAL_AHEAD') {
                statusClass = 'status-active';
              }
              
              const pId = safeStr(p.id);
              const pIdeaId = safeStr(p.idea_id);
              const pBody = safeStr(p.latest_body || p.body);
              const isChecked = selectedPostIds.has(pId) ? 'checked' : '';
              const topicLabel = escapeHtml(safeStr(p.topic_title || p.title, pIdeaId ? 'Linked topic' : 'No linked topic'));
              const sourceTitle = safeStr(p.source_title);
              const sourceUrl = safeStr(p.article_source_url);
              const topicCat = safeStr(p.topic_category || p.content_pillar);
              const topicSourceType = safeStr(p.topic_source_type);

              let inspirationHtml = '';
              if (pIdeaId) {
                if (sourceTitle && sourceUrl && /^https?:\\/\\//i.test(sourceUrl)) {
                  inspirationHtml = '<div style="font-size:0.75rem; margin-top:0.3rem;"><span style="color:var(--text-muted);">Inspired by: </span><a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-blue);">' + escapeHtml(sourceTitle) + '</a></div>';
                } else if (sourceTitle) {
                  inspirationHtml = '<div style="font-size:0.75rem; margin-top:0.3rem;"><span style="color:var(--text-muted);">Inspired by: </span>' + escapeHtml(sourceTitle) + '</div>';
                } else if (sourceUrl && /^https?:\\/\\//i.test(sourceUrl)) {
                  inspirationHtml = '<div style="font-size:0.75rem; margin-top:0.3rem;"><span style="color:var(--text-muted);">Inspired by: </span><a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-blue);">' + escapeHtml(sourceUrl) + '</a></div>';
                } else if (topicSourceType === 'manual') {
                  inspirationHtml = '<div style="font-size:0.75rem; margin-top:0.3rem;"><span style="color:var(--text-muted);">Inspired by: </span><span style="color:var(--accent-cyan); font-weight:500;">Manual topic</span></div>';
                } else if (topicCat) {
                  inspirationHtml = '<div style="font-size:0.75rem; margin-top:0.3rem;"><span style="color:var(--text-muted);">Inspired by: </span>' + escapeHtml(topicCat) + ' research</div>';
                }
              }

              const selSource = safeStr(p.selection_source, 'AUTO');
              const imgBadge = selSource === 'MANUAL' 
                ? '<span class="status-badge status-healthy" style="font-size:0.65rem; padding:0.1rem 0.35rem;" title="Manually selected illustration">MANUAL</span>' 
                : '<span class="status-badge status-active" style="font-size:0.65rem; padding:0.1rem 0.35rem;" title="Automatically selected from approved library">AUTO</span>';

              let imageColHtml = '';
              if (p.image_url) {
                imageColHtml = '<div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.35rem;">' +
                  '<button type="button" class="img-preview-btn" onclick="openImageLightboxModal(\\x27' + escapeHtml(p.image_url) + '\\x27, \\x27' + escapeHtml(safeStr(p.topic_title || 'Post image')) + '\\x27)" title="Preview image"><img src="' + escapeHtml(p.image_url) + '" alt="Post image" style="width:56px;height:40px;object-fit:cover;border-radius:4px;"/></button>' +
                  '<div>' + imgBadge + '<br/><button class="btn-secondary" style="padding:0.1rem 0.4rem;font-size:0.7rem;margin-top:0.2rem;" onclick="openDraftImageSelectorModal(\\x27' + pId + '\\x27)">Change</button></div>' +
                  '</div>';
              } else {
                imageColHtml = '<div style="margin-top:0.35rem;"><span class="status-badge status-alert" style="font-size:0.7rem;">⚠️ Image Required</span> <button class="btn-secondary" style="padding:0.15rem 0.4rem;font-size:0.7rem;margin-left:0.3rem;" onclick="openDraftImageSelectorModal(\\x27' + pId + '\\x27)">Select Image</button></div>';
              }

              return \`
              <tr data-id="\${pId}" id="post-row-\${pId}">
                <td style="text-align:center;">
                  <input type="checkbox" class="post-select-checkbox" data-id="\${pId}" \${isChecked} onchange="updatePostSelectionState()" />
                </td>
                <td>
                  \${pIdeaId ? \`<button class="btn-secondary" style="padding:0;border:0;background:transparent;color:var(--accent-blue);text-align:left;" onclick="openTopicFromPost('\${pIdeaId}')">\${topicLabel}</button>\` : '<span>' + topicLabel + '</span>'}
                  \${topicCat ? \`<span style="font-size:0.675rem; background:rgba(255,255,255,0.06); color:var(--accent-cyan); padding:0.1rem 0.35rem; border-radius:4px; margin-left:0.35rem;">\${escapeHtml(topicCat)}</span>\` : ''}
                  \${inspirationHtml}
                </td>
                <td>
                  <div style="font-size:0.85rem; color:var(--text-main); max-width:340px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHtml(pBody)}</div>
                  \${imageColHtml}
                </td>
                <td>\${renderWorkflowStages(p)}</td>
                <td>
                  <span class="status-badge \${statusClass}">\${syncStatus === 'CONFLICT' ? 'SYNC CONFLICT' : escapeHtml(statusStr)}</span>
                </td>
                <td data-sort-value="\${escapeHtml(safeStr(p.created_at))}">\${formatDateOnlySafe(p.created_at)}</td>
                <td>
                  <div style="display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center;">
                    <button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="openEditPostModal('\${pId}')">Edit</button>
                    \${pIdeaId ? \`<button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="generatePostFromTopic('\${pIdeaId}')">Regenerate post</button><button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="openTopicFromPost('\${pIdeaId}')">View topic</button>\` : ''}
                    \${statusStr !== 'PUBLISHED' ? \`
                      <button class="btn-primary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="openInstantPublishModal('\${pId}')">Publish Now</button>
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
            postsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">No post drafts created yet.<br/><button class="btn-primary" style="margin-top:0.75rem;" onclick="openAddPostModal()">+ Add Post</button></td></tr>';
          }
          updatePostSelectionState();
        }
      } catch (err) {
        console.error('Failed to load content data:', err);
      }
    }

    function openInstantPublishModal(postId) {
      const modalPostId = document.getElementById('publish-modal-post-id');
      const modalText = document.getElementById('publish-modal-content-text');
      const post = cachedPosts.find(item => item && item.id === postId);
      if (modalPostId) modalPostId.value = safeStr(postId);
      if (modalText) modalText.value = safeStr(post?.latest_body || post?.body);
      openModal('publish-modal');
    }

    async function findImageForPost(postId) {
      try {
        const response = await fetch('/api/admin/content/posts/' + encodeURIComponent(postId) + '/image/search', {
          method: 'POST', headers: { 'x-csrf-token': csrfToken }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          alert(safeStr(result.error, 'No matching image was found.'));
          return;
        }

        const post = cachedPosts.find(item => item && item.id === postId);
        if (post && (post.status === 'published' || post.facebook_post_id)) {
          const sync = await fetch('/api/admin/facebook/posts/' + encodeURIComponent(postId) + '/update-image', {
            method: 'POST', headers: { 'x-csrf-token': csrfToken }
          });
          if (!sync.ok) {
            const syncResult = await sync.json().catch(() => ({}));
            alert('Image found and saved, but Facebook did not confirm it: ' + safeStr(syncResult.error, 'Unknown Meta API error.'));
          }
        }
        await loadContentData();
      } catch (err) {
        console.error('Failed to find an image for post:', err);
        alert(err instanceof Error ? err.message : 'Image search failed.');
      }
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
            schedBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-rose);">Failed to load scheduled queue (HTTP ' + res.status + ').</td></tr>';
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
            const upcoming = schedules.filter(s => s && s.status !== 'published' && s.post_status !== 'published');
            const published = schedules.filter(s => s && (s.status === 'published' || s.post_status === 'published'));

            let rows = '';

            if (upcoming.length > 0) {
              rows += '<tr class="schedule-section-header"><th colspan="5" style="background:rgba(59,130,246,0.1); color:var(--accent-blue); padding:0.6rem 0.8rem; font-size:0.8rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">⏳ UPCOMING SCHEDULED POSTS (' + upcoming.length + ')</th></tr>';
              rows += upcoming.map(sched => {
                const schedIdStr = safeStr(sched.id);
                const postIdStr = safeStr(sched.post_id);
                const postPreview = safeStr(sched.post_body || sched.postBody || 'Post').replaceAll(String.fromCharCode(10), ' ').replaceAll(String.fromCharCode(13), ' ').replaceAll(String.fromCharCode(9), ' ').slice(0, 72);
                const topicTitle = safeStr(sched.topic_title);
                const topicId = safeStr(sched.idea_id);
                return '<tr>' +
                  '<td>' + (topicId ? '<button class="btn-secondary" style="padding:0;border:0;background:transparent;color:var(--accent-blue);text-align:left;" onclick="openTopicFromPost(&quot;' + escapeHtml(topicId) + '&quot;)">' + escapeHtml(topicTitle || 'View topic') + '</button><div style="font-size:0.78rem;max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(postPreview) + '</div>' : escapeHtml(postPreview)) + '</td>' +
                  '<td>' + renderWorkflowStages({ idea_id: topicId, id: postIdStr || schedIdStr, image_url: sched.image_url, scheduled_at: sched.scheduled_at, facebook_post_id: sched.facebook_post_id }) + '</td>' +
                  '<td data-sort-value="' + escapeHtml(safeStr(sched.scheduled_at)) + '">' + formatDateUtcSafe(sched.scheduled_at) + '</td>' +
                  '<td><span class="status-badge status-healthy">' + escapeHtml(safeUpper(sched.status, 'SCHEDULED')) + '</span></td>' +
                  '<td>' +
                    '<button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="openScheduledPostDetailModal(&quot;' + schedIdStr + '&quot;, &quot;' + postIdStr + '&quot;)">Edit</button>' +
                    '<button class="btn-logout" style="font-size:0.75rem; padding:0.25rem 0.5rem; margin-left:0.25rem;" onclick="unschedulePost(&quot;' + schedIdStr + '&quot;)">Unschedule</button>' +
                  '</td>' +
                '</tr>';
              }).join('');
            } else {
              rows += '<tr class="schedule-section-header"><th colspan="5" style="background:rgba(59,130,246,0.1); color:var(--accent-blue); padding:0.6rem 0.8rem; font-size:0.8rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">⏳ UPCOMING SCHEDULED POSTS (0)</th></tr>';
              rows += '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No upcoming scheduled posts.<br><button class="btn-primary" style="margin-top:0.5rem; font-size:0.8rem;" onclick="openSchedulePostModal()">+ Schedule Draft</button></td></tr>';
            }

            if (published.length > 0) {
              rows += '<tr class="schedule-section-header"><th colspan="5" style="background:rgba(16,185,129,0.1); color:var(--accent-emerald); padding:0.6rem 0.8rem; font-size:0.8rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">✅ PUBLISHED POSTS (' + published.length + ')</th></tr>';
              rows += published.map(sched => {
                const schedIdStr = safeStr(sched.id);
                const postIdStr = safeStr(sched.post_id);
                const fbPostId = safeStr(sched.facebook_post_id);
                const postPreview = safeStr(sched.post_body || sched.postBody || 'Post').replaceAll(String.fromCharCode(10), ' ').replaceAll(String.fromCharCode(13), ' ').replaceAll(String.fromCharCode(9), ' ').slice(0, 72);
                const topicTitle = safeStr(sched.topic_title);
                const topicId = safeStr(sched.idea_id);
                const displayDate = sched.published_at ? 'Published · ' + formatDateUtcSafe(sched.published_at) : (sched.scheduled_at ? 'Published · ' + formatDateUtcSafe(sched.scheduled_at) : 'Published');
                return '<tr class="schedule-published-dimmed" style="opacity:0.75; background:rgba(255,255,255,0.015);">' +
                  '<td>' + (topicId ? '<button class="btn-secondary" style="padding:0;border:0;background:transparent;color:var(--text-muted);text-align:left;" onclick="openTopicFromPost(&quot;' + escapeHtml(topicId) + '&quot;)">' + escapeHtml(topicTitle || 'View topic') + '</button><div style="font-size:0.78rem;max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-muted);">' + escapeHtml(postPreview) + '</div>' : escapeHtml(postPreview)) + '</td>' +
                  '<td>' + renderWorkflowStages({ idea_id: topicId, id: postIdStr || schedIdStr, image_url: sched.image_url, scheduled_at: sched.scheduled_at, facebook_post_id: fbPostId, isPublished: true }) + '</td>' +
                  '<td data-sort-value="' + escapeHtml(safeStr(sched.published_at || sched.scheduled_at)) + '" style="color:var(--accent-emerald); font-weight:500;">' + escapeHtml(displayDate) + '</td>' +
                  '<td><span class="status-badge status-healthy" style="opacity:0.85;">PUBLISHED</span></td>' +
                  '<td>' +
                    '<button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="openFacebookPostDetails(&quot;' + (fbPostId || postIdStr) + '&quot;)">View / Edit</button>' +
                  '</td>' +
                '</tr>';
              }).join('');
            }

            schedBody.innerHTML = rows;
          } else {
            schedBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Nothing scheduled.<br><button class="btn-primary" style="margin-top:0.75rem;" onclick="openSchedulePostModal()">+ Schedule Post</button></td></tr>';
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
                  <td data-sort-value="\${escapeHtml(safeStr(pub.publishedAt))}">\${formatDateSafe(pub.publishedAt)}</td>
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

    async function loadPublicationsData() {
      await loadFacebookPublications(false);
    }

    async function loadFacebookPublications(append) {
      if (facebookPublicationLoading) return;
      facebookPublicationLoading = true;
      const isAppend = Boolean(append);
      const body = document.getElementById('publications-table-body');
      const more = document.getElementById('publications-load-more-wrap');
      try {
        if (!isAppend) {
          facebookPublicationCursor = null;
          facebookPublicationHasMore = false;
          facebookPublicationPosts = new Map();
          if (body) body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);">Loading Facebook posts...</td></tr>';
          if (more) more.style.display = 'none';
        }

        const configResponse = await guardedFetch('/api/admin/meta/status');
        if (configResponse.ok) {
          const config = await configResponse.json();
          const status = safeUpper(config.status, 'NOT_CONFIGURED');
          const badgeClass = status === 'READY' ? 'status-healthy' : status === 'DEGRADED' ? 'status-alert' : status === 'DISABLED' ? 'status-active' : 'status-disabled';
          const badge = document.getElementById('meta-config-badge');
          if (badge) badge.innerHTML = '<span class="status-badge ' + badgeClass + '">' + escapeHtml(status.replace('_', ' ')) + '</span>';
          const pageId = document.getElementById('meta-pageid-val');
          if (pageId) pageId.textContent = config.pageConfigured ? 'Configured (Set)' : 'Missing';
          const token = document.getElementById('meta-token-val');
          if (token) token.textContent = config.accessTokenConfigured ? 'Configured (Set)' : 'Missing';
          const version = document.getElementById('meta-version-val');
          if (version) version.textContent = safeStr(config.graphApiVersion, 'v26.0');
          const enabled = document.getElementById('meta-lock-val');
          if (enabled) enabled.textContent = config.publishingEnabled ? 'ENABLED' : 'DISABLED';
        }

        let url = '/api/admin/facebook/page-posts?limit=5&includeStats=true';
        if (isAppend && facebookPublicationCursor) url += '&after=' + encodeURIComponent(facebookPublicationCursor);
        const response = await guardedFetch(url);
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.error) throw new Error(safeStr(result.error, 'Unable to load Facebook posts (HTTP ' + response.status + ').'));

        const posts = Array.isArray(result.posts) ? result.posts : [];
        posts.forEach(post => { if (post && post.id) facebookPublicationPosts.set(safeStr(post.id), post); });
        facebookPublicationCursor = safeStr(result.paging?.after) || null;
        facebookPublicationHasMore = Boolean(result.paging?.hasMore && facebookPublicationCursor);
        const rows = posts.map(post => {
          if (!post || !post.id) return '';
          const id = escapeHtml(safeStr(post.id));
          const content = safeStr(post.message || post.story, 'Post without text').replaceAll(String.fromCharCode(10), ' ').replaceAll(String.fromCharCode(13), ' ');
          const snippet = content.length > 120 ? content.slice(0, 117) + '...' : content;
          const metric = value => value == null ? '<span title="Metric unavailable from Meta">—</span>' : Number(value).toLocaleString();
          const date = post.createdTime ? new Date(post.createdTime).toLocaleString() : '—';
          const topicLink = post.topicId ? '<button class="btn-secondary" style="padding:0;border:0;background:transparent;color:var(--accent-blue);" onclick="openTopicFromPost(&quot;' + escapeHtml(safeStr(post.topicId)) + '&quot;)">' + escapeHtml(safeStr(post.topicTitle, 'View topic')) + '</button>' : '<span style="color:var(--text-muted);">No linked topic</span>';
          const sourceLink = post.sourceTitle && (safeStr(post.sourceUrl).startsWith('https://') || safeStr(post.sourceUrl).startsWith('http://')) ? '<a href="' + escapeHtml(post.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(post.sourceTitle) + '</a>' : escapeHtml(safeStr(post.sourceTitle));
          const workflow = renderWorkflowStages({ internalPostId: post.internalPostId, topicId: post.topicId, topicTitle: post.topicTitle, imageUrl: post.imageUrl || post.fullPicture, scheduledAt: post.scheduledAt, publishedAt: post.publishedAt, isPublished: post.isPublished });
          return '<tr><td data-sort-value="' + escapeHtml(safeStr(post.createdTime)) + '">' + escapeHtml(date) + '</td>' +
            '<td style="max-width:420px;white-space:normal;">' + escapeHtml(snippet) + '<div style="font-size:0.76rem;margin-top:0.3rem;">' + topicLink + (sourceLink ? '<span style="color:var(--text-muted);"> · Inspired by: </span>' + sourceLink : '') + '</div></td>' +
            '<td>' + workflow + '</td>' +
            '<td data-sort-value="' + (post.views == null ? '' : String(post.views)) + '">' + metric(post.views) + (post.uniqueViews == null ? '' : '<small style="display:block;color:var(--text-muted);">' + metric(post.uniqueViews) + ' unique</small>') + (post.insightsError ? '<small title="' + escapeHtml(post.insightsError) + '" style="display:block;color:var(--text-muted);">not available</small>' : '') + '</td>' +
            '<td data-sort-value="' + (post.reactions == null ? '' : String(post.reactions)) + '">' + metric(post.reactions) + '</td><td data-sort-value="' + (post.comments == null ? '' : String(post.comments)) + '">' + metric(post.comments) + '</td><td data-sort-value="' + (post.shares == null ? '' : String(post.shares)) + '">' + metric(post.shares) + '</td>' +
            '<td><span class="status-badge ' + (post.isHidden ? 'status-disabled' : 'status-healthy') + '">' + (post.isHidden ? 'Hidden' : 'Published') + '</span></td>' +
            '<td><button class="btn-secondary" style="padding:0.3rem 0.55rem;font-size:0.78rem;" onclick="openFacebookPostDetails(&quot;' + id + '&quot;)">Details &amp; edit</button></td></tr>';
        }).join('');
        if (body) {
          if (isAppend) body.insertAdjacentHTML('beforeend', rows);
          else body.innerHTML = rows || '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);">No published Facebook posts found.</td></tr>';
        }
        if (more) more.style.display = facebookPublicationHasMore ? 'block' : 'none';
      } catch (error) {
        console.error('Failed to load Facebook publications:', error);
        if (body && !isAppend) body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--accent-rose);">' + escapeHtml(error instanceof Error ? error.message : String(error)) + '</td></tr>';
      } finally {
        facebookPublicationLoading = false;
      }
    }

    function loadMoreFacebookPublications() {
      if (facebookPublicationHasMore && facebookPublicationCursor) loadFacebookPublications(true);
    }

    function showPublicationAlert(message, success) {
      const alert = document.getElementById('publication-alert');
      if (!alert) return;
      alert.textContent = message;
      alert.className = success ? 'alert-success' : 'alert-error';
      alert.style.display = 'block';
    }

    async function syncFacebookPublications() {
      const button = document.getElementById('sync-facebook-publications');
      if (button) { button.disabled = true; button.textContent = 'Syncing...'; }
      try {
        const response = await guardedFetch('/api/admin/facebook/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: '{}' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(safeStr(data.error, 'Facebook sync failed.'));
        const result = data.result || {};
        showPublicationAlert('Sync complete: ' + safeStr(result.imported, '0') + ' imported, ' + safeStr(result.updated, '0') + ' updated, ' + safeStr(result.conflicts, '0') + ' conflicts, ' + safeStr(result.errors, '0') + ' errors.', result.errors === 0);
        await loadFacebookPublications(false);
      } catch (error) {
        showPublicationAlert(error instanceof Error ? error.message : String(error), false);
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Sync with Facebook'; }
      }
    }

    async function openFacebookPostDetails(facebookPostId) {
      const error = document.getElementById('fb-post-detail-error');
      if (error) error.style.display = 'none';

      let post = facebookPublicationPosts.get(safeStr(facebookPostId));
      if (!post) {
        for (const p of facebookPublicationPosts.values()) {
          if (p && (p.id === facebookPostId || p.internalPostId === facebookPostId || p.facebookPostId === facebookPostId)) {
            post = p;
            break;
          }
        }
      }

      if (!post) {
        const foundSched = (Array.isArray(cachedSchedules) ? cachedSchedules : []).find(s => s && (s.facebook_post_id === facebookPostId || s.post_id === facebookPostId || s.id === facebookPostId));
        if (foundSched) {
          post = {
            id: foundSched.facebook_post_id || foundSched.post_id,
            internalPostId: foundSched.post_id,
            message: foundSched.post_body,
            createdTime: foundSched.published_at || foundSched.scheduled_at,
            topicTitle: foundSched.topic_title,
            fullPicture: foundSched.image_url,
          };
        }
      }

      if (!post) {
        try {
          const res = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(facebookPostId));
          if (res.ok) {
            const data = await res.json();
            const p = data.post;
            if (p) {
              post = {
                id: p.facebook_post_id || p.id,
                internalPostId: p.id,
                message: p.latest_body || p.body,
                createdTime: p.published_at || p.created_at,
                topicTitle: p.topic_title,
                fullPicture: p.image_url,
              };
            }
          }
        } catch {
          // Ignore
        }
      }

      if (!post) {
        alert('Could not find details for this published post.');
        return;
      }

      const contentEl = document.getElementById('fb-post-detail-content');
      if (contentEl) {
        contentEl.value = safeStr(post.message || post.story);
        contentEl.dataset.facebookPostId = safeStr(post.id);
        contentEl.dataset.internalPostId = safeStr(post.internalPostId);
      }

      const metaEl = document.getElementById('fb-post-detail-meta');
      if (metaEl) {
        metaEl.textContent = 'Published ' + (post.createdTime ? new Date(post.createdTime).toLocaleString() : 'date unavailable') + (post.topicTitle ? ' · Topic: ' + safeStr(post.topicTitle) : '');
      }

      const statsEl = document.getElementById('fb-post-detail-stats');
      if (statsEl) {
        const displayMetric = value => value == null ? 'Not available' : Number(value).toLocaleString();
        statsEl.innerHTML = '<div class="card"><div class="card-label">Views</div><div class="card-val">' + displayMetric(post.views) + '</div></div>' +
          '<div class="card"><div class="card-label">Unique views</div><div class="card-val">' + displayMetric(post.uniqueViews) + '</div></div>' +
          '<div class="card"><div class="card-label">Reactions</div><div class="card-val">' + displayMetric(post.reactions) + '</div></div>' +
          '<div class="card"><div class="card-label">Comments</div><div class="card-val">' + displayMetric(post.comments) + '</div></div>' +
          '<div class="card"><div class="card-label">Shares</div><div class="card-val">' + displayMetric(post.shares) + '</div></div>';
      }

      const imageWrap = document.getElementById('fb-post-detail-image-wrap');
      const image = document.getElementById('fb-post-detail-image');
      const removeBtn = document.getElementById('fb-post-remove-image-btn');
      const hasPic = Boolean(post.fullPicture || post.imageUrl);

      if (image && imageWrap) {
        if (hasPic) {
          image.src = safeStr(post.fullPicture || post.imageUrl);
          imageWrap.style.display = 'block';
        } else {
          image.removeAttribute('src');
          imageWrap.style.display = 'none';
        }
      }
      if (removeBtn) {
        removeBtn.style.display = hasPic ? 'inline-block' : 'none';
      }

      const link = document.getElementById('fb-post-detail-link');
      if (link) {
        if (post.permalinkUrl) { link.href = safeStr(post.permalinkUrl); link.style.display = 'inline-block'; }
        else link.style.display = 'none';
      }

      const hideButton = document.getElementById('fb-post-hide-button');
      if (hideButton) {
        hideButton.textContent = post.isHidden ? 'Unhide' : 'Hide';
        hideButton.dataset.facebookPostId = safeStr(post.id);
      }

      openModal('facebook-post-modal');
    }

    async function removeFacebookPostAttachedImage() {
      const textarea = document.getElementById('fb-post-detail-content');
      const internalPostId = safeStr(textarea?.dataset?.internalPostId);
      if (!internalPostId) return;

      if (!confirm('Are you sure you want to remove the image from this post?')) return;

      try {
        const res = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(internalPostId) + '/image', {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken }
        });
        if (res.ok) {
          const imgWrap = document.getElementById('fb-post-detail-image-wrap');
          const img = document.getElementById('fb-post-detail-image');
          const removeBtn = document.getElementById('fb-post-remove-image-btn');
          if (imgWrap) imgWrap.style.display = 'none';
          if (img) img.removeAttribute('src');
          if (removeBtn) removeBtn.style.display = 'none';
          showPublicationAlert('Image removed from post.', true);
          await loadFacebookPublications(false);
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(safeStr(errData.error, 'Failed to remove image.'));
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }

    async function saveFacebookPostEdit() {
      const textarea = document.getElementById('fb-post-detail-content');
      const id = safeStr(textarea.dataset.facebookPostId);
      try {
        const response = await guardedFetch('/api/admin/facebook/page-posts/' + encodeURIComponent(id) + '/update', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ content: textarea.value }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(safeStr(data.error, 'Facebook rejected the update.'));
        closeModal('facebook-post-modal');
        showPublicationAlert('Post updated on Facebook and in local history.', true);
        await loadFacebookPublications(false);
      } catch (error) {
        const element = document.getElementById('fb-post-detail-error');
        element.textContent = error instanceof Error ? error.message : String(error);
        element.style.display = 'block';
      }
    }

    async function saveFacebookPostImage() {
      // Replaced by unified Image Library picker
      openDraftImageSelectorModalForPublication();
    }

    async function toggleFacebookPostHidden() {
      const button = document.getElementById('fb-post-hide-button');
      const id = safeStr(button.dataset.facebookPostId);
      const post = facebookPublicationPosts.get(id);
      if (!post) return;
      try {
        const response = await guardedFetch('/api/admin/facebook/page-posts/' + encodeURIComponent(id) + '/visibility', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ hidden: !post.isHidden }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(safeStr(data.error, 'Facebook rejected the visibility change.'));
        post.isHidden = !post.isHidden;
        closeModal('facebook-post-modal');
        showPublicationAlert(post.isHidden ? 'Post hidden on Facebook.' : 'Post is visible on Facebook again.', true);
        await loadFacebookPublications(false);
      } catch (error) {
        const element = document.getElementById('fb-post-detail-error');
        element.textContent = error instanceof Error ? error.message : String(error);
        element.style.display = 'block';
      }
    }

    async function deleteFacebookPost() {
      const textarea = document.getElementById('fb-post-detail-content');
      const id = safeStr(textarea.dataset.facebookPostId);
      if (!id || !window.confirm('Delete this post from Facebook? This cannot be undone.')) return;
      try {
        const response = await guardedFetch('/api/admin/facebook/page-posts/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'x-csrf-token': csrfToken } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(safeStr(data.error, 'Facebook rejected the deletion.'));
        facebookPublicationPosts.delete(id);
        closeModal('facebook-post-modal');
        showPublicationAlert('Post deleted from Facebook. Local publication history was retained.', true);
        await loadFacebookPublications(false);
      } catch (error) {
        const element = document.getElementById('fb-post-detail-error');
        element.textContent = error instanceof Error ? error.message : String(error);
        element.style.display = 'block';
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
        loadFacebookPublications(false);
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
        loadFacebookPublications(false);
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

        let fetchUrl = '/api/admin/facebook/page-posts?limit=5';
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
              (post.fullPicture ? '<div class="fb-rail-post-img-wrap" style="cursor:pointer;" onclick="openImageLightboxModal(\\x27' + escapeHtml(safeStr(post.fullPicture)) + '\\x27, \\x27Facebook post image\\x27)"><img src="' + escapeHtml(safeStr(post.fullPicture)) + '" alt="Post image" loading="lazy"></div>' : '') +
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

    function openImageLightboxModal(imageUrl, title) {
      if (!imageUrl) return;
      const modal = document.getElementById('image-lightbox-modal');
      const imgEl = document.getElementById('image-lightbox-img');
      const titleEl = document.getElementById('image-lightbox-title');
      if (imgEl) {
        imgEl.src = imageUrl;
        imgEl.alt = title || 'Image preview';
      }
      if (titleEl) {
        titleEl.textContent = title || 'Image preview';
      }
      if (modal) {
        modal.classList.add('active');
      }
    }

    function closeImageLightboxModal() {
      const modal = document.getElementById('image-lightbox-modal');
      if (modal) {
        modal.classList.remove('active');
      }
    }

    function handleLightboxBackdropClick(event) {
      if (event.target && event.target.id === 'image-lightbox-modal') {
        closeImageLightboxModal();
      }
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
      const topic = cachedTopics.find(item => item && item.id === topicId);
      const isRegeneration = Number(topic?.post_count || 0) > 0;
      const alertEl = document.getElementById('research-run-alert');
      if (alertEl) {
        alertEl.textContent = isRegeneration ? 'Generating a new version of the existing post...' : 'Generating post draft...';
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
            const version = Number(data.result?.currentVersion || 0);
            alertEl.textContent = isRegeneration
              ? 'Existing post regenerated as version ' + version + '. The Facebook post was not published or updated automatically.'
              : 'Post draft generated successfully.';
            alertEl.className = 'alert-success';
          }
          await Promise.all([loadResearchData(), loadContentData()]);
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
      const contentInput = document.getElementById('post-input-content');
      const statusInput = document.getElementById('post-input-status');
      const modalTitle = document.getElementById('post-modal-title');
      const imageUrl = document.getElementById('post-input-image-url');
      const imageFile = document.getElementById('post-input-image-file');
      const removeImage = document.getElementById('post-remove-image');
      const imagePreview = document.getElementById('post-image-preview');
      const syncNote = document.getElementById('post-image-sync-note');

      if (idInput) idInput.value = '';
      if (contentInput) contentInput.value = '';
      if (statusInput) statusInput.value = 'draft';
      if (imageUrl) imageUrl.value = '';
      if (imageFile) imageFile.value = '';
      if (removeImage) removeImage.checked = false;
      if (imagePreview) { imagePreview.src = ''; imagePreview.style.display = 'none'; }
      if (syncNote) syncNote.style.display = 'none';
      if (modalTitle) modalTitle.textContent = 'Add Post';

      openModal('post-modal');
    }

    function openEditPostModal(id) {
      const p = cachedPosts.find(item => item && item.id === id);
      if (!p) return;

      const idInput = document.getElementById('post-edit-id');
      const contentInput = document.getElementById('post-input-content');
      const statusInput = document.getElementById('post-input-status');
      const modalTitle = document.getElementById('post-modal-title');
      const imageUrl = document.getElementById('post-input-image-url');
      const imageFile = document.getElementById('post-input-image-file');
      const removeImage = document.getElementById('post-remove-image');
      const imagePreview = document.getElementById('post-image-preview');
      const syncNote = document.getElementById('post-image-sync-note');

      if (idInput) idInput.value = safeStr(p.id);
      if (contentInput) contentInput.value = safeStr(p.latest_body || p.body);
      if (statusInput) statusInput.value = safeStr(p.status || 'draft').toLowerCase();
      if (imageUrl) imageUrl.value = '';
      if (imageFile) imageFile.value = '';
      if (removeImage) removeImage.checked = false;
      if (imagePreview) {
        imagePreview.src = safeStr(p.image_url);
        imagePreview.style.display = p.image_url ? 'block' : 'none';
      }
      if (syncNote) syncNote.style.display = (p.status === 'published' || p.facebook_post_id) ? 'block' : 'none';
      if (modalTitle) modalTitle.textContent = 'Edit Post';

      openModal('post-modal');
    }

    async function handleSavePost(evt) {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      const id = safeStr(document.getElementById('post-edit-id')?.value).trim();
      const content = safeStr(document.getElementById('post-input-content')?.value).trim();
      const status = safeStr(document.getElementById('post-input-status')?.value, 'draft');
      const imageUrl = safeStr(document.getElementById('post-input-image-url')?.value).trim();
      const imageFile = document.getElementById('post-input-image-file')?.files?.[0];
      const removeImage = Boolean(document.getElementById('post-remove-image')?.checked);

      if (!content) return;

      const url = id ? '/api/admin/content/posts/' + encodeURIComponent(id) : '/api/admin/content/manual-post';
      const method = id ? 'PATCH' : 'POST';
      const payload = id ? { body: content, status } : { content, status };

      try {
        const res = await guardedFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.status === 401) {
          alert('Session expired. Please sign in again.');
          showLoginForm();
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert('Failed to save post draft: ' + safeStr(errData.message || errData.error || ('Server returned HTTP ' + res.status)));
          return;
        }

        const saved = await res.json().catch(() => ({}));
        const postId = id || saved.postId;
        let imageWasEdited = false;
        if (postId && imageFile) {
          const imageForm = new FormData();
          imageForm.append('file', imageFile);
          const imageRes = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(postId) + '/image', {
            method: 'POST', body: imageForm
          });
          if (!imageRes.ok) throw new Error(safeStr((await imageRes.json().catch(() => ({}))).error, 'Image upload failed.'));
          imageWasEdited = true;
        } else if (postId && imageUrl) {
          const imageRes = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(postId) + '/image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: imageUrl })
          });
          if (!imageRes.ok) throw new Error(safeStr((await imageRes.json().catch(() => ({}))).error, 'Image save failed.'));
          imageWasEdited = true;
        } else if (postId && removeImage) {
          const imageRes = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(postId) + '/image', {
            method: 'DELETE'
          });
          if (!imageRes.ok) throw new Error('Image removal failed.');
          imageWasEdited = true;
        }
        const p = cachedPosts.find(item => item && item.id === id);
        if (p && (p.status === 'published' || p.facebook_post_id)) {
          // Push to Facebook immediately
          const fbRes = await guardedFetch('/api/admin/facebook/posts/' + encodeURIComponent(id) + '/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
          });
          
          if (fbRes.ok) {
            alert('Saved locally and pushed to Facebook successfully.');
          } else {
            const fbData = await fbRes.json().catch(() => ({}));
            if (fbData.conflict) {
              alert('Saved locally, but a CONFLICT was detected with Facebook! Please resolve it using the "Resolve Conflict" button.');
            } else {
              alert('Saved locally, but failed to push to Facebook: ' + safeStr(fbData.error || fbData.message));
            }
          }
        }
        if (imageWasEdited && p && (p.status === 'published' || p.facebook_post_id)) {
          const imageSync = await guardedFetch('/api/admin/facebook/posts/' + encodeURIComponent(id) + '/update-image', {
            method: 'POST'
          });
          if (!imageSync.ok) {
            const syncData = await imageSync.json().catch(() => ({}));
            alert('Image saved in the app, but Facebook did not confirm the image update: ' + safeStr(syncData.error, 'Unknown Meta API error.'));
          }
        }
        closeModal('post-modal');
        loadContentData();
      } catch (err) {
        console.error('Failed to save post:', err);
        alert(err instanceof Error ? err.message : 'Failed to save post.');
      }
    }

    function confirmDeletePost(id) {
      pendingDeleteType = 'post';
      pendingDeleteId = id;
      const p = cachedPosts.find(item => item && item.id === id);
      const title = document.getElementById('delete-confirm-title');
      const msg = document.getElementById('delete-confirm-message');
      if (title) title.textContent = 'Delete Post Draft';
      if (msg) msg.textContent = 'Are you sure you want to delete this post? This action cannot be undone.';
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
          const preview = safeStr(p.latest_body || p.body || 'Post').replaceAll(String.fromCharCode(10), ' ').replaceAll(String.fromCharCode(13), ' ').replaceAll(String.fromCharCode(9), ' ').slice(0, 72);
          return '<option value="' + safeStr(p.id) + '" ' + selectedAttr + '>' + escapeHtml(preview) + '</option>';
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
      const sched = (Array.isArray(cachedSchedules) ? cachedSchedules : []).find(s => s && (s.id === scheduleId || s.post_id === postId));
      const post = (Array.isArray(cachedPosts) ? cachedPosts : []).find(p => p && p.id === postId) || (sched ? { title: sched.post_title, body: sched.post_body, status: sched.status } : null);

      // If already published, redirect directly to unified published post modal
      if ((sched && (sched.status === 'published' || sched.post_status === 'published')) || (post && post.status === 'published')) {
        const fbPostId = sched?.facebook_post_id || post?.facebook_post_id || postId;
        openFacebookPostDetails(fbPostId);
        return;
      }

      const idInput = document.getElementById('sched-detail-schedule-id');
      const postInput = document.getElementById('sched-detail-post-id');
      const bodyInput = document.getElementById('sched-detail-post-body');
      const dateInput = document.getElementById('sched-detail-date');
      const timeInput = document.getElementById('sched-detail-time');
      const statusBadge = document.getElementById('sched-detail-status-badge');
      const conflictBanner = document.getElementById('sched-detail-conflict-banner');

      if (idInput) idInput.value = safeStr(scheduleId);
      if (postInput) postInput.value = safeStr(postId);
      if (bodyInput) bodyInput.value = safeStr(post?.latest_body || post?.body || sched?.post_body, '');

      if (statusBadge) {
        const st = safeUpper(sched?.status || post?.status, 'SCHEDULED');
        statusBadge.textContent = st;
        statusBadge.className = 'status-badge ' + (st === 'PUBLISHED' ? 'status-healthy' : 'status-active');
      }

      // Populate scheduled date and time
      const scheduledAtStr = sched?.scheduled_at;
      if (scheduledAtStr && !isNaN(new Date(scheduledAtStr).getTime())) {
        const d = new Date(scheduledAtStr);
        if (dateInput) {
          dateInput.value = d.toISOString().split('T')[0];
          dateInput.min = new Date().toISOString().split('T')[0];
        }
        if (timeInput) {
          const hh = String(d.getUTCHours()).padStart(2, '0');
          const mm = String(d.getUTCMinutes()).padStart(2, '0');
          timeInput.value = hh + ':' + mm;
        }
      } else {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (dateInput) {
          dateInput.value = tomorrow.toISOString().split('T')[0];
          dateInput.min = new Date().toISOString().split('T')[0];
        }
        if (timeInput) timeInput.value = '10:00';
      }

      // Populate image
      const imageWrap = document.getElementById('sched-detail-image-wrap');
      const imageEl = document.getElementById('sched-detail-image');
      const imageIdInput = document.getElementById('sched-detail-image-id');
      const removeFlagInput = document.getElementById('sched-detail-remove-image-flag');
      const imageNameEl = document.getElementById('sched-detail-image-name');

      if (removeFlagInput) removeFlagInput.value = 'false';

      const existingImgUrl = sched?.image_url || post?.image_url;
      const existingImgId = sched?.curated_image_id || post?.curated_image_id;

      if (existingImgUrl) {
        if (imageEl) imageEl.src = existingImgUrl;
        if (imageWrap) imageWrap.style.display = 'block';
        if (imageIdInput) imageIdInput.value = safeStr(existingImgId);
        if (imageNameEl) imageNameEl.textContent = 'Illustration attached';
      } else {
        if (imageWrap) imageWrap.style.display = 'none';
        if (imageIdInput) imageIdInput.value = '';
        if (imageNameEl) imageNameEl.textContent = 'No image attached';
      }

      if (conflictBanner) {
        const isConflict = post?.sync_status === 'CONFLICT' || sched?.sync_status === 'CONFLICT';
        conflictBanner.style.display = isConflict ? 'block' : 'none';
      }

      openModal('scheduled-post-detail-modal');
    }

    function removeScheduledModalImage() {
      const wrap = document.getElementById('sched-detail-image-wrap');
      const imgId = document.getElementById('sched-detail-image-id');
      const flag = document.getElementById('sched-detail-remove-image-flag');
      const name = document.getElementById('sched-detail-image-name');
      if (wrap) wrap.style.display = 'none';
      if (imgId) imgId.value = '';
      if (flag) flag.value = 'true';
      if (name) name.textContent = 'Image removed (click Save to confirm)';
    }

    async function saveScheduledPostEdits() {
      const postId = safeStr(document.getElementById('sched-detail-post-id')?.value).trim();
      const body = safeStr(document.getElementById('sched-detail-post-body')?.value).trim();
      const dateVal = safeStr(document.getElementById('sched-detail-date')?.value).trim();
      const timeVal = safeStr(document.getElementById('sched-detail-time')?.value, '10:00').trim();
      const imageId = safeStr(document.getElementById('sched-detail-image-id')?.value).trim();
      const removeImage = document.getElementById('sched-detail-remove-image-flag')?.value === 'true';

      if (!postId || !body) {
        alert('Post content cannot be empty.');
        return;
      }
      if (!dateVal) {
        alert('Scheduled date is required.');
        return;
      }

      const scheduledMs = new Date(dateVal + 'T' + timeVal + ':00Z').getTime();
      if (isNaN(scheduledMs) || scheduledMs < Date.now()) {
        alert('A post cannot be scheduled in the past. Please select a future date and time.');
        return;
      }
      const scheduledAt = new Date(scheduledMs).toISOString();

      try {
        // 1. Save body text
        const resBody = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(postId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ body })
        });
        if (!resBody.ok) {
          const errData = await resBody.json().catch(() => ({}));
          throw new Error(safeStr(errData.error, 'Failed to save post text.'));
        }

        // 2. Save schedule date/time
        const resSched = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(postId) + '/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ scheduledAt })
        });
        if (!resSched.ok) {
          const errData = await resSched.json().catch(() => ({}));
          throw new Error(safeStr(errData.error, 'Failed to update schedule date and time.'));
        }

        // 3. Save image if modified
        if (removeImage) {
          await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(postId) + '/assign-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ action: 'remove' })
          });
        } else if (imageId) {
          await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(postId) + '/assign-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ imageId })
          });
        }

        closeModal('scheduled-post-detail-modal');
        await loadSchedulesData();
        await loadContentData();
      } catch (err) {
        console.error('Failed to save scheduled post edits:', err);
        alert(err instanceof Error ? err.message : String(err));
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
          loadFacebookPublications(false);
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
          loadFacebookPublications(false);
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
          if (!s) return false;
          const isPub = (s.status === 'published' || s.post_status === 'published' || s.published_at);
          const targetDateStr = (isPub && s.published_at) ? s.published_at : s.scheduled_at;
          if (!targetDateStr) return false;
          const d = new Date(targetDateStr);
          return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        });

        html += '<div class="calendar-day-cell' + (isToday ? ' today' : '') + '">';
        html += '<div class="calendar-day-num"><span>' + day + '</span>' + (isToday ? '<span style="font-size:0.65rem; color:#60a5fa;">TODAY</span>' : '') + '</div>';

        dayItems.forEach(item => {
          const isPub = (item.status === 'published' || item.post_status === 'published' || item.published_at);
          const targetDateStr = (isPub && item.published_at) ? item.published_at : item.scheduled_at;
          const timeStr = targetDateStr ? new Date(targetDateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00';
          const preview = escapeHtml(safeStr(item.post_body, 'Post').slice(0, 90));
          const schedIdStr = safeStr(item.id);
          const postIdStr = safeStr(item.post_id);
          const fbPostId = safeStr(item.facebook_post_id);

          if (isPub) {
            html += '<div class="calendar-item-chip" style="cursor:pointer; opacity:0.65; background:rgba(255,255,255,0.06); border-left:3px solid var(--accent-emerald);" title="[Published] ' + preview + '" onclick="openFacebookPostDetails(&quot;' + (fbPostId || postIdStr) + '&quot;)">';
            html += '<span class="calendar-item-time" style="color:var(--accent-emerald);">Published ' + timeStr + '</span>' + preview;
            html += '</div>';
          } else {
            html += '<div class="calendar-item-chip" style="cursor:pointer;" title="' + preview + '" onclick="openScheduledPostDetailModal(&quot;' + schedIdStr + '&quot;, &quot;' + postIdStr + '&quot;)">';
            html += '<span class="calendar-item-time">' + timeStr + '</span>' + preview;
            html += '</div>';
          }
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

    // Image Library Frontend State & Logic
    let currentImageStatusTab = 'PENDING';
    let currentImageCategoryFilter = '';
    let currentImageSearchQuery = '';
    let cachedImages = [];
    let selectedImageIds = new Set();
    let addImageSourceType = 'file';
    let selectedDraftImageId = null;
    let imageSearchDebounceTimer = null;

    function setImageStatusTab(status) {
      currentImageStatusTab = status;
      ['pending', 'approved', 'rejected', 'used', 'all'].forEach(tab => {
        const btn = document.getElementById('img-tab-' + tab);
        if (btn) btn.classList.remove('active');
      });
      const activeBtn = document.getElementById('img-tab-' + status.toLowerCase());
      if (activeBtn) activeBtn.classList.add('active');
      loadImagesData();
    }

    function debounceImageSearch() {
      if (imageSearchDebounceTimer) clearTimeout(imageSearchDebounceTimer);
      imageSearchDebounceTimer = setTimeout(() => {
        const searchInput = document.getElementById('image-search-input');
        currentImageSearchQuery = searchInput ? searchInput.value.trim() : '';
        loadImagesData();
      }, 300);
    }

    async function loadImagesData() {
      try {
        const catSelect = document.getElementById('image-category-filter');
        currentImageCategoryFilter = catSelect ? catSelect.value.trim() : '';

        const gridEl = document.getElementById('image-library-grid');
        if (gridEl) {
          gridEl.innerHTML = Array.from({ length: 8 }).map(() =>
            '<div class="skeleton-card" style="min-height:260px; border-radius:8px;"></div>'
          ).join('');
        }

        const url = '/api/admin/images?status=' + encodeURIComponent(currentImageStatusTab) +
          '&category=' + encodeURIComponent(currentImageCategoryFilter) +
          '&search=' + encodeURIComponent(currentImageSearchQuery) +
          '&limit=40';

        const res = await guardedFetch(url);
        if (!res.ok) {
          console.error('Failed to load images:', res.status);
          if (gridEl) gridEl.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; color:var(--accent-rose); padding:3rem;">Failed to load image library.</div>';
          return;
        }

        const data = await res.json();
        cachedImages = Array.isArray(data.images) ? data.images : [];

        // Update counts
        if (data.counts) {
          const p = document.getElementById('img-count-pending');
          const a = document.getElementById('img-count-approved');
          const r = document.getElementById('img-count-rejected');
          const u = document.getElementById('img-count-used');
          const all = document.getElementById('img-count-all');
          if (p) p.textContent = data.counts.pending || 0;
          if (a) a.textContent = data.counts.approved || 0;
          if (r) r.textContent = data.counts.rejected || 0;
          if (u) u.textContent = data.counts.used || 0;
          if (all) all.textContent = data.counts.total || 0;
        }

        renderImageLibraryGrid(cachedImages);
      } catch (err) {
        console.error('Failed to load image library data:', err);
        const gridEl = document.getElementById('image-library-grid');
        if (gridEl) gridEl.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; color:var(--accent-rose); padding:3rem;">Failed to connect to server.</div>';
      }
    }

    function renderImageLibraryGrid(images) {
      const gridEl = document.getElementById('image-library-grid');
      if (!gridEl) return;

      if (!images || images.length === 0) {
        gridEl.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; color:var(--text-muted); padding:3rem;">No images found in this filter view.</div>';
        return;
      }

      gridEl.innerHTML = images.map(img => {
        const imgId = safeStr(img.id);
        const title = escapeHtml(safeStr(img.title, 'Untitled Image'));
        const sourceUrl = safeStr(img.source_url || img.r2_key);
        const category = escapeHtml(safeStr(img.category, 'General'));
        const keywords = escapeHtml(safeStr(img.keywords, '—'));
        const author = escapeHtml(safeStr(img.author, 'Unknown'));
        const license = escapeHtml(safeStr(img.license, 'Custom'));
        const status = safeUpper(img.status, 'PENDING');
        const usageCount = Number(img.usage_count || 0);
        const historicalCount = Number(img.historical_usage_count || 0);

        let statusBadgeClass = 'status-disabled';
        if (status === 'APPROVED') statusBadgeClass = 'status-healthy';
        else if (status === 'PENDING') statusBadgeClass = 'status-active';
        else if (status === 'REJECTED') statusBadgeClass = 'status-alert';

        const isChecked = selectedImageIds.has(imgId) ? 'checked' : '';

        let usageHtml = '';
        if (usageCount > 0 && historicalCount > 0) {
          usageHtml = '<span style="color:var(--accent-emerald);">Active in ' + usageCount + ' post(s)</span> &bull; <span style="color:var(--text-muted);">Published ' + historicalCount + 'x</span>';
        } else if (usageCount > 0) {
          usageHtml = '<span style="color:var(--accent-emerald);">Active in ' + usageCount + ' post(s)</span>';
        } else if (historicalCount > 0) {
          usageHtml = '<span style="color:var(--accent-cyan);">Published ' + historicalCount + 'x</span> &bull; <span style="color:var(--text-muted);">No active draft</span>';
        } else {
          usageHtml = '<span style="color:var(--accent-blue);">Never used</span>';
        }

        return '<div class="image-card" id="img-card-' + imgId + '">' +
            '<div style="position:relative;">' +
              '<input type="checkbox" class="img-select-checkbox" data-id="' + imgId + '" ' + isChecked + ' onchange="updateImageSelectionState()" style="position:absolute; top:8px; left:8px; z-index:2;" />' +
              '<button type="button" class="img-preview-btn" style="width:100%;display:block;" onclick="openImageLightboxModal(&quot;' + escapeHtml(sourceUrl) + '&quot;, &quot;' + escapeHtml(title) + '&quot;)" aria-label="Preview image: ' + escapeHtml(title) + '">' +
                '<img src="' + escapeHtml(sourceUrl) + '" alt="' + title + '" class="image-card-preview" loading="lazy" decoding="async" />' +
              '</button>' +
              '<span class="status-badge ' + statusBadgeClass + '" style="position:absolute; top:8px; right:8px; font-size:0.65rem;">' + status + '</span>' +
            '</div>' +
            '<div class="image-card-body">' +
              '<div class="image-card-title" title="' + title + '">' + title + '</div>' +
              '<div class="image-card-meta">' +
                '<span style="background:rgba(255,255,255,0.06); color:var(--accent-cyan); padding:0.1rem 0.35rem; border-radius:4px; font-weight:600;">' + category + '</span>' +
                '<span style="color:var(--text-muted);">By ' + author + ' (' + license + ')</span>' +
              '</div>' +
              '<div style="font-size:0.75rem; color:var(--text-subtle); max-height:36px; overflow:hidden; text-overflow:ellipsis;">' +
                keywords +
              '</div>' +
              '<div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.2rem;">' +
                usageHtml +
                (img.reserved_post_id ? ' &bull; <span style="color:var(--accent-amber);">Reserved</span>' : '') +
              '</div>' +
              '<div class="image-card-actions">' +
                (status !== 'APPROVED' ? '<button class="btn-primary" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="quickApproveImage(&quot;' + imgId + '&quot;)">Approve</button>' : '') +
                (status !== 'REJECTED' ? '<button class="btn-secondary" style="padding:0.2rem 0.5rem; font-size:0.75rem; color:var(--accent-amber);" onclick="quickRejectImage(&quot;' + imgId + '&quot;)">Reject</button>' : '') +
                '<button class="btn-secondary" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="openEditImageModal(&quot;' + imgId + '&quot;)">Edit</button>' +
                '<button class="btn-logout" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="deleteImage(&quot;' + imgId + '&quot;)">Delete</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      }).join('');
    }

    let isCandidateDiscoveryRunning = false;

    async function openDiscoverImageModal() {
      if (isCandidateDiscoveryRunning) return;
      resetDiscoverModalForm();
      openModal('discover-image-modal');

      const selectEl = document.getElementById('discover-topic-select');
      if (selectEl) {
        selectEl.innerHTML = '<option value="">-- Loading system topics &amp; categories... --</option>';
      }

      try {
        const res = await guardedFetch('/api/admin/images/discovery-topics');
        const data = await res.json();

        if (data.success && selectEl) {
          let html = '<option value="">-- Select a topic / category --</option>';

          if (data.pillars && data.pillars.length > 0) {
            html += '<optgroup label="Standard Content Pillars">';
            data.pillars.forEach((p) => {
              html += '<option value="pillar:' + escapeHtml(p.id) + '" data-query="' + escapeHtml(p.name) + '" data-category="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</option>';
            });
            html += '</optgroup>';
          }

          if (data.systemTopics && data.systemTopics.length > 0) {
            html += '<optgroup label="Active System Research Topics">';
            data.systemTopics.forEach((t) => {
              const cat = t.category || t.content_pillar || 'Technology & Business';
              html += '<option value="topic:' + escapeHtml(t.id) + '" data-query="' + escapeHtml(t.title) + '" data-category="' + escapeHtml(cat) + '">' + escapeHtml(t.title) + '</option>';
            });
            html += '</optgroup>';
          }

          html += '<optgroup label="Custom Search">';
          html += '<option value="__CUSTOM__">✏️ Custom topic...</option>';
          html += '</optgroup>';

          selectEl.innerHTML = html;

          if (data.pillars && data.pillars[0]) {
            selectEl.value = 'pillar:' + data.pillars[0].id;
            handleDiscoverTopicSelectChange();
          }
        }
      } catch (err) {
        console.error('[DiscoverModal] Failed to fetch topics:', err);
        if (selectEl) {
          selectEl.innerHTML = '<option value="pillar:AI" data-query="AI &amp; Business Automation" data-category="AI &amp; Business Automation">AI &amp; Business Automation</option><option value="pillar:WEBSITE" data-query="Websites &amp; Landing Pages" data-category="Websites &amp; Landing Pages">Websites &amp; Landing Pages</option><option value="pillar:MARKETING" data-query="Marketing &amp; Customer Acquisition" data-category="Marketing &amp; Customer Acquisition">Marketing &amp; Customer Acquisition</option><option value="pillar:SALES" data-query="Sales &amp; Conversion Process" data-category="Sales &amp; Conversion Process">Sales &amp; Conversion Process</option><option value="pillar:SMALL_BUSINESS" data-query="Small Business Productivity &amp; Ops" data-category="Small Business Productivity &amp; Ops">Small Business Productivity &amp; Ops</option><option value="pillar:CUSTOMER_EXPERIENCE" data-query="Customer Experience &amp; Trust" data-category="Customer Experience &amp; Trust">Customer Experience &amp; Trust</option><option value="pillar:LOCAL_BUSINESS" data-query="Local Business &amp; Regional Context" data-category="Local Business &amp; Regional Context">Local Business &amp; Regional Context</option><option value="__CUSTOM__">✏️ Custom topic...</option>';
          selectEl.value = 'pillar:AI';
          handleDiscoverTopicSelectChange();
        }
      }
    }

    function handleDiscoverTopicSelectChange() {
      const selectEl = document.getElementById('discover-topic-select');
      const customGrp = document.getElementById('discover-custom-topic-group');
      const categorySelect = document.getElementById('discover-category-select');
      if (!selectEl) return;

      const val = selectEl.value;
      if (val === '__CUSTOM__') {
        if (customGrp) customGrp.style.display = 'block';
        const customInput = document.getElementById('discover-custom-topic-input');
        if (customInput) customInput.focus();
      } else {
        if (customGrp) customGrp.style.display = 'none';
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        if (selectedOpt && categorySelect) {
          const cat = selectedOpt.getAttribute('data-category');
          if (cat) {
            for (let i = 0; i < categorySelect.options.length; i++) {
              if (categorySelect.options[i].value.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(categorySelect.options[i].value.toLowerCase())) {
                categorySelect.selectedIndex = i;
                break;
              }
            }
          }
        }
      }
      validateDiscoverForm();
    }

    function validateDiscoverForm() {
      const selectEl = document.getElementById('discover-topic-select');
      const customInput = document.getElementById('discover-custom-topic-input');
      const btn = document.getElementById('start-discovery-btn');
      if (!btn) return;

      const val = selectEl ? selectEl.value : '';
      if (!val) {
        btn.disabled = true;
        return;
      }

      if (val === '__CUSTOM__') {
        const customTxt = customInput ? customInput.value.trim() : '';
        btn.disabled = customTxt.length === 0;
      } else {
        btn.disabled = false;
      }
    }

    function resetDiscoverModalForm() {
      setDiscoverModalView('form');
      const customGrp = document.getElementById('discover-custom-topic-group');
      if (customGrp) customGrp.style.display = 'none';
      const customInput = document.getElementById('discover-custom-topic-input');
      if (customInput) customInput.value = '';
      validateDiscoverForm();
    }

    function setDiscoverModalView(viewName) {
      const formV = document.getElementById('discover-view-form');
      const formF = document.getElementById('discover-footer-form');
      const progV = document.getElementById('discover-view-progress');
      const progF = document.getElementById('discover-footer-progress');
      const resV = document.getElementById('discover-view-result');
      const resF = document.getElementById('discover-footer-result');
      const errV = document.getElementById('discover-view-error');
      const errF = document.getElementById('discover-footer-error');
      const empV = document.getElementById('discover-view-empty');
      const empF = document.getElementById('discover-footer-empty');

      if (formV) formV.style.display = viewName === 'form' ? 'block' : 'none';
      if (formF) formF.style.display = viewName === 'form' ? 'flex' : 'none';

      if (progV) progV.style.display = viewName === 'progress' ? 'block' : 'none';
      if (progF) progF.style.display = viewName === 'progress' ? 'flex' : 'none';

      if (resV) resV.style.display = viewName === 'result' ? 'block' : 'none';
      if (resF) resF.style.display = viewName === 'result' ? 'flex' : 'none';

      if (errV) errV.style.display = viewName === 'error' ? 'block' : 'none';
      if (errF) errF.style.display = viewName === 'error' ? 'flex' : 'none';

      if (empV) empV.style.display = viewName === 'empty' ? 'block' : 'none';
      if (empF) empF.style.display = viewName === 'empty' ? 'flex' : 'none';
    }

    function updateDiscoverStep(stepNum, status, detailText) {
      const stepItem = document.getElementById('disc-step-' + stepNum);
      const stepIcon = document.getElementById('disc-step-icon-' + stepNum);
      const stepSub = document.getElementById('disc-step-sub-' + stepNum);

      if (!stepItem || !stepIcon) return;

      if (status === 'active') {
        stepItem.style.opacity = '1';
        stepIcon.style.background = 'var(--accent-blue)';
        stepIcon.style.color = '#fff';
        stepIcon.textContent = '●';
      } else if (status === 'completed') {
        stepItem.style.opacity = '1';
        stepIcon.style.background = 'var(--accent-emerald)';
        stepIcon.style.color = '#fff';
        stepIcon.textContent = '✓';
      } else {
        stepItem.style.opacity = '0.5';
        stepIcon.style.background = 'rgba(255,255,255,0.1)';
        stepIcon.style.color = 'var(--text-muted)';
        stepIcon.textContent = '○';
      }

      if (detailText && stepSub) {
        stepSub.textContent = detailText;
      }
    }

    async function startCandidateDiscovery() {
      if (isCandidateDiscoveryRunning) return;

      const selectEl = document.getElementById('discover-topic-select');
      const customInput = document.getElementById('discover-custom-topic-input');
      const categorySelect = document.getElementById('discover-category-select');

      let query = '';
      let category = categorySelect ? categorySelect.value : 'Technology & Business';

      const selVal = selectEl ? selectEl.value : '';
      if (selVal === '__CUSTOM__') {
        query = customInput ? customInput.value.trim() : '';
      } else if (selectEl && selectEl.selectedIndex >= 0) {
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        query = selectedOpt.getAttribute('data-query') || selectedOpt.text;
      }

      if (!query) {
        alert('Please enter or select a topic for candidate discovery.');
        return;
      }

      isCandidateDiscoveryRunning = true;

      const discHeaderBtn = document.getElementById('discover-candidates-btn');
      const startModalBtn = document.getElementById('start-discovery-btn');
      if (discHeaderBtn) discHeaderBtn.disabled = true;
      if (startModalBtn) startModalBtn.disabled = true;

      setDiscoverModalView('progress');

      const topicTitleEl = document.getElementById('discover-progress-topic');
      const detailBox = document.getElementById('discover-live-detail-box');
      if (topicTitleEl) topicTitleEl.textContent = '"' + query + '"';

      for (let i = 1; i <= 5; i++) {
        updateDiscoverStep(i, i === 1 ? 'active' : 'pending');
      }

      try {
        if (detailBox) detailBox.textContent = 'Initializing search strategy for "' + query + '"...';
        await new Promise((r) => setTimeout(r, 400));

        updateDiscoverStep(1, 'completed');
        updateDiscoverStep(2, 'active');
        if (detailBox) detailBox.textContent = 'Querying Openverse API for open-license candidates...';

        const resPromise = guardedFetch('/api/admin/images/candidate-discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ query, category }),
        });

        await new Promise((r) => setTimeout(r, 450));
        updateDiscoverStep(2, 'completed');
        updateDiscoverStep(3, 'active');
        if (detailBox) detailBox.textContent = 'Evaluating candidate metadata & license compliance...';

        const res = await resPromise;
        const data = await res.json();

        if (!data.success) {
          throw new Error(safeStr(data.error, 'Candidate discovery failed.'));
        }

        updateDiscoverStep(3, 'completed');
        updateDiscoverStep(4, 'active', (data.skippedCount || 0) + ' duplicate(s) skipped');
        if (detailBox) detailBox.textContent = 'Filtering duplicates & checking 90-day reuse window...';
        await new Promise((r) => setTimeout(r, 300));

        updateDiscoverStep(4, 'completed');
        updateDiscoverStep(5, 'active', (data.addedCount || 0) + ' candidate(s) saved as PENDING');
        if (detailBox) detailBox.textContent = 'Saving candidate records to Image Library...';
        await new Promise((r) => setTimeout(r, 300));

        updateDiscoverStep(5, 'completed');

        const total = data.totalDiscovered ?? 0;
        const added = data.addedCount ?? 0;
        const skipped = data.skippedCount ?? 0;

        if (total === 0 || (added === 0 && skipped === 0)) {
          const emptyTopicEl = document.getElementById('discover-empty-topic-name');
          if (emptyTopicEl) emptyTopicEl.textContent = '"' + query + '"';
          setDiscoverModalView('empty');
        } else {
          const topicNameEl = document.getElementById('discover-result-topic-name');
          const totalEl = document.getElementById('discover-stat-total');
          const addedEl = document.getElementById('discover-stat-added');
          const skippedEl = document.getElementById('discover-stat-skipped');

          if (topicNameEl) topicNameEl.textContent = query;
          if (totalEl) totalEl.textContent = String(total);
          if (addedEl) addedEl.textContent = String(added);
          if (skippedEl) skippedEl.textContent = String(skipped);

          setDiscoverModalView('result');
        }
      } catch (err) {
        console.error('Candidate discovery error:', err);
        const errReasonEl = document.getElementById('discover-error-reason');
        if (errReasonEl) {
          errReasonEl.textContent = err instanceof Error ? err.message : String(err);
        }
        setDiscoverModalView('error');
      } finally {
        isCandidateDiscoveryRunning = false;
        if (discHeaderBtn) discHeaderBtn.disabled = false;
        if (startModalBtn) startModalBtn.disabled = false;
      }
    }

    function closeDiscoverModalAndViewPending() {
      closeModal('discover-image-modal');
      setImageStatusTab('PENDING');
      refreshImageLibrary();
    }

    function openAddImageModal() {
      setAddImageSourceType('file');
      openModal('add-image-modal');
    }

    function setAddImageSourceType(type) {
      addImageSourceType = type;
      const fileBtn = document.getElementById('add-img-type-file-btn');
      const urlBtn = document.getElementById('add-img-type-url-btn');
      const fileGrp = document.getElementById('add-img-file-group');
      const urlGrp = document.getElementById('add-img-url-group');

      if (type === 'file') {
        if (fileBtn) fileBtn.classList.add('active');
        if (urlBtn) urlBtn.classList.remove('active');
        if (fileGrp) fileGrp.style.display = 'block';
        if (urlGrp) urlGrp.style.display = 'none';
      } else {
        if (urlBtn) urlBtn.classList.add('active');
        if (fileBtn) fileBtn.classList.remove('active');
        if (urlGrp) urlGrp.style.display = 'block';
        if (fileGrp) fileGrp.style.display = 'none';
      }
    }

    async function submitAddImageForm(e) {
      if (e) e.preventDefault();
      try {
        const title = document.getElementById('add-img-title-input').value;
        const category = document.getElementById('add-img-category-select').value;
        const keywords = document.getElementById('add-img-keywords-input').value;
        const description = document.getElementById('add-img-description-input').value;
        const author = document.getElementById('add-img-author-input').value;
        const license = document.getElementById('add-img-license-input').value;
        const status = document.getElementById('add-img-status-select').value;
        const notes = document.getElementById('add-img-notes-input').value;

        let res;
        if (addImageSourceType === 'file') {
          const fileInput = document.getElementById('add-img-file-input');
          if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            alert('Please select an image file to upload.');
            return;
          }

          const formData = new FormData();
          formData.append('file', fileInput.files[0]);
          formData.append('title', title);
          formData.append('category', category);
          formData.append('keywords', keywords);
          formData.append('description', description);
          formData.append('author', author);
          formData.append('license', license);
          formData.append('status', status);
          formData.append('notes', notes);

          res = await fetch('/api/admin/images', {
            method: 'POST',
            headers: { 'x-csrf-token': csrfToken },
            body: formData,
          });
        } else {
          const urlInput = document.getElementById('add-img-url-input');
          const url = urlInput ? urlInput.value.trim() : '';
          if (!url) {
            alert('Please enter a valid HTTPS image URL.');
            return;
          }

          res = await guardedFetch('/api/admin/images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({
              title,
              url,
              category,
              keywords,
              description,
              author,
              license,
              status,
              notes,
            }),
          });
        }

        const data = await res.json();
        if (data.success) {
          closeModal('add-image-modal');
          loadImagesData();
        } else {
          alert(safeStr(data.error, 'Failed to add image.'));
        }
      } catch (err) {
        console.error('Error adding image:', err);
      }
    }

    function openEditImageModal(imageId) {
      const img = cachedImages.find(i => i && i.id === imageId);
      if (!img) return;

      document.getElementById('edit-img-id').value = img.id;
      document.getElementById('edit-img-title-input').value = safeStr(img.title);
      document.getElementById('edit-img-category-select').value = safeStr(img.category, 'General');
      document.getElementById('edit-img-keywords-input').value = safeStr(img.keywords);
      document.getElementById('edit-img-description-input').value = safeStr(img.description);
      document.getElementById('edit-img-author-input').value = safeStr(img.author);
      document.getElementById('edit-img-license-input').value = safeStr(img.license);
      document.getElementById('edit-img-status-select').value = safeStr(img.status, 'PENDING');
      document.getElementById('edit-img-notes-input').value = safeStr(img.notes);

      const preview = document.getElementById('edit-img-preview');
      const srcType = document.getElementById('edit-img-source-type');
      const urlDisp = document.getElementById('edit-img-url-display');
      if (preview) preview.src = safeStr(img.source_url || img.r2_key);
      if (srcType) srcType.textContent = safeStr(img.source_type, 'DISCOVERED');
      if (urlDisp) urlDisp.textContent = safeStr(img.source_url);

      openModal('edit-image-modal');
    }

    async function submitEditImageForm(e) {
      if (e) e.preventDefault();
      try {
        const id = document.getElementById('edit-img-id').value;
        const title = document.getElementById('edit-img-title-input').value;
        const category = document.getElementById('edit-img-category-select').value;
        const keywords = document.getElementById('edit-img-keywords-input').value;
        const description = document.getElementById('edit-img-description-input').value;
        const author = document.getElementById('edit-img-author-input').value;
        const license = document.getElementById('edit-img-license-input').value;
        const status = document.getElementById('edit-img-status-select').value;
        const notes = document.getElementById('edit-img-notes-input').value;

        const res = await guardedFetch('/api/admin/images/' + encodeURIComponent(id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({
            title, category, keywords, description, author, license, status, notes
          }),
        });
        const data = await res.json();
        if (data.success) {
          closeModal('edit-image-modal');
          loadImagesData();
        } else {
          alert(safeStr(data.error, 'Failed to update image metadata.'));
        }
      } catch (err) {
        console.error('Error updating image metadata:', err);
      }
    }

    async function quickApproveImage(imageId) {
      try {
        const res = await guardedFetch('/api/admin/images/' + encodeURIComponent(imageId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ status: 'APPROVED' }),
        });
        if (res.ok) loadImagesData();
      } catch (err) {
        console.error('Failed to approve image:', err);
      }
    }

    async function quickRejectImage(imageId) {
      try {
        const res = await guardedFetch('/api/admin/images/' + encodeURIComponent(imageId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ status: 'REJECTED' }),
        });
        if (res.ok) loadImagesData();
      } catch (err) {
        console.error('Failed to reject image:', err);
      }
    }

    async function deleteImage(imageId) {
      if (!confirm('Are you sure you want to delete this image from the library?')) return;
      try {
        const res = await guardedFetch('/api/admin/images/' + encodeURIComponent(imageId), {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken },
        });
        if (res.ok) loadImagesData();
      } catch (err) {
        console.error('Failed to delete image:', err);
      }
    }

    function toggleSelectAllImages(chk) {
      selectedImageIds.clear();
      if (chk && chk.checked) {
        cachedImages.forEach(i => { if (i && i.id) selectedImageIds.add(i.id); });
      }
      document.querySelectorAll('.img-select-checkbox').forEach(el => {
        el.checked = chk ? chk.checked : false;
      });
      updateImageSelectionState();
    }

    function updateImageSelectionState() {
      const selected = document.querySelectorAll('.img-select-checkbox:checked');
      selectedImageIds.clear();
      selected.forEach(el => selectedImageIds.add(el.getAttribute('data-id')));

      const bulkBar = document.getElementById('image-bulk-toolbar');
      const countEl = document.getElementById('image-selected-count');
      if (countEl) countEl.textContent = selectedImageIds.size + ' selected';
      if (bulkBar) bulkBar.style.display = selectedImageIds.size > 0 ? 'flex' : 'none';
    }

    async function executeImageBulkAction(action) {
      if (selectedImageIds.size === 0) return;
      if (action === 'delete' && !confirm('Delete ' + selectedImageIds.size + ' selected images?')) return;

      try {
        const res = await guardedFetch('/api/admin/images/bulk-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({
            ids: Array.from(selectedImageIds),
            action
          }),
        });
        const data = await res.json();
        if (data.success) {
          selectedImageIds.clear();
          loadImagesData();
        } else {
          alert(safeStr(data.error, 'Bulk action failed.'));
        }
      } catch (err) {
        console.error('Bulk image action error:', err);
      }
    }

    // Draft, Scheduled & Publication Illustration Selector Modal Handlers
    let currentDraftPostId = null;
    let currentPublicationId = null;
    let currentImageTargetContext = 'direct'; // 'direct', 'post-modal', 'scheduled-modal', 'publication-modal'
    let draftApprovedImages = [];

    function openDraftImageSelectorModalForDraft() {
      const postId = document.getElementById('post-edit-id')?.value;
      openDraftImageSelectorModal(postId, 'post-modal');
    }

    function openDraftImageSelectorModalForScheduled() {
      const postId = document.getElementById('sched-detail-post-id')?.value;
      openDraftImageSelectorModal(postId, 'scheduled-modal');
    }

    async function openDraftImageSelectorModalForPublication() {
      const textarea = document.getElementById('fb-post-detail-content');
      const fbPostId = safeStr(textarea?.dataset?.facebookPostId);
      const internalId = safeStr(textarea?.dataset?.internalPostId);
      currentPublicationId = fbPostId || internalId;
      currentDraftPostId = internalId || fbPostId;
      openDraftImageSelectorModal(currentPublicationId, 'publication-modal');
    }

    function removePostModalImage() {
      const imgInput = document.getElementById('post-selected-image-id');
      const previewImg = document.getElementById('post-image-preview');
      const wrap = document.getElementById('post-image-preview-wrap');
      const flag = document.getElementById('post-remove-image-flag');
      if (imgInput) imgInput.value = '';
      if (previewImg) previewImg.removeAttribute('src');
      if (wrap) wrap.style.display = 'none';
      if (flag) flag.value = 'true';
    }

    function removeScheduledModalImage() {
      const imgInput = document.getElementById('sched-detail-image-id');
      const previewImg = document.getElementById('sched-detail-image');
      const wrap = document.getElementById('sched-detail-image-wrap');
      const flag = document.getElementById('sched-detail-remove-image-flag');
      if (imgInput) imgInput.value = '';
      if (previewImg) previewImg.removeAttribute('src');
      if (wrap) wrap.style.display = 'none';
      if (flag) flag.value = 'true';
    }

    async function openDraftImageSelectorModal(postId, targetContext = 'direct') {
      currentDraftPostId = postId;
      currentImageTargetContext = targetContext;
      selectedDraftImageId = null;
      const pidInput = document.getElementById('draft-selector-post-id');
      if (pidInput) pidInput.value = postId || '';
      const sInput = document.getElementById('draft-selector-search');
      if (sInput) sInput.value = '';
      const cInput = document.getElementById('draft-selector-category');
      if (cInput) cInput.value = '';
      const commitBtn = document.getElementById('confirm-assign-draft-img-btn');
      if (commitBtn) commitBtn.disabled = true;

      openModal('draft-image-selector-modal');
      await fetchDraftApprovedImages();
    }

    async function fetchDraftApprovedImages() {
      const grid = document.getElementById('draft-selector-grid');
      if (grid) grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">Loading approved illustrations...</div>';

      try {
        const search = document.getElementById('draft-selector-search')?.value?.trim() || '';
        const category = document.getElementById('draft-selector-category')?.value?.trim() || '';

        const url = currentDraftPostId
          ? '/api/admin/content/posts/' + encodeURIComponent(currentDraftPostId) + '/image-library?search=' + encodeURIComponent(search) + '&category=' + encodeURIComponent(category)
          : '/api/admin/content/images?status=APPROVED&search=' + encodeURIComponent(search) + '&category=' + encodeURIComponent(category);

        const res = await guardedFetch(url);
        if (!res.ok) {
          if (grid) grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--accent-rose); padding:1.5rem;">Failed to load approved images.</div>';
          return;
        }

        const data = await res.json();
        draftApprovedImages = Array.isArray(data.images) ? data.images : [];
        renderDraftSelectorGrid(draftApprovedImages);
      } catch (err) {
        console.error('Error fetching draft approved images:', err);
      }
    }

    function filterDraftImageSelector() {
      fetchDraftApprovedImages();
    }

    function renderDraftSelectorGrid(images) {
      const grid = document.getElementById('draft-selector-grid');
      if (!grid) return;

      if (!images || images.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:2rem;">No approved images available. Add or approve images in the Image Library.</div>';
        return;
      }

      grid.innerHTML = images.map(img => {
        const id = safeStr(img.id);
        const title = escapeHtml(safeStr(img.title, 'Illustration'));
        const category = escapeHtml(safeStr(img.category, 'General'));
        const keywords = escapeHtml(safeStr(img.keywords, '—'));
        const sourceUrl = safeStr(img.source_url || img.r2_key);
        const isSelected = selectedDraftImageId === id ? 'selected' : '';

        return '<div class="image-select-card ' + isSelected + '" id="draft-img-card-' + id + '" onclick="selectDraftIllustration(\\x27' + id + '\\x27)">' +
            '<img src="' + escapeHtml(sourceUrl) + '" alt="' + title + '" style="width:100%; height:110px; object-fit:cover;" loading="lazy" />' +
            '<div style="padding:0.5rem;">' +
              '<div style="font-size:0.8rem; font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + title + '">' + title + '</div>' +
              '<div style="font-size:0.75rem; color:var(--accent-cyan); font-weight:500;">' + category + '</div>' +
              '<div style="font-size:0.675rem; color:var(--text-muted); max-height:28px; overflow:hidden; text-overflow:ellipsis;">' + keywords + '</div>' +
            '</div>' +
          '</div>';
      }).join('');
    }

    function selectDraftIllustration(imageId) {
      selectedDraftImageId = imageId;
      document.querySelectorAll('.image-select-card').forEach(el => el.classList.remove('selected'));
      const card = document.getElementById('draft-img-card-' + imageId);
      if (card) card.classList.add('selected');

      const commitBtn = document.getElementById('confirm-assign-draft-img-btn');
      if (commitBtn) commitBtn.disabled = false;
    }

    async function confirmAssignDraftIllustration() {
      if (!selectedDraftImageId) return;

      const chosenImg = draftApprovedImages.find(img => img && img.id === selectedDraftImageId);
      const chosenUrl = chosenImg ? (chosenImg.source_url || chosenImg.r2_key || '') : '';

      try {
        if (currentImageTargetContext === 'post-modal') {
          const imgInput = document.getElementById('post-selected-image-id');
          const previewImg = document.getElementById('post-image-preview');
          const wrap = document.getElementById('post-image-preview-wrap');
          const flag = document.getElementById('post-remove-image-flag');
          const badge = document.getElementById('post-image-name-badge');
          if (imgInput) imgInput.value = selectedDraftImageId;
          if (previewImg && chosenUrl) previewImg.src = chosenUrl;
          if (wrap) wrap.style.display = 'block';
          if (flag) flag.value = 'false';
          if (badge) badge.textContent = chosenImg?.title || 'Selected from Image Library';
          closeModal('draft-image-selector-modal');
          return;
        }

        if (currentImageTargetContext === 'scheduled-modal') {
          const imgInput = document.getElementById('sched-detail-image-id');
          const previewImg = document.getElementById('sched-detail-image');
          const wrap = document.getElementById('sched-detail-image-wrap');
          const flag = document.getElementById('sched-detail-remove-image-flag');
          const name = document.getElementById('sched-detail-image-name');
          if (imgInput) imgInput.value = selectedDraftImageId;
          if (previewImg && chosenUrl) previewImg.src = chosenUrl;
          if (wrap) wrap.style.display = 'block';
          if (flag) flag.value = 'false';
          if (name) name.textContent = chosenImg?.title || 'Selected from Image Library';
          closeModal('draft-image-selector-modal');
          return;
        }

        if (currentImageTargetContext === 'publication-modal' || currentPublicationId) {
          const pubTarget = currentPublicationId || currentDraftPostId;
          const res = await guardedFetch('/api/admin/publications/' + encodeURIComponent(pubTarget) + '/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ imageId: selectedDraftImageId }),
          });
          const data = await res.json();
          if (data.success) {
            closeModal('draft-image-selector-modal');
            const fbImage = document.getElementById('fb-post-detail-image');
            const fbWrap = document.getElementById('fb-post-detail-image-wrap');
            const removeBtn = document.getElementById('fb-post-remove-image-btn');
            if (fbImage && chosenUrl) fbImage.src = chosenUrl;
            if (fbWrap) fbWrap.style.display = 'block';
            if (removeBtn) removeBtn.style.display = 'inline-block';
            showPublicationAlert(safeStr(data.message, 'Publication image updated successfully.'), true);
            await loadFacebookPublications(false);
          } else {
            alert(safeStr(data.error || data.message, 'Failed to update publication image.'));
          }
          return;
        }

        // Default / direct assignment to post draft
        if (currentDraftPostId) {
          const res = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(currentDraftPostId) + '/assign-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ imageId: selectedDraftImageId }),
          });
          const data = await res.json();
          if (data.success) {
            closeModal('draft-image-selector-modal');
            await loadContentData();
          } else {
            alert(safeStr(data.error || data.message, 'Failed to assign image.'));
          }
        }
      } catch (err) {
        console.error('Error assigning image:', err);
        alert(err instanceof Error ? err.message : String(err));
      }
    }

    async function removeDraftIllustration() {
      if (!currentDraftPostId) return;

      try {
        const res = await guardedFetch('/api/admin/content/posts/' + encodeURIComponent(currentDraftPostId) + '/assign-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ action: 'remove' }),
        });
        const data = await res.json();
        if (data.success) {
          closeModal('draft-image-selector-modal');
          loadContentData();
        } else {
          alert(safeStr(data.error, 'Failed to remove illustration from draft.'));
        }
      } catch (err) {
        console.error('Error removing illustration:', err);
      }
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
    window.loadPerformanceData = loadPerformanceData;
    window.reevaluatePerformanceEngine = reevaluatePerformanceEngine;
    window.openTopicFromPost = openTopicFromPost;
    window.openPostFromTopic = openPostFromTopic;
    window.loadContentData = loadContentData;
    window.loadSchedulesData = loadSchedulesData;
    window.loadPublicationsData = loadFacebookPublications;
    window.loadMoreFacebookPublications = loadMoreFacebookPublications;
    window.syncFacebookPublications = syncFacebookPublications;
    window.openFacebookPostDetails = openFacebookPostDetails;
    window.saveFacebookPostEdit = saveFacebookPostEdit;
    window.saveFacebookPostImage = saveFacebookPostImage;
    window.toggleFacebookPostHidden = toggleFacebookPostHidden;
    window.deleteFacebookPost = deleteFacebookPost;
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
    window.findImageForPost = findImageForPost;
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
    window.scheduleSelectedIntelligently = scheduleSelectedIntelligently;
    window.scheduleAllEligibleIntelligently = scheduleAllEligibleIntelligently;
    window.executeCommitIntelligentSchedule = executeCommitIntelligentSchedule;
    window.openScheduledPostDetailModal = openScheduledPostDetailModal;
    window.saveScheduledPostEdits = saveScheduledPostEdits;
    window.unscheduleSelectedPost = unscheduleSelectedPost;
    window.unschedulePost = unschedulePost;
    window.resolvePostConflict = resolvePostConflict;
    window.syncFacebook = syncFacebook;
    window.setImageStatusTab = setImageStatusTab;
    window.loadImagesData = loadImagesData;
    window.debounceImageSearch = debounceImageSearch;
    window.openDiscoverImageModal = openDiscoverImageModal;
    window.handleDiscoverTopicSelectChange = handleDiscoverTopicSelectChange;
    window.validateDiscoverForm = validateDiscoverForm;
    window.startCandidateDiscovery = startCandidateDiscovery;
    window.resetDiscoverModalForm = resetDiscoverModalForm;
    window.closeDiscoverModalAndViewPending = closeDiscoverModalAndViewPending;
    window.openAddImageModal = openAddImageModal;
    window.setAddImageSourceType = setAddImageSourceType;
    window.submitAddImageForm = submitAddImageForm;
    window.openEditImageModal = openEditImageModal;
    window.submitEditImageForm = submitEditImageForm;
    window.quickApproveImage = quickApproveImage;
    window.quickRejectImage = quickRejectImage;
    window.deleteImage = deleteImage;
    window.toggleSelectAllImages = toggleSelectAllImages;
    window.updateImageSelectionState = updateImageSelectionState;
    window.executeImageBulkAction = executeImageBulkAction;
    window.openDraftImageSelectorModal = openDraftImageSelectorModal;
    window.openDraftImageSelectorModalForDraft = openDraftImageSelectorModalForDraft;
    window.openDraftImageSelectorModalForScheduled = openDraftImageSelectorModalForScheduled;
    window.removePostModalImage = removePostModalImage;
    window.removeScheduledModalImage = removeScheduledModalImage;
    window.removeFacebookPostAttachedImage = removeFacebookPostAttachedImage;

    window.openDraftImageSelectorModalForPublication = openDraftImageSelectorModalForPublication;
    window.filterDraftImageSelector = filterDraftImageSelector;
    window.selectDraftIllustration = selectDraftIllustration;
    window.confirmAssignDraftIllustration = confirmAssignDraftIllustration;
    window.removeDraftIllustration = removeDraftIllustration;
  `;
}
