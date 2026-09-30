import { describe, expect, it, beforeEach } from 'vitest';
import { NotificationService } from '../../src/services/notifications/notification-service';
import { MockMailGatewayClient } from '../../src/services/mail/mail-service';

class MockD1Database {
  public adminUsers: Array<{ id: string; email: string; status: string; created_at: string }> = [
    { id: 'admin-1', email: 'admin@northsoft.is', status: 'active', created_at: '2026-01-01T00:00:00Z' },
  ];
  public sentEmailReports: Array<any> = [];
  public publications: Array<any> = [];
  public posts: Array<any> = [];
  public metrics: Array<any> = [];

  prepare(sql: string) {
    let boundArgs: any[] = [];
    const stmt = {
      bind: (...args: any[]) => {
        boundArgs = args;
        return stmt;
      },
      first: async <T = any>(): Promise<T | null> => {
        if (sql.includes('FROM admin_users')) {
          const active = this.adminUsers.find((u) => u.status === 'active' && u.email);
          return active ? ({ email: active.email } as any) : null;
        }
        if (sql.includes('FROM sent_email_reports WHERE report_key')) {
          const key = boundArgs[0];
          const match = this.sentEmailReports.find((r) => r.report_key === key && r.status === 'SENT');
          return match ? (match as any) : null;
        }
        return null;
      },
      all: async <T = any>(): Promise<{ results: T[] }> => {
        if (sql.includes('FROM publications pub')) {
          return { results: this.publications as any };
        }
        return { results: [] };
      },
      run: async () => {
        if (sql.includes('INSERT INTO sent_email_reports')) {
          this.sentEmailReports.push({
            id: boundArgs[0],
            report_key: boundArgs[1],
            report_type: boundArgs[2],
            recipient_email: boundArgs[3],
            subject: boundArgs[4],
            status: boundArgs[5],
            error_message: boundArgs[6],
            metadata: boundArgs[7],
            sent_at: boundArgs[8],
          });
        }
        return { meta: { changes: 1 } };
      },
    };
    return stmt;
  }
}

describe('NotificationService Unit Tests', () => {
  let mockDb: MockD1Database;
  let mockMailClient: MockMailGatewayClient;

  beforeEach(() => {
    mockDb = new MockD1Database();
    mockMailClient = new MockMailGatewayClient();
  });

  describe('Recipient Resolution', () => {
    it('fetches recipient email from admin_users table', async () => {
      const email = await NotificationService.getAdminRecipientEmail(mockDb as any);
      expect(email).toBe('admin@northsoft.is');
    });

    it('returns null if no active admin email exists', async () => {
      mockDb.adminUsers = [];
      const email = await NotificationService.getAdminRecipientEmail(mockDb as any);
      expect(email).toBeNull();
    });
  });

  describe('Publication Success Notification', () => {
    it('sends publication email with complete post content and Facebook URL', async () => {
      const result = await NotificationService.sendPublicationSuccessNotification(
        mockDb as any,
        mockMailClient,
        {
          postId: 'post-101',
          title: '5 Ways to Improve Website Speed',
          body: 'Full post text goes here without truncation.',
          publishedAt: '2026-09-30T18:00:00Z',
          facebookPostId: 'fb-post-999',
          imageUrl: 'https://ai.northsoft.is/media/img1.jpg',
        },
      );

      expect(result.success).toBe(true);
      expect(mockMailClient.sentEmails).toHaveLength(1);
      const mail = mockMailClient.sentEmails[0]!;

      expect(mail.to).toBe('admin@northsoft.is');
      expect(mail.subject).toContain('NorthSoft AI Content Creator — Post published');
      expect(mail.html).toContain('5 Ways to Improve Website Speed');
      expect(mail.html).toContain('Full post text goes here without truncation.');
      expect(mail.html).toContain('https://facebook.com/fb-post-999');
      expect(mail.html).toContain('https://ai.northsoft.is/media/img1.jpg');

      // Idempotency log written
      expect(mockDb.sentEmailReports).toHaveLength(1);
      expect(mockDb.sentEmailReports[0].report_key).toBe('pub_notify:post-101');
      expect(mockDb.sentEmailReports[0].status).toBe('SENT');
    });

    it('skips sending duplicate notification when report key already sent', async () => {
      // Pre-seed sent report
      mockDb.sentEmailReports.push({
        report_key: 'pub_notify:post-101',
        status: 'SENT',
      });

      const result = await NotificationService.sendPublicationSuccessNotification(
        mockDb as any,
        mockMailClient,
        {
          postId: 'post-101',
          title: '5 Ways to Improve Website Speed',
          body: 'Content',
          publishedAt: '2026-09-30T18:00:00Z',
        },
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(mockMailClient.sentEmails).toHaveLength(0);
    });
  });

  describe('Publication Error Alert Notification', () => {
    it('sends actionable error alert email to admin', async () => {
      const result = await NotificationService.sendPublicationErrorNotification(
        mockDb as any,
        mockMailClient,
        {
          postId: 'post-102',
          title: 'Automated SEO Best Practices',
          action: 'Facebook Publication',
          errorMessage: 'Meta Graph API token expired',
          suggestedAction: 'Re-authenticate Facebook Page Access Token in Cloudflare Secrets',
        },
      );

      expect(result.success).toBe(true);
      expect(mockMailClient.sentEmails).toHaveLength(1);

      const mail = mockMailClient.sentEmails[0]!;
      expect(mail.subject).toContain('Publication alert: Automated SEO Best Practices');
      expect(mail.html).toContain('Meta Graph API token expired');
      expect(mail.html).toContain('Re-authenticate Facebook Page Access Token');
    });
  });

  describe('Weekly Performance Digest', () => {
    it('generates previous calendar week digest and enforces idempotency key', async () => {
      // Mock 2 published posts in previous week
      mockDb.publications = [
        {
          pub_id: 'pub-1',
          post_id: 'post-1',
          facebook_post_id: 'fb-1',
          published_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
          title: 'Top Performing Post Title',
          views: 5000,
          unique_views: 4500,
          reactions: 200,
          comments: 30,
          shares: 15,
          engagement_rate: 0.054,
          relative_performance: 1.8,
        },
      ];

      const result = await NotificationService.sendWeeklyDigest(mockDb as any, mockMailClient, {
        targetWeekKey: 'weekly_digest:2026-W39',
      });

      expect(result.success).toBe(true);
      expect(result.reportKey).toBe('weekly_digest:2026-W39');
      expect(mockMailClient.sentEmails).toHaveLength(1);

      const mail = mockMailClient.sentEmails[0]!;
      expect(mail.subject).toContain('NorthSoft AI Content Creator — Weekly Digest');
      expect(mail.html).toContain('Top Performing Posts');
      expect(mail.html).toContain('Top Performing Post Title');
      expect(mail.html).toContain('Content Intelligence Feedback Loop');

      // Verify idempotency on second call
      const repeatResult = await NotificationService.sendWeeklyDigest(
        mockDb as any,
        mockMailClient,
        {
          targetWeekKey: 'weekly_digest:2026-W39',
        },
      );

      expect(repeatResult.success).toBe(true);
      expect(repeatResult.skipped).toBe(true);
      expect(mockMailClient.sentEmails).toHaveLength(1); // Still 1, no duplicate sent
    });
  });
});
