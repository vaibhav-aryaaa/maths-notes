import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Loader2, AlertCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DraggableResultCard } from '@/components/DraggableResultCard';
import type { GeneratedResult } from '@/types';

export default function ShareView() {
    const { shareId } = useParams<{ shareId: string }>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [shareData, setShareData] = useState<{ image: string; result: GeneratedResult } | null>(null);

    useEffect(() => {
        const fetchShare = async () => {
            if (!shareId) return;
            try {
                setLoading(true);
                setError(null);
                const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:5001';
                const response = await axios.get(`${apiHost}/share/${shareId}`);
                
                if (response.data && response.data.status === 'success') {
                    const rawData = response.data.data;
                    
                    // Reconstruct GeneratedResult from backend list of CalculationResult
                    const solutions = rawData.map((d: any) => ({
                        expression: d.expr || '',
                        answer: d.result || '',
                        type: d.type
                    }));

                    const maxConfidence = Math.max(...rawData.map((d: any) => d.confidence_score || 0));
                    const maxLatency = Math.max(...rawData.map((d: any) => d.latency || 0));
                    const thoughtProcess = rawData.find((d: any) => d.thought_process)?.thought_process;
                    const steps = rawData.find((d: any) => d.steps)?.steps;

                    const reconstructedResult: GeneratedResult = {
                        id: `share-${shareId}`,
                        solutions,
                        thought_process: thoughtProcess,
                        confidence_score: maxConfidence > 0 ? maxConfidence : undefined,
                        latency: maxLatency > 0 ? maxLatency : undefined,
                        steps: steps && steps.length > 0 ? steps : undefined,
                    };

                    setShareData({
                        image: response.data.image,
                        result: reconstructedResult
                    });

                    // Dynamically set OG meta tags for social media previews
                    document.title = "Shared Math Solution | SolveIQ";
                    
                    const metaTitle = document.querySelector('meta[property="og:title"]');
                    if (metaTitle) metaTitle.setAttribute('content', 'Shared Math Solution - SolveIQ');

                    const metaDesc = document.querySelector('meta[property="og:description"]');
                    if (metaDesc) metaDesc.setAttribute('content', 'Take a look at this handwritten math solution generated on SolveIQ.');

                    const metaImage = document.querySelector('meta[property="og:image"]');
                    if (metaImage) metaImage.setAttribute('content', response.data.image);
                } else {
                    setError("Unexpected response structure.");
                }
            } catch (err: any) {
                console.error("Failed to load share:", err);
                if (err.response && err.response.status === 404) {
                    setError("This shared solution has expired (shares expire after 30 days) or does not exist.");
                } else {
                    setError("Failed to load the shared solution. Please check your network connection.");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchShare();
    }, [shareId]);

    return (
        <div className="min-h-screen w-full bg-slate-50 dark:bg-black text-stone-900 dark:text-white flex flex-col font-sans selection:bg-stone-500/20">
            {/* Minimal Header */}
            <header className="w-full border-b border-stone-200 dark:border-stone-900/60 bg-white/70 dark:bg-black/50 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0 z-20">
                <Link to="/" className="flex items-center gap-2 font-bold text-lg text-stone-900 dark:text-white hover:opacity-85 transition-opacity">
                    <span className="text-stone-900 dark:text-white font-extrabold tracking-tight">SolveIQ</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-900 text-stone-700 dark:text-stone-300 font-semibold border border-stone-250 dark:border-white/10">
                        Share
                    </span>
                </Link>
                <Link to="/">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold cursor-pointer border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-900">
                        Try SolveIQ <ExternalLink size={12} />
                    </Button>
                </Link>
            </header>

            {/* Main Area */}
            <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10 flex flex-col items-center justify-center min-h-0">
                {loading ? (
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin text-stone-900 dark:text-white w-10 h-10" />
                        <p className="text-stone-500 dark:text-gray-400 text-sm font-medium">Retrieving shared solution...</p>
                    </div>
                ) : error ? (
                    <div className="glassmorphic-card max-w-md w-full p-8 rounded-2xl border border-stone-200 dark:border-[#333] text-center shadow-xl flex flex-col items-center gap-4">
                        <AlertCircle className="w-12 h-12 text-red-500" />
                        <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white">Solution Not Found</h2>
                        <p className="text-stone-500 dark:text-gray-400 text-sm leading-relaxed">
                            {error}
                        </p>
                        <div className="w-full h-[1px] bg-stone-200 dark:bg-white/10 my-1" />
                        <Link to="/" className="w-full">
                            <Button className="w-full gap-2 cursor-pointer bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-white dark:text-stone-950 font-semibold h-10">
                                <ArrowLeft size={16} /> Back to Canvas
                            </Button>
                        </Link>
                    </div>
                ) : shareData ? (
                    <div className="w-full flex flex-col xl:flex-row items-center xl:items-start justify-center gap-10">
                        {/* Canvas Image Container */}
                        <div className="flex flex-col gap-2 max-w-full xl:max-w-[55%]">
                            <span className="text-xs uppercase font-extrabold text-stone-400 dark:text-gray-500 tracking-wider">
                                Canvas crop
                            </span>
                            <div className="bg-stone-900 dark:bg-black rounded-2xl border border-stone-300 dark:border-stone-850 p-6 shadow-2xl overflow-hidden flex items-center justify-center relative">
                                {/* Ambient backglow behind image */}
                                <div className="absolute w-[60%] h-[60%] bg-stone-500/10 rounded-full blur-[80px] pointer-events-none" />
                                <img
                                    src={shareData.image}
                                    alt="Cropped canvas math problem"
                                    className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-inner border border-stone-800/20 relative z-10"
                                />
                            </div>
                        </div>

                        {/* Solutions Card Container */}
                        <div className="flex flex-col gap-2 w-[450px] max-w-full shrink-0">
                            <span className="text-xs uppercase font-extrabold text-stone-400 dark:text-gray-500 tracking-wider pl-1">
                                SolveIQ Answer
                            </span>
                            {/* DraggableResultCard is read-only and rendered statically inside this relative container */}
                            <div className="relative w-full h-[320px]">
                                <DraggableResultCard
                                    result={shareData.result}
                                    defaultPosition={{ x: 0, y: 0 }}
                                    readOnly={true}
                                />
                            </div>
                        </div>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
