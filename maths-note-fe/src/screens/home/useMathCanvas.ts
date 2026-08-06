import { useEffect, useRef, useState, useCallback } from 'react';
import type { Stroke } from '@/types';
import { getStrokeBounds, drawStroke } from './canvasUtils';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
};

const distSq = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
};

const distToSegmentSq = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const l2 = distSq(x1, y1, x2, y2);
    if (l2 === 0) return distSq(px, py, x1, y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return distSq(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
};

const hitTestStroke = (ex: number, ey: number, stroke: Stroke, radius: number) => {
    const bounds = getStrokeBounds(stroke);
    if (ex < bounds.minX - radius || ex > bounds.maxX + radius || ey < bounds.minY - radius || ey > bounds.maxY + radius) {
        return false;
    }

    const threshold = radius + stroke.width / 2;
    const thresholdSq = threshold * threshold;
    const pts = stroke.points;
    if (pts.length === 0) return false;

    if (stroke.tool === 'pen') {
        for (let i = 0; i < pts.length - 1; i++) {
            if (distToSegmentSq(ex, ey, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= thresholdSq) {
                return true;
            }
        }
        if (pts.length === 1) {
            if (distSq(ex, ey, pts[0].x, pts[0].y) <= thresholdSq) return true;
        }
    } else if (stroke.tool === 'line') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            return distToSegmentSq(ex, ey, p1.x, p1.y, p2.x, p2.y) <= thresholdSq;
        }
    } else if (stroke.tool === 'rect') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            const top = distToSegmentSq(ex, ey, p1.x, p1.y, p2.x, p1.y);
            const right = distToSegmentSq(ex, ey, p2.x, p1.y, p2.x, p2.y);
            const bottom = distToSegmentSq(ex, ey, p2.x, p2.y, p1.x, p2.y);
            const left = distToSegmentSq(ex, ey, p1.x, p2.y, p1.x, p1.y);
            return Math.min(top, right, bottom, left) <= thresholdSq;
        }
    } else if (stroke.tool === 'circle') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const radiusCircle = Math.sqrt(dx * dx + dy * dy);
            const d = Math.sqrt(distSq(ex, ey, p1.x, p1.y));
            return Math.abs(d - radiusCircle) <= threshold;
        }
    } else if (stroke.tool === 'triangle') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            const s1 = distToSegmentSq(ex, ey, p1.x, p1.y, p1.x, p2.y);
            const s2 = distToSegmentSq(ex, ey, p1.x, p2.y, p2.x, p2.y);
            const s3 = distToSegmentSq(ex, ey, p2.x, p2.y, p1.x, p1.y);
            return Math.min(s1, s2, s3) <= thresholdSq;
        }
    }
    return false;
};

