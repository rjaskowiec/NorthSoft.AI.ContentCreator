/**
 * NorthSoft.AI.ContentCreator — Structure Catalog & Reasoning Patterns
 *
 * Provides conceptual communication reasoning structures and angle definitions
 * for organic social media content creation targeting small and local business owners.
 *
 * Rather than rigid copy templates, these represent human thinking patterns
 * that earn reader attention and deliver concrete business value.
 */

import type { PerformanceEngineService } from '../analytics/performance-engine';

export interface StructurePattern {
  id: string;
  name: string;
  description: string;
  pattern: string;
  bestFor: string;
  openingCadence: string;
  transitionGuidance: string;
}

export interface ContentAngle {
  id: string;
  name: string;
  description: string;
  triggerQuestion: string;
}

export const STRUCTURE_PATTERNS: StructurePattern[] = [
  {
    id: 'observation_implication_action',
    name: 'Observation → Implication → Action',
    description: 'Lead with an honest, grounded observation about small business reality. Walk through the practical implication. Offer a single, actionable first step.',
    pattern: 'Concrete observation → Direct practical consequence → One actionable step',
    bestFor: 'Practical operational topics, website hygiene, routine business habits',
    openingCadence: 'A calm, relatable statement of an everyday fact.',
    transitionGuidance: 'Connect the observation to the owner’s time or customer loss before suggesting an action.',
  },
  {
    id: 'scenario_problem_insight',
    name: 'Scenario → Hidden Problem → Insight',
    description: 'Place the reader inside an everyday customer interaction. Uncover the subtle friction point the business owner might overlook. Deliver a clear insight.',
    pattern: 'Everyday customer scenario → Subtle friction point → Practical insight',
    bestFor: 'Customer experience, booking flows, mobile website friction, response speed',
    openingCadence: 'A short, immersive scenario ("A customer visits your website...").',
    transitionGuidance: 'Describe what the customer experiences in the first 5 seconds, not what the business intends.',
  },
  {
    id: 'myth_reality_implication',
    name: 'Myth → Reality → Practical Implication',
    description: 'Take a widespread assumption held by business owners. Show what actually happens in practice using common sense. Give a pragmatic takeaway.',
    pattern: 'Common assumption → Practical reality → Actionable takeaway',
    bestFor: 'SEO, fancy redesigns vs speed, social media follower count vs local visibility',
    openingCadence: 'Directly name the misconception or conventional advice.',
    transitionGuidance: 'Use concrete contrast rather than condescension; explain why the misconception is understandable.',
  },
  {
    id: 'mistake_consequence_better',
    name: 'Common Mistake → Consequence → Better Approach',
    description: 'Identify a frequent, understandable misstep. Walk through the real consequence (lost enquiries, wasted hours). Provide a straightforward alternative.',
    pattern: 'Frequent misstep → Real business consequence → Better approach',
    bestFor: 'Outdated contact info, broken mobile layouts, ignoring Google reviews',
    openingCadence: 'A sympathetic observation about something many businesses accidentally do.',
    transitionGuidance: 'Quantify or illustrate the friction (e.g. calling the next competitor on Google).',
  },
  {
    id: 'question_insight_takeaway',
    name: 'Question → Insight → Practical Takeaway',
    description: 'Open with a thoughtful question that touches real operational friction. Explain the underlying mechanics. Provide a pragmatic rule of thumb.',
    pattern: 'Grounded operational question → Underlying mechanism → Pragmatic takeaway',
    bestFor: 'Audit checklists, evaluating current vendor setups, decision making',
    openingCadence: 'A question the owner has probably wondered about or experienced.',
    transitionGuidance: 'Answer the question directly within two sentences before expanding.',
  },
  {
    id: 'before_after_contrast',
    name: 'Before → Change → After',
    description: 'Contrast a chaotic or friction-filled "before" state with a streamlined "after" state. Explain the simple shift that caused the difference.',
    pattern: 'Familiar friction state → Shift/adjustment → Clear resulting state',
    bestFor: 'Workflow automation, digital booking vs phone tag, automated invoice reminders',
    openingCadence: 'Describe the typical Friday afternoon or hectic morning scenario.',
    transitionGuidance: 'Keep the "change" small and realistic — avoid making it sound miraculous.',
  },
  {
    id: 'problem_small_fix_result',
    name: 'Problem → Small Fix → Measurable Result',
    description: 'Focus on a specific annoyance (e.g. missed calls, confusing menus). Introduce a low-effort fix. Show the resulting peace of mind or conversion lift.',
    pattern: 'Specific operational annoyance → Low-effort fix → Tangible result',
    bestFor: 'Quick wins, Google Business Profile tweaks, speed optimization',
    openingCadence: 'Highlight a specific daily micro-frustration.',
    transitionGuidance: 'Show that big improvements often come from removing small obstacles.',
  },
  {
    id: 'short_story_business_lesson',
    name: 'Short Story → Business Lesson → Action',
    description: 'Share a concise, 2-3 sentence vignette of a customer trying to interact with a business. Draw an immediate lesson. End with a practical check.',
    pattern: 'Concise real-world customer story → Business lesson → Practical check',
    bestFor: 'Local SEO, trust building, clear opening hours, transparent pricing',
    openingCadence: 'A 2-sentence narrative moment.',
    transitionGuidance: 'Pivot immediately from the story to the universal business rule.',
  },
  {
    id: 'contrast_explanation_takeaway',
    name: 'Contrast → Explanation → Takeaway',
    description: 'Highlight a contrast: simple vs complicated, or what businesses think matters vs what customers actually notice. Explain why simple wins.',
    pattern: 'Meaningful contrast → Explanation of customer psychology → Simple takeaway',
    bestFor: 'Website clarity, messaging simplicity, avoiding technical jargon',
    openingCadence: 'A striking juxtaposition (e.g. "Simple beats impressive when the goal is clarity.").',
    transitionGuidance: 'Explain the customer psychology behind why less friction beats more features.',
  },
  {
    id: 'educational_checklist',
    name: 'Prioritized Checklist → Why It Matters → Next Step',
    description: 'Present 2-4 non-obvious priorities in order of practical importance. Briefly justify why priority #1 comes before everything else.',
    pattern: '2-4 prioritized actions → Rationale for priority #1 → Clear next step',
    bestFor: 'Security basics, mobile audits, new website launches, local SEO setup',
    openingCadence: 'Frame what matters right now vs what can safely wait.',
    transitionGuidance: 'Keep list items punchy with a brief rationale for each.',
  },
];

