import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveLiveCanvas, loadLiveCanvas, clearLiveCanvas, type LiveCanvasData } from './liveCanvasPersistence';

describe('liveCanvasPersistence', () => {
    let mockDB: any;
    let mockStore: any;

    beforeEach(() => {
        mockStore = {
            put: vi.fn((_data: any, _key: any) => ({})),
            get: vi.fn((_key: any) => {
                const req: any = {};
                setTimeout(() => {
                    req.result = undefined;
                    req.onsuccess?.();
                }, 0);
                return req;
            }),
            delete: vi.fn((_key: any) => ({}))
        };

        mockDB = {
            objectStoreNames: {
                contains: vi.fn(() => true)
            },
            createObjectStore: vi.fn(),
            transaction: vi.fn(() => {
                const tx: any = {
                    objectStore: vi.fn(() => mockStore),
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

    it('should save live canvas state into IndexedDB', async () => {
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
            updatedAt: Date.now()
        };

        await saveLiveCanvas(liveData);

        expect(mockDB.transaction).toHaveBeenCalledWith('live_canvas', 'readwrite');
        expect(mockStore.put).toHaveBeenCalledWith(liveData, 'current');
    });

    it('should load live canvas state from IndexedDB', async () => {
        const mockData: LiveCanvasData = {
            elements: [],
            camera: { offsetX: 0, offsetY: 0, scale: 1 },
            updatedAt: 123456
        };

        mockStore.get = vi.fn(() => {
            const req: any = {};
            setTimeout(() => {
                req.result = mockData;
                req.onsuccess?.();
            }, 0);
            return req;
        });

        const loaded = await loadLiveCanvas();
        expect(loaded).toEqual(mockData);
        expect(mockStore.get).toHaveBeenCalledWith('current');
    });

    it('should clear live canvas state from IndexedDB', async () => {
        await clearLiveCanvas();
        expect(mockDB.transaction).toHaveBeenCalledWith('live_canvas', 'readwrite');
        expect(mockStore.delete).toHaveBeenCalledWith('current');
    });

    it('should handle indexedDB unavailability gracefully', async () => {
        vi.stubGlobal('indexedDB', undefined as any);

        const loaded = await loadLiveCanvas();
        expect(loaded).toBeNull();

        await expect(saveLiveCanvas({
            elements: [],
            camera: { offsetX: 0, offsetY: 0, scale: 1 },
            updatedAt: 123
        })).resolves.toBeUndefined();

        await expect(clearLiveCanvas()).resolves.toBeUndefined();
    });
});
