# NorthSoft.AI.ContentCreator

**Autonomous AI-powered content pipeline for the NorthSoft Facebook Page.**

Built on Cloudflare Workers (Free plan) with independent AI quality control and safe automated Facebook publishing.

> 🟢 **Status: Phase 3C Complete — Autonomous Content Orchestrator & Scheduling Engine** — Unifies Research Discovery, Topic Selection & Cooldown, Pre-flight Workflow Budget Checks, Writer Agent, Static Validation, Independent QA Fact-Checker, Policy Engine, Quality Gate, Bounded Regeneration, and Internal Scheduling into a single autonomous pipeline. Obeying strict 7,500 Neurons/day hard budget ceiling and D1 concurrency execution locking. Facebook publishing remains locked in this phase.

---

## Architecture Overview

```
                    ┌─────────────────────────────┐
                    │       Admin Panel (TBD)      │
                    └──────────────┬──────────────┘
                                   │
┌──────────────┐    ┌──────────────▼──────────────┐    ┌──────────────┐
│   Research   │───▶│      Content Pipeline       │───▶│   Facebook   │
│    Agent     │    │                              │    │  Publisher   │
└──────────────┘    │  Writer → Validator → QA     │    │  (Meta API)  │
                    │      → Policy → Gate         │    └──────────────┘
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │     Cloudflare D1 (SQLite)   │
                    │     Audit Log │ Content DB   │
                    └─────────────────────────────┘
```

### Key Design Principles

