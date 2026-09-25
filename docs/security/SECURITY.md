# Security Model

## Overview

NorthSoft.AI.ContentCreator operates as a **public GitHub repository** with autonomous AI capabilities and Facebook publishing. This document describes the security boundaries and controls.

## Threat Model

### High-Risk Operations
1. **External API credentials** (AI providers, Meta tokens)
2. **Autonomous Facebook publishing** (AI-generated content goes public)
3. **Admin authentication** (unauthorized access to content pipeline)
4. **AI-generated content** (hallucinations, policy violations, brand damage)
5. **Database migrations** (schema changes affecting production data)
6. **Deployment configuration** (wrong environment, wrong credentials)

## Secrets Management

### Production Secrets
All production secrets are stored as **Cloudflare Worker Secrets**:

```bash
npx wrangler secret put AI_PROVIDER_API_KEY --env production
npx wrangler secret put META_PAGE_ACCESS_TOKEN --env production
npx wrangler secret put META_APP_SECRET --env production
npx wrangler secret put ADMIN_AUTH_SECRET --env production
```

- Secrets are encrypted at rest by Cloudflare
- Secrets are only available to the Worker runtime via `env.*`
- Secrets are never logged, never in Git, never in build artifacts

### Development Secrets
- Local development uses `.dev.vars` (gitignored)
- `.env.example` contains placeholder-only template
- Developers copy `.env.example` → `.dev.vars` and fill in their own keys

### What Must NEVER Be in Git
- API keys (AI providers, Meta, any third party)
- Access tokens (Facebook Page, admin sessions)
- App secrets (Meta App Secret)
- Passwords and session signing keys
- Production database dumps
- Private customer information
- `.env` files with real values
- `.dev.vars`

## Public Repository Protections

### Automated Secret Scanning
- `tests/security/secret-scan.test.ts` scans all source files for patterns matching known credential formats:
  - OpenAI keys (`sk-...`)
  - Facebook tokens (`EAA...`)
  - Google API keys (`AIza...`)
  - Anthropic keys (`sk-ant-...`)
  - GitHub tokens (`ghp_...`, `ghs_...`)
  - Generic password/secret patterns
- Runs in CI on every push and PR
- Must pass before merge

### .gitignore Protections
- `.dev.vars` (Wrangler local secrets)
- `.env`, `.env.local`, `.env.*.local`
- `*.pem`, `*.key`, `*.cert`
- `secrets.json`, `credentials.json`
- `.env.example` is explicitly allowed (contains only placeholders)

## Environment Isolation

### Publishing Safety
Facebook publishing requires **two independent conditions**:
1. `ENVIRONMENT === 'production'` (set in wrangler.jsonc, not user input)
2. `FACEBOOK_PUBLISH_ENABLED === 'true'` (explicit flag)

If EITHER condition is false, publishing is blocked. Staging and development environments can NEVER publish to the real Facebook Page, regardless of any flag setting.

This is enforced in code (`src/core/environment.ts`) and tested (`tests/unit/environment.test.ts`).

### Database Isolation
- Each environment uses a separate D1 database instance
- `northsoft-ai-contentcreator-prod` — production only
- `northsoft-ai-contentcreator-staging` — staging only
- Local development uses Wrangler's local D1 emulator

## Secure Logging

### Request Logger (`src/core/middleware/logger.ts`)
- Logs: method, path, status code, duration, user-agent, CF-Ray
- **NEVER logs**: Authorization headers, cookies, API keys, request bodies
- Sensitive headers are explicitly redacted via `REDACTED_HEADERS` set

### Audit Logger (`src/core/audit.ts`)
- Logs all autonomous operations (research, generation, QA, publishing)
- **NEVER logs**: Access tokens, API keys, raw AI prompts containing secrets
- Structured entries with event type, entity reference, actor, and safe details

## Content Safety

### Quality Gate
- Every AI-generated post must pass the Quality Gate before publication
- Critical failures (factual accuracy, hallucination, policy risk, copyright, spam) permanently block publication
- Maximum 3 regeneration attempts before permanent BLOCKED status
- The Quality Gate is deterministic code, not an AI opinion

### AI Independence
- Content generation and quality review use separate, independent AI calls
- A single AI inference cannot both generate and approve content
- The QA reviewer receives the content without knowing it was AI-generated

## Authentication & Session Security

- **Server-Side Sessions**: Authenticated admin sessions use secure, non-guessable 32-byte tokens.
- **D1 Token Hashing**: Plaintext session tokens are never stored in D1; only SHA-256 hashes (`token_hash`) are persisted.
- **Strict Cookie Attributes**:
  ```text
  HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400
  ```
