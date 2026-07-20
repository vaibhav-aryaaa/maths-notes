
import { Button } from '@/components/ui/button';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { SWATCHES } from '@/constants';
import { Eraser, Pen, MessageSquare, X, Menu, RotateCcw, Sparkles } from 'lucide-react';

declare global {
    interface Window {
        MathJax: any;
    }
}

// import {LazyBrush} from 'lazy-brush';

interface GeneratedResult {
    expression: string;
    answer: string;
    type?: string;
    thought_process?: string;
    confidence_score?: number;
    latency?: number;
}

interface Response {
    expr: string;
    result: string;
    assign: boolean;
    type?: string;
    thought_process?: string;
    confidence_score?: number;
    latency?: number;
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

const DraggableResultCard = ({ result, defaultPosition }: { result: GeneratedResult, defaultPosition: { x: number, y: number }, setPosition?: (pos: { x: number, y: number }) => void }) => {
    const [position, setPosition] = useState(defaultPosition);
    const [isDragging, setIsDragging] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const cardStart = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[data-slot^="accordion"]')) {
            return;
        }
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
        cardStart.current = { x: position.x, y: position.y };
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
        cardStart.current = { x: position.x, y: position.y };
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            setPosition({
                x: cardStart.current.x + dx,
                y: cardStart.current.y + dy
            });
        };

        const handleTouchMove = (e: TouchEvent) => {
            const touch = e.touches[0];
            const dx = touch.clientX - dragStart.current.x;
            const dy = touch.clientY - dragStart.current.y;
            setPosition({
                x: cardStart.current.x + dx,
                y: cardStart.current.y + dy
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
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
    }, [isDragging]);

    useEffect(() => {
        if (!isMinimized && window.MathJax) {
            setTimeout(() => {
                try {
                    window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
                } catch (e) {
                    console.error("MathJax typesetting failed:", e);
                }
            }, 50);
        }
    }, [isMinimized]);

    // Heuristic: If it has multiple spaces and at least one multi-letter English word, it is descriptive text.
    const isText = result.type === 'text' || 
                   (/\s+/.test(result.expression) && /[a-zA-Z]{3,}/.test(result.expression)) ||
                   (/\s+/.test(result.answer) && /[a-zA-Z]{3,}/.test(result.answer)) ||
                   /^[a-zA-Z\s.,?!'-]{5,}$/.test(result.expression) ||
                   /^[a-zA-Z\s.,?!'-]{5,}$/.test(result.answer);

    let latex = '';
    if (isText) {
        latex = `${result.expression} = ${result.answer}`;
    } else {
        latex = `\\(${result.expression} = ${result.answer}\\)`;
    }

    return (
        <div 
            className="absolute top-0 left-0 z-50 glassmorphic-card p-4 rounded-xl shadow-2xl w-[calc(100vw-32px)] sm:w-auto sm:min-w-[300px] sm:max-w-[500px] cursor-move select-none"
            style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
        >
            <div className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <span className="text-xs font-bold px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 shrink-0">
                        {result.confidence_score ? `${result.confidence_score}% Confident` : 'AI Result'}
                    </span>
                    {isMinimized && (
                        <span className="text-xs text-gray-300 font-medium truncate flex-1" title={`${result.expression} = ${result.answer}`}>
                            {result.expression.length > 25 ? `${result.expression.slice(0, 25)}...` : result.expression} = {result.answer}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400 font-mono">
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
                <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="latex-content text-white mb-4 whitespace-normal break-words">
                        {latex}
                    </div>

                    {result.thought_process && (
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="thought-process" className="border-white/10">
                                <AccordionTrigger className="text-sm text-gray-300 hover:text-white py-2">
                                    View Thought Process
                                </AccordionTrigger>
                                <AccordionContent className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">
                                    {formatMathText(result.thought_process)}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    )}
                </div>
            )}
        </div>
    );
};

export default function Home() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isEraser, setIsEraser] = useState(false);
    const [color, setColor] = useState('rgb(255, 255, 255)');
    const [reset, setReset] = useState(false);
    const [dictOfVars, setDictOfVars] = useState({});
    const [results, setResults] = useState<GeneratedResult[]>([]);
    const [latexPosition, setLatexPosition] = useState({ x: 10, y: 200 });
    const [isScanning, setIsScanning] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    // Math Co-Pilot state
    const [isCopilotOpen, setIsCopilotOpen] = useState(false);
    const [copilotMessages, setCopilotMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([
        { role: 'ai', text: "Ready to bend the rules of math? Draw your equations on the canvas, hit Run, and let's dissect the universe together. No problem is too wild!" }
    ]);
    const [copilotInput, setCopilotInput] = useState('');
    const [isCopilotLoading, setIsCopilotLoading] = useState(false);
    const sessionId = useRef(`session_${Date.now()}`);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Bounds tracking for canvas optimization
    const drawBoundsRef = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    const updateBounds = (x: number, y: number) => {
        if (x < drawBoundsRef.current.minX) drawBoundsRef.current.minX = x;
        if (x > drawBoundsRef.current.maxX) drawBoundsRef.current.maxX = x;
        if (y < drawBoundsRef.current.minY) drawBoundsRef.current.minY = y;
        if (y > drawBoundsRef.current.maxY) drawBoundsRef.current.maxY = y;
    };

    // const lazyBrush = new LazyBrush({
    //     radius: 10,
    //     enabled: true,
    //     initialPoint: { x: 0, y: 0 },
    // });

    useEffect(() => {
        if (results.length > 0 && window.MathJax) {
            setTimeout(() => {
                window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
            }, 0)
        }
    }, [results]);

    useEffect(() => {
        if (reset) {
            resetCanvas();
            setResults([]);
            setDictOfVars({});
            setReset(false);
        }
    }, [reset]);

    const colorRef = useRef(color);
    useEffect(() => {
        colorRef.current = color;
    }, [color]);

    useEffect(() => {
        const canvas = canvasRef.current;

        const handleResize = () => {
            let tempCanvas: HTMLCanvasElement | null = null;
            if (canvas) {
                tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                    tempCtx.drawImage(canvas, 0, 0);
                }
            }

            // Update layout sizes in state
            setWindowSize({ width: window.innerWidth, height: window.innerHeight });

            // Restore canvas contents on the next paint cycle
            requestAnimationFrame(() => {
                if (canvas && tempCanvas) {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.lineCap = 'round';
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = colorRef.current;
                        ctx.drawImage(tempCanvas, 0, 0);
                    }
                }
            });
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.lineCap = 'round';
                ctx.lineWidth = 3;
            }
        }
    }, [windowSize]);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML';
        script.async = true;
        document.head.appendChild(script);

        script.onload = () => {
            window.MathJax.Hub.Config({
                tex2jax: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
                CommonHTML: { linebreaks: { automatic: true } },
                "HTML-CSS": { linebreaks: { automatic: true } },
                SVG: { linebreaks: { automatic: true } }
            });
        };

        return () => {
            document.head.removeChild(script);
        };
    }, []);

    // Auto-scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [copilotMessages, isCopilotLoading]);

    const sendCopilotMessage = useCallback(async () => {
        const text = copilotInput.trim();
        if (!text || isCopilotLoading) return;

        const canvasImage = ''; // Omit heavy image bytes since copilot backend is text-only Llama and doesn't use it

        setCopilotMessages(prev => [...prev, { role: 'user', text }]);
        setCopilotInput('');
        setIsCopilotLoading(true);

        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/copilot`, {
                session_id: sessionId.current,
                message: text,
                canvas_image: canvasImage,
                dict_of_vars: dictOfVars,
                results: results.map(r => ({
                    expression: r.expression,
                    answer: r.answer,
                    thought_process: r.thought_process,
                })),
            });
            setCopilotMessages(prev => [...prev, { role: 'ai', text: res.data.reply }]);
        } catch (err: any) {
            setCopilotMessages(prev => [...prev, { role: 'ai', text: '⚠️ Sorry, I ran into an error. Please try again.' }]);
        } finally {
            setIsCopilotLoading(false);
        }
    }, [copilotInput, isCopilotLoading, dictOfVars]);


    const resetCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        drawBoundsRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.style.background = 'black';
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                setIsDrawing(true);
                if (!isEraser) {
                    updateBounds(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                }
            }
        }
    };
    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) {
            return;
        }
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                if (isEraser) {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.lineWidth = 20; // Thicker line for erasing
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    updateBounds(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                }
                ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                ctx.stroke();
            }
        }
    };
    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0] || e.changedTouches[0];
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    };

    const startDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.style.background = 'black';
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const pos = getTouchPos(e);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                setIsDrawing(true);
                if (!isEraser) {
                    updateBounds(pos.x, pos.y);
                }
            }
        }
    };

    const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                if (isEraser) {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.lineWidth = 20;
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                }
                const pos = getTouchPos(e);
                if (!isEraser) {
                    updateBounds(pos.x, pos.y);
                }
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
            }
        }
    };

    const stopDrawingTouch = () => {
        setIsDrawing(false);
    };

    const runRoute = async () => {
        const canvas = canvasRef.current;

        if (canvas) {
            const bounds = drawBoundsRef.current;

            // Check if anything was actually drawn
            if (bounds.minX === Infinity || bounds.minY === Infinity) {
                alert("Please draw something on the canvas first!");
                return;
            }

            setIsScanning(true);
            try {
                // Calculate cropped region with a padding of 20px
                const padding = 20;
                const cropX = Math.max(0, bounds.minX - padding);
                const cropY = Math.max(0, bounds.minY - padding);
                const cropWidth = Math.min(canvas.width - cropX, (bounds.maxX - bounds.minX) + padding * 2);
                const cropHeight = Math.min(canvas.height - cropY, (bounds.maxY - bounds.minY) + padding * 2);

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = cropWidth;
                tempCanvas.height = cropHeight;
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                    tempCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                }
                const croppedImageBase64 = tempCanvas.toDataURL('image/png');

                const response = await axios({
                    method: 'post',
                    url: `${import.meta.env.VITE_API_URL}/calculate`,
                    data: {
                        image: croppedImageBase64,
                        dict_of_vars: dictOfVars
                    }
                });

                const resp = await response.data;
                console.log('Response', resp);
                
                const newVars = { ...dictOfVars };
                resp.data.forEach((data: Response) => {
                    if (data.assign === true) {
                        (newVars as any)[data.expr] = data.result;
                    }
                });
                setDictOfVars(newVars);

                // Calculate center point from the pre-tracked bounds
                const centerX = (bounds.minX + bounds.maxX) / 2;
                const centerY = (bounds.minY + bounds.maxY) / 2;

                // Clamp position so card is within screen bounds
                const cardWidth = window.innerWidth < 640 ? window.innerWidth - 32 : 300;
                const clampedX = Math.max(16, Math.min(centerX - cardWidth / 2, window.innerWidth - cardWidth - 16));
                const clampedY = Math.max(80, Math.min(centerY, window.innerHeight - 200));

                setLatexPosition({ x: clampedX, y: clampedY });
                
                const newResults: GeneratedResult[] = resp.data.map((data: Response) => ({
                    expression: data.expr,
                    answer: data.result,
                    type: data.type,
                    thought_process: data.thought_process,
                    confidence_score: data.confidence_score,
                    latency: data.latency
                }));

                // Immediately update results and clear canvas (no artificial delay!)
                setResults([...results, ...newResults]);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
                drawBoundsRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

            } catch (error: any) {
                console.error("Failed to run AI", error);
                alert(`AI API Error: ${error.response?.data?.message || error.message || "Failed to process image"}. You may have hit a rate limit. Please wait a moment and try again.`);
            } finally {
                setIsScanning(false);
            }
        }
    };

    return (
        <>
            {/* Sidebar Overlay Backdrop (mobile only) */}
            {isSidebarOpen && (
                <div 
                    className="absolute inset-0 bg-black/60 z-30 lg:hidden pointer-events-auto"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Agent Memory Side Panel */}
            <div className={`absolute top-0 left-0 w-64 h-full bg-black/90 backdrop-blur-md border-r border-white/10 p-5 z-40 text-white shadow-2xl transition-transform duration-300 ease-in-out pt-[calc(1.25rem+env(safe-area-inset-top))] pl-[calc(1.25rem+env(safe-area-inset-left))] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                {/* SolveIQ Logo Branding (spaced for the toggle button) */}
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10 pl-12">
                    <span className="text-xl font-extrabold tracking-tight">
                        solve<span className="text-[#d97706]">IQ</span>
                    </span>
                </div>
                <h2 className="text-lg font-bold mb-4 tracking-wider uppercase text-gray-300 border-b border-white/10 pb-2">Agent Memory</h2>
                {Object.keys(dictOfVars).length === 0 ? (
                    <p className="text-gray-400 text-sm">No variables detected yet. Draw an equation like "x = 5" to store state.</p>
                ) : (
                    <div className="flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-160px)] pr-1">
                        {Object.entries(dictOfVars).map(([key, value]) => (
                            <div key={key} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10 shadow-inner">
                                <span className="text-xl font-mono text-purple-400">{key}</span>
                                <span className="text-xl font-mono text-green-400">= {value as React.ReactNode}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Sidebar Toggle Button (Top-Left) */}
            <div className="absolute z-50 top-[calc(1rem+env(safe-area-inset-top))] left-[calc(1rem+env(safe-area-inset-left))] pointer-events-auto">
                <Button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`bg-[#1e1e1e] hover:bg-[#2e2e2e] text-white border border-[#333] transition-all shadow-lg p-2.5 h-10 w-10 rounded-lg flex items-center justify-center ${isSidebarOpen ? 'bg-[#333] border-white/20' : ''}`}
                    variant="default"
                    title="Toggle Sidebar"
                >
                    {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
                </Button>
            </div>

            {/* Centered Horizontal Toolbar (inspired by Excalidraw Whiteboards) */}
            <div className="absolute z-50 top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#1e1e1e] border border-[#333] p-1.5 rounded-xl shadow-lg pointer-events-auto">
                {/* Erase / Draw Button */}
                <Button
                    onClick={() => setIsEraser(!isEraser)}
                    className={`bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] transition-all p-2 h-8 flex items-center justify-center gap-1.5 rounded-lg min-w-[70px] ${isEraser ? 'bg-[#3c3c3c] border-white/20' : ''}`}
                    variant="default"
                    title={isEraser ? "Switch to Pen" : "Switch to Eraser"}
                >
                    {isEraser ? <Pen size={14} className="text-amber-500" /> : <Eraser size={14} className="text-gray-300" />}
                    <span className="text-xs font-semibold select-none">{isEraser ? 'Draw' : 'Erase'}</span>
                </Button>

                {/* Reset Button */}
                <Button
                    onClick={() => setReset(true)}
                    className="bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] transition-all p-2 h-8 flex items-center justify-center gap-1.5 rounded-lg min-w-[70px]"
                    variant="default"
                    title="Reset Canvas"
                >
                    <RotateCcw size={14} className="text-red-400" />
                    <span className="text-xs font-semibold select-none font-sans">Reset</span>
                </Button>

                {/* Divider */}
                <div className="h-5 w-[1px] bg-[#333] mx-1" />

                {/* Color Picker Toggle Button */}
                <div className="relative">
                    <button
                        onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
                        className={`bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] border border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 w-8 transition-all ${isColorPickerOpen ? 'bg-[#3c3c3c] border-white/20' : ''}`}
                        title="Choose Color"
                    >
                        <div 
                            className="w-3.5 h-3.5 rounded-full border border-white/30" 
                            style={{ backgroundColor: color }} 
                        />
                    </button>
                    
                    {/* Color Picker Popover (centered below center bar) */}
                    {isColorPickerOpen && (
                        <div className="absolute top-11 left-1/2 -translate-x-1/2 bg-[#18181c] border border-[#2d2d30] p-3 rounded-xl shadow-2xl z-50 flex flex-col gap-2 min-w-[200px] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="grid grid-cols-6 gap-2">
                                {SWATCHES.map((swatch) => (
                                    <button
                                        key={swatch}
                                        onClick={() => {
                                            setColor(swatch);
                                            setIsColorPickerOpen(false);
                                        }}
                                        className={`cursor-pointer hover:scale-110 transition-transform h-6 w-6 rounded-full border border-white/10 ${color === swatch ? 'ring-2 ring-white border-black scale-110' : ''}`}
                                        style={{ backgroundColor: swatch }}
                                        title={swatch}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Top Right Run Button */}
            <div className="absolute z-50 top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] pointer-events-auto">
                <Button
                    onClick={runRoute}
                    className="bg-[#1e1e1e] hover:bg-[#2e2e2e] text-white border border-[#333] transition-all shadow-lg p-2.5 h-10 flex items-center justify-center gap-1.5 rounded-lg"
                    variant="default"
                    title="Run Analysis"
                >
                    <Sparkles size={16} className="text-amber-500 animate-pulse" />
                    <span className="text-xs font-semibold select-none font-sans">Run</span>
                </Button>
            </div>

            {/* Main Interactive Canvas */}
            <canvas
                ref={canvasRef}
                id="canvas"
                className="absolute top-0 left-0 w-full h-full touch-none"
                width={windowSize.width}
                height={windowSize.height}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawingTouch}
                onTouchMove={drawTouch}
                onTouchEnd={stopDrawingTouch}
            />

            {results && results.map((result, index) => (
                <DraggableResultCard
                    key={index}
                    result={result}
                    defaultPosition={{ x: latexPosition.x, y: latexPosition.y + index * 120 }}
                    setPosition={setLatexPosition}
                />
            ))}

            {isScanning && <div className="scanning-laser" />}

            <button
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className="absolute bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-500/40 hover:scale-110 active:scale-95 transition-all duration-200 border border-white/20 cursor-pointer"
                title="Vector"
            >
                {isCopilotOpen ? <X size={22} className="text-white" /> : <MessageSquare size={22} className="text-white" />}
            </button>

            {isCopilotOpen && (
                <div className="absolute bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-50 w-auto sm:w-[360px] h-[480px] sm:h-[520px] flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-stone-200/80 bg-white/95 backdrop-blur-md">
                    <div className="flex-1 overflow-y-auto px-5 pb-5 pt-8 flex flex-col gap-4 scrollbar-thin">
                        {copilotMessages.map((msg, i) => {
                            if (i === 0) {
                                return (
                                    <div key={i} className="flex flex-col items-center py-4 select-none">
                                        <div className="relative w-24 h-24 mb-3 flex items-center justify-center">
                                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-yellow-400 opacity-40 blur-xl animate-pulse" />
                                            <div className="relative w-18 h-18 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-yellow-400 shadow-lg shadow-orange-500/25 flex items-center justify-center overflow-hidden">
                                                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-45" />
                                            </div>
                                        </div>
                                        <p className="text-stone-900 font-extrabold text-lg sm:text-xl tracking-tight mb-2">Vector</p>
                                        <p className="text-center text-stone-600 text-sm leading-relaxed font-medium px-4">
                                            {msg.text}
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                        msg.role === 'user'
                                            ? 'bg-stone-900 text-white rounded-br-sm'
                                            : 'bg-stone-100 border border-stone-200/50 text-stone-850 rounded-bl-sm'
                                    }`}>
                                        {msg.text}
                                    </div>
                                </div>
                            );
                        })}
                        {isCopilotLoading && (
                            <div className="flex justify-start animate-fade-in">
                                <div className="bg-stone-100 border border-stone-200/50 px-4 py-2.5 rounded-2xl rounded-bl-sm flex gap-1.5 items-center shadow-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="px-4 pb-4 pt-2 bg-white">
                        <div className="flex items-center gap-2 bg-stone-50 border border-stone-200/60 rounded-2xl px-4 py-2.5 focus-within:border-stone-400 focus-within:ring-2 focus-within:ring-stone-100 transition-all shadow-sm">
                            <input
                                type="text"
                                value={copilotInput}
                                onChange={(e) => setCopilotInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        sendCopilotMessage();
                                    }
                                }}
                                placeholder="Ask about your canvas..."
                                className="flex-1 bg-transparent text-sm text-stone-800 placeholder-stone-400 outline-none font-sans"
                            />
                            <button
                                onClick={sendCopilotMessage}
                                disabled={isCopilotLoading || !copilotInput.trim()}
                                className="w-8 h-8 rounded-full bg-stone-950 hover:bg-stone-800 text-white flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
                            >
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                    <line x1="12" y1="19" x2="12" y2="5"></line>
                                    <polyline points="5 12 12 5 19 12"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}