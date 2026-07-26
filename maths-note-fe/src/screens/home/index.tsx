import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { SWATCHES } from '@/constants';
import { Eraser, Pen, MessageSquare, X, Menu, Sparkles, ChevronDown, Square, Circle, Triangle, Slash, Undo2, Redo2, Maximize, Trash2, Crop, Scissors } from 'lucide-react';
import { DraggableResultCard } from '@/components/DraggableResultCard';
import { useMathCanvas } from './useMathCanvas';
import { useCanvasSolver } from './useCanvasSolver';
import { useCopilotChat } from './useCopilotChat';
import { Modal } from '@mantine/core';

import { useSolveHistory } from '@/hooks/useSolveHistory';
import { HistorySidebar } from '@/components/HistorySidebar';

import { EXAMPLE_PROBLEMS } from '@/data/exampleProblems';

export default function Home() {
    const selectionSolveRef = useRef<((selection: any) => void) | null>(null);
    const handleSelectionSolve = useCallback((selection: { type: 'rect' | 'lasso'; points: { x: number; y: number }[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }) => {
        selectionSolveRef.current?.(selection);
    }, []);

    const {
        canvasRef,
        masterCanvasRef,
        drawBoundsRef,
        setIsEraser,
        activeTool,
        setActiveTool,
        color,
        setColor,
        selectedShape,
        setSelectedShape,
        isShapeMenuOpen,
        setIsShapeMenuOpen,
        isColorPickerOpen,
        setIsColorPickerOpen,
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

    const { history, saveHistoryEntry, clearHistory, deleteHistoryItem } = useSolveHistory();

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

    const showExamples = isCanvasEmpty && results.length === 0;

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
            // Help: ? (shift + /)
            else if (e.key === '?') {
                e.preventDefault();
                setIsShortcutsOpen(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, setIsEraser, setSelectedShape]);

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
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                dictOfVars={dictOfVars}
                history={history}
                onSelectEntry={handleSelectHistoryEntry}
                onClearHistory={clearHistory}
                onDeleteEntry={deleteHistoryItem}
            />

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

            {/* Centered Horizontal Toolbar */}
            <div className="absolute z-50 top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#1e1e1e] border border-[#333] p-1.5 rounded-xl shadow-lg pointer-events-auto">
                {/* Tool Selector Segmented Control */}
                <div className="flex items-center gap-1 bg-[#2c2c2c]/30 p-1 rounded-lg border border-[#444]/40 h-8 flex-shrink-0">
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
                                    ? 'bg-[#3c3c3c] text-amber-400 font-bold shadow-sm' 
                                    : 'hover:bg-white/5 text-gray-300'
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
                    onClick={resetCanvas}
                    className="bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] transition-all p-2 h-8 flex items-center justify-center gap-1.5 rounded-lg min-w-[70px]"
                    variant="default"
                    title="Clear Canvas (Destroy whiteboard content)"
                >
                    <Trash2 size={14} className="text-red-400" />
                    <span className="text-xs font-semibold select-none font-sans">Clear</span>
                </Button>

                {/* Undo Button */}
                <Button
                    onClick={undo}
                    disabled={!canUndo}
                    className="bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] transition-all p-2 h-8 w-8 flex items-center justify-center rounded-lg disabled:opacity-35 disabled:hover:bg-[#2c2c2c]/50 disabled:cursor-not-allowed cursor-pointer"
                    variant="default"
                    title="Undo (Ctrl+Z / ⌘+Z)"
                >
                    <Undo2 size={14} className="text-gray-300" />
                </Button>

                {/* Redo Button */}
                <Button
                    onClick={redo}
                    disabled={!canRedo}
                    className="bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] transition-all p-2 h-8 w-8 flex items-center justify-center rounded-lg disabled:opacity-35 disabled:hover:bg-[#2c2c2c]/50 disabled:cursor-not-allowed cursor-pointer"
                    variant="default"
                    title="Redo (Ctrl+Shift+Z / ⌘+Shift+Z)"
                >
                    <Redo2 size={14} className="text-gray-300" />
                </Button>

                {/* Reset View Button */}
                <Button
                    onClick={resetView}
                    className="bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] transition-all p-2 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer"
                    variant="default"
                    title="Reset View (Ctrl+0)"
                >
                    <Maximize size={14} className="text-gray-300" />
                </Button>

                {activeTool === 'pen' && (
                    <>
                        {/* Divider */}
                        <div className="h-5 w-[1px] bg-[#333] mx-1" />

                        {/* Shape Tool Selector Button */}
                        <div className="relative">
                            <button
                                onClick={() => {
                                    setIsShapeMenuOpen(!isShapeMenuOpen);
                                    setIsColorPickerOpen(false);
                                }}
                                className={`bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 px-2 transition-all gap-1.5 ${isShapeMenuOpen ? 'bg-[#3c3c3c] border-white/20' : ''}`}
                                title="Select Drawing Tool"
                            >
                                {selectedShape === 'freehand' && <Pen size={14} className="text-gray-300" />}
                                {selectedShape === 'line' && <Slash size={14} className="text-gray-300" />}
                                {selectedShape === 'rectangle' && <Square size={14} className="text-gray-300" />}
                                {selectedShape === 'circle' && <Circle size={14} className="text-gray-300" />}
                                {selectedShape === 'triangle' && <Triangle size={14} className="text-gray-300" />}
                                <span className="text-xs font-semibold select-none capitalize">
                                    {selectedShape === 'freehand' ? 'Pen' : selectedShape}
                                </span>
                                <ChevronDown size={10} className="text-gray-500" />
                            </button>
                            
                            {isShapeMenuOpen && (
                                <div className="absolute top-11 left-1/2 -translate-x-1/2 bg-[#18181c] border border-[#2d2d30] p-1 rounded-xl shadow-2xl z-50 flex flex-col gap-0.5 min-w-[120px] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-150">
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
                                            className={`cursor-pointer hover:bg-white/5 transition-colors p-1.5 text-left rounded-lg text-xs flex items-center gap-2 w-full text-white ${selectedShape === tool.id ? 'bg-white/10 font-bold' : ''}`}
                                        >
                                            <span className="text-gray-400">{tool.icon}</span>
                                            <span>{tool.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="h-5 w-[1px] bg-[#333] mx-1" />

                        {/* Color Picker Toggle Button */}
                        <div className="relative">
                            <button
                                onClick={() => {
                                    setIsColorPickerOpen(!isColorPickerOpen);
                                    setIsShapeMenuOpen(false);
                                }}
                                className={`bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] border border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 w-8 transition-all ${isColorPickerOpen ? 'bg-[#3c3c3c] border-white/20' : ''}`}
                                title="Choose Color"
                            >
                                <div 
                                    className="w-3.5 h-3.5 rounded-full border border-white/30" 
                                    style={{ backgroundColor: color }} 
                                />
                            </button>
                            
                            {/* Color Picker Popover */}
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
                    </>
                )}

                {/* Divider */}
                <div className="h-5 w-[1px] bg-[#333] mx-1" />

                {/* Keyboard Shortcuts Button */}
                <Button
                    onClick={() => setIsShortcutsOpen(true)}
                    className="bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 w-8 transition-all hover:scale-105 active:scale-95 cursor-pointer text-gray-300 font-bold font-sans text-xs"
                    variant="default"
                    title="Keyboard Shortcuts (?)"
                >
                    ?
                </Button>
            </div>

            {/* Top Right Run Button */}
            <div className="absolute z-50 top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] pointer-events-auto">
                <Button
                    onClick={() => runRoute()}
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
                    key={result.id || index}
                    result={result}
                    defaultPosition={getCardPosition(result, index)}
                    setPosition={(newPos) => handleCardPositionChange(result, newPos)}
                />
            ))}

            {isScanning && <div className="scanning-laser" />}

            {showExamples && (
                <div className="absolute top-[40%] sm:top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-6 max-w-lg w-full px-6 text-center select-none pointer-events-none">
                    <div className="flex flex-col items-center gap-2 pointer-events-auto">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                            Unlock the Power of <span className="text-amber-500">SolveIQ</span>
                        </h2>
                        <p className="text-gray-400 text-sm max-w-sm">
                            Draw your equations or click one of our pre-baked math examples below to see SolveIQ scan and solve in real-time.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-2 pointer-events-auto">
                        {EXAMPLE_PROBLEMS.map((problem) => (
                            <button
                                key={problem.id}
                                onClick={() => handleTryExample(problem.strokes)}
                                className="cursor-pointer flex flex-col text-left p-3.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] transition-all text-white backdrop-blur-md shadow-lg group"
                            >
                                <span className="text-sm font-bold text-amber-400 group-hover:text-amber-300 flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-amber-500 animate-pulse" />
                                    {problem.name}
                                </span>
                                <span className="text-xs text-gray-400 mt-1 leading-normal line-clamp-2">
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
                className="absolute bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-500/40 hover:scale-110 active:scale-95 transition-all duration-200 border border-white/20 cursor-pointer"
                title="Vector"
            >
                {isCopilotOpen ? <X size={22} className="text-white" /> : <MessageSquare size={22} className="text-white" />}
            </button>

            {/* Copilot Sidebar Panel */}
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
            <Modal
                opened={isShortcutsOpen}
                onClose={() => setIsShortcutsOpen(false)}
                title={<span className="font-bold text-white">Keyboard Shortcuts Reference</span>}
                centered
                styles={{
                    content: {
                        backgroundColor: '#1c1917',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '16px',
                        color: 'white',
                    },
                    header: {
                        backgroundColor: '#1c1917',
                        color: 'white',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    },
                }}
            >
                <div className="flex flex-col gap-4 text-sm font-sans">
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Undo stroke</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">Ctrl + Z / ⌘ + Z</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Redo stroke</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">Ctrl + Shift + Z / ⌘ + Shift + Z</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Pen (Freehand)</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">P</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Eraser</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">E</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Line Tool</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">L</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Rectangle Tool</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">R</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Circle Tool</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">C</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Triangle Tool</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">T</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Zoom in/out</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">Scroll Wheel</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Pan Canvas</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">Space + Drag / Middle Drag</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Reset Canvas View</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">Ctrl + 0 / ⌘ + 0</kbd>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                        <span className="text-gray-400">Open Shortcuts Help</span>
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-amber-400 font-bold border border-white/15">?</kbd>
                    </div>
                </div>
            </Modal>
        </>
    );
}