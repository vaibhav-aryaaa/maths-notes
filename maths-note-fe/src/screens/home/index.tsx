import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { SWATCHES } from '@/constants';
import { Eraser, Pen, Highlighter, PenTool, Paintbrush, MessageSquare, X, Menu, Square, Circle, Triangle, Slash, Undo2, Redo2, Maximize, FilePlus, Scissors, LassoSelect, Sun, Moon, Eye, Hand, Target, ZoomIn, ZoomOut, Grid, MousePointer, Type, Image as ImageIcon, Plus, Minus } from 'lucide-react';
import { DraggableResultCard } from '@/components/DraggableResultCard';
import { ResultSkeleton } from '@/components/ResultSkeleton';
import { useMathCanvas } from './useMathCanvas';
import { useCanvasSolver } from './useCanvasSolver';
import { rasterizeRegion, getElementBounds } from './canvasUtils';
import { useCopilotChat } from './useCopilotChat';
import { Modal, useMantineColorScheme, Slider, Popover, Menu as MantineMenu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import axios from 'axios';

import { clearLiveCanvas } from '@/lib/liveCanvasPersistence';
import { useSolveHistory } from '@/hooks/useSolveHistory';
import { trackEvent } from '@/lib/analytics';
import { HistorySidebar } from '@/components/HistorySidebar';
import { AuthManager } from '@/components/AuthManager';
import { CopilotPanel } from '@/components/CopilotPanel';
import type { GeneratedResult, DictOfVars, ImageElement } from '@/types';

import { EXAMPLE_PROBLEMS } from '@/data/exampleProblems';

const HIGHLIGHTER_SWATCHES = [
    '#FEF08A', // pastel yellow
    '#BBF7D0', // pastel green
    '#FBCFE8', // pastel pink
    '#BFDBFE', // pastel blue
    '#E9D5FF'  // pastel purple
];

const measureTextWidth = (text: string, fontSize: number): number => {
    if (typeof window === 'undefined') return 120;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 120;
    ctx.font = `${fontSize}px sans-serif`;
    const lines = text.split('\n');
    let maxWidth = 0;
    for (const line of lines) {
        const lineToMeasure = line.endsWith(' ') ? line + '\u200B' : line;
        const width = ctx.measureText(lineToMeasure).width;
        if (width > maxWidth) {
            maxWidth = width;
        }
    }
    return Math.max(120, maxWidth);
};

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
    text: { min: 12, max: 72, default: 24 }
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



    const dictOfVarsRef = useRef<DictOfVars>({});
    const setDictOfVarsCallbackRef = useRef<((d: DictOfVars) => void) | null>(null);
    const resultsRef = useRef<GeneratedResult[]>([]);
    const setResultsCallbackRef = useRef<((r: GeneratedResult[]) => void) | null>(null);
    const loadedHistoryEntryIdRef = useRef<string | null>(null);

    const handleRestoreLiveCanvas = useCallback((data: any) => {
        if (data.dictOfVars && setDictOfVarsCallbackRef.current) {
            setDictOfVarsCallbackRef.current(data.dictOfVars);
        }
        if (data.results && data.results.length > 0 && setResultsCallbackRef.current) {
            setResultsCallbackRef.current(data.results);
        }
        if (data.loadedHistoryEntryId) {
            loadedHistoryEntryIdRef.current = data.loadedHistoryEntryId;
        }
    }, []);

    const getDictOfVars = useCallback(() => {
        return dictOfVarsRef.current;
    }, []);

    const getResults = useCallback(() => {
        return resultsRef.current;
    }, []);

    const getLoadedHistoryEntryId = useCallback(() => {
        return loadedHistoryEntryIdRef.current;
    }, []);

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
        elementsRef,
        selectedElementIds,
        setSelectedElementIds,
        selectedSelectionShape,
        setSelectedSelectionShape,
        canvasCursor,
        zoomToContent,
        zoomIn,
        zoomOut,
        strokeOpacity,
        setStrokeOpacity,
        showGrid,
        setShowGrid,
        getWordCoords,
        saveState,
        activeTextEdit,
        setActiveTextEdit,
        insertImageFile,
        flushLiveCanvasSave,
        scheduleAutosave,
        isCanvasDirtyRef,
        markCanvasClean,
        markCanvasDirty
    } = useMathCanvas(handleSelectionSolve, handleRestoreLiveCanvas, getDictOfVars, getResults, getLoadedHistoryEntryId);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            insertImageFile(file);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [insertImageFile]);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const activeTag = document.activeElement?.tagName.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.getAttribute('contenteditable') === 'true') {
                return;
            }

            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        e.preventDefault();
                        insertImageFile(file);
                        break;
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [insertImageFile]);

    const generateUUID = useCallback(() => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
    }, []);

    const commitTextEdit = useCallback(() => {
        if (!activeTextEdit) return;
        const trimmed = activeTextEdit.text.trim();
        if (trimmed) {
            saveState();
            if (activeTextEdit.isNew) {
                elementsRef.current.push({
                    kind: 'text',
                    id: activeTextEdit.id,
                    x: activeTextEdit.x,
                    y: activeTextEdit.y,
                    text: trimmed,
                    fontSize: activeTextEdit.fontSize,
                    color: activeTextEdit.color
                });
            } else {
                elementsRef.current = elementsRef.current.map(el => 
                    el.id === activeTextEdit.id
                        ? { ...el, text: trimmed }
                        : el
                );
            }
            setIsCanvasEmpty(false);
        } else {
            if (!activeTextEdit.isNew) {
                saveState();
                elementsRef.current = elementsRef.current.filter(el => el.id !== activeTextEdit.id);
                setIsCanvasEmpty(elementsRef.current.length === 0);
            }
        }
        setActiveTextEdit(null);
        setTimeout(() => redrawViewCanvas(), 0);
    }, [activeTextEdit, elementsRef, saveState, setIsCanvasEmpty, setActiveTextEdit, redrawViewCanvas]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        console.log("handleMouseDown called, activeTool:", activeTool);
        if (activeTool === 'text') {
            e.preventDefault();
            const rect = canvasRef.current?.getBoundingClientRect();
            console.log("canvas rect:", rect);
            if (rect) {
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const worldPos = getWordCoords(screenX, screenY);
                console.log("screen coords:", { screenX, screenY }, "worldPos:", worldPos);
                
                if (activeTextEdit) {
                    console.log("committing existing text edit first");
                    commitTextEdit();
                }
                
                const newEdit = {
                    id: generateUUID(),
                    x: worldPos.x,
                    y: worldPos.y,
                    text: '',
                    fontSize: strokeWidth,
                    color: color,
                    isNew: true
                };
                console.log("setting activeTextEdit to:", newEdit);
                setActiveTextEdit(newEdit);
            }
            return;
        }
        startDrawing(e);
    }, [activeTool, canvasRef, getWordCoords, activeTextEdit, commitTextEdit, strokeWidth, color, startDrawing, setActiveTextEdit, generateUUID]);

    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
        console.log("handleTouchStart called, activeTool:", activeTool);
        if (activeTool === 'text') {
            e.preventDefault();
            const rect = canvasRef.current?.getBoundingClientRect();
            console.log("canvas rect (touch):", rect);
            if (rect) {
                const touch = e.touches[0];
                const screenX = touch.clientX - rect.left;
                const screenY = touch.clientY - rect.top;
                const worldPos = getWordCoords(screenX, screenY);
                console.log("screen coords (touch):", { screenX, screenY }, "worldPos:", worldPos);
                
                if (activeTextEdit) {
                    console.log("committing existing text edit first (touch)");
                    commitTextEdit();
                }
                
                const newEdit = {
                    id: generateUUID(),
                    x: worldPos.x,
                    y: worldPos.y,
                    text: '',
                    fontSize: strokeWidth,
                    color: color,
                    isNew: true
                };
                console.log("setting activeTextEdit (touch) to:", newEdit);
                setActiveTextEdit(newEdit);
            }
            return;
        }
        startDrawingTouch(e);
    }, [activeTool, canvasRef, getWordCoords, activeTextEdit, commitTextEdit, strokeWidth, color, startDrawingTouch, setActiveTextEdit, generateUUID]);

    const [savedInkColor, setSavedInkColor] = useState('rgb(255, 255, 255)');
    const [savedHighlighterColor, setSavedHighlighterColor] = useState('#FEF08A');
    const [popoverOpen, setPopoverOpen] = useState(false);

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
            text: 24
        };
    });

    const [toolOpacities, setToolOpacities] = useState<Record<string, number>>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('solvelq_tool_opacities');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.warn(e);
                }
            }
        }
        return {
            pen: 1.0,
            fountain: 1.0,
            marker: 1.0,
            highlighter: 0.6,
        };
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('solvelq_tool_widths', JSON.stringify(toolWidths));
        }
    }, [toolWidths]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('solvelq_tool_opacities', JSON.stringify(toolOpacities));
        }
    }, [toolOpacities]);

    const prevToolRef = useRef(activeTool);

    useEffect(() => {
        // Save the previous tool's width and opacity first before updating
        const prevTool = prevToolRef.current;
        if (['pen', 'fountain', 'marker', 'highlighter', 'eraser', 'text'].includes(prevTool)) {
            const currentWidth = prevTool === 'eraser' ? eraserWidth : strokeWidth;
            setToolWidths(prev => ({ ...prev, [prevTool]: currentWidth }));
            if (prevTool !== 'eraser') {
                setToolOpacities(prev => ({ ...prev, [prevTool]: strokeOpacity }));
            }
        }

        // Apply new tool's color, width, and opacity
        const nextWidth = toolWidths[activeTool] ?? WIDTH_RANGES[activeTool]?.default ?? 3;
        if (activeTool === 'eraser') {
            setEraserWidth(nextWidth);
        } else {
            setStrokeWidth(nextWidth);
            const nextOpacity = toolOpacities[activeTool] ?? (activeTool === 'highlighter' ? 0.6 : 1.0);
            setStrokeOpacity(nextOpacity);
        }

        if (activeTool === 'highlighter') {
            if (!HIGHLIGHTER_SWATCHES.includes(color)) {
                setSavedInkColor(color);
            }
            setColor(savedHighlighterColor);
        } else if (['pen', 'fountain', 'marker', 'text'].includes(activeTool)) {
            if (HIGHLIGHTER_SWATCHES.includes(color)) {
                setSavedHighlighterColor(color);
            }
            setColor(savedInkColor);
        }

        // Close popover when activeTool changes (e.g. from hotkeys)
        setPopoverOpen(false);

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

    const handleOpacityChange = (val: number) => {
        setStrokeOpacity(val);
        if (['pen', 'fountain', 'marker', 'highlighter'].includes(activeTool)) {
            setToolOpacities(prev => ({ ...prev, [activeTool]: val }));
        }
    };

    const { 
        history, 
        saveHistoryEntry, 
        saveDraftHistoryEntry,
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
        elementsRef,
        drawBoundsRef,
        (canvas, allResults, currentDict) => {
            saveHistoryEntry(canvas, allResults, currentDict, elementsRef.current);
            markCanvasClean();
        },
        redrawViewCanvas
    );

    useEffect(() => {
        dictOfVarsRef.current = dictOfVars;
        setDictOfVarsCallbackRef.current = setDictOfVars;
        resultsRef.current = results;
        setResultsCallbackRef.current = setResults;
    }, [dictOfVars, setDictOfVars, results, setResults]);

    useEffect(() => {
        scheduleAutosave();
    }, [results, scheduleAutosave]);

    useEffect(() => {
        selectionSolveRef.current = runRoute;
    }, [runRoute]);

    const handleUpdateResult = useCallback((id: string, updates: Partial<GeneratedResult>) => {
        setResults(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    }, [setResults]);

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

            const tempCanvas = rasterizeRegion(elementsRef.current, { x: cropX, y: cropY, width: cropWidth, height: cropHeight });
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
        // Only snapshot as a Draft if there is unsaved/dirty work currently on the canvas
        if (elementsRef.current.length > 0 && isCanvasDirtyRef.current) {
            saveDraftHistoryEntry(canvasRef.current, dictOfVarsRef.current, elementsRef.current);
            saveState();
        }
        // Durably flush pending in-memory canvas state to IndexedDB before overwriting
        flushLiveCanvasSave();

        setSelectedElementIds([]);

        const hasElements = Array.isArray(entry.elements) && entry.elements.length > 0;
        const hasStrokes = Array.isArray(entry.strokes) && entry.strokes.length > 0;
        const fallbackImage = entry.canvasImage || entry.canvasThumbnail;

        if (hasElements) {
            elementsRef.current = entry.elements.map((el: any) => {
                if (el.kind === 'text') return { ...el };
                if (el.kind === 'image') {
                    const imgEl: ImageElement = { ...el };
                    if (!imgEl.bitmap && imgEl.src) {
                        const img = new Image();
                        img.src = imgEl.src;
                        img.onload = () => {
                            imgEl.bitmap = img;
                            redrawViewCanvas();
                        };
                    }
                    return imgEl;
                }
                return {
                    kind: el.kind ?? 'stroke',
                    ...el,
                    points: el.points.map((pt: any) => ({ ...pt }))
                };
            });
            setIsCanvasEmpty(elementsRef.current.length === 0);
            
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            elementsRef.current.forEach((el: any) => {
                const bounds = getElementBounds(el);
                if (bounds.minX < minX) minX = bounds.minX;
                if (bounds.maxX > maxX) maxX = bounds.maxX;
                if (bounds.minY < minY) minY = bounds.minY;
                if (bounds.maxY > maxY) maxY = bounds.maxY;
            });
            drawBoundsRef.current = { minX, minY, maxX, maxY };
            zoomToContent();
        } else if (hasStrokes) {
            elementsRef.current = entry.strokes.map((s: any) => ({
                kind: 'stroke',
                ...s,
                points: s.points.map((pt: any) => ({ ...pt }))
            }));
            setIsCanvasEmpty(elementsRef.current.length === 0);
            
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            elementsRef.current.forEach((el: any) => {
                const bounds = getElementBounds(el);
                if (bounds.minX < minX) minX = bounds.minX;
                if (bounds.maxX > maxX) maxX = bounds.maxX;
                if (bounds.minY < minY) minY = bounds.minY;
                if (bounds.maxY > maxY) maxY = bounds.maxY;
            });
            drawBoundsRef.current = { minX, minY, maxX, maxY };
            zoomToContent();
        } else if (fallbackImage) {
            const img = new Image();
            img.src = fallbackImage;
            img.onload = () => {
                const imgWidth = img.width || 800;
                const imgHeight = img.height || 600;
                const imgX = 6000 - imgWidth / 2;
                const imgY = 6000 - imgHeight / 2;
                const imgElement: ImageElement = {
                    kind: 'image',
                    id: crypto.randomUUID(),
                    x: imgX,
                    y: imgY,
                    width: imgWidth,
                    height: imgHeight,
                    src: fallbackImage,
                    bitmap: img
                };
                elementsRef.current = [imgElement];
                setIsCanvasEmpty(false);
                drawBoundsRef.current = {
                    minX: imgX,
                    minY: imgY,
                    maxX: imgX + imgWidth,
                    maxY: imgY + imgHeight
                };
                zoomToContent();
                markCanvasClean();
                redrawViewCanvas();
                scheduleAutosave();
            };
        } else {
            elementsRef.current = [];
            setIsCanvasEmpty(true);
            resetView();
        }

        setResults(entry.results || []);
        setDictOfVars(entry.dictOfVars || {});
        loadedHistoryEntryIdRef.current = entry.id;
        markCanvasClean();
        redrawViewCanvas();
        scheduleAutosave();
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
        if (elementsRef.current.length > 0 && isCanvasDirtyRef.current) {
            saveDraftHistoryEntry(canvasRef.current, dictOfVarsRef.current, elementsRef.current);
            saveState();
        }
        flushLiveCanvasSave();
        trackEvent('example_clicked', {
            example_id: problem.id,
            example_name: problem.name
        });
        setResults([]);
        setDictOfVars({});
        drawStrokes(problem.strokes);
        markCanvasDirty();
        setTimeout(() => {
            runRoute();
        }, 600);
    };

    const handleNewCanvas = useCallback(() => {
        // If there is active unsaved/modified work, auto-save it as a Draft in History first
        if (elementsRef.current.length > 0 && isCanvasDirtyRef.current) {
            saveDraftHistoryEntry(canvasRef.current, dictOfVarsRef.current, elementsRef.current);
            saveState();
        }

        loadedHistoryEntryIdRef.current = null;

        // Clear persisted live canvas from IndexedDB
        clearLiveCanvas().catch(console.error);

        // Reset canvas strokes, images, camera transform
        resetCanvas();

        // Clear all solved result cards, variables, and region skeletons
        setResults([]);
        setDictOfVars({});
        setActiveSolveRegion(null);
        setSkeletonVisible(false);
        setSkeletonRegion(null);
        markCanvasClean();
    }, [saveDraftHistoryEntry, saveState, resetCanvas, setResults, setDictOfVars, markCanvasClean]);

    const handleDeleteHistoryEntry = useCallback((id: string) => {
        deleteHistoryItem(id);
        // If the item currently loaded on screen is what got deleted, reset the canvas
        if (loadedHistoryEntryIdRef.current === id) {
            loadedHistoryEntryIdRef.current = null;
            clearLiveCanvas().catch(console.error);
            resetCanvas();
            setResults([]);
            setDictOfVars({});
            setActiveSolveRegion(null);
            setSkeletonVisible(false);
            setSkeletonRegion(null);
            markCanvasClean();
        }
    }, [deleteHistoryItem, resetCanvas, setResults, setDictOfVars, markCanvasClean]);

    const handleClearHistory = useCallback(() => {
        clearHistory();
        loadedHistoryEntryIdRef.current = null;
        clearLiveCanvas().catch(console.error);
        resetCanvas();
        setResults([]);
        setDictOfVars({});
        setActiveSolveRegion(null);
        setSkeletonVisible(false);
        setSkeletonRegion(null);
        markCanvasClean();
    }, [clearHistory, resetCanvas, setResults, setDictOfVars, markCanvasClean]);

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
                return;
            }
            // Redo: cmd/ctrl + shift + z
            else if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                redo();
                return;
            }
            // Escape to clear selection
            else if (e.key === 'Escape') {
                e.preventDefault();
                setSelectedElementIds([]);
                return;
            }
            // Help: ? (shift + /)
            else if (e.key === '?') {
                e.preventDefault();
                setIsShortcutsOpen(true);
                return;
            }

            // Disable single-key shortcuts if the Text Tool is active to prevent accidental shape switching
            if (activeTool === 'text') {
                return;
            }

            // Pen: P
            if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'p') {
                setActiveTool('pen');
                setSelectedShape('freehand');
            }
            // Hand: H
            else if (!cmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'h') {
                setActiveTool('hand');
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
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, setIsEraser, setSelectedShape, toggleFocusMode, setSelectedElementIds, activeTool, setActiveTool]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <>
            {/* Left side collapsible Sidebar panel containing Memory and Solve History */}
            <HistorySidebar
                isOpen={isSidebarOpen && !isFocusMode}
                onClose={() => setIsSidebarOpen(false)}
                dictOfVars={dictOfVars}
                history={history}
                onSelectEntry={handleSelectHistoryEntry}
                onClearHistory={handleClearHistory}
                onDeleteEntry={handleDeleteHistoryEntry}
                getHistoryEntryImage={getHistoryEntryImage}
            />

            {/* Cloud Sync / Authentication Manager (Top-Right) */}
            <div className="absolute z-controls top-[calc(1.25rem+env(safe-area-inset-top))] right-[calc(1.25rem+env(safe-area-inset-right))]">
                <AuthManager user={user} clearHistory={clearHistory} isFocusMode={isFocusMode} />
            </div>

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
                        { id: 'hand' as const, label: 'Hand Tool', icon: <Hand size={14} /> },
                        { id: 'select' as const, label: 'Select Element', icon: <MousePointer size={14} /> },
                        { id: 'text' as const, label: 'Text Tool', icon: <Type size={14} /> },
                        { id: 'solve' as const, label: 'Solve', icon: <Scissors size={14} /> },
                    ].map((t) => {
                        const isConfigurable = ['pen', 'fountain', 'marker', 'highlighter', 'eraser', 'select', 'text'].includes(t.id);
                        const isActive = activeTool === t.id;

                        const buttonElement = (
                            <button
                                key={t.id}
                                onClick={() => {
                                    if (isActive) {
                                        setPopoverOpen(!popoverOpen);
                                    } else {
                                        setActiveTool(t.id);
                                        setPopoverOpen(false);
                                        if (['pen', 'fountain', 'marker', 'highlighter'].includes(t.id)) {
                                            setSelectedShape('freehand');
                                        }
                                    }
                                }}
                                className={`cursor-pointer transition-all w-9 h-9 flex items-center justify-center rounded-lg relative ${
                                    isActive 
                                        ? 'bg-stone-100 dark:bg-white/10 text-stone-950 dark:text-white font-bold shadow-none' 
                                        : 'hover:bg-stone-100 dark:hover:bg-white/5 text-stone-600 dark:text-gray-300'
                                }`}
                                title={t.label}
                                aria-label={`Select ${t.label} tool`}
                                aria-haspopup={isConfigurable ? "dialog" : undefined}
                                aria-expanded={isConfigurable && isActive ? popoverOpen : undefined}
                            >
                                {t.icon}
                                {isActive && t.id !== 'eraser' && (
                                    <div 
                                        className="absolute bottom-1 right-1 w-2 h-2 rounded-full border border-white dark:border-stone-900 shadow-sm"
                                        style={{ backgroundColor: color }}
                                    />
                                )}
                            </button>
                        );

                        if (isConfigurable && isActive) {
                            return (
                                <Popover
                                    key={t.id}
                                    opened={popoverOpen}
                                    onChange={setPopoverOpen}
                                    position="bottom"
                                    withArrow
                                    shadow="md"
                                    trapFocus
                                    withinPortal
                                >
                                    <Popover.Target>
                                        {buttonElement}
                                    </Popover.Target>
                                    <Popover.Dropdown className="bg-white dark:bg-[#1c1c1f] border border-stone-200 dark:border-[#2d2d30] p-3 rounded-xl shadow-xl flex flex-col gap-3">
                                        {t.id === 'select' ? (
                                            <div className="flex flex-col gap-1.5 select-none">
                                                <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 dark:text-gray-500">
                                                    Selection Mode
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="xs"
                                                        variant={selectedSelectionShape === 'rectangle' ? 'default' : 'outline'}
                                                        className={`flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-bold ${
                                                            selectedSelectionShape === 'rectangle'
                                                                ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-950 hover:bg-stone-850 dark:hover:bg-stone-100'
                                                                : 'border-stone-200 dark:border-stone-850 hover:bg-stone-50 dark:hover:bg-white/5'
                                                        }`}
                                                        onClick={() => setSelectedSelectionShape('rectangle')}
                                                    >
                                                        <Square size={13} />
                                                        Rectangle
                                                    </Button>
                                                    <Button
                                                        size="xs"
                                                        variant={selectedSelectionShape === 'lasso' ? 'default' : 'outline'}
                                                        className={`flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-bold ${
                                                            selectedSelectionShape === 'lasso'
                                                                ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-950 hover:bg-stone-850 dark:hover:bg-stone-100'
                                                                : 'border-stone-200 dark:border-stone-850 hover:bg-stone-50 dark:hover:bg-white/5'
                                                        }`}
                                                        onClick={() => setSelectedSelectionShape('lasso')}
                                                    >
                                                        <LassoSelect size={13} />
                                                        Lasso
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Color swatches inside popover for drawing tools */}
                                                {t.id !== 'eraser' && (
                                                    <div className="flex items-center gap-1.5">
                                                        {(t.id === 'highlighter' ? HIGHLIGHTER_SWATCHES : SWATCHES).map((swatch) => (
                                                            <button
                                                                key={swatch}
                                                                onClick={() => setColor(swatch)}
                                                                className={`cursor-pointer w-5 h-5 rounded-full border border-stone-200 dark:border-[#2d2d30] transition-all hover:scale-110 active:scale-90 ${
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
                                                )}

                                                {/* Width slider inside popover */}
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 dark:text-gray-500 select-none">
                                                        {t.id === 'text' ? 'Font Size' : 'Thickness'}
                                                    </span>
                                                    <div className="flex items-center gap-3 min-w-[150px] select-none">
                                                        <Slider
                                                            size="xs"
                                                            className="flex-1"
                                                            min={WIDTH_RANGES[t.id]?.min ?? 1}
                                                            max={WIDTH_RANGES[t.id]?.max ?? 20}
                                                            value={t.id === 'eraser' ? eraserWidth : strokeWidth}
                                                            onChange={handleWidthChange}
                                                            label={null}
                                                            styles={{
                                                                thumb: { transition: 'transform 100ms ease' }
                                                            }}
                                                        />
                                                        <span className="text-[11px] font-bold text-stone-500 dark:text-gray-400 font-mono w-7 text-right select-none">
                                                            {(t.id === 'eraser' ? eraserWidth : strokeWidth)}px
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Opacity slider inside popover (only for drawing tools) */}
                                                {t.id !== 'eraser' && (
                                                    <div className="flex flex-col gap-1 mt-1">
                                                        <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 dark:text-gray-500 select-none">
                                                            Opacity
                                                        </span>
                                                        <div className="flex items-center gap-3 min-w-[150px] select-none">
                                                            <Slider
                                                                size="xs"
                                                                className="flex-1"
                                                                min={0.1}
                                                                max={t.id === 'highlighter' ? 0.6 : 1.0}
                                                                step={0.05}
                                                                value={strokeOpacity}
                                                                onChange={handleOpacityChange}
                                                                label={null}
                                                                styles={{
                                                                    thumb: { transition: 'transform 100ms ease' }
                                                                }}
                                                            />
                                                            <span className="text-[11px] font-bold text-stone-500 dark:text-gray-400 font-mono w-7 text-right select-none">
                                                                {Math.round(strokeOpacity * 100)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </Popover.Dropdown>
                                </Popover>
                            );
                        }

                        return buttonElement;
                    })}

                    {/* Divider */}
                    <div className="h-6 w-[1px] bg-stone-200 dark:bg-stone-800 mx-1" />

                    {/* Insert Image Button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer transition-all w-9 h-9 flex items-center justify-center rounded-lg hover:bg-stone-100 dark:hover:bg-white/5 text-stone-600 dark:text-gray-300 relative"
                        title="Insert Image"
                        aria-label="Insert Image"
                    >
                        <ImageIcon size={14} />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                    />
                </div>

                {/* Divider */}
                <div className="h-6 w-[1px] bg-stone-200 dark:bg-stone-800 mx-1" />

                {/* New Canvas Button */}
                <Button
                    onClick={handleNewCanvas}
                    className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-stone-300 transition-all h-9 w-9 p-0 flex items-center justify-center rounded-lg"
                    variant="default"
                    title="New Canvas (Archives current work to Draft and creates fresh whiteboard)"
                    aria-label="Create a new blank canvas"
                >
                    <FilePlus size={16} className="text-stone-600 dark:text-stone-300" />
                </Button>


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



            {/* Main Interactive Canvas */}
            <canvas
                ref={canvasRef}
                id="canvas"
                className={`absolute top-0 left-0 w-full h-full touch-none transition-all duration-300 ${
                    colorScheme === 'light' ? 'invert-[0.93] hue-rotate-180' : ''
                }`}
                style={{ cursor: canvasCursor }}
                width={windowSize.width}
                height={windowSize.height}
                onMouseDown={handleMouseDown}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onTouchStart={handleTouchStart}
                onTouchMove={drawTouch}
                onTouchEnd={stopDrawingTouch}
            />
            {activeTextEdit && (() => {
                const measuredWidth = measureTextWidth(activeTextEdit.text || '', activeTextEdit.fontSize);
                const textareaWidth = (measuredWidth + 24) * camera.scale;
                const lineCount = activeTextEdit.text.split('\n').length;
                const textareaHeight = (lineCount * activeTextEdit.fontSize * 1.2 + 8) * camera.scale;

                return (
                    <textarea
                        className={`select-text-editor absolute !outline-none focus:!outline-none focus-visible:!outline-none resize-none p-0 m-0 overflow-hidden font-sans z-50 focus:ring-0 select-text ${
                            colorScheme === 'light' ? 'invert-[0.93] hue-rotate-180' : ''
                        }`}
                        style={{
                            left: activeTextEdit.x * camera.scale + camera.offsetX,
                            top: (activeTextEdit.y - activeTextEdit.fontSize) * camera.scale + camera.offsetY,
                            fontSize: `${activeTextEdit.fontSize * camera.scale}px`,
                            lineHeight: '1.2',
                            color: activeTextEdit.color,
                            width: `${textareaWidth}px`,
                            height: `${textareaHeight}px`,
                            minHeight: `${activeTextEdit.fontSize * camera.scale * 1.4}px`,
                            caretColor: activeTextEdit.color,
                            border: selectedElementIds.includes(activeTextEdit.id) ? 'none' : '1.5px dashed rgba(156, 163, 175, 0.5)',
                            outline: 'none',
                            boxShadow: 'none',
                            fontFamily: 'sans-serif',
                            backgroundColor: 'transparent'
                        }}
                        autoFocus
                        placeholder="Type here..."
                        value={activeTextEdit.text}
                        onBlur={commitTextEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setActiveTextEdit(null);
                                setTimeout(() => redrawViewCanvas(), 0);
                            }
                        }}
                        onChange={(e) => {
                            setActiveTextEdit((prev: any) => prev ? { ...prev, text: e.target.value } : null);
                        }}
                    />
                );
            })()}
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
                    onUpdateResult={handleUpdateResult}
                />
            ))}

            {isScanning && <div className="scanning-laser" />}

            {showExamples && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-canvas-placeholder flex flex-col items-center gap-6 max-w-lg w-full px-6 text-center select-none pointer-events-none">
                    <div className="flex flex-col items-center gap-2 pointer-events-auto">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-white tracking-tight">
                            Unlock the Power of <span className="text-stone-900 dark:text-white font-extrabold">SolveIQ</span>
                        </h2>
                        <p className="text-stone-500 dark:text-gray-400 text-sm max-w-sm">
                            Draw your equations or click one of our pre-baked math examples below to see SolveIQ scan and solve in real-time.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-2 pointer-events-auto">
                        {EXAMPLE_PROBLEMS.map((problem, index) => {
                            const isLastOdd = index === EXAMPLE_PROBLEMS.length - 1 && EXAMPLE_PROBLEMS.length % 2 !== 0;
                            return (
                                <button
                                    key={problem.id}
                                    onClick={() => handleTryExample(problem)}
                                    className={`cursor-pointer flex flex-col items-center text-center p-3.5 rounded-xl border border-stone-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-stone-50 dark:hover:bg-white/10 hover:border-stone-300 dark:hover:border-white/20 active:scale-[0.98] transition-all text-stone-900 dark:text-white backdrop-blur-md shadow-lg group ${
                                        isLastOdd ? 'sm:col-span-2 sm:w-[calc(50%-6px)] sm:mx-auto' : ''
                                    }`}
                                >
                                    <span className="text-sm font-bold text-stone-900 dark:text-white group-hover:opacity-85">
                                        {problem.name}
                                    </span>
                                    <span className="text-xs text-stone-500 dark:text-gray-400 mt-1 leading-normal line-clamp-2">
                                        {problem.description}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Bottom Left Controls (Zoom and Undo/Redo) */}
            <div className={`absolute z-controls bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-[calc(1.25rem+env(safe-area-inset-left))] pointer-events-auto flex items-center gap-2 transition-opacity duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {/* Zoom Control Group */}
                <div className="flex items-center bg-white/95 dark:bg-[#1c1c1f]/95 border border-stone-200/80 dark:border-stone-800/80 h-10 rounded-xl shadow-lg px-1.5 gap-0.5">
                    {/* Zoom Out */}
                    <Button
                        onClick={zoomOut}
                        className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-7 w-7 p-0 flex items-center justify-center rounded-lg cursor-pointer"
                        variant="default"
                        title="Zoom Out"
                        aria-label="Zoom Out"
                    >
                        <Minus size={14} className="text-stone-500 dark:text-gray-300" />
                    </Button>
                    
                    {/* Current Zoom Menu trigger */}
                    <MantineMenu shadow="md" width={160} position="top-start">
                        <MantineMenu.Target>
                            <button
                                className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-7 px-2.5 flex items-center justify-center rounded-lg cursor-pointer text-xs font-mono font-bold select-none min-w-[50px]"
                                title="Zoom Options"
                                aria-label={`Zoom controls (current zoom: ${Math.round(camera.scale * 100)}%)`}
                            >
                                {Math.round(camera.scale * 100)}%
                            </button>
                        </MantineMenu.Target>

                        <MantineMenu.Dropdown className="bg-white dark:bg-[#18181c] border border-stone-200 dark:border-[#2d2d30] p-1 rounded-xl shadow-2xl z-50">
                            <MantineMenu.Item
                                onClick={zoomIn}
                                leftSection={<ZoomIn size={14} className="text-stone-500" />}
                                className="hover:bg-stone-100 dark:hover:bg-white/5 text-xs text-stone-700 dark:text-white rounded-lg transition-colors p-2"
                            >
                                Zoom In
                            </MantineMenu.Item>
                            <MantineMenu.Item
                                onClick={zoomOut}
                                leftSection={<ZoomOut size={14} className="text-stone-500" />}
                                className="hover:bg-stone-100 dark:hover:bg-white/5 text-xs text-stone-700 dark:text-white rounded-lg transition-colors p-2"
                            >
                                Zoom Out
                            </MantineMenu.Item>
                            <MantineMenu.Item
                                onClick={zoomToContent}
                                leftSection={<Target size={14} className="text-stone-500" />}
                                className="hover:bg-stone-100 dark:hover:bg-white/5 text-xs text-stone-700 dark:text-white rounded-lg transition-colors p-2"
                            >
                                Zoom to Fit
                            </MantineMenu.Item>
                            <MantineMenu.Item
                                onClick={resetView}
                                leftSection={<Maximize size={14} className="text-stone-500" />}
                                className="hover:bg-stone-100 dark:hover:bg-white/5 text-xs text-stone-700 dark:text-white rounded-lg transition-colors p-2"
                            >
                                Reset to 100%
                            </MantineMenu.Item>

                            <MantineMenu.Divider className="border-stone-100 dark:border-stone-800/60 my-1" />

                            <MantineMenu.Item
                                onClick={() => setShowGrid(!showGrid)}
                                closeMenuOnClick={false}
                                leftSection={<Grid size={14} className="text-stone-500" />}
                                rightSection={
                                    <div className={`w-3.5 h-3.5 rounded border border-stone-300 dark:border-stone-600 flex items-center justify-center transition-colors ${showGrid ? 'bg-stone-900 dark:bg-stone-100 border-none' : ''}`}>
                                        {showGrid && <span className="text-[9px] text-white dark:text-stone-900 font-bold">✓</span>}
                                    </div>
                                }
                                className="hover:bg-stone-100 dark:hover:bg-white/5 text-xs text-stone-700 dark:text-white rounded-lg transition-colors p-2"
                            >
                                Grid Background
                            </MantineMenu.Item>
                        </MantineMenu.Dropdown>
                    </MantineMenu>

                    {/* Zoom In */}
                    <Button
                        onClick={zoomIn}
                        className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-7 w-7 p-0 flex items-center justify-center rounded-lg cursor-pointer"
                        variant="default"
                        title="Zoom In"
                        aria-label="Zoom In"
                    >
                        <Plus size={14} className="text-stone-500 dark:text-gray-300" />
                    </Button>
                </div>

                {/* Undo/Redo Control Group */}
                <div className="flex items-center bg-white/95 dark:bg-[#1c1c1f]/95 border border-stone-200/80 dark:border-stone-800/80 h-10 rounded-xl shadow-lg px-1.5 gap-0.5">
                    {/* Undo */}
                    <Button
                        onClick={undo}
                        disabled={!canUndo}
                        className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-7 w-7 p-0 flex items-center justify-center rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
                        variant="default"
                        title="Undo (Ctrl+Z / ⌘+Z)"
                        aria-label="Undo last canvas stroke"
                    >
                        <Undo2 size={14} className="text-stone-500 dark:text-gray-300" />
                    </Button>

                    {/* Redo */}
                    <Button
                        onClick={redo}
                        disabled={!canRedo}
                        className="bg-transparent hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-white transition-all h-7 w-7 p-0 flex items-center justify-center rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
                        variant="default"
                        title="Redo (Ctrl+Shift+Z / ⌘+Shift+Z)"
                        aria-label="Redo last undone canvas stroke"
                    >
                        <Redo2 size={14} className="text-stone-500 dark:text-gray-300" />
                    </Button>
                </div>
            </div>

            <button
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className={`absolute bottom-6 right-6 z-controls w-14 h-14 sketch-circle border-3 border-stone-900 text-stone-900 bg-white hover:bg-stone-50/50 dark:border-white dark:text-white dark:bg-[#18181c] dark:hover:bg-white/5 flex items-center justify-center cursor-pointer shadow-lg outline-none ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                title="Vector"
                aria-label={isCopilotOpen ? "Close AI Copilot chat" : "Open AI Copilot chat"}
            >
                {isCopilotOpen ? <X size={22} strokeWidth={3} className="text-stone-900 dark:text-white" /> : <MessageSquare size={22} strokeWidth={3} className="text-stone-900 dark:text-white" />}
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