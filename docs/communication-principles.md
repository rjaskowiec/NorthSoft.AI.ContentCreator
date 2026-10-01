# NorthSoft AI Content Creator — Communication Principles

> **Status:** Active — applied in production generator  
> **Last updated:** 2026-10-01  
> **Owner:** NorthSoft AI Content team

---

## Purpose

This document explains the communication strategy behind the NorthSoft AI content generator.
It records the reasoning behind design decisions, distinguishes evidence from heuristics, and
serves as the reference for anyone adjusting the writer prompt, quality gate, or style hints.

The goal is not to describe a system that produces posts matching a template.  
The goal is to produce posts a small-business owner reads and thinks:
> *"That's relevant to me — and that's actually useful."*

---

## Source of Research

The communication framework draws on publicly documented principles from:

- **Meta for Business** content guidance (Facebook/Instagram best practices)
- **Ogilvy on Advertising** (David Ogilvy) — audience recognition, specificity, credibility
- **Made to Stick** (Heath & Heath) — simplicity, concreteness, emotional resonance
- **Copywriting fundamentals** — Attention → Interest → Desire → Action (AIDA), adapted for organic social media

> [!IMPORTANT]
> These principles are adapted interpretations, not verified experimental results from NorthSoft's own A/B tests. The application of each principle is a design decision, not a scientific finding.

---

## The Seven-Step Communication Framework

The generator is prompted to write with this implicit structure — invisible in the final post:

| Step | Name | What it means |
|------|------|---------------|
| 1 | **Attention** | Stop the scroll. Concrete observation, surprising fact, or recognizable situation. |
| 2 | **Recognition** | Let the reader see themselves — their customers, daily problems, familiar friction. |
| 3 | **Relevance** | Anchor the post to something this reader actually cares about. |
| 4 | **Concrete Value** | Give something genuinely useful — specific, actionable, honest. Not filler advice. |
| 5 | **Credibility** | Stay honest. Use real numbers from source material only. Never fabricate statistics. |
| 6 | **Natural Solution** | If NorthSoft fits, introduce it naturally. If it doesn't fit, omit it entirely. |
| 7 | **Optional CTA** | A question, invitation, or next step — only when it feels natural to the post. |

**Limitation:** Steps 1–7 describe intended behaviour, not guaranteed output. The AI model may not always follow the framework correctly. The quality gate and QA reviewer provide downstream safeguards.

---

## Why We Use This Framework

### Attention first, not brand first

Research on social media behaviour consistently shows that users scroll past content that
begins with self-promotion. The generator is instructed never to lead with NorthSoft.

> [!NOTE]
> This is a heuristic, not a hard rule. In some contexts (e.g., responding directly to a question) a brand-first opener may be natural. The gate flags early brand placement as a low-severity note, not a block.

### Specificity over generality

Ogilvy's principle: the more specific the claim, the more believable it is.
"Your website might be putting customers off" is less believable than
"A site that takes more than 3 seconds to load loses most visitors before they scroll."

The generator is instructed to prefer concrete detail (numbers from source material, named actions, recognizable scenarios) over abstract generalisations.

### Recognition before advice

People respond better to content that demonstrates the writer understands their situation before offering a solution. The generator is instructed to build recognition before delivering value.

### Natural brand integration

NorthSoft is introduced as a helpful resource, not as the protagonist of the post.
The brand appears after value is delivered, and only when there is a genuine connection
to a NorthSoft service (websites, e-commerce, local SEO, marketing, automation, AI assistants, email).

> [!WARNING]
> Forcing a NorthSoft mention into every post reduces authenticity. The generator is explicitly instructed not to force mentions. Posts without a NorthSoft mention are valid output.

### Conversational English

Corporate jargon ("digital transformation", "unlock potential", "game changer") is explicitly
forbidden in the prompt. The generator uses contractions, active voice, and varied sentence
rhythm to produce copy that sounds like a knowledgeable colleague rather than a marketing department.

---

## Quality Gate Design Principles

The `SocialMediaQualityGate` evaluates copy on eight dimensions:

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Attention | 15 | Opening engages the reader |
| Specificity | 12 | Concrete detail present |
| Value | 12 | Actionable takeaway present |
| Credibility | 20 | No fabricated statistics |
| HumanVoice | 12 | Conversational, not formal |
| Readability | 10 | Reasonable length, scannable |
| Authenticity | 10 | Avoids corporate jargon |
| BrandPlacement | 9 | NorthSoft introduced after value |

**Pass threshold:** score ≥ 55 with no `critical` warnings.

### What the gate does NOT penalise

This is intentional design — not an oversight:

- ❌ No emoji — irrelevant to communication quality
- ❌ Three paragraphs instead of four — irrelevant
- ❌ No question at the end — a strong statement is equally valid
- ❌ No NorthSoft mention — valid output
- ❌ No CTA — valid output
- ❌ Short post (under 300 chars) — only flagged if under 80 chars

### What triggers a critical block

Only genuinely important failures block content:

- Fabricated percentage statistic with unsupported claim pattern ("X% of businesses...")
- Severe promotional spam (3+ jargon phrases + sales pressure language)
- Empty/near-empty body

---

## Structure Catalog

Ten flexible narrative patterns are available in `structure-catalog.json`.
These are creative starting points, not mandatory templates.

The writer is explicitly instructed to override the selected structure if a more natural
flow emerges from the content. The goal is a post that feels human — not one that follows
a template.

Patterns:

1. Problem → Consequence → Practical Fix
2. Question → Recognition → Advice
3. Common Mistake → Why It Matters → Better Approach
4. Observation → Explanation → Takeaway
5. Scenario → Hidden Problem → Solution
6. Myth → Reality → Practical Implication
7. Before/After Situation → Explanation
8. Checklist → Explanation
9. Unexpected Observation → Lesson
10. Short Story → Business Lesson

---

## Style Hints

The `PerformanceEngineService.extractStyleHints()` method aggregates tendencies from historically
strong-performing published posts and passes them to the writer as guidance.

Style hints describe tendencies (e.g., "hook patterns", "preferred rhythm") — not exact numbers
to replicate. The prompt explicitly tells the AI to treat hints as guidance, not prescriptions.

When insufficient historical data exists (fewer than 5 published posts), `extractStyleHints`
returns `null` and no style context is injected. The generator works correctly without it.

---

## Limitations and Known Design Decisions

| Decision | Rationale | Limitation |
|----------|-----------|------------|
| Single pass at temperature 0.3 | Consistent, less random output | May produce cautious writing |
| Structure hint is weighted randomly (with performance bias) | Variety prevents repetition | Random selection may occasionally pick a suboptimal structure |
| SMQG threshold set at 55 (not 80) | Avoids over-blocking good posts that lack minor signals | Some below-average posts may pass |
| Credibility check only blocks fabricated % patterns | Avoids blocking posts with inline numbers from sources | Sophisticated fabrication (without % symbol) may not be caught |
| No emoji enforcement | Emojis are contextual, not universally beneficial | Some audiences may prefer more emojis |

---

## Golden Test Reference

The canonical quality reference for this generator is a post about an outdated/broken website
driving away customers. Characteristics of a passing post on this topic:

- Strong concrete opening (doesn't begin with "In today's digital world...")
- Reader recognizes their situation within the first 2 sentences
- One or two specific, practical observations
- Natural, low-pressure reference to NorthSoft (or none)
- Conversational English with contractions
- Visually readable (short paragraphs or varied sentences)
- No fabricated statistics
- No corporate jargon

> [!NOTE]
> The reference example ("The worst thing for a business? A website that doesn't work...") should **not** be copied into the prompt or into production code. It is a quality benchmark for human review only.
