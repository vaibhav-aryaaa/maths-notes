// Unused imports removed

interface LandingProps {
    onStart: () => void;
}

export default function Landing({ onStart }: LandingProps) {
    return (
        <div className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden flex flex-col items-center justify-center font-sans">
            
            {/* Navbar with Logo */}
            <div className="absolute top-0 left-0 w-full p-8 flex items-center justify-between z-50">
                <div className="flex items-center gap-2 select-none">
                    <span className="text-3xl font-extrabold tracking-tight text-white/90">
                        solve<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400">IQ</span>
                    </span>
                </div>
            </div>

            {/* Live Wallpaper Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="floating-symbol symbol-1 left-[10%] top-[20%] text-6xl animation-delay-1000">∑</div>
                <div className="floating-symbol symbol-2 left-[85%] top-[15%] text-7xl animation-delay-2000">∫</div>
                <div className="floating-symbol symbol-3 left-[20%] top-[75%] text-5xl animation-delay-4000">π</div>
                <div className="floating-symbol symbol-1 left-[75%] top-[80%] text-8xl animation-delay-1000">∞</div>
                <div className="floating-symbol symbol-2 left-[50%] top-[10%] text-4xl animation-delay-3000">√</div>
                <div className="floating-symbol symbol-3 left-[5%] top-[50%] text-7xl animation-delay-5000">∂</div>
                <div className="floating-symbol symbol-1 left-[90%] top-[55%] text-5xl animation-delay-2000">∆</div>
                <div className="floating-symbol symbol-2 left-[35%] top-[85%] text-6xl animation-delay-4000">θ</div>
                <div className="floating-symbol symbol-3 left-[65%] top-[25%] text-5xl animation-delay-1000">λ</div>
                
                {/* Subtle Glow Orbs */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 blur-[150px] rounded-full pointer-events-none" />
            </div>

            {/* Main Content */}
            <div className="relative z-10 flex flex-col items-center max-w-4xl px-6 text-center">
                
                {/* Pill Badge */}
                <div className="mb-8 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm flex items-center gap-2 text-sm font-medium tracking-wide text-gray-300">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    THE ULTIMATE AI MATH CANVAS
                </div>

                {/* Editorial Headline */}
                <h1 className="font-playfair text-6xl md:text-8xl lg:text-[110px] leading-[1.1] font-bold text-white mb-8 tracking-tight">
                    Solve your <span className="italic text-blue-400">complex math</span><br/> problems instantly.
                </h1>
                
                {/* Subheadline */}
                <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl font-light tracking-wide leading-relaxed">
                    Draw equations, get step-by-step reasoning, and see the AI's thought process — personalized to your mathematical style.
                </p>

                {/* Primary CTA */}
                <button 
                    onClick={onStart}
                    className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold tracking-wide rounded-full overflow-hidden hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.5)] border border-white/10"
                >
                    <span className="relative flex items-center gap-2 text-lg">
                        Start Solving
                        <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </span>
                </button>

            </div>
        </div>
    );
}
