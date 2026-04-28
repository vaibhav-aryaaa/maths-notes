import { ColorSwatch, Group } from '@mantine/core';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable';
import {SWATCHES} from '@/constants';
import { Eraser, Pen } from 'lucide-react';

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

const DraggableResultCard = ({ result, defaultPosition, setPosition }: { result: GeneratedResult, defaultPosition: {x: number, y: number}, setPosition: (pos: {x: number, y: number}) => void }) => {
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
                tex2jax: {inlineMath: [['$', '$'], ['\\(', '\\)']]},
                CommonHTML: { linebreaks: { automatic: true } },
                "HTML-CSS": { linebreaks: { automatic: true } },
                SVG: { linebreaks: { automatic: true } }
            });
        };

        return () => {
            document.head.removeChild(script);
        };

    }, []);




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

            } catch (error) {
                console.error("Failed to run AI", error);
            } finally {
                setIsScanning(false);
            }
        }
    };

    return (
        <>
            {/* Agent Memory Side Panel */}
            <div className="absolute top-0 left-0 w-64 h-full bg-black/50 backdrop-blur-md border-r border-white/20 p-5 z-40 text-white shadow-2xl transition-all duration-300">
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
                    defaultPosition={{x: latexPosition.x, y: latexPosition.y + index * 120}}
                    setPosition={setLatexPosition}
                />
            ))}
            
            {isScanning && <div className="scanning-laser" />}
        </>
    );
}