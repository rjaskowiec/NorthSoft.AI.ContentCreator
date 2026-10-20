import { describe, expect, it } from 'vitest';
import { renderAdminHtml } from '../../src/admin/ui.js';
import { getAdminCss } from '../../src/admin/ui/styles.js';

describe('Facebook Preview Rail Layout & Unified Scrolling Suite', () => {
  it('renders facebook-rail with natural full-page flow styles and no 100vh trapped scrollbar', () => {
    const css = getAdminCss();

    // Verify .facebook-rail has height: auto and min-height: 100%
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*min-height:\s*100%/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*height:\s*auto/);

    // Verify it does NOT have sticky 100vh with overflow-y: auto on desktop rail
    expect(css).not.toMatch(/\.facebook-rail\s*\{[^}]*position:\s*sticky/);
    expect(css).not.toMatch(/\.facebook-rail\s*\{[^}]*height:\s*100vh/);
    expect(css).not.toMatch(/\.facebook-rail\s*\{[^}]*overflow-y:\s*auto/);
  });

  it('provides rail-collapsed class and toggle buttons for full-width workspace mode', () => {
    const css = getAdminCss();
    const html = renderAdminHtml();

    expect(css).toContain('.facebook-rail.rail-collapsed');
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
