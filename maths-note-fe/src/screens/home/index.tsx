import { ColorSwatch, Group } from '@mantine/core';
import { Button } from '@/components/ui/button';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable';
import { SWATCHES } from '@/constants';
import { Eraser, Pen, MessageSquare, X, Send, Bot } from 'lucide-react';

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

const DraggableResultCard = ({ result, defaultPosition, setPosition }: { result: GeneratedResult, defaultPosition: { x: number, y: number }, setPosition: (pos: { x: number, y: number }) => void }) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    let latex = '';
    if (result.type === 'text') {
        latex = `${result.expression} = ${result.answer}`;
    } else {
        latex = `\\(${result.expression} = ${result.answer}\\)`;
    }

    return (
        <Draggable
            nodeRef={nodeRef}
            defaultPosition={defaultPosition}
            onStop={(e, data) => setPosition({ x: data.x, y: data.y })}
        >
            <div ref={nodeRef} className="absolute z-50 glassmorphic-card p-4 rounded-xl shadow-2xl min-w-[300px] max-w-[500px] cursor-move">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                        {result.confidence_score ? `${result.confidence_score}% Confident` : 'AI Result'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                        {result.latency ? `${result.latency}ms` : ''}
                    </span>
                </div>

                <div className="latex-content text-white mb-4">
                    {latex}
                </div>

                {result.thought_process && (
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="thought-process" className="border-white/10">
                            <AccordionTrigger className="text-sm text-gray-300 hover:text-white py-2">
                                View Thought Process
                            </AccordionTrigger>
                            <AccordionContent className="text-gray-400 text-sm leading-relaxed">
                                {result.thought_process}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}
            </div>
        </Draggable>
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

    // Math Co-Pilot state
    const [isCopilotOpen, setIsCopilotOpen] = useState(false);
    const [copilotMessages, setCopilotMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([
        { role: 'ai', text: '👋 Hi! I am your Math Co-Pilot. Run your canvas first, then ask me anything about it!' }
    ]);
    const [copilotInput, setCopilotInput] = useState('');
    const [isCopilotLoading, setIsCopilotLoading] = useState(false);
    const sessionId = useRef(`session_${Date.now()}`);
    const chatEndRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        const canvas = canvasRef.current;

        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight - canvas.offsetTop;
                ctx.lineCap = 'round';
                ctx.lineWidth = 3;
            }

        }
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

        const canvas = canvasRef.current;
        const canvasImage = canvas ? canvas.toDataURL('image/png') : '';

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
                }
                ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                ctx.stroke();
            }
        }
    };
    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const runRoute = async () => {
        const canvas = canvasRef.current;

        if (canvas) {
            setIsScanning(true);
            try {
                const response = await axios({
                    method: 'post',
                    url: `${import.meta.env.VITE_API_URL}/calculate`,
                    data: {
                        image: canvas.toDataURL('image/png'),
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
                const ctx = canvas.getContext('2d');
                const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
                let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        const i = (y * canvas.width + x) * 4;
                        if (imageData.data[i + 3] > 0) {  // If pixel is not transparent
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x);
                            maxY = Math.max(maxY, y);
                        }
                    }
                }

                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;

                setLatexPosition({ x: centerX, y: centerY });
                const newResults: GeneratedResult[] = resp.data.map((data: Response) => ({
                    expression: data.expr,
                    answer: data.result,
                    type: data.type,
                    thought_process: data.thought_process,
                    confidence_score: data.confidence_score,
                    latency: data.latency
                }));

                setTimeout(() => {
                    setResults([...results, ...newResults]);
                    // Clear the main canvas after processing
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                }, 1000);

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
            {/* Agent Memory Side Panel */}
            <div className="absolute top-0 left-0 w-64 h-full bg-black/50 backdrop-blur-md border-r border-white/20 p-5 z-40 text-white shadow-2xl transition-all duration-300">
                {/* SolveIQ Logo Branding */}
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-blue-500/30">
                        S
                    </div>
                    <span className="text-xl font-extrabold tracking-tight">
                        solve<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">IQ</span>
                    </span>
                </div>
                <h2 className="text-lg font-bold mb-4 tracking-wider uppercase text-gray-300 border-b border-white/10 pb-2">Agent Memory</h2>
                {Object.keys(dictOfVars).length === 0 ? (
                    <p className="text-gray-400 text-sm">No variables detected yet. Draw an equation like "x = 5" to store state.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {Object.entries(dictOfVars).map(([key, value]) => (
                            <div key={key} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10 shadow-inner">
                                <span className="text-xl font-mono text-purple-400">{key}</span>
                                <span className="text-xl font-mono text-green-400">= {value as React.ReactNode}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className='absolute z-50 top-4 right-4 flex gap-4'>
                <Button
                    onClick={() => setIsEraser(!isEraser)}
                    className={`bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 text-white transition-all shadow-lg ${isEraser ? 'bg-white/30 border-white' : ''}`}
                    variant='default'
                    title="Toggle Eraser"
                >
                    {isEraser ? <Pen size={18} className="mr-2" /> : <Eraser size={18} className="mr-2" />}
                    {isEraser ? 'Draw' : 'Erase'}
                </Button>
                <Button
                    onClick={() => setReset(true)}
                    className='bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 text-white transition-all shadow-lg'
                    variant='default'
                >
                    Reset
                </Button>
                <Group className='bg-white/10 backdrop-blur-sm border border-white/20 p-1.5 rounded-lg shadow-lg'>
                    {SWATCHES.map((swatch) => (
                        <ColorSwatch key={swatch} color={swatch} onClick={() => setColor(swatch)} className="cursor-pointer hover:scale-110 transition-transform" />
                    ))}
                </Group>
                <Button
                    onClick={runRoute}
                    className='bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 text-white transition-all shadow-lg'
                    variant='default'
                >
                    Run
                </Button>
            </div>
            <canvas
                ref={canvasRef}
                id='canvas'
                className='absolute top-0 left-0 w-full h-full'
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
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

            {/* Co-Pilot Toggle Button */}
            <button
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className="absolute bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/40 hover:scale-110 active:scale-95 transition-all duration-200 border border-white/20"
                title="Math Co-Pilot"
            >
                {isCopilotOpen ? <X size={22} className="text-white" /> : <MessageSquare size={22} className="text-white" />}
            </button>

            {/* Co-Pilot Chat Panel */}
            {isCopilotOpen && (
                <div className="absolute bottom-24 right-6 z-50 w-[360px] h-[480px] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10" style={{ background: 'rgba(10,10,20,0.92)', backdropFilter: 'blur(20px)' }}>
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center">
                            <Bot size={16} className="text-white" />
                        </div>
                        <div>
                            <p className="text-white font-bold text-sm">Math Co-Pilot</p>
                            <p className="text-gray-400 text-xs">Powered by Gemini</p>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-thin">
                        {copilotMessages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-br-sm'
                                        : 'bg-white/10 text-gray-200 rounded-bl-sm border border-white/10'
                                    }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isCopilotLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white/10 border border-white/10 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
                                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div className="px-3 py-3 border-t border-white/10 flex gap-2">
                        <input
                            type="text"
                            value={copilotInput}
                            onChange={(e) => setCopilotInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCopilotMessage(); } }}
                            placeholder="Ask about your canvas..."
                            className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <button
                            onClick={sendCopilotMessage}
                            disabled={isCopilotLoading || !copilotInput.trim()}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center disabled:opacity-40 hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                        >
                            <Send size={16} className="text-white" />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}