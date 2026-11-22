import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'unverified' | 'signedIn' | 'signedOut';

export interface AuthContextValue {
    user: User | null;
    session: Session | null;
    status: AuthStatus;
    isDegraded: boolean;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    session: null,
    status: 'loading',
    isDegraded: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [status, setStatus] = useState<AuthStatus>(() => (!supabase ? 'signedOut' : 'loading'));
    const [isDegraded, setIsDegraded] = useState(false);
    const hasResolvedOnceRef = useRef(!supabase);

    useEffect(() => {
        if (!supabase) {
            return;
        }

        // 3-second fallback timer: if auth is still 'loading', transition to 'unverified'
        const timeoutTimer = setTimeout(() => {
            if (!hasResolvedOnceRef.current) {
                console.warn('[auth] Session resolution timed out after 3s; falling back to unverified');
                setIsDegraded(true);
                setStatus('unverified');
            }
        }, 3000);

        // Single getSession() call on mount: reads local storage, no network lock
        supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
            clearTimeout(timeoutTimer);
            if (hasResolvedOnceRef.current) return;

            if (initialSession?.user) {
                setUser(initialSession.user);
                setSession(initialSession);
                setStatus('signedIn');
                setIsDegraded(false);
                hasResolvedOnceRef.current = true;
            } else {
                setUser(null);
                setSession(null);
                setStatus('signedOut');
                setIsDegraded(false);
                hasResolvedOnceRef.current = true;
            }
        }).catch((err) => {
            console.warn('[auth] getSession error on init:', err);
            clearTimeout(timeoutTimer);
            if (hasResolvedOnceRef.current) return;

            // A catch on getSession() also goes to unverified, not signedOut
            setIsDegraded(true);
            setStatus('unverified');
        });

        // Single onAuthStateChange subscription for entire app
        // Callback is strictly synchronous (no async, no awaiting network calls)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            clearTimeout(timeoutTimer);
            if (event === 'SIGNED_OUT' || !newSession?.user) {
                setUser(null);
                setSession(null);
                setStatus('signedOut');
                setIsDegraded(false);
                hasResolvedOnceRef.current = true;
            } else if (newSession?.user) {
                setUser(newSession.user);
                setSession(newSession);
                setStatus('signedIn');
                setIsDegraded(false);
                hasResolvedOnceRef.current = true;
            }
        });

        return () => {
            clearTimeout(timeoutTimer);
            subscription.unsubscribe();
        };
    }, []);

    return (
        <AuthContext.Provider value={{ user, session, status, isDegraded }}>
            {status === 'unverified' && (
                <div 
                    role="alert" 
                    className="fixed bottom-4 right-4 z-50 rounded-[var(--lib-radius-sm)] bg-[var(--lib-bg-surface)] text-[var(--lib-text-secondary)] border border-[var(--lib-border)] px-3 py-2 text-xs shadow-md animate-fade-in"
                >
                    Having trouble reaching the server. Retrying.
                </div>
            )}
            {children}
        </AuthContext.Provider>
    );
};
