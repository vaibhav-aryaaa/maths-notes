import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@mantine/core/styles.css';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { Loader2 } from 'lucide-react';

import Home from '@/screens/home';
import Landing from '@/screens/landing';

const LibraryScreen = lazy(() => import('@/screens/library'));
const ShareView = lazy(() => import('@/screens/share'));
const ResetPassword = lazy(() => import('@/screens/reset-password/ResetPassword'));

import { ErrorBoundary } from '@/components/ErrorBoundary';

import '@/index.css';

const RouteFallback = () => (
    <div className="w-full h-screen flex items-center justify-center bg-slate-50 dark:bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600 dark:text-teal-400" />
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
    const [started, setStarted] = useState(false);
    const [authModalOpened, setAuthModalOpened] = useState(false);
    const [authInitialSignUp, setAuthInitialSignUp] = useState(false);

    const handleStartGuest = () => {
        setStarted(true);
    };

    const handleSignIn = () => {
        setAuthInitialSignUp(false);
        setAuthModalOpened(true);
    };

    return (
        <div className="relative w-full h-screen overflow-hidden bg-slate-50 dark:bg-black transition-colors duration-300">
            {/* The main application board (rendered but hidden under the landing page until started) */}
            <div className={`absolute inset-0 transition-opacity duration-1000 ${started ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'}`}>
                <Home 
                    initialAuthOpened={authModalOpened}
                    onAuthOpenedChange={setAuthModalOpened}
                    initialSignUp={authInitialSignUp}
                />
            </div>

            {/* The landing page curtain */}
            <div 
                className={`absolute inset-0 transition-transform duration-1000 ease-[cubic-bezier(0.87,0,0.13,1)] z-50 ${started ? '-translate-y-full shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'translate-y-0'}`}
            >
                <Landing 
                    onStart={handleStartGuest}
                    onStartGuest={handleStartGuest}
                    onSignIn={handleSignIn}
                />
            </div>
        </div>
    );
};

const App = () => {
    return (
        <MantineProvider defaultColorScheme="dark">
            <Notifications />
            <ThemeSync>
                <BrowserRouter>
                    <Suspense fallback={<RouteFallback />}>
                        <Routes>
                            <Route path="/" element={<ErrorBoundary name="Home Screen"><AppContent /></ErrorBoundary>} />
                            <Route path="/canvas/:id" element={<ErrorBoundary name="Canvas Screen"><Home /></ErrorBoundary>} />
                            <Route path="/library" element={<ErrorBoundary name="Library Screen"><LibraryScreen /></ErrorBoundary>} />
                            <Route path="/library/folder/:folderId" element={<ErrorBoundary name="Library Folder Screen"><LibraryScreen /></ErrorBoundary>} />
                            <Route path="/share/:shareId" element={<ErrorBoundary name="Share View"><ShareView /></ErrorBoundary>} />
                            <Route path="/reset-password" element={<ErrorBoundary name="Reset Password"><ResetPassword /></ErrorBoundary>} />
                        </Routes>
                    </Suspense>
                </BrowserRouter>
            </ThemeSync>
        </MantineProvider>
    );
};

export default App;