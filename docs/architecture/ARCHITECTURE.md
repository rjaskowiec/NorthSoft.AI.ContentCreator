# Architecture Overview

## System Architecture

NorthSoft.AI.ContentCreator is an autonomous AI content pipeline running on Cloudflare Workers (Free plan).

### High-Level Data Flow

```
┌───────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers Runtime                      │
│                                                                    │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐  │
│  │ Research  │──▶│  Writer  │──▶│  Static  │──▶│  AI Quality  │  │
│  │  Agent    │   │          │   │Validation│   │   Review      │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────┬───────┘  │
│                                                        │          │
│                                                 ┌──────▼───────┐  │
│                                                 │   Policy &   │  │
│                                                 │  Compliance  │  │
│                                                 └──────┬───────┘  │
│                                                        │          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────▼───────┐  │
│  │ Facebook │◀──│Scheduler │◀──│ Quality  │◀──│   Quality    │  │
│  │ Meta API │   │          │   │  Gate    │   │    Gate      │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Cloudflare D1 (SQLite)                    │  │
│  │  Posts │ Versions │ QA Results │ Sources │ Audit │ Settings  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                      Admin Panel (Hono)                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

## Components

### API Layer (`src/api/`)
- Hono-based HTTP routes
- Health & readiness endpoints (`/api/health`)
- Auth endpoints (`/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, `/api/auth/csrf`)
- Admin endpoints (`/api/admin/dashboard`, `/api/admin/settings`)
- Admin UI Dashboard (`/admin`)

### Admin Request Flow

```
Browser
  ↓
Authentication (POST /api/auth/login)
  ↓
HttpOnly Session Cookie (admin_session)
  ↓
Authorization Guard (requireAdmin middleware)
  ↓
CSRF Protection (X-CSRF-Token validation)
  ↓
Admin API (/api/admin/*)
  ↓
D1 Database (admin_users, admin_sessions, audit_log)
```

### AI Layer (`src/ai/`)
- `IAIProvider` — Provider-agnostic AI abstraction
- `CloudflareWorkersAIProvider` — Free AI inference using native Workers AI binding (`env.AI`) with `@cf/meta/llama-3.1-8b-instruct`
- `QuotaManager` — Enforces `MAX_ALLOWED_AI_COST = 0` and tracks daily/monthly request quotas in D1 (`ai_usage`)
- Zero Paid AI Policy: OpenAI, Anthropic, or paid APIs are strictly prohibited from execution or automatic fallbacks

### Research Engine (`src/services/research/`)
```text
Research Source (RSS/Atom)
       ↓
SSRF Safe Ingestion
       ↓
SHA-256 Deduplication (url_hash)
       ↓
Prompt Injection Escaping
       ↓
Quota Capacity Check (MAX_AI_COST = 0)
       ├── Capacity Exceeded → DEFERRED_NO_FREE_AI_CAPACITY
       └── Free Capacity Available → Cloudflare Workers AI
                                             ↓
                                    Schema Validation
                                             ↓
                                    Candidate Topic (D1)
```

### Core (`src/core/`)
- Domain types matching D1 schema
- Quality gate evaluation (deterministic + AI)
- Error handling (operational vs unexpected)
- Audit logging (secret-safe)
- Environment utilities (publish safety guards)
- Request middleware (logging, security headers)

### Publishing (`src/publishing/`)
- `IMetaPublisher` — Meta/Facebook API abstraction
- Future: Official Graph API implementation
- Environment-gated: production + explicit flag required

### Infrastructure
- **Cloudflare Workers**: Serverless compute (100K req/day free)
- **Cloudflare D1**: SQLite database (5GB, 5M reads/day free)
- **Cloudflare Secrets**: Production credentials
- **Cloudflare Cron Triggers**: Future scheduled pipeline runs

## Database Schema

```
content_ideas ──┐
                 ├──▶ posts ──▶ post_versions
                 │      │
                 │      ├──▶ quality_checks
                 │      ├──▶ post_sources ──▶ sources
                 │      ├──▶ schedules
                 │      └──▶ publications
                 │
ai_runs ─────────┘
content_settings (brand config)
audit_log (system-wide)
```

## AI Pipeline Architecture

### Separation of Concerns

The Writer and QA components are **logically independent**:

1. **Research Agent** — Discovers topics from public sources
2. **Writer** — Generates content based on research + brand config
3. **Static Validator** — Deterministic checks (structure, length, URLs)
4. **QA Reviewer** — Independent AI evaluation (different inference call)
5. **Policy Reviewer** — Compliance and policy risk assessment
6. **Quality Gate** — Final deterministic pass/fail decision

### Failure Handling

```
Generate → QA FAIL → Regenerate → QA FAIL → Regenerate → QA FAIL → BLOCKED
    (attempt 1)        (attempt 2)             (attempt 3)         (permanent)
```

- Maximum 3 regeneration attempts
- Critical check failures → immediate BLOCKED (no retries)
- BLOCKED status is permanent — requires admin intervention
- No infinite retry loops

## Cloudflare Free Plan Constraints

| Resource | Free Limit | Impact |
|----------|-----------|--------|
| Worker Requests | 100K/day | Sufficient for autonomous pipeline + admin |
| CPU Time | 10ms/request | AI API calls are I/O (fetch), not CPU |
| D1 Reads | 5M rows/day | Generous for content pipeline |
| D1 Writes | 100K rows/day | Sufficient for audit + content |
| D1 Storage | 5GB | Ample for text content + metadata |
| KV Reads | 100K/day | Not used initially |
| KV Writes | 1K/day | Not used initially |
| Worker Scripts | 100 | Using 1 (+ environments) |

### Key Consideration
Workers have a **10ms CPU time limit** on Free. AI provider API calls (fetch) are I/O-bound and do NOT count toward CPU time. The Worker primarily orchestrates external calls, so this limit is not expected to be a constraint.
