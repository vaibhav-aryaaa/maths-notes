import { useEffect, useRef, useState, useCallback } from 'react';

export const useMathCanvas = (onSelectionSolve?: (selection: { type: 'rect' | 'lasso'; points: { x: number; y: number }[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }) => void) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const masterCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);
    const [activeTool, setActiveTool] = useState<'pen' | 'eraser' | 'select-rect' | 'select-lasso'>('pen');
    const [color, setColor] = useState('rgb(255, 255, 255)');
    const [selectedShape, setSelectedShape] = useState<'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle'>('freehand');
    const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [windowSize, setWindowSize] = useState({ 
        width: typeof window !== 'undefined' ? window.innerWidth : 1024, 
        height: typeof window !== 'undefined' ? window.innerHeight : 768 
    });

    const isPanningRef = useRef(false);
    const isPinchingRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const panOffsetStartRef = useRef({ x: 0, y: 0 });

    const touchStartDistRef = useRef(0);
    const touchStartMidRef = useRef({ x: 0, y: 0 });
    const touchStartCameraRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });

    const [isSpacePressed, setIsSpacePressed] = useState(false);

    const startPosRef = useRef({ x: 0, y: 0 });
    const lastActivePosRef = useRef({ x: 0, y: 0 });
    const activeStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
    
    // Bounds tracking for canvas crop optimization (stores world coordinates on master canvas)
    const drawBoundsRef = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    interface HistoryState {
        imageData: ImageData;
        bounds: { minX: number; minY: number; maxX: number; maxY: number };
    }

    const undoStackRef = useRef<HistoryState[]>([]);
    const redoStackRef = useRef<HistoryState[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const getMasterCanvas = useCallback((): HTMLCanvasElement => {
        if (!masterCanvasRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = 12000;
            canvas.height = 12000;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.lineCap = 'round';
                ctx.lineWidth = 3;
            }
            masterCanvasRef.current = canvas;
        }
        return masterCanvasRef.current;
    }, []);

    // Camera space parameters: start centered on the 12000x12000px canvas
    const getCenteredCamera = useCallback(() => {
        const viewCanvas = canvasRef.current;
        const width = viewCanvas ? viewCanvas.width : (typeof window !== 'undefined' ? window.innerWidth : 1024);
        const height = viewCanvas ? viewCanvas.height : (typeof window !== 'undefined' ? window.innerHeight : 768);
        return {
            offsetX: width / 2 - 6000,
            offsetY: height / 2 - 6000,
            scale: 1
        };
    }, []);

    const cameraRef = useRef({
        offsetX: (typeof window !== 'undefined' ? window.innerWidth / 2 - 6000 : -5500),
        offsetY: (typeof window !== 'undefined' ? window.innerHeight / 2 - 6000 : -5600),
        scale: 1
    });
    const [camera, setCamera] = useState(() => ({
        offsetX: (typeof window !== 'undefined' ? window.innerWidth / 2 - 6000 : -5500),
        offsetY: (typeof window !== 'undefined' ? window.innerHeight / 2 - 6000 : -5600),
        scale: 1
    }));

    const colorRef = useRef(color);
    useEffect(() => {
        colorRef.current = color;
    }, [color]);

    const isEraser = activeTool === 'eraser';

    const setIsEraserWrapped = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
        setActiveTool((prevTool) => {
            const currentIsEraser = prevTool === 'eraser';
            const nextIsEraser = typeof val === 'function' ? val(currentIsEraser) : val;
            return nextIsEraser ? 'eraser' : 'pen';
        });
    }, []);

    const redrawViewCanvas = useCallback(() => {
        const viewCanvas = canvasRef.current;
        const masterCanvas = getMasterCanvas();
        if (!viewCanvas || !masterCanvas) return;
        const viewCtx = viewCanvas.getContext('2d');
        if (!viewCtx) return;

        const { offsetX, offsetY, scale } = cameraRef.current;

        // Reset transform to identity
        viewCtx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Fill view canvas with black background
        viewCtx.fillStyle = 'black';
        viewCtx.fillRect(0, 0, viewCanvas.width, viewCanvas.height);
        
        // Calculate visible source coordinates on master canvas
        const srcX = Math.max(0, -offsetX / scale);
        const srcY = Math.max(0, -offsetY / scale);
        
        // Calculate visible size (limited by master canvas bounds)
        const srcWidth = Math.min(masterCanvas.width - srcX, viewCanvas.width / scale);
        const srcHeight = Math.min(masterCanvas.height - srcY, viewCanvas.height / scale);

        // Map to destination screen coordinates
        const destX = srcX * scale + offsetX;
        const destY = srcY * scale + offsetY;
        const destWidth = srcWidth * scale;
        const destHeight = srcHeight * scale;

        // Draw only the cropped visible region of the master canvas onto the viewport canvas
        if (srcWidth > 0 && srcHeight > 0) {
            viewCtx.drawImage(
                masterCanvas,
                srcX, srcY, srcWidth, srcHeight,
                destX, destY, destWidth, destHeight
            );
        }

        // Draw active freehand stroke preview if drawing in pen mode
        if (isDrawing && activeStrokePointsRef.current.length > 1 && selectedShape === 'freehand' && activeTool === 'pen') {
            viewCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
            viewCtx.beginPath();
            viewCtx.moveTo(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
            for (let i = 1; i < activeStrokePointsRef.current.length; i++) {
                viewCtx.lineTo(activeStrokePointsRef.current[i].x, activeStrokePointsRef.current[i].y);
            }
            viewCtx.lineCap = 'round';
            viewCtx.lineWidth = 3;
            viewCtx.strokeStyle = colorRef.current;
            viewCtx.globalCompositeOperation = 'source-over';
            viewCtx.stroke();
            viewCtx.setTransform(1, 0, 0, 1, 0, 0);
        }

        // Draw shape preview on screen if drawing shapes in pen mode
        if (isDrawing && activeStrokePointsRef.current.length > 0 && selectedShape !== 'freehand' && activeTool === 'pen') {
            viewCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
            viewCtx.beginPath();
            viewCtx.lineCap = 'round';
            viewCtx.lineWidth = 3;
            viewCtx.strokeStyle = colorRef.current;
            viewCtx.globalCompositeOperation = 'source-over';

            const sx = startPosRef.current.x;
            const sy = startPosRef.current.y;
            const x = lastActivePosRef.current.x;
            const y = lastActivePosRef.current.y;

            if (selectedShape === 'line') {
                viewCtx.moveTo(sx, sy);
                viewCtx.lineTo(x, y);
            } else if (selectedShape === 'rectangle') {
                viewCtx.rect(sx, sy, x - sx, y - sy);
            } else if (selectedShape === 'circle') {
                const dx = x - sx;
                const dy = y - sy;
                const radius = Math.sqrt(dx * dx + dy * dy);
                viewCtx.arc(sx, sy, radius, 0, 2 * Math.PI);
            } else if (selectedShape === 'triangle') {
                viewCtx.moveTo(sx, sy);
                viewCtx.lineTo(sx, y);
                viewCtx.lineTo(x, y);
                viewCtx.closePath();
            }
            viewCtx.stroke();
            viewCtx.setTransform(1, 0, 0, 1, 0, 0);
        }

        // Draw selection outline preview if drawing selection
        if (isDrawing && (activeTool === 'select-rect' || activeTool === 'select-lasso')) {
            viewCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
            viewCtx.beginPath();
            viewCtx.lineWidth = 1.5 / scale;
            viewCtx.strokeStyle = '#3b82f6';
            viewCtx.setLineDash([5 / scale, 5 / scale]);
            viewCtx.globalCompositeOperation = 'source-over';

            if (activeTool === 'select-rect') {
                const sx = startPosRef.current.x;
                const sy = startPosRef.current.y;
                const x = lastActivePosRef.current.x;
                const y = lastActivePosRef.current.y;
                viewCtx.rect(sx, sy, x - sx, y - sy);
                viewCtx.stroke();
            } else if (activeTool === 'select-lasso' && activeStrokePointsRef.current.length > 1) {
                viewCtx.moveTo(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
                for (let i = 1; i < activeStrokePointsRef.current.length; i++) {
                    viewCtx.lineTo(activeStrokePointsRef.current[i].x, activeStrokePointsRef.current[i].y);
                }
                viewCtx.closePath();
                viewCtx.stroke();
            }
            viewCtx.setTransform(1, 0, 0, 1, 0, 0);
            viewCtx.setLineDash([]);
        }
    }, [getMasterCanvas, selectedShape, activeTool, isDrawing]);

    const getWordCoords = (screenX: number, screenY: number) => {
        const { offsetX, offsetY, scale } = cameraRef.current;
        return {
            x: (screenX - offsetX) / scale,
            y: (screenY - offsetY) / scale
        };
    };

    const saveState = () => {
        const masterCanvas = getMasterCanvas();
        const masterCtx = masterCanvas.getContext('2d');
        if (!masterCtx) return;

        const state: HistoryState = {
            imageData: masterCtx.getImageData(0, 0, masterCanvas.width, masterCanvas.height),
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

    // Handle spacebar tracking for panning on mount
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                const activeTag = document.activeElement?.tagName.toLowerCase();
                if (activeTag !== 'input' && activeTag !== 'textarea' && document.activeElement?.getAttribute('contenteditable') !== 'true') {
                    e.preventDefault();
                    setIsSpacePressed(true);
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                setIsSpacePressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Set up window resize listener and view canvas initialization
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const updateSize = () => {
            const rect = canvas.getBoundingClientRect();
            setWindowSize({
                width: rect.width || window.innerWidth,
                height: rect.height || window.innerHeight
            });
        };

        // Initialize immediately
        updateSize();

        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    setWindowSize({
                        width: width || window.innerWidth,
                        height: height || window.innerHeight
                    });
                }
            });
            resizeObserver.observe(canvas);
            return () => {
                resizeObserver.disconnect();
            };
        } else {
            window.addEventListener('resize', updateSize);
            return () => {
                window.removeEventListener('resize', updateSize);
            };
        }
    }, []);

    // Center view once when first mounted and size is set
    const isFirstLayoutRef = useRef(true);
    useEffect(() => {
        if (isFirstLayoutRef.current && windowSize.width > 0) {
            isFirstLayoutRef.current = false;
            const target = getCenteredCamera();
            cameraRef.current = target;
            setCamera(target);
            redrawViewCanvas();
        }
    }, [windowSize, getCenteredCamera, redrawViewCanvas]);

    useEffect(() => {
        redrawViewCanvas();
    }, [windowSize, redrawViewCanvas]);

    // Attach wheel zoom listener with passive: false option to prevent browser default scroll/zoom
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            const { offsetX, offsetY, scale } = cameraRef.current;

            const worldCursorX = (cursorX - offsetX) / scale;
            const worldCursorY = (cursorY - offsetY) / scale;

            const delta = -e.deltaY;
            // Use smooth exponential zoom scaling for a natural scroll feel
            const zoomSensitivity = 0.0015;
            const factor = Math.exp(delta * zoomSensitivity);
            const newScale = Math.min(4, Math.max(0.2, scale * factor));

            const newOffsetX = cursorX - worldCursorX * newScale;
            const newOffsetY = cursorY - worldCursorY * newScale;

            cameraRef.current = {
                offsetX: newOffsetX,
                offsetY: newOffsetY,
                scale: newScale
            };
            setCamera({ ...cameraRef.current });
            redrawViewCanvas();
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', handleWheel);
        };
    }, [redrawViewCanvas]);

    const resetCanvas = () => {
        const masterCanvas = getMasterCanvas();
        const masterCtx = masterCanvas.getContext('2d');
        if (masterCtx) {
            masterCtx.clearRect(0, 0, masterCanvas.width, masterCanvas.height);
        }
        drawBoundsRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        setIsCanvasEmpty(true);
        undoStackRef.current = [];
        redoStackRef.current = [];
        setCanUndo(false);
        setCanRedo(false);

        // Reset camera transform back to centered layout
        const target = getCenteredCamera();
        cameraRef.current = target;
        setCamera(target);

        redrawViewCanvas();
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (isSpacePressed || e.button === 1) {
            isPanningRef.current = true;
            panStartRef.current = { x: e.clientX, y: e.clientY };
            panOffsetStartRef.current = { x: cameraRef.current.offsetX, y: cameraRef.current.offsetY };
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = getWordCoords(screenX, screenY);

        if (activeTool === 'select-rect' || activeTool === 'select-lasso') {
            setIsDrawing(true);
            lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
            startPosRef.current = { x: worldPos.x, y: worldPos.y };
            activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y }];
            redrawViewCanvas();
            return;
        }

        const masterCanvas = getMasterCanvas();
        const masterCtx = masterCanvas.getContext('2d');
        if (masterCtx) {
            saveState();
            setIsDrawing(true);
            setIsCanvasEmpty(false);

            lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
            if (selectedShape === 'freehand') {
                activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y }];
            } else {
                startPosRef.current = { x: worldPos.x, y: worldPos.y };
            }
            redrawViewCanvas();
        }
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (isPanningRef.current) {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            cameraRef.current.offsetX = panOffsetStartRef.current.x + dx;
            cameraRef.current.offsetY = panOffsetStartRef.current.y + dy;
            setCamera({ ...cameraRef.current });
            redrawViewCanvas();
            return;
        }

        if (!isDrawing) return;

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = getWordCoords(screenX, screenY);

        lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
        if (activeTool === 'select-rect' || activeTool === 'select-lasso') {
            if (activeTool === 'select-lasso') {
                activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y });
            }
            redrawViewCanvas();
            return;
        }

        if (selectedShape === 'freehand') {
            activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y });
        }
        redrawViewCanvas();
    };

    const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanningRef.current) {
            isPanningRef.current = false;
            return;
        }

        if (!isDrawing) return;
        setIsDrawing(false);

        const canvas = canvasRef.current;
        const masterCanvas = getMasterCanvas();
        const masterCtx = masterCanvas.getContext('2d');

        if (activeTool === 'select-rect' || activeTool === 'select-lasso') {
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const worldPos = getWordCoords(screenX, screenY);

                const x = worldPos.x;
                const y = worldPos.y;
                const sx = startPosRef.current.x;
                const sy = startPosRef.current.y;

                const points = activeTool === 'select-lasso'
                    ? [...activeStrokePointsRef.current]
                    : [
                        { x: sx, y: sy },
                        { x, y: sy },
                        { x, y },
                        { x: sx, y }
                      ];

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                points.forEach(pt => {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                });

                if (points.length > 0 && maxX - minX > 5 && maxY - minY > 5) {
                    onSelectionSolve?.({
                        type: activeTool === 'select-lasso' ? 'lasso' : 'rect',
                        points,
                        bounds: { minX, minY, maxX, maxY }
                    });
                }
            }
            activeStrokePointsRef.current = [];
            redrawViewCanvas();
            return;
        }

        if (canvas && masterCtx) {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldPos = getWordCoords(screenX, screenY);

            const x = worldPos.x;
            const y = worldPos.y;
            const sx = startPosRef.current.x;
            const sy = startPosRef.current.y;

            masterCtx.lineCap = 'round';
            masterCtx.strokeStyle = colorRef.current;
            masterCtx.lineWidth = isEraser ? 20 : 3;
            masterCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';

            if (selectedShape === 'freehand') {
                if (activeStrokePointsRef.current.length > 0) {
                    masterCtx.beginPath();
                    masterCtx.moveTo(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
                    if (!isEraser) updateBounds(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
                    for (let i = 1; i < activeStrokePointsRef.current.length; i++) {
                        const pt = activeStrokePointsRef.current[i];
                        masterCtx.lineTo(pt.x, pt.y);
                        if (!isEraser) updateBounds(pt.x, pt.y);
                    }
                    masterCtx.stroke();
                }
            } else {
                masterCtx.beginPath();
                if (selectedShape === 'line') {
                    masterCtx.moveTo(sx, sy);
                    masterCtx.lineTo(x, y);
                    updateBounds(sx, sy);
                    updateBounds(x, y);
                } else if (selectedShape === 'rectangle') {
                    masterCtx.rect(sx, sy, x - sx, y - sy);
                    updateBounds(sx, sy);
                    updateBounds(x, y);
                } else if (selectedShape === 'circle') {
                    const dx = x - sx;
                    const dy = y - sy;
                    const radius = Math.sqrt(dx * dx + dy * dy);
                    masterCtx.arc(sx, sy, radius, 0, 2 * Math.PI);
                    updateBounds(sx - radius, sy - radius);
                    updateBounds(sx + radius, sy + radius);
                } else if (selectedShape === 'triangle') {
                    masterCtx.moveTo(sx, sy);
                    masterCtx.lineTo(sx, y);
                    masterCtx.lineTo(x, y);
                    masterCtx.closePath();
                    updateBounds(sx, sy);
                    updateBounds(x, y);
                }
                masterCtx.stroke();
            }
        }
        activeStrokePointsRef.current = [];
        redrawViewCanvas();
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
        if (!canvas) return;

        if (e.touches.length === 2) {
            isPanningRef.current = true;
            isPinchingRef.current = true;
            setIsDrawing(false);

            const p1 = e.touches[0];
            const p2 = e.touches[1];
            touchStartDistRef.current = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
            
            const rect = canvas.getBoundingClientRect();
            touchStartMidRef.current = {
                x: (p1.clientX + p2.clientX) / 2 - rect.left,
                y: (p1.clientY + p2.clientY) / 2 - rect.top
            };
            touchStartCameraRef.current = { ...cameraRef.current };
            return;
        }

        if (isSpacePressed) {
            isPanningRef.current = true;
            panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            panOffsetStartRef.current = { x: cameraRef.current.offsetX, y: cameraRef.current.offsetY };
            return;
        }

        const pos = getTouchPos(e);
        const worldPos = getWordCoords(pos.x, pos.y);

        if (activeTool === 'select-rect' || activeTool === 'select-lasso') {
            setIsDrawing(true);
            lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
            startPosRef.current = { x: worldPos.x, y: worldPos.y };
            activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y }];
            redrawViewCanvas();
            return;
        }

        const masterCanvas = getMasterCanvas();
        const masterCtx = masterCanvas.getContext('2d');
        if (masterCtx) {
            saveState();
            setIsDrawing(true);
            setIsCanvasEmpty(false);

            lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
            if (selectedShape === 'freehand') {
                activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y }];
            } else {
                startPosRef.current = { x: worldPos.x, y: worldPos.y };
            }
            redrawViewCanvas();
        }
    };

    const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (e.touches.length === 2 && isPinchingRef.current) {
            const p1 = e.touches[0];
            const p2 = e.touches[1];
            const dist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
            const rect = canvas.getBoundingClientRect();
            const midX = (p1.clientX + p2.clientX) / 2 - rect.left;
            const midY = (p1.clientY + p2.clientY) / 2 - rect.top;

            const ratio = dist / touchStartDistRef.current;
            const newScale = Math.min(4, Math.max(0.2, touchStartCameraRef.current.scale * ratio));

            const worldMidX = (touchStartMidRef.current.x - touchStartCameraRef.current.offsetX) / touchStartCameraRef.current.scale;
            const worldMidY = (touchStartMidRef.current.y - touchStartCameraRef.current.offsetY) / touchStartCameraRef.current.scale;

            cameraRef.current = {
                scale: newScale,
                offsetX: midX - worldMidX * newScale,
                offsetY: midY - worldMidY * newScale
            };
            setCamera({ ...cameraRef.current });
            redrawViewCanvas();
            return;
        }

        if (isPanningRef.current && e.touches.length === 1) {
            const dx = e.touches[0].clientX - panStartRef.current.x;
            const dy = e.touches[0].clientY - panStartRef.current.y;
            cameraRef.current.offsetX = panOffsetStartRef.current.x + dx;
            cameraRef.current.offsetY = panOffsetStartRef.current.y + dy;
            setCamera({ ...cameraRef.current });
            redrawViewCanvas();
            return;
        }

        if (!isDrawing) return;

        const pos = getTouchPos(e);
        const worldPos = getWordCoords(pos.x, pos.y);

        lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
        if (activeTool === 'select-rect' || activeTool === 'select-lasso') {
            if (activeTool === 'select-lasso') {
                activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y });
            }
            redrawViewCanvas();
            return;
        }

        if (selectedShape === 'freehand') {
            activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y });
        }
        redrawViewCanvas();
    };

    const stopDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (isPinchingRef.current) {
            if (e.touches.length < 2) {
                isPinchingRef.current = false;
            }
            if (e.touches.length === 0) {
                isPanningRef.current = false;
            }
            return;
        }

        if (isPanningRef.current) {
            if (e.touches.length === 0) {
                isPanningRef.current = false;
            }
            return;
        }

        if (!isDrawing) return;
        setIsDrawing(false);

        const canvas = canvasRef.current;
        const masterCanvas = getMasterCanvas();
        const masterCtx = masterCanvas.getContext('2d');

        if (activeTool === 'select-rect' || activeTool === 'select-lasso') {
            if (canvas) {
                const pos = getTouchPos(e);
                const worldPos = getWordCoords(pos.x, pos.y);

                const x = worldPos.x;
                const y = worldPos.y;
                const sx = startPosRef.current.x;
                const sy = startPosRef.current.y;

                const points = activeTool === 'select-lasso'
                    ? [...activeStrokePointsRef.current]
                    : [
                        { x: sx, y: sy },
                        { x, y: sy },
                        { x, y },
                        { x: sx, y }
                      ];

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                points.forEach(pt => {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                });

                if (points.length > 0 && maxX - minX > 5 && maxY - minY > 5) {
                    onSelectionSolve?.({
                        type: activeTool === 'select-lasso' ? 'lasso' : 'rect',
                        points,
                        bounds: { minX, minY, maxX, maxY }
                    });
                }
            }
            activeStrokePointsRef.current = [];
            redrawViewCanvas();
            return;
        }

        if (canvas && masterCtx) {
            const pos = getTouchPos(e);
            const worldPos = getWordCoords(pos.x, pos.y);

            const x = worldPos.x;
            const y = worldPos.y;
            const sx = startPosRef.current.x;
            const sy = startPosRef.current.y;

            masterCtx.lineCap = 'round';
            masterCtx.strokeStyle = colorRef.current;
            masterCtx.lineWidth = isEraser ? 20 : 3;
            masterCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';

            if (selectedShape === 'freehand') {
                if (activeStrokePointsRef.current.length > 0) {
                    masterCtx.beginPath();
                    masterCtx.moveTo(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
                    if (!isEraser) updateBounds(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
                    for (let i = 1; i < activeStrokePointsRef.current.length; i++) {
                        const pt = activeStrokePointsRef.current[i];
                        masterCtx.lineTo(pt.x, pt.y);
                        if (!isEraser) updateBounds(pt.x, pt.y);
                    }
                    masterCtx.stroke();
                }
            } else {
                masterCtx.beginPath();
                if (selectedShape === 'line') {
                    masterCtx.moveTo(sx, sy);
                    masterCtx.lineTo(x, y);
                    updateBounds(sx, sy);
                    updateBounds(x, y);
                } else if (selectedShape === 'rectangle') {
                    masterCtx.rect(sx, sy, x - sx, y - sy);
                    updateBounds(sx, sy);
                    updateBounds(x, y);
                } else if (selectedShape === 'circle') {
                    const dx = x - sx;
                    const dy = y - sy;
                    const radius = Math.sqrt(dx * dx + dy * dy);
                    masterCtx.arc(sx, sy, radius, 0, 2 * Math.PI);
                    updateBounds(sx - radius, sy - radius);
                    updateBounds(sx + radius, sy + radius);
                } else if (selectedShape === 'triangle') {
                    masterCtx.moveTo(sx, sy);
                    masterCtx.lineTo(sx, y);
                    masterCtx.lineTo(x, y);
                    masterCtx.closePath();
                    updateBounds(sx, sy);
                    updateBounds(x, y);
                }
                masterCtx.stroke();
            }
        }
        activeStrokePointsRef.current = [];
        redrawViewCanvas();
    };

    const drawStrokes = (strokes: { x: number; y: number }[][]) => {
        const masterCanvas = getMasterCanvas();
        const masterCtx = masterCanvas.getContext('2d');

        drawBoundsRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        setIsCanvasEmpty(false);
        undoStackRef.current = [];
        redoStackRef.current = [];
        setCanUndo(false);
        setCanRedo(false);

        // Reset camera view centered on the master canvas
        const targetCamera = getCenteredCamera();
        cameraRef.current = targetCamera;
        setCamera(targetCamera);

        if (masterCtx) {
            masterCtx.clearRect(0, 0, masterCanvas.width, masterCanvas.height);
            masterCtx.globalCompositeOperation = 'source-over';
            masterCtx.strokeStyle = colorRef.current;
            masterCtx.lineWidth = 3;

            // Calculate bounding box of raw input strokes to center them dynamically at (6000, 6000)
            let minStrokeX = Infinity;
            let minStrokeY = Infinity;
            let maxStrokeX = -Infinity;
            let maxStrokeY = -Infinity;

            strokes.forEach(stroke => {
                stroke.forEach(pt => {
                    if (pt.x < minStrokeX) minStrokeX = pt.x;
                    if (pt.x > maxStrokeX) maxStrokeX = pt.x;
                    if (pt.y < minStrokeY) minStrokeY = pt.y;
                    if (pt.y > maxStrokeY) maxStrokeY = pt.y;
                });
            });

            const strokeWidth = maxStrokeX - minStrokeX;
            const strokeHeight = maxStrokeY - minStrokeY;
            const strokeCenterX = minStrokeX + strokeWidth / 2;
            const strokeCenterY = minStrokeY + strokeHeight / 2;

            // Shift offsets to center drawing around (6000, 6000)
            const offsetX = 6000 - strokeCenterX;
            const offsetY = 6000 - strokeCenterY;

            strokes.forEach(stroke => {
                if (stroke.length === 0) return;
                masterCtx.beginPath();
                const startX = stroke[0].x + offsetX;
                const startY = stroke[0].y + offsetY;
                masterCtx.moveTo(startX, startY);
                updateBounds(startX, startY);

                for (let i = 1; i < stroke.length; i++) {
                    const nextX = stroke[i].x + offsetX;
                    const nextY = stroke[i].y + offsetY;
                    masterCtx.lineTo(nextX, nextY);
                    updateBounds(nextX, nextY);
                }
                masterCtx.stroke();
            });
        }

        redrawViewCanvas();
    };

    const resetView = useCallback(() => {
        const start = performance.now();
        const startOffsetX = cameraRef.current.offsetX;
        const startOffsetY = cameraRef.current.offsetY;
        const startScale = cameraRef.current.scale;

        const target = getCenteredCamera();

        const animate = (time: number) => {
            const elapsed = time - start;
            const progress = Math.min(elapsed / 200, 1);
            const ease = 1 - Math.pow(1 - progress, 3);

            cameraRef.current.offsetX = startOffsetX + (target.offsetX - startOffsetX) * ease;
            cameraRef.current.offsetY = startOffsetY + (target.offsetY - startOffsetY) * ease;
            cameraRef.current.scale = startScale + (target.scale - startScale) * ease;

            setCamera({ ...cameraRef.current });
            redrawViewCanvas();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [redrawViewCanvas, getCenteredCamera]);

    // Handle Ctrl+0/Cmd+0 keyboard shortcut for reset view
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
            if (cmdOrCtrl && e.key === '0') {
                e.preventDefault();
                resetView();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [resetView]);

    return {
        canvasRef,
        masterCanvasRef,
        drawBoundsRef,
        isDrawing,
        isEraser,
        setIsEraser: setIsEraserWrapped,
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
        camera,
        resetView,
        redrawViewCanvas,
        undo: () => {
            const masterCanvas = getMasterCanvas();
            const masterCtx = masterCanvas.getContext('2d');
            if (!masterCtx) return;

            if (undoStackRef.current.length === 0) return;

            const currentState: HistoryState = {
                imageData: masterCtx.getImageData(0, 0, masterCanvas.width, masterCanvas.height),
                bounds: { ...drawBoundsRef.current }
            };
            redoStackRef.current.push(currentState);
            setCanRedo(true);

            const prevState = undoStackRef.current.pop()!;
            masterCtx.putImageData(prevState.imageData, 0, 0);
            drawBoundsRef.current = { ...prevState.bounds };
            setIsCanvasEmpty(prevState.bounds.minX === Infinity);
            setCanUndo(undoStackRef.current.length > 0);
            redrawViewCanvas();
        },
        redo: () => {
            const masterCanvas = getMasterCanvas();
            const masterCtx = masterCanvas.getContext('2d');
            if (!masterCtx) return;

            if (redoStackRef.current.length === 0) return;

            const currentState: HistoryState = {
                imageData: masterCtx.getImageData(0, 0, masterCanvas.width, masterCanvas.height),
                bounds: { ...drawBoundsRef.current }
            };
            undoStackRef.current.push(currentState);
            setCanUndo(true);

            const nextState = redoStackRef.current.pop()!;
            masterCtx.putImageData(nextState.imageData, 0, 0);
            drawBoundsRef.current = { ...nextState.bounds };
            setIsCanvasEmpty(nextState.bounds.minX === Infinity);
            setCanRedo(redoStackRef.current.length > 0);
            redrawViewCanvas();
        },
    };
};
