import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { SWATCHES } from '@/constants';
import { Eraser, Pen, Highlighter, PenTool, Paintbrush, MessageSquare, X, Menu, Sparkles, Square, Circle, Triangle, Slash, Undo2, Redo2, Maximize, Trash2, Crop, Scissors, Sun, Moon, Eye } from 'lucide-react';
import { DraggableResultCard } from '@/components/DraggableResultCard';
import { ResultSkeleton } from '@/components/ResultSkeleton';
import { useMathCanvas } from './useMathCanvas';
import { useCanvasSolver } from './useCanvasSolver';
import { rasterizeRegion } from './canvasUtils';
import { useCopilotChat } from './useCopilotChat';
import { Modal, useMantineColorScheme, Slider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import axios from 'axios';

import { useSolveHistory } from '@/hooks/useSolveHistory';
import { trackEvent } from '@/lib/analytics';
import { HistorySidebar } from '@/components/HistorySidebar';
import { AuthManager } from '@/components/AuthManager';
import { CopilotPanel } from '@/components/CopilotPanel';

import { EXAMPLE_PROBLEMS } from '@/data/exampleProblems';

const HIGHLIGHTER_SWATCHES = [
    '#FEF08A', // pastel yellow
    '#BBF7D0', // pastel green
    '#FBCFE8', // pastel pink
    '#BFDBFE', // pastel blue
    '#E9D5FF'  // pastel purple
];

const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {
        console.warn("navigator.clipboard failed, trying fallback:", e);
    }

    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        console.error("Fallback copy failed:", err);
        return false;
    }
};

const WIDTH_RANGES: Record<string, { min: number; max: number; default: number }> = {
    pen: { min: 1, max: 12, default: 3 },
    fountain: { min: 1, max: 16, default: 4 },
    marker: { min: 8, max: 40, default: 18 },
    highlighter: { min: 10, max: 36, default: 16 },
    eraser: { min: 4, max: 40, default: 12 },
};

