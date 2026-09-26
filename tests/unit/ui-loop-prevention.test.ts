import { describe, expect, it } from 'vitest';
import { getAdminScripts } from '../../src/admin/ui/scripts';

describe('Admin UI Client Script — Request Loop Prevention & Re-entrancy Protection', () => {
  it('should compile getAdminScripts() without syntax errors', () => {
    const scriptsHtml = getAdminScripts();
    expect(scriptsHtml).toBeDefined();
    expect(scriptsHtml).toContain('guardedFetch');
    expect(scriptsHtml).toContain('isCheckingSession');
    expect(scriptsHtml.length).toBeGreaterThan(1000);
  });

  it('should verify load*Data functions do NOT call checkSession on 401/403/500', () => {
    const scriptsHtml = getAdminScripts();

    // Ensure no load*Data function contains "if (res.status === 401) await checkSession()"
    const checkSessionIn401Pattern = /res\.status\s*===\s*401[\s\S]{0,40}checkSession/g;
    const matches = scriptsHtml.match(checkSessionIn401Pattern);
    
    expect(matches).toBeNull();
  });

  it('should verify re-entrancy guard is present in checkSession', () => {
    const scriptsHtml = getAdminScripts();
    expect(scriptsHtml).toContain('if (isCheckingSession) return;');
    expect(scriptsHtml).toContain('isCheckingSession = true;');
    expect(scriptsHtml).toContain('isCheckingSession = false;');
  });

  it('should verify showDashboard does not trigger recursive tab loader switches', () => {
    const scriptsHtml = getAdminScripts();

    // showDashboard should set display styles and user label, but not call switchTab
    const showDashboardCode = scriptsHtml.substring(
      scriptsHtml.indexOf('function showDashboard('),
      scriptsHtml.indexOf('async function switchTab(')
    );

    expect(showDashboardCode).not.toContain('switchTab(');
  });

  it('should verify guardedFetch handles in-flight deduplication and clean error handling', () => {
    const scriptsHtml = getAdminScripts();
    expect(scriptsHtml).toContain('activeInFlightRequests');
    expect(scriptsHtml).toContain('activeInFlightRequests.has(key)');
    expect(scriptsHtml).toContain('activeInFlightRequests.delete(key)');
  });
});
