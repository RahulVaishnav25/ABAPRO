import { describe, expect, it } from 'vitest';
import { encodedPath } from './client';

describe('encodedPath', () => {
  it('keeps each interpolated value inside one path segment', () => {
    expect(encodedPath`/clients/${'abc'}/goals/${42}`).toBe('/clients/abc/goals/42');
    expect(encodedPath`/clinics/${'../organizations?x=1'}`).toBe('/clinics/..%2Forganizations%3Fx%3D1');
  });
});
