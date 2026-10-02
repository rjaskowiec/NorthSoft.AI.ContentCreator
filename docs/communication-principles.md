# NorthSoft AI Content Creator — Communication Principles

> **Status:** Active — Production Standard  
> **Last updated:** 2026-10-02  
> **Owner:** NorthSoft AI Content Engineering  

---

## 1. Executive Summary & Core Philosophy

The NorthSoft AI Content Creator produces organic social media content for Facebook and Instagram targeting small and local business owners (trades, clinics, shops, hospitality, local professional services).

The primary objective is **not** to produce text that looks like corporate marketing or passes arbitrary formatting checklists.  
The primary objective is:

> **A small-business owner scrolls past dozens of posts in their feed, stops at this one, and voluntarily reads it because it feels specific, useful, relatable, and human.**

### Core Tenets:
1. **The Audience is the Hero:** The post is about the reader's customer, operational friction, time, or revenue. NorthSoft is only a potential humble facilitator introduced at the very end (or not at all).
2. **Concept over Paraphrase:** Raw source notes are background ingredients, never text to reword sentence-by-sentence.
3. **Information Gain:** Every post must introduce concrete scenarios, mechanisms, or explanations beyond the raw input.
4. **Visual Rhythm:** Mobile social feeds demand whitespace, short paragraphs (1–3 sentences), and varied pacing. Single monolithic text blocks are rejected.
5. **Earned CTAs:** Never append artificial engagement bait questions ("What's the one thing you wish you could improve?"). CTAs are contextual, low-pressure, or completely omitted.

---

## 2. Research Basis & Credible Sources

Our communication architecture is built directly on verified principles from credible industry research and advertising psychology:

### A. Sprout Social Content & Social Media Index (2025/2026)
- **Authenticity over Polish:** Audiences increasingly distrust polished corporate marketing and generic AI-generated copy. Over 70% of social media users report feeling fatigue from repetitive, template-driven brand content.
- **Relatability & Real Situations:** Posts that ground advice in recognizable real-world situations achieve 3x higher comment engagement and dwell time than abstract high-level recommendations.
- **Impact vs. Volume:** Simply producing more content does not equal impact. Audiences reward substance and genuine originality over frequency.
- **Engagement Quality:** Algorithmic feed ranking penalizes artificial engagement bait ("Comment below!", "Do you agree?") in favor of posts that generate meaningful community interactions.

### B. Ogilvy on Advertising (David Ogilvy)
- **Specificity creates credibility:** "A website that takes 3.5 seconds to load loses 40% of phone visitors" is inherently believable; "Make sure your website is optimized for speed" is ignored.
- **Audience recognition before advice:** Readers only pay attention to advice once they feel the writer intimately understands their specific daily friction.

### C. Made to Stick (Chip & Dan Heath)
- **Concreteness over Abstraction:** Human brains recall tangible scenes (a customer searching Google Maps on a rainy Friday, an unclickable phone number on a mobile screen) far better than conceptual phrases ("improve your digital presence").

### D. Meta for Business Feed Architecture (2025/2026)
- **Thumb-stopping First Cadence:** Mobile feeds give a post roughly 1.5 seconds to establish relevance. Generic openers ("In today's digital world...") are scrolled past immediately.
- **Visual Scannability:** Mobile reading patterns favor short text chunks (1–3 sentences) separated by line breaks over continuous desktop-style paragraphs.

---

## 3. Communication Principles Mapping

