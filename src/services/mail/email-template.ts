/**
 * NorthSoft.AI.ContentCreator — Reusable Email Design System & Template Builder
 *
 * Implements a modern, elegant, restrained SaaS aesthetic matching the NorthSoft brand.
 * Built with bulletproof, email-safe HTML (table layouts, inline styles, Outlook/Apple/Gmail compatibility)
 * and responsive mobile rules.
 *
 * Solves:
 * - Status badge clipping and awkward line wrapping on mobile.
 * - Lack of spacing between brand name and status badges on desktop/laptops.
 * - Inconsistent visual styles across notification types.
 * - Lack of official brand logo assets and alt-text fallbacks.
 */

export const NORTHSOFT_LOGO_URL = 'https://northsoft.is/brand/logos/northsoft-symbol.svg';

export type BadgeVariant = 'success' | 'alert' | 'warning' | 'info' | 'security' | 'neutral';

export interface EmailBadge {
  text: string;
  variant?: BadgeVariant;
  customColor?: string;
  customBg?: string;
  customBorder?: string;
}

export interface EmailButton {
  text: string;
  url: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface EmailShellOptions {
  /** Email preview / hidden inbox snippet text */
  preheaderText?: string;
  /** Main header title (defaults to 'NorthSoft AI Content Creator') */
  brandTitle?: string;
  /** Subtitle under the brand title (e.g. 'Weekly Performance Digest') */
  brandSubtitle?: string;
  /** Optional status badge in the header */
  badge?: EmailBadge;
  /** Inner HTML body content */
  contentHtml: string;
  /** Optional primary CTA button */
  button?: EmailButton;
  /** Optional extra footer note */
  footerNote?: string;
  /** Max container width in px (default 600, or 640 for multi-metric digests) */
  maxWidth?: number;
}

/**
 * HTML Entity encoder to prevent XSS / HTML injection in dynamic content.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Returns color tokens for badge variants.
 */
export function getBadgeColors(variant: BadgeVariant = 'neutral'): {
  color: string;
  bg: string;
  border: string;
} {
  switch (variant) {
    case 'success':
      return {
        color: '#34d399',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.35)',
      };
    case 'alert':
      return {
        color: '#fda4af',
        bg: 'rgba(244, 63, 94, 0.15)',
        border: 'rgba(244, 63, 94, 0.35)',
      };
    case 'warning':
      return {
        color: '#fcd34d',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.35)',
      };
    case 'security':
      return {
        color: '#60a5fa',
        bg: 'rgba(59, 130, 246, 0.15)',
        border: 'rgba(59, 130, 246, 0.35)',
      };
    case 'info':
      return {
        color: '#38bdf8',
        bg: 'rgba(6, 182, 212, 0.15)',
        border: 'rgba(6, 182, 212, 0.35)',
      };
    case 'neutral':
    default:
      return {
        color: '#94a3b8',
        bg: 'rgba(148, 163, 184, 0.15)',
        border: 'rgba(148, 163, 184, 0.35)',
      };
  }
}

/**
 * Renders a bulletproof, email-safe status badge table component.
 * Uses explicit padding, line-height, and non-breaking spaces to guarantee
 * no clipping or awkward wrapping across all email clients.
 */
export function renderBadge(badge: EmailBadge): string {
  const colors = getBadgeColors(badge.variant);
  const color = badge.customColor || colors.color;
  const bg = badge.customBg || colors.bg;
  const border = badge.customBorder || colors.border;
  const safeText = escapeHtml(badge.text);

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; display: inline-table; vertical-align: middle;">
      <tr>
        <td align="center" valign="middle" style="background-color: ${bg}; border: 1px solid ${border}; border-radius: 9999px; padding: 5px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; line-height: 14px; letter-spacing: 0.05em; color: ${color}; white-space: nowrap; text-align: center; mso-padding-alt: 4px 10px;">
          ${safeText}
        </td>
      </tr>
    </table>`.trim();
}

/**
 * Renders a bulletproof touch-friendly action button (min 44px height for mobile ergonomics).
 */
export function renderButton(button: EmailButton): string {
  let bgColor = '#1877f2'; // NorthSoft brand primary blue
  let textColor = '#ffffff';

  if (button.variant === 'secondary') {
    bgColor = '#374151';
    textColor = '#f9fafb';
  } else if (button.variant === 'danger') {
    bgColor = '#e11d48';
    textColor = '#ffffff';
  }

  const safeUrl = escapeHtml(button.url);
  const safeText = escapeHtml(button.text);

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; margin: 0;">
      <tr>
        <td align="center" valign="middle" style="background-color: ${bgColor}; border-radius: 6px;">
          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="background-color: ${bgColor}; color: ${textColor}; padding: 12px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; line-height: 20px; text-decoration: none; border-radius: 6px; display: inline-block; mso-padding-alt: 0; text-align: center;">
            <!--[if mso]><i style="letter-spacing: 24px; mso-font-width: -100%; mso-text-raise: 30pt">&nbsp;</i><![endif]-->
            <span style="mso-text-raise: 15pt;">${safeText}</span>
            <!--[if mso]><i style="letter-spacing: 24px; mso-font-width: -100%">&nbsp;</i><![endif]-->
          </a>
        </td>
      </tr>
    </table>`.trim();
}

