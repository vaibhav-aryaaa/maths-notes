import { renderHook, waitFor } from '@testing-library/react';
import { useSolveHistory } from './useSolveHistory';
import { describe, it, expect } from 'vitest';

describe('useSolveHistory', () => {
    it('should initialize with an empty history list and handle db absence gracefully', async () => {
        const { result } = renderHook(() => useSolveHistory());
        
        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });
        expect(result.current.history).toEqual([]);
    });

    it('should expose API handlers', async () => {
        const { result } = renderHook(() => useSolveHistory());

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        expect(typeof result.current.saveHistoryEntry).toBe('function');
        expect(typeof result.current.deleteHistoryItem).toBe('function');
        expect(typeof result.current.clearHistory).toBe('function');
    });
});
