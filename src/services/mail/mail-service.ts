/**
 * NorthSoft.AI.ContentCreator — Mail Gateway Client
 *
 * Integrates with NorthSoft Mail Gateway (https://mail.northsoft.is)
 * for secure administrative email delivery (password resets, system notifications).
 *
 * Rules:
 * - NO direct SMTP credentials in ContentCreator.
 * - NO external third-party mail providers (Brevo, SendGrid, etc.).
 * - Uses Cloudflare Secrets (NORTHSOFT_MAIL_API_KEY) for authentication.
 * - Sanitizes log output to prevent credential exposure.
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IMailGatewayClient {
  sendEmail(options: SendEmailOptions): Promise<MailSendResult>;
}

export interface MailGatewayEnv {
  GATEWAY_TOKEN?: string;
  NORTHSOFT_MAIL_API_KEY?: string;
  NORTHSOFT_MAIL_GATEWAY_URL?: string;
}

/**
 * Production implementation of NorthSoft Mail Gateway API client.
 */
export class NorthSoftMailGatewayClient implements IMailGatewayClient {
  private apiKey: string;
  private gatewayUrl: string;

  constructor(env: MailGatewayEnv) {
    this.apiKey = (env.GATEWAY_TOKEN || env.NORTHSOFT_MAIL_API_KEY || '').trim();
    this.gatewayUrl = (
      env.NORTHSOFT_MAIL_GATEWAY_URL || 'https://mail.northsoft.is/api/send'
    ).trim();
  }

  public async sendEmail(options: SendEmailOptions): Promise<MailSendResult> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'GATEWAY_TOKEN is not configured in environment bindings.',
      };
    }

    try {
      const payload = {
        from: {
          email: 'no-reply@northsoft.is',
          name: 'NorthSoft AI Security',
        },
        to: [
          {
            email: options.to,
            name: 'NorthSoft Administrator',
          },
        ],
        replyTo: {
          email: 'support@northsoft.is',
          name: 'NorthSoft Support',
        },
        subject: options.subject,
        html: options.html,
      };

      const response = await fetch(this.gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          success: false,
          error: `Mail Gateway HTTP ${response.status}: ${errorText || 'Request failed'}`,
        };
      }

      const data = (await response.json().catch(() => ({}))) as {
        messageId?: string;
        id?: string;
        success?: boolean;
      };

      return {
        success: true,
        messageId: data.messageId || data.id || `mail-${Date.now()}`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Mail Gateway network exception: ${errorMsg}`,
      };
    }
  }
}

/**
 * Deterministic test double for automated test runs.
 * Prevents real email sending during tests.
 */
export class MockMailGatewayClient implements IMailGatewayClient {
  public sentEmails: SendEmailOptions[] = [];
  public shouldFail = false;
  public failureMessage = 'Mock Mail Gateway transmission error';

  public async sendEmail(options: SendEmailOptions): Promise<MailSendResult> {
    if (this.shouldFail) {
      return {
        success: false,
        error: this.failureMessage,
      };
    }

    this.sentEmails.push(options);
    return {
      success: true,
      messageId: `mock-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
  }

  public reset(): void {
    this.sentEmails = [];
    this.shouldFail = false;
  }
}
