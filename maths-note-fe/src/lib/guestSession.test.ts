import { describe, it, expect, beforeEach } from 'vitest';
import {
    getGuestSolveCount,
    incrementGuestSolveCount,
    hasReachedGuestSolveCap,
    getGuestRemainingSolves,
    setGuestSolveCount,
    saveGuestCanvasData,
    loadGuestCanvasData,
    clearGuestCanvasData,
    saveGuestHistory,
    loadGuestHistory,
    addGuestHistoryEntry,
    clearGuestHistory,
    clearGuestSession,
    GUEST_SOLVE_CAP
} from './guestSession';
import type { LiveCanvasData } from '@/lib/liveCanvasPersistence';
import type { HistoryEntry } from '@/hooks/useSolveHistory';

describe('guestSession', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('should initialize solve count to 0', () => {
        expect(getGuestSolveCount()).toBe(0);
        expect(hasReachedGuestSolveCap()).toBe(false);
        expect(getGuestRemainingSolves()).toBe(GUEST_SOLVE_CAP);
    });

    it('should increment solve count accurately', () => {
        expect(incrementGuestSolveCount()).toBe(1);
        expect(getGuestSolveCount()).toBe(1);
        expect(getGuestRemainingSolves()).toBe(4);
        expect(hasReachedGuestSolveCap()).toBe(false);

        incrementGuestSolveCount(); // 2
        incrementGuestSolveCount(); // 3
        incrementGuestSolveCount(); // 4
        expect(hasReachedGuestSolveCap()).toBe(false);

        incrementGuestSolveCount(); // 5
        expect(getGuestSolveCount()).toBe(5);
        expect(hasReachedGuestSolveCap()).toBe(true);
        expect(getGuestRemainingSolves()).toBe(0);
    });

    it('should allow setting solve count directly', () => {
        setGuestSolveCount(3);
        expect(getGuestSolveCount()).toBe(3);
        expect(getGuestRemainingSolves()).toBe(2);
    });

    it('should save and load guest canvas data from sessionStorage', () => {
        const dummyCanvas: LiveCanvasData = {
            elements: [
                {
                    kind: 'stroke',
                    id: 's-1',
                    tool: 'pen',
                    color: '#ffffff',
                    width: 3,
                    points: [{ x: 10, y: 20, timestamp: 100 }]
                }
            ],
            camera: { offsetX: 0, offsetY: 0, scale: 1 },
            dictOfVars: { x: '10' },
            results: [],
            loadedHistoryEntryId: null,
            updatedAt: Date.now()
        };

        saveGuestCanvasData(dummyCanvas);
        const loaded = loadGuestCanvasData();
        expect(loaded).toBeDefined();
        expect(loaded?.elements.length).toBe(1);
        expect(loaded?.dictOfVars?.x).toBe('10');

        clearGuestCanvasData();
        expect(loadGuestCanvasData()).toBeNull();
    });

    it('should save, load, and add guest history entries', () => {
        const entry1: HistoryEntry = {
            id: 'h-1',
            timestamp: 1000,
            canvasThumbnail: 'thumb1',
            canvasImage: 'img1',
            results: [],
            dictOfVars: {}
        };
        const entry2: HistoryEntry = {
            id: 'h-2',
            timestamp: 2000,
            canvasThumbnail: 'thumb2',
            canvasImage: 'img2',
            results: [],
            dictOfVars: {}
        };

        saveGuestHistory([entry1]);
        expect(loadGuestHistory()).toHaveLength(1);

        addGuestHistoryEntry(entry2);
        const loaded = loadGuestHistory();
        expect(loaded).toHaveLength(2);
        expect(loaded[0].id).toBe('h-2');

        clearGuestHistory();
        expect(loadGuestHistory()).toEqual([]);
    });

    it('should clear all guest session state on clearGuestSession', () => {
        setGuestSolveCount(4);
        saveGuestCanvasData({
            elements: [],
            camera: { offsetX: 0, offsetY: 0, scale: 1 },
            updatedAt: Date.now()
        });
        saveGuestHistory([
            {
                id: 'h-1',
                timestamp: 1000,
                canvasThumbnail: 't',
                canvasImage: 'i',
                results: [],
                dictOfVars: {}
            }
        ]);

        clearGuestSession();
        expect(getGuestSolveCount()).toBe(0);
        expect(loadGuestCanvasData()).toBeNull();
        expect(loadGuestHistory()).toEqual([]);
    });
});
