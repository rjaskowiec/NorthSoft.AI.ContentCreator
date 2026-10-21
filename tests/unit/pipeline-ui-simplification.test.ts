import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import {
  humanizePolishPipelineSummary,
  parseQualityGateFailure,
  getQualityGateDimensionLabel
} from '../../src/admin/ui/event-formatter';
import { renderAdminHtml } from '../../src/admin/ui';
import { getAdminScripts } from '../../src/admin/ui/scripts';

describe('Pipeline UI Simplification & English-Only Audit', () => {
  describe('1. Removal of Misleading D1 Counters', () => {
    it('does not display D1 writes or D1 reads in rendered activity cards', () => {
      const scripts = getAdminScripts();
      // Verify no references to rendering D1 writes/reads in cardsHtml
      expect(scripts).not.toContain('d1Writes');
      expect(scripts).not.toContain('d1Reads');
      expect(scripts).not.toContain('0 D1 writes');
      expect(scripts).not.toContain('0 D1 reads');
    });

    it('preserves underlying instrumentation fields without displaying them', () => {
      const run = {
        id: 'run-1',
        stage: 'topics',
        status: 'COMPLETED',
        neuronsUsed: 12000,
        d1RowsWritten: 0,
        d1RowsRead: 0,
        summary: 'Topic discovery: found 5, accepted 2 new proposals'
      };

      // Ensure data model properties remain intact
      expect(run.d1RowsWritten).toBe(0);
      expect(run.d1RowsRead).toBe(0);
      expect(run.neuronsUsed).toBe(12000);
    });
  });

  describe('2. Pipeline Tab HTML Simplification', () => {
    const adminHtml = renderAdminHtml();
    const markupOnly = adminHtml.substring(0, adminHtml.indexOf('<script>'));

    it('has removed unnecessary scheduling description subtitle', () => {
      expect(markupOnly).not.toContain('Automated nightly pipeline (20:00–23:45 UTC) & manual stage triggers.');
    });

    it('has removed redundant activity log subtitle', () => {
      expect(markupOnly).not.toContain('Historical audit trail of nightly scheduled jobs');
    });

    it('renders clean English stage options in the stage filter dropdown', () => {
      expect(markupOnly).toContain('<option value="topics">Topic Discovery</option>');
      expect(markupOnly).toContain('<option value="posts">Post Generation</option>');
      expect(markupOnly).toContain('<option value="images">Image Curation &amp; Synthesis</option>');
      expect(markupOnly).toContain('<option value="scheduling">Publication Scheduling</option>');
      expect(markupOnly).toContain('<option value="errors">Errors &amp; Blocked</option>');

      // No Polish parentheticals in options
      expect(markupOnly).not.toContain('Wyszukiwanie tematów');
      expect(markupOnly).not.toContain('Generowanie postów');
      expect(markupOnly).not.toContain('Zasoby wizualne');
      expect(markupOnly).not.toContain('Planowanie publikacji');
    });
  });

  describe('3. English-Only Translations & Quality Gate Diagnostics', () => {
    it('translates Polish stage names and actions accurately', () => {
      expect(humanizePolishPipelineSummary('Planowanie publikacji')).toBe('Publication Scheduling');
      expect(humanizePolishPipelineSummary('Generowanie postów')).toBe('Post Generation');
      expect(humanizePolishPipelineSummary('Wyszukiwanie tematów')).toBe('Topic Discovery');
      expect(humanizePolishPipelineSummary('Zakończono etap: Generowanie postów')).toBe('Stage completed: Post Generation');
      expect(humanizePolishPipelineSummary('Weryfikacja zakończona')).toBe('Verification completed');
      expect(humanizePolishPipelineSummary('Niepowodzenie')).toBe('Failed');
      expect(humanizePolishPipelineSummary('Brak tematów do przetworzenia')).toBe('No topics available to process');
    });

    it('translates post generation and rejection messages', () => {
      expect(humanizePolishPipelineSummary('Wygenerowano post: "Innowacje w AI"'))
        .toBe('Generated post: "Innowacje w AI"');
      expect(humanizePolishPipelineSummary('Zaplanowano 1 post(ów)'))
        .toBe('Scheduled 1 post');
      expect(humanizePolishPipelineSummary('Zaplanowano 3 postów'))
        .toBe('Scheduled 3 posts');
      expect(humanizePolishPipelineSummary('Znaleziono 5 tematów'))
        .toBe('Found 5 topics');
      expect(humanizePolishPipelineSummary('Znaleziono: 4, Zaakceptowano: 2, Odrzucono: 2'))
        .toBe('Found: 4, Accepted: 2, Rejected: 2');
      expect(humanizePolishPipelineSummary('Przywrócono z odroczonych: 2'))
        .toBe('Promoted from deferred: 2');
    });

    it('parses quality gate failure and provides structured issue breakdown', () => {
      const rawPolishFailure =
        'Post odrzucony (REJECTED): Failed quality gate evaluation after 3 attempts. Post blocked from publishing. Last issues: [SMQG-Genericness] Post relies on predictable AI template syntax ("Nie jest tajemnicą, że...") | [ContentSubstance] AI template pattern detected ("\\b(?:isn\'t|is+not)\\s+just\\s+[^,?!]+...")';

      const parsed = parseQualityGateFailure(rawPolishFailure);

      expect(parsed.summary).toContain('Post rejected');
      expect(parsed.summary).toContain('The post failed quality checks after 3 attempts and was blocked from publishing.');
      expect(parsed.issues).toHaveLength(2);

      const genericIssue = parsed.issues.find(i => i.tag === 'SMQG-Genericness');
      expect(genericIssue).toBeDefined();
      expect(genericIssue?.label).toBe('Generic phrasing');
      expect(genericIssue?.description).toContain('The content matched a predictable AI writing pattern.');

      const substanceIssue = parsed.issues.find(i => i.tag === 'ContentSubstance');
      expect(substanceIssue).toBeDefined();
      expect(substanceIssue?.label).toBe('Content substance');
      expect(substanceIssue?.description).toContain('Avoid predictable formulations.');

      // Full underlying reason is preserved for diagnostic inspection
      expect(parsed.fullReason).toBe(rawPolishFailure);
    });

    it('maps known quality gate dimension tags to readable English labels', () => {
      expect(getQualityGateDimensionLabel('SMQG-Genericness')).toBe('Generic phrasing');
      expect(getQualityGateDimensionLabel('AudienceRelevance')).toBe('Audience relevance');
      expect(getQualityGateDimensionLabel('Readability')).toBe('Readability');
      expect(getQualityGateDimensionLabel('CTAQuality')).toBe('Call-to-action quality');
      expect(getQualityGateDimensionLabel('Clickbait')).toBe('Headline tone');
      expect(getQualityGateDimensionLabel('CorporateLingo')).toBe('Corporate buzzwords');
      expect(getQualityGateDimensionLabel('ContentSubstance')).toBe('Content substance');
      expect(getQualityGateDimensionLabel('BrandVoice')).toBe('Brand voice');
      expect(getQualityGateDimensionLabel('Length')).toBe('Post length');
      expect(getQualityGateDimensionLabel('FactualAccuracy')).toBe('Factual accuracy');
    });
  });

  describe('4. Execution Log Readability & Status Mapping in Browser Runtime', () => {
    function createMockSandbox(overrides: any = {}) {
      const elements: Record<string, any> = {};
      const getMockEl = (id: string) => {
        if (!elements[id]) {
          elements[id] = {
            id,
            style: {},
            classList: { add: () => {}, remove: () => {} },
            textContent: '',
            innerHTML: '',
            addEventListener: () => {},
            dataset: {}
          };
        }
        return elements[id];
      };

      const doc = {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id: string) => getMockEl(id),
        querySelectorAll: () => []
      };

      const win: any = {
        location: { hash: '', search: '', pathname: '/admin' },
        history: { pushState: () => {} },
        addEventListener: () => {},
        document: doc
      };

      const sandbox: any = {
        window: win,
        document: doc,
        console: { log: () => {}, warn: () => {}, error: () => {} },
        URLSearchParams,
        Date,
        Math,
        setTimeout,
        clearTimeout,
        ...overrides
      };
      return sandbox;
    }

    it('formats single scanable timestamp without repeated time strings', () => {
      const scripts = getAdminScripts();
      const sandbox = createMockSandbox();

      const context = vm.createContext(sandbox);
      vm.runInContext(scripts, context);

      expect(typeof sandbox.window.formatActivityTimestamp).toBe('function');

      const iso = '2026-10-21T12:30:00.000Z';
      const formatted = sandbox.window.formatActivityTimestamp(iso, '14s', false);

      expect(formatted).toBe('21 Oct, 12:30 UTC (14s)');
      // Confirm no repeated timestamp string
      const occurrences = (formatted.match(/12:30/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it('renders correctly structured cards in renderPipelineActivity', async () => {
      const scripts = getAdminScripts();
      const mockListEl = {
        innerHTML: '',
        insertAdjacentHTML: (_pos: string, html: string) => { mockListEl.innerHTML += html; }
      };

      const sandbox = createMockSandbox({
        fetch: async () => ({
          ok: true,
          json: async () => ({
            runs: [
              {
                id: 'run-success',
                stage: 'posts',
                status: 'COMPLETED',
                startedAt: '2026-10-21T12:00:00.000Z',
                durationSeconds: 22,
                neuronsUsed: 14200,
                summary: 'Generated post draft: "Modern Cloud Architectures"',
                details: { title: 'Modern Cloud Architectures', finalDecision: 'APPROVED' }
              },
              {
                id: 'run-rejected',
                stage: 'posts',
                status: 'COMPLETED', // DB record has completed execution loop, but post was rejected
                startedAt: '2026-10-21T12:05:00.000Z',
                durationSeconds: 15,
                neuronsUsed: 8900,
                summary: 'Post odrzucony (REJECTED): Failed quality gate evaluation after 3 attempts. Post blocked from publishing. Last issues: [SMQG-Genericness] Post relies on predictable AI template syntax ("Nie jest...")',
                details: {
                  title: 'Generic AI post',
                  finalDecision: 'REJECTED',
                  rejectionReason: 'Failed quality gate evaluation after 3 attempts. Post blocked from publishing. Last issues: [SMQG-Genericness] Post relies on predictable AI template syntax ("Nie jest...")'
                }
              },
              {
                id: 'run-empty',
                stage: 'maintenance',
                status: 'COMPLETED',
                startedAt: '2026-10-21T12:10:00.000Z',
                durationSeconds: 1,
                summary: 'Maintenance routine completed',
                details: {} // empty details
              }
            ],
            total: 3
          })
        })
      });

      // Override getElementById for activity list
      const origGetEl = sandbox.document.getElementById;
      sandbox.document.getElementById = (id: string) => {
        if (id === 'automation-activity-list') return mockListEl;
        return origGetEl(id);
      };

      const context = vm.createContext(sandbox);
      vm.runInContext(scripts, context);

      // Trigger loadAutomationActivity
      await sandbox.window.loadAutomationActivity(true);

      const html = mockListEl.innerHTML;

          // 1. Misleading D1 counters are completely absent
          expect(html).not.toContain('D1 writes');
          expect(html).not.toContain('D1 reads');
          expect(html).not.toContain('0 D1 writes');
          expect(html).not.toContain('0 D1 reads');

          // 2. Neurons are present when > 0
          expect(html).toMatch(/14[\s\u00a0,.]?200 AI neurons/);
          expect(html).toMatch(/8[\s\u00a0,.]?900 AI neurons/);

          // 3. Timestamps are clean single entries
          expect(html).toContain('21 Oct, 12:00 UTC (22s)');
          expect(html).toContain('21 Oct, 12:05 UTC (15s)');
          expect(html).toContain('21 Oct, 12:10 UTC (1s)');

          // 4. Rejection status mapping: Never label an operation Completed if its final outcome was rejection
          expect(html).toContain('<span class="status-badge status-alert">REJECTED</span>');

          // 5. English stage labels
          expect(html).toContain('Post Generation');
          expect(html).toContain('System Maintenance');

          // 6. Quality gate issues breakdown rendered cleanly
          expect(html).toContain('Issues');
          expect(html).toContain('Generic phrasing');

          // 7. Expandable details button omitted when details object is empty
          // run-empty has empty details: should not have Details button for run-empty
          expect(html).not.toContain("toggleActivityDetails('run-empty')");
          // run-rejected has details: should have Details button
          expect(html).toContain("toggleActivityDetails('run-rejected')");
    });
  });
});
