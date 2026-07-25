import { useEffect, useState, useCallback } from 'react';
import type { GeneratedResult, DictOfVars } from '@/types';

export interface HistoryEntry {
    id: string;
    timestamp: number;
    canvasThumbnail: string; // Downscaled reference image
    canvasImage: string;     // Full-scale image to restore canvas
    results: GeneratedResult[];
    dictOfVars: DictOfVars;
}

const DB_NAME = 'SolveIQHistoryDB';
const STORE_NAME = 'history';
const DB_VERSION = 1;

// Native IndexedDB Promise Wrapper
function openDB(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            resolve(null);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

function getCanvasThumbnail(canvas: HTMLCanvasElement): string {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return '';
    
    // Scale height to 120px to save space in IndexedDB
    const targetHeight = 120;
    const scale = targetHeight / canvas.height;
    tempCanvas.width = canvas.width * scale;
    tempCanvas.height = targetHeight;
    
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
    
    return tempCanvas.toDataURL('image/jpeg', 0.6);
}

export function useSolveHistory() {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [isDbReady, setIsDbReady] = useState(false);

    // Load all history entries
    const loadHistory = useCallback(async () => {
        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(transaction.objectStoreNames[0]);
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result as HistoryEntry[];
                // Sort by timestamp descending
                results.sort((a, b) => b.timestamp - a.timestamp);
                setHistory(results);
            };
        } catch (error) {
            console.error('Failed to load history from IndexedDB:', error);
        }
    }, []);

    useEffect(() => {
        loadHistory().then(() => setIsDbReady(true));
    }, [loadHistory]);

    // Save history entry with a capacity cap of 50
    const saveHistoryEntry = useCallback(async (
        canvas: HTMLCanvasElement,
        results: GeneratedResult[],
        dictOfVars: DictOfVars
    ) => {
        const db = await openDB();
        if (!db) return;

        try {
            const canvasThumbnail = getCanvasThumbnail(canvas);
            const canvasImage = canvas.toDataURL('image/png');

            const entry: HistoryEntry = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                canvasThumbnail,
                canvasImage,
                results,
                dictOfVars
            };

            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.put(entry);

            transaction.oncomplete = async () => {
                // Fetch all to enforce cap
                const readTx = db.transaction(STORE_NAME, 'readonly');
                const readStore = readTx.objectStore(STORE_NAME);
                const allReq = readStore.getAll();

                allReq.onsuccess = async () => {
                    const allEntries = allReq.result as HistoryEntry[];
                    if (allEntries.length > 50) {
                        // Sort by timestamp ascending (oldest first)
                        allEntries.sort((a, b) => a.timestamp - b.timestamp);
                        const toDeleteCount = allEntries.length - 50;
                        const deleteTx = db.transaction(STORE_NAME, 'readwrite');
                        const deleteStore = deleteTx.objectStore(STORE_NAME);
                        
                        for (let i = 0; i < toDeleteCount; i++) {
                            deleteStore.delete(allEntries[i].id);
                        }
                        
                        deleteTx.oncomplete = () => {
                            loadHistory();
                        };
                    } else {
                        loadHistory();
                    }
                };
            };
        } catch (error) {
            console.error('Failed to save history entry:', error);
        }
    }, [loadHistory]);

    // Delete a single history item
    const deleteHistoryItem = useCallback(async (id: string) => {
        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(id);

            transaction.oncomplete = () => {
                loadHistory();
            };
        } catch (error) {
            console.error('Failed to delete history item:', error);
        }
    }, [loadHistory]);

    // Clear all history
    const clearHistory = useCallback(async () => {
        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.clear();

            transaction.oncomplete = () => {
                loadHistory();
            };
        } catch (error) {
            console.error('Failed to clear history database:', error);
        }
    }, [loadHistory]);

    return {
        history,
        isDbReady,
        saveHistoryEntry,
        deleteHistoryItem,
        clearHistory
    };
}