/**
 * Renders an elevated content card with border and subtle styling.
 */
export function renderCard(
  contentHtml: string,
  options?: {
    border?: string;
    bg?: string;
    padding?: string;
    marginBottom?: string;
  },
): string {
  const border = options?.border || '1px solid #1f2937';
  const bg = options?.bg || '#1f2937';
  const padding = options?.padding || '16px';
  const marginBottom = options?.marginBottom || '20px';

  return `
    <div style="background-color: ${bg}; border: ${border}; border-radius: 8px; padding: ${padding}; margin-bottom: ${marginBottom};">
      ${contentHtml}
    </div>`.trim();
}

/**
 * Builds the complete outer HTML email shell with consistent brand header,
 * container cards, mobile stacking CSS, dark-mode meta, and compliant footer.
 */
export function renderEmailShell(options: EmailShellOptions): string {
  const maxWidth = options.maxWidth || 600;
  const brandTitle = options.brandTitle || 'NorthSoft AI Content Creator';
  const brandSubtitle = options.brandSubtitle;
  const preheaderText = options.preheaderText || '';
  const currentYear = new Date().getUTCFullYear();

  const badgeHtml = options.badge ? renderBadge(options.badge) : '';
  const buttonHtml = options.button ? renderButton(options.button) : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <title>${escapeHtml(brandTitle)}</title>
  <style type="text/css">
    /* Client-specific resets */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; min-width: 100%; background-color: #0b0f19; }

    /* iOS blue links reset */
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }

    /* Responsive media queries */
    @media only screen and (max-width: 480px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .mobile-padding {
        padding-left: 16px !important;
        padding-right: 16px !important;
        padding-top: 20px !important;
        padding-bottom: 20px !important;
      }
      .header-stack-col {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      .badge-cell {
        padding-left: 0 !important;
        padding-top: 10px !important;
        text-align: left !important;
      }
      .badge-cell table {
        margin: 0 !important;
      }
      .metric-stack-col {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        margin-bottom: 10px !important;
      }
    }
  </style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, h1, h2, h3, span { font-family: Segoe UI, Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f1f5f9;">

  ${
    preheaderText
      ? `
  <!-- Preheader text -->
  <div style="display: none; font-size: 1px; color: #0b0f19; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    ${escapeHtml(preheaderText)}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>`
      : ''
  }

  <!-- Main Canvas Wrapper -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0f19; table-layout: fixed;">
    <tr>
      <td align="center" valign="top" style="padding: 24px 12px 36px 12px;">

        <!-- Email Container Card -->
        <!--[if (gte mso 9)|(IE)]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="${maxWidth}">
        <tr>
        <td align="center" valign="top" width="${maxWidth}">
        <![endif]-->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: ${maxWidth}px; width: 100%; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden;">
          
          <!-- Header Area -->
          <tr>
            <td class="mobile-padding" style="padding: 24px 28px 20px 28px; border-bottom: 1px solid #1f2937;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <!-- Left: Brand Logo & Product Name -->
                  <td valign="middle" class="header-stack-col" align="left">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td valign="middle" style="padding-right: 12px;">
                          <img src="${NORTHSOFT_LOGO_URL}" width="28" height="28" alt="NorthSoft" style="display: block; width: 28px; height: 28px; border: 0; border-radius: 4px;" />
                        </td>
                        <td valign="middle">
                          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: #60a5fa; letter-spacing: -0.01em; line-height: 20px; display: block;">
                            ${escapeHtml(brandTitle)}
                          </span>
                          ${
                            brandSubtitle
                              ? `<span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #9ca3af; line-height: 16px; display: block; margin-top: 2px;">
                            ${escapeHtml(brandSubtitle)}
                          </span>`
                              : ''
                          }
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Right: Status / Category Badge (Always adequately spaced on desktop, stacks gracefully on mobile) -->
                  ${
                    badgeHtml
                      ? `
                  <td valign="middle" align="right" class="header-stack-col badge-cell" style="padding-left: 16px;">
                    ${badgeHtml}
                  </td>`
                      : ''
                  }
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td class="mobile-padding" style="padding: 24px 28px; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6;">
              ${options.contentHtml}

              ${
                buttonHtml
                  ? `
              <!-- Primary Action CTA -->
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #1f2937;">
                ${buttonHtml}
              </div>`
                  : ''
              }
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td class="mobile-padding" style="padding: 20px 28px 24px 28px; background-color: #0d131f; border-top: 1px solid #1f2937;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; line-height: 17px; color: #64748b;">
                    <div><strong>NorthSoft AI Content Creator</strong> · Autonomous Content &amp; Publishing Engine</div>
                    ${
                      options.footerNote
                        ? `<div style="margin-top: 4px; color: #94a3b8;">${escapeHtml(options.footerNote)}</div>`
                        : ''
                    }
                    <div style="margin-top: 6px; color: #475569;">
                      This is an automated administrative notification. Please do not reply directly to this email.<br />
                      &copy; ${currentYear} NorthSoft. All rights reserved. Reykjavik, Iceland.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->

      </td>
    </tr>
  </table>

</body>
</html>`.trim();
}
