import { describe, expect, it } from 'vitest';
import { renderAdminHtml } from '../../src/admin/ui.js';
import { getAdminCss } from '../../src/admin/ui/styles.js';

function getMediaQueryBlock(css: string, query: string): string {
  const index = css.indexOf(query);
  if (index === -1) return '';
  const startBrace = css.indexOf('{', index);
  if (startBrace === -1) return '';
  let depth = 1;
  let pos = startBrace + 1;
  while (pos < css.length && depth > 0) {
    if (css[pos] === '{') depth++;
    else if (css[pos] === '}') depth--;
    pos++;
  }
  return css.substring(startBrace + 1, pos - 1);
}

describe('Mobile Responsive UI Regression Suite', () => {
  it('renders admin HTML containing responsive meta viewport tag', () => {
    const html = renderAdminHtml();
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    );
  });

  it('contains root-level overflow protection and flexible layout definitions', () => {
    const css = getAdminCss();
    expect(css).toContain('max-width: 100vw');
    expect(css).toContain('overflow-x: hidden');
    expect(css).toContain('min-width: 0');
  });

  it('implements responsive breakpoints for 960px, 768px, 640px, 480px, and 360px', () => {
    const css = getAdminCss();
    expect(css).toContain('@media (max-width: 960px)');
    expect(css).toContain('@media (max-width: 768px)');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('@media (max-width: 480px)');
    expect(css).toContain('@media (max-width: 360px)');
  });

  it('prevents header collisions on small screens by hiding verbose subtitle and adapting layout', () => {
    const css = getAdminCss();
    const media960 = getMediaQueryBlock(css, '@media (max-width: 960px)');
    const media768 = getMediaQueryBlock(css, '@media (max-width: 768px)');

    expect(media960).toMatch(/\.header\s*\{[^}]*height:\s*auto/);
    expect(media768).toMatch(/\.header-app-sub\s*\{[^}]*display:\s*none/);
  });

  it('transforms sidebar navigation into a touch-friendly horizontal swipe rail on mobile', () => {
    const css = getAdminCss();
    const media960 = getMediaQueryBlock(css, '@media (max-width: 960px)');

    expect(media960).toMatch(/\.sidebar\s+nav\s*\{[^}]*overflow-x:\s*auto/);
    expect(media960).toMatch(/\.nav-list\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(media960).toMatch(/\.sidebar-brand\s*\{[^}]*display:\s*none/);
  });

  it('ensures table containers support isolated horizontal touch scrolling without full-page overflow', () => {
    const css = getAdminCss();
    const media768 = getMediaQueryBlock(css, '@media (max-width: 768px)');

    expect(css).toContain('overscroll-behavior-x: contain');
    expect(css).toMatch(/\.table-container\s*\{[^}]*overflow-x:\s*auto/);
    expect(media768).toMatch(/\.table-container\s+table\s*\{[^}]*min-width:\s*580px/);
  });

  it('provides 16px lateral padding on phones and 12px on narrow 320px–360px viewports', () => {
    const css = getAdminCss();
    const media768 = getMediaQueryBlock(css, '@media (max-width: 768px)');
    const media360 = getMediaQueryBlock(css, '@media (max-width: 360px)');

    expect(media768).toMatch(/\.content-body\s*\{[^}]*padding:\s*1rem/);
    expect(media360).toMatch(/\.content-body\s*\{[^}]*padding:\s*0.75rem/);
  });

  it('adapts modal dialogs and stacks action buttons for mobile thumb reach', () => {
    const css = getAdminCss();
    const media768 = getMediaQueryBlock(css, '@media (max-width: 768px)');

    expect(media768).toMatch(/\.modal-box\s*\{[^}]*width:\s*100%\s*!important/);
    expect(media768).toMatch(/\.modal-footer\s*\{[^}]*flex-direction:\s*column-reverse/);
  });

  it('guarantees interactive touch targets meet accessibility criteria', () => {
    const css = getAdminCss();
    const media768 = getMediaQueryBlock(css, '@media (max-width: 768px)');
    const media480 = getMediaQueryBlock(css, '@media (max-width: 480px)');

    expect(media768).toMatch(/min-height:\s*44px/);
    expect(media480).toMatch(/\.action-btn-icon\s*\{[^}]*width:\s*36px;\s*height:\s*36px/);
  });

  it('prevents iOS Safari auto-zoom by enforcing 16px font-size on inputs at mobile viewport', () => {
    const css = getAdminCss();
    const media480 = getMediaQueryBlock(css, '@media (max-width: 480px)');

    expect(media480).toMatch(/font-size:\s*16px/);
  });
});
