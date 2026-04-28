import { useState } from 'react';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import Home from '@/screens/home';
import Landing from '@/screens/landing';

import '@/index.css';

const App = () => {
    const [started, setStarted] = useState(false);

    return (
        <MantineProvider>
            <div className="relative w-full h-screen overflow-hidden bg-black">
                
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
        </MantineProvider>
    );
};

export default App;