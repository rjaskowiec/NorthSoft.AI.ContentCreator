import { describe, expect, it } from 'vitest';
import { renderAdminHtml } from '../../src/admin/ui.js';
import { getAdminCss } from '../../src/admin/ui/styles.js';

describe('Facebook Preview Rail Layout & Unified Scrolling Suite', () => {
  it('renders facebook-rail as stationary sticky sidebar extending to viewport height', () => {
    const css = getAdminCss();

    // Verify app-layout is flex container
    expect(css).toMatch(/\.app-layout\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.main-content\.rail-collapsed\s*\{[^}]*margin-right:\s*0/);

    // Verify .facebook-rail is positioned sticky with 100vh height and internal scrollbar when overflowing
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*top:\s*0/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*height:\s*100vh/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*max-height:\s*100vh/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.facebook-rail\s*\{[^}]*flex-shrink:\s*0/);

    // Verify mobile media query resets rail to static with auto height
    const media960 = css.slice(css.indexOf('@media (max-width: 960px)'));
    expect(media960).toMatch(/\.facebook-rail\s*\{[^}]*position:\s*static/);
    expect(media960).toMatch(/\.facebook-rail\s*\{[^}]*height:\s*auto/);
    expect(media960).toMatch(/\.facebook-rail\s*\{[^}]*overflow-y:\s*visible/);
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
