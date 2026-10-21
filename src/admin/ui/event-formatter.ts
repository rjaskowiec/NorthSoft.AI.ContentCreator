/**
 * NorthSoft.AI.ContentCreator — Human-Friendly Event, Log & Notification Formatter
 *
 * Provides structured presentation formatting for audit events, pipeline runs,
 * generation outcomes, AI decisions, and API operation toast notifications.
 *
 * Simplifies the presentation layer while preserving complete underlying diagnostic data.
 */

export interface FormattedField {
  label: string;
  value: string;
  isHighlight?: boolean;
  isBadge?: boolean;
  badgeClass?: string;
}

export interface FormattedEvent {
  title: string;
  subtitle?: string;
  status: 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'DEFERRED' | 'WARNING' | 'PROCESSING' | 'INFO';
  badgeText: string;
  badgeClass: string;
  entityName?: string;
  summary: string;
  fields: FormattedField[];
  rawPayload: Record<string, unknown>;
  hasDiagnosticError?: boolean;
  errorMessage?: string;
}

export interface ApiToastFormatting {
  title: string;
  inProgress: string;
  completed: string;
  failed: string;
  skipToast?: boolean;
}

/**
 * Maps raw machine enums for AI evaluation decisions into human-readable labels and badge classes.
 */
export function humanizeAiDecision(decision: unknown): { label: string; badgeClass: string } {
  const norm = String(decision || '').toUpperCase().trim();
  switch (norm) {
    case 'PASS':
    case 'PASSED':
    case 'APPROVED':
      return { label: 'Approved', badgeClass: 'status-healthy' };
    case 'REJECT':
    case 'REJECTED':
    case 'FAIL':
    case 'FAILED':
      return { label: 'Rejected', badgeClass: 'status-alert' };
    case 'BLOCKED':
      return { label: 'Blocked', badgeClass: 'status-alert' };
    case 'DEFERRED':
      return { label: 'Deferred', badgeClass: 'status-disabled' };
    default:
      if (!norm) return { label: 'Not evaluated', badgeClass: 'status-disabled' };
      return {
        label: norm.charAt(0) + norm.slice(1).toLowerCase(),
        badgeClass: 'status-disabled',
      };
  }
}

/**
 * Maps raw pipeline outcome enum values into readable English labels and styling.
 */
export function humanizePipelineOutcome(outcome: unknown): { label: string; badgeClass: string } {
  const norm = String(outcome || '').toUpperCase().trim();
  switch (norm) {
    case 'COMPLETED_WITH_OUTPUT':
      return { label: 'Completed with output', badgeClass: 'status-healthy' };
    case 'COMPLETED_NO_WORK':
    case 'NO_WORK_NEEDED':
      return { label: 'No work needed', badgeClass: 'status-disabled' };
    case 'BLOCKED':
      return { label: 'Blocked', badgeClass: 'status-alert' };
    case 'FAILED':
      return { label: 'Failed', badgeClass: 'status-alert' };
    default:
      return {
        label: norm ? norm.replace(/_/g, ' ').toLowerCase() : 'Completed',
        badgeClass: 'status-disabled',
      };
  }
}

/**
 * Safely extracts a clean human-readable error message from arbitrary error objects,
 * JSON strings, or error response payloads without leaking stack traces or raw JSON.
 */
export function extractHumanErrorMessage(err: unknown, fallback = 'Operation could not be completed.'): string {
  if (!err) return fallback;

  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractHumanErrorMessage(parsed, fallback);
      } catch {
        // Not valid JSON, keep as string
      }
    }
    // Remove technical HTTP prefixes if present
    const cleaned = trimmed
      .replace(/^Error:\s*/i, '')
      .replace(/^HTTP\s+\d+:\s*/i, '')
      .replace(/^Failed to fetch\s+.*$/i, 'Network connection failure. Please verify your connection.');
    return cleaned || fallback;
  }

  if (err instanceof Error) {
    return extractHumanErrorMessage(err.message, fallback);
  }

  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) {
      return extractHumanErrorMessage(obj.message, fallback);
    }
    if (typeof obj.error === 'string' && obj.error.trim()) {
      return extractHumanErrorMessage(obj.error, fallback);
    }
    if (obj.error && typeof obj.error === 'object') {
      return extractHumanErrorMessage(obj.error, fallback);
    }
  }

  return fallback;
}

