import { describe, it, expect } from 'vitest';
import { EXAMPLE_PROBLEMS } from './exampleProblems';

describe('exampleProblems', () => {
    it('should load all 5 example problems', () => {
        expect(EXAMPLE_PROBLEMS.length).toBe(5);
    });

    it('should contain non-empty stroke coordinates for every example', () => {
        EXAMPLE_PROBLEMS.forEach((problem) => {
            expect(problem.strokes.length).toBeGreaterThan(0);
            problem.strokes.forEach((stroke) => {
                expect(stroke.length).toBeGreaterThan(0);
                stroke.forEach((pt) => {
                    expect(typeof pt.x).toBe('number');
                    expect(typeof pt.y).toBe('number');
                });
            });
        });
    });

    it('should contain descriptive information for every example', () => {
        EXAMPLE_PROBLEMS.forEach((problem) => {
            expect(problem.id).toBeTruthy();
            expect(problem.name).toBeTruthy();
            expect(problem.description).toBeTruthy();
        });
    });
});