| Principle | Evidence / Source | Implication for NorthSoft Content | Implementation | Test / Quality Signal |
|---|---|---|---|---|
| **1. Concrete Scenario over Abstract Advice** | Heath & Heath (*Made to Stick*); Sprout Social (2025) | Never say "improve your online presence." Show a customer searching on Google Maps and hitting an outdated phone number. | System prompt instructs writer to anchor post in a recognizable customer situation; writer schema requires `audienceContext` & `contentAngle`. | `Specificity` dimension in `SocialMediaQualityGate` penalizes posts lacking tangible business artifacts (hours, calls, bookings, speed). |
| **2. High Information Gain (Anti-Paraphrase)** | Sprout Social Index (2025/2026); LLM evaluation standards | The post must add fresh mechanisms, practical explanations, or rules of thumb beyond what was in the source notes. | Writer prompt explicitly treats source notes as raw material; prohibits sentence-by-sentence rewording. | `InformationGain` in `SocialMediaQualityGate` and `repeatsReference` in `ContentQualityGate` reject drafts that echo source vocabulary without novel substance. |
| **3. Audience as Hero, Brand as Facilitator** | Ogilvy on Advertising; Modern Organic Content Strategy | The reader's business is the protagonist. The post must be valuable even if the reader never hires NorthSoft. | NorthSoft is forbidden from opening lines and restricted to low-pressure sign-offs after value delivery. | `BrandPlacement` dimension flags brand mentions in the first 80 characters; posts with zero brand mentions pass with top scores. |
| **4. Visual & Rhythmic Structure** | Meta for Business mobile UX guidelines (2025/2026) | Dense walls of text fail on mobile feeds. Copy must have intentional line breaks, short paragraphs, and whitespace. | Writer prompt enforces 1–3 sentences per block with `\n\n` separators; single monolithic blocks are forbidden. | `Readability` dimension flags `Paragraph Collapse` (body > 160 chars without paragraph breaks) with high/critical severity. |
| **5. Earned Contextual CTA (No Empty Bait)** | Sprout Social (2025/2026); Meta Feed spam penalty | Generic questions ("What's the one thing you wish you could improve?") feel artificial and turn readers off. | Prompt bans generic engagement bait; supports ending on a strong thought with no CTA at all. | `CTAQuality` dimension checks `EMPTY_ENGAGEMENT_QUESTIONS` and penalizes artificial engagement bait. |
| **6. Plain, Conversational Human Voice** | Sprout Social Authenticity Study (2025) | Business owners speak in practical terms; corporate jargon and AI filler destroy trust immediately. | Prompt bans corporate buzzwords ("digital transformation", "unlock potential", "game changer", "synergy"). | `Authenticity` dimension checks `GENERIC_AI_MARKETING_TROPES` and penalizes stacked AI marketing clichés. |
| **7. Factual Integrity & Honest Nuance** | Ogilvy Credibility Law; Compliance Invariants | Never invent statistics or quote unverified research ("Studies show 87% of businesses..."). | Writer is instructed to use only numbers from source notes; unverified percentage claims are blocked. | `Credibility` dimension triggers critical blocking warning on fabricated percentage statistics without verified source citations. |
| **8. Conceptual Angle Variety** | Sprout Social Audience Fatigue Report (2025/2026) | Distinct posts must feel truly distinct — varying openings, narrative angles, and structures. | Structure catalog provides 10 reasoning patterns and 10 content angles; temperature set to 0.7. | Regression suite verifies that subsequent regeneration attempts systematically rotate structure patterns. |
| **9. Native Platform Awareness** | Facebook/Instagram Organic Distribution (2025/2026) | Copy must feel like a genuine social post, not a website landing page or press release. | Character count guided between 250–850 characters; punchy first line before the "See More" fold. | `Attention` checks opening 150 characters for hook signals and penalizes generic openers ("In today's digital world..."). |
| **10. Strategic Bounded Regeneration** | Autonomous Pipeline Reliability Architecture | If a draft fails quality evaluation, regeneration must change strategy rather than rewording the same generic draft. | Planner synthesizes all gate failure reasons and injects a strategic directive with a different structure pattern into the prompt. | Regression Test 5 proves regeneration changes structure and angle on subsequent attempts. |

---

## 4. The 5-Stage Conceptual Generation Architecture

Rather than naive `Topic → Post Body` text generation, the generator executes a 5-stage conceptual reasoning process enforced in the AI output schema:

```text
TOPIC & RAW NOTES
      ↓
[Stage 1: AUDIENCE CONTEXT]
Who is this specifically for? What friction are they experiencing in their business today?
      ↓
[Stage 2: CONTENT ANGLE]
Why would they care TODAY? (Mistake, scenario, surprising truth, hidden cost, contrast, practical tip)
      ↓
[Stage 3: REASONING STRUCTURE]
Select conceptual flow (Scenario → Problem → Insight, Observation → Implication → Action, etc.)
      ↓
[Stage 4: READER VALUE / INFORMATION GAIN]
What concrete mechanism or takeaway is introduced beyond the raw source notes?
      ↓
[Stage 5: RHYTHMIC SOCIAL POST DRAFT]
Short paragraphs, whitespace, varied pacing, earned CTA (or none)
```