/**
 * Formats structured events (Audit log items, Pipeline runs, AI decisions) into a
 * human-readable presentation model with labeled fields and diagnostic expanders.
 */
export function formatStructuredEvent(rawEvent: Record<string, unknown> | null | undefined): FormattedEvent {
  const ev = rawEvent || {};
  const eventType = String(ev.eventType || ev.stage || ev.type || '').toUpperCase().trim();
  const rawStatus = String(ev.status || ev.result_status || 'INFO').toUpperCase().trim();
  const rawDetails = (ev.details && typeof ev.details === 'object' ? ev.details : {}) as Record<string, unknown>;
  const rawError = (ev.error && typeof ev.error === 'object' ? ev.error : {}) as Record<string, unknown>;

  const fields: FormattedField[] = [];

  // Determine primary outcome / status
  let status: FormattedEvent['status'] = 'INFO';
  let badgeText = 'Info';
  let badgeClass = 'status-disabled';

  if (rawStatus === 'FAILED' || rawStatus === 'ERROR' || ev.error || rawDetails.error) {
    status = 'FAILED';
    badgeText = 'Failed';
    badgeClass = 'status-alert';
  } else if (rawStatus === 'BLOCKED' || rawDetails.outcome === 'BLOCKED' || rawDetails.finalDecision === 'BLOCKED') {
    status = 'BLOCKED';
    badgeText = 'Blocked';
    badgeClass = 'status-alert';
  } else if (rawStatus === 'DEFERRED' || rawDetails.outcome === 'DEFERRED' || rawDetails.finalDecision === 'DEFERRED') {
    status = 'DEFERRED';
    badgeText = 'Deferred';
    badgeClass = 'status-disabled';
  } else if (rawStatus === 'COMPLETED' || rawStatus === 'SUCCESS' || rawStatus === 'PASSED') {
    status = 'COMPLETED';
    badgeText = 'Completed';
    badgeClass = 'status-healthy';
  }

  // 1. CONTENT GENERATION & AI QUALITY GATE EVENTS
  const hasGenerationShape = Boolean(
    rawDetails.finalDecision ||
    rawDetails.qualityScore !== undefined ||
    rawDetails.rejectionReason ||
    eventType.includes('POST_GENERATED') ||
    eventType.includes('QUALITY_GATE') ||
    eventType === 'POSTS' ||
    rawDetails.postId
  );

  if (hasGenerationShape) {
    const postTitle = (rawDetails.title || ev.title || rawDetails.postTitle || '') as string;
    const finalDecision = rawDetails.finalDecision as string | undefined;
    const qualityScore = rawDetails.qualityScore !== undefined ? Number(rawDetails.qualityScore) : null;
    const rejectionReason = (rawDetails.rejectionReason || rawDetails.reason || rawError.message || '') as string;
    const ideaId = (rawDetails.ideaId || ev.ideaId || '') as string;
    const postId = (rawDetails.postId || ev.postId || '') as string;

    const isRejected = finalDecision === 'REJECTED' || finalDecision === 'FAIL';
    const isApproved = finalDecision === 'PASS' || finalDecision === 'PASSED' || finalDecision === 'APPROVED';

    let eventTitle = 'Post draft generated';
    if (status === 'FAILED') {
      if (isRejected) {
        eventTitle = 'Post draft rejected by AI review';
        badgeText = 'Rejected';
      } else {
        eventTitle = 'Generation failed';
        badgeText = 'Failed';
      }
    } else if (isRejected) {
      eventTitle = 'Post draft rejected by AI review';
      badgeText = 'Rejected';
      badgeClass = 'status-alert';
      status = 'FAILED';
    } else if (isApproved) {
      eventTitle = 'Post draft generated';
      badgeText = 'Approved';
      badgeClass = 'status-healthy';
    }

    if (postTitle) {
      fields.push({ label: 'Post', value: postTitle, isHighlight: true });
    }

    if (finalDecision) {
      const dec = humanizeAiDecision(finalDecision);
      fields.push({
        label: 'AI decision',
        value: dec.label,
        isBadge: true,
        badgeClass: dec.badgeClass,
      });
    }

    if (rejectionReason && rejectionReason.trim()) {
      const parsedFailure = parseQualityGateFailure(rejectionReason);
      fields.push({ label: 'Reason', value: parsedFailure.summary, isHighlight: true });
      for (const issue of parsedFailure.issues) {
        fields.push({
          label: issue.label,
          value: issue.description,
        });
      }
    }

    if (qualityScore !== null && !isNaN(qualityScore)) {
      fields.push({ label: 'Quality score', value: `${qualityScore} / 10` });
    }

    if (postId) {
      fields.push({ label: 'Post ID', value: postId });
    }

    if (ideaId) {
      fields.push({ label: 'Idea ID', value: ideaId });
    }

    let summary = eventTitle;
    if (postTitle) {
      summary = `${eventTitle}: "${postTitle}"`;
    }
    if (rejectionReason) {
      const parsedFailure = parseQualityGateFailure(rejectionReason);
      summary += ` — ${parsedFailure.summary}`;
    }

    return {
      title: eventTitle,
      subtitle: postTitle ? `Post: ${postTitle}` : undefined,
      status,
      badgeText,
      badgeClass,
      entityName: postTitle || undefined,
      summary,
      fields,
      rawPayload: rawDetails,
      hasDiagnosticError: Boolean(rawError.message || rawDetails.error),
      errorMessage: (rawError.message || rawDetails.error || '') as string,
    };
  }

  // 2. TOPIC RESEARCH & DISCOVERY EVENTS
  const hasResearchShape = Boolean(
    eventType.includes('RESEARCH') ||
    eventType === 'TOPICS' ||
    rawDetails.itemsFound !== undefined ||
    rawDetails.topicsDiscovered !== undefined
  );

  if (hasResearchShape) {
    const found = Number(rawDetails.itemsFound ?? rawDetails.topicsDiscovered ?? 0);
    const accepted = Number(rawDetails.itemsAccepted ?? rawDetails.newProposalsCount ?? 0);
    const rejected = Number(rawDetails.itemsRejected ?? 0);
    const deferred = Number(rawDetails.itemsDeferred ?? 0);

    const eventTitle = status === 'FAILED' ? 'Topic discovery failed' : 'Topic discovery completed';
    
    fields.push({ label: 'Items evaluated', value: String(found) });
    fields.push({ label: 'Accepted proposals', value: String(accepted), isHighlight: accepted > 0 });
    if (rejected > 0) fields.push({ label: 'Rejected', value: String(rejected) });
    if (deferred > 0) fields.push({ label: 'Deferred', value: String(deferred) });

    if (rawDetails.researchError) {
      fields.push({ label: 'Error', value: String(rawDetails.researchError), isHighlight: true });
    }

    const summary = `${eventTitle}: found ${found}, accepted ${accepted}`;

    return {
      title: eventTitle,
      status,
      badgeText,
      badgeClass,
      summary,
      fields,
      rawPayload: rawDetails,
      hasDiagnosticError: Boolean(rawError.message || rawDetails.error || rawDetails.researchError),
      errorMessage: String(rawError.message || rawDetails.error || rawDetails.researchError || ''),
    };
  }

  // 3. IMAGE CURATION & SYNTHESIS EVENTS
  const hasImageShape = Boolean(
    eventType.includes('IMAGE') ||
    eventType === 'IMAGES' ||
    rawDetails.attachedFromLibrary !== undefined ||
    rawDetails.candidatesAwaitingApproval !== undefined
  );

  if (hasImageShape) {
    const attached = Number(rawDetails.attachedFromLibrary ?? rawDetails.assignedFromLibrary ?? 0);
    const candidates = Number(rawDetails.candidatesAwaitingApproval ?? 0);
    const processed = Number(rawDetails.processed ?? 0);
    const notFound = Number(rawDetails.notFound ?? 0);

    const eventTitle = status === 'FAILED' ? 'Image curation failed' : 'Image curation & synthesis';

    if (processed > 0) fields.push({ label: 'Processed drafts', value: String(processed) });
    if (attached > 0) fields.push({ label: 'Attached from library', value: String(attached), isHighlight: true });
    if (candidates > 0) fields.push({ label: 'Candidates awaiting review', value: String(candidates) });
    if (notFound > 0) fields.push({ label: 'No image found', value: String(notFound) });

    return {
      title: eventTitle,
      status,
      badgeText,
      badgeClass,
      summary: `${eventTitle}: attached ${attached}, candidates ${candidates}`,
      fields,
      rawPayload: rawDetails,
      hasDiagnosticError: Boolean(rawError.message || rawDetails.error),
      errorMessage: String(rawError.message || rawDetails.error || ''),
    };
  }

  // 4. PUBLICATION & SCHEDULING EVENTS
  const hasSchedulingShape = Boolean(
    eventType.includes('SCHEDUL') ||
    eventType === 'SCHEDULING' ||
    rawDetails.scheduledCount !== undefined
  );

  if (hasSchedulingShape) {
    const scheduled = Number(rawDetails.scheduledCount ?? 0);
    const awaitingImage = Number(rawDetails.skippedWithoutImage ?? 0);

    const eventTitle = status === 'FAILED' ? 'Scheduling failed' : 'Publication scheduling';

    fields.push({ label: 'Posts scheduled', value: String(scheduled), isHighlight: scheduled > 0 });
    if (awaitingImage > 0) fields.push({ label: 'Awaiting image', value: String(awaitingImage) });

    return {
      title: eventTitle,
      status,
      badgeText,
      badgeClass,
      summary: `${eventTitle}: scheduled ${scheduled} post(s)`,
      fields,
      rawPayload: rawDetails,
      hasDiagnosticError: Boolean(rawError.message || rawDetails.error),
      errorMessage: String(rawError.message || rawDetails.error || ''),
    };
  }

  // 5. GENERIC / UNKNOWN EVENT SAFE FALLBACK
  const genericTitle = eventType
    ? eventType.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
    : 'System Event';

  for (const [key, val] of Object.entries(rawDetails)) {
    if (val === null || val === undefined || key === 'error') continue;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      fields.push({ label, value: String(val) });
    }
  }

  const genericError = String(rawError.message || rawDetails.error || ev.errorMessage || '');

  return {
    title: genericTitle,
    status,
    badgeText,
    badgeClass,
    summary: genericTitle,
    fields,
    rawPayload: rawDetails,
    hasDiagnosticError: Boolean(genericError),
    errorMessage: genericError,
  };
}

