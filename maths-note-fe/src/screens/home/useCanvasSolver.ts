import { useState } from 'react';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import type { GeneratedResult, DictOfVars, CalculateResponseItem } from '@/types';

export const useCanvasSolver = (
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    drawBoundsRef: React.RefObject<{ minX: number; minY: number; maxX: number; maxY: number }>,
    onSaveHistory?: (canvas: HTMLCanvasElement, allResults: GeneratedResult[], dictOfVars: DictOfVars) => void
) => {
    const [dictOfVars, setDictOfVars] = useState<DictOfVars>({});
    const [results, setResults] = useState<GeneratedResult[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [latexPosition, setLatexPosition] = useState({ x: 10, y: 200 });

    const runRoute = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const bounds = drawBoundsRef.current;
        if (!bounds || bounds.minX === Infinity || bounds.minY === Infinity) {
            notifications.show({
                title: 'Empty Canvas',
                message: 'Please draw something on the canvas first!',
                color: 'yellow',
                autoClose: 4000
            });
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
                tempCtx.fillStyle = 'black';
                tempCtx.fillRect(0, 0, cropWidth, cropHeight);
                tempCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
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
            resp.data.forEach((data: CalculateResponseItem) => {
                if (data.assign === true) {
                    newVars[data.expr] = data.result;
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
            
            if (resp.data && resp.data.length > 0) {
                const solutions = resp.data.map((data: CalculateResponseItem) => ({
                    expression: data.expr,
                    answer: data.result,
                    type: data.type
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
                    steps: steps && steps.length > 0 ? steps : undefined
                };

                const updatedResults = [...results, newResult];
                setResults(updatedResults);
                onSaveHistory?.(canvas, updatedResults, dictOfVars);
            }
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            
            // Mutate ref properties directly
            bounds.minX = Infinity;
            bounds.minY = Infinity;
            bounds.maxX = -Infinity;
            bounds.maxY = -Infinity;

        } catch (error: unknown) {
            console.error("Failed to run AI", error);
            let errorMsg = "Failed to process image";
            if (axios.isAxiosError(error)) {
                errorMsg = error.response?.data?.detail || error.message || errorMsg;
            } else if (error instanceof Error) {
                errorMsg = error.message;
            }
            notifications.show({
                title: 'AI API Error',
                message: `${errorMsg}. Please wait a moment and try again.`,
                color: 'red',
                autoClose: 6000
            });
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
