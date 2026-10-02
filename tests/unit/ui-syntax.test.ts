import { describe, it, expect } from 'vitest';
import { renderAdminHtml } from '../../src/admin/ui.js';
import vm from 'vm';

describe('Admin UI Script Syntax Validation', () => {
  it('parses admin UI script without syntax errors in V8', () => {
    const html = renderAdminHtml();
    const scriptStart = html.indexOf('<script>');
    const scriptEnd = html.indexOf('</script>', scriptStart);
    const js = html.substring(scriptStart + 8, scriptEnd);

    try {
      new vm.Script(js, { filename: 'admin-ui-scripts.js' });
      expect(true).toBe(true);
    } catch (e: any) {
      console.error('SYNTAX ERROR IN ADMIN SCRIPT:\n', e.stack);
      throw e;
    }
  });
});
