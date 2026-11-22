import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

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

        // 3-second fallback timer: if auth is still 'loading', unblock the UI to signed-out
        const timeoutTimer = setTimeout(() => {
            if (!hasResolvedOnceRef.current) {
                console.warn('[auth] Session resolution timed out after 3s; falling back to signedOut');
                setIsDegraded(true);
                setStatus('signedOut');
                hasResolvedOnceRef.current = true;
            }
        }, 3000);

        // Single getSession() call on mount: reads local storage, no network lock
        supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
            clearTimeout(timeoutTimer);
            if (initialSession?.user) {
                setUser(initialSession.user);
                setSession(initialSession);
                setStatus('signedIn');
            } else {
                setUser(null);
                setSession(null);
                setStatus('signedOut');
            }
            hasResolvedOnceRef.current = true;
        }).catch((err) => {
            console.warn('[auth] getSession error on init:', err);
            clearTimeout(timeoutTimer);
            setUser(null);
            setSession(null);
            setStatus('signedOut');
            hasResolvedOnceRef.current = true;
        });

        // Single onAuthStateChange subscription for entire app
        // Callback is strictly synchronous (no async, no awaiting network calls)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            clearTimeout(timeoutTimer);
            if (event === 'SIGNED_OUT' || !newSession?.user) {
                setUser(null);
                setSession(null);
                setStatus('signedOut');
                hasResolvedOnceRef.current = true;
            } else if (newSession?.user) {
                setUser(newSession.user);
                setSession(newSession);
                setStatus('signedIn');
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
            {isDegraded && status === 'signedOut' && (
                <div 
                    role="alert" 
                    className="fixed bottom-4 right-4 z-50 rounded-md bg-stone-800 text-stone-200 border border-stone-700 px-3 py-2 text-xs shadow-md animate-fade-in"
                >
                    Having trouble reaching the server. Retrying.
                </div>
            )}
            {children}
        </AuthContext.Provider>
    );
};
