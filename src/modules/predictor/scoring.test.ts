import { describe, expect, it } from 'vitest';
import { admissionProbability, projectClosingRank, toBucket } from './scoring';

describe('predictor scoring', () => {
  it('gives better ranks higher admission probability', () => {
    expect(admissionProbability(100, 1000)).toBeGreaterThan(admissionProbability(1500, 1000));
  });

  it('projects a damped and bounded trend', () => {
    expect(projectClosingRank([{ year: 2023, closingRank: 1000 }, { year: 2024, closingRank: 1200 }])).toEqual({ expectedClosingRank: 1100, basedOnYear: 2024, trendPct: 10 });
  });

  it('maps probabilities into explainable buckets', () => {
    expect(toBucket(0.9)).toBe('SAFE');
    expect(toBucket(0.01)).toBeNull();
  });
});
