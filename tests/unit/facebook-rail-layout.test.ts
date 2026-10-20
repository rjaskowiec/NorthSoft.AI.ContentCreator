import { describe, expect, it } from 'vitest';
import { renderAdminHtml } from '../../src/admin/ui.js';
import { getAdminCss } from '../../src/admin/ui/styles.js';

describe('Facebook Preview Rail Layout & Unified Scrolling Suite', () => {
  it('renders facebook-rail matching 100% page height without inflating parent page height', () => {
    const css = getAdminCss();

    // Verify app-layout is relative and main-content has reserved right margin
    expect(css).toMatch(/\.app-layout\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.main-content\s*\{[^}]*margin-right:\s*400px/);
    expect(css).toMatch(/\.main-content\.rail-collapsed\s*\{[^}]*margin-right:\s*0/);

    // Verify .facebook-rail is positioned absolute with 100% height and internal scrollbar when overflowing
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*top:\s*0/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*bottom:\s*0/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*height:\s*100%/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*overflow-y:\s*auto/);

    // Verify it does NOT use sticky 100vh on desktop
    expect(css).not.toMatch(/\.facebook-rail\s*\{[^}]*position:\s*sticky/);
    expect(css).not.toMatch(/\.facebook-rail\s*\{[^}]*height:\s*100vh/);
  });

  it('provides rail-collapsed class and toggle buttons for full-width workspace mode', () => {
    const css = getAdminCss();
    const html = renderAdminHtml();

    expect(css).toContain('.facebook-rail.rail-collapsed');
    expect(css).toContain('.main-content.rail-collapsed');
    expect(css).toContain('.btn-rail-toggle');

    // Verify collapse button inside facebook rail header
    expect(html).toContain('id="fb-rail-collapse-btn"');
    expect(html).toContain('onclick="toggleFacebookRail(false)"');

    // Verify expand button inside main header
    expect(html).toContain('id="fb-rail-expand-btn"');
    expect(html).toContain('onclick="toggleFacebookRail(true)"');
  });

  it('exposes toggleFacebookRail on window and handles persistence in admin scripts', () => {
    const html = renderAdminHtml();

    expect(html).toContain('function toggleFacebookRail(');
    expect(html).toContain('window.toggleFacebookRail = toggleFacebookRail');
    expect(html).toContain('ns_fb_rail_visible');
  });
});
