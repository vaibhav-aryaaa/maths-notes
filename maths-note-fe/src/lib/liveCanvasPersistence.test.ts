import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    saveLiveCanvas,
    loadLiveCanvas,
    clearLiveCanvas,
    saveLocalCanvasMetadata,
    loadLocalCanvasesMetadata,
    deleteLocalCanvas,
    syncLiveCanvasToBackend,
    resolveLiveCanvasWithRemote,
    DEFAULT_CANVAS_ID,
    type LiveCanvasData,
    type LocalCanvasMetadata
} from './liveCanvasPersistence';
import * as canvasesApi from './canvasesApi';

describe('liveCanvasPersistence multi-canvas', () => {
    let mockDB: any;
    let mockLiveStore: any;
    let mockCanvasStore: any;

    beforeEach(() => {
        const liveMap = new Map<string, any>();
        const canvasMap = new Map<string, any>();

        mockLiveStore = {
            put: vi.fn((data: any, key: any) => {
                liveMap.set(key, data);
            }),
            get: vi.fn((key: any) => {
                const req: any = {};
                setTimeout(() => {
                    req.result = liveMap.get(key);
                    req.onsuccess?.();
                }, 0);
                return req;
            }),
            delete: vi.fn((key: any) => {
                liveMap.delete(key);
            })
        };

        mockCanvasStore = {
            put: vi.fn((data: any) => {
                canvasMap.set(data.id, data);
            }),
            get: vi.fn((key: any) => {
                const req: any = {};
                setTimeout(() => {
                    req.result = canvasMap.get(key);
                    req.onsuccess?.();
                }, 0);
                return req;
            }),
            getAll: vi.fn(() => {
                const req: any = {};
                setTimeout(() => {
                    req.result = Array.from(canvasMap.values());
                    req.onsuccess?.();
                }, 0);
                return req;
            }),
            delete: vi.fn((key: any) => {
                canvasMap.delete(key);
            })
        };

        mockDB = {
            objectStoreNames: {
                contains: vi.fn(() => true)
            },
            createObjectStore: vi.fn(),
            transaction: vi.fn((_stores: string | string[]) => {
                const tx: any = {
                    objectStore: vi.fn((name: string) => {
                        if (name === 'canvases') return mockCanvasStore;
                        return mockLiveStore;
                    }),
                    oncomplete: null,
                    onerror: null
                };
                setTimeout(() => {
                    tx.oncomplete?.();
                }, 0);
                return tx;
            })
        };

        const mockIndexedDB = {
            open: vi.fn(() => {
                const req: any = {};
                setTimeout(() => {
                    req.result = mockDB;
                    req.onsuccess?.();
                }, 0);
                return req;
            })
        };

        vi.stubGlobal('indexedDB', mockIndexedDB);
    });

    it('should save and load live canvas state for a specific canvasId', async () => {
        const liveData: LiveCanvasData = {
            elements: [
                {
                    kind: 'stroke',
                    id: 'stroke-1',
                    tool: 'pen',
                    color: '#fff',
                    width: 3,
                    points: [{ x: 10, y: 10, timestamp: 12345 }]
                }
            ],
            camera: { offsetX: 100, offsetY: 200, scale: 1.5 },
            dictOfVars: { x: '5' },
            results: [{ id: 'res-1', solutions: [{ expression: 'x+2', answer: '7' }] }],
            loadedHistoryEntryId: 'hist-1',
            updatedAt: 1000
        };

        await saveLiveCanvas('canvas-123', liveData);
        expect(mockLiveStore.put).toHaveBeenCalledWith(liveData, 'canvas-123');

        const loaded = await loadLiveCanvas('canvas-123');
        expect(loaded).toEqual(liveData);
        expect(mockLiveStore.get).toHaveBeenCalledWith('canvas-123');
    });

    it('should maintain independent state across multiple canvases', async () => {
        const canvas1Data: LiveCanvasData = {
            elements: [],
            camera: { offsetX: 0, offsetY: 0, scale: 1 },
            updatedAt: 111
        };

        const canvas2Data: LiveCanvasData = {
            elements: [],
            camera: { offsetX: 50, offsetY: 50, scale: 2 },
            updatedAt: 222
        };

        await saveLiveCanvas('canvas-1', canvas1Data);
        await saveLiveCanvas('canvas-2', canvas2Data);

        const loaded1 = await loadLiveCanvas('canvas-1');
        const loaded2 = await loadLiveCanvas('canvas-2');

        expect(loaded1).toEqual(canvas1Data);
        expect(loaded2).toEqual(canvas2Data);
    });

    it('should default to DEFAULT_CANVAS_ID when no canvasId is provided', async () => {
        const defaultData: LiveCanvasData = {
            elements: [],
            camera: { offsetX: 0, offsetY: 0, scale: 1 },
            updatedAt: 333
        };

        await saveLiveCanvas(undefined, defaultData);
        expect(mockLiveStore.put).toHaveBeenCalledWith(defaultData, DEFAULT_CANVAS_ID);

        const loaded = await loadLiveCanvas();
        expect(loaded).toEqual(defaultData);
        expect(mockLiveStore.get).toHaveBeenCalledWith(DEFAULT_CANVAS_ID);
    });

    it('should clear only the targeted canvasId from IndexedDB', async () => {
        const canvas1Data: LiveCanvasData = { elements: [], camera: { offsetX: 0, offsetY: 0, scale: 1 }, updatedAt: 1 };
        const canvas2Data: LiveCanvasData = { elements: [], camera: { offsetX: 0, offsetY: 0, scale: 1 }, updatedAt: 2 };

        await saveLiveCanvas('canvas-1', canvas1Data);
        await saveLiveCanvas('canvas-2', canvas2Data);

        await clearLiveCanvas('canvas-1');

        expect(mockLiveStore.delete).toHaveBeenCalledWith('canvas-1');
        const loaded1 = await loadLiveCanvas('canvas-1');
        const loaded2 = await loadLiveCanvas('canvas-2');

        expect(loaded1).toBeNull();
        expect(loaded2).toEqual(canvas2Data);
    });

    it('should manage local canvases metadata store', async () => {
        const metadata: LocalCanvasMetadata = {
            id: 'canvas-abc',
            name: 'Linear Algebra',
            folder_id: null,
            thumbnail: 'thumb-data',
            created_at: 1000,
            updatedAt: 2000
        };

        await saveLocalCanvasMetadata(metadata);
        expect(mockCanvasStore.put).toHaveBeenCalledWith(metadata);

        const list = await loadLocalCanvasesMetadata();
        expect(list).toEqual([metadata]);

        await deleteLocalCanvas('canvas-abc');
        expect(mockCanvasStore.delete).toHaveBeenCalledWith('canvas-abc');
        expect(mockLiveStore.delete).toHaveBeenCalledWith('canvas-abc');
    });

    it('should handle indexedDB unavailability gracefully without crashing', async () => {
        vi.stubGlobal('indexedDB', undefined as any);

        const loaded = await loadLiveCanvas('canvas-xyz');
        expect(loaded).toBeNull();

        await expect(saveLiveCanvas('canvas-xyz', {
            elements: [],
            camera: { offsetX: 0, offsetY: 0, scale: 1 },
            updatedAt: 123
        })).resolves.toBeUndefined();

        await expect(clearLiveCanvas('canvas-xyz')).resolves.toBeUndefined();
        await expect(loadLocalCanvasesMetadata()).resolves.toEqual([]);
        await expect(deleteLocalCanvas('canvas-xyz')).resolves.toBeUndefined();
    });

    describe('resolveLiveCanvasWithRemote (Timestamp-based conflict resolution)', () => {
        it('should prefer remote canvas if remote updated_at is newer than local', () => {
            const localData: LiveCanvasData = {
                elements: [{ id: 'local-stroke', kind: 'stroke', tool: 'pen', color: '#fff', width: 2, points: [] }],
                camera: { offsetX: 0, offsetY: 0, scale: 1 },
                updatedAt: 1000
            };

            const remoteDetail: canvasesApi.CanvasDetail = {
                id: 'canvas-123',
                name: 'Remote Notebook',
                elements: [{ id: 'remote-stroke', kind: 'stroke', tool: 'marker', color: '#ff0000', width: 4, points: [] }],
                updated_at: new Date(2000).toISOString()
            };

            const result = resolveLiveCanvasWithRemote(localData, remoteDetail);
            expect(result.source).toBe('remote');
            expect(result.shouldSaveLocal).toBe(true);
            expect(result.shouldPushRemote).toBe(false);
            expect(result.data?.elements).toEqual(remoteDetail.elements);
            expect(result.data?.updatedAt).toBe(2000);
        });

        it('should prefer local canvas if local updatedAt is newer than remote', () => {
            const localData: LiveCanvasData = {
                elements: [{ id: 'newer-local-stroke', kind: 'stroke', tool: 'pen', color: '#fff', width: 2, points: [] }],
                camera: { offsetX: 10, offsetY: 20, scale: 1 },
                updatedAt: 5000
            };

            const remoteDetail: canvasesApi.CanvasDetail = {
                id: 'canvas-123',
                name: 'Remote Notebook',
                elements: [{ id: 'older-remote-stroke', kind: 'stroke', tool: 'pen', color: '#000', width: 2, points: [] }],
                updated_at: new Date(3000).toISOString()
            };

            const result = resolveLiveCanvasWithRemote(localData, remoteDetail);
            expect(result.source).toBe('local');
            expect(result.shouldSaveLocal).toBe(false);
            expect(result.shouldPushRemote).toBe(true);
            expect(result.data).toEqual(localData);
        });

        it('should pick remote if local data is null and remote has data', () => {
            const remoteDetail: canvasesApi.CanvasDetail = {
                id: 'canvas-123',
                name: 'New Device Notebook',
                elements: [{ id: 'remote-1', kind: 'stroke', tool: 'pen', color: '#fff', width: 2, points: [] }],
                updated_at: new Date(1500).toISOString()
            };

            const result = resolveLiveCanvasWithRemote(null, remoteDetail);
            expect(result.source).toBe('remote');
            expect(result.shouldSaveLocal).toBe(true);
            expect(result.data?.elements).toEqual(remoteDetail.elements);
        });

        it('should return empty source when both local and remote are null', () => {
            const result = resolveLiveCanvasWithRemote(null, null);
            expect(result.source).toBe('empty');
            expect(result.data).toBeNull();
            expect(result.shouldSaveLocal).toBe(false);
            expect(result.shouldPushRemote).toBe(false);
        });
    });

    describe('syncLiveCanvasToBackend', () => {
        it('should call updateCanvas with elements when canvasId is valid', async () => {
            const spyUpdate = vi.spyOn(canvasesApi, 'updateCanvas').mockResolvedValue({
                id: 'c-1',
                name: 'Test',
                elements: []
            } as any);

            const liveData: LiveCanvasData = {
                elements: [{ id: 's-1', kind: 'stroke', tool: 'pen', color: '#fff', width: 2, points: [] }],
                camera: { offsetX: 0, offsetY: 0, scale: 1 },
                updatedAt: 1234
            };

            await syncLiveCanvasToBackend('c-1', liveData, 'mock-token');
            expect(spyUpdate).toHaveBeenCalledWith('c-1', {
                elements: {
                    elements: liveData.elements,
                    camera: liveData.camera,
                    dictOfVars: liveData.dictOfVars,
                    results: liveData.results,
                    loadedHistoryEntryId: liveData.loadedHistoryEntryId
                }
            }, 'mock-token');

            spyUpdate.mockRestore();
        });

        it('should not call updateCanvas when canvasId is default or empty', async () => {
            const spyUpdate = vi.spyOn(canvasesApi, 'updateCanvas').mockResolvedValue({} as any);

            const liveData: LiveCanvasData = {
                elements: [],
                camera: { offsetX: 0, offsetY: 0, scale: 1 },
                updatedAt: 1234
            };

            await syncLiveCanvasToBackend(DEFAULT_CANVAS_ID, liveData);
            expect(spyUpdate).not.toHaveBeenCalled();

            await syncLiveCanvasToBackend('', liveData);
            expect(spyUpdate).not.toHaveBeenCalled();

            spyUpdate.mockRestore();
        });

        it('should degrade gracefully and not throw on backend failure', async () => {
            const spyUpdate = vi.spyOn(canvasesApi, 'updateCanvas').mockRejectedValue(new Error('Network Offline'));
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const liveData: LiveCanvasData = {
                elements: [],
                camera: { offsetX: 0, offsetY: 0, scale: 1 },
                updatedAt: 1234
            };

            await expect(syncLiveCanvasToBackend('c-1', liveData)).resolves.toBeUndefined();
            expect(warnSpy).toHaveBeenCalled();

            spyUpdate.mockRestore();
            warnSpy.mockRestore();
        });
    });
});