export const CONTENT_ANGLES: ContentAngle[] = [
  {
    id: 'common_mistake',
    name: 'A Common Mistake',
    description: 'A subtle mistake business owners make without realizing it, usually born of good intentions.',
    triggerQuestion: 'What is something well-meaning business owners do that actually hurts their conversion?',
  },
  {
    id: 'surprising_observation',
    name: 'A Surprising Observation',
    description: 'A counter-intuitive truth about customer behavior or digital habits.',
    triggerQuestion: 'What does customer behavior data reveal that contradicts common business assumptions?',
  },
  {
    id: 'missed_opportunity',
    name: 'A Missed Opportunity',
    description: 'Where revenue, customer trust, or enquiries slip through the cracks unnoticed.',
    triggerQuestion: 'Where are potential customers dropping off before they ever reach out?',
  },
  {
    id: 'real_world_scenario',
    name: 'A Real-World Customer Scenario',
    description: 'Walking in the customer’s shoes during the first 10 seconds of interaction.',
    triggerQuestion: 'What does a customer actually see, feel, and do when trying to contact this business?',
  },
  {
    id: 'before_after_contrast',
    name: 'A Before/After Contrast',
    description: 'Contrasting the daily friction of manual processes with the clarity of a modern setup.',
    triggerQuestion: 'How does daily business life change once this friction point is resolved?',
  },
  {
    id: 'widespread_misconception',
    name: 'A Widespread Misconception',
    description: 'An industry myth or marketing cliché debunked with practical common sense.',
    triggerQuestion: 'What generic advice do digital marketers give that does not work for local businesses?',
  },
  {
    id: 'practical_tip',
    name: 'A Practical 15-Minute Tip',
    description: 'One tangible tweak that can be done immediately without hiring an agency.',
    triggerQuestion: 'What is one specific thing an owner could inspect or fix today in 15 minutes?',
  },
  {
    id: 'hidden_cost',
    name: 'The Hidden Cost of Delay',
    description: 'The real operational or financial drag of putting off essential improvements.',
    triggerQuestion: 'What is it actually costing the business in lost customers to keep saying "we’ll fix it later"?',
  },
  {
    id: 'customer_friction',
    name: 'A Customer Experience Problem',
    description: 'Identifying where customers get frustrated, confused, or bounce to a competitor.',
    triggerQuestion: 'Why would an interested customer hit the back button and call someone else?',
  },
  {
    id: 'small_fix_big_impact',
    name: 'Small Fix, Meaningful Impact',
    description: 'A tiny adjustment that creates outsized clarity, credibility, or speed.',
    triggerQuestion: 'What is the smallest change that yields the biggest leap in customer confidence?',
  },
];

/**
 * Selects a structure pattern, weighting by performance engine guidelines if available,
 * and ensuring different structures are used during regeneration attempts.
 */
export async function selectStructurePattern(
  perfEngine?: PerformanceEngineService,
  db?: D1Database,
  attemptNumber = 1,
  previousPatternId?: string,
): Promise<{ pattern: StructurePattern; guidancePrompt: string }> {
  let candidates = STRUCTURE_PATTERNS;

  // In regeneration attempts, eliminate the previous pattern to force a different angle
  if (previousPatternId && attemptNumber > 1) {
    const filtered = candidates.filter((p) => p.id !== previousPatternId);
    if (filtered.length > 0) candidates = filtered;
  }

  // Weight patterns based on performance profile if available
  const weightMap: Record<string, number> = {};
  candidates.forEach((p) => (weightMap[p.id] = 1));

  if (perfEngine && db) {
    try {
      const profile = await perfEngine.getActiveProfile(db).catch(() => null);
      if (profile && profile.successfulPatterns) {
        for (const sp of profile.successfulPatterns) {
          for (const p of candidates) {
            if (sp.toLowerCase().includes(p.name.toLowerCase()) || sp.toLowerCase().includes(p.id.toLowerCase())) {
              weightMap[p.id] = (weightMap[p.id] ?? 1) + 2;
            }
          }
        }
      }
    } catch {
      // Graceful fallback to uniform weighting
    }
  }

  const weightedList: StructurePattern[] = [];
  for (const p of candidates) {
    const w = weightMap[p.id] ?? 1;
    for (let i = 0; i < w; i++) weightedList.push(p);
  }

  const chosen = weightedList[Math.floor(Math.random() * weightedList.length)] || candidates[0]!;

  const guidancePrompt =
    `SUGGESTED REASONING STRUCTURE:\n` +
    `- Name: ${chosen.name}\n` +
    `- Flow: ${chosen.pattern}\n` +
    `- Focus: ${chosen.description}\n` +
    `- Opening cadence: ${chosen.openingCadence}\n` +
    `- Transition guidance: ${chosen.transitionGuidance}\n` +
    `Treat this as a reasoning framework to guide the post, not as a rigid Mad Libs template.`;

  return { pattern: chosen, guidancePrompt };
}
