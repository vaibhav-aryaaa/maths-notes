import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MantineProvider } from '@mantine/core';
import { DraggableResultCard } from './DraggableResultCard';
import type { GeneratedResult } from '@/types';
import * as analytics from '@/lib/analytics';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

vi.mock('@/lib/analytics', () => ({
    trackEvent: vi.fn(),
}));

describe('DraggableResultCard - Verification and Correction (Task 71)', () => {
    const mockResult: GeneratedResult = {
        id: 'res-1',
        solutions: [{ expression: 'x', answer: '3' }],
        confidence_score: 95,
        image: 'data:image/png;base64,mockImage',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    const renderCard = (result: GeneratedResult, onUpdateResult = vi.fn()) => {
        return render(
            <MantineProvider>
                <DraggableResultCard
                    result={result}
                    defaultPosition={{ x: 100, y: 100 }}
                    onUpdateResult={onUpdateResult}
                />
            </MantineProvider>
        );
    };

    it('renders the neutral pill and calm highlight when result is corrected', () => {
        const correctedResult: GeneratedResult = {
            ...mockResult,
            solutions: [{ expression: 'x', answer: '-3' }],
            corrected: true,
            verification_note: 'x = 3 violates domain restriction',
        };

        renderCard(correctedResult);

        // Verify neutral note pill
        const pill = screen.getByText('Answer updated after checking the steps');
        expect(pill).toBeDefined();

        // Verify headline solution has calm highlight class
        const answerEl = screen.getByText('\\(x = -3\\)');
        expect(answerEl.className).toContain('bg-[var(--lib-accent-subtle)]/60');
    });

    it('updates answers and sets corrected=true when explain verification disagrees', async () => {
        const onUpdateResult = vi.fn();

        mockedAxios.mockResolvedValueOnce({
            data: {
                thought_process: 'Factored numerator, excluded x = 3 due to division by zero.',
                steps: [
                    { order: 1, description: 'Factor numerator', expression: 'x^2-9=(x-3)(x+3)' },
                    { order: 2, description: 'Domain restriction', expression: 'x \\neq 3' },
                    { order: 3, description: 'Verified answer', expression: 'x = -3' }
                ],
                verification: {
                    agrees: false,
                    corrected_answers: ['-3'],
                    confidence: 100,
                    note: 'x = 3 makes denominator zero; the only valid solution is x = -3.'
                },
                provider: 'gemini'
            }
        });

        renderCard(mockResult, onUpdateResult);

        const expandBtn = screen.getByText('View Thought Process');
        fireEvent.click(expandBtn);

        await waitFor(() => {
            expect(mockedAxios).toHaveBeenCalledTimes(1);
        });

        // Verify payload included structured solutions
        const callConfig = mockedAxios.mock.calls[0][0] as { data?: any };
        const postData = callConfig?.data;
        expect(postData.solutions).toEqual([{ expression: 'x', answer: '3' }]);

        // Verify onUpdateResult was called with corrected answers and corrected: true
        await waitFor(() => {
            expect(onUpdateResult).toHaveBeenCalledWith('res-1', expect.objectContaining({
                corrected: true,
                solutions: [{ expression: 'x', answer: '-3' }],
                confidence_score: 100,
                verification_note: 'x = 3 makes denominator zero; the only valid solution is x = -3.'
            }));
        });

        // Verify PostHog analytics tracked answer_corrected
        expect(analytics.trackEvent).toHaveBeenCalledWith('answer_corrected', {
            type: 'math',
            provider: 'gemini'
        });
    });

    it('does not mark corrected when verification agrees', async () => {
        const onUpdateResult = vi.fn();

        mockedAxios.mockResolvedValueOnce({
            data: {
                thought_process: 'Correct calculation',
                steps: [{ order: 1, description: 'Step 1', expression: 'x = 3' }],
                verification: {
                    agrees: true,
                    corrected_answers: null,
                    confidence: 95,
                    note: null
                },
                provider: 'gemini'
            }
        });

        renderCard(mockResult, onUpdateResult);

        const expandBtn = screen.getByText('View Thought Process');
        fireEvent.click(expandBtn);

        await waitFor(() => {
            expect(mockedAxios).toHaveBeenCalledTimes(1);
        });

        await waitFor(() => {
            expect(onUpdateResult).toHaveBeenCalledWith('res-1', expect.objectContaining({
                corrected: false,
                solutions: [{ expression: 'x', answer: '3' }]
            }));
        });

        expect(analytics.trackEvent).not.toHaveBeenCalledWith('answer_corrected', expect.anything());
    });
});
