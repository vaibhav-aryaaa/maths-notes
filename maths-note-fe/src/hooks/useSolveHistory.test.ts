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

    it('should navigate to /library on new SIGNED_IN event on landing page (/)', async () => {
        window.history.pushState({}, '', '/');
        mockNavigate.mockClear();
        const { result } = renderHook(() => useSolveHistory('canvas-1'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const mockSession = {
            user: { id: 'user-123', email: 'test@example.com' },
            access_token: 'mock-jwt-token'
        };

        act(() => {
            if (authStateCallback) {
                authStateCallback('SIGNED_IN', mockSession);
            }
        });

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/library');
        });
    });

    it('should NOT navigate or migrate on repeat SIGNED_IN for the same user id on /canvas/abc', async () => {
        window.history.pushState({}, '', '/canvas/abc');
        mockNavigate.mockClear();
        mockCreateCanvas.mockClear();

        const { result } = renderHook(() => useSolveHistory('canvas-abc'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const mockSession = {
            user: { id: 'user-123', email: 'test@example.com' },
            access_token: 'mock-jwt-token'
        };

        // First sign in on canvas:
        act(() => {
            if (authStateCallback) {
                authStateCallback('SIGNED_IN', mockSession);
            }
        });

        // Repeat SIGNED_IN for the same user id (e.g. on window tab refocus)
        act(() => {
            if (authStateCallback) {
                authStateCallback('SIGNED_IN', mockSession);
            }
        });

        // Wait to ensure no delayed timers fired navigation or migration
        await new Promise((r) => setTimeout(r, 50));

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockCreateCanvas).not.toHaveBeenCalled();
    });

    it('should navigate to /library and migrate guest canvas when new user signs in on /canvas/guest', async () => {
        window.history.pushState({}, '', '/canvas/guest');
        mockNavigate.mockClear();
        mockCreateCanvas.mockClear();
        sessionStorage.clear();

        const mockGuestCanvas = {
            elements: [{ kind: 'stroke', id: 's1', tool: 'pen', color: 'white', width: 3, points: [] }],
            camera: { offsetX: 100, offsetY: 200, scale: 1.5 },
            dictOfVars: { x: '5' },
            results: [{ id: 'res-1', solutions: [{ expression: 'x', answer: '5', type: 'math' }] }],
            updatedAt: Date.now()
        };
        sessionStorage.setItem('guest_canvas_data', JSON.stringify(mockGuestCanvas));

        const { result } = renderHook(() => useSolveHistory('guest'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const mockSession = {
            user: { id: 'user-new-456', email: 'new@example.com' },
            access_token: 'mock-jwt-token-2'
        };

        act(() => {
            if (authStateCallback) {
                authStateCallback('SIGNED_IN', mockSession);
            }
        });

        await waitFor(() => {
            expect(mockCreateCanvas).toHaveBeenCalledWith(expect.objectContaining({
                name: 'First Notebook'
            }), 'mock-jwt-token-2');
            expect(mockNavigate).toHaveBeenCalledWith('/library');
        });

        expect(sessionStorage.getItem('guest_canvas_data')).toBeNull();
    });

    it('should update token and not reload history or navigate on TOKEN_REFRESHED', async () => {
        window.history.pushState({}, '', '/canvas/abc');
        mockNavigate.mockClear();
        vi.mocked(axios.get).mockClear();

        const { result } = renderHook(() => useSolveHistory('canvas-abc'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const refreshedSession = {
            user: { id: 'user-123', email: 'test@example.com' },
            access_token: 'refreshed-token-999'
        };

        act(() => {
            if (authStateCallback) {
                authStateCallback('TOKEN_REFRESHED', refreshedSession);
            }
        });

        await new Promise((r) => setTimeout(r, 50));
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('should clear user on SIGNED_OUT', async () => {
        mockNavigate.mockClear();
        const { result } = renderHook(() => useSolveHistory('canvas-1'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        act(() => {
            if (authStateCallback) {
                authStateCallback('SIGNED_OUT', null);
            }
        });

        await waitFor(() => {
            expect(result.current.user).toBeNull();
        });
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

        act(() => {
            if (authStateCallback) {
                authStateCallback('USER_UPDATED', mockSession);
            }
        });

        await new Promise((r) => setTimeout(r, 50));
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should not navigate away if a backend request fails or times out during refocus', async () => {
        window.history.pushState({}, '', '/canvas/test-notebook');
        mockNavigate.mockClear();
        vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network Timeout'));

        const { result } = renderHook(() => useSolveHistory('test-notebook'));

        await waitFor(() => {
            expect(result.current.isDbReady).toBe(true);
        });

        const session = {
            user: { id: 'user-123', email: 'test@example.com' },
            access_token: 'mock-jwt-token'
        };

        // Simulate repeat session event on refocus
        act(() => {
            if (authStateCallback) {
                authStateCallback('SIGNED_IN', session);
            }
        });

        await new Promise((r) => setTimeout(r, 50));
        expect(mockNavigate).not.toHaveBeenCalled();
    });
});
