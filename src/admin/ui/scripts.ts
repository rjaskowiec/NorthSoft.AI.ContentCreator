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

        // Audit Activity Table
        const actBody = document.getElementById('recent-activity-body');
        if (data.recentActivity && data.recentActivity.length > 0) {
          actBody.innerHTML = data.recentActivity.map(act => \`
            <tr>
              <td><span class="code-tag">\${act.eventType}</span></td>
              <td>\${act.actor}</td>
              <td class="code-tag">\${act.entityType}:\${act.entityId}</td>
              <td style="font-size:0.8rem; font-family:monospace; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${JSON.stringify(act.details)}</td>
              <td style="font-size:0.8rem;" class="code-tag">\${new Date(act.timestamp).toLocaleString()}</td>
            </tr>
          \`).join('');
        } else {
          actBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No recent audit activity.</td></tr>';
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
  `;
}