- **Password Hashing**: PBKDF2-HMAC-SHA256 with 60,000 iterations and a 16-byte random salt per user.
  - *Workers CPU Budget Rationale*: 60,000 iterations executes in ~2-4ms CPU time using native Web Crypto C++ bindings, staying safely within the Cloudflare Workers Free plan 10ms CPU time limit per request while providing strong security against brute force.
- **CSRF Protection**: All state-changing endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) require an `X-CSRF-Token` header matching the session's CSRF secret (verified in constant time).
- **Brute-Force Rate Limiting**: D1-backed attempt tracking limits failed logins to 5 attempts per 15-minute window per IP/username.
- **Generic Error Responses**: Login failures always return generic "Invalid credentials." messages to prevent username enumeration.
- **Security Headers**: Admin responses set Content-Security-Policy, X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`), Referrer-Policy (`strict-origin-when-cross-origin`), and Permissions-Policy.
- **Secure Provisioning**: No default administrator account or hardcoded password exists in code or database migrations. Initial creation uses `npm run admin:provision`.

## Research & AI Security Controls (Phase 3A)

### Zero-Cost AI Policy Enforcement
- **Constraint**: `MAX_ALLOWED_AI_COST = 0` enforced by `QuotaManager`.
- **Allowed Providers**: Cloudflare Workers AI (`env.AI`) and local development mocks exclusively.
- **Paid Provider Prohibition**: Automatic or explicit fallback to paid AI APIs (OpenAI, Anthropic, Google, OpenRouter) is strictly prohibited and blocked at the provider factory layer.
- **Quota Accounting**: Tracks daily/monthly request limits in D1 (`ai_usage`). If limits are reached, research analysis defers (`DEFERRED_NO_FREE_AI_CAPACITY`) without data loss.

### SSRF Protection
- **Protocol Restriction**: Only `http:` and `https:` schemes allowed.
- **Private IP Rejection**: Rejects loopback (`127.0.0.1`, `::1`), private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), and Cloudflare internal metadata hostnames.
- **Fetch Guards**: Strict request timeouts (10 seconds) and maximum response size limits (2MB).

### Prompt Injection Defense
- External source data is treated as UNTRUSTED DATA and NEVER as instructions.
- Source material is sanitized, truncated (max 10,000 characters), and wrapped in `<untrusted_source_content>` XML boundary tags.
- Explicit system instructions forbid the AI model from ignoring directives or exposing internal secrets.

### Structured AI Output Schema Validation
- All AI JSON outputs are validated runtime against expected schemas (`validateCandidateTopicOutput`). Malformed or manipulated responses are rejected immediately (`status = 'FAILED'`).

## Content Pipeline & Neuron Budget Security Controls (Phase 3B)

### Daily Neuron Ceiling Protection
- **Hard Safety Ceiling**: `CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT = 7500` Neurons/day.
- **Shared Allocation Protection**: Reserves at least 2,500 Neurons/day for customer-facing AI and other NorthSoft AI services.
- **Budget State Transitions**: `NORMAL` (0-5k), `CONTROLLED` (5k-6k), `RESTRICTED` (6k-7.5k), `HARD_STOP` (>= 7.5k).
- **Pre-flight Estimation**: Checks budget before initiating expensive multi-stage workflows (Writer + QA). Defers gracefully if budget is insufficient.

### Independent QA Fact Checker
- **Self-Approval Prohibition**: The Writer AI never approves its own output. Generation and Review are logically isolated inference calls with independent role prompts (`writer` vs `qa`).
- **Adversarial Verification**: QA model evaluates draft against ground-truth research evidence inside `<research_context>` tags.

### Bounded Regeneration & Post Versioning
- **Maximum Retries**: Bounded to a maximum of 2 retries (3 versions total) before permanent `BLOCKED` status.
- **Audit Invariant**: Post versions are stored as immutable history in `post_versions` (v1, v2, v3). Existing versions are never overwritten.


## Deployment Security
- CI must pass all checks before merge (typecheck, lint, tests, security scan, audit)
- Production deployment is a separate, explicit step (`npm run deploy:production`)
- Database migrations require explicit environment targeting
- No auto-deploy to production from CI (deliberate)

## Incident Response
- If a secret is accidentally committed: rotate immediately, force-push removal, update Cloudflare secrets
- If unauthorized content is published: immediately disable `FACEBOOK_PUBLISH_ENABLED`, investigate audit log
- If AI produces harmful content: Quality Gate should catch; if it doesn't, update validation rules and investigate

