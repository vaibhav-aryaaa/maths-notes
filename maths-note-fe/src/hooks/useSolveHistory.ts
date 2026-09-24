import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { GeneratedResult, DictOfVars } from '@/types';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import axios from 'axios';
import { openDB, HISTORY_STORE as STORE_NAME, DEFAULT_CANVAS_ID, saveLiveCanvas } from '@/lib/liveCanvasPersistence';
import {
    loadGuestHistory,
    saveGuestHistory,
    addGuestHistoryEntry,
    clearGuestHistory,
    loadGuestCanvasData,
    clearGuestCanvasData,
    clearGuestSession
} from '@/lib/guestSession';
import { createCanvas } from '@/lib/canvasesApi';
import { notifications } from '@mantine/notifications';

export interface HistoryEntry {
    id: string;
    timestamp: number;
    canvasThumbnail: string; // Downscaled reference image
    canvasImage: string;     // Full-scale image to restore canvas
    results: GeneratedResult[];
    dictOfVars: DictOfVars;
    strokes?: any[];
    elements?: any[];
    canvas_id?: string | null;
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

const getApiHost = () => import.meta.env.VITE_API_URL || 'http://localhost:5001';
const getAppKey = () => import.meta.env.VITE_APP_KEY || import.meta.env.VITE_APP_SECRET || '';

const getAuthHeaders = (token: string) => {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`
    };
    const appKey = getAppKey();
    if (appKey) headers['X-App-Key'] = appKey;
    return headers;
};

export function useSolveHistory(activeCanvasId: string = DEFAULT_CANVAS_ID) {
    const [allHistory, setAllHistory] = useState<HistoryEntry[]>([]);
    const [showAllNotebooks, setShowAllNotebooks] = useState(false);
    const [isDbReady, setIsDbReady] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [jwt, setJwt] = useState<string | null>(null);

    // 1. Fetch from backend API
    const loadBackendHistory = useCallback(async (token: string) => {
        try {
            const apiHost = getApiHost();
            const response = await axios.get(`${apiHost}/history`, {
                headers: getAuthHeaders(token)
            });
            if (response.data && Array.isArray(response.data.entries)) {
                const entries = response.data.entries as HistoryEntry[];
                
                // Write backend entries to local IndexedDB
                const db = await openDB();
                if (db) {
                    const transaction = db.transaction(STORE_NAME, 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    entries.forEach(entry => store.put(entry));
                }

                setAllHistory(entries.map((entry: HistoryEntry) => {
                    const { canvasImage: _canvasImage, ...rest } = entry;
                    return rest as HistoryEntry;
                }));
            }
        } catch (error) {
            console.error('Failed to load history from backend:', error);
        }
    }, []);

    // 2. Fetch history (sessionStorage for guest, IndexedDB for signed in)
    const loadLocalHistory = useCallback(async (currentUser?: User | null) => {
        if (!currentUser) {
            const guestEntries = loadGuestHistory();
            setAllHistory(guestEntries.map((entry: HistoryEntry) => {
                const { canvasImage: _canvasImage, ...rest } = entry;
                return rest as HistoryEntry;
            }));
            return;
        }

        const db = await openDB();
        if (!db) return;

        try {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result as HistoryEntry[];
                results.sort((a, b) => b.timestamp - a.timestamp);
                setAllHistory(results.map((entry: HistoryEntry) => {
                    const { canvasImage: _canvasImage, ...rest } = entry;
                    return rest as HistoryEntry;
                }));
            };
        } catch (error) {
            console.error('Failed to load history from IndexedDB:', error);
        }
    }, []);

    // 3. Main loader routing
    const loadHistory = useCallback(async (token: string | null, currentUser?: User | null) => {
        if (token) {
            await loadBackendHistory(token);
        } else {
            await loadLocalHistory(currentUser);
        }
    }, [loadBackendHistory, loadLocalHistory]);

    // 4. Migrate guest data to user account on sign in / sign up
    const migrateGuestDataToUser = useCallback(async (token: string, _authenticatedUser: User) => {
        let hasMigratedAnything = false;
        try {
            const guestCanvas = loadGuestCanvasData();
            const guestHistory = loadGuestHistory();

            // 4a. Migrate guest canvas into user's first notebook / active canvas
            if (guestCanvas && ((guestCanvas.elements && guestCanvas.elements.length > 0) || (guestCanvas.results && guestCanvas.results.length > 0))) {
                await saveLiveCanvas(activeCanvasId || DEFAULT_CANVAS_ID, guestCanvas, {
                    name: 'First Notebook'
                });

                try {
                    await createCanvas({
                        name: 'First Notebook',
                        elements: guestCanvas.elements
                    }, token);
                } catch (e) {
                    console.warn('Backend canvas creation on migration deferred/failed:', e);
                }

                clearGuestCanvasData();
                hasMigratedAnything = true;
            }

            // 4b. Migrate guest history entries to backend and IndexedDB
            if (guestHistory.length > 0) {
                const apiHost = getApiHost();
                try {
                    await axios.post(`${apiHost}/history/sync`, {
                        entries: guestHistory
                    }, {
                        headers: getAuthHeaders(token)
                    });
                } catch (e) {
                    console.warn('Backend history sync failed:', e);
                }

                const db = await openDB();
                if (db) {
                    const transaction = db.transaction(STORE_NAME, 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    guestHistory.forEach(entry => store.put(entry));
                }

                clearGuestHistory();
                hasMigratedAnything = true;
            }

            clearGuestSession();

            if (hasMigratedAnything) {
                notifications.show({
                    title: 'Workspace Migrated',
                    message: 'Your guest whiteboard and history have been saved to your account!',
                    color: 'teal',
                    autoClose: 6000
                });
            }

            await loadBackendHistory(token);
        } catch (error) {
            console.error('Failed to migrate guest session data to account:', error);
            await loadBackendHistory(token);
        }
    }, [activeCanvasId, loadBackendHistory]);

    const loadHistoryRef = useRef(loadHistory);
    const loadLocalHistoryRef = useRef(loadLocalHistory);
    const migrateGuestDataToUserRef = useRef(migrateGuestDataToUser);

    useEffect(() => {
        loadHistoryRef.current = loadHistory;
        loadLocalHistoryRef.current = loadLocalHistory;
        migrateGuestDataToUserRef.current = migrateGuestDataToUser;
    });

    // 5. Subscribe to Supabase Auth changes (runs ONCE on mount)
    useEffect(() => {
        let isMounted = true;
        if (!supabase) {
            Promise.resolve().then(async () => {
                await loadLocalHistoryRef.current(null);
                if (isMounted) setIsDbReady(true);
            });
            return;
        }

        // Fetch initial session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (!isMounted) return;
            if (session) {
                setUser(session.user);
                setJwt(session.access_token);
                await loadHistoryRef.current(session.access_token, session.user);
            } else {
                setUser(null);
                setJwt(null);
                await loadLocalHistoryRef.current(null);
            }
            setIsDbReady(true);
        });

        // Set up subscription listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;
            if (session) {
                const isNewSignIn = event === 'SIGNED_IN' || event === 'USER_UPDATED';
                setUser(session.user);
                setJwt(session.access_token);
                if (isNewSignIn) {
                    await migrateGuestDataToUserRef.current(session.access_token, session.user);
                } else {
                    await loadHistoryRef.current(session.access_token, session.user);
                }
            } else {
                setUser(null);
                setJwt(null);
                await loadLocalHistoryRef.current(null);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // 6. Save history entry
    const saveHistoryEntry = useCallback(async (
        canvas: HTMLCanvasElement,
        results: GeneratedResult[],
        dictOfVars: DictOfVars,
        elements?: any[],
        canvasIdOverride?: string
    ) => {
        const canvasThumbnail = getCanvasThumbnail(canvas);
        const canvasImage = canvas.toDataURL('image/png');
        const entryId = crypto.randomUUID();
        const timestamp = Date.now();
        const canvas_id = canvasIdOverride || activeCanvasId;

        const entry: HistoryEntry = {
            id: entryId,
            timestamp,
            canvasThumbnail,
            canvasImage,
            results,
            dictOfVars,
            elements,
            canvas_id
        };

        // Guest Mode: Store exclusively in sessionStorage, skip backend and IndexedDB
        if (!user) {
            addGuestHistoryEntry(entry);
            loadLocalHistory(null);
            return;
        }

        // Authenticated: Try backend write
        if (jwt) {
            try {
                const apiHost = getApiHost();
                await axios.post(`${apiHost}/history`, { entry }, {
                    headers: getAuthHeaders(jwt)
                });
                await loadBackendHistory(jwt);
            } catch (error) {
                console.error('Failed to save history entry to backend, falling back to local only:', error);
            }
        }

        // Authenticated: Save to IndexedDB
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
                            if (!jwt) loadLocalHistory(user);
                        };
                    } else {
                        if (!jwt) loadLocalHistory(user);
                    }
                };
            };
        } catch (error) {
            console.error('Failed to save history entry locally:', error);
        }
    }, [user, jwt, activeCanvasId, loadBackendHistory, loadLocalHistory]);

    // 7. Delete single item
    const deleteHistoryItem = useCallback(async (id: string) => {
        if (!user) {
            const remaining = loadGuestHistory().filter(e => e.id !== id);
            saveGuestHistory(remaining);
            loadLocalHistory(null);
            return;
        }

        if (jwt) {
            try {
                const apiHost = getApiHost();
                await axios.delete(`${apiHost}/history/${id}`, {
                    headers: getAuthHeaders(jwt)
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
                if (!jwt) loadLocalHistory(user);
            };
        } catch (error) {
            console.error('Failed to delete history item locally:', error);
        }
    }, [user, jwt, loadBackendHistory, loadLocalHistory]);

    // 8. Clear all entries (Wipe/Purge)
    const clearHistory = useCallback(async () => {
        if (!user) {
            clearGuestHistory();
            loadLocalHistory(null);
            return;
        }

        if (jwt) {
            try {
                const apiHost = getApiHost();
                await axios.delete(`${apiHost}/history/purge`, {
                    headers: getAuthHeaders(jwt)
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
                if (!jwt) loadLocalHistory(user);
            };
        } catch (error) {
            console.error('Failed to clear history locally:', error);
        }
    }, [user, jwt, loadBackendHistory, loadLocalHistory]);

    const getHistoryEntryImage = useCallback(async (id: string): Promise<string> => {
        if (!user) {
            const entry = loadGuestHistory().find(e => e.id === id);
            return entry?.canvasImage || '';
        }

        const db = await openDB();
        if (!db) return '';
        return new Promise((resolve) => {
            try {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(id);
                request.onsuccess = () => {
                    const entry = request.result as HistoryEntry;
                    resolve(entry?.canvasImage || '');
                };
                request.onerror = () => resolve('');
            } catch (e) {
                console.error('Failed to get history image from IndexedDB:', e);
                resolve('');
            }
        });
    }, [user]);

    // Filter history to current notebook by default, or all notebooks if toggled
    const history = useMemo(() => {
        if (showAllNotebooks) {
            return allHistory;
        }
        return allHistory.filter(entry => !entry.canvas_id || entry.canvas_id === activeCanvasId);
    }, [allHistory, showAllNotebooks, activeCanvasId]);

    return {
        history,
        allHistory,
        showAllNotebooks,
        setShowAllNotebooks,
        isDbReady,
        saveHistoryEntry,
        deleteHistoryItem,
        clearHistory,
        getHistoryEntryImage,
        user,
        jwt,
        supabase
    };
}