- **Independent AI QA**: Content generation and quality review use separate, independent AI calls — a single inference never approves its own output
- **Quality Gate**: Every post must pass deterministic validation AND AI-based review before publication
- **Fail Closed**: Any critical check failure blocks publication permanently (max 3 retry attempts)
- **Provider Agnostic**: `IAIProvider` abstraction enables switching AI providers without application changes
- **Meta API Only**: Facebook publishing via official Meta APIs exclusively — no scraping or browser automation
- **Audit Trail**: Every autonomous operation is logged for full traceability

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Cloudflare Workers | Edge compute, Free plan, global distribution |
| Framework | [Hono](https://hono.dev) | Lightweight, Workers-native, TypeScript-first |
| Database | Cloudflare D1 | SQLite-based, Free plan (5GB, 5M reads/day) |
| Language | TypeScript (strict) | Type safety, maintainability |
| Testing | Vitest | Fast, TypeScript-native, good Workers compat |
| Linting | ESLint + Prettier | Code quality and consistency |
| CI | GitHub Actions | Automated quality gates |
| Secrets | Cloudflare Worker Secrets | Production secrets never in Git |

---

## Project Structure

```
NorthSoft.AI.ContentCreator/
├── src/
│   ├── index.ts                    # Worker entry point (Hono app)
│   ├── api/
│   │   └── health.ts               # Health & readiness endpoints
│   ├── ai/
│   │   └── provider.ts             # IAIProvider abstraction
│   ├── core/
│   │   ├── errors.ts               # Error types & handler
│   │   ├── types.ts                # Domain types
│   │   ├── environment.ts          # Environment utilities
│   │   ├── quality-gate.ts         # Quality gate evaluation
│   │   ├── audit.ts                # Audit log types
│   │   └── middleware/
│   │       └── logger.ts           # Request logging (secret-safe)
│   ├── publishing/
│   │   ├── meta-publisher.ts       # IMetaPublisher abstraction
│   │   ├── facebook-publisher.ts   # Meta Graph API v19.0 Publisher
│   │   └── mock-publisher.ts       # Deterministic mock publisher for tests
│   └── services/
│       └── publishing/
│           └── publication-service.ts # Publication state machine & Quality Gate check
├── tests/
│   ├── unit/                       # Unit tests
│   └── security/                   # Secret scanning, .gitignore checks
├── migrations/
│   └── 0001_initial_schema.sql     # D1 database schema
├── docs/
│   ├── architecture/
│   ├── security/
│   └── decisions/                  # Architecture Decision Records
├── .github/workflows/ci.yml       # CI pipeline
├── wrangler.jsonc                  # Cloudflare Worker config
├── tsconfig.json                   # TypeScript (strict)
├── vitest.config.ts                # Test configuration
├── eslint.config.mjs               # ESLint flat config
├── .prettierrc                     # Prettier config
├── .env.example                    # Secret placeholders
└── .gitignore                      # Protects secrets & artifacts
```

---

## Local Development

### Prerequisites

- Node.js 22+
- npm 10+

### Setup

```bash
# Clone repository
git clone https://github.com/rjaskowiec/NorthSoft.AI.ContentCreator.git
cd NorthSoft.AI.ContentCreator

# Install dependencies
npm install

# Copy environment template
cp .env.example .dev.vars
# Edit .dev.vars with your development credentials

# Apply database migrations locally
npm run db:migrate:local

# Start dev server
npm run dev
```

### Available Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start local development server |
| `npm run test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:security` | Run security/secret scanning tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | TypeScript type checking |
| `npm run check` | Run ALL checks (typecheck + lint + format + tests + security + audit) |
| `npm run build` | Dry-run build (validates Worker bundle) |

---

## Cloudflare Setup

### Worker

- **Name**: `northsoft-ai-contentcreator`
- **Domain**: `ai.northsoft.is`
- **Environments**: development (local), staging, production

### D1 Database

Create databases via Wrangler CLI:

```bash
# Create production database
npx wrangler d1 create northsoft-ai-contentcreator-prod

# Create staging database
npx wrangler d1 create northsoft-ai-contentcreator-staging
```

Update the `database_id` values in `wrangler.jsonc` with the IDs returned by these commands.

### Secrets

Production secrets are set via Wrangler CLI — never committed to Git:

```bash
npx wrangler secret put AI_PROVIDER_API_KEY --env production
npx wrangler secret put META_PAGE_ACCESS_TOKEN --env production
npx wrangler secret put META_APP_SECRET --env production
npx wrangler secret put ADMIN_AUTH_SECRET --env production
```

See `.env.example` for the complete list of required secrets.

---

## Environment Configuration

| Environment | Publishing | Database | Purpose |
|------------|-----------|----------|---------|
| `development` | ❌ Disabled | Local D1 | Local development |
| `staging` | ❌ Disabled | Staging D1 | Pre-production testing |
| `production` | Configurable | Production D1 | Live system |

**Safety**: Facebook publishing requires BOTH `FACEBOOK_PUBLISH_ENABLED=true` AND `ENVIRONMENT=production`. Staging/development can never publish regardless of flag state.

---

## Security Model

- **Public repository**: No secrets, tokens, or credentials in Git — ever
- **Cloudflare Secrets**: All production credentials stored as Worker Secrets
- **`.gitignore`**: Protects `.dev.vars`, `.env*`, credential files
- **Secret scanning**: Automated tests scan codebase for accidentally committed secrets
- **CI enforcement**: All checks must pass before merge
- **Secure logging**: Request logger redacts sensitive headers; audit log never stores secrets
- **Fail closed**: Critical security/validation failures block publication permanently

See [Security Documentation](docs/security/SECURITY.md) for the complete security model.

---

## GitFlow

This project follows GitFlow branching:

```
main           ← production releases only
develop        ← integration branch
feature/*      ← feature development
release/*      ← release preparation
hotfix/*       ← production hotfixes
```

### Branch Rules

- Never commit directly to `main`
- All features branch from `develop`
- All checks must pass before merge
- Commits authored as `rjaskowiec`

---

## Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production (after staging verification)
npm run deploy:production
```

### Pre-deployment Checklist

1. ✅ All tests pass (`npm run check`)
2. ✅ No secrets in codebase (security tests)
3. ✅ Database migrations applied
4. ✅ Cloudflare secrets configured
5. ✅ Build validates successfully

---

## Current Status

### ✅ Completed (Foundation & Phase 2)
- Project structure and TypeScript configuration
- Cloudflare Workers + Hono framework setup
- D1 database schema with migrations (`0001_initial_schema.sql`, `0002_admin_auth.sql`)
- Health & readiness API (`/api/health`, `/api/health/ready`)
- **Secure Admin Authentication**: Web Crypto PBKDF2 password hashing, salt generation
- **Server-Side Session Management**: HttpOnly, Secure, SameSite=Strict cookies with token hashing in D1
- **CSRF Protection**: Session-bound CSRF validation on all state-changing requests
- **Brute-Force Rate Limiting**: D1-backed login attempt tracking (5 max attempts / 15 mins)
- **Admin Authorization Middleware**: Protected `/api/admin/*` endpoints (`requireAdmin`)
- **Admin Dashboard UI**: Served at `/admin` (System status, Content pipeline counts, Recent audit activity, Security status)
- **Admin Provisioning Tool**: CLI script (`npm run admin:provision`)
- **Audit Logging**: `D1AuditLogger` implementation with secret redaction
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- Unit, Integration, and Security test suites (102 tests passed)
- GitHub Actions CI pipeline & GitFlow workflow

### 🔲 Next Phases (Phase 3+)
- AI provider implementations (OpenAI, Anthropic)
- Autonomous content generation pipeline
- Quality assurance pipeline
- Facebook publishing via Meta API
- Research agent
- Cron-triggered scheduling

---

## License

MIT © rjaskowiec
