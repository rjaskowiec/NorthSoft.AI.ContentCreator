# ADR-002: D1 as Primary Datastore

**Status**: Accepted  
**Date**: 2026-09-25  
**Author**: rjaskowiec

## Context

The application needs persistent storage for content pipeline data: posts, versions, quality checks, schedules, publications, audit logs, and configuration.

## Decision

Use **Cloudflare D1** as the sole primary datastore. D1 is a SQLite-based distributed database available on the Cloudflare Free plan.

### Schema Design
- Normalized relational schema (11 tables in initial migration)
- SQL migrations managed via Wrangler CLI
- UUID text primary keys (generated in application code)
- JSON columns for structured metadata (quality check results, post metadata)
- No ORM — typed query helpers with raw D1 API

### KV Usage
- KV is NOT used in the initial implementation
- May be introduced later for caching or rate limiting if justified

## Consequences

### Positive
- 5GB free storage — ample for text content and metadata
- SQL query capabilities for complex reporting (audit, admin panel)
- Migration-based schema management
- No external database hosting cost

### Constraints
- SQLite semantics (no stored procedures, limited type system)
- Eventual consistency for distributed reads
- Single-writer serialization may limit concurrent write throughput
- No full-text search built-in (may need application-level solution later)

### Migration Strategy
- All schema changes via numbered SQL migration files (`migrations/`)
- Applied per-environment via `npm run db:migrate:{env}`
- Production migrations require explicit command — no auto-migration

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| JSON files | Explicitly prohibited; not a real database |
| Cloudflare KV | Key-value only; no relational queries, no SQL |
| External PostgreSQL (Neon, Supabase) | Additional infrastructure cost, latency, dependency |
| Turso (LibSQL) | External service; D1 is native to Cloudflare |
