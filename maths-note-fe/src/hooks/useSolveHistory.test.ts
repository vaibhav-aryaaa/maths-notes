import { renderHook, waitFor, act } from '@testing-library/react';
import { useSolveHistory } from './useSolveHistory';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate
}));

let authStateCallback: ((event: string, session: any) => Promise<void>) | null = null;
vi.mock('@/lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
            onAuthStateChange: vi.fn().mockImplementation((cb) => {
                authStateCallback = cb;
                return {
                    data: {
                        subscription: {
                            unsubscribe: vi.fn()
                        }
                    }
                };
            })
        }
    }
}));

const mockCreateCanvas = vi.fn().mockResolvedValue({ id: 'new-migrated-canvas-id', name: 'First Notebook' });
vi.mock('@/lib/canvasesApi', () => ({
    createCanvas: (...args: any[]) => mockCreateCanvas(...args),
}));

describe('useSolveHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(axios.get).mockResolvedValue({ data: { entries: [] } });
    });

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

    it('should save and load history exclusively in sessionStorage when user is guest', async () => {
        sessionStorage.clear();
        const { result } = renderHook(() => useSolveHistory('canvas-1'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const mockCanvas = {
            width: 100,
            height: 100,
            getContext: () => ({
                fillStyle: '',
                fillRect: () => {},
                drawImage: () => {}
            }),
            toDataURL: () => 'data:image/png;base64,mock'
        } as unknown as HTMLCanvasElement;

        await act(async () => {
            await result.current.saveHistoryEntry(mockCanvas, [], {});
        });

        expect(result.current.history.length).toBe(1);
        expect(sessionStorage.getItem('guest_history')).toContain('mock');

        await act(async () => {
            await result.current.clearHistory();
        });

        expect(result.current.history.length).toBe(0);
        expect(sessionStorage.getItem('guest_history')).toBeNull();
    });

    it('should navigate to /library on SIGNED_IN event', async () => {
        mockNavigate.mockClear();
        const { result } = renderHook(() => useSolveHistory('canvas-1'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const mockSession = {
            user: { id: 'user-123', email: 'test@example.com' },
            access_token: 'mock-jwt-token'
        };

        await act(async () => {
            if (authStateCallback) {
                await authStateCallback('SIGNED_IN', mockSession);
            }
        });

        expect(mockNavigate).toHaveBeenCalledWith('/library');
    });

    it('should not navigate to /library on USER_UPDATED event', async () => {
        mockNavigate.mockClear();
        const { result } = renderHook(() => useSolveHistory('canvas-1'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const mockSession = {
            user: { id: 'user-123', email: 'test@example.com' },
            access_token: 'mock-jwt-token'
        };

        await act(async () => {
            if (authStateCallback) {
                await authStateCallback('USER_UPDATED', mockSession);
            }
        });

        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should migrate guest canvas with full payload including results and dictOfVars on SIGNED_IN', async () => {
        sessionStorage.clear();
        const mockGuestCanvas = {
            elements: [{ kind: 'stroke', id: 's1', tool: 'pen', color: 'white', width: 3, points: [] }],
            camera: { offsetX: 100, offsetY: 200, scale: 1.5 },
            dictOfVars: { x: '5' },
            results: [{ id: 'res-1', solutions: [{ expression: 'x', answer: '5', type: 'math' }] }],
            updatedAt: Date.now()
        };
        sessionStorage.setItem('guest_canvas_data', JSON.stringify(mockGuestCanvas));

        const { result } = renderHook(() => useSolveHistory('canvas-1'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const mockSession = {
            user: { id: 'user-123', email: 'test@example.com' },
            access_token: 'mock-jwt-token'
        };

        await act(async () => {
            if (authStateCallback) {
                await authStateCallback('SIGNED_IN', mockSession);
            }
        });

        expect(mockCreateCanvas).toHaveBeenCalledWith({
            name: 'First Notebook',
            elements: {
                elements: mockGuestCanvas.elements,
                camera: mockGuestCanvas.camera,
                dictOfVars: mockGuestCanvas.dictOfVars,
                results: mockGuestCanvas.results,
                loadedHistoryEntryId: undefined
            }
        }, 'mock-jwt-token');

        expect(sessionStorage.getItem('guest_canvas_data')).toBeNull();
    });
});
