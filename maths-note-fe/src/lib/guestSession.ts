import type { LiveCanvasData } from '@/lib/liveCanvasPersistence';
import type { HistoryEntry } from '@/hooks/useSolveHistory';

export const GUEST_SOLVE_COUNT_KEY = 'guest_solve_count';
export const GUEST_CANVAS_DATA_KEY = 'guest_canvas_data';
export const GUEST_HISTORY_KEY = 'guest_history';
export const GUEST_SOLVE_CAP = 5;

/**
 * Returns current guest solve count from sessionStorage.
 */
export function getGuestSolveCount(): number {
    if (typeof window === 'undefined') return 0;
    try {
        const val = sessionStorage.getItem(GUEST_SOLVE_COUNT_KEY);
        if (!val) return 0;
        const count = parseInt(val, 10);
        return isNaN(count) ? 0 : Math.max(0, count);
    } catch {
        return 0;
    }
}

/**
 * Increments guest solve count by 1 and returns the updated count.
 */
export function incrementGuestSolveCount(): number {
    if (typeof window === 'undefined') return 0;
    try {
        const current = getGuestSolveCount();
        const next = current + 1;
        sessionStorage.setItem(GUEST_SOLVE_COUNT_KEY, next.toString());
        return next;
    } catch {
        return 0;
    }
}

/**
 * Checks if the guest has reached or exceeded the free solve cap (5).
 */
export function hasReachedGuestSolveCap(): boolean {
    return getGuestSolveCount() >= GUEST_SOLVE_CAP;
}

/**
 * Returns remaining free solves for the guest session.
 */
export function getGuestRemainingSolves(): number {
    return Math.max(0, GUEST_SOLVE_CAP - getGuestSolveCount());
}

/**
 * Sets the guest solve count explicitly (useful for testing or resets).
 */
export function setGuestSolveCount(count: number): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(GUEST_SOLVE_COUNT_KEY, Math.max(0, count).toString());
    } catch (e) {
        console.debug('Failed to set guest solve count in sessionStorage:', e);
    }
}

/**
 * Saves guest live canvas state (elements, camera, dictOfVars, results) to sessionStorage only.
 */
export function saveGuestCanvasData(data: LiveCanvasData): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(GUEST_CANVAS_DATA_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save guest canvas to sessionStorage:', e);
    }
}

/**
 * Loads guest live canvas state from sessionStorage.
 */
export function loadGuestCanvasData(): LiveCanvasData | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(GUEST_CANVAS_DATA_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as LiveCanvasData;
    } catch (e) {
        console.warn('Failed to load guest canvas from sessionStorage:', e);
        return null;
    }
}

/**
 * Clears guest canvas data from sessionStorage.
 */
export function clearGuestCanvasData(): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(GUEST_CANVAS_DATA_KEY);
    } catch (e) {
        console.debug('Failed to clear guest canvas from sessionStorage:', e);
    }
}

/**
 * Saves guest history entries to sessionStorage.
 */
export function saveGuestHistory(entries: HistoryEntry[]): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(entries));
    } catch (e) {
        console.warn('Failed to save guest history to sessionStorage:', e);
    }
}

/**
 * Loads guest history entries from sessionStorage.
 */
export function loadGuestHistory(): HistoryEntry[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = sessionStorage.getItem(GUEST_HISTORY_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as HistoryEntry[];
    } catch (e) {
        console.warn('Failed to load guest history from sessionStorage:', e);
        return [];
    }
}

/**
 * Prepends a new history entry to guest history in sessionStorage.
 */
export function addGuestHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
    const existing = loadGuestHistory();
    const updated = [entry, ...existing.filter(e => e.id !== entry.id)];
    saveGuestHistory(updated);
    return updated;
}

/**
 * Clears guest history entries from sessionStorage.
 */
export function clearGuestHistory(): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(GUEST_HISTORY_KEY);
    } catch (e) {
        console.debug('Failed to clear guest history from sessionStorage:', e);
    }
}

/**
 * Clears all guest state from sessionStorage (canvas data, solve counter, solve history).
 */
export function clearGuestSession(): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(GUEST_CANVAS_DATA_KEY);
        sessionStorage.removeItem(GUEST_SOLVE_COUNT_KEY);
        sessionStorage.removeItem(GUEST_HISTORY_KEY);
    } catch (e) {
        console.debug('Failed to clear guest session from sessionStorage:', e);
    }
}
