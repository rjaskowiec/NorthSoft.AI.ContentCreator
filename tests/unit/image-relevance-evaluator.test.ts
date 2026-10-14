import { describe, expect, it } from 'vitest';
import {
  evaluateImageRelevance,
  filterDiverseCandidates,
} from '../../src/services/content/image-relevance-evaluator';
import { scoreImageCandidate } from '../../src/services/content/image-service';
import type { ImageCandidate } from '../../src/services/content/image-service.interface';

describe('Image Business Relevance & Visual Context Evaluator', () => {
  it('strictly rejects Tunisia military event / army soldiers imagery from websites topic', () => {
    const tunisiaMilitaryImage = {
      title: 'Tunisia Staff Ride - U.S. Army Africa Soldiers apply WWII North Africa campaign lessons to current mission - May 2010',
      keywords: '1943, africa, armor, armored, army, battlefield, campaign, dawn, el, fullenkamp, ii, infantry, memorial, pass, regiment, soldiers, staff, tunisia, united, zid',
      tags: ['army', 'soldiers', 'battlefield', 'tunisia', 'infantry'],
      description: 'Discovered from Openverse topic: "Websites & Landing Pages"',
      discoveryQuery: 'Websites & Landing Pages',
    };

    const res = evaluateImageRelevance(tunisiaMilitaryImage, 'Websites & Landing Pages');
    expect(res.qualified).toBe(false);
    expect(res.score).toBe(0);
    expect(res.detectedContext).toBe('DISQUALIFIED_CONTEXT');
    expect(res.disqualificationReason).toContain('Military');

    // Also verify scoreImageCandidate rejects it outright
    const candidate: ImageCandidate = {
      id: 'img-tunisia',
      url: 'https://example.com/tunisia.jpg',
      title: tunisiaMilitaryImage.title,
      author: 'US Army Africa',
      license: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl: 'https://openverse.org/image/tunisia',
      tags: tunisiaMilitaryImage.tags,
    };

    const scoreRes = scoreImageCandidate(candidate, 'Websites & Landing Pages', 'Technology');
    expect(scoreRes.safe).toBe(false);
    expect(scoreRes.score).toBeLessThanOrEqual(0);
  });

  it('strictly rejects nature reserves, wilderness landscapes, and wildlife without business context', () => {
    const natureReserveImage = {
      title: 'Yoga Pawling Nature Reserve',
      keywords: 'conservancy, land, nature, oblong, olc, pawling, preserve, yoga, environment, fall, landscape, leaf, light, nature, outdoors, park, people, tree, wood',
      tags: ['nature', 'preserve', 'landscape', 'conservancy', 'park'],
      description: 'Discovered from Openverse topic: "Websites & Landing Pages"',
      discoveryQuery: 'Websites & Landing Pages',
    };

    const res = evaluateImageRelevance(natureReserveImage, 'Websites & Landing Pages');
    expect(res.qualified).toBe(false);
    expect(res.detectedContext).toBe('DISQUALIFIED_CONTEXT');
    expect(res.disqualificationReason).toContain('nature reserve');
  });

  it('rejects cemetery, graveyard, or memorial scenes', () => {
    const cemeteryImage = {
      title: 'Ancient Graveyard Tomb Stones',
      keywords: 'cemetery, graveyard, tomb, ancient memorial, stone monument',
      tags: ['cemetery', 'graveyard'],
      discoveryQuery: 'SEO and Local Maps',
    };

    const res = evaluateImageRelevance(cemeteryImage, 'SEO and Local Maps');
    expect(res.qualified).toBe(false);
    expect(res.detectedContext).toBe('DISQUALIFIED_CONTEXT');
  });

  it('rejects generic insufficient images that lack concrete commercial or digital signals', () => {
    const genericCloudImage = {
      title: 'Blue Sky Over Horizon',
      keywords: 'blue sky, white clouds, horizon, open air',
      tags: ['sky', 'clouds'],
      discoveryQuery: 'Cloud Server Infrastructure',
    };

    const res = evaluateImageRelevance(genericCloudImage, 'Cloud Server Infrastructure');
    expect(res.qualified).toBe(false);
    expect(res.detectedContext).toBe('GENERIC_INSUFFICIENT');
  });

  it('approves contemporary small business, customer, laptop, checkout, or booking scenes', () => {
    const validLaptopImage = {
      title: 'Small Business Owner Checking Client Booking on Laptop',
      keywords: 'laptop, office, small business, client, appointment, desk, modern workspace',
      tags: ['laptop', 'business', 'office', 'appointment'],
      discoveryQuery: 'customer booking appointment salon clinic desk',
    };

    const res = evaluateImageRelevance(validLaptopImage, 'customer booking appointment salon clinic desk');
    expect(res.qualified).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(60);
    expect(res.detectedContext).toBe('BUSINESS_TECH');

    const candidate: ImageCandidate = {
      id: 'img-laptop',
      url: 'https://example.com/laptop.jpg',
      title: validLaptopImage.title,
      author: 'Contemporary Photographer',
      license: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl: 'https://openverse.org/image/laptop',
      tags: validLaptopImage.tags,
    };

    const scoreRes = scoreImageCandidate(candidate, 'Online Booking Setup', 'Technology');
    expect(scoreRes.safe).toBe(true);
    expect(scoreRes.score).toBeGreaterThanOrEqual(40);
  });

  it('approves retail store checkout counter and payment terminal imagery for e-commerce topics', () => {
    const retailPosImage = {
      title: 'Customer Tapping Card on Payment Terminal at Coffee Shop Counter',
      keywords: 'retail store, pos terminal, credit card payment, counter, cashier, small business',
      tags: ['retail', 'payment', 'counter', 'checkout'],
      discoveryQuery: 'retail store counter checkout pos terminal',
    };

    const res = evaluateImageRelevance(retailPosImage, 'E-commerce and Quick Checkout');
    expect(res.qualified).toBe(true);
    expect(res.detectedContext).toBe('BUSINESS_TECH');
  });

  it('filters repetitive series from the same event, creator, or title stem (diversity filter)', () => {
    const series = [
      {
        title: 'Tunisia Staff Ride - U.S. Army Africa Soldiers - Photo 1',
        author: 'US Army Africa',
        url: 'https://example.com/1.jpg',
      },
      {
        title: 'Tunisia Staff Ride - U.S. Army Africa Soldiers - Photo 2',
        author: 'US Army Africa',
        url: 'https://example.com/2.jpg',
      },
      {
        title: 'Tunisia Staff Ride - U.S. Army Africa Soldiers - Photo 3',
        author: 'US Army Africa',
        url: 'https://example.com/3.jpg',
      },
      {
        title: 'Different Business Meeting in Creative Studio',
        author: 'Jane Doe',
        url: 'https://example.com/4.jpg',
      },
    ];

    const diverse = filterDiverseCandidates(series, 2);
    // At most 2 from US Army Africa / Tunisia Staff Ride
    const armyItems = diverse.filter((d) => d.author === 'US Army Africa');
    expect(armyItems.length).toBe(2);
    expect(diverse.some((d) => d.author === 'Jane Doe')).toBe(true);
  });
});
