import type { CanvasElement, DictOfVars, GeneratedResult } from '@/types';

export interface LiveCanvasData {
    id?: string;
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

export interface LocalCanvasMetadata {
    id: string;
    name: string;
    folder_id?: string | null;
    thumbnail?: string | null;
    created_at?: string | number;
    updatedAt: number;
}

export const DB_NAME = 'SolveIQHistoryDB';
export const LIVE_CANVAS_STORE = 'live_canvas';
export const HISTORY_STORE = 'history';
export const CANVASES_STORE = 'canvases';
export const DB_VERSION = 3;

export const DEFAULT_CANVAS_ID = 'default';

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
            if (!db.objectStoreNames.contains(CANVASES_STORE)) {
                db.createObjectStore(CANVASES_STORE, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = (err) => {
            console.error('Failed to open IndexedDB for live canvas:', err);
            resolve(null);
        };
    });
}

export async function saveLiveCanvas(
    canvasId: string = DEFAULT_CANVAS_ID,
    data: LiveCanvasData,
    metadataUpdates?: Partial<LocalCanvasMetadata>
): Promise<void> {
    const db = await openDB();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const storesToOpen = [LIVE_CANVAS_STORE];
            if (db.objectStoreNames.contains(CANVASES_STORE)) {
                storesToOpen.push(CANVASES_STORE);
            }
            const transaction = db.transaction(storesToOpen, 'readwrite');
            const liveStore = transaction.objectStore(LIVE_CANVAS_STORE);
            liveStore.put(data, canvasId);

            if (storesToOpen.includes(CANVASES_STORE)) {
                const canvasStore = transaction.objectStore(CANVASES_STORE);
                const getReq = canvasStore.get(canvasId);
                getReq.onsuccess = () => {
                    const existing: LocalCanvasMetadata = getReq.result || {
                        id: canvasId,
                        name: 'Untitled Canvas',
                        folder_id: null,
                        thumbnail: null,
                        created_at: Date.now(),
                        updatedAt: data.updatedAt
                    };
                    const updated: LocalCanvasMetadata = {
                        ...existing,
                        ...metadataUpdates,
                        id: canvasId,
                        updatedAt: data.updatedAt
                    };
                    canvasStore.put(updated);
                };
            }

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

export async function loadLiveCanvas(canvasId: string = DEFAULT_CANVAS_ID): Promise<LiveCanvasData | null> {
    const db = await openDB();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(LIVE_CANVAS_STORE, 'readonly');
            const store = transaction.objectStore(LIVE_CANVAS_STORE);
            const request = store.get(canvasId);

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

export async function clearLiveCanvas(canvasId: string = DEFAULT_CANVAS_ID): Promise<void> {
    const db = await openDB();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(LIVE_CANVAS_STORE, 'readwrite');
            const store = transaction.objectStore(LIVE_CANVAS_STORE);
            store.delete(canvasId);
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

export async function saveLocalCanvasMetadata(metadata: LocalCanvasMetadata): Promise<void> {
    const db = await openDB();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(CANVASES_STORE, 'readwrite');
            const store = transaction.objectStore(CANVASES_STORE);
            store.put(metadata);
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => {
                console.error('Failed to save local canvas metadata:', e);
                resolve();
            };
        } catch (e) {
            console.error('Error saving local canvas metadata:', e);
            resolve();
        }
    });
}

export async function loadLocalCanvasesMetadata(): Promise<LocalCanvasMetadata[]> {
    const db = await openDB();
    if (!db) return [];

    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(CANVASES_STORE, 'readonly');
            const store = transaction.objectStore(CANVASES_STORE);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve((request.result as LocalCanvasMetadata[]) || []);
            };
            request.onerror = (e) => {
                console.error('Failed to load local canvases metadata:', e);
                resolve([]);
            };
        } catch (e) {
            console.error('Error reading local canvases metadata:', e);
            resolve([]);
        }
    });
}

export async function deleteLocalCanvas(canvasId: string): Promise<void> {
    const db = await openDB();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const storesToOpen = [LIVE_CANVAS_STORE];
            if (db.objectStoreNames.contains(CANVASES_STORE)) {
                storesToOpen.push(CANVASES_STORE);
            }
            const transaction = db.transaction(storesToOpen, 'readwrite');
            transaction.objectStore(LIVE_CANVAS_STORE).delete(canvasId);
            if (storesToOpen.includes(CANVASES_STORE)) {
                transaction.objectStore(CANVASES_STORE).delete(canvasId);
            }
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => {
                console.error('Failed to delete local canvas:', e);
                resolve();
            };
        } catch (e) {
            console.error('Error deleting local canvas:', e);
            resolve();
        }
    });
}
