# ADR-005: Public Repository Security Model

**Status**: Accepted  
**Date**: 2026-09-25  
**Author**: rjaskowiec

## Context

The repository is public on GitHub (`rjaskowiec/NorthSoft.AI.ContentCreator`). This means all source code, configuration, documentation, and Git history are visible to anyone. The application handles sensitive credentials (AI provider keys, Meta tokens, admin secrets).

## Decision

Implement a **defense-in-depth security model** suitable for a public repository:

### Layer 1: Prevention
- `.gitignore` blocks secret files (`.dev.vars`, `.env*`, `*.pem`, `*.key`)
- `.env.example` contains only placeholder values
- Production secrets stored in Cloudflare Worker Secrets (never in Git)
- No hardcoded credentials in source code

### Layer 2: Detection
- Automated secret scanning tests (`tests/security/secret-scan.test.ts`)
- Pattern matching for known credential formats (OpenAI, Meta, Google, GitHub, etc.)
- Runs in CI on every push and PR
- Must pass before merge

### Layer 3: Enforcement
- CI pipeline blocks merge if secret scan fails
- npm audit checks for known vulnerabilities
- TypeScript strict mode prevents accidental type coercion
- Code review via PR process

### Layer 4: Response
- If a secret is committed: immediate rotation, force-push removal
- GitHub secret scanning alerts (repository setting)
- Incident documentation in audit log

## Consequences

### Positive
- Portfolio-grade public visibility
- Community contribution possible
- Transparent security practices
- Automated enforcement reduces human error

### Constraints
- ALL credentials must use Cloudflare Secrets / environment variables
- Configuration that varies per environment goes in `wrangler.jsonc` (non-secret)
- New secret patterns must be added to the scanning test

### Developer Experience
- Copy `.env.example` → `.dev.vars` for local development
- Cloudflare Secrets CLI for production credentials
- CI catches mistakes before they reach main branch

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| Private repository | Reduces visibility for portfolio; public is intentional |
| Git-crypt / SOPS | Complexity; Cloudflare Secrets is simpler and more appropriate |
| Environment files in CI secrets | Already handled by Cloudflare; no need for double management |
