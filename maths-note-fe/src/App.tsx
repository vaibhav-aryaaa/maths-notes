import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import '@mantine/core/styles.css';
import { MantineProvider, useMantineColorScheme, createTheme, type MantineColorsTuple } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { Loader2 } from 'lucide-react';

// Warm amber primary palette for Mantine
const amberPalette: MantineColorsTuple = [
    '#fffbeb',
    '#fef3c7',
    '#fde68a',
    '#fcd34d',
    '#fbbf24',
    '#f59e0b',
    '#d97706',
    '#b45309',
    '#92400e',
    '#78350f'
];

const mantineTheme = createTheme({
    primaryColor: 'amber',
    colors: {
        amber: amberPalette,
    },
    defaultRadius: 6,
    fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    headings: {
        fontFamily: "'Instrument Serif', Georgia, serif",
    },
});

import Home from '@/screens/home';
import Landing from '@/screens/landing';
import { AuthManager } from '@/components/AuthManager';
import { AuthProvider, useAuth } from '@/lib/AuthProvider';

const LibraryScreen = lazy(() => import('@/screens/library'));
const ShareView = lazy(() => import('@/screens/share'));
const ResetPassword = lazy(() => import('@/screens/reset-password/ResetPassword'));

import { ErrorBoundary } from '@/components/ErrorBoundary';

import '@/index.css';

const RouteFallback = () => (
    <div className="w-full h-screen flex items-center justify-center bg-[var(--lib-bg-page)] text-[var(--lib-accent)]">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--lib-accent)]" />
    </div>
);

const ThemeSync = ({ children }: { children: React.ReactNode }) => {
    const { colorScheme } = useMantineColorScheme();

    useEffect(() => {
        const root = window.document.documentElement;
        if (colorScheme === 'dark') {
            root.classList.add('dark');
            root.classList.remove('light');
        } else {
            root.classList.add('light');
            root.classList.remove('dark');
        }
    }, [colorScheme]);

    return <>{children}</>;
};

const AppContent = () => {
    const navigate = useNavigate();
    const { status } = useAuth();
    const [authModalOpened, setAuthModalOpened] = useState(false);
    const [authInitialSignUp, setAuthInitialSignUp] = useState(false);

    useEffect(() => {
        if (status === 'signedIn') {
            navigate('/library', { replace: true });
        }
    }, [status, navigate]);

    const handleStartGuest = () => {
        navigate('/canvas/guest');
    };

    const handleSignIn = () => {
        setAuthInitialSignUp(false);
        setAuthModalOpened(true);
    };

    if (status === 'loading') {
        return <RouteFallback />;
    }

    return (
        <>
            <Landing 
                onStartGuest={handleStartGuest}
                onSignIn={handleSignIn}
            />
            <AuthManager 
                modalOnly
                user={null}
                clearHistory={async () => {}}
                opened={authModalOpened}
                onOpenedChange={setAuthModalOpened}
                initialSignUp={authInitialSignUp}
            />
        </>
    );
};

const CanvasRoute = () => {
    const { id } = useParams<{ id?: string }>();
    const navigate = useNavigate();
    const isGuestRoute = id === 'guest';
    const { status } = useAuth();

    useEffect(() => {
        if (status === 'loading' || status === 'unverified') {
            return;
        }

        if (isGuestRoute) {
            if (status === 'signedIn') {
                navigate('/library', { replace: true });
            }
        } else {
            if (status === 'signedOut') {
                navigate('/', { replace: true });
            }
        }
    }, [isGuestRoute, status, navigate]);

    if (status === 'loading') {
        return <RouteFallback />;
    }

    return <Home />;
};

const App = () => {
    return (
        <MantineProvider theme={mantineTheme} defaultColorScheme="dark">
            <Notifications />
            <ThemeSync>
                <AuthProvider>
                    <BrowserRouter>
                        <Suspense fallback={<RouteFallback />}>
                            <Routes>
                                <Route path="/" element={<ErrorBoundary name="Home Screen"><AppContent /></ErrorBoundary>} />
                                <Route path="/canvas/:id" element={<ErrorBoundary name="Canvas Screen"><CanvasRoute /></ErrorBoundary>} />
                                <Route path="/library" element={<ErrorBoundary name="Library Screen"><LibraryScreen /></ErrorBoundary>} />
                                <Route path="/library/folder/:folderId" element={<ErrorBoundary name="Library Folder Screen"><LibraryScreen /></ErrorBoundary>} />
                                <Route path="/share/:shareId" element={<ErrorBoundary name="Share View"><ShareView /></ErrorBoundary>} />
                                <Route path="/reset-password" element={<ErrorBoundary name="Reset Password"><ResetPassword /></ErrorBoundary>} />
                            </Routes>
                        </Suspense>
                    </BrowserRouter>
                </AuthProvider>
            </ThemeSync>
        </MantineProvider>
    );
};

export default App;