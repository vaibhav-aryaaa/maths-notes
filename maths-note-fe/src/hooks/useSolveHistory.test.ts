import { renderHook, waitFor, act } from '@testing-library/react';
import { useSolveHistory } from './useSolveHistory';
import { describe, it, expect } from 'vitest';

describe('useSolveHistory', () => {
    it('should initialize with an empty history list and handle db absence gracefully', async () => {
        const { result } = renderHook(() => useSolveHistory('canvas-1'));
        
        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });
        expect(result.current.history).toEqual([]);
        expect(result.current.showAllNotebooks).toBe(false);
    });

    it('should expose API handlers', async () => {
        const { result } = renderHook(() => useSolveHistory('canvas-1'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        expect(typeof result.current.saveHistoryEntry).toBe('function');
        expect(typeof result.current.deleteHistoryItem).toBe('function');
        expect(typeof result.current.clearHistory).toBe('function');
        expect(typeof result.current.setShowAllNotebooks).toBe('function');
    });

    it('should toggle showAllNotebooks state', async () => {
        const { result } = renderHook(() => useSolveHistory('canvas-1'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        expect(result.current.showAllNotebooks).toBe(false);

        act(() => {
            result.current.setShowAllNotebooks(true);
        });

        expect(result.current.showAllNotebooks).toBe(true);
    });
});
