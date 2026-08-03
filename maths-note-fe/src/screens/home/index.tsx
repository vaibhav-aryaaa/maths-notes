import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { SWATCHES } from '@/constants';
import { Eraser, Pen, MessageSquare, X, Menu, Sparkles, ChevronDown, Square, Circle, Triangle, Slash, Undo2, Redo2, Maximize, Trash2, Crop, Scissors, Sun, Moon, Eye } from 'lucide-react';
import { DraggableResultCard } from '@/components/DraggableResultCard';
import { ResultSkeleton } from '@/components/ResultSkeleton';
import { useMathCanvas } from './useMathCanvas';
import { useCanvasSolver } from './useCanvasSolver';
import { useCopilotChat } from './useCopilotChat';
import { Modal, useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import axios from 'axios';

import { useSolveHistory } from '@/hooks/useSolveHistory';
import { HistorySidebar } from '@/components/HistorySidebar';
import { AuthManager } from '@/components/AuthManager';

import { EXAMPLE_PROBLEMS } from '@/data/exampleProblems';

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
    } = useMathCanvas(handleSelectionSolve);

    const { 
        history, 
        saveHistoryEntry, 
        clearHistory, 
        deleteHistoryItem,
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
        masterCanvasRef,
        drawBoundsRef,
        (canvas, allResults, currentDict) => {
            saveHistoryEntry(canvas, allResults, currentDict);
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
        const masterCanvas = masterCanvasRef.current;
        if (!masterCanvas) return;

        const bounds = result.bounds;
        let croppedImageBase64: string;

        if (bounds && bounds.minX !== Infinity && bounds.minY !== Infinity) {
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
                tempCtx.drawImage(masterCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            }
            croppedImageBase64 = tempCanvas.toDataURL('image/png');
        } else {
            // Fallback to full size if bounds aren't available
            croppedImageBase64 = masterCanvas.toDataURL('image/png');
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
            color: 'amber'
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
        const masterCanvas = masterCanvasRef.current;
        if (!masterCanvas) return;
        const masterCtx = masterCanvas.getContext('2d');
        if (!masterCtx) return;

        const img = new Image();
        img.src = entry.canvasImage;
        img.onload = () => {
            masterCtx.clearRect(0, 0, masterCanvas.width, masterCanvas.height);
            // Draw centered on the master canvas (6000, 6000)
            const xOffset = 6000 - img.width / 2;
            const yOffset = 6000 - img.height / 2;
            masterCtx.drawImage(img, xOffset, yOffset);
            setIsCanvasEmpty(false);
            
            drawBoundsRef.current.minX = xOffset;
            drawBoundsRef.current.minY = yOffset;
            drawBoundsRef.current.maxX = xOffset + img.width;
            drawBoundsRef.current.maxY = yOffset + img.height;
            resetView();
        };

        setResults(entry.results);
        setDictOfVars(entry.dictOfVars);
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

    const handleTryExample = (strokes: { x: number; y: number }[][]) => {
        setResults([]);
        setDictOfVars({});
        drawStrokes(strokes);
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
                setIsEraser(false);
                setSelectedShape('freehand');
            }
            // Eraser: E
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'e') {
                setIsEraser(true);
            }
            // Line: L
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'l') {
                setIsEraser(false);
                setSelectedShape('line');
            }
            // Rectangle: R
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'r') {
                setIsEraser(false);
                setSelectedShape('rectangle');
            }
            // Circle: C
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'c') {
                setIsEraser(false);
                setSelectedShape('circle');
            }
            // Triangle: T
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 't') {
                setIsEraser(false);
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
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [copilotMessages, isCopilotLoading]);

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
            />

            {/* Sidebar Toggle Button (Top-Left) */}
            <div className={`absolute z-50 top-[calc(1rem+env(safe-area-inset-top))] left-[calc(1rem+env(safe-area-inset-left))] pointer-events-auto transition-opacity duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <Button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`bg-white dark:bg-[#1e1e1e] hover:bg-slate-50 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-white border border-stone-200 dark:border-[#333] transition-all shadow-lg p-2.5 h-10 w-10 rounded-lg flex items-center justify-center ${isSidebarOpen ? 'bg-slate-100 dark:bg-[#333] border-stone-300 dark:border-white/20' : ''}`}
                    variant="default"
                    title="Toggle Sidebar"
                >
                    {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
                </Button>
            </div>

            {/* Centered Horizontal Toolbar */}
            <div className={`absolute z-50 top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333] p-1.5 rounded-xl shadow-lg pointer-events-auto transition-all duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {/* Tool Selector Segmented Control */}
                <div className="flex items-center gap-1 bg-stone-100/80 dark:bg-[#2c2c2c]/30 p-1 rounded-lg border border-stone-200/50 dark:border-[#444]/40 h-8 flex-shrink-0">
                    {[
                        { id: 'pen' as const, label: 'Pen', icon: <Pen size={13} /> },
                        { id: 'eraser' as const, label: 'Eraser', icon: <Eraser size={13} /> },
                        { id: 'select-lasso' as const, label: 'Lasso Solve', icon: <Scissors size={13} /> },
                        { id: 'select-rect' as const, label: 'Rect Solve', icon: <Crop size={13} /> },
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTool(t.id)}
                            className={`cursor-pointer transition-all px-2.5 h-6 flex items-center gap-1 rounded-md text-xs font-semibold select-none whitespace-nowrap flex-shrink-0 ${
                                activeTool === t.id 
                                    ? 'bg-white dark:bg-[#3c3c3c] text-amber-600 dark:text-amber-400 font-bold shadow-sm border border-stone-200/40 dark:border-transparent' 
                                    : 'hover:bg-black/5 dark:hover:bg-white/5 text-stone-600 dark:text-gray-300'
                            }`}
                            title={t.label}
                        >
                            {t.icon}
                            <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </div>

                {/* Clear Canvas Button */}
                <Button
                    onClick={() => {
                        setActiveSolveRegion(null);
                        resetCanvas();
                    }}
                    className="bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] transition-all p-2 h-8 flex items-center justify-center gap-1.5 rounded-lg min-w-[70px]"
                    variant="default"
                    title="Clear Canvas (Destroy whiteboard content)"
                >
                    <Trash2 size={14} className="text-red-500 dark:text-red-400" />
                    <span className="text-xs font-semibold select-none font-sans">Clear</span>
                </Button>

                {/* Undo Button */}
                <Button
                    onClick={undo}
                    disabled={!canUndo}
                    className="bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] transition-all p-2 h-8 w-8 flex items-center justify-center rounded-lg disabled:opacity-35 disabled:hover:bg-white dark:disabled:hover:bg-[#2c2c2c]/50 disabled:cursor-not-allowed cursor-pointer"
                    variant="default"
                    title="Undo (Ctrl+Z / ⌘+Z)"
                >
                    <Undo2 size={14} className="text-stone-500 dark:text-gray-300" />
                </Button>

                {/* Redo Button */}
                <Button
                    onClick={redo}
                    disabled={!canRedo}
                    className="bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] transition-all p-2 h-8 w-8 flex items-center justify-center rounded-lg disabled:opacity-35 disabled:hover:bg-white dark:disabled:hover:bg-[#2c2c2c]/50 disabled:cursor-not-allowed cursor-pointer"
                    variant="default"
                    title="Redo (Ctrl+Shift+Z / ⌘+Shift+Z)"
                >
                    <Redo2 size={14} className="text-stone-500 dark:text-gray-300" />
                </Button>

                {/* Reset View Button */}
                <Button
                    onClick={resetView}
                    className="bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] transition-all p-2 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer"
                    variant="default"
                    title="Reset View (Ctrl+0)"
                >
                    <Maximize size={14} className="text-stone-500 dark:text-gray-300" />
                </Button>

                {activeTool === 'pen' && (
                    <>
                        {/* Divider */}
                        <div className="h-5 w-[1px] bg-stone-200 dark:bg-[#333] mx-1" />

                        {/* Shape Tool Selector Button */}
                        <div className="relative">
                            <button
                                onClick={() => {
                                    setIsShapeMenuOpen(!isShapeMenuOpen);
                                }}
                                className={`bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 px-2 transition-all gap-1.5 ${isShapeMenuOpen ? 'bg-slate-100 dark:bg-[#3c3c3c] border-stone-300 dark:border-white/20' : ''}`}
                                title="Select Drawing Tool"
                            >
                                {selectedShape === 'freehand' && <Pen size={14} className="text-stone-500 dark:text-gray-300" />}
                                {selectedShape === 'line' && <Slash size={14} className="text-stone-500 dark:text-gray-300" />}
                                {selectedShape === 'rectangle' && <Square size={14} className="text-stone-500 dark:text-gray-300" />}
                                {selectedShape === 'circle' && <Circle size={14} className="text-stone-500 dark:text-gray-300" />}
                                {selectedShape === 'triangle' && <Triangle size={14} className="text-stone-500 dark:text-gray-300" />}
                                <span className="text-xs font-semibold select-none capitalize text-stone-700 dark:text-white">
                                    {selectedShape === 'freehand' ? 'Pen' : selectedShape}
                                </span>
                                <ChevronDown size={10} className="text-stone-400 dark:text-gray-500" />
                            </button>
                            
                            {isShapeMenuOpen && (
                                <div className="absolute top-11 left-1/2 -translate-x-1/2 bg-white dark:bg-[#18181c] border border-stone-200 dark:border-[#2d2d30] p-1 rounded-xl shadow-2xl z-50 flex flex-col gap-0.5 min-w-[120px] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-150">
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
                                                setIsEraser(false);
                                                setIsShapeMenuOpen(false);
                                            }}
                                            className={`cursor-pointer hover:bg-stone-100 dark:hover:bg-white/5 transition-colors p-1.5 text-left rounded-lg text-xs flex items-center gap-2 w-full text-stone-700 dark:text-white ${selectedShape === tool.id ? 'bg-stone-150 dark:bg-white/10 font-bold' : ''}`}
                                        >
                                            <span className="text-stone-400 dark:text-gray-400">{tool.icon}</span>
                                            <span>{tool.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="h-5 w-[1px] bg-stone-200 dark:bg-[#333] mx-1" />

                        {/* Inline Color Palette Swatches */}
                        <div className="flex items-center gap-1.5 px-1 flex-shrink-0">
                            {SWATCHES.map((swatch) => (
                                <button
                                    key={swatch}
                                    onClick={() => setColor(swatch)}
                                    className={`cursor-pointer w-4 h-4 rounded-full border border-stone-200 dark:border-white/20 transition-all hover:scale-110 active:scale-90 ${
                                        color === swatch 
                                            ? 'ring-2 ring-amber-500 dark:ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-[#1e1e1e] scale-110' 
                                             : ''
                                    }`}
                                    style={{ backgroundColor: swatch }}
                                    title={swatch}
                                />
                            ))}
                        </div>

                        {/* Divider */}
                        <div className="h-5 w-[1px] bg-stone-200 dark:bg-[#333] mx-1" />

                        {/* Stroke Width Presets */}
                        <div className="flex items-center gap-1 bg-stone-100/80 dark:bg-[#2c2c2c]/30 p-1 rounded-lg border border-stone-200/50 dark:border-[#444]/40 h-8 flex-shrink-0">
                            {[
                                { val: 3, label: 'Thin', sizeClass: 'w-1.5 h-1.5' },
                                { val: 6, label: 'Medium', sizeClass: 'w-2.5 h-2.5' },
                                { val: 10, label: 'Thick', sizeClass: 'w-3.5 h-3.5' }
                            ].map((preset) => (
                                <button
                                    key={preset.val}
                                    onClick={() => setStrokeWidth(preset.val)}
                                    className={`cursor-pointer transition-all px-2 h-6 flex items-center justify-center rounded-md text-xs font-semibold select-none ${
                                        strokeWidth === preset.val
                                            ? 'bg-white dark:bg-[#3c3c3c] text-amber-600 dark:text-amber-400 font-bold shadow-sm border border-stone-200/40 dark:border-transparent'
                                            : 'hover:bg-stone-100 dark:hover:bg-white/5 text-stone-400 dark:text-gray-400'
                                    }`}
                                    title={`Pen size: ${preset.label}`}
                                >
                                    <div className={`rounded-full bg-current ${preset.sizeClass}`} />
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Eraser specific settings: Sizes */}
                {activeTool === 'eraser' && (
                    <>
                        {/* Divider */}
                        <div className="h-5 w-[1px] bg-stone-200 dark:bg-[#333] mx-1" />

                        {/* Eraser Width Presets */}
                        <div className="flex items-center gap-1 bg-stone-100/80 dark:bg-[#2c2c2c]/30 p-1 rounded-lg border border-stone-200/50 dark:border-[#444]/40 h-8 flex-shrink-0">
                            <span className="text-[10px] text-stone-500 dark:text-gray-500 font-bold px-1.5 uppercase tracking-wider select-none hidden sm:inline">Eraser Size</span>
                            {[
                                { val: 15, label: 'Thin', sizeClass: 'w-1.5 h-1.5' },
                                { val: 30, label: 'Medium', sizeClass: 'w-2.5 h-2.5' },
                                { val: 50, label: 'Thick', sizeClass: 'w-3.5 h-3.5' }
                            ].map((preset) => (
                                <button
                                    key={preset.val}
                                    onClick={() => setEraserWidth(preset.val)}
                                    className={`cursor-pointer transition-all px-2 h-6 flex items-center justify-center rounded-md text-xs font-semibold select-none ${
                                        eraserWidth === preset.val
                                            ? 'bg-white dark:bg-[#3c3c3c] text-amber-600 dark:text-amber-400 font-bold shadow-sm border border-stone-200/40 dark:border-transparent'
                                            : 'hover:bg-stone-100 dark:hover:bg-white/5 text-stone-400 dark:text-gray-400'
                                    }`}
                                    title={`Eraser size: ${preset.label}`}
                                >
                                    <div className={`rounded-full bg-current ${preset.sizeClass}`} />
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Divider */}
                <div className="h-5 w-[1px] bg-stone-200 dark:bg-[#333] mx-1" />

                {/* Cloud Sync Manager */}
                <AuthManager user={user} clearHistory={clearHistory} />

                {/* Keyboard Shortcuts Button */}
                <Button
                    onClick={() => setIsShortcutsOpen(true)}
                    className="bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 w-8 transition-all hover:scale-105 active:scale-95 cursor-pointer font-bold font-sans text-xs"
                    variant="default"
                    title="Keyboard Shortcuts (?)"
                >
                    ?
                </Button>

                {/* Theme Toggle Button */}
                <Button
                    onClick={toggleColorScheme}
                    className="bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 w-8 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    variant="default"
                    title={colorScheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {colorScheme === 'dark' ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-stone-600" />}
                </Button>

                {/* Focus/Presentation Mode Button */}
                <Button
                    onClick={toggleFocusMode}
                    className={`bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 w-8 transition-all hover:scale-105 active:scale-95 cursor-pointer ${isFocusMode ? 'bg-amber-100 dark:bg-amber-950/45 border-amber-300' : ''}`}
                    variant="default"
                    title="Focus Mode (F)"
                >
                    <Eye size={14} className={isFocusMode ? 'text-amber-600 dark:text-amber-400' : 'text-stone-500 dark:text-gray-300'} />
                </Button>
            </div>

            {/* Top Right Run Button */}
            <div className={`absolute z-50 top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] pointer-events-auto transition-opacity duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <Button
                    onClick={() => runRoute(undefined, (bounds) => {
                        setActiveSolveRegion({ bounds, status: 'scanning' });
                        setSkeletonRegion({ bounds });
                        setSkeletonVisible(true);
                    })}
                    className="bg-white dark:bg-[#1e1e1e] hover:bg-slate-50 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-white border border-stone-200 dark:border-[#333] transition-all shadow-lg p-2.5 h-10 flex items-center justify-center gap-1.5 rounded-lg"
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
                    className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-200 ${
                        isDrawing ? 'opacity-0' : 'opacity-100'
                    }`}
                >
                    <svg className="w-full h-full">
                        <rect
                            x={activeSolveBox.x}
                            y={activeSolveBox.y}
                            width={activeSolveBox.width}
                            height={activeSolveBox.height}
                            fill={activeSolveRegion.status === 'scanning' ? 'rgba(245, 158, 11, 0.05)' : 'none'}
                            stroke={activeSolveRegion.status === 'scanning' ? 'rgba(245, 158, 11, 0.6)' : 'rgba(245, 158, 11, 0.35)'}
                            strokeWidth={activeSolveRegion.status === 'scanning' ? '2' : '1.5'}
                            strokeDasharray={activeSolveRegion.status === 'scanning' ? '6 4' : '4 4'}
                            rx="4"
                            className={activeSolveRegion.status === 'scanning' ? 'animate-pulse' : ''}
                        />
                        <text
                            x={activeSolveBox.x + 8}
                            y={activeSolveBox.y - 6 < 15 ? activeSolveBox.y + 14 : activeSolveBox.y - 6}
                            fill="rgba(245, 158, 11, 0.8)"
                            className="text-[9px] font-sans font-bold select-none uppercase tracking-wider"
                        >
                            {activeSolveRegion.status === 'scanning' ? 'Solving Region...' : 'Solved Region'}
                        </text>
                    </svg>
                </div>
            )}
            {skeletonRegion && (
                <div className={`transition-opacity duration-500 ${skeletonVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <ResultSkeleton position={getCardPosition({ bounds: skeletonRegion.bounds }, results.length)} />
                </div>
            )}
            {results && results.map((result, index) => (
                <DraggableResultCard
                    key={result.id || index}
                    result={result}
                    defaultPosition={getCardPosition(result, index)}
                    setPosition={(newPos) => handleCardPositionChange(result, newPos)}
                    onShare={handleShareResult}
                />
            ))}

            {isScanning && <div className="scanning-laser" />}

            {showExamples && (
                <div className="absolute top-[40%] sm:top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-6 max-w-lg w-full px-6 text-center select-none pointer-events-none">
                    <div className="flex flex-col items-center gap-2 pointer-events-auto">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-white tracking-tight">
                            Unlock the Power of <span className="text-amber-500">SolveIQ</span>
                        </h2>
                        <p className="text-stone-500 dark:text-gray-400 text-sm max-w-sm">
                            Draw your equations or click one of our pre-baked math examples below to see SolveIQ scan and solve in real-time.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-2 pointer-events-auto">
                        {EXAMPLE_PROBLEMS.map((problem) => (
                            <button
                                key={problem.id}
                                onClick={() => handleTryExample(problem.strokes)}
                                className="cursor-pointer flex flex-col text-left p-3.5 rounded-xl border border-stone-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-stone-50 dark:hover:bg-white/10 hover:border-stone-300 dark:hover:border-white/20 active:scale-[0.98] transition-all text-stone-900 dark:text-white backdrop-blur-md shadow-lg group"
                            >
                                <span className="text-sm font-bold text-amber-600 dark:text-amber-400 group-hover:text-amber-500 dark:group-hover:text-amber-300 flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-amber-500 animate-pulse" />
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

            {/* Floating Copilot Toggle Button */}
            <button
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className={`absolute bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-500/40 hover:scale-110 active:scale-95 transition-all duration-300 border border-white/20 cursor-pointer ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                title="Vector"
            >
                {isCopilotOpen ? <X size={22} className="text-white" /> : <MessageSquare size={22} className="text-white" />}
            </button>

            {/* Copilot Sidebar Panel */}
            {isCopilotOpen && !isFocusMode && (
                <div className="absolute bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-50 w-auto sm:w-[360px] h-[480px] sm:h-[520px] flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/95 dark:bg-[#18181c]/95 backdrop-blur-md">
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
                                        <p className="text-stone-900 dark:text-stone-100 font-extrabold text-lg sm:text-xl tracking-tight mb-2">Vector</p>
                                        <p className="text-center text-stone-600 dark:text-stone-400 text-sm leading-relaxed font-medium px-4">
                                            {msg.text}
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                        msg.role === 'user'
                                            ? 'bg-stone-900 dark:bg-stone-200 text-white dark:text-stone-950 rounded-br-sm'
                                            : 'bg-stone-100 dark:bg-stone-800/80 border border-stone-200/50 dark:border-stone-800/50 text-stone-800 dark:text-stone-200 rounded-bl-sm'
                                    }`}>
                                        {msg.text}
                                        {msg.role === 'ai' && i === copilotMessages.length - 1 && isCopilotStreaming && (
                                            <span className="inline-block w-1.5 h-4 bg-amber-500 ml-0.5 animate-pulse align-middle" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {isCopilotLoading && (
                            <div className="flex justify-start animate-fade-in">
                                <div className="bg-stone-100 dark:bg-stone-850/80 border border-stone-200/50 dark:border-stone-800/50 px-4 py-2.5 rounded-2xl rounded-bl-sm flex gap-1.5 items-center shadow-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="px-4 pb-4 pt-2 bg-white dark:bg-[#18181c]">
                        <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-900/50 border border-stone-200/60 dark:border-stone-800/60 rounded-2xl px-4 py-2.5 focus-within:border-stone-400 dark:focus-within:border-stone-600 focus-within:ring-2 focus-within:ring-stone-105 dark:focus-within:ring-stone-950 transition-all shadow-sm">
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
                                className="flex-1 bg-transparent text-sm text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 outline-none font-sans"
                            />
                            <button
                                onClick={sendCopilotMessage}
                                disabled={isCopilotLoading || !copilotInput.trim()}
                                className="w-8 h-8 rounded-full bg-stone-950 dark:bg-stone-200 hover:bg-stone-800 dark:hover:bg-stone-300 text-white dark:text-stone-950 flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
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
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">Ctrl + Z / ⌘ + Z</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Redo stroke</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">Ctrl + Shift + Z / ⌘ + Shift + Z</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Pen (Freehand)</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">P</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Eraser</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">E</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Line Tool</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">L</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Rectangle Tool</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">R</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Circle Tool</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">C</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Triangle Tool</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">T</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Zoom in/out</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">Scroll Wheel</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Pan Canvas</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">Space + Drag / Middle Drag</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Reset Canvas View</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">Ctrl + 0 / ⌘ + 0</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-200 dark:border-white/5">
                        <span className="text-stone-500 dark:text-gray-400">Focus / Presentation Mode</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">F</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                        <span className="text-stone-500 dark:text-gray-400">Open Shortcuts Help</span>
                        <kbd className="px-2 py-1 bg-stone-100 dark:bg-white/10 rounded text-xs font-mono text-amber-600 dark:text-amber-400 font-bold border border-stone-200 dark:border-white/15">?</kbd>
                    </div>
                </div>
            </Modal>

            {showFocusHint && (
                <div className="absolute z-[100] bottom-10 left-1/2 -translate-x-1/2 bg-[#1c1917]/90 dark:bg-white/95 text-white dark:text-stone-900 border border-white/10 dark:border-stone-200 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <span>Press <kbd className="px-1.5 py-0.5 bg-white/20 dark:bg-stone-200 rounded font-mono font-bold">F</kbd> to exit focus mode</span>
                </div>
            )}
        </>
    );
}