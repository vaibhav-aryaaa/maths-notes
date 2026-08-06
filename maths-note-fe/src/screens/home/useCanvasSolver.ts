import { useState } from 'react';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import type { GeneratedResult, DictOfVars, CalculateResponseItem } from '@/types';
import { trackEvent } from '@/lib/analytics';

export const useCanvasSolver = (
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    masterCanvasRef: React.RefObject<HTMLCanvasElement | null>,
    drawBoundsRef: React.RefObject<{ minX: number; minY: number; maxX: number; maxY: number }>,
    onSaveHistory?: (canvas: HTMLCanvasElement, allResults: GeneratedResult[], dictOfVars: DictOfVars) => void,
    redrawViewCanvas?: () => void
) => {
    const [dictOfVars, setDictOfVars] = useState<DictOfVars>({});
    const [results, setResults] = useState<GeneratedResult[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [latexPosition, setLatexPosition] = useState({ x: 10, y: 200 });

    const runRoute = async (
        selection?: { type: 'rect' | 'lasso'; points: { x: number; y: number }[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } },
        onStartScan?: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => void
    ) => {
        if (!navigator.onLine) {
            notifications.show({
                title: 'Offline Mode',
                message: "You're offline — solving requires an internet connection.",
                color: 'red',
                autoClose: 5000
            });
            return;
        }

        const canvas = canvasRef.current;
        const masterCanvas = masterCanvasRef.current;
        if (!canvas || !masterCanvas) return;

        const bounds = selection ? selection.bounds : drawBoundsRef.current;
        if (!selection && (!bounds || bounds.minX === Infinity || bounds.minY === Infinity)) {
            notifications.show({
                title: 'Empty Canvas',
                message: 'Please draw something on the canvas first!',
                color: 'yellow',
                autoClose: 4000
            });
            return;
        }

        if (onStartScan) {
            onStartScan(bounds);
        }
        trackEvent('solve_attempted', { selection_type: selection ? selection.type : 'full' });
        setIsScanning(true);
        try {
            // Calculate cropped region with a padding of 20px
            const padding = 20;
            const cropX = Math.max(0, bounds.minX - padding);
            const cropY = Math.max(0, bounds.minY - padding);
            const cropWidth = Math.min(masterCanvas.width - cropX, (bounds.maxX - bounds.minX) + padding * 2);
            const cropHeight = Math.min(masterCanvas.height - cropY, (bounds.maxY - bounds.minY) + padding * 2);

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = cropWidth;
            tempCanvas.height = cropHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.fillStyle = 'black';
                tempCtx.fillRect(0, 0, cropWidth, cropHeight);
                
                // For exact-shape lasso selection, apply a clipping path mask
                if (selection && selection.type === 'lasso') {
                    tempCtx.save();
                    tempCtx.beginPath();
                    const points = selection.points;
                    if (points.length > 0) {
                        tempCtx.moveTo(points[0].x - cropX, points[0].y - cropY);
                        for (let i = 1; i < points.length; i++) {
                            tempCtx.lineTo(points[i].x - cropX, points[i].y - cropY);
                        }
                        tempCtx.closePath();
                        tempCtx.clip();
                    }
                }
                
                tempCtx.drawImage(masterCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                
                if (selection && selection.type === 'lasso') {
                    tempCtx.restore();
                }
            }
            const croppedImageBase64 = tempCanvas.toDataURL('image/png');

            const response = await axios({
                method: 'post',
                url: `${import.meta.env.VITE_API_URL}/calculate`,
                data: {
                    image: croppedImageBase64,
                    dict_of_vars: dictOfVars
                },
                headers: {
                    'X-App-Key': import.meta.env.VITE_APP_KEY || ''
                }
            });

            const resp = response.data;
            
            const newVars = { ...dictOfVars };
            if ((resp.status === 'success' || resp.type === 'success') && Array.isArray(resp.data)) {
                resp.data.forEach((data: CalculateResponseItem) => {
                    if (data.assign && data.expr !== undefined) {
                        newVars[data.expr] = data.result;
                    }
                });
                setDictOfVars(newVars);

                const solutions = resp.data.map((d: CalculateResponseItem) => ({
                    expression: d.expr || '',
                    answer: d.result || '',
                    type: d.type
                }));

                const maxConfidence = Math.max(...resp.data.map((d: CalculateResponseItem) => d.confidence_score || 0));
                const maxLatency = Math.max(...resp.data.map((d: CalculateResponseItem) => d.latency || 0));
                const thoughtProcess = resp.data.find((d: CalculateResponseItem) => d.thought_process)?.thought_process;
                const steps = resp.data.find((d: CalculateResponseItem) => d.steps)?.steps;

                const newResult: GeneratedResult = {
                    id: crypto.randomUUID(),
                    solutions,
                    thought_process: thoughtProcess,
                    confidence_score: maxConfidence > 0 ? maxConfidence : undefined,
                    latency: maxLatency > 0 ? maxLatency : undefined,
                    steps: steps && steps.length > 0 ? steps : undefined,
                    bounds: bounds ? { ...bounds } : undefined,
                    isSelection: !!selection
                };

                const updatedResults = [...results, newResult];
                setResults(updatedResults);
                onSaveHistory?.(masterCanvas, updatedResults, dictOfVars);

                trackEvent('solve_succeeded', {
                    solution_count: solutions.length,
                    confidence: maxConfidence > 0 ? maxConfidence : undefined,
                    latency: maxLatency > 0 ? maxLatency : undefined
                });
            }
            
            // Canvas is no longer cleared after solve in 7B
            redrawViewCanvas?.();

        } catch (error: unknown) {
            console.error("Failed to run AI", error);
            let errorMsg = "Failed to process image";
            let isOfflineError = !navigator.onLine;
            
            if (axios.isAxiosError(error)) {
                if (error.message === "Network Error" || !error.response) {
                    isOfflineError = true;
                }
                errorMsg = error.response?.data?.detail || error.message || errorMsg;
            } else if (error instanceof Error) {
                errorMsg = error.message;
            }
            
            trackEvent('solve_failed', { error_type: isOfflineError ? 'offline' : 'api_error' });

            if (isOfflineError) {
                notifications.show({
                    title: 'Offline Mode',
                    message: "You're offline — solving requires an internet connection.",
                    color: 'red',
                    autoClose: 6000
                });
            } else {
                notifications.show({
                    title: 'Error',
                    message: errorMsg,
                    color: 'red',
                    autoClose: 6000
                });
            }
        } finally {
            setIsScanning(false);
        }
    };

    return {
        dictOfVars,
        setDictOfVars,
        results,
        setResults,
        isScanning,
        latexPosition,
        setLatexPosition,
        runRoute,
    };
};