/**
 * Maps mutating HTTP requests into concise, human-friendly toast notification strings,
 * completely eliminating raw HTTP methods and endpoint paths from ordinary progress messages.
 */
export function formatApiToast(
  method: string,
  url: string,
  options?: { skipToast?: boolean; entityTitle?: string },
): ApiToastFormatting {
  if (options?.skipToast) {
    return {
      title: '',
      inProgress: '',
      completed: '',
      failed: '',
      skipToast: true,
    };
  }

  const normUrl = url.toLowerCase();
  const titleSuffix = options?.entityTitle ? ` "${options.entityTitle}"` : '';

  // 1. Image Library & Upload Operations
  if (normUrl.includes('/images/upload') || (normUrl.endsWith('/images') && method === 'POST')) {
    return {
      title: 'Image Upload',
      inProgress: 'Uploading image…',
      completed: 'Image uploaded successfully.',
      failed: 'Failed to upload image.',
    };
  }

  if (normUrl.includes('/images/candidate-discovery')) {
    return {
      title: 'Image Discovery',
      inProgress: 'Searching for suitable images…',
      completed: 'Image discovery completed.',
      failed: 'Image discovery failed.',
    };
  }

  if (normUrl.includes('/images/generate')) {
    return {
      title: 'AI Image Synthesis',
      inProgress: 'Generating AI illustration…',
      completed: 'AI image generated and saved.',
      failed: 'Failed to generate AI image.',
    };
  }

  if (normUrl.includes('/images/auto-extract-metadata')) {
    return {
      title: 'Metadata Analysis',
      inProgress: 'Analyzing image metadata…',
      completed: 'Metadata extracted successfully.',
      failed: 'Failed to extract image metadata.',
    };
  }

  if (normUrl.includes('/images/bulk-action')) {
    return {
      title: 'Bulk Image Action',
      inProgress: 'Applying bulk image updates…',
      completed: 'Bulk image action completed.',
      failed: 'Failed to update images.',
    };
  }

  if (normUrl.includes('/images/') && method === 'DELETE') {
    return {
      title: 'Delete Image',
      inProgress: 'Deleting image…',
      completed: 'Image deleted.',
      failed: 'Failed to delete image.',
    };
  }

  if (normUrl.includes('/images/') && (method === 'POST' || method === 'PUT')) {
    return {
      title: 'Update Image',
      inProgress: 'Updating image metadata…',
      completed: 'Image metadata saved.',
      failed: 'Failed to update image metadata.',
    };
  }

  // 2. Content Drafts & Post Operations
  if (normUrl.includes('/content/posts/') && normUrl.includes('/assign-image')) {
    return {
      title: 'Assign Image',
      inProgress: 'Assigning image to post…',
      completed: 'Image assigned to post.',
      failed: 'Failed to assign image.',
    };
  }

  if (normUrl.includes('/content/posts/') && normUrl.includes('/schedule')) {
    return {
      title: 'Schedule Publication',
      inProgress: 'Scheduling post publication…',
      completed: 'Post scheduled successfully.',
      failed: 'Failed to schedule post.',
    };
  }

  if (normUrl.includes('/content/generate') || normUrl.includes('/ideas/') && normUrl.includes('/generate')) {
    return {
      title: 'Generate Post Draft',
      inProgress: `Generating post draft${titleSuffix}…`,
      completed: `Post draft generated successfully.`,
      failed: `Failed to generate post draft.`,
    };
  }

  if (normUrl.includes('/content/posts/bulk-action')) {
    return {
      title: 'Bulk Post Action',
      inProgress: 'Updating selected post drafts…',
      completed: 'Post drafts updated successfully.',
      failed: 'Failed to update post drafts.',
    };
  }

  if (normUrl.includes('/content/posts/') && (method === 'POST' || method === 'PUT')) {
    return {
      title: 'Save Post Draft',
      inProgress: 'Saving changes…',
      completed: 'Post draft saved.',
      failed: 'Failed to save post draft.',
    };
  }

  if (normUrl.includes('/content/posts/') && method === 'DELETE') {
    return {
      title: 'Delete Post Draft',
      inProgress: 'Deleting post draft…',
      completed: 'Post draft deleted.',
      failed: 'Failed to delete post draft.',
    };
  }

  // 3. Topic Research Operations
  if (normUrl.includes('/research/ideas/bulk-action')) {
    return {
      title: 'Bulk Topic Action',
      inProgress: 'Updating research topics…',
      completed: 'Topics updated successfully.',
      failed: 'Failed to update topics.',
    };
  }

  if (normUrl.includes('/research/ideas') && method === 'POST') {
    return {
      title: 'Create Topic',
      inProgress: 'Creating topic proposal…',
      completed: 'Topic proposal created.',
      failed: 'Failed to create topic proposal.',
    };
  }

  if (normUrl.includes('/research/ideas/') && method === 'DELETE') {
    return {
      title: 'Delete Topic',
      inProgress: 'Deleting topic…',
      completed: 'Topic deleted.',
      failed: 'Failed to delete topic.',
    };
  }

  // 4. Facebook & Publishing Operations
  if (normUrl.includes('/facebook/page-posts/') && normUrl.includes('/visibility')) {
    return {
      title: 'Post Visibility',
      inProgress: 'Updating visibility on Facebook…',
      completed: 'Visibility updated.',
      failed: 'Failed to update visibility.',
    };
  }

  if (normUrl.includes('/facebook/page-posts/') && normUrl.includes('/update')) {
    return {
      title: 'Update Facebook Post',
      inProgress: 'Updating post on Facebook…',
      completed: 'Facebook post updated.',
      failed: 'Failed to update Facebook post.',
    };
  }

  if (normUrl.includes('/facebook/page-posts/') && method === 'DELETE') {
    return {
      title: 'Delete from Facebook',
      inProgress: 'Deleting post from Facebook…',
      completed: 'Post deleted from Facebook.',
      failed: 'Failed to delete post from Facebook.',
    };
  }

  if (normUrl.includes('/facebook/sync')) {
    return {
      title: 'Facebook Page Sync',
      inProgress: 'Syncing latest posts with Facebook Page…',
      completed: 'Facebook Page sync complete.',
      failed: 'Facebook sync failed.',
    };
  }

  if (normUrl.includes('/facebook/publish')) {
    return {
      title: 'Publish to Facebook',
      inProgress: 'Publishing post to Facebook…',
      completed: 'Post published successfully.',
      failed: 'Publication to Facebook failed.',
    };
  }

  // 5. Intelligent Schedules
  if (normUrl.includes('/schedules/calculate')) {
    return {
      title: 'Calculate Schedule',
      inProgress: 'Calculating optimal publication slots…',
      completed: 'Schedule slots calculated.',
      failed: 'Failed to calculate schedule slots.',
    };
  }

  if (normUrl.includes('/schedules/commit')) {
    return {
      title: 'Commit Schedule',
      inProgress: 'Committing publication schedule…',
      completed: 'Publication schedule committed.',
      failed: 'Failed to commit publication schedule.',
    };
  }

  // 6. Pipeline Automation
  if (normUrl.includes('/pipeline/run') || normUrl.includes('/pipeline/trigger')) {
    return {
      title: 'Automated Pipeline',
      inProgress: 'Executing automated content pipeline…',
      completed: 'Pipeline execution finished.',
      failed: 'Pipeline execution failed.',
    };
  }

  // 7. Editorial Guidelines
  if (normUrl.includes('/guidelines')) {
    return {
      title: 'Editorial Guideline',
      inProgress: 'Saving editorial guideline…',
      completed: 'Guideline saved.',
      failed: 'Failed to save guideline.',
    };
  }

  // Fallback for any other mutating request
  return {
    title: 'Saving Changes',
    inProgress: 'Saving changes…',
    completed: 'Changes saved successfully.',
    failed: 'Operation could not be completed.',
  };
}

