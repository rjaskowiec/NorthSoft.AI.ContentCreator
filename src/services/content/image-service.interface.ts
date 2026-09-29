
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

export interface ImageService {
  searchImages(query: string, limit?: number): Promise<ImageCandidate[]>;
  downloadImage(url: string): Promise<ArrayBuffer>;
  verifyImageWithVision(imageBytes: ArrayBuffer, topicTitle: string, postBody: string): Promise<ImageVerificationResult>;
}
