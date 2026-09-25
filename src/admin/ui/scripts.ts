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

    function showDashboard(user) {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('dashboard-screen').style.display = 'flex';
      document.getElementById('user-display').textContent = user.username;
      loadDashboardData();
    }

    function switchTab(tabName) {
      currentTab = tabName;
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-section').forEach(el => el.classList.remove('active-tab'));

      const navEl = document.getElementById('nav-' + tabName);
      if (navEl) navEl.classList.add('active');

      const tabEl = document.getElementById('tab-' + tabName);
      if (tabEl) tabEl.classList.add('active-tab');

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
      } else if (tabName === 'security') {
        loadSecurityData();
      }
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
      alertEl.style.display = 'none';

      const email = document.getElementById('forgot-email').value.trim();

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await res.json();
        alertEl.className = 'alert-success';
        alertEl.textContent = data.message || 'If an account matches this information, a password reset email has been sent.';
        alertEl.style.display = 'block';
        document.getElementById('forgot-email').value = '';
      } catch (err) {
        alertEl.className = 'alert-error';
        alertEl.textContent = 'Failed to submit password recovery request.';
        alertEl.style.display = 'block';
      }
    });

    // Reset Password Form Handler
    document.getElementById('reset-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('reset-alert');
      alertEl.style.display = 'none';

      const newPassword = document.getElementById('reset-new-password').value;
      const confirmPassword = document.getElementById('reset-confirm-password').value;

      if (newPassword !== confirmPassword) {
        alertEl.className = 'alert-error';
        alertEl.textContent = 'Passwords do not match.';
        alertEl.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: activeResetToken, newPassword, confirmPassword })
        });

        const data = await res.json();
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
      } catch (err) {
        alertEl.className = 'alert-error';
        alertEl.textContent = 'An error occurred resetting your password.';
        alertEl.style.display = 'block';
      }
    });

    // Change Password Form Handler (Authenticated Admin)
    document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('security-alert');
      alertEl.style.display = 'none';

      const currentPassword = document.getElementById('change-current-password').value;
      const newPassword = document.getElementById('change-new-password').value;
      const confirmPassword = document.getElementById('change-confirm-password').value;

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
        if (res.ok && data.success) {
          if (data.csrfToken) {
            csrfToken = data.csrfToken;
          }
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
      } catch (err) {
        alertEl.className = 'alert-error';
        alertEl.textContent = 'An unexpected connection error occurred.';
        alertEl.style.display = 'block';
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
          badgeEl.innerHTML = '<span class="status-badge status-healthy">Configured</span>';
          boxEl.innerHTML = 'Password recovery email: <strong>' + data.email + '</strong><br><span style="color:var(--status-success-text); font-size:0.85rem;">Password recovery via email is currently <strong>enabled</strong>.</span>';
          inputEl.value = data.email;
        } else {
          badgeEl.innerHTML = '<span class="status-badge status-disabled">Not configured</span>';
          boxEl.innerHTML = 'Password recovery via email is currently <strong>unavailable</strong> because no recovery email address has been set.';
          inputEl.value = '';
        }
      } catch (err) {
        // Ignore
      }
    }

    // Recovery Email Form Handler (Authenticated Admin)
    document.getElementById('recovery-email-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('security-alert');
      alertEl.style.display = 'none';

      const email = document.getElementById('recovery-email-input').value.trim();

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
      } catch (err) {
        alertEl.className = 'alert-error';
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

    // Load Dashboard Overview Data
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
        document.getElementById('cnt-ideas').textContent = data.pipeline.discoveredTopics || data.pipeline.ideas || 0;
        document.getElementById('cnt-drafts').textContent = data.pipeline.drafts || 0;
        document.getElementById('cnt-qa').textContent = data.pipeline.underReview || data.pipeline.awaitingQa || 0;
        document.getElementById('cnt-approved').textContent = data.pipeline.approved || 0;
        document.getElementById('cnt-scheduled').textContent = data.pipeline.scheduled || 0;
        document.getElementById('cnt-published').textContent = data.pipeline.published || 0;
        document.getElementById('cnt-blocked').textContent = data.pipeline.rejected || data.pipeline.blocked || 0;

        // AI Quota & Usage Panel
        if (data.aiUsage) {
          const usage = data.aiUsage;
          document.getElementById('ai-provider-name').textContent = data.systemStatus.aiProvider || 'Cloudflare Workers AI';
          document.getElementById('ai-today-text').textContent = \`\${usage.todayRequests} / \${usage.dailyLimit} requests\`;
          document.getElementById('ai-neurons-text').textContent = \`\${usage.todayNeurons} / \${usage.hardNeuronLimit || 7500} Neurons (Hard Stop)\`;

          const todayPct = Math.min(100, Math.round((usage.todayRequests / usage.dailyLimit) * 100));
          const neuronPct = Math.min(100, Math.round((usage.todayNeurons / (usage.hardNeuronLimit || 7500)) * 100));

          document.getElementById('ai-today-bar').style.width = todayPct + '%';
          document.getElementById('ai-neurons-bar').style.width = neuronPct + '%';

          const badgeEl = document.getElementById('ai-quota-badge');
          if (usage.status === 'FREE_CAPACITY_AVAILABLE') {
            badgeEl.className = 'status-badge status-healthy';
            badgeEl.textContent = 'FREE CAPACITY AVAILABLE';
          } else {
            badgeEl.className = 'status-badge status-alert';
            badgeEl.textContent = usage.status;
          }
        }

        // Orchestrator Run Metrics
        if (data.lastRun) {
          const r = data.lastRun;
          document.getElementById('orch-last-time').textContent = r.started_at ? new Date(r.started_at).toLocaleString() : 'Never';
          document.getElementById('orch-last-trigger').textContent = 'Trigger: ' + (r.trigger_type || 'cron').toUpperCase();
          document.getElementById('orch-status-val').innerHTML = '<span class="status-badge ' + (r.status === 'completed' ? 'status-healthy' : r.status === 'running' ? 'status-active' : 'status-alert') + '">' + (r.status || 'UNKNOWN').toUpperCase() + '</span>';
          document.getElementById('orch-result-val').textContent = 'Result: ' + (r.result_status || '—').toUpperCase();
          document.getElementById('orch-neurons-val').textContent = (r.neurons_used || 0) + ' Neurons';
        }

        // Audit Activity Table Formatting Helpers
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
          const labelMap = { username: 'Username', clientIp: 'IP', emailConfigured: 'Email', expiresAt: 'Expires', adminUserId: 'User ID', triggerType: 'Trigger', trigger: 'Trigger', reason: 'Reason', status: 'Status', neuronsUsed: 'Neurons', neurons: 'Neurons', errorMessage: 'Error', error: 'Error' };
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
            items.push({ key, label, value });
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

        // Audit Activity Table
        const actBody = document.getElementById('recent-activity-body');
        if (data.recentActivity && data.recentActivity.length > 0) {
          actBody.innerHTML = data.recentActivity.map(act => {
            const evt = formatAuditEvent(act.eventType);
            const actorInfo = formatAuditActor(act.actor, act.details);
            const entInfo = formatAuditEntity(act.entityType, act.entityId);
            const dtItems = formatAuditDetails(act.details);
            const tsInfo = formatAuditTimestamp(act.timestamp);

            return \`
              <tr>
                <td>
                  <div style="display:flex; align-items:center; gap:0.4rem;">
                    <span class="status-badge \${evt.badgeClass}">\${evt.category}</span>
                    <div>
                      <strong style="font-size:0.875rem; color:var(--text-main);">\${evt.title}</strong>
                      <div style="font-size:0.7rem; color:var(--text-subtle); font-family:monospace;" title="Technical Event Type">\${act.eventType}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="status-badge \${actorInfo.badgeClass}">\${actorInfo.label}</span>
                  \${actorInfo.subtext ? \`<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">\${actorInfo.subtext}</div>\` : ''}
                </td>
                <td>
                  <div style="font-weight:600; font-size:0.825rem;">\${entInfo.typeLabel}</div>
                  <div style="font-size:0.725rem; color:var(--text-subtle); font-family:monospace;" title="\${entInfo.fullId}">\${entInfo.truncatedId}</div>
                </td>
                <td>
                  <div class="audit-details-compact">
                    \${dtItems.length > 0 ? dtItems.map(d => \`<span class="detail-pill"><span class="detail-key">\${d.label}:</span> <span class="detail-val">\${d.value}</span></span>\`).join('') : '<span style="color:var(--text-subtle); font-size:0.8rem;">—</span>'}
                  </div>
                </td>
                <td style="white-space:nowrap; font-size:0.8rem; color:var(--text-muted);" title="\${tsInfo.full}">
                  \${tsInfo.compact}
                </td>
              </tr>
            \`;
          }).join('');
        } else {
          actBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;"><div style="font-weight:600; margin-bottom:0.25rem;">No audit events yet</div><div style="font-size:0.825rem;">System activity will appear here as administrative actions are recorded.</div></td></tr>';
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }

    // Load Research Tab Data
    async function loadResearchData() {
      try {
        const res = await fetch('/api/admin/research');
        if (!res.ok) {
          if (res.status === 401) showLogin();
          return;
        }

        const data = await res.json();

        document.getElementById('res-sources-cnt').textContent = data.stats.totalSources;
        document.getElementById('res-enabled-sub').textContent = data.stats.enabledSources + ' Active Feeds';
        document.getElementById('res-topics-cnt').textContent = data.stats.totalTopicsDiscovered;
        document.getElementById('res-last-run').textContent = data.stats.lastRunAt ? new Date(data.stats.lastRunAt).toLocaleTimeString() : 'Never';

        // Topics Table
        const topicsBody = document.getElementById('topics-table-body');
        if (data.topics && data.topics.length > 0) {
          topicsBody.innerHTML = data.topics.map(t => \`
            <tr>
              <td>
                <strong>\${t.title}</strong>
                <div style="font-size:0.8rem; color:var(--text-muted);">\${t.description || ''}</div>
              </td>
              <td><span class="code-tag">\${t.category}</span></td>
              <td><span class="status-badge status-healthy">\${t.priority}/100</span></td>
              <td><span class="status-badge status-active">\${t.status.toUpperCase()}</span></td>
              <td class="code-tag">\${new Date(t.created_at).toLocaleDateString()}</td>
            </tr>
          \`).join('');
        } else {
          topicsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No candidate topics discovered yet.</td></tr>';
        }

        // Sources Table
        const sourcesBody = document.getElementById('sources-table-body');
        if (data.sources && data.sources.length > 0) {
          sourcesBody.innerHTML = data.sources.map(s => \`
            <tr>
              <td><strong>\${s.name}</strong></td>
              <td><span class="code-tag">\${s.category}</span></td>
              <td style="font-size:0.8rem; font-family:monospace;">\${s.url}</td>
              <td><span class="status-badge \${s.enabled ? 'status-healthy' : 'status-disabled'}">\${s.enabled ? 'ACTIVE' : 'DISABLED'}</span></td>
              <td class="code-tag">\${s.last_checked_at ? new Date(s.last_checked_at).toLocaleString() : 'Never'}</td>
            </tr>
          \`).join('');
        }

        // Runs Table
        const runsBody = document.getElementById('runs-table-body');
        if (data.runs && data.runs.length > 0) {
          runsBody.innerHTML = data.runs.map(r => \`
            <tr>
              <td class="code-tag">\${new Date(r.started_at).toLocaleString()}</td>
              <td><span class="code-tag">\${r.trigger_type}</span></td>
              <td><span class="status-badge \${r.status === 'completed' ? 'status-healthy' : 'status-alert'}">\${r.status.toUpperCase()}</span></td>
              <td>\${r.sources_checked}</td>
              <td>\${r.items_found}</td>
              <td><strong>\${r.topics_created}</strong></td>
            </tr>
          \`).join('');
        }
      } catch (err) {
        console.error('Failed to load research data:', err);
      }
    }

    // Trigger Manual Research Run
    async function runResearchNow() {
      const btn = document.getElementById('run-research-btn');
      const alertEl = document.getElementById('research-run-alert');
      alertEl.style.display = 'none';

      btn.disabled = true;
      btn.innerHTML = 'Executing...';

      try {
        const res = await fetch('/api/admin/research/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          }
        });

        const data = await res.json();
        if (res.ok && data.success) {
          alertEl.textContent = 'Research run completed successfully! Discovered ' + (data.summary?.topicsCreated || 0) + ' candidate topics.';
          alertEl.className = 'alert-success';
          alertEl.style.display = 'block';
          loadResearchData();
        } else {
          alertEl.textContent = 'Research run failed: ' + (data.summary?.errorMessage || 'Unknown error');
          alertEl.className = 'alert-error';
          alertEl.style.display = 'block';
        }
      } catch (err) {
        alertEl.textContent = 'An unexpected connection error occurred.';
        alertEl.className = 'alert-error';
        alertEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M5 3l14 9-14 9V3z"/></svg> Run Research Pipeline Now';
      }
    }

    // Load Content Tab Data
    async function loadContentData() {
      try {
        const res = await fetch('/api/admin/content/posts');
        if (!res.ok) {
          if (res.status === 401) showLogin();
          return;
        }

        const data = await res.json();
        const postsBody = document.getElementById('posts-table-body');

        if (data.posts && data.posts.length > 0) {
          postsBody.innerHTML = data.posts.map(p => \`
            <tr>
              <td>
                <strong>\${p.title}</strong>
                <div style="font-size:0.8rem; color:var(--text-muted); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${p.latest_body || ''}</div>
              </td>
              <td><span class="status-badge \${p.status === 'approved' ? 'status-healthy' : p.status === 'rejected' || p.status === 'blocked' ? 'status-alert' : 'status-active'}">\${p.status.toUpperCase()}</span></td>
              <td><span class="code-tag">v\${p.current_version}</span></td>
              <td><span class="status-badge status-healthy">\${p.quality_score || 0}/100</span></td>
              <td><span class="status-badge \${p.quality_decision === 'PASS' ? 'status-healthy' : 'status-alert'}">\${p.quality_decision || 'PASS'}</span></td>
              <td class="code-tag">\${new Date(p.created_at).toLocaleString()}</td>
            </tr>
          \`).join('');
        } else {
          postsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No post drafts generated yet. Trigger research or orchestration pipeline to generate content.</td></tr>';
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
        if (res.ok && data.success) {
          if (alertEl) {
            alertEl.textContent = 'Autonomous pipeline completed! Result: ' + (data.result?.resultStatus || 'COMPLETED').toUpperCase();
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
          loadDashboardData();
        } else {
          if (alertEl) {
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
          if (res.status === 401) showLogin();
          return;
        }

        const data = await res.json();
        const schedBody = document.getElementById('schedules-table-body');

        if (data.schedules && data.schedules.length > 0) {
          schedBody.innerHTML = data.schedules.map(sched => \`
            <tr>
              <td><strong>\${sched.post_title}</strong></td>
              <td class="code-tag">\${new Date(sched.scheduled_at).toUTCString()}</td>
              <td><span class="status-badge status-healthy">\${sched.status.toUpperCase()}</span></td>
              <td><span class="code-tag">v\${sched.current_version}</span></td>
              <td><span class="status-badge status-healthy">\${sched.quality_score || 0}/100</span></td>
              <td><span class="status-badge \${sched.quality_decision === 'PASS' ? 'status-healthy' : 'status-alert'}">\${sched.quality_decision || 'PASS'}</span></td>
              <td class="code-tag">\${new Date(sched.created_at).toLocaleString()}</td>
            </tr>
          \`).join('');
        } else {
          schedBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No scheduled publications queue entries found. Approved posts will automatically appear here when scheduled.</td></tr>';
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
          if (res.status === 401) showLogin();
          return;
        }

        const data = await res.json();
        const config = data.configStatus || {};

        // Config Status Cards
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
        if (verEl) verEl.textContent = config.apiVersion || 'v19.0';

        const lockEl = document.getElementById('meta-lock-val');
        if (lockEl) lockEl.textContent = config.publishEnabled ? 'ENABLED' : 'DISABLED';

        // Publications Table
        const pubBody = document.getElementById('publications-table-body');
        if (data.publications && data.publications.length > 0) {
          pubBody.innerHTML = data.publications.map(pub => {
            const isApproved = pub.qualityGateStatus === 'approved' || pub.qualityGateStatus === 'PASS';
            const statusClass = pub.status === 'published' ? 'status-healthy' : pub.status === 'publishing' ? 'status-active' : pub.status === 'failed' ? 'status-alert' : 'status-disabled';
            const errCategory = pub.errorCode ? pub.errorCode : '';

            return \`
              <tr>
                <td>
                  <strong>\${pub.postTitle || 'Untitled Post'}</strong>
                  <div style="font-size:0.8rem; color:var(--text-muted); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${pub.postBody || ''}</div>
                  \${pub.errorMessage ? \`<div style="font-size:0.75rem; color:var(--accent-red); margin-top:2px;">\${pub.errorMessage}</div>\` : ''}
                </td>
                <td><span class="code-tag">\${pub.provider}</span></td>
                <td><span class="status-badge \${isApproved ? 'status-healthy' : 'status-alert'}">\${isApproved ? 'PASS' : 'UNAPPROVED'}</span></td>
                <td>
                  <span class="status-badge \${statusClass}">\${pub.status.toUpperCase()}</span>
                  \${errCategory ? \`<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">\${errCategory}</div>\` : ''}
                </td>
                <td class="code-tag">\${pub.facebookPostId || '—'}</td>
                <td class="code-tag">\${pub.publishedAt ? new Date(pub.publishedAt).toLocaleString() : '—'}</td>
                <td>
                  \${isApproved && pub.status !== 'published' && pub.status !== 'publishing' ? \`
                    <button class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="publishNow('\${pub.postId}')">Publish Now</button>
                    \${pub.status === 'failed' ? \`<button class="btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.8rem; margin-left:4px;" onclick="retryPub('\${pub.id}')">Retry</button>\` : ''}
                  \` : pub.status === 'published' ? \`
                    <span style="color:var(--accent-green); font-weight:600; font-size:0.85rem;">Published</span>
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
        if (res.ok && data.success) {
          if (alertEl) {
            alertEl.textContent = 'Publication request completed successfully. External Facebook Post ID: ' + (data.result?.externalPostId || 'Success');
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          if (alertEl) {
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
        if (res.ok && data.success) {
          if (alertEl) {
            alertEl.textContent = 'Publication retry succeeded. External Facebook Post ID: ' + (data.result?.externalPostId || 'Success');
            alertEl.className = 'alert-success';
            alertEl.style.display = 'block';
          }
        } else {
          if (alertEl) {
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

    // Manual Publisher Handlers & Live Preview
    function initManualPublisherEvents() {
      const contentEl = document.getElementById('manual-post-content');
      const linkEl = document.getElementById('manual-post-link');

      if (contentEl) {
        contentEl.addEventListener('input', updateManualPreview);
      }
      if (linkEl) {
        linkEl.addEventListener('input', updateManualPreview);
      }
    }

    document.addEventListener('DOMContentLoaded', initManualPublisherEvents);

    function updateManualPreview() {
      const content = (document.getElementById('manual-post-content')?.value || '').trim();
      const link = (document.getElementById('manual-post-link')?.value || '').trim();
      const charCounter = document.getElementById('manual-char-counter');
      const previewText = document.getElementById('preview-text');
      const previewCard = document.getElementById('preview-link-card');
      const previewDomain = document.getElementById('preview-link-domain');
      const previewUrl = document.getElementById('preview-link-url');

      const len = content.length;
      if (charCounter) {
        charCounter.textContent = len.toLocaleString() + ' / 63,206 characters';
        if (len > 63206) {
          charCounter.style.color = 'var(--accent-red)';
          charCounter.style.fontWeight = '700';
        } else if (len > 60000) {
          charCounter.style.color = '#f59e0b';
          charCounter.style.fontWeight = '600';
        } else {
          charCounter.style.color = 'var(--text-muted)';
          charCounter.style.fontWeight = 'normal';
        }
      }

      if (previewText) {
        previewText.textContent = content || 'Write your Facebook post...';
      }

      if (link && previewCard && previewUrl && previewDomain) {
        try {
          const urlObj = new URL(link);
          previewDomain.textContent = urlObj.hostname.toUpperCase();
          previewUrl.textContent = link;
          previewCard.style.display = 'block';
        } catch {
          previewCard.style.display = 'none';
        }
      } else if (previewCard) {
        previewCard.style.display = 'none';
      }
    }

    async function loadManualPublisherData() {
      initManualPublisherEvents();
      updateManualPreview();
      try {
        const res = await fetch('/api/admin/meta/status');
        if (!res.ok) return;
        const data = await res.json();
        const badge = document.getElementById('manual-meta-status-badge');
        if (badge) {
          const st = (data.status || 'NOT_CONFIGURED').toUpperCase();
          let cls = 'status-disabled';
          if (st === 'READY') cls = 'status-healthy';
          else if (st === 'DEGRADED') cls = 'status-alert';
          else if (st === 'DISABLED') cls = 'status-active';
          badge.innerHTML = '<span class="status-badge ' + cls + '">META ' + st.replace('_', ' ') + '</span>';
        }
      } catch (err) {
        console.error('Failed to load Meta status for Manual Publisher:', err);
      }
    }

    function validateManualForm() {
      const alertEl = document.getElementById('manual-pub-alert');
      const content = (document.getElementById('manual-post-content')?.value || '').trim();
      const link = (document.getElementById('manual-post-link')?.value || '').trim();

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
          alertEl.textContent = 'Validation error: Post content exceeds Meta Graph API maximum limit of 63,206 characters (' + content.length + ' entered).';
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
  `;
}
