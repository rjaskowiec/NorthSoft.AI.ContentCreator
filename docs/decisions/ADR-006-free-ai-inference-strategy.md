# ADR-006: Free AI Inference Strategy & Zero-Cost Guardrails

## Context
NorthSoft.AI.ContentCreator operates as an autonomous content creation platform. To remain financially viable and guarantee predictable operating costs on the Cloudflare Free infrastructure tier, the platform must enforce strict financial boundaries.

Paid AI API calls (OpenAI, Anthropic, Google, OpenRouter, or prepaid credit providers) introduce unpredictable costs, billing vulnerabilities, and potential subscription drains.

## Decision
**Paid AI inference is not a dependency of NorthSoft.AI.ContentCreator.**

The platform mandates `MAX_ALLOWED_AI_COST = 0` as a non-negotiable architectural invariant.

1. **Primary AI Provider**: Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`) using the Cloudflare Workers native `env.AI` binding within the free allocation (10,000 Neurons/day).
2. **Fallback Strategy**: Fallback is permitted ONLY between verified free providers/models or local development mocks (`MockAIProvider`). Automatic fallback to paid providers or APIs requiring billing credentials is strictly prohibited.
3. **Graceful Deferral**: If free AI quota is exhausted or free providers are temporarily unavailable, research analysis operations MUST defer (`DEFERRED_NO_FREE_AI_CAPACITY`). Source data is stored as raw `research_items` in D1 without loss, and topic extraction resumes when free capacity resets.
4. **Quota Accounting & Hard Limits**: The system enforces configurable daily (`AI_MAX_REQUESTS_PER_DAY=50`), monthly (`AI_MAX_REQUESTS_PER_MONTH=1000`), and per-run (`AI_MAX_REQUESTS_PER_RUN=5`) request quotas in D1 (`ai_usage`).

## Consequences
- **Positive**: Zero financial risk of unexpected API bills; 100% compliance with Cloudflare Free plan constraints; deterministic resource consumption.
- **Negative**: Topic analysis throughput is constrained by Cloudflare Workers AI daily free quotas; requires structured output schema validation on open-weight LLMs.
