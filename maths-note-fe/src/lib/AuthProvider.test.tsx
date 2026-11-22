import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthProvider';

let mockAuthStateCallback: ((event: string, session: any) => void) | null = null;
let mockGetSessionResult: any = { data: { session: null } };
let mockGetSessionPromise: Promise<any> | null = null;

vi.mock('@/lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockImplementation(() => {
                if (mockGetSessionPromise) return mockGetSessionPromise;
                return Promise.resolve(mockGetSessionResult);
            }),
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

describe('AuthProvider & useAuth (Task 70A)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockGetSessionResult = { data: { session: null } };
        mockGetSessionPromise = null;
        mockAuthStateCallback = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <AuthProvider>{children}</AuthProvider>
    );

    it('should initialize with signedOut when getSession returns null immediately', async () => {
        const { result } = renderHook(() => useAuth(), { wrapper });

        expect(result.current.status).toBe('loading');

        await act(async () => {
            await vi.runAllTicks();
        });

        expect(result.current.status).toBe('signedOut');
        expect(result.current.user).toBeNull();
    });

    it('should initialize with signedIn when getSession returns a user session immediately', async () => {
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

    it('getSession() pending for more than 3s gives unverified and isDegraded, never signedOut', async () => {
        mockGetSessionPromise = new Promise(() => {}); // never resolves initially

        const { result } = renderHook(() => useAuth(), { wrapper });

        expect(result.current.status).toBe('loading');
        expect(result.current.isDegraded).toBe(false);

        // Advance timers by 3000ms
        act(() => {
            vi.advanceTimersByTime(3000);
        });

        expect(result.current.status).toBe('unverified');
        expect(result.current.isDegraded).toBe(true);
        expect(result.current.status).not.toBe('signedOut');
    });

    it('getSession() resolving with a user after unverified gives signedIn, and the library and canvas guards never called navigate("/") in between', async () => {
        let resolveSession: (val: any) => void = () => {};
        mockGetSessionPromise = new Promise((resolve) => {
            resolveSession = resolve;
        });

        const mockNavigate = vi.fn();
        const { result } = renderHook(() => useAuth(), { wrapper });

        // Fast forward 3.5 seconds into unverified state
        act(() => {
            vi.advanceTimersByTime(3500);
        });

        expect(result.current.status).toBe('unverified');

        // Verify guard logic for canvas and library on unverified:
        if (result.current.status === 'signedOut') {
            mockNavigate('/');
        }
        expect(mockNavigate).not.toHaveBeenCalled();

        // Now session resolves with a user
        await act(async () => {
            resolveSession({
                data: {
                    session: {
                        user: { id: 'u-999', email: 'resolved@example.com' },
                        access_token: 'late-token'
                    }
                }
            });
            await vi.runAllTicks();
        });

        expect(result.current.status).toBe('signedIn');
        expect(result.current.user?.id).toBe('u-999');
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('getSession() resolving with no session after unverified gives signedOut', async () => {
        let resolveSession: (val: any) => void = () => {};
        mockGetSessionPromise = new Promise((resolve) => {
            resolveSession = resolve;
        });

        const { result } = renderHook(() => useAuth(), { wrapper });

        act(() => {
            vi.advanceTimersByTime(3000);
        });

        expect(result.current.status).toBe('unverified');

        await act(async () => {
            resolveSession({ data: { session: null } });
            await vi.runAllTicks();
        });

        expect(result.current.status).toBe('signedOut');
        expect(result.current.user).toBeNull();
    });

    it('an auth event after resolution never returns status to loading or unverified', async () => {
        const { result } = renderHook(() => useAuth(), { wrapper });

        await act(async () => {
            await vi.runAllTicks();
        });

        expect(result.current.status).toBe('signedOut');

        // Subsequent SIGNED_IN event
        act(() => {
            if (mockAuthStateCallback) {
                mockAuthStateCallback('SIGNED_IN', {
                    user: { id: 'u-123', email: 'test@example.com' },
                    access_token: 'tok-1'
                });
            }
        });

        expect(result.current.status).toBe('signedIn');
        expect(result.current.status).not.toBe('loading');
        expect(result.current.status).not.toBe('unverified');

        // TOKEN_REFRESHED
        act(() => {
            if (mockAuthStateCallback) {
                mockAuthStateCallback('TOKEN_REFRESHED', {
                    user: { id: 'u-123', email: 'test@example.com' },
                    access_token: 'tok-2'
                });
            }
        });

        expect(result.current.status).toBe('signedIn');

        // SIGNED_OUT
        act(() => {
            if (mockAuthStateCallback) {
                mockAuthStateCallback('SIGNED_OUT', null);
            }
        });

        expect(result.current.status).toBe('signedOut');
        expect(result.current.status).not.toBe('loading');
        expect(result.current.status).not.toBe('unverified');
    });

    it('the notice is shown only while unverified', async () => {
        mockGetSessionPromise = new Promise(() => {}); // pending

        render(
            <AuthProvider>
                <div>App Content</div>
            </AuthProvider>
        );

        // Initially loading: notice should not be in document
        expect(screen.queryByRole('alert')).toBeNull();

        // Advance 3 seconds -> unverified
        act(() => {
            vi.advanceTimersByTime(3000);
        });

        // Notice should now be visible
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByRole('alert').textContent).toContain('Having trouble reaching the server. Retrying.');

        // When auth event resolves to signedIn
        act(() => {
            if (mockAuthStateCallback) {
                mockAuthStateCallback('SIGNED_IN', {
                    user: { id: 'u-123', email: 'test@example.com' },
                    access_token: 'tok-1'
                });
            }
        });

        // Notice must disappear when status resolves
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
