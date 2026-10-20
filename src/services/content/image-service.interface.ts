
export type MatchLevel =
  | 'LEVEL_1_SPECIFIC'
  | 'LEVEL_2_CATEGORY'
  | 'LEVEL_3_CONTEXTUAL'
  | 'LEVEL_4_GENERIC';

export interface SearchQueryCandidate {
  level: MatchLevel;
  query: string;
}

export interface SelectedImageResult {
  candidate: ImageCandidate;
  level: MatchLevel;
  score: number;
  reason: string;
}

export interface ImageCandidate {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  tags?: string[];
}

export interface ImageVerificationResult {
  decision: 'accept' | 'reject';
  confidence: number;
  scene?: string;
  objects?: string[];
  matches_content: boolean;
  mismatches?: string[];
  reason: string;
}

export type SearchErrorType =
  | 'TIMEOUT'
  | 'PROVIDER_5XX'
  | 'RATE_LIMIT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'NONE';

export interface SearchDiagnostics {
  initiated: boolean;
  query: string;
  provider: string;
  providerSuccess: boolean;
  httpStatus?: number;
  providerLatencyMs: number;
  rawResultsCount: number;
  filteredResultsCount: number;
  error?: string;
  errorType: SearchErrorType;
}

export interface SearchImagesResult {
  candidates: ImageCandidate[];
  diagnostics: SearchDiagnostics;
}

export interface ImageService {
  searchImages(query: string, limit?: number): Promise<ImageCandidate[]>;
  searchImagesWithDiagnostics?(query: string, limit?: number): Promise<SearchImagesResult>;
  downloadImage(url: string): Promise<ArrayBuffer>;
  verifyImageWithVision(imageBytes: ArrayBuffer, topicTitle: string, postBody: string): Promise<ImageVerificationResult>;
  findBestImage(
    topicTitle: string,
    category: string,
    postBody: string,
    recentlyUsedUrls?: Set<string>,
  ): Promise<SelectedImageResult | null>;
}