export const useMathCanvas = (onSelectionSolve?: (selection: { type: 'rect' | 'lasso'; points: { x: number; y: number }[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }) => void) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const masterCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);
    const [activeTool, setActiveTool] = useState<'pen' | 'eraser' | 'select-rect' | 'select-lasso'>('pen');
    const [color, setColor] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('solvelq_color') || 'rgb(255, 255, 255)';
        }
        return 'rgb(255, 255, 255)';
    });
    const [strokeWidth, setStrokeWidth] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('solvelq_stroke_width');
            if (saved) return parseInt(saved, 10);
        }
        return 3;
    });
    const [eraserWidth, setEraserWidth] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('solvelq_eraser_width');
            if (saved) return parseInt(saved, 10);
        }
        return 30;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('solvelq_color', color);
        }
    }, [color]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('solvelq_stroke_width', String(strokeWidth));
        }
    }, [strokeWidth]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('solvelq_eraser_width', String(eraserWidth));
        }
    }, [eraserWidth]);

    const [selectedShape, setSelectedShape] = useState<'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle'>('freehand');
    const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
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

    // Vector state database
    const strokesRef = useRef<Stroke[]>([]);

    interface HistoryState {
        strokes: Stroke[];
        bounds: { minX: number; minY: number; maxX: number; maxY: number };
    }

    const undoStackRef = useRef<HistoryState[]>([]);
    const redoStackRef = useRef<HistoryState[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    // Centered camera target centering logic
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

    const strokeWidthRef = useRef(strokeWidth);
    useEffect(() => {
        strokeWidthRef.current = strokeWidth;
    }, [strokeWidth]);

    const eraserWidthRef = useRef(eraserWidth);
    useEffect(() => {
        eraserWidthRef.current = eraserWidth;
    }, [eraserWidth]);

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
        if (!viewCanvas) return;
        const viewCtx = viewCanvas.getContext('2d');
        if (!viewCtx) return;

        const { offsetX, offsetY, scale } = cameraRef.current;

        // Reset transform to identity
        viewCtx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Fill view canvas with black background
        viewCtx.fillStyle = 'black';
        viewCtx.fillRect(0, 0, viewCanvas.width, viewCanvas.height);
        
        // Calculate visible region in world space
        const visibleMinX = -offsetX / scale;
        const visibleMinY = -offsetY / scale;
        const visibleMaxX = (viewCanvas.width - offsetX) / scale;
        const visibleMaxY = (viewCanvas.height - offsetY) / scale;

        // Apply camera transform
        viewCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

        // Render culled vector strokes
        for (const stroke of strokesRef.current) {
            const bounds = getStrokeBounds(stroke);
            const isVisible = !(
                bounds.maxX < visibleMinX ||
                bounds.minX > visibleMaxX ||
                bounds.maxY < visibleMinY ||
                bounds.minY > visibleMaxY
            );
            if (isVisible) {
                drawStroke(viewCtx, stroke);
            }
        }

        // Draw legacy masterCanvas background if canvas is not empty but we have no vector strokes (loaded legacy history entry)
        if (!isCanvasEmpty && strokesRef.current.length === 0 && masterCanvasRef.current) {
            const masterCanvas = masterCanvasRef.current;
            const srcX = Math.max(0, -offsetX / scale);
            const srcY = Math.max(0, -offsetY / scale);
            const srcWidth = Math.min(masterCanvas.width - srcX, viewCanvas.width / scale);
            const srcHeight = Math.min(masterCanvas.height - srcY, viewCanvas.height / scale);
            const destX = srcX * scale + offsetX;
            const destY = srcY * scale + offsetY;
            const destWidth = srcWidth * scale;
            const destHeight = srcHeight * scale;
            if (srcWidth > 0 && srcHeight > 0) {
                viewCtx.drawImage(
                    masterCanvas,
                    srcX, srcY, srcWidth, srcHeight,
                    destX, destY, destWidth, destHeight
                );
            }
        }

        // Draw active freehand stroke preview if drawing in pen mode
        if (isDrawing && activeStrokePointsRef.current.length > 1 && selectedShape === 'freehand' && activeTool === 'pen') {
            viewCtx.beginPath();
            viewCtx.moveTo(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
            for (let i = 1; i < activeStrokePointsRef.current.length; i++) {
                viewCtx.lineTo(activeStrokePointsRef.current[i].x, activeStrokePointsRef.current[i].y);
            }
            viewCtx.lineCap = 'round';
            viewCtx.lineJoin = 'round';
            viewCtx.lineWidth = strokeWidthRef.current;
            viewCtx.strokeStyle = colorRef.current;
            viewCtx.globalCompositeOperation = 'source-over';
            viewCtx.stroke();
        }

        // Draw shape preview on screen if drawing shapes in pen mode
        if (isDrawing && activeStrokePointsRef.current.length > 0 && selectedShape !== 'freehand' && activeTool === 'pen') {
            viewCtx.beginPath();
            viewCtx.lineCap = 'round';
            viewCtx.lineJoin = 'round';
            viewCtx.lineWidth = strokeWidthRef.current;
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
        }

        // Draw eraser cursor circle outline
        if (activeTool === 'eraser' && lastActivePosRef.current) {
            viewCtx.beginPath();
            viewCtx.arc(lastActivePosRef.current.x, lastActivePosRef.current.y, eraserWidthRef.current / 2, 0, 2 * Math.PI);
            viewCtx.lineWidth = 1.5 / scale;
            viewCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            viewCtx.setLineDash([4 / scale, 4 / scale]);
            viewCtx.globalCompositeOperation = 'source-over';
            viewCtx.stroke();
            viewCtx.setLineDash([]);
        }

        // Draw selection outline preview if drawing selection
        if (isDrawing && (activeTool === 'select-rect' || activeTool === 'select-lasso')) {
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
            viewCtx.setLineDash([]);
        }

        // Reset transform back to identity
        viewCtx.setTransform(1, 0, 0, 1, 0, 0);
    }, [isDrawing, selectedShape, activeTool]);

    const getWordCoords = (screenX: number, screenY: number) => {
        const { offsetX, offsetY, scale } = cameraRef.current;
        return {
            x: (screenX - offsetX) / scale,
            y: (screenY - offsetY) / scale
        };
    };

    const saveState = () => {
        const state: HistoryState = {
            strokes: strokesRef.current.map(s => ({
                ...s,
                points: s.points.map(pt => ({ ...pt }))
            })),
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
        strokesRef.current = [];
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

        if (!isDrawing && activeTool !== 'eraser') return;

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = getWordCoords(screenX, screenY);

        lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };

        if (activeTool === 'eraser') {
            if (e.buttons === 1) { // Left button pressed
                const eraserRadius = eraserWidthRef.current / 2;
                const originalLength = strokesRef.current.length;
                strokesRef.current = strokesRef.current.filter(stroke => !hitTestStroke(worldPos.x, worldPos.y, stroke, eraserRadius));
                if (strokesRef.current.length !== originalLength) {
                    setIsCanvasEmpty(strokesRef.current.length === 0);
                    redrawViewCanvas();
                }
            } else {
                redrawViewCanvas(); // Render eraser cursor preview
            }
            return;
        }

        if (!isDrawing) return;

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

        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldPos = getWordCoords(screenX, screenY);

            const x = worldPos.x;
            const y = worldPos.y;
            const sx = startPosRef.current.x;
            const sy = startPosRef.current.y;

            let newPoints: { x: number; y: number }[] = [];
            if (selectedShape === 'freehand') {
                newPoints = [...activeStrokePointsRef.current];
            } else {
                newPoints = [{ x: sx, y: sy }, { x, y }];
            }

            if (newPoints.length > 0) {
                const newStroke: Stroke = {
                    id: generateUUID(),
                    tool: selectedShape === 'freehand' ? 'pen' : (selectedShape as any),
                    color: colorRef.current,
                    width: strokeWidthRef.current,
                    points: newPoints
                };

                strokesRef.current.push(newStroke);
                newPoints.forEach(pt => updateBounds(pt.x, pt.y));
                setIsCanvasEmpty(false);
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

        if (!isDrawing && activeTool !== 'eraser') return;

        const pos = getTouchPos(e);
        const worldPos = getWordCoords(pos.x, pos.y);

        lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };

        if (activeTool === 'eraser') {
            const eraserRadius = eraserWidthRef.current / 2;
            const originalLength = strokesRef.current.length;
            strokesRef.current = strokesRef.current.filter(stroke => !hitTestStroke(worldPos.x, worldPos.y, stroke, eraserRadius));
            if (strokesRef.current.length !== originalLength) {
                setIsCanvasEmpty(strokesRef.current.length === 0);
                redrawViewCanvas();
            }
            return;
        }

        if (!isDrawing) return;

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

        if (canvas) {
            const pos = getTouchPos(e);
            const worldPos = getWordCoords(pos.x, pos.y);

            const x = worldPos.x;
            const y = worldPos.y;
            const sx = startPosRef.current.x;
            const sy = startPosRef.current.y;

            let newPoints: { x: number; y: number }[] = [];
            if (selectedShape === 'freehand') {
                newPoints = [...activeStrokePointsRef.current];
            } else {
                newPoints = [{ x: sx, y: sy }, { x, y }];
            }

            if (newPoints.length > 0) {
                const newStroke: Stroke = {
                    id: generateUUID(),
                    tool: selectedShape === 'freehand' ? 'pen' : (selectedShape as any),
                    color: colorRef.current,
                    width: strokeWidthRef.current,
                    points: newPoints
                };

                strokesRef.current.push(newStroke);
                newPoints.forEach(pt => updateBounds(pt.x, pt.y));
                setIsCanvasEmpty(false);
            }
        }
        activeStrokePointsRef.current = [];
        redrawViewCanvas();
    };

    const drawStrokes = (rawStrokes: { x: number; y: number }[][]) => {
        strokesRef.current = [];
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

        // Calculate bounding box of raw input strokes to center them dynamically at (6000, 6000)
        let minStrokeX = Infinity;
        let minStrokeY = Infinity;
        let maxStrokeX = -Infinity;
        let maxStrokeY = -Infinity;

        rawStrokes.forEach(stroke => {
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

        rawStrokes.forEach(stroke => {
            if (stroke.length === 0) return;
            const newPoints = stroke.map(pt => ({
                x: pt.x + offsetX,
                y: pt.y + offsetY
            }));
            
            const newStroke: Stroke = {
                id: generateUUID(),
                tool: 'pen',
                color: colorRef.current,
                width: 3,
                points: newPoints
            };
            strokesRef.current.push(newStroke);
            newPoints.forEach(pt => updateBounds(pt.x, pt.y));
        });

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
        camera,
        resetView,
        redrawViewCanvas,
        strokesRef,
        undo: () => {
            if (undoStackRef.current.length === 0) return;

            const currentState: HistoryState = {
                strokes: strokesRef.current.map(s => ({
                    ...s,
                    points: s.points.map(pt => ({ ...pt }))
                })),
                bounds: { ...drawBoundsRef.current }
            };
            redoStackRef.current.push(currentState);
            setCanRedo(true);

            const prevState = undoStackRef.current.pop()!;
            strokesRef.current = prevState.strokes.map(s => ({
                ...s,
                points: s.points.map(pt => ({ ...pt }))
            }));
            drawBoundsRef.current = { ...prevState.bounds };
            setIsCanvasEmpty(strokesRef.current.length === 0);
            setCanUndo(undoStackRef.current.length > 0);
            
            redrawViewCanvas();
        },
        redo: () => {
            if (redoStackRef.current.length === 0) return;

            const currentState: HistoryState = {
                strokes: strokesRef.current.map(s => ({
                    ...s,
                    points: s.points.map(pt => ({ ...pt }))
                })),
                bounds: { ...drawBoundsRef.current }
            };
            undoStackRef.current.push(currentState);
            setCanUndo(true);

            const nextState = redoStackRef.current.pop()!;
            strokesRef.current = nextState.strokes.map(s => ({
                ...s,
                points: s.points.map(pt => ({ ...pt }))
            }));
            drawBoundsRef.current = { ...nextState.bounds };
            setIsCanvasEmpty(strokesRef.current.length === 0);
            setCanRedo(redoStackRef.current.length > 0);
            
            redrawViewCanvas();
        },
    };
};
