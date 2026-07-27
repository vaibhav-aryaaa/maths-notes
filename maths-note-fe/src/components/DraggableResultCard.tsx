import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RingProgress, Tooltip } from '@mantine/core';

import type { GeneratedResult, SolutionStep } from '@/types';

declare global {
    interface Window {
        MathJax?: {
            Hub: {
                Queue: (args: unknown[]) => void;
                Config: (config: Record<string, unknown>) => void;
            };
        };
    }
}

const formatMathText = (text: string) => {
    if (!text) return '';
    
    // Replace literal "\n" strings (escaped) with actual newlines
    let formatted = text.replace(/\\n/g, '\n');
    
    // Replace caret notation for exponents (e.g., a^2 -> a²)
    const superscripts: Record<string, string> = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', 
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
    };
    formatted = formatted.replace(/\^([0-9])/g, (_, num) => superscripts[num] || `^${num}`);
    
    // Replace escaped unicode square root symbols with the actual symbol
    formatted = formatted.replace(/\\u221a/gi, '√');
    
    return formatted;
};

interface DraggableResultCardProps {
    result: GeneratedResult;
    defaultPosition: { x: number; y: number };
    setPosition?: (pos: { x: number; y: number }) => void;
}

export const DraggableResultCard = ({ result, defaultPosition, setPosition: setPositionProp }: DraggableResultCardProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState(defaultPosition);
    const dragPosRef = useRef(defaultPosition);

    const updatePosition = (pos: { x: number; y: number }) => {
        setPosition(pos);
        dragPosRef.current = pos;
    };

    const finalPosition = isDragging ? position : defaultPosition;

    const [size, setSize] = useState(() => {
        const w = typeof window !== 'undefined' ? Math.min(450, window.innerWidth - 32) : 450;
        return { width: w, height: 280 };
    });
    const [isResizing, setIsResizing] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [showThoughtProcess, setShowThoughtProcess] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [showAllSteps, setShowAllSteps] = useState(false);

    const steps = result.steps;

    const dragStart = useRef({ x: 0, y: 0 });
    const cardStart = useRef({ x: 0, y: 0 });
    
    const resizeStart = useRef({ x: 0, y: 0 });
    const cardSizeStart = useRef({ width: 0, height: 0 });
    const cardRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[data-slot^="accordion"]')) {
            return;
        }
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
        cardStart.current = defaultPosition;
        setPosition(defaultPosition);
        dragPosRef.current = defaultPosition;
        e.preventDefault(); // Prevents default text-selection / image-ghosting during drag
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[data-slot^="accordion"]')) {
            return;
        }
        const touch = e.touches[0];
        setIsDragging(true);
        dragStart.current = { x: touch.clientX, y: touch.clientY };
        cardStart.current = defaultPosition;
        setPosition(defaultPosition);
        dragPosRef.current = defaultPosition;
    };

    const handleResizeMouseDown = (e: React.MouseEvent) => {
        setIsResizing(true);
        resizeStart.current = { x: e.clientX, y: e.clientY };
        cardSizeStart.current = { width: size.width, height: size.height };
        e.preventDefault();
        e.stopPropagation(); // Stops drag listener from triggering
    };

    const handleResizeTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        setIsResizing(true);
        resizeStart.current = { x: touch.clientX, y: touch.clientY };
        cardSizeStart.current = { width: size.width, height: size.height };
        e.stopPropagation(); // Stops drag listener from triggering
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            updatePosition({
                x: cardStart.current.x + dx,
                y: cardStart.current.y + dy
            });
        };

        const handleTouchMove = (e: TouchEvent) => {
            const touch = e.touches[0];
            const dx = touch.clientX - dragStart.current.x;
            const dy = touch.clientY - dragStart.current.y;
            updatePosition({
                x: cardStart.current.x + dx,
                y: cardStart.current.y + dy
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            if (setPositionProp) {
                setPositionProp(dragPosRef.current);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleMouseUp);
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging, setPositionProp]);

    useEffect(() => {
        if (!isResizing) return;

        const minWidth = 300;
        const minHeight = 180;
        const maxWidth = Math.min(800, window.innerWidth - 32);
        const maxHeight = Math.min(800, window.innerHeight - 32);

        const handleMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - resizeStart.current.x;
            const dy = e.clientY - resizeStart.current.y;
            setSize({
                width: Math.max(minWidth, Math.min(maxWidth, cardSizeStart.current.width + dx)),
                height: Math.max(minHeight, Math.min(maxHeight, cardSizeStart.current.height + dy))
            });
        };

        const handleTouchMove = (e: TouchEvent) => {
            const touch = e.touches[0];
            const dx = touch.clientX - resizeStart.current.x;
            const dy = touch.clientY - resizeStart.current.y;
            setSize({
                width: Math.max(minWidth, Math.min(maxWidth, cardSizeStart.current.width + dx)),
                height: Math.max(minHeight, Math.min(maxHeight, cardSizeStart.current.height + dy))
            });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isResizing]);

    const serializedSolutions = JSON.stringify(result.solutions);

    useEffect(() => {
        if (!isMinimized && window.MathJax && cardRef.current) {
            const cardEl = cardRef.current;
            setTimeout(() => {
                try {
                    window.MathJax?.Hub.Queue(["Typeset", window.MathJax.Hub, cardEl]);
                } catch (e) {
                    console.error("MathJax typesetting failed:", e);
                }
            }, 50);
        }
    }, [isMinimized, serializedSolutions, currentStepIndex, showAllSteps]);

    const renderStep = (step: SolutionStep) => {
        const formattedDesc = formatMathText(step.description);
        const latexExpr = step.expression ? `\\(${step.expression}\\)` : '';

        return (
            <div 
                key={step.order} 
                className="flex flex-col gap-2 p-3 bg-stone-100/50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-xl transition-all duration-300 animate-in fade-in slide-in-from-right-4"
            >
                <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center text-xs font-bold font-sans">
                        {step.order}
                    </span>
                    <span className="text-xs text-stone-550 dark:text-gray-400 font-bold uppercase tracking-wider font-sans">
                        Step {step.order}
                    </span>
                </div>
                <p className="text-sm text-stone-705 dark:text-gray-200 leading-relaxed font-medium">
                    {formattedDesc}
                </p>
                {latexExpr && (
                    <div className="mt-1 text-stone-900 dark:text-white text-base font-semibold font-mono">
                        {latexExpr}
                    </div>
                )}
            </div>
        );
    };

    const renderedSolutions = result.solutions.map((sol, index) => {
        const isText = sol.type === 'text' || 
                       (/\s+/.test(sol.expression) && /[a-zA-Z]{3,}/.test(sol.expression)) ||
                       (/\s+/.test(sol.answer) && /[a-zA-Z]{3,}/.test(sol.answer)) ||
                       /^[a-zA-Z\s.,?!'-]{5,}$/.test(sol.expression) ||
                       /^[a-zA-Z\s.,?!'-]{5,}$/.test(sol.answer);

        const latexStr = isText 
            ? `${sol.expression} = ${sol.answer}`
            : `\\(${sol.expression} = ${sol.answer}\\)`;

        return (
            <div key={index} className="text-stone-900 dark:text-white text-base sm:text-lg font-medium leading-relaxed">
                {latexStr}
            </div>
        );
    });

    const summaryText = result.solutions.map(s => `${s.expression} = ${s.answer}`).join(', ');

    const rawScore = result.confidence_score;
    let confidenceRender = null;
    if (rawScore !== undefined && rawScore !== null) {
        const isFraction = rawScore <= 1.0;
        const percentage = isFraction ? Math.round(rawScore * 100) : Math.round(rawScore);
        const scoreVal = isFraction ? rawScore : rawScore / 100;

        let ringColor = 'red';
        let textColorClass = 'text-red-600 dark:text-red-400';
        let confidenceLevel = 'Low Confidence';

        if (scoreVal >= 0.85) {
            ringColor = 'teal';
            textColorClass = 'text-teal-600 dark:text-teal-400';
            confidenceLevel = 'High Confidence';
        } else if (scoreVal >= 0.60) {
            ringColor = 'yellow';
            textColorClass = 'text-yellow-600 dark:text-yellow-400';
            confidenceLevel = 'Moderate Confidence';
        }

        confidenceRender = (
            <Tooltip
                label={`AI Confidence: ${percentage}% (${confidenceLevel}). This represents how confident the AI model is in the correctness of this specific mathematical solution.`}
                withArrow
                position="top"
                transitionProps={{ transition: 'fade', duration: 150 }}
            >
                <div className="flex items-center gap-1.5 bg-stone-50 dark:bg-[#2c2c2c]/40 border border-stone-200 dark:border-[#444] rounded-full pl-1.5 pr-2.5 py-0.5 shadow-sm select-none">
                    <RingProgress
                        size={18}
                        thickness={2}
                        sections={[{ value: percentage, color: ringColor }]}
                        aria-label={`Confidence score: ${percentage}%`}
                    />
                    <span className={`text-[11px] font-extrabold tracking-tight font-sans ${textColorClass}`}>
                        {percentage}% Confident
                    </span>
                </div>
            </Tooltip>
        );
    }

    return (
        <div 
            ref={cardRef}
            className="absolute top-0 left-0 z-50 glassmorphic-card p-4 rounded-xl shadow-2xl cursor-move select-none flex flex-col overflow-hidden animate-[fadeIn_0.5s_ease-out_forwards]"
            style={{ 
                transform: `translate3d(${finalPosition.x}px, ${finalPosition.y}px, 0)`,
                width: isMinimized ? 'auto' : `${size.width}px`,
                height: isMinimized ? 'auto' : `${size.height}px`,
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
        >
            <div className="flex justify-between items-center gap-4 shrink-0">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                    {confidenceRender ? confidenceRender : (
                        <span className="text-xs font-bold px-2 py-1 bg-green-50 dark:bg-green-500/20 text-green-750 dark:text-green-400 rounded-full border border-green-200 dark:border-green-500/30 shrink-0">
                            AI Result
                        </span>
                    )}
                    {isMinimized && (
                        <span className="text-xs text-stone-600 dark:text-gray-300 font-medium truncate flex-1" title={summaryText}>
                            {summaryText}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-stone-500 dark:text-gray-400 font-mono">
                        {result.latency ? `${result.latency}ms` : ''}
                    </span>
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="w-3.5 h-3.5 rounded-full bg-purple-500 hover:bg-purple-400 border border-purple-600/50 transition-all cursor-pointer flex items-center justify-center group relative shadow-sm"
                        title={isMinimized ? "Maximize" : "Minimize"}
                    >
                        {isMinimized ? (
                            /* macOS style plus icon on hover */
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="w-1.5 h-[1.5px] bg-purple-950 absolute" />
                                <span className="h-1.5 w-[1.5px] bg-purple-950 absolute" />
                            </div>
                        ) : (
                            /* macOS style minus icon on hover */
                            <span className="w-1.5 h-[1.5px] bg-purple-950 opacity-0 group-hover:opacity-100 transition-opacity absolute" />
                        )}
                    </button>
                </div>
            </div>
            
            {!isMinimized && (
                <div className="mt-3 flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 gap-2">
                    <div className="latex-content text-stone-900 dark:text-white whitespace-normal break-words overflow-y-auto shrink-0 max-h-[45%] pr-1 flex flex-col gap-1.5 scrollbar-thin">
                        {renderedSolutions}
                    </div>


                    {steps && steps.length > 1 ? (
                        <div className="flex-1 flex flex-col overflow-hidden border-t border-stone-200 dark:border-white/10 pt-2 min-h-0 gap-2">
                            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 min-h-0 scrollbar-thin">
                                {showAllSteps ? (
                                    steps.map(step => renderStep(step))
                                ) : (
                                    renderStep(steps[currentStepIndex])
                                )}
                            </div>

                            {showAllSteps ? (
                                <div className="flex justify-between items-center bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-xl p-2 shrink-0">
                                    <span className="text-xs text-stone-500 dark:text-gray-400 font-bold font-sans pl-2">
                                        Showing all {steps.length} steps
                                    </span>
                                    <button
                                        onClick={() => setShowAllSteps(false)}
                                        className="cursor-pointer text-xs font-extrabold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-sans pl-3 py-0.5"
                                    >
                                        Switch to Paced View
                                    </button>
                                </div>
                            ) : (
                                <div className="flex justify-between items-center bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-xl p-2 shrink-0">
                                    <div className="flex gap-1.5">
                                        <button
                                            disabled={currentStepIndex === 0}
                                            onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
                                            className="cursor-pointer text-xs font-bold text-stone-700 dark:text-white px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-stone-50 dark:hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white dark:disabled:hover:bg-white/5 disabled:cursor-not-allowed transition-all font-sans animate-in fade-in"
                                        >
                                            ← Back
                                        </button>
                                        <button
                                            disabled={currentStepIndex === steps.length - 1}
                                            onClick={() => setCurrentStepIndex(prev => Math.min(steps.length - 1, prev + 1))}
                                            className="cursor-pointer text-xs font-bold text-amber-800 dark:text-white px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 disabled:opacity-30 disabled:hover:bg-amber-50 dark:disabled:hover:bg-amber-500/10 disabled:cursor-not-allowed transition-all font-sans animate-in fade-in"
                                        >
                                            Next step →
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-stone-500 dark:text-gray-400 font-bold font-sans">
                                            Step {currentStepIndex + 1} of {steps.length}
                                        </span>
                                        <button
                                            onClick={() => setShowAllSteps(true)}
                                            className="cursor-pointer text-xs font-extrabold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-sans border-l border-stone-200 dark:border-white/10 pl-3 py-0.5"
                                        >
                                            Show All
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        result.thought_process && (
                            <div className="flex-1 flex flex-col overflow-hidden border-t border-stone-200 dark:border-white/10 pt-2 min-h-0">
                                <button
                                    onClick={() => setShowThoughtProcess(!showThoughtProcess)}
                                    className="flex justify-between items-center text-sm text-stone-600 dark:text-gray-300 hover:text-stone-800 dark:hover:text-white py-1 shrink-0 cursor-pointer"
                                >
                                    <span>View Thought Process</span>
                                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showThoughtProcess ? 'rotate-180' : ''}`} />
                                </button>
                                {showThoughtProcess && (
                                    <div className="text-stone-500 dark:text-gray-400 text-sm leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto pr-1 mt-1 min-h-0">
                                        {formatMathText(result.thought_process)}
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            )}

            {!isMinimized && (
                <div 
                    className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-end justify-end pointer-events-auto z-[60]"
                    onMouseDown={handleResizeMouseDown}
                    onTouchStart={handleResizeTouchStart}
                >
                    <svg className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300 transition-colors pointer-events-none" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 0L0 10M10 4L4 10M10 8L8 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                </div>
            )}
        </div>
    );
};
