import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  getBadgeColors,
  NORTHSOFT_LOGO_URL,
  renderBadge,
  renderButton,
  renderCard,
  renderEmailShell,
} from '../../src/services/mail/email-template';

describe('Email Design System & Template Builder (email-template.ts)', () => {
  describe('HTML Escaping & Security', () => {
    it('escapes special characters to prevent HTML injection and XSS', () => {
      const malicious = '<script>alert("XSS")</script>&foo=\'bar\'';
      const escaped = escapeHtml(malicious);

      expect(escaped).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;&amp;foo=&#039;bar&#039;',
      );
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).not.toContain('"');
    });

    it('handles empty or nullish strings gracefully', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null as any)).toBe('');
      expect(escapeHtml(undefined as any)).toBe('');
    });
  });

  describe('Official Brand Logo', () => {
    it('uses the verified official NorthSoft logo SVG asset', () => {
      expect(NORTHSOFT_LOGO_URL).toBe('https://northsoft.is/brand/logos/northsoft-symbol.svg');
    });

    it('renders the official logo with explicit dimensions and accessibility alt text in shell', () => {
      const html = renderEmailShell({
        contentHtml: '<p>Content</p>',
      });

      expect(html).toContain('src="https://northsoft.is/brand/logos/northsoft-symbol.svg"');
      expect(html).toContain('width="28"');
      expect(html).toContain('height="28"');
      expect(html).toContain('alt="NorthSoft"');
    });
  });

  describe('Status Badge Component & Known Defects Fixes', () => {
    const statuses = [
      { text: 'PUBLISHED', variant: 'success' as const, expectedColor: '#34d399' },
      { text: 'FAILED', variant: 'alert' as const, expectedColor: '#fda4af' },
      { text: 'ALERT', variant: 'alert' as const, expectedColor: '#fda4af' },
      { text: 'WARNING', variant: 'warning' as const, expectedColor: '#fcd34d' },
      { text: 'PENDING', variant: 'warning' as const, expectedColor: '#fcd34d' },
      { text: 'COMPLETED', variant: 'success' as const, expectedColor: '#34d399' },
      { text: 'SECURITY', variant: 'security' as const, expectedColor: '#60a5fa' },
      { text: 'DIGEST', variant: 'info' as const, expectedColor: '#38bdf8' },
    ];

    statuses.forEach(({ text, variant, expectedColor }) => {
      it(`renders status badge '${text}' with semantic variant '${variant}'`, () => {
        const badgeHtml = renderBadge({ text, variant });

        // Bulletproof table layout
        expect(badgeHtml).toContain('<table');
        expect(badgeHtml).toContain(text);
        expect(badgeHtml).toContain(expectedColor);

        // Guarantees no clipping on mobile or wrapping
        expect(badgeHtml).toContain('white-space: nowrap');
        expect(badgeHtml).toContain('border-radius: 9999px');
        expect(badgeHtml).toContain('padding: 5px 12px');
        expect(badgeHtml).toContain('font-size: 11px');
        expect(badgeHtml).toContain('font-weight: 700');
      });
    });

    it('prevents badge clipping and brand name collision in email shell header', () => {
      const html = renderEmailShell({
        brandTitle: 'NorthSoft AI Content Creator',
        badge: { text: 'PUBLISHED', variant: 'success' },
        contentHtml: '<p>Body</p>',
      });

      // Desktop spacing guarantee: right-aligned table cell with 16px padding-left
      expect(html).toContain('class="header-stack-col badge-cell" style="padding-left: 16px;"');
      expect(html).toContain('align="right"');

      // Mobile responsiveness: header-stack-col and badge-cell stacking rules in <style>
      expect(html).toContain('.header-stack-col');
      expect(html).toContain('.badge-cell');
      expect(html).toContain('@media only screen and (max-width: 480px)');

      // Asserts NO fragile display: flex in the header structure
      expect(html).not.toContain('display: flex');
    });

    it('resolves semantic badge colors correctly via getBadgeColors', () => {
      const successColors = getBadgeColors('success');
      expect(successColors.color).toBe('#34d399');
      expect(successColors.bg).toBe('rgba(16, 185, 129, 0.15)');

      const alertColors = getBadgeColors('alert');
      expect(alertColors.color).toBe('#fda4af');

      const neutralColors = getBadgeColors('neutral');
      expect(neutralColors.color).toBe('#94a3b8');
    });

    it('supports custom colors if needed', () => {
      const customBadge = renderBadge({
        text: 'CUSTOM',
        customColor: '#ffffff',
        customBg: '#334155',
        customBorder: '#64748b',
      });

      expect(customBadge).toContain('CUSTOM');
      expect(customBadge).toContain('#ffffff');
      expect(customBadge).toContain('#334155');
      expect(customBadge).toContain('#64748b');
    });
  });

  describe('Touch-Friendly Action Button', () => {
    it('renders bulletproof button with minimum 44px touch height ergonomics', () => {
      const buttonHtml = renderButton({
        text: 'View Live Post on Facebook →',
        url: 'https://facebook.com/123456',
        variant: 'primary',
      });

      expect(buttonHtml).toContain('<table');
      expect(buttonHtml).toContain('href="https://facebook.com/123456"');
      expect(buttonHtml).toContain('View Live Post on Facebook →');
      expect(buttonHtml).toContain('padding: 12px 24px');
      expect(buttonHtml).toContain('line-height: 20px');
      expect(buttonHtml).toContain('border-radius: 6px');
      // 12px top + 12px bottom + 20px line-height = 44px min touch target
    });

    it('escapes button text and URLs safely', () => {
      const buttonHtml = renderButton({
        text: 'Click <Here> & Win',
        url: 'https://northsoft.is/?a=1&b=2',
      });

      expect(buttonHtml).toContain('Click &lt;Here&gt; &amp; Win');
      expect(buttonHtml).toContain('https://northsoft.is/?a=1&amp;b=2');
    });
  });

  describe('Email Shell & Responsive Layout', () => {
    it('includes dark mode meta tags and email client reset styles', () => {
      const html = renderEmailShell({
        contentHtml: '<div>Test Content</div>',
      });

      expect(html).toContain('<meta name="color-scheme" content="dark" />');
      expect(html).toContain('<meta name="supported-color-schemes" content="dark" />');
      expect(html).toContain('class="email-container"');
      expect(html).toContain('background-color: #0b0f19'); // Deep SaaS dark outer canvas
      expect(html).toContain('background-color: #111827'); // Card container
      expect(html).toContain('border: 1px solid #1f2937');
    });

    it('renders preheader snippet when provided', () => {
      const html = renderEmailShell({
        preheaderText: 'Published: Automated AI Best Practices',
        contentHtml: '<div>Body</div>',
      });

      expect(html).toContain('Published: Automated AI Best Practices');
      expect(html).toContain('&zwnj;');
    });

    it('renders footer with product identity and legal copyright', () => {
      const currentYear = new Date().getUTCFullYear();
      const html = renderEmailShell({
        contentHtml: '<div>Body</div>',
      });

      expect(html).toContain('NorthSoft AI Content Creator');
      expect(html).toContain('Autonomous Content &amp; Publishing Engine');
      expect(html).toContain('automated administrative notification');
      expect(html).toContain(
        `&copy; ${currentYear} NorthSoft. All rights reserved. Reykjavik, Iceland.`,
      );
    });
  });

  describe('Content Card Component', () => {
    it('renders elevated card with customizable padding and border', () => {
      const card = renderCard('<p>Card Text</p>', {
        bg: '#1f2937',
        border: '1px solid #374151',
        padding: '20px',
      });

      expect(card).toContain('background-color: #1f2937');
      expect(card).toContain('border: 1px solid #374151');
      expect(card).toContain('padding: 20px');
      expect(card).toContain('<p>Card Text</p>');
    });
  });
});