export default function Home() {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const [activeSolveRegion, setActiveSolveRegion] = useState<{
        bounds: { minX: number; minY: number; maxX: number; maxY: number };
        status: 'scanning' | 'solved';
    } | null>(null);
    const [skeletonRegion, setSkeletonRegion] = useState<{ bounds: { minX: number; minY: number; maxX: number; maxY: number } } | null>(null);
    const [skeletonVisible, setSkeletonVisible] = useState(false);

    const [isFocusMode, setIsFocusMode] = useState(false);
    const [showFocusHint, setShowFocusHint] = useState(false);
    const [hasSeenFocusHint, setHasSeenFocusHint] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('hasSeenFocusHint') === 'true';
        }
        return false;
    });

    const toggleFocusMode = useCallback(() => {
        setIsFocusMode(prev => {
            const next = !prev;
            if (next && !hasSeenFocusHint) {
                setShowFocusHint(true);
                setTimeout(() => {
                    setShowFocusHint(false);
                    setHasSeenFocusHint(true);
                    localStorage.setItem('hasSeenFocusHint', 'true');
                }, 4000);
            } else {
                setShowFocusHint(false);
            }
            return next;
        });
    }, [hasSeenFocusHint]);

    const selectionSolveRef = useRef<((selection: any) => void) | null>(null);
    const handleSelectionSolve = useCallback((selection: { type: 'rect' | 'lasso'; points: { x: number; y: number }[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }) => {
        setActiveSolveRegion({ bounds: selection.bounds, status: 'scanning' });
        setSkeletonRegion({ bounds: selection.bounds });
        setSkeletonVisible(true);
        selectionSolveRef.current?.(selection);
    }, []);

    const {
        canvasRef,
        masterCanvasRef,
        drawBoundsRef,
        isDrawing,
        setIsEraser,
        activeTool,
        setActiveTool,
        color,
        setColor,
        strokeWidth,
        setStrokeWidth,
        eraserWidth,
        setEraserWidth,
        selectedShape,
        setSelectedShape,
        isShapeMenuOpen,
        setIsShapeMenuOpen,
        windowSize,
        resetCanvas,
        startDrawing,
        draw,
        stopDrawing,
        startDrawingTouch,
        drawTouch,
        stopDrawingTouch,
        drawStrokes,
        isCanvasEmpty,
        setIsCanvasEmpty,
        canUndo,
        canRedo,
        undo,
        redo,
        camera,
        resetView,
        redrawViewCanvas,
        strokesRef,
    } = useMathCanvas(handleSelectionSolve);

    const [savedInkColor, setSavedInkColor] = useState('rgb(255, 255, 255)');
    const [savedHighlighterColor, setSavedHighlighterColor] = useState('#FEF08A');

    const [toolWidths, setToolWidths] = useState<Record<string, number>>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('solvelq_tool_widths');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.warn(e);
                }
            }
        }
        return {
            pen: 3,
            fountain: 4,
            marker: 18,
            highlighter: 16,
            eraser: 12,
        };
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('solvelq_tool_widths', JSON.stringify(toolWidths));
        }
    }, [toolWidths]);

    const prevToolRef = useRef(activeTool);

    useEffect(() => {
        // Save the previous tool's width first before updating
        const prevTool = prevToolRef.current;
        if (['pen', 'fountain', 'marker', 'highlighter', 'eraser'].includes(prevTool)) {
            const currentWidth = prevTool === 'eraser' ? eraserWidth : strokeWidth;
            setToolWidths(prev => ({ ...prev, [prevTool]: currentWidth }));
        }

        // Apply new tool's color and width
        const nextWidth = toolWidths[activeTool] ?? WIDTH_RANGES[activeTool]?.default ?? 3;
        if (activeTool === 'eraser') {
            setEraserWidth(nextWidth);
        } else {
            setStrokeWidth(nextWidth);
        }

        if (activeTool === 'highlighter') {
            if (!HIGHLIGHTER_SWATCHES.includes(color)) {
                setSavedInkColor(color);
            }
            setColor(savedHighlighterColor);
        } else if (['pen', 'fountain', 'marker'].includes(activeTool)) {
            if (HIGHLIGHTER_SWATCHES.includes(color)) {
                setSavedHighlighterColor(color);
            }
            setColor(savedInkColor);
        }

        prevToolRef.current = activeTool;
    }, [activeTool]);

    const handleWidthChange = (val: number) => {
        setToolWidths(prev => ({ ...prev, [activeTool]: val }));
        if (activeTool === 'eraser') {
            setEraserWidth(val);
        } else {
            setStrokeWidth(val);
        }
    };

    const { 
        history, 
        saveHistoryEntry, 
        clearHistory, 
        deleteHistoryItem,
        getHistoryEntryImage,
        user
    } = useSolveHistory();

    const {
        dictOfVars,
        setDictOfVars,
        results,
        setResults,
        isScanning,
        latexPosition,
        setLatexPosition,
        runRoute,
    } = useCanvasSolver(
        canvasRef,
        strokesRef,
        drawBoundsRef,
        (canvas, allResults, currentDict) => {
            saveHistoryEntry(canvas, allResults, currentDict, strokesRef.current);
        },
        redrawViewCanvas
    );

    useEffect(() => {
        selectionSolveRef.current = runRoute;
    }, [runRoute]);

    const [cardOffsets, setCardOffsets] = useState<Record<string, { x: number; y: number }>>({});

    const lastResultsLengthRef = useRef(results.length);
    useEffect(() => {
        if (!isScanning) {
            setTimeout(() => {
                setSkeletonVisible(false);
            }, 0);
            const timer = setTimeout(() => {
                setSkeletonRegion(null);
            }, 500);

            if (results.length > lastResultsLengthRef.current) {
                setActiveSolveRegion(prev => {
                    if (prev && prev.status === 'scanning') {
                        return { ...prev, status: 'solved' };
                    }
                    return prev;
                });
            } else {
                setActiveSolveRegion(prev => {
                    if (prev && prev.status === 'scanning') {
                        return null;
                    }
                    return prev;
                });
            }
            lastResultsLengthRef.current = results.length;

            return () => clearTimeout(timer);
        }
    }, [isScanning, results]);

    const getCardPosition = useCallback((result: any, index: number) => {
        if (result.bounds) {
            const worldAnchorX = result.bounds.maxX + 20;
            const worldAnchorY = result.bounds.minY;
            const offset = cardOffsets[result.id] || { x: 0, y: 0 };
            return {
                x: (worldAnchorX + offset.x) * camera.scale + camera.offsetX,
                y: (worldAnchorY + offset.y) * camera.scale + camera.offsetY
            };
        }
        return { x: latexPosition.x, y: latexPosition.y + index * 120 };
    }, [cardOffsets, camera.scale, camera.offsetX, camera.offsetY, latexPosition.x, latexPosition.y]);

    const handleCardPositionChange = useCallback((result: any, newScreenPos: { x: number; y: number }) => {
        if (result.bounds) {
            const worldAnchorX = result.bounds.maxX + 20;
            const worldAnchorY = result.bounds.minY;
            const worldX = (newScreenPos.x - camera.offsetX) / camera.scale;
            const worldY = (newScreenPos.y - camera.offsetY) / camera.scale;
            setCardOffsets(prev => ({
                ...prev,
                [result.id]: {
                    x: worldX - worldAnchorX,
                    y: worldY - worldAnchorY
                }
            }));
        } else {
            setLatexPosition(newScreenPos);
        }
    }, [camera.scale, camera.offsetX, camera.offsetY, setLatexPosition]);

    const handleShareResult = useCallback(async (result: any) => {
        const bounds = result.bounds || drawBoundsRef.current;
        let croppedImageBase64: string;

        if (bounds && bounds.minX !== Infinity && bounds.minY !== Infinity) {
            // Calculate cropped region with a padding of 20px
            const padding = 20;
            const cropX = Math.max(0, bounds.minX - padding);
            const cropY = Math.max(0, bounds.minY - padding);
            const cropWidth = Math.min(12000 - cropX, (bounds.maxX - bounds.minX) + padding * 2);
            const cropHeight = Math.min(12000 - cropY, (bounds.maxY - bounds.minY) + padding * 2);

            const tempCanvas = rasterizeRegion(strokesRef.current, { x: cropX, y: cropY, width: cropWidth, height: cropHeight });
            croppedImageBase64 = tempCanvas.toDataURL('image/png');
        } else {
            // Fallback to a default center region or empty black canvas if nothing drawn
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 300;
            tempCanvas.height = 300;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.fillStyle = 'black';
                tempCtx.fillRect(0, 0, 300, 300);
            }
            croppedImageBase64 = tempCanvas.toDataURL('image/png');
        }

        // Show generating toast
        const shareNotificationId = 'generating-share';
        notifications.show({
            id: shareNotificationId,
            loading: true,
            title: 'Generating Shareable Link',
            message: 'Saving solution to persistent storage...',
            autoClose: false,
            withCloseButton: false,
            color: 'gray'
        });

        try {
            const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:5001';
            
            // Map solutions to CalculationResult format expected by backend
            const payloadData = result.solutions.map((sol: any) => ({
                expr: sol.expression,
                result: sol.answer,
                type: sol.type || 'math',
                thought_process: result.thought_process,
                confidence_score: result.confidence_score,
                latency: result.latency,
                steps: result.steps
            }));

            const response = await axios({
                method: 'post',
                url: `${apiHost}/share`,
                data: {
                    image: croppedImageBase64,
                    data: payloadData
                },
                headers: {
                    'X-App-Key': import.meta.env.VITE_APP_KEY || ''
                }
            });

            if (response.data && response.data.share_id) {
                trackEvent('share_created');
                const shareUrl = `${window.location.origin}/share/${response.data.share_id}`;
                
                const copied = await copyToClipboard(shareUrl);
                
                notifications.update({
                    id: shareNotificationId,
                    loading: false,
                    title: copied ? 'Link Copied!' : 'Link Generated!',
                    message: copied 
                        ? 'Shareable link has been copied to your clipboard.'
                        : `Shareable link (copy manually): ${shareUrl}`,
                    color: 'teal',
                    autoClose: copied ? 4000 : 12000
                });
            } else {
                throw new Error("Invalid response from sharing server");
            }
        } catch (error) {
            console.error("Failed to generate share link:", error);
            let errorMessage = 'Failed to save solution to server. Please try again.';
            if (axios.isAxiosError(error) && error.response?.data) {
                const data = error.response.data;
                if (data.error) {
                    errorMessage = data.error;
                } else if (data.detail) {
                    errorMessage = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
                }
            }
            notifications.update({
                id: shareNotificationId,
                loading: false,
                title: 'Sharing Failed',
                message: errorMessage,
                color: 'red',
                autoClose: 8000
            });
        }
    }, [masterCanvasRef]);

    const getSelectionBox = useCallback((bounds: any) => {
        if (!bounds || bounds.minX === Infinity || bounds.minY === Infinity) {
            return null;
        }
        
        const padding = 20;
        const cropX = Math.max(0, bounds.minX - padding);
        const cropY = Math.max(0, bounds.minY - padding);
        const cropWidth = Math.min(12000 - cropX, (bounds.maxX - bounds.minX) + padding * 2);
        const cropHeight = Math.min(12000 - cropY, (bounds.maxY - bounds.minY) + padding * 2);

        return {
            x: cropX * camera.scale + camera.offsetX,
            y: cropY * camera.scale + camera.offsetY,
            width: cropWidth * camera.scale,
            height: cropHeight * camera.scale
        };
    }, [camera.scale, camera.offsetX, camera.offsetY]);

    const activeSolveBox = activeSolveRegion ? getSelectionBox(activeSolveRegion.bounds) : null;

    const handleSelectHistoryEntry = (entry: any) => {
        if (entry.strokes) {
            strokesRef.current = entry.strokes.map((s: any) => ({
                ...s,
                points: s.points.map((pt: any) => ({ ...pt }))
            }));
            setIsCanvasEmpty(entry.strokes.length === 0);
            
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            entry.strokes.forEach((stroke: any) => {
                stroke.points.forEach((pt: any) => {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                });
            });
            drawBoundsRef.current = { minX, minY, maxX, maxY };
            resetView();
        } else {
            // Lazy-allocate masterCanvasRef.current for legacy loading fallback
            if (!masterCanvasRef.current) {
                masterCanvasRef.current = document.createElement('canvas');
                masterCanvasRef.current.width = 12000;
                masterCanvasRef.current.height = 12000;
            }
            const masterCanvas = masterCanvasRef.current;
            const masterCtx = masterCanvas.getContext('2d');
            if (!masterCtx) return;
            const img = new Image();
            img.src = entry.canvasImage;
            img.onload = () => {
                masterCtx.fillStyle = 'black';
                masterCtx.fillRect(0, 0, masterCanvas.width, masterCanvas.height);
                const xOffset = 6000 - img.width / 2;
                const yOffset = 6000 - img.height / 2;
                masterCtx.drawImage(img, xOffset, yOffset);
                setIsCanvasEmpty(false);
                strokesRef.current = [];
                
                drawBoundsRef.current.minX = xOffset;
                drawBoundsRef.current.minY = yOffset;
                drawBoundsRef.current.maxX = xOffset + img.width;
                drawBoundsRef.current.maxY = yOffset + img.height;
                resetView();
            };
        }

        setResults(entry.results);
        setDictOfVars(entry.dictOfVars);
        redrawViewCanvas();
    };

    const {
        isCopilotOpen,
        setIsCopilotOpen,
        copilotMessages,
        copilotInput,
        setCopilotInput,
        isCopilotLoading,
        isCopilotStreaming,
        sendCopilotMessage,
    } = useCopilotChat(dictOfVars, results);

    const handleTryExample = (problem: typeof EXAMPLE_PROBLEMS[number]) => {
        trackEvent('example_clicked', {
            example_id: problem.id,
            example_name: problem.name
        });
        setResults([]);
        setDictOfVars({});
        drawStrokes(problem.strokes);
        setTimeout(() => {
            runRoute();
        }, 600);
    };

    const showExamples = isCanvasEmpty && results.length === 0 && !isFocusMode;

    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeTag = document.activeElement?.tagName.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.getAttribute('contenteditable') === 'true') {
                return;
            }

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

            // Undo: cmd/ctrl + z
            if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undo();
            }
            // Redo: cmd/ctrl + shift + z
            else if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                redo();
            }
            // Pen: P
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'p') {
                setActiveTool('pen');
                setSelectedShape('freehand');
            }
            // Eraser: E
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'e') {
                setActiveTool('eraser');
            }
            // Line: L
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'l') {
                setActiveTool('pen');
                setSelectedShape('line');
            }
            // Rectangle: R
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'r') {
                setActiveTool('pen');
                setSelectedShape('rectangle');
            }
            // Circle: C
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'c') {
                setActiveTool('pen');
                setSelectedShape('circle');
            }
            // Triangle: T
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 't') {
                setActiveTool('pen');
                setSelectedShape('triangle');
            }
            // Focus Mode: F
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                toggleFocusMode();
            }
            // Help: ? (shift + /)
            else if (e.key === '?') {
                e.preventDefault();
                setIsShortcutsOpen(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, setIsEraser, setSelectedShape, toggleFocusMode]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);

    return (
        <>
            {/* Left side collapsible Sidebar panel containing Memory and Solve History */}
            <HistorySidebar
                isOpen={isSidebarOpen && !isFocusMode}
                onClose={() => setIsSidebarOpen(false)}
                dictOfVars={dictOfVars}
                history={history}
                onSelectEntry={handleSelectHistoryEntry}
                onClearHistory={clearHistory}
                onDeleteEntry={deleteHistoryItem}
                getHistoryEntryImage={getHistoryEntryImage}
            />

            {/* Sidebar Toggle & Standalone Logo Button (Top-Left) */}
            <div className={`absolute z-controls top-[calc(1.25rem+env(safe-area-inset-top))] left-[calc(1.25rem+env(safe-area-inset-left))] flex items-center gap-3 pointer-events-auto transition-opacity duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <Button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`bg-white dark:bg-[#1e1e1e] hover:bg-slate-50 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-white border border-stone-200 dark:border-[#333] transition-all shadow-lg p-2.5 h-10 w-10 rounded-lg flex items-center justify-center ${isSidebarOpen ? 'bg-slate-100 dark:bg-[#333] border-stone-300 dark:border-white/20' : ''}`}
                    variant="default"
                    title="Toggle Sidebar"
                    aria-label={isSidebarOpen ? "Close history and memory sidebar" : "Open history and memory sidebar"}
                >
                    {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
                </Button>

                {/* Standalone Logo when Sidebar is closed */}
                {!isSidebarOpen && (
                    <div className="flex items-center gap-2 bg-white/90 dark:bg-black/80 backdrop-blur-md px-3.5 h-10 border border-stone-200 dark:border-[#333] rounded-xl shadow-lg animate-in fade-in slide-in-from-left-4 duration-300">
                        <span className="text-sm font-extrabold tracking-tight font-sans select-none">
                            solve<span className="text-stone-900 dark:text-white">IQ</span>
                        </span>
                    </div>
                )}
            </div>

            {/* Centered Horizontal Toolbar */}
            <div className={`absolute z-controls top-[calc(1.25rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 flex items-center bg-white/95 dark:bg-[#1c1c1f]/95 border border-stone-200/80 dark:border-stone-800/80 px-2.5 h-12 rounded-xl shadow-xl pointer-events-auto transition-all duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'} gap-1`}>
                {/* Tool Selector Segmented Control */}
                <div className="flex items-center gap-1">
                    {[
                        { id: 'pen' as const, label: 'Pen', icon: <Pen size={14} /> },
                        { id: 'fountain' as const, label: 'Fountain Pen', icon: <PenTool size={14} /> },
                        { id: 'marker' as const, label: 'Marker', icon: <Paintbrush size={14} /> },
                        { id: 'highlighter' as const, label: 'Highlighter', icon: <Highlighter size={14} /> },
                        { id: 'eraser' as const, label: 'Eraser', icon: <Eraser size={14} /> },
                        { id: 'select-lasso' as const, label: 'Lasso Solve', icon: <Scissors size={14} /> },
                        { id: 'select-rect' as const, label: 'Rect Solve', icon: <Crop size={14} /> },
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => {
                                setActiveTool(t.id);
                                if (t.id === 'pen' || t.id === 'fountain' || t.id === 'marker' || t.id === 'highlighter') {
                                    setSelectedShape('freehand');
                                }
                            }}
                            className={`cursor-pointer transition-all w-9 h-9 flex items-center justify-center rounded-lg ${
                                activeTool === t.id 
                                    ? 'bg-stone-100 dark:bg-white/10 text-stone-950 dark:text-white font-bold shadow-none' 
                                    : 'hover:bg-stone-100 dark:hover:bg-white/5 text-stone-600 dark:text-gray-300'
                            }`}
                            title={t.label}
                            aria-label={`Select ${t.label} tool`}
                        >
                            {t.icon}
                        </button>
                    ))}
                </div>

                {/* Divider */}
                <div className="h-6 w-[1px] bg-stone-200 dark:bg-stone-800 mx-1" />

                {/* Clear Canvas Button */}
                <Button
                    onClick={() => {
                        setActiveSolveRegion(null);
                        resetCanvas();
                    }}
                    className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-9 w-9 p-0 flex items-center justify-center rounded-lg"
                    variant="default"
                    title="Clear Canvas (Destroy whiteboard content)"
                    aria-label="Clear all content from whiteboard canvas"
                >
                    <Trash2 size={14} className="text-red-500 dark:text-red-400" />
                </Button>

                {/* Undo Button */}
                <Button
                    onClick={undo}
                    disabled={!canUndo}
                    className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-9 w-9 p-0 flex items-center justify-center rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
                    variant="default"
                    title="Undo (Ctrl+Z / ⌘+Z)"
                    aria-label="Undo last canvas stroke"
                >
                    <Undo2 size={14} className="text-stone-500 dark:text-gray-300" />
                </Button>

                {/* Redo Button */}
                <Button
                    onClick={redo}
                    disabled={!canRedo}
                    className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-9 w-9 p-0 flex items-center justify-center rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
                    variant="default"
                    title="Redo (Ctrl+Shift+Z / ⌘+Shift+Z)"
                    aria-label="Redo last undone canvas stroke"
                >
                    <Redo2 size={14} className="text-stone-500 dark:text-gray-300" />
                </Button>

                {/* Reset View Button */}
                <Button
                    onClick={resetView}
                    className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-9 w-9 p-0 flex items-center justify-center rounded-lg cursor-pointer"
                    variant="default"
                    title="Reset View (Ctrl+0)"
                    aria-label="Reset zoom and pan position of canvas workspace"
                >
                    <Maximize size={14} className="text-stone-500 dark:text-gray-300" />
                </Button>

                {['pen', 'fountain', 'marker', 'highlighter'].includes(activeTool) && (
                    <>
                        {/* Shape Tool Selector Button */}
                        {activeTool === 'pen' && (
                            <>
                                {/* Divider */}
                                <div className="h-6 w-[1px] bg-stone-200 dark:bg-stone-800 mx-1" />
                                <div className="relative">
                                    <button
                                        onClick={() => {
                                            setIsShapeMenuOpen(!isShapeMenuOpen);
                                        }}
                                        className={`bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white rounded-lg flex items-center justify-center h-9 w-9 transition-all cursor-pointer ${isShapeMenuOpen ? 'bg-stone-100 dark:bg-white/10' : ''}`}
                                        title="Select Drawing Tool"
                                        aria-label={`Select shape drawing tool (currently active: ${selectedShape === 'freehand' ? 'Pen' : selectedShape})`}
                                    >
                                        {selectedShape === 'freehand' && <Pen size={14} className="text-stone-500 dark:text-gray-300" />}
                                        {selectedShape === 'line' && <Slash size={14} className="text-stone-500 dark:text-gray-300" />}
                                        {selectedShape === 'rectangle' && <Square size={14} className="text-stone-500 dark:text-gray-300" />}
                                        {selectedShape === 'circle' && <Circle size={14} className="text-stone-500 dark:text-gray-300" />}
                                        {selectedShape === 'triangle' && <Triangle size={14} className="text-stone-500 dark:text-gray-300" />}
                                    </button>
                                    
                                    {isShapeMenuOpen && (
                                        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-white dark:bg-[#18181c] border border-stone-200 dark:border-[#2d2d30] p-1.5 rounded-xl shadow-2xl z-50 flex flex-col gap-0.5 min-w-[125px] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-150">
                                            {[
                                                { id: 'freehand' as const, label: 'Pen', icon: <Pen size={13} /> },
                                                { id: 'line' as const, label: 'Line', icon: <Slash size={13} /> },
                                                { id: 'rectangle' as const, label: 'Rectangle', icon: <Square size={13} /> },
                                                { id: 'circle' as const, label: 'Circle', icon: <Circle size={13} /> },
                                                { id: 'triangle' as const, label: 'Triangle', icon: <Triangle size={13} /> },
                                            ].map((tool) => (
                                                <button
                                                    key={tool.id}
                                                    onClick={() => {
                                                        setSelectedShape(tool.id);
                                                        setActiveTool('pen');
                                                        setIsShapeMenuOpen(false);
                                                    }}
                                                    className={`cursor-pointer hover:bg-stone-100 dark:hover:bg-white/5 transition-colors p-1.5 text-left rounded-lg text-xs flex items-center gap-2 w-full text-stone-700 dark:text-white ${selectedShape === tool.id ? 'bg-stone-150 dark:bg-white/10 font-bold' : ''}`}
                                                    aria-label={`Use ${tool.label} drawing tool`}
                                                >
                                                    <span className="text-stone-400 dark:text-gray-400">{tool.icon}</span>
                                                    <span>{tool.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Divider */}
                        <div className="h-6 w-[1px] bg-stone-200 dark:bg-stone-800 mx-1" />

                        {/* Inline Color Palette Swatches */}
                        <div className="flex items-center gap-2 px-1.5 flex-shrink-0">
                            {(activeTool === 'highlighter' ? HIGHLIGHTER_SWATCHES : SWATCHES).map((swatch) => (
                                <button
                                    key={swatch}
                                    onClick={() => setColor(swatch)}
                                    className={`cursor-pointer w-4 h-4 rounded-full border border-stone-200 dark:border-white/20 transition-all hover:scale-110 active:scale-90 ${
                                        color === swatch 
                                            ? 'ring-2 ring-stone-900 dark:ring-stone-100 ring-offset-2 ring-offset-white dark:ring-offset-[#1c1c1f] scale-110' 
                                             : ''
                                    }`}
                                    style={{ backgroundColor: swatch }}
                                    title={swatch}
                                    aria-label={`Select brush color ${swatch}`}
                                />
                            ))}
                        </div>

                        {/* Divider */}
                        <div className="h-6 w-[1px] bg-stone-200 dark:bg-stone-800 mx-1" />

                        {/* Stroke Width Slider */}
                        <div className="flex items-center gap-2 pl-1.5 flex-shrink-0 select-none">
                            <Slider
                                size="xs"
                                w={80}
                                min={WIDTH_RANGES[activeTool]?.min ?? 1}
                                max={WIDTH_RANGES[activeTool]?.max ?? 20}
                                value={strokeWidth}
                                onChange={handleWidthChange}
                                label={null}
                                styles={{
                                    thumb: { transition: 'transform 100ms ease' }
                                }}
                            />
                            <span className="text-[11px] font-bold text-stone-500 dark:text-gray-400 font-mono w-7 text-right select-none">{strokeWidth}px</span>
                        </div>
                    </>
                )}

                {/* Eraser specific settings: Sizes */}
                {activeTool === 'eraser' && (
                    <>
                        {/* Divider */}
                        <div className="h-6 w-[1px] bg-stone-200 dark:bg-stone-800 mx-1" />

                        {/* Eraser Width Slider */}
                        <div className="flex items-center gap-2 pl-1.5 flex-shrink-0 select-none">
                            <Slider
                                size="xs"
                                w={80}
                                min={WIDTH_RANGES.eraser.min}
                                max={WIDTH_RANGES.eraser.max}
                                value={eraserWidth}
                                onChange={handleWidthChange}
                                label={null}
                                styles={{
                                    thumb: { transition: 'transform 100ms ease' }
                                }}
                            />
                            <span className="text-[11px] font-bold text-stone-500 dark:text-gray-400 font-mono w-7 text-right select-none">{eraserWidth}px</span>
                        </div>
                    </>
                )}

                {/* Divider */}
                <div className="h-6 w-[1px] bg-stone-200 dark:bg-stone-800 mx-1" />

                {/* Cloud Sync Manager */}
                <AuthManager user={user} clearHistory={clearHistory} />

                {/* Keyboard Shortcuts Button */}
                <Button
                    onClick={() => setIsShortcutsOpen(true)}
                    className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-9 w-9 p-0 flex items-center justify-center rounded-lg cursor-pointer font-bold font-sans text-xs"
                    variant="default"
                    title="Keyboard Shortcuts (?)"
                    aria-label="Open Keyboard Shortcuts Reference list"
                >
                    ?
                </Button>

                {/* Theme Toggle Button */}
                <Button
                    onClick={toggleColorScheme}
                    className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-9 w-9 p-0 flex items-center justify-center rounded-lg cursor-pointer"
                    variant="default"
                    title={colorScheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    aria-label={colorScheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {colorScheme === 'dark' ? <Sun size={14} className="text-stone-900 dark:text-stone-100" /> : <Moon size={14} className="text-stone-600" />}
                </Button>

                {/* Focus/Presentation Mode Button */}
                <Button
                    onClick={toggleFocusMode}
                    className={`bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-9 w-9 p-0 flex items-center justify-center rounded-lg cursor-pointer ${isFocusMode ? 'bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-700' : ''}`}
                    variant="default"
                    title="Focus Mode (F)"
                    aria-label="Toggle Fullscreen Focus Mode"
                >
                    <Eye size={14} className={isFocusMode ? 'text-stone-955 dark:text-white' : 'text-stone-500 dark:text-gray-300'} />
                </Button>
            </div>

            {/* Top Right Run Button */}
            <div className={`absolute z-controls top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] pointer-events-auto transition-opacity duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <Button
                    onClick={() => runRoute(undefined, (bounds) => {
                        setActiveSolveRegion({ bounds, status: 'scanning' });
                        setSkeletonRegion({ bounds });
                        setSkeletonVisible(true);
                    })}
                    className="bg-white dark:bg-[#1e1e1e] hover:bg-slate-50 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-white border border-stone-200 dark:border-[#333] transition-all shadow-lg p-2.5 h-10 flex items-center justify-center gap-1.5 rounded-lg"
                    variant="default"
                    title="Run Analysis"
                    aria-label="Run AI calculation solver on canvas whiteboard content"
                >
                    <Sparkles size={16} className="text-stone-900 dark:text-stone-100 animate-pulse" />
                    <span className="text-xs font-semibold select-none font-sans">Run</span>
                </Button>
            </div>

            {/* Main Interactive Canvas */}
            <canvas
                ref={canvasRef}
                id="canvas"
                className={`absolute top-0 left-0 w-full h-full touch-none transition-all duration-300 ${colorScheme === 'light' ? 'invert-[0.93] hue-rotate-180' : ''}`}
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
            {activeSolveBox && activeSolveRegion && (
                <div 
                    className={`absolute inset-0 z-canvas-overlay pointer-events-none transition-opacity duration-200 ${
                        isDrawing ? 'opacity-0' : 'opacity-100'
                    }`}
                >
                    <svg className="w-full h-full">
                        <rect
                            x={activeSolveBox.x}
                            y={activeSolveBox.y}
                            width={activeSolveBox.width}
                            height={activeSolveBox.height}
                            fill={activeSolveRegion.status === 'scanning' ? 'rgba(120, 113, 108, 0.05)' : 'none'}
                            stroke={activeSolveRegion.status === 'scanning' ? 'rgba(120, 113, 108, 0.6)' : 'rgba(120, 113, 108, 0.35)'}
                            strokeWidth={activeSolveRegion.status === 'scanning' ? '2' : '1.5'}
                            strokeDasharray={activeSolveRegion.status === 'scanning' ? '6 4' : '4 4'}
                            rx="4"
                            className={activeSolveRegion.status === 'scanning' ? 'animate-pulse' : ''}
                        />
                        <text
                            x={activeSolveBox.x + 8}
                            y={activeSolveBox.y - 6 < 15 ? activeSolveBox.y + 14 : activeSolveBox.y - 6}
                            fill="rgba(120, 113, 108, 0.8)"
                            className="text-[9px] font-sans font-bold select-none uppercase tracking-wider"
                        >
                            {activeSolveRegion.status === 'scanning' ? 'Solving Region...' : 'Solved Region'}
                        </text>
                    </svg>
                </div>
            )}
            {skeletonRegion && (
                <div className={`transition-opacity duration-500 ${skeletonVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <ResultSkeleton 
                        position={getCardPosition({ bounds: skeletonRegion.bounds }, results.length)} 
                        zoomScale={camera.scale}
                    />
                </div>
            )}
            {results && results.map((result, index) => (
                <DraggableResultCard
                    key={result.id || index}
                    result={result}
                    defaultPosition={getCardPosition(result, index)}
                    setPosition={(newPos) => handleCardPositionChange(result, newPos)}
                    onShare={handleShareResult}
                    zoomScale={camera.scale}
                />
            ))}

            {isScanning && <div className="scanning-laser" />}

            {showExamples && (
                <div className="absolute top-[40%] sm:top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-canvas-placeholder flex flex-col items-center gap-6 max-w-lg w-full px-6 text-center select-none pointer-events-none">
                    <div className="flex flex-col items-center gap-2 pointer-events-auto">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-white tracking-tight">
                            Unlock the Power of <span className="text-stone-900 dark:text-white font-extrabold">SolveIQ</span>
                        </h2>
                        <p className="text-stone-500 dark:text-gray-400 text-sm max-w-sm">
                            Draw your equations or click one of our pre-baked math examples below to see SolveIQ scan and solve in real-time.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-2 pointer-events-auto">
                        {EXAMPLE_PROBLEMS.map((problem) => (
                            <button
                                key={problem.id}
                                onClick={() => handleTryExample(problem)}
                                className="cursor-pointer flex flex-col text-left p-3.5 rounded-xl border border-stone-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-stone-50 dark:hover:bg-white/10 hover:border-stone-300 dark:hover:border-white/20 active:scale-[0.98] transition-all text-stone-900 dark:text-white backdrop-blur-md shadow-lg group"
                            >
                                <span className="text-sm font-bold text-stone-900 dark:text-white group-hover:opacity-85 flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-stone-900 dark:text-stone-100 animate-pulse" />
                                    {problem.name}
                                </span>
                                <span className="text-xs text-stone-500 dark:text-gray-400 mt-1 leading-normal line-clamp-2">
                                    {problem.description}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className={`absolute bottom-6 right-6 z-controls w-14 h-14 rounded-full bg-stone-950 dark:bg-white hover:bg-stone-850 dark:hover:bg-stone-100 flex items-center justify-center shadow-lg shadow-stone-950/20 dark:shadow-white/5 hover:scale-110 active:scale-95 transition-all duration-300 border border-stone-800 dark:border-stone-200 cursor-pointer ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                title="Vector"
                aria-label={isCopilotOpen ? "Close AI Copilot chat" : "Open AI Copilot chat"}
            >
                {isCopilotOpen ? <X size={22} className="text-white dark:text-stone-950" /> : <MessageSquare size={22} className="text-white dark:text-stone-950" />}
            </button>

            {/* Copilot Sidebar Panel */}
            {isCopilotOpen && !isFocusMode && (
                <CopilotPanel
                    copilotMessages={copilotMessages}
                    copilotInput={copilotInput}
                    setCopilotInput={setCopilotInput}
                    isCopilotStreaming={isCopilotStreaming}
                    isCopilotLoading={isCopilotLoading}
                    sendCopilotMessage={sendCopilotMessage}
                    onClose={() => setIsCopilotOpen(false)}
                />
            )}
            <Modal
                opened={isShortcutsOpen}
                onClose={() => setIsShortcutsOpen(false)}
                title={<span className={`font-bold ${colorScheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>Keyboard Shortcuts Reference</span>}
                centered
                styles={{
                    content: {
                        backgroundColor: colorScheme === 'dark' ? '#1c1917' : '#ffffff',
                        border: colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '16px',
                        color: colorScheme === 'dark' ? 'white' : '#1c1917',
                    },
                    header: {
                        backgroundColor: colorScheme === 'dark' ? '#1c1917' : '#ffffff',
                        color: colorScheme === 'dark' ? 'white' : '#1c1917',
                        borderBottom: colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)',
                    },
                }}
            >
                <div className="flex flex-col gap-4 text-sm font-sans">
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Undo stroke</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">Ctrl + Z / ⌘ + Z</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Redo stroke</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">Ctrl + Shift + Z / ⌘ + Shift + Z</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Pen (Freehand)</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">P</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Eraser</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">E</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Line Tool</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">L</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Rectangle Tool</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">R</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Circle Tool</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">C</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Triangle Tool</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">T</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Zoom in/out</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">Scroll Wheel</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Pan Canvas</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">Space + Drag / Middle Drag</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Reset Canvas View</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">Ctrl + 0 / ⌘ + 0</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Focus / Presentation Mode</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">F</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                        <span className="text-stone-500 dark:text-gray-400">Open Shortcuts Help</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-stone-750 dark:text-stone-300 font-bold border border-stone-200 dark:border-white/15">?</kbd>
                    </div>
                </div>
            </Modal>

            {showFocusHint && (
                <div className="absolute z-toast bottom-10 left-1/2 -translate-x-1/2 bg-[#1c1917]/90 dark:bg-white/95 text-white dark:text-stone-900 border border-white/10 dark:border-stone-200 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <span>Press <kbd className="px-1.5 py-0.5 bg-white/20 dark:bg-stone-200 rounded font-mono font-bold">F</kbd> to exit focus mode</span>
                </div>
            )}
        </>
    );
}