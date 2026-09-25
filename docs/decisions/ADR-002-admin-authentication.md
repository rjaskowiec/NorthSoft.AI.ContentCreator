# ADR-002: Secure Administrator Authentication & Dashboard Architecture

- **Status**: Approved
- **Date**: 2026-09-25
- **Author**: rjaskowiec

---

## Context

The NorthSoft AI Content Creator application requires a secure administrative surface for monitoring system status, content pipeline metrics, and auditing autonomous operations prior to enabling AI generation or Facebook publishing.

Key Constraints:
1. **Public Repository**: Source code is public; no credentials, default passwords, or secrets may exist in source code or Git history.
2. **Cloudflare Free Plan**: Must operate strictly within Cloudflare Free tier limits (no paid services, no external Redis/auth SaaS).
3. **Single-Owner Application**: Designed for single-owner administrative control with maximum security.

---

## Decision

We adopt **Server-Side Session Authentication** backed by Cloudflare D1 database and Web Crypto API.

### 1. Credentials Hashing
- Passwords are hashed using PBKDF2-HMAC-SHA256 with 60,000 iterations and a 16-byte random salt per user.
- Password hashes and salts are stored in the D1 `admin_users` table.

### 2. Session Security & Cookie Handling
- Authenticated sessions issue a 32-byte non-guessable random token stored in client-side cookies.
- Cookies use strict security attributes:
  ```text
  HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400
  ```
- The database `admin_sessions` table stores ONLY a SHA-256 hash of the session token (`token_hash`), ensuring database leaks do not compromise active sessions.
- Tokens are never exposed in JSON responses or accessible to client-side JavaScript.

### 3. CSRF Protection
- Every session generates a 32-byte CSRF secret stored in D1.
- State-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) require the `X-CSRF-Token` header (or form parameter) matching the session CSRF secret.
- Token verification uses constant-time string comparison (`timingSafeEqual`).

### 4. Brute-Force Rate Limiting
- Login attempts are recorded in the D1 `login_attempts` table tracking IP address, username, timestamp, and success state.
- Accounts/IPs exceeding 5 failed login attempts in 15 minutes receive HTTP 429 Too Many Requests.
- Generic error messages ("Invalid credentials.") prevent username enumeration.

### 5. Secure First-Run Provisioning
- No default credentials (e.g. `admin/admin`) are committed or inserted into database seed migrations.
- Provisioning is performed via an out-of-band CLI tool (`npm run admin:provision -- --username <user> --password <pass>`) that generates an encrypted SQL statement executed via Wrangler D1.

---

## Consequences

- **Positive**: Complete compliance with Cloudflare Free limits, zero paid dependencies, high security posture against brute-force and session fixation, CSRF protection, clean modern UI.
- **Negative**: D1 queries per authenticated request (mitigated by indexed lookups and fast SQLite reads).