export interface QualityGateIssue {
  tag: string;
  label: string;
  description: string;
}

export interface ParsedQualityGateFailure {
  summary: string;
  issues: QualityGateIssue[];
  fullReason: string;
}

/**
 * Maps known Polish phrases from historical runs and backend messages into clean, natural English.
 */
export function humanizePolishPipelineSummary(text: string | null | undefined): string {
  if (!text) return '';
  let str = String(text).trim();

  // Strip technical prefix wrappers like "Post odrzucony (REJECTED): "
  str = str.replace(/^Post odrzucony(?:\s*\((?:REJECTED|BLOCKED|FAILED)\))?:\s*/i, 'Post rejected: ');
  str = str.replace(/\bPost odrzucony\b/gi, 'Post rejected');
  str = str.replace(/^Wygenerowano post:\s*/i, 'Generated post: ');
  str = str.replace(/\bWygenerowano post\b/gi, 'Generated post');
  str = str.replace(/^Planowanie publikacji:\s*/i, 'Publication scheduling: ');
  str = str.replace(/\bPlanowanie publikacji\b/gi, 'Publication Scheduling');
  str = str.replace(/\bGenerowanie postów\b/gi, 'Post Generation');
  str = str.replace(/\bWyszukiwanie tematów\b/gi, 'Topic Discovery');
  str = str.replace(/\bZaplanowano\s+(\d+)\s+post(?:\(ów\)|ów)?/gi, (_m, count) => {
    return Number(count) === 1 ? 'Scheduled 1 post' : `Scheduled ${count} posts`;
  });
  str = str.replace(/\bZnaleziono\s+(\d+)\s+tematów/gi, 'Found $1 topics');
  str = str.replace(/\bZnaleziono:\s*/gi, 'Found: ');
  str = str.replace(/\bZaakceptowano:\s*/gi, 'Accepted: ');
  str = str.replace(/\bOdrzucono:\s*/gi, 'Rejected: ');
  str = str.replace(/Brak tematów do przetworzenia/gi, 'No topics available to process');
  str = str.replace(/\bPrzywrócono z odroczonych:\s*(\d+)/gi, 'Promoted from deferred: $1');
  str = str.replace(/\bZakończono etap/gi, 'Stage completed');
  str = str.replace(/\bWeryfikacja zakończona/gi, 'Verification completed');
  str = str.replace(/\bNiepowodzenie/gi, 'Failed');

  return str;
}

