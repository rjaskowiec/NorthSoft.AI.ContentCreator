/**
 * NorthSoft.AI.ContentCreator — Image License and Commercial Rights Policy
 *
 * Enforces strict legal rules for image candidates:
 * - Reject Non-Commercial (NC) licenses outright (commercial use prohibited).
 * - Allow No-Derivatives (ND) only when post publication does not modify the image asset.
 * - Require attribution text generation ("Photo by [Author] via [Source]") for CC-BY, CC-BY-SA, CC-BY-ND.
 * - Allow CC0, Public Domain (PDM), Unsplash/Pexels style custom permissive commercial licenses.
 * - Reject unverified, ambiguous, or unverifiable licenses.
 */

export interface LicenseValidationResult {
  allowedForCommercialUse: boolean;
  requiresAttribution: boolean;
  allowsModifications: boolean;
  attributionText: string | null;
  normalizedLicense: string;
  rejectionReason?: string;
}

export function validateImageLicense(
  licenseRaw: string | null | undefined,
  author?: string | null,
  sourceUrl?: string | null,
  sourceName?: string | null,
): LicenseValidationResult {
  const lic = (licenseRaw || '').trim().toLowerCase();

  if (!lic || lic === 'unverified' || lic === 'unknown' || lic === 'custom') {
    return {
      allowedForCommercialUse: false,
      requiresAttribution: false,
      allowsModifications: false,
      attributionText: null,
      normalizedLicense: lic || 'UNKNOWN',
      rejectionReason: 'License is unknown, ambiguous, or lacks verifiable commercial terms.',
    };
  }

  // Reject Non-Commercial licenses outright
  if (lic.includes('-nc') || lic.includes('nc-') || lic.includes('noncommercial') || lic.includes('non-commercial')) {
    return {
      allowedForCommercialUse: false,
      requiresAttribution: true,
      allowsModifications: false,
      attributionText: null,
      normalizedLicense: lic.toUpperCase(),
      rejectionReason: 'License forbids commercial use (Non-Commercial / NC restriction).',
    };
  }

  const cleanAuthor = author?.trim() || 'Unknown Creator';
  const cleanSource = sourceName?.trim() || (sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : 'Web');

  // CC0 / Public Domain / PDM
  if (lic === 'cc0' || lic === 'cc-zero' || lic.includes('public domain') || lic === 'pdm') {
    return {
      allowedForCommercialUse: true,
      requiresAttribution: false,
      allowsModifications: true,
      attributionText: null,
      normalizedLicense: 'CC0',
    };
  }

  // CC-BY / BY
  if (lic === 'by' || lic === 'cc-by' || lic.startsWith('cc by') || lic.startsWith('cc-by-')) {
    const isSa = lic.includes('sa');
    const isNd = lic.includes('nd');
    const normalized = isSa ? 'CC-BY-SA' : isNd ? 'CC-BY-ND' : 'CC-BY';
    const attr = buildAttributionSnippet(cleanAuthor, cleanSource, sourceUrl);

    return {
      allowedForCommercialUse: true,
      requiresAttribution: true,
      allowsModifications: !isNd,
      attributionText: attr,
      normalizedLicense: normalized,
    };
  }

  // Manual uploads, NorthSoft internal AI creations, or verified commercial assets
  if (
    lic === 'manual upload' ||
    lic === 'manual' ||
    lic === 'commercial' ||
    lic === 'purchased' ||
    lic === 'licensed' ||
    lic.includes('northsoft') ||
    lic.includes('internal use') ||
    lic === 'ai generated' ||
    lic.includes('flux')
  ) {
    return {
      allowedForCommercialUse: true,
      requiresAttribution: false,
      allowsModifications: true,
      attributionText: null,
      normalizedLicense: 'NorthSoft internal use',
    };
  }

  // Permissive platform licenses (Unsplash, Pixabay, Pexels)
  if (lic.includes('unsplash') || lic.includes('pexels') || lic.includes('pixabay')) {
    return {
      allowedForCommercialUse: true,
      requiresAttribution: false,
      allowsModifications: true,
      attributionText: null,
      normalizedLicense: 'PERMISSIVE_COMMERCIAL',
    };
  }

  return {
    allowedForCommercialUse: false,
    requiresAttribution: false,
    allowsModifications: false,
    attributionText: null,
    normalizedLicense: lic.toUpperCase(),
    rejectionReason: `Unverifiable license terms: '${licenseRaw}'. Only verified commercial or CC0/BY licenses are permitted.`,
  };
}

function buildAttributionSnippet(author: string, source: string, sourceUrl?: string | null): string {
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    return `Photo by ${author} via ${source} (${sourceUrl})`;
  }
  return `Photo by ${author} via ${source}`;
}
