import { useMantineColorScheme } from '@mantine/core';
import CursorGrid from '@/components/CursorGrid';
import TextLoop from '@/components/TextLoop';

interface LandingProps {
    onStart: () => void;
}

export default function Landing({ onStart }: LandingProps) {
    const { colorScheme } = useMantineColorScheme();
    const gridColor = colorScheme === 'dark' ? '#ffffff' : '#1c1917';
    const loopRibbonColor = colorScheme === 'dark' ? '#1c1917' : '#f5f5f4';
    const loopTextColor = colorScheme === 'dark' ? '#ffffff' : '#1c1917';

    return (
        <div className="relative w-full h-screen bg-[#fafaf9] dark:bg-stone-950 overflow-hidden flex flex-col items-center justify-between font-sans transition-colors duration-300">
            
            <div className="absolute top-0 left-0 w-full p-6 md:p-8 flex items-center justify-between z-50 pointer-events-none">
                <div className="flex items-center gap-2 select-none">
                    <span className="text-xl md:text-2xl font-extrabold tracking-tight text-stone-900 dark:text-stone-100">
                        solve<span className="text-stone-900 dark:text-white">IQ</span>
                    </span>
                </div>
                <div className="pointer-events-auto">
                    <a 
                        href="https://github.com/vaibhav-aryaaa/maths-notes" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-850 text-stone-700 dark:text-stone-300 shadow-sm transition-all text-xs sm:text-sm font-semibold"
                        aria-label="Open solveIQ source code repository on GitHub"
                    >
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-stone-750 dark:text-stone-300">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                        </svg>
                        <span>solveIQ on GitHub</span>
                    </a>
                </div>
            </div>

            {/* Interactive Cursor Grid Background */}
            <div className="absolute inset-0 z-0">
                <CursorGrid
                    cellSize={60}
                    color={gridColor}
                    radius={140}
                    falloff="smooth"
                    holdTime={200}
                    fadeDuration={1000}
                    lineWidth={4}
                    maxOpacity={1}
                    fillOpacity={0}
                    gridOpacity={0}
                    cellRadius={0}
                    clickPulse={true}
                    pulseSpeed={600}
                />
            </div>

            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="floating-symbol symbol-1 left-[10%] top-[20%] text-5xl sm:text-7xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none">∑</div>
                <div className="floating-symbol symbol-2 left-[85%] top-[15%] text-6xl sm:text-8xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none">∫</div>
                <div className="floating-symbol symbol-3 left-[20%] top-[75%] text-5xl sm:text-6xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none">π</div>
                <div className="floating-symbol symbol-1 left-[75%] top-[80%] text-6xl sm:text-9xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none">∞</div>
                <div className="floating-symbol symbol-2 left-[50%] top-[10%] text-3xl sm:text-5xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none hidden md:block">√</div>
                <div className="floating-symbol symbol-3 left-[5%] top-[50%] text-5xl sm:text-8xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none hidden sm:block">∂</div>
                <div className="floating-symbol symbol-1 left-[90%] top-[55%] text-4xl sm:text-6xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none hidden sm:block">∆</div>
                <div className="floating-symbol symbol-2 left-[35%] top-[85%] text-5xl sm:text-7xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none hidden md:block">θ</div>
                <div className="floating-symbol symbol-3 left-[65%] top-[25%] text-4xl sm:text-6xl font-handwriting text-stone-400/20 dark:text-stone-600/10 select-none hidden md:block">λ</div>
                
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[800px] h-[300px] sm:h-[800px] bg-stone-500/5 blur-[80px] sm:blur-[150px] rounded-full pointer-events-none" />
            </div>

            {/* Main Hero Content (takes up remaining vertical space and centers its children) */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center max-w-3xl px-6 text-center select-none pointer-events-none">

                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.2] md:leading-[1.15] font-extrabold text-stone-900 dark:text-stone-100 mb-6 tracking-tight font-sans animate-fade-in-up" style={{ animationDelay: '150ms' }}>
                    Solve your <span className="relative inline-block px-4 py-1.5 mx-1 font-handwriting text-stone-900 dark:text-white bg-stone-200/55 dark:bg-stone-800/60 rounded-2xl -rotate-1 transform shadow-sm">complex math</span><br/> problems instantly.
                </h1>
                
                <p className="text-sm sm:text-base md:text-lg text-stone-500 dark:text-stone-450 mb-8 md:mb-10 max-w-xl font-medium leading-relaxed font-sans animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                    Draw equations, get step-by-step reasoning, and see the AI's thought process, personalized to your mathematical style.
                </p>

                <button 
                    onClick={onStart}
                    className="group relative px-7 py-3.5 bg-stone-950 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-stone-200 text-stone-50 dark:text-stone-950 font-bold tracking-wide rounded-2xl shadow-md transition-all duration-300 transform hover:scale-[1.02] active:scale-95 border border-stone-850 dark:border-stone-200 flex items-center gap-2 text-base pointer-events-auto animate-fade-in-up"
                    style={{ animationDelay: '450ms' }}
                    aria-label="Enter whiteboard math canvas workspace and start solving"
                >
                    <span>Start Solving</span>
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </button>
            </div>

            {/* Scrolling Banner Tape (naturally flows at the bottom, padded off the lower viewport edge) */}
            <div className="w-full h-12 mb-6 pointer-events-auto z-10 shrink-0">
                <TextLoop
                    text="SolveIQ ✦ Step-by-Step Reasoning ✦ Infinite Canvas ✦ Vector Strokes ✦ Interactive Whiteboard ✦ AI Solver"
                    shape="line"
                    speed={50}
                    direction="forward"
                    separator="✦"
                    fontSize={14}
                    fontWeight={800}
                    letterSpacing={2}
                    uppercase={true}
                    color={loopTextColor}
                    ribbon={true}
                    ribbonColor={loopRibbonColor}
                    ribbonWidth={42}
                    pauseOnHover={true}
                />
            </div>
        </div>
    );
}
