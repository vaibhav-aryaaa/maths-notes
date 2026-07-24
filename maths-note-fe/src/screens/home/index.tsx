import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SWATCHES } from '@/constants';
import { Eraser, Pen, MessageSquare, X, Menu, RotateCcw, Sparkles, ChevronDown, Square, Circle, Triangle, Slash } from 'lucide-react';
import { DraggableResultCard } from '@/components/DraggableResultCard';
import { useMathCanvas } from './useMathCanvas';
import { useCanvasSolver } from './useCanvasSolver';
import { useCopilotChat } from './useCopilotChat';

export default function Home() {
    const {
        canvasRef,
        drawBoundsRef,
        isEraser,
        setIsEraser,
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
    } = useMathCanvas();

    const {
        dictOfVars,
        results,
        isScanning,
        latexPosition,
        setLatexPosition,
        runRoute,
    } = useCanvasSolver(canvasRef, drawBoundsRef);

    const {
        isCopilotOpen,
        setIsCopilotOpen,
        copilotMessages,
        copilotInput,
        setCopilotInput,
        isCopilotLoading,
        sendCopilotMessage,
    } = useCopilotChat(dictOfVars, results);

    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [copilotMessages, isCopilotLoading]);

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
                {/* SolveIQ Logo Branding */}
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

            {/* Centered Horizontal Toolbar */}
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
                    onClick={resetCanvas}
                    className="bg-[#2c2c2c]/50 hover:bg-[#3c3c3c] text-white border border-[#444] transition-all p-2 h-8 flex items-center justify-center gap-1.5 rounded-lg min-w-[70px]"
                    variant="default"
                    title="Reset Canvas"
                >
                    <RotateCcw size={14} className="text-red-400" />
                    <span className="text-xs font-semibold select-none font-sans">Reset</span>
                </Button>

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
        </>
    );
}