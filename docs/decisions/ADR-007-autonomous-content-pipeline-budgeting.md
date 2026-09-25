# ADR-007: Autonomous Content Pipeline & Neuron Budgeting

## Context
Phase 3B introduces the autonomous Writer Agent, Static Content Validator, Independent QA Reviewer, Policy Reviewer, and Central Quality Gate. In an automated multi-stage pipeline, a single topic draft may undergo generation, review, and up to 2 bounded regenerations.

Because Cloudflare Workers AI free allocation (10,000 Neurons/day) is shared across multiple NorthSoft platforms (including customer-facing AI chat services), NorthSoft.AI.ContentCreator must enforce a strict daily neuron safety ceiling.

## Decision
**ContentCreator has a non-negotiable daily budget ceiling of 7,500 Neurons/day.**

The platform mandates:

1. **Safety Ceiling**: `CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT = 7500`. The hard limit must NEVER be configured above 7,500 Neurons/day.
2. **Budget Tiers**:
   - `0 – 5,000 Neurons`: `NORMAL` mode. Standard autonomous research and draft generation.
   - `5,000 – 6,000 Neurons`: `CONTROLLED` mode. Reduce optional AI operations, prioritize ongoing draft reviews.
   - `6,000 – 7,500 Neurons`: `RESTRICTED` mode. Only high-priority content generation; block retries and exploratory calls.
   - `>= 7,500 Neurons`: `HARD_STOP` mode. Immediate stop of ContentCreator AI calls (`DEFERRED_NO_FREE_AI_CAPACITY`).
3. **Pre-flight Budget Estimation**: Before executing expensive multi-stage workflows (Writer + QA), `QuotaManager` estimates worst-case neuron cost (approx 3,000 Neurons). If `current_usage + estimated_cost > 7500`, generation defers before executing AI calls.
4. **Post Versioning Invariant**: Regenerated drafts create new version entries in `post_versions` (v1 -> v2 -> v3). Drafts are never overwritten. Max 3 versions (2 retries) before permanent `BLOCKED` status.

## Consequences
- **Positive**: Guarantees customer-facing AI services always have at least 2,500 Neurons/day reserved; prevents runaway AI retry loops; maintains full version audit trail.
- **Negative**: High generation volume days may defer late-day draft generation until the next daily quota reset.
