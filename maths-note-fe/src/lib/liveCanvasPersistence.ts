import type { CanvasElement, DictOfVars, GeneratedResult } from '@/types';

export interface LiveCanvasData {
    elements: CanvasElement[];
    camera: {
        offsetX: number;
        offsetY: number;
        scale: number;
    };
    dictOfVars?: DictOfVars;
    results?: GeneratedResult[];
    loadedHistoryEntryId?: string | null;
    updatedAt: number;
}

export const DB_NAME = 'SolveIQHistoryDB';
export const LIVE_CANVAS_STORE = 'live_canvas';
export const HISTORY_STORE = 'history';
export const DB_VERSION = 2;

const LIVE_CANVAS_KEY = 'current';

export function openDB(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            resolve(null);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HISTORY_STORE)) {
                db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(LIVE_CANVAS_STORE)) {
                db.createObjectStore(LIVE_CANVAS_STORE);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = (err) => {
            console.error('Failed to open IndexedDB for live canvas:', err);
            resolve(null);
        };
    });
}

export async function saveLiveCanvas(data: LiveCanvasData): Promise<void> {
    const db = await openDB();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(LIVE_CANVAS_STORE, 'readwrite');
            const store = transaction.objectStore(LIVE_CANVAS_STORE);
            store.put(data, LIVE_CANVAS_KEY);
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => {
                console.error('Failed to save live canvas to IndexedDB:', e);
                resolve();
            };
        } catch (e) {
            console.error('Error starting live canvas save transaction:', e);
            resolve();
        }
    });
}

export async function loadLiveCanvas(): Promise<LiveCanvasData | null> {
    const db = await openDB();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(LIVE_CANVAS_STORE, 'readonly');
            const store = transaction.objectStore(LIVE_CANVAS_STORE);
            const request = store.get(LIVE_CANVAS_KEY);

            request.onsuccess = () => {
                resolve((request.result as LiveCanvasData) || null);
            };
            request.onerror = (e) => {
                console.error('Failed to load live canvas from IndexedDB:', e);
                resolve(null);
            };
        } catch (e) {
            console.error('Error reading live canvas from IndexedDB:', e);
            resolve(null);
        }
    });
}

export async function clearLiveCanvas(): Promise<void> {
    const db = await openDB();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(LIVE_CANVAS_STORE, 'readwrite');
            const store = transaction.objectStore(LIVE_CANVAS_STORE);
            store.delete(LIVE_CANVAS_KEY);
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => {
                console.error('Failed to delete live canvas from IndexedDB:', e);
                resolve();
            };
        } catch (e) {
            console.error('Error clearing live canvas from IndexedDB:', e);
            resolve();
        }
    });
}