/**
 * Standardizes dimension names to human-readable labels.
 */
export function getQualityGateDimensionLabel(dimension: string): string {
  const norm = dimension.replace(/^SMQG-/, '').trim();
  const labelMap: Record<string, string> = {
    Genericness: 'Generic phrasing',
    AudienceRelevance: 'Audience relevance',
    Readability: 'Readability',
    CTAQuality: 'Call-to-action quality',
    Clickbait: 'Headline tone',
    CorporateLingo: 'Corporate buzzwords',
    ContentSubstance: 'Content substance',
    StaticValidation: 'Format validation',
    BrandVoice: 'Brand voice',
    Length: 'Post length',
    FactualAccuracy: 'Factual accuracy',
  };
  return labelMap[norm] || norm.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Parses failure messages containing quality-gate or policy issues into structured, human-readable entries.
 */
export function parseQualityGateFailure(rawReason: string | null | undefined): ParsedQualityGateFailure {
  const fullReason = String(rawReason || '').trim();
  if (!fullReason) {
    return { summary: 'Operation failed.', issues: [], fullReason: '' };
  }

  // Check if this contains quality gate evaluation text with issues
  const lastIssuesIdx = fullReason.indexOf('Last issues:');
  let summaryPart = fullReason;
  let issuesPart = '';

  if (lastIssuesIdx !== -1) {
    summaryPart = fullReason.substring(0, lastIssuesIdx).trim();
    issuesPart = fullReason.substring(lastIssuesIdx + 'Last issues:'.length).trim();
  } else if (fullReason.includes('[SMQG-') || fullReason.includes('[ContentSubstance]')) {
    const firstBracket = fullReason.indexOf('[');
    if (firstBracket > 0) {
      summaryPart = fullReason.substring(0, firstBracket).trim();
      issuesPart = fullReason.substring(firstBracket).trim();
    }
  }

  summaryPart = humanizePolishPipelineSummary(summaryPart);
  summaryPart = summaryPart.replace(/:\s*$/, '').trim();

  // Natural language for evaluation attempts
  summaryPart = summaryPart.replace(
    /Failed quality gate evaluation after (\d+) attempts\. Post blocked from publishing\./i,
    'The post failed quality checks after $1 attempts and was blocked from publishing.',
  );

  const issues: QualityGateIssue[] = [];

  if (issuesPart) {
    const rawItems = issuesPart.split(/\s*\|\s*(?=\[[A-Za-z0-9_-]+\])|\n+/).filter(Boolean);
    for (const item of rawItems) {
      const match = item.match(/\[([A-Za-z0-9_-]+)\]\s*(.*)/);
      if (match && match[1]) {
        const tag = match[1];
        let desc = (match[2] || '').trim();

        // Clean regex pattern code noise for clean presentation
        desc = desc.replace(/\s*\("[^"]+"\)/g, '');
        if (desc.includes('AI template pattern detected') && !desc.includes('Avoid predictable')) {
          desc += '. Avoid predictable formulations.';
        }
        if (desc.includes('Post relies on predictable AI template syntax') && !desc.includes('The content matched')) {
          desc = 'The content matched a predictable AI writing pattern. ' + desc.replace(/^Post relies on predictable AI template syntax\.?\s*/i, '');
        }

        issues.push({
          tag,
          label: getQualityGateDimensionLabel(tag),
          description: desc.trim(),
        });
      } else if (item.trim()) {
        issues.push({
          tag: 'QualityIssue',
          label: 'Quality check',
          description: item.trim(),
        });
      }
    }
  }

  return {
    summary: summaryPart || 'Quality evaluation failed.',
    issues,
    fullReason,
  };
}

