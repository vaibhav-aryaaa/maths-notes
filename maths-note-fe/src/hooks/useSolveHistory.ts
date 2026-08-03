import { useEffect, useState, useCallback } from 'react';
import type { GeneratedResult, DictOfVars } from '@/types';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import axios from 'axios';

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
    const [user, setUser] = useState<User | null>(null);
    const [jwt, setJwt] = useState<string | null>(null);

    const getApiHost = () => import.meta.env.VITE_API_URL || 'http://localhost:5001';

    // 1. Fetch from backend API
    const loadBackendHistory = useCallback(async (token: string) => {
        try {
            const apiHost = getApiHost();
            const response = await axios.get(`${apiHost}/history`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.data && Array.isArray(response.data.entries)) {
                setHistory(response.data.entries);
            }
        } catch (error) {
            console.error('Failed to load history from backend:', error);
        }
    }, []);

    // 2. Fetch from local IndexedDB
    const loadLocalHistory = useCallback(async () => {
        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result as HistoryEntry[];
                results.sort((a, b) => b.timestamp - a.timestamp);
                setHistory(results);
            };
        } catch (error) {
            console.error('Failed to load history from IndexedDB:', error);
        }
    }, []);

    // 3. Main loader routing
    const loadHistory = useCallback(async (token: string | null) => {
        if (token) {
            await loadBackendHistory(token);
        } else {
            await loadLocalHistory();
        }
    }, [loadBackendHistory, loadLocalHistory]);

    // 4. Sync IndexedDB to Backend
    const syncLocalHistoryToBackend = useCallback(async (token: string) => {
        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = async () => {
                const localEntries = request.result as HistoryEntry[];
                if (localEntries.length === 0) {
                    await loadBackendHistory(token);
                    return;
                }

                const apiHost = getApiHost();
                const response = await axios.post(`${apiHost}/history/sync`, {
                    entries: localEntries
                }, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.data && Array.isArray(response.data.entries)) {
                    setHistory(response.data.entries);
                }
            };
        } catch (error) {
            console.error('Failed to sync local history to backend:', error);
            await loadBackendHistory(token);
        }
    }, [loadBackendHistory]);

    // 5. Subscribe to Supabase Auth changes
    useEffect(() => {
        if (!supabase) {
            loadLocalHistory().then(() => setIsDbReady(true));
            return;
        }

        // Fetch initial session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session) {
                setUser(session.user);
                setJwt(session.access_token);
                await loadHistory(session.access_token);
            } else {
                await loadLocalHistory();
            }
            setIsDbReady(true);
        });

        // Set up subscription listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                setUser(session.user);
                setJwt(session.access_token);
                if (event === 'SIGNED_IN') {
                    await syncLocalHistoryToBackend(session.access_token);
                }
            } else {
                setUser(null);
                setJwt(null);
                await loadLocalHistory();
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [loadHistory, loadLocalHistory, syncLocalHistoryToBackend]);

    // 6. Save history entry
    const saveHistoryEntry = useCallback(async (
        canvas: HTMLCanvasElement,
        results: GeneratedResult[],
        dictOfVars: DictOfVars
    ) => {
        const canvasThumbnail = getCanvasThumbnail(canvas);
        const canvasImage = canvas.toDataURL('image/png');
        const entryId = crypto.randomUUID();
        const timestamp = Date.now();

        const entry: HistoryEntry = {
            id: entryId,
            timestamp,
            canvasThumbnail,
            canvasImage,
            results,
            dictOfVars
        };

        // Try backend write first if authenticated
        if (jwt) {
            try {
                const apiHost = getApiHost();
                await axios.post(`${apiHost}/history`, { entry }, {
                    headers: {
                        'Authorization': `Bearer ${jwt}`
                    }
                });
                await loadBackendHistory(jwt);
            } catch (error) {
                console.error('Failed to save history entry to backend, falling back to local only:', error);
            }
        }

        // Save to IndexedDB (guest mode or dual backup)
        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.put(entry);

            transaction.oncomplete = async () => {
                const readTx = db.transaction(STORE_NAME, 'readonly');
                const readStore = readTx.objectStore(STORE_NAME);
                const allReq = readStore.getAll();

                allReq.onsuccess = async () => {
                    const allEntries = allReq.result as HistoryEntry[];
                    if (allEntries.length > 50) {
                        allEntries.sort((a, b) => a.timestamp - b.timestamp);
                        const toDeleteCount = allEntries.length - 50;
                        const deleteTx = db.transaction(STORE_NAME, 'readwrite');
                        const deleteStore = deleteTx.objectStore(STORE_NAME);
                        for (let i = 0; i < toDeleteCount; i++) {
                            deleteStore.delete(allEntries[i].id);
                        }
                        deleteTx.oncomplete = () => {
                            if (!jwt) loadLocalHistory();
                        };
                    } else {
                        if (!jwt) loadLocalHistory();
                    }
                };
            };
        } catch (error) {
            console.error('Failed to save history entry locally:', error);
        }
    }, [jwt, loadBackendHistory, loadLocalHistory]);

    // 7. Delete single item
    const deleteHistoryItem = useCallback(async (id: string) => {
        if (jwt) {
            try {
                const apiHost = getApiHost();
                await axios.delete(`${apiHost}/history/${id}`, {
                    headers: {
                        'Authorization': `Bearer ${jwt}`
                    }
                });
                await loadBackendHistory(jwt);
            } catch (error) {
                console.error('Failed to delete history item from backend:', error);
            }
        }

        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(id);
            transaction.oncomplete = () => {
                if (!jwt) loadLocalHistory();
            };
        } catch (error) {
            console.error('Failed to delete history item locally:', error);
        }
    }, [jwt, loadBackendHistory, loadLocalHistory]);

    // 8. Clear all entries (Wipe/Purge)
    const clearHistory = useCallback(async () => {
        if (jwt) {
            try {
                const apiHost = getApiHost();
                await axios.delete(`${apiHost}/history/purge`, {
                    headers: {
                        'Authorization': `Bearer ${jwt}`
                    }
                });
                await loadBackendHistory(jwt);
            } catch (error) {
                console.error('Failed to purge backend history:', error);
            }
        }

        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.clear();
            transaction.oncomplete = () => {
                if (!jwt) loadLocalHistory();
            };
        } catch (error) {
            console.error('Failed to clear history locally:', error);
        }
    }, [jwt, loadBackendHistory, loadLocalHistory]);

    return {
        history,
        isDbReady,
        saveHistoryEntry,
        deleteHistoryItem,
        clearHistory,
        user,
        jwt,
        supabase
    };
}
