import { useState, useEffect } from 'react';
import '@mantine/core/styles.css';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';

import Home from '@/screens/home';
import Landing from '@/screens/landing';

import '@/index.css';

const AppContent = () => {
    const [started, setStarted] = useState(false);
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

    return (
        <div className="relative w-full h-screen overflow-hidden bg-slate-50 dark:bg-black transition-colors duration-300">
            {/* The main application board (rendered but hidden under the landing page until started) */}
            <div className={`absolute inset-0 transition-opacity duration-1000 ${started ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'}`}>
                <Home />
            </div>

            {/* The landing page curtain */}
            <div 
                className={`absolute inset-0 transition-transform duration-1000 ease-[cubic-bezier(0.87,0,0.13,1)] z-50 ${started ? '-translate-y-full shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'translate-y-0'}`}
            >
                <Landing onStart={() => setStarted(true)} />
            </div>
        </div>
    );
};

const App = () => {
    return (
        <MantineProvider defaultColorScheme="dark">
            <Notifications />
            <AppContent />
        </MantineProvider>
    );
};

export default App;