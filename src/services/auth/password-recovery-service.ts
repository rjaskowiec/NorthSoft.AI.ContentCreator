/**
 * NorthSoft.AI.ContentCreator — Password Recovery & Management Service
 *
 * Implements secure password change (authenticated), email-based password reset
 * request (unauthenticated), single-use token verification, session invalidation,
 * and integration with NorthSoft Mail Gateway.
 */

import { IAuditLogger } from '../../core/audit.js';
import {
  generateRandomToken,
  generateSalt,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../../core/auth/crypto.js';
import { createSession, CreatedSession, revokeAllUserSessions } from '../../core/auth/session.js';
import { IMailGatewayClient } from '../mail/mail-service.js';

export const MIN_PASSWORD_LENGTH = 12;
export const RESET_TOKEN_EXPIRATION_MINUTES = 30;
export const CANONICAL_APP_ORIGIN = 'https://ai.northsoft.is';

export interface PasswordRecoveryResult {
  success: boolean;
  message: string;
  newSession?: CreatedSession;
}

export class PasswordRecoveryService {
  constructor(
    private db: D1Database,
    private mailGateway: IMailGatewayClient,
    private auditLogger: IAuditLogger,
  ) {}

  /**
   * Change password for an authenticated administrator.
   */
  public async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    clientIp: string;
    userAgent?: string;
  }): Promise<PasswordRecoveryResult> {
    const { userId, currentPassword, newPassword, confirmPassword, clientIp, userAgent } = params;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return {
        success: false,
        message: 'Current password, new password, and password confirmation are required.',
      };
    }

    if (newPassword !== confirmPassword) {
      return {
        success: false,
        message: 'New passwords do not match.',
      };
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        success: false,
        message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      };
    }

    const user = await this.db
      .prepare(
        'SELECT id, username, password_hash, password_salt, status FROM admin_users WHERE id = ?',
      )
      .bind(userId)
      .first<{
        id: string;
        username: string;
        password_hash: string;
        password_salt: string;
        status: string;
      }>();

    if (!user || user.status !== 'active') {
      return {
        success: false,
        message: 'User account not found or disabled.',
      };
    }

    const isCurrentValid = await verifyPassword(
      currentPassword,
      user.password_salt,
      user.password_hash,
    );

    if (!isCurrentValid) {
      return {
        success: false,
        message: 'Current password is incorrect.',
      };
    }

    const newSalt = generateSalt(16);
    const newHash = await hashPassword(newPassword, newSalt);
    const nowIso = new Date().toISOString();

    await this.db
      .prepare(
        'UPDATE admin_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?',
      )
      .bind(newHash, newSalt, nowIso, userId)
      .run();

    // Mandatory Security Invariant: Invalidate all existing sessions
    await revokeAllUserSessions(this.db, userId);

    // Create fresh authenticated session for current user
    const newSession = await createSession(this.db, userId, clientIp, userAgent);

    await this.auditLogger.log({
      eventType: 'ADMIN_PASSWORD_CHANGED',
      entityType: 'admin_user',
      entityId: userId,
      actor: 'admin',
      details: {
        username: user.username,
        clientIp,
      },
    });

    return {
      success: true,
      message: 'Password changed successfully.',
      newSession,
    };
  }

  /**
   * Initiate password recovery (unauthenticated).
   * Account enumeration protection: Always returns identical success response.
   */
  public async requestPasswordReset(params: {
    email: string;
    clientIp: string;
    requestOrigin?: string;
  }): Promise<PasswordRecoveryResult> {
    const { email, clientIp, requestOrigin } = params;
    const genericResponse = {
      success: true,
      message: 'If an account matches this information, a password reset email has been sent.',
    };

    if (!email || typeof email !== 'string') {
      return genericResponse;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return genericResponse;
    }

    const user = await this.db
      .prepare(
        'SELECT id, username, email, status FROM admin_users WHERE LOWER(email) = ? AND status = ?',
      )
      .bind(normalizedEmail, 'active')
      .first<{
        id: string;
        username: string;
        email: string;
        status: string;
      }>();

    if (!user) {
      // Account does not exist — do not reveal details to caller
      return genericResponse;
    }

    // Invalidate old active reset tokens for this user
    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        'UPDATE admin_password_reset_tokens SET used_at = ? WHERE admin_user_id = ? AND used_at IS NULL',
      )
      .bind(nowIso, user.id)
      .run();

    // Generate single-use high-entropy token
    const rawToken = generateRandomToken(32);
    const tokenHash = await hashToken(rawToken);
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_EXPIRATION_MINUTES * 60 * 1000,
    ).toISOString();

    await this.db
      .prepare(
        'INSERT INTO admin_password_reset_tokens (id, admin_user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(tokenId, user.id, tokenHash, expiresAt, nowIso)
      .run();

    const origin =
      requestOrigin && requestOrigin.startsWith('https://') ? requestOrigin : CANONICAL_APP_ORIGIN;
    const resetUrl = `${origin}/admin?resetToken=${rawToken}`;

    const textBody = `Hello,

A request was made to reset your administrator password for NorthSoft.AI.ContentCreator.

To choose a new password, please open the following secure link:
${resetUrl}

This reset link is valid for ${RESET_TOKEN_EXPIRATION_MINUTES} minutes and can only be used once.

If you did not request a password reset, you can safely ignore this message.

Best regards,
NorthSoft AI Security Team`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <h2 style="color: #0f172a; margin-top: 0;">NorthSoft AI Content Creator</h2>
    <p>Hello,</p>
    <p>A request was made to reset your administrator password.</p>
    <p style="margin: 25px 0;">
      <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Administrator Password</a>
    </p>
    <p style="font-size: 0.9rem; color: #64748b;">Or copy and paste this link into your browser:<br><a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
    <p style="font-size: 0.85rem; color: #64748b;">This link is valid for <strong>${RESET_TOKEN_EXPIRATION_MINUTES} minutes</strong> and can only be used once.<br>If you did not request a password reset, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

    await this.mailGateway.sendEmail({
      to: user.email,
      subject: 'Reset your NorthSoft.AI.ContentCreator password',
      text: textBody,
      html: htmlBody,
    });

    await this.auditLogger.log({
      eventType: 'ADMIN_PASSWORD_RESET_REQUESTED',
      entityType: 'admin_user',
      entityId: user.id,
      actor: 'system',
      details: {
        username: user.username,
        clientIp,
      },
    });

    return genericResponse;
  }

  /**
   * Reset password using a single-use token.
   */
  public async resetPassword(params: {
    token: string;
    newPassword: string;
    confirmPassword: string;
    clientIp: string;
  }): Promise<PasswordRecoveryResult> {
    const { token, newPassword, confirmPassword, clientIp } = params;

    if (!token || typeof token !== 'string') {
      return {
        success: false,
        message: 'This password reset link is invalid or has expired.',
      };
    }

    if (!newPassword || !confirmPassword) {
      return {
        success: false,
        message: 'New password and password confirmation are required.',
      };
    }

    if (newPassword !== confirmPassword) {
      return {
        success: false,
        message: 'New passwords do not match.',
      };
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      };
    }

    const tokenHash = await hashToken(token);

    const tokenRow = await this.db
      .prepare(
        `SELECT t.id as token_id, t.admin_user_id, t.expires_at, t.used_at, u.username, u.status as user_status
         FROM admin_password_reset_tokens t
         JOIN admin_users u ON t.admin_user_id = u.id
         WHERE t.token_hash = ?`,
      )
      .bind(tokenHash)
      .first<{
        token_id: string;
        admin_user_id: string;
        expires_at: string;
        used_at: string | null;
        username: string;
        user_status: string;
      }>();

    const nowIso = new Date().toISOString();

    if (
      !tokenRow ||
      tokenRow.used_at !== null ||
      tokenRow.expires_at < nowIso ||
      tokenRow.user_status !== 'active'
    ) {
      await this.auditLogger.log({
        eventType: 'ADMIN_PASSWORD_RESET_FAILED',
        entityType: 'password_reset_token',
        entityId: tokenHash.substring(0, 8),
        actor: 'system',
        details: {
          clientIp,
          reason: 'invalid_expired_or_used_token',
        },
      });

      return {
        success: false,
        message: 'This password reset link is invalid or has expired.',
      };
    }

    // Single-use atomic concurrency lock: mark token as used
    const markRes = await this.db
      .prepare(
        'UPDATE admin_password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
      )
      .bind(nowIso, tokenRow.token_id)
      .run();

    if (!markRes.success || markRes.meta.changes !== 1) {
      return {
        success: false,
        message: 'This password reset link is invalid or has expired.',
      };
    }

    // Update password
    const newSalt = generateSalt(16);
    const newHash = await hashPassword(newPassword, newSalt);

    await this.db
      .prepare(
        'UPDATE admin_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?',
      )
      .bind(newHash, newSalt, nowIso, tokenRow.admin_user_id)
      .run();

    // Mandatory Security Invariant: Invalidate all existing sessions after reset
    await revokeAllUserSessions(this.db, tokenRow.admin_user_id);

    await this.auditLogger.log({
      eventType: 'ADMIN_PASSWORD_RESET_COMPLETED',
      entityType: 'admin_user',
      entityId: tokenRow.admin_user_id,
      actor: 'system',
      details: {
        username: tokenRow.username,
        clientIp,
      },
    });

    return {
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.',
    };
  }
}
