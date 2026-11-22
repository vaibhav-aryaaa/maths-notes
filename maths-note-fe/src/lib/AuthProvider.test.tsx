import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthProvider';

let mockAuthStateCallback: ((event: string, session: any) => void) | null = null;
let mockGetSessionResult: any = { data: { session: null } };

vi.mock('@/lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockImplementation(() => Promise.resolve(mockGetSessionResult)),
            onAuthStateChange: vi.fn().mockImplementation((cb) => {
                mockAuthStateCallback = cb;
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

describe('AuthProvider & useAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockGetSessionResult = { data: { session: null } };
        mockAuthStateCallback = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <AuthProvider>{children}</AuthProvider>
    );

    it('should initialize with signedOut when getSession returns null', async () => {
        const { result } = renderHook(() => useAuth(), { wrapper });

        expect(result.current.status).toBe('loading');

        await act(async () => {
            await vi.runAllTicks();
        });

        expect(result.current.status).toBe('signedOut');
        expect(result.current.user).toBeNull();
    });

    it('should initialize with signedIn when getSession returns a user session', async () => {
        const mockUser = { id: 'u-123', email: 'test@example.com' };
        mockGetSessionResult = {
            data: {
                session: {
                    user: mockUser,
                    access_token: 'token-abc'
                }
            }
        };

        const { result } = renderHook(() => useAuth(), { wrapper });

        await act(async () => {
            await vi.runAllTicks();
        });

        expect(result.current.status).toBe('signedIn');
        expect(result.current.user?.id).toBe('u-123');
    });

    it('status should never return to loading after it has resolved', async () => {
        const { result } = renderHook(() => useAuth(), { wrapper });

        await act(async () => {
            await vi.runAllTicks();
        });

        expect(result.current.status).toBe('signedOut');

        // Simulate subsequent auth state changes (e.g. refocus or token refresh)
        act(() => {
            if (mockAuthStateCallback) {
                mockAuthStateCallback('SIGNED_IN', {
                    user: { id: 'u-123', email: 'test@example.com' },
                    access_token: 'tok-1'
                });
            }
        });

        expect(result.current.status).toBe('signedIn');

        act(() => {
            if (mockAuthStateCallback) {
                mockAuthStateCallback('TOKEN_REFRESHED', {
                    user: { id: 'u-123', email: 'test@example.com' },
                    access_token: 'tok-2'
                });
            }
        });

        expect(result.current.status).toBe('signedIn');

        act(() => {
            if (mockAuthStateCallback) {
                mockAuthStateCallback('SIGNED_OUT', null);
            }
        });

        expect(result.current.status).toBe('signedOut');
    });

    it('should fall back to signedOut with isDegraded after 3 seconds if getSession hangs', async () => {
        // Mock getSession that never resolves
        const { supabase } = await import('@/lib/supabase');
        (supabase!.auth.getSession as any).mockImplementationOnce(() => new Promise(() => {}));

        const { result } = renderHook(() => useAuth(), { wrapper });

        expect(result.current.status).toBe('loading');
        expect(result.current.isDegraded).toBe(false);

        // Advance timers by 3000ms
        act(() => {
            vi.advanceTimersByTime(3000);
        });

        expect(result.current.status).toBe('signedOut');
        expect(result.current.isDegraded).toBe(true);
    });
});
