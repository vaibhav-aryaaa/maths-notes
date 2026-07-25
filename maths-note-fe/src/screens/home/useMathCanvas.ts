import { useEffect, useRef, useState } from 'react';

export const useMathCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);
    const [isEraser, setIsEraser] = useState(false);
    const [color, setColor] = useState('rgb(255, 255, 255)');
    const [selectedShape, setSelectedShape] = useState<'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle'>('freehand');
    const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [windowSize, setWindowSize] = useState({ 
        width: typeof window !== 'undefined' ? window.innerWidth : 1024, 
        height: typeof window !== 'undefined' ? window.innerHeight : 768 
    });

    const startPosRef = useRef({ x: 0, y: 0 });
    const savedImageDataRef = useRef<ImageData | null>(null);
    
    // Bounds tracking for canvas crop optimization
    const drawBoundsRef = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    interface HistoryState {
        imageData: ImageData;
        bounds: { minX: number; minY: number; maxX: number; maxY: number };
    }

    const undoStackRef = useRef<HistoryState[]>([]);
    const redoStackRef = useRef<HistoryState[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const saveState = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const state: HistoryState = {
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
            bounds: { ...drawBoundsRef.current }
        };

        undoStackRef.current.push(state);
        if (undoStackRef.current.length > 50) {
            undoStackRef.current.shift();
        }
        
        redoStackRef.current = [];
        setCanUndo(true);
        setCanRedo(false);
    };

    const updateBounds = (x: number, y: number) => {
        if (x < drawBoundsRef.current.minX) drawBoundsRef.current.minX = x;
        if (x > drawBoundsRef.current.maxX) drawBoundsRef.current.maxX = x;
        if (y < drawBoundsRef.current.minY) drawBoundsRef.current.minY = y;
        if (y > drawBoundsRef.current.maxY) drawBoundsRef.current.maxY = y;
    };

    const colorRef = useRef(color);
    useEffect(() => {
        colorRef.current = color;
    }, [color]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleResize = () => {
            let tempCanvas: HTMLCanvasElement | null = null;
            if (canvas) {
                tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                    tempCtx.drawImage(canvas, 0, 0);
                }
            }

            // Update size triggers state re-render
            setWindowSize({ width: window.innerWidth, height: window.innerHeight });

            // Restore canvas contents on next paint cycle
            requestAnimationFrame(() => {
                if (canvas && tempCanvas) {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.lineCap = 'round';
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = colorRef.current;
                        ctx.drawImage(tempCanvas, 0, 0);
                    }
                }
            });
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.lineCap = 'round';
                ctx.lineWidth = 3;
            }
        }
    }, [windowSize]);

    const resetCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        drawBoundsRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        setIsCanvasEmpty(true);
        undoStackRef.current = [];
        redoStackRef.current = [];
        setCanUndo(false);
        setCanRedo(false);
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.style.background = 'black';
            const ctx = canvas.getContext('2d');
            if (ctx) {
                saveState();
                const x = e.nativeEvent.offsetX;
                const y = e.nativeEvent.offsetY;
                setIsDrawing(true);
                setIsCanvasEmpty(false);
                
                if (isEraser || selectedShape === 'freehand') {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    if (!isEraser) {
                        updateBounds(x, y);
                    }
                } else {
                    startPosRef.current = { x, y };
                    savedImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
                }
            }
        }
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const x = e.nativeEvent.offsetX;
                const y = e.nativeEvent.offsetY;

                if (isEraser || selectedShape === 'freehand') {
                    if (isEraser) {
                        ctx.globalCompositeOperation = 'destination-out';
                        ctx.lineWidth = 20; // Thicker line for erasing
                    } else {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 3;
                        updateBounds(x, y);
                    }
                    ctx.lineTo(x, y);
                    ctx.stroke();
                } else {
                    // Shape Tool preview mode
                    if (savedImageDataRef.current) {
                        ctx.putImageData(savedImageDataRef.current, 0, 0);
                    }
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    
                    const sx = startPosRef.current.x;
                    const sy = startPosRef.current.y;
                    
                    if (selectedShape === 'line') {
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(x, y);
                    } else if (selectedShape === 'rectangle') {
                        ctx.rect(sx, sy, x - sx, y - sy);
                    } else if (selectedShape === 'circle') {
                        const dx = x - sx;
                        const dy = y - sy;
                        const radius = Math.sqrt(dx * dx + dy * dy);
                        ctx.arc(sx, sy, radius, 0, 2 * Math.PI);
                    } else if (selectedShape === 'triangle') {
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(sx, y);
                        ctx.lineTo(x, y);
                        ctx.closePath();
                    }
                    ctx.stroke();
                }
            }
        }
    };

    const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        setIsDrawing(false);

        const canvas = canvasRef.current;
        if (canvas && !isEraser && selectedShape !== 'freehand') {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const x = e.nativeEvent?.offsetX ?? startPosRef.current.x;
                const y = e.nativeEvent?.offsetY ?? startPosRef.current.y;
                const sx = startPosRef.current.x;
                const sy = startPosRef.current.y;

                updateBounds(sx, sy);
                if (selectedShape === 'circle') {
                    const dx = x - sx;
                    const dy = y - sy;
                    const radius = Math.sqrt(dx * dx + dy * dy);
                    updateBounds(sx - radius, sy - radius);
                    updateBounds(sx + radius, sy + radius);
                } else {
                    updateBounds(x, y);
                }
            }
        }
    };

    const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0] || e.changedTouches[0];
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    };

    const startDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.style.background = 'black';
            const ctx = canvas.getContext('2d');
            if (ctx) {
                 saveState();
                 const pos = getTouchPos(e);
                 setIsDrawing(true);
                 setIsCanvasEmpty(false);
                
                if (isEraser || selectedShape === 'freehand') {
                    ctx.beginPath();
                    ctx.moveTo(pos.x, pos.y);
                    if (!isEraser) {
                        updateBounds(pos.x, pos.y);
                    }
                } else {
                    startPosRef.current = { x: pos.x, y: pos.y };
                    savedImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
                }
            }
        }
    };

    const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const pos = getTouchPos(e);

                if (isEraser || selectedShape === 'freehand') {
                    if (isEraser) {
                        ctx.globalCompositeOperation = 'destination-out';
                        ctx.lineWidth = 20;
                    } else {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 3;
                        updateBounds(pos.x, pos.y);
                    }
                    ctx.lineTo(pos.x, pos.y);
                    ctx.stroke();
                } else {
                    // Shape Tool preview mode
                    if (savedImageDataRef.current) {
                        ctx.putImageData(savedImageDataRef.current, 0, 0);
                    }
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    
                    const sx = startPosRef.current.x;
                    const sy = startPosRef.current.y;
                    
                    if (selectedShape === 'line') {
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(pos.x, pos.y);
                    } else if (selectedShape === 'rectangle') {
                        ctx.rect(sx, sy, pos.x - sx, pos.y - sy);
                    } else if (selectedShape === 'circle') {
                        const dx = pos.x - sx;
                        const dy = pos.y - sy;
                        const radius = Math.sqrt(dx * dx + dy * dy);
                        ctx.arc(sx, sy, radius, 0, 2 * Math.PI);
                    } else if (selectedShape === 'triangle') {
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(sx, pos.y);
                        ctx.lineTo(pos.x, pos.y);
                        ctx.closePath();
                    }
                    ctx.stroke();
                }
            }
        }
    };

    const stopDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        setIsDrawing(false);

        const canvas = canvasRef.current;
        if (canvas && !isEraser && selectedShape !== 'freehand') {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const pos = getTouchPos(e);
                const sx = startPosRef.current.x;
                const sy = startPosRef.current.y;

                updateBounds(sx, sy);
                if (selectedShape === 'circle') {
                    const dx = pos.x - sx;
                    const dy = pos.y - sy;
                    const radius = Math.sqrt(dx * dx + dy * dy);
                    updateBounds(sx - radius, sy - radius);
                    updateBounds(sx + radius, sy + radius);
                } else {
                    updateBounds(pos.x, pos.y);
                }
            }
        }
    };

    const drawStrokes = (strokes: { x: number; y: number }[][]) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Reset canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.background = 'black';

        // Reset bounds
        drawBoundsRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        setIsCanvasEmpty(false);
        undoStackRef.current = [];
        redoStackRef.current = [];
        setCanUndo(false);
        setCanRedo(false);

        // Draw each stroke
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = colorRef.current;
        ctx.lineWidth = 3;

        strokes.forEach(stroke => {
            if (stroke.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(stroke[0].x, stroke[0].y);
            updateBounds(stroke[0].x, stroke[0].y);

            for (let i = 1; i < stroke.length; i++) {
                ctx.lineTo(stroke[i].x, stroke[i].y);
                updateBounds(stroke[i].x, stroke[i].y);
            }
            ctx.stroke();
        });
    };

    return {
        canvasRef,
        drawBoundsRef,
        isDrawing,
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
        drawStrokes,
        isCanvasEmpty,
        setIsCanvasEmpty,
        canUndo,
        canRedo,
        undo: () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            if (undoStackRef.current.length === 0) return;

            const currentState: HistoryState = {
                imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
                bounds: { ...drawBoundsRef.current }
            };
            redoStackRef.current.push(currentState);
            setCanRedo(true);

            const prevState = undoStackRef.current.pop()!;
            ctx.putImageData(prevState.imageData, 0, 0);
            drawBoundsRef.current = { ...prevState.bounds };
            setIsCanvasEmpty(prevState.bounds.minX === Infinity);
            setCanUndo(undoStackRef.current.length > 0);
        },
        redo: () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            if (redoStackRef.current.length === 0) return;

            const currentState: HistoryState = {
                imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
                bounds: { ...drawBoundsRef.current }
            };
            undoStackRef.current.push(currentState);
            setCanUndo(true);

            const nextState = redoStackRef.current.pop()!;
            ctx.putImageData(nextState.imageData, 0, 0);
            drawBoundsRef.current = { ...nextState.bounds };
            setIsCanvasEmpty(nextState.bounds.minX === Infinity);
            setCanRedo(redoStackRef.current.length > 0);
        },
    };
};