The output JSON schema explicitly requires the AI model to output `audienceContext`, `contentAngle`, `reasoningStructure`, and `readerValue` before generating the final `body`. This enforces Chain-of-Thought reasoning and prevents immediate regression to paraphrasing.

---

## 5. Structure Catalog & Reasoning Patterns

The system maintains 10 reasoning patterns in `src/services/content/structure-catalog.ts`:

1. **Observation → Implication → Action:** Grounded operational fact → Direct consequence → One practical step.
2. **Scenario → Hidden Problem → Insight:** Everyday customer interaction → Point of friction → Practical insight.
3. **Myth → Reality → Practical Implication:** Common business assumption → Practical reality → Common-sense takeaway.
4. **Common Mistake → Consequence → Better Approach:** Understandable misstep → Lost enquiries or wasted hours → Clear alternative.
5. **Question → Insight → Practical Takeaway:** Grounded operational question → Underlying mechanism → Pragmatic rule of thumb.
6. **Before → Change → After:** Familiar friction state → Small realistic adjustment → Clear resulting state.
7. **Problem → Small Fix → Measurable Result:** Specific daily annoyance → Low-effort fix → Tangible clarity or peace of mind.
8. **Short Story → Business Lesson → Action:** 2-sentence customer vignette → Universal business lesson → Quick inspection check.
9. **Contrast → Explanation → Takeaway:** Simple vs complicated → Customer psychology → Why simple wins.
10. **Prioritized Checklist → Why It Matters → Next Step:** 2–4 prioritized actions → Rationale for priority #1 → Clear next step.

---

## 6. Multi-Gate Quality Architecture & Detection Signals

Generated drafts must pass through two complementary quality gates before approval:

### 1. `SocialMediaQualityGate` (Diagnostic Communication Evaluation)
Evaluates drafts across 10 human-centric dimensions:
- **InformationGain (14 pts):** Detects 3-gram echoes, high vocabulary overlap with low novel substance, and sentence-by-sentence rewording.
- **Attention (10 pts):** Penalizes generic openings (`GENERIC_OPENING_PATTERNS`); verifies scroll-stopping first sentence.
- **Specificity (12 pts):** Requires concrete nouns, numbers, mechanisms, and tools.
- **Value (12 pts):** Requires substantive takeaway or explanation.
- **Readability (10 pts):** Detects **Paragraph Collapse** (body > 160 chars without double line breaks).
- **ConversationalTone (8 pts):** Encourages contractions and varied cadence; penalizes stiff robotic phrasing.
- **Credibility (14 pts):** Blocks fabricated percentage statistics and unsourced research assertions.
- **CTAQuality (10 pts):** Penalizes empty engagement bait (`EMPTY_ENGAGEMENT_QUESTIONS`) and aggressive sales pressure.
- **Authenticity (10 pts):** Penalizes stacked generic AI marketing clichés (`GENERIC_AI_MARKETING_TROPES`).
- **BrandPlacement:** Ensures brand does not intrude before value delivery.

### 2. `ContentQualityGate` (Semantic Substance & Coherence)
Evaluates list item substance, empty advice filler clichés, topic alignment against title/category, and bidirectionally checks paraphrase overlap against reference sources.

---

## 7. Bounded Regeneration with Strategic Pivots

When a draft fails quality evaluation, the system does not simply ask the model to "rewrite it to be more engaging."

Instead, the `ContentPlannerService`:
1. Synthesizes all diagnostic issues from `SocialMediaQualityGate`, `ContentQualityGate`, and `QualityReviewerService`.
2. Selects a **different** reasoning structure pattern from `structure-catalog.ts` (excluding the previously used pattern).
3. Injects a targeted strategic directive instructing the model:
   - Specific failure reasons from previous attempt
   - Compulsory structural pivot
   - Prohibition against reusing previous draft phrasing
   - Requirement to ground the new attempt in a concrete real-world customer situation.
