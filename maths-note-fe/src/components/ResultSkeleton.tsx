import { useEffect, useState } from 'react';

interface ResultSkeletonProps {
    position: { x: number; y: number };
}

export const ResultSkeleton = ({ position }: ResultSkeletonProps) => {
    const [width, setWidth] = useState(() => {
        return typeof window !== 'undefined' ? Math.min(450, window.innerWidth - 32) : 450;
    });

    useEffect(() => {
        const handleResize = () => {
            setWidth(Math.min(450, window.innerWidth - 32));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div
            className="absolute top-0 left-0 z-sidebar glassmorphic-card p-4 rounded-xl shadow-2xl flex flex-col overflow-hidden pointer-events-none"
            style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                width: `${width}px`,
                height: '280px',
            }}
        >
            {/* Header: AI Badge Shimmer */}
            <div className="flex justify-between items-center gap-4 shrink-0 mb-4">
                <div className="w-28 h-6 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-stone-100 dark:via-stone-700 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                </div>
                <div className="w-12 h-4 bg-stone-200 dark:bg-stone-800 rounded overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-stone-100 dark:via-stone-700 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                </div>
            </div>

            {/* Main Solution Shimmer */}
            <div className="flex-1 flex flex-col gap-3">
                <div className="w-2/3 h-7 bg-stone-200 dark:bg-stone-800 rounded-lg overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-stone-100 dark:via-stone-700 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                </div>

                {/* Divider */}
                <div className="w-full h-[1px] bg-stone-200 dark:bg-white/10 my-1" />

                {/* Step / Thought process placeholders */}
                <div className="flex-1 flex flex-col gap-2.5">
                    <div className="w-1/4 h-4 bg-stone-200 dark:bg-stone-800 rounded overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-stone-100 dark:via-stone-700 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                    </div>
                    <div className="w-full h-16 bg-stone-100 dark:bg-stone-800/50 rounded-xl overflow-hidden relative border border-stone-200/50 dark:border-white/5">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-stone-50 dark:via-stone-700/50 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                    </div>
                </div>
            </div>
        </div>
    );
};
