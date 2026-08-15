import { useEffect, useRef, useState, useCallback } from 'react';
import type { Stroke, CanvasElement, ImageElement } from '@/types';
import { getStrokeOutline, getElementBounds, getElementCenter, drawElement, getStrokeBounds } from './canvasUtils';

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

    const isFreehand = ['pen', 'fountain', 'marker', 'highlighter'].includes(stroke.tool);
    if (isFreehand) {
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

const cloneCanvasElement = (el: CanvasElement): CanvasElement => {
    if (el.kind === 'text') {
        return { ...el };
    } else if (el.kind === 'image') {
        return { ...el };
    } else {
        return {
            ...el,
            points: el.points.map(pt => ({ ...pt })),
            bounds: el.bounds ? { ...el.bounds } : undefined
        };
    }
};

const isPointInPolygon = (px: number, py: number, polygon: { x: number; y: number }[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > py) !== (yj > py))
            && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const hitTestElement = (ex: number, ey: number, element: CanvasElement, threshold: number = 8) => {
    if (element.kind === 'text' || element.kind === 'image') {
        const bounds = getElementBounds(element);
        return (
            ex >= bounds.minX - threshold &&
            ex <= bounds.maxX + threshold &&
            ey >= bounds.minY - threshold &&
            ey <= bounds.maxY + threshold
        );
    } else {
        return hitTestStroke(ex, ey, element, threshold);
    }
};

const getElementAtPosition = (ex: number, ey: number, elements: CanvasElement[]): CanvasElement | null => {
    for (let i = elements.length - 1; i >= 0; i--) {
        if (hitTestElement(ex, ey, elements[i])) {
            return elements[i];
        }
    }
    return null;
};

const getElementsInSelection = (
    elements: CanvasElement[],
    boundary: any,
    shape: 'rectangle' | 'lasso'
): string[] => {
    const selectedIds: string[] = [];

    for (const el of elements) {
        if (shape === 'rectangle') {
            if (el.kind === 'text' || el.kind === 'image') {
                const center = getElementCenter(el);
                if (
                    center.x >= boundary.minX &&
                    center.x <= boundary.maxX &&
                    center.y >= boundary.minY &&
                    center.y <= boundary.maxY
                ) {
                    selectedIds.push(el.id);
                }
            } else {
                const hasPointInside = el.points.some(pt =>
                    pt.x >= boundary.minX && pt.x <= boundary.maxX &&
                    pt.y >= boundary.minY && pt.y <= boundary.maxY
                );
                if (hasPointInside) {
                    selectedIds.push(el.id);
                }
            }
        } else if (shape === 'lasso') {
            const polygon = boundary as { x: number; y: number }[];
            if (polygon.length < 3) continue;

            if (el.kind === 'text' || el.kind === 'image') {
                const center = getElementCenter(el);
                if (isPointInPolygon(center.x, center.y, polygon)) {
                    selectedIds.push(el.id);
                }
            } else {
                const hasPointInside = el.points.some(pt =>
                    isPointInPolygon(pt.x, pt.y, polygon)
                );
                if (hasPointInside) {
                    selectedIds.push(el.id);
                }
            }
        }
    }

    return selectedIds;
};

export const useMathCanvas = (
    onSelectionSolve?: (selection: { type: 'rect' | 'lasso'; points: { x: number; y: number }[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }) => void
) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const masterCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);
    const [activeTool, setActiveTool] = useState<'pen' | 'fountain' | 'marker' | 'highlighter' | 'eraser' | 'hand' | 'select' | 'text' | 'solve'>('pen');
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
    const [strokeOpacity, setStrokeOpacity] = useState(1.0);
    const [showGrid, setShowGrid] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('solvelq_show_grid') === 'true';
        }
        return false;
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
    const [isPanning, setIsPanning] = useState(false);
    const isPinchingRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const panOffsetStartRef = useRef({ x: 0, y: 0 });

    const touchStartDistRef = useRef(0);
    const touchStartMidRef = useRef({ x: 0, y: 0 });
    const touchStartCameraRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });

    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [canvasCursor, setCanvasCursor] = useState<string>('default');

    useEffect(() => {
        if (isSpacePressed || activeTool === 'hand') {
            setCanvasCursor(isPanningRef.current ? 'grabbing' : 'grab');
        } else {
            setCanvasCursor('default');
        }
    }, [isSpacePressed, activeTool]);

    const startPosRef = useRef({ x: 0, y: 0 });
    const lastActivePosRef = useRef({ x: 0, y: 0 });
    const activeStrokePointsRef = useRef<{ x: number; y: number; timestamp: number }[]>([]);
    
    // Bounds tracking for canvas crop optimization (stores world coordinates on master canvas)
    const drawBoundsRef = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    // Vector state database
    const elementsRef = useRef<CanvasElement[]>([]);

    // Selected elements for the select tool
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    const [selectedSelectionShape, setSelectedSelectionShape] = useState<'rectangle' | 'lasso'>('rectangle');

    const [activeTextEdit, setActiveTextEdit] = useState<{
        id: string;
        x: number;
        y: number;
        text: string;
        fontSize: number;
        color: string;
        isNew: boolean;
    } | null>(null);

    // Selection tool refs
    const isDraggingSelectionRef = useRef(false);
    const dragStartPositionsRef = useRef<Map<string, CanvasElement>>(new Map());
    const isMarqueeSelectingRef = useRef(false);
    const hasDraggedRef = useRef(false);

    // Resizing refs for image elements
    const isResizingRef = useRef(false);
    const activeResizeHandleRef = useRef<'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | null>(null);
    const resizeStartPosRef = useRef({ x: 0, y: 0 });
    const resizeInitialElementRef = useRef<ImageElement | null>(null);
    const resizeAnchorRef = useRef({ x: 0, y: 0 });

    interface HistoryState {
        elements: CanvasElement[];
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

    const strokeOpacityRef = useRef(strokeOpacity);
    useEffect(() => {
        strokeOpacityRef.current = strokeOpacity;
    }, [strokeOpacity]);

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

        const isInverted = viewCanvas.classList.contains('invert-[0.93]');
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

        // Draw dot grid if enabled
        if (showGrid) {
            const gridSpacing = 40;
            const startX = Math.floor(visibleMinX / gridSpacing) * gridSpacing;
            const endX = Math.ceil(visibleMaxX / gridSpacing) * gridSpacing;
            const startY = Math.floor(visibleMinY / gridSpacing) * gridSpacing;
            const endY = Math.ceil(visibleMaxY / gridSpacing) * gridSpacing;

            viewCtx.save();
            viewCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            for (let x = startX; x <= endX; x += gridSpacing) {
                for (let y = startY; y <= endY; y += gridSpacing) {
                    viewCtx.beginPath();
                    viewCtx.arc(x, y, 1.2, 0, 2 * Math.PI);
                    viewCtx.fill();
                }
            }
            viewCtx.restore();
        }

        // 1. Render static highlighter strokes
        for (const el of elementsRef.current) {
            if (el.kind !== 'text' && el.kind !== 'image' && el.tool === 'highlighter') {
                const bounds = getElementBounds(el);
                const isVisible = !(
                    bounds.maxX < visibleMinX ||
                    bounds.minX > visibleMaxX ||
                    bounds.maxY < visibleMinY ||
                    bounds.minY > visibleMaxY
                );
                if (isVisible) {
                    drawElement(viewCtx, el, isInverted);
                }
            }
        }

        const isPenTool = ['pen', 'fountain', 'marker', 'highlighter'].includes(activeTool);

        // 2. Draw active freehand highlighter preview (if drawing highlighter)
        if (isDrawing && activeStrokePointsRef.current.length > 1 && selectedShape === 'freehand' && activeTool === 'highlighter') {
            if (viewCtx.save) viewCtx.save();
            viewCtx.beginPath();
            viewCtx.moveTo(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
            for (let i = 1; i < activeStrokePointsRef.current.length; i++) {
                viewCtx.lineTo(activeStrokePointsRef.current[i].x, activeStrokePointsRef.current[i].y);
            }
            viewCtx.strokeStyle = colorRef.current;
            viewCtx.lineWidth = strokeWidthRef.current;
            viewCtx.lineCap = 'round';
            viewCtx.lineJoin = 'round';
            viewCtx.globalCompositeOperation = 'screen';
            viewCtx.globalAlpha = strokeOpacityRef.current;
            viewCtx.stroke();
            if (viewCtx.restore) viewCtx.restore();
        }

        // 3. Draw legacy masterCanvas background if canvas is not empty but we have no vector strokes (loaded legacy history entry)
        if (!isCanvasEmpty && elementsRef.current.length === 0 && masterCanvasRef.current) {
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

        // 4. Render static non-highlighter strokes/elements
        for (const el of elementsRef.current) {
            if (activeTextEdit && el.id === activeTextEdit.id) continue;
            if (el.kind === 'text' || el.kind === 'image' || el.tool !== 'highlighter') {
                const bounds = getElementBounds(el);
                const isVisible = !(
                    bounds.maxX < visibleMinX ||
                    bounds.minX > visibleMaxX ||
                    bounds.maxY < visibleMinY ||
                    bounds.minY > visibleMaxY
                );
                if (isVisible) {
                    drawElement(viewCtx, el, isInverted);
                }
            }
        }

        // 5. Draw active freehand non-highlighter preview (if drawing non-highlighter)
        if (isDrawing && activeStrokePointsRef.current.length > 1 && selectedShape === 'freehand' && isPenTool && activeTool !== 'highlighter') {
            if (viewCtx.save) viewCtx.save();
            viewCtx.strokeStyle = colorRef.current;
            viewCtx.lineWidth = strokeWidthRef.current;
            viewCtx.globalCompositeOperation = 'source-over';
            viewCtx.globalAlpha = strokeOpacityRef.current;

            if (activeTool === 'fountain') {
                const tempStroke: Stroke = {
                    id: 'temp',
                    tool: 'fountain',
                    color: colorRef.current,
                    width: strokeWidthRef.current,
                    points: activeStrokePointsRef.current
                };
                const outline = getStrokeOutline(tempStroke);
                if (outline.length > 0) {
                    viewCtx.beginPath();
                    viewCtx.moveTo(outline[0][0], outline[0][1]);
                    for (let i = 1; i < outline.length; i++) {
                        viewCtx.lineTo(outline[i][0], outline[i][1]);
                    }
                    viewCtx.closePath();
                    viewCtx.fillStyle = colorRef.current;
                    viewCtx.fill();
                }
            } else {
                viewCtx.beginPath();
                viewCtx.moveTo(activeStrokePointsRef.current[0].x, activeStrokePointsRef.current[0].y);
                for (let i = 1; i < activeStrokePointsRef.current.length; i++) {
                    viewCtx.lineTo(activeStrokePointsRef.current[i].x, activeStrokePointsRef.current[i].y);
                }
                if (activeTool === 'marker') {
                    viewCtx.lineCap = 'square';
                    viewCtx.lineJoin = 'round';
                } else {
                    viewCtx.lineCap = 'round';
                    viewCtx.lineJoin = 'round';
                }
                viewCtx.stroke();
            }
            if (viewCtx.restore) viewCtx.restore();
        }

        // 6. Draw shape preview on screen if drawing shapes in pen mode
        if (isDrawing && selectedShape !== 'freehand' && isPenTool) {
            if (viewCtx.save) viewCtx.save();
            viewCtx.beginPath();
            viewCtx.lineCap = 'round';
            viewCtx.lineJoin = 'round';
            viewCtx.lineWidth = strokeWidthRef.current;
            viewCtx.strokeStyle = colorRef.current;
            viewCtx.globalCompositeOperation = 'source-over';
            viewCtx.globalAlpha = strokeOpacityRef.current;

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
            if (viewCtx.restore) viewCtx.restore();
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

        // Draw selected elements outline/bounding box
        if (selectedElementIds.length > 0) {
            viewCtx.save();
            viewCtx.strokeStyle = '#3b82f6';
            viewCtx.lineWidth = 1.5 / scale;
            viewCtx.setLineDash([4 / scale, 4 / scale]);
            
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let foundAny = false;
            for (const id of selectedElementIds) {
                const el = elementsRef.current.find(e => e.id === id);
                if (el) {
                    const bounds = getElementBounds(el);
                    if (bounds.minX < minX) minX = bounds.minX;
                    if (bounds.minY < minY) minY = bounds.minY;
                    if (bounds.maxX > maxX) maxX = bounds.maxX;
                    if (bounds.maxY > maxY) maxY = bounds.maxY;
                    foundAny = true;
                }
            }

            if (foundAny) {
                const pad = 6 / scale;
                const rectX = minX - pad;
                const rectY = minY - pad;
                const rectW = (maxX - minX) + 2 * pad;
                const rectH = (maxY - minY) + 2 * pad;

                viewCtx.beginPath();
                viewCtx.rect(rectX, rectY, rectW, rectH);
                viewCtx.stroke();

                // Draw resize handles specifically if it's a single image element
                if (selectedElementIds.length === 1) {
                    const singleEl = elementsRef.current.find(e => e.id === selectedElementIds[0]);
                    if (singleEl && singleEl.kind === 'image') {
                        viewCtx.restore(); // Restore dash style to solid for handles
                        viewCtx.save();
                        viewCtx.fillStyle = '#ffffff';
                        viewCtx.strokeStyle = '#3b82f6';
                        viewCtx.lineWidth = 1.5 / scale;

                        const handleSize = 8 / scale;
                        const halfSize = handleSize / 2;

                        const corners = [
                            { x: rectX, y: rectY }, // Top-Left
                            { x: rectX + rectW, y: rectY }, // Top-Right
                            { x: rectX, y: rectY + rectH }, // Bottom-Left
                            { x: rectX + rectW, y: rectY + rectH } // Bottom-Right
                        ];

                        corners.forEach(c => {
                            viewCtx.beginPath();
                            viewCtx.rect(c.x - halfSize, c.y - halfSize, handleSize, handleSize);
                            viewCtx.fill();
                            viewCtx.stroke();
                        });
                    }
                }
            }
            viewCtx.restore();
        }

        // Draw selection outline preview if drawing selection
        if (isDrawing && (
            activeTool === 'solve' || 
            (activeTool === 'select' && isMarqueeSelectingRef.current)
        )) {
            viewCtx.beginPath();
            viewCtx.lineWidth = 1.5 / scale;
            viewCtx.strokeStyle = '#3b82f6';
            viewCtx.setLineDash([5 / scale, 5 / scale]);
            viewCtx.globalCompositeOperation = 'source-over';

            const currentShape = activeTool === 'select' ? selectedSelectionShape : 'lasso';

            if (currentShape === 'rectangle') {
                const sx = startPosRef.current.x;
                const sy = startPosRef.current.y;
                const x = lastActivePosRef.current.x;
                const y = lastActivePosRef.current.y;
                viewCtx.rect(sx, sy, x - sx, y - sy);
                viewCtx.stroke();
            } else if (currentShape === 'lasso' && activeStrokePointsRef.current.length > 1) {
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
    }, [isDrawing, selectedShape, activeTool, showGrid, selectedElementIds, selectedSelectionShape]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('solvelq_show_grid', String(showGrid));
        }
        redrawViewCanvas();
    }, [showGrid, redrawViewCanvas]);

    const getWordCoords = useCallback((screenX: number, screenY: number) => {
        const { offsetX, offsetY, scale } = cameraRef.current;
        return {
            x: (screenX - offsetX) / scale,
            y: (screenY - offsetY) / scale
        };
    }, []);

    const saveState = useCallback(() => {
        const state: HistoryState = {
            elements: elementsRef.current.map(cloneCanvasElement),
            bounds: { ...drawBoundsRef.current }
        };

        undoStackRef.current.push(state);
        if (undoStackRef.current.length > 50) {
            undoStackRef.current.shift();
        }
        
        redoStackRef.current = [];
        setCanUndo(true);
        setCanRedo(false);
    }, []);

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

            if (e.ctrlKey) {
                // Zoom logic (Mac pinch-to-zoom / Ctrl+scroll)
                const rect = canvas.getBoundingClientRect();
                const cursorX = e.clientX - rect.left;
                const cursorY = e.clientY - rect.top;

                const { offsetX, offsetY, scale } = cameraRef.current;

                const worldCursorX = (cursorX - offsetX) / scale;
                const worldCursorY = (cursorY - offsetY) / scale;

                const delta = -e.deltaY;
                // Much higher zoom sensitivity (0.007) for extremely fast trackpad pinch zoom response
                const zoomSensitivity = 0.007;
                const factor = Math.exp(delta * zoomSensitivity);
                const newScale = Math.min(4, Math.max(0.2, scale * factor));

                const newOffsetX = cursorX - worldCursorX * newScale;
                const newOffsetY = cursorY - worldCursorY * newScale;

                cameraRef.current = {
                    offsetX: newOffsetX,
                    offsetY: newOffsetY,
                    scale: newScale
                };
            } else {
                // Pan logic (Mac two-finger scroll) - use 1.5x multiplier for responsive trackpad scroll
                const panMultiplier = 1.5;
                cameraRef.current = {
                    ...cameraRef.current,
                    offsetX: cameraRef.current.offsetX - e.deltaX * panMultiplier,
                    offsetY: cameraRef.current.offsetY - e.deltaY * panMultiplier
                };
            }
            setCamera({ ...cameraRef.current });
            redrawViewCanvas();
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', handleWheel);
        };
    }, [redrawViewCanvas]);

    const resetCanvas = () => {
        elementsRef.current = [];
        setSelectedElementIds([]);
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

    const getActiveResizeHandle = (worldX: number, worldY: number, scale: number) => {
        if (selectedElementIds.length !== 1) return null;
        const el = elementsRef.current.find(e => e.id === selectedElementIds[0]);
        if (!el || el.kind !== 'image') return null;

        const pad = 6 / scale;
        const x = el.x - pad;
        const y = el.y - pad;
        const w = el.width + 2 * pad;
        const h = el.height + 2 * pad;

        const corners = {
            topLeft: { x: x, y: y },
            topRight: { x: x + w, y: y },
            bottomLeft: { x: x, y: y + h },
            bottomRight: { x: x + w, y: y + h }
        };

        const threshold = 12 / scale; // 24px hit area
        for (const [name, pt] of Object.entries(corners)) {
            if (Math.abs(worldX - pt.x) <= threshold && Math.abs(worldY - pt.y) <= threshold) {
                return name as 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
            }
        }
        return null;
    };

    const performResize = (worldX: number, worldY: number, shiftKey: boolean) => {
        if (!isResizingRef.current || !resizeInitialElementRef.current || !activeResizeHandleRef.current) return;
        const el = resizeInitialElementRef.current;
        const handle = activeResizeHandleRef.current;
        const anchor = resizeAnchorRef.current;

        // Opposite corner vector
        let cx0 = el.x;
        let cy0 = el.y;
        if (handle === 'topLeft') {
            cx0 = el.x;
            cy0 = el.y;
        } else if (handle === 'topRight') {
            cx0 = el.x + el.width;
            cy0 = el.y;
        } else if (handle === 'bottomLeft') {
            cx0 = el.x;
            cy0 = el.y + el.height;
        } else if (handle === 'bottomRight') {
            cx0 = el.x + el.width;
            cy0 = el.y + el.height;
        }

        const D = { x: cx0 - anchor.x, y: cy0 - anchor.y };
        const lenSq = D.x * D.x + D.y * D.y;

        let w = el.width;
        let h = el.height;
        let newX = el.x;
        let newY = el.y;

        const minDim = 20;

        if (lenSq > 0) {
            if (shiftKey) {
                // Free distortion
                if (handle === 'bottomRight') {
                    w = Math.max(minDim, worldX - anchor.x);
                    h = Math.max(minDim, worldY - anchor.y);
                    newX = anchor.x;
                    newY = anchor.y;
                } else if (handle === 'bottomLeft') {
                    w = Math.max(minDim, anchor.x - worldX);
                    h = Math.max(minDim, worldY - anchor.y);
                    newX = anchor.x - w;
                    newY = anchor.y;
                } else if (handle === 'topRight') {
                    w = Math.max(minDim, worldX - anchor.x);
                    h = Math.max(minDim, anchor.y - worldY);
                    newX = anchor.x;
                    newY = anchor.y - h;
                } else if (handle === 'topLeft') {
                    w = Math.max(minDim, anchor.x - worldX);
                    h = Math.max(minDim, anchor.y - worldY);
                    newX = anchor.x - w;
                    newY = anchor.y - h;
                }
            } else {
                // Lock aspect ratio
                const V = { x: worldX - anchor.x, y: worldY - anchor.y };
                const scaleFactor = (V.x * D.x + V.y * D.y) / lenSq;
                const minScale = Math.max(minDim / el.width, minDim / el.height);
                const finalScale = Math.max(minScale, scaleFactor);

                w = el.width * finalScale;
                h = el.height * finalScale;

                if (handle === 'bottomRight') {
                    newX = anchor.x;
                    newY = anchor.y;
                } else if (handle === 'topLeft') {
                    newX = anchor.x - w;
                    newY = anchor.y - h;
                } else if (handle === 'topRight') {
                    newX = anchor.x;
                    newY = anchor.y - h;
                } else if (handle === 'bottomLeft') {
                    newX = anchor.x - w;
                    newY = anchor.y;
                }
            }

            elementsRef.current = elementsRef.current.map(item => {
                if (item.id === el.id) {
                    return {
                        ...item,
                        x: newX,
                        y: newY,
                        width: w,
                        height: h
                    } as CanvasElement;
                }
                return item;
            });
        }
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (activeTool === 'text') {
            return;
        }

        if (isSpacePressed || e.button === 1 || activeTool === 'hand') {
            isPanningRef.current = true;
            setIsPanning(true);
            panStartRef.current = { x: e.clientX, y: e.clientY };
            panOffsetStartRef.current = { x: cameraRef.current.offsetX, y: cameraRef.current.offsetY };
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = getWordCoords(screenX, screenY);

        if (activeTool === 'select') {
            const handle = getActiveResizeHandle(worldPos.x, worldPos.y, cameraRef.current.scale);
            if (handle) {
                const el = elementsRef.current.find(item => item.id === selectedElementIds[0]) as ImageElement;
                isResizingRef.current = true;
                activeResizeHandleRef.current = handle;
                resizeInitialElementRef.current = cloneCanvasElement(el) as ImageElement;
                resizeStartPosRef.current = { x: worldPos.x, y: worldPos.y };

                let anchorX = el.x;
                let anchorY = el.y;
                if (handle === 'topLeft') {
                    anchorX = el.x + el.width;
                    anchorY = el.y + el.height;
                } else if (handle === 'topRight') {
                    anchorX = el.x;
                    anchorY = el.y + el.height;
                } else if (handle === 'bottomLeft') {
                    anchorX = el.x + el.width;
                    anchorY = el.y;
                } else if (handle === 'bottomRight') {
                    anchorX = el.x;
                    anchorY = el.y;
                }
                resizeAnchorRef.current = { x: anchorX, y: anchorY };
                setIsDrawing(true);
                redrawViewCanvas();
                return;
            }

            // Calculate consolidated bounding box of currently selected elements
            let selectedBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
            if (selectedElementIds.length > 0) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                let foundAny = false;
                for (const id of selectedElementIds) {
                    const el = elementsRef.current.find(e => e.id === id);
                    if (el) {
                        const bounds = getElementBounds(el);
                        if (bounds.minX < minX) minX = bounds.minX;
                        if (bounds.minY < minY) minY = bounds.minY;
                        if (bounds.maxX > maxX) maxX = bounds.maxX;
                        if (bounds.maxY > maxY) maxY = bounds.maxY;
                        foundAny = true;
                    }
                }
                if (foundAny) {
                    const pad = 6 / cameraRef.current.scale;
                    selectedBounds = {
                        minX: minX - pad,
                        minY: minY - pad,
                        maxX: maxX + pad,
                        maxY: maxY + pad
                    };
                }
            }

            const clickInSelectionBox = selectedBounds && 
                worldPos.x >= selectedBounds.minX && worldPos.x <= selectedBounds.maxX &&
                worldPos.y >= selectedBounds.minY && worldPos.y <= selectedBounds.maxY;

            const clickedEl = getElementAtPosition(worldPos.x, worldPos.y, elementsRef.current);

            if (clickInSelectionBox || clickedEl) {
                // If clicked an element that is NOT in the selection, and shift is not pressed, select only that element
                let nextSelection = selectedElementIds;
                if (clickedEl && !selectedElementIds.includes(clickedEl.id)) {
                    nextSelection = e.shiftKey
                        ? [...selectedElementIds, clickedEl.id]
                        : [clickedEl.id];
                }

                setSelectedElementIds(nextSelection);
                isDraggingSelectionRef.current = true;
                hasDraggedRef.current = false;
                startPosRef.current = { x: worldPos.x, y: worldPos.y };

                dragStartPositionsRef.current = new Map(
                    elementsRef.current
                        .filter(el => nextSelection.includes(el.id))
                        .map(el => [el.id, cloneCanvasElement(el)])
                );
            } else {
                if (!e.shiftKey) {
                    setSelectedElementIds([]);
                }
                isMarqueeSelectingRef.current = true;
                hasDraggedRef.current = false;
                startPosRef.current = { x: worldPos.x, y: worldPos.y };
                lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
                activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y, timestamp: Date.now() }];
            }
            setIsDrawing(true);
            redrawViewCanvas();
            return;
        }

        if (activeTool === 'solve') {
            setIsDrawing(true);
            lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
            startPosRef.current = { x: worldPos.x, y: worldPos.y };
            activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y, timestamp: Date.now() }];
            redrawViewCanvas();
            return;
        }

        saveState();
        setIsDrawing(true);
        setIsCanvasEmpty(false);

        lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
        if (selectedShape === 'freehand') {
            activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y, timestamp: Date.now() }];
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
            setCanvasCursor('grabbing');
            redrawViewCanvas();
            return;
        }

        if (!isDrawing && activeTool !== 'eraser' && activeTool !== 'select') return;

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = getWordCoords(screenX, screenY);

        lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };

        if (activeTool === 'eraser') {
            if (e.buttons === 1) { // Left button pressed
                const eraserRadius = eraserWidthRef.current / 2;
                const originalLength = elementsRef.current.length;
                elementsRef.current = elementsRef.current.filter(el => !hitTestElement(worldPos.x, worldPos.y, el, eraserRadius));
                if (elementsRef.current.length !== originalLength) {
                    setIsCanvasEmpty(elementsRef.current.length === 0);
                }
            }
            redrawViewCanvas(); // Always redraw to update eraser cursor preview
            return;
        }

        if (activeTool === 'select') {
            if (isResizingRef.current) {
                if (!hasDraggedRef.current) {
                    saveState();
                    hasDraggedRef.current = true;
                }
                performResize(worldPos.x, worldPos.y, e.shiftKey);
                redrawViewCanvas();
                return;
            }
            if (isDraggingSelectionRef.current) {
                if (!hasDraggedRef.current) {
                    saveState();
                    hasDraggedRef.current = true;
                }
                const dx = worldPos.x - startPosRef.current.x;
                const dy = worldPos.y - startPosRef.current.y;

                elementsRef.current = elementsRef.current.map(el => {
                    const initial = dragStartPositionsRef.current.get(el.id);
                    if (initial) {
                        if (el.kind === 'text' || el.kind === 'image') {
                            const initTextOrImg = initial as any;
                            return { ...el, x: initTextOrImg.x + dx, y: initTextOrImg.y + dy };
                        } else {
                            return {
                                ...el,
                                bounds: undefined,
                                points: (initial as Stroke).points.map(pt => ({
                                    ...pt,
                                    x: pt.x + dx,
                                    y: pt.y + dy
                                }))
                            };
                        }
                    }
                    return el;
                });
                setCanvasCursor('move');
            } else if (isMarqueeSelectingRef.current) {
                hasDraggedRef.current = true;
                if (selectedSelectionShape === 'lasso') {
                    activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y, timestamp: Date.now() });
                }
                setCanvasCursor('default');
            } else {
                // Check if hovering over selection resize handles of a selected image
                const handle = getActiveResizeHandle(worldPos.x, worldPos.y, cameraRef.current.scale);
                if (handle === 'topLeft' || handle === 'bottomRight') {
                    setCanvasCursor('nwse-resize');
                    redrawViewCanvas();
                    return;
                } else if (handle === 'topRight' || handle === 'bottomLeft') {
                    setCanvasCursor('nesw-resize');
                    redrawViewCanvas();
                    return;
                }

                // Just hovering - change cursor to 4-arrow move cursor if hovering inside selection box or over any element
                let selectedBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
                if (selectedElementIds.length > 0) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    let foundAny = false;
                    for (const id of selectedElementIds) {
                        const el = elementsRef.current.find(e => e.id === id);
                        if (el) {
                            const bounds = getElementBounds(el);
                            if (bounds.minX < minX) minX = bounds.minX;
                            if (bounds.minY < minY) minY = bounds.minY;
                            if (bounds.maxX > maxX) maxX = bounds.maxX;
                            if (bounds.maxY > maxY) maxY = bounds.maxY;
                            foundAny = true;
                        }
                    }
                    if (foundAny) {
                        const pad = 6 / cameraRef.current.scale;
                        selectedBounds = {
                            minX: minX - pad,
                            minY: minY - pad,
                            maxX: maxX + pad,
                            maxY: maxY + pad
                        };
                    }
                }

                const hoverInSelectionBox = selectedBounds && 
                    worldPos.x >= selectedBounds.minX && worldPos.x <= selectedBounds.maxX &&
                    worldPos.y >= selectedBounds.minY && worldPos.y <= selectedBounds.maxY;

                const hoveredEl = getElementAtPosition(worldPos.x, worldPos.y, elementsRef.current);
                if (hoverInSelectionBox || hoveredEl) {
                    setCanvasCursor('move');
                } else {
                    setCanvasCursor('default');
                }
            }
            redrawViewCanvas();
            return;
        }

        if (!isDrawing) return;

        if (activeTool === 'solve') {
            activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y, timestamp: Date.now() });
            redrawViewCanvas();
            return;
        }

        if (selectedShape === 'freehand') {
            const isFreehandPen = ['pen', 'fountain', 'marker'].includes(activeTool);
            if (e.shiftKey && isFreehandPen && activeStrokePointsRef.current.length > 0) {
                const startPt = activeStrokePointsRef.current[0];
                activeStrokePointsRef.current = [
                    startPt,
                    { x: worldPos.x, y: worldPos.y, timestamp: Date.now() }
                ];
            } else {
                activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y, timestamp: Date.now() });
            }
        }
        redrawViewCanvas();
    };

    const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanningRef.current) {
            isPanningRef.current = false;
            setIsPanning(false);
            return;
        }

        if (activeTool === 'select') {
            if (isResizingRef.current) {
                isResizingRef.current = false;
                activeResizeHandleRef.current = null;
                resizeInitialElementRef.current = null;
                setIsDrawing(false);
            } else if (isDraggingSelectionRef.current) {
                isDraggingSelectionRef.current = false;
                if (hasDraggedRef.current) {
                    // State already saved on first move
                } else {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const screenX = e.clientX - rect.left;
                        const screenY = e.clientY - rect.top;
                        const worldPos = getWordCoords(screenX, screenY);
                        const clickedEl = getElementAtPosition(worldPos.x, worldPos.y, elementsRef.current);
                        if (clickedEl && clickedEl.kind === 'text') {
                            setActiveTextEdit({
                                id: clickedEl.id,
                                x: clickedEl.x,
                                y: clickedEl.y,
                                text: clickedEl.text,
                                fontSize: clickedEl.fontSize,
                                color: clickedEl.color,
                                isNew: false
                            });
                        }
                    }
                }
            } else if (isMarqueeSelectingRef.current) {
                isMarqueeSelectingRef.current = false;
                const canvas = canvasRef.current;
                if (canvas && hasDraggedRef.current) {
                    const rect = canvas.getBoundingClientRect();
                    const screenX = e.clientX - rect.left;
                    const screenY = e.clientY - rect.top;
                    const worldPos = getWordCoords(screenX, screenY);

                    let boundary: any;
                    if (selectedSelectionShape === 'rectangle') {
                        boundary = {
                            minX: Math.min(startPosRef.current.x, worldPos.x),
                            maxX: Math.max(startPosRef.current.x, worldPos.x),
                            minY: Math.min(startPosRef.current.y, worldPos.y),
                            maxY: Math.max(startPosRef.current.y, worldPos.y)
                        };
                    } else {
                        boundary = [...activeStrokePointsRef.current];
                    }

                    const newlySelected = getElementsInSelection(elementsRef.current, boundary, selectedSelectionShape);
                    setSelectedElementIds(newlySelected);
                }
                activeStrokePointsRef.current = [];
            }
            redrawViewCanvas();
            return;
        }

        if (!isDrawing) return;
        setIsDrawing(false);

        if (activeTool === 'eraser') {
            activeStrokePointsRef.current = [];
            redrawViewCanvas();
            return;
        }

        const canvas = canvasRef.current;

        if (activeTool === 'solve') {
            if (canvas) {
                const points = [...activeStrokePointsRef.current];

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                points.forEach(pt => {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                });

                if (points.length > 0 && maxX - minX > 5 && maxY - minY > 5) {
                    onSelectionSolve?.({
                        type: 'lasso',
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

            const newPoints = selectedShape === 'freehand'
                ? [...activeStrokePointsRef.current]
                : [{ x: sx, y: sy, timestamp: Date.now() }, { x, y, timestamp: Date.now() }];

            if (newPoints.length > 0) {
                const newStroke: CanvasElement = {
                    kind: 'stroke',
                    id: generateUUID(),
                    tool: selectedShape === 'freehand' ? activeTool as any : (selectedShape === 'rectangle' ? 'rect' : selectedShape as any),
                    color: colorRef.current,
                    width: strokeWidthRef.current,
                    opacity: strokeOpacityRef.current,
                    points: newPoints
                };

                elementsRef.current.push(newStroke);
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

        if (activeTool === 'text') {
            return;
        }

        if (e.touches.length === 2) {
            isPanningRef.current = true;
            setIsPanning(true);
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

        if (isSpacePressed || activeTool === 'hand') {
            isPanningRef.current = true;
            setIsPanning(true);
            panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            panOffsetStartRef.current = { x: cameraRef.current.offsetX, y: cameraRef.current.offsetY };
            return;
        }

        const pos = getTouchPos(e);
        const worldPos = getWordCoords(pos.x, pos.y);

        if (activeTool === 'select') {
            const handle = getActiveResizeHandle(worldPos.x, worldPos.y, cameraRef.current.scale);
            if (handle) {
                const el = elementsRef.current.find(item => item.id === selectedElementIds[0]) as ImageElement;
                isResizingRef.current = true;
                activeResizeHandleRef.current = handle;
                resizeInitialElementRef.current = cloneCanvasElement(el) as ImageElement;
                resizeStartPosRef.current = { x: worldPos.x, y: worldPos.y };

                let anchorX = el.x;
                let anchorY = el.y;
                if (handle === 'topLeft') {
                    anchorX = el.x + el.width;
                    anchorY = el.y + el.height;
                } else if (handle === 'topRight') {
                    anchorX = el.x;
                    anchorY = el.y + el.height;
                } else if (handle === 'bottomLeft') {
                    anchorX = el.x + el.width;
                    anchorY = el.y;
                } else if (handle === 'bottomRight') {
                    anchorX = el.x;
                    anchorY = el.y;
                }
                resizeAnchorRef.current = { x: anchorX, y: anchorY };
                setIsDrawing(true);
                redrawViewCanvas();
                return;
            }

            // Calculate consolidated bounding box of currently selected elements
            let selectedBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
            if (selectedElementIds.length > 0) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                let foundAny = false;
                for (const id of selectedElementIds) {
                    const el = elementsRef.current.find(e => e.id === id);
                    if (el) {
                        const bounds = getElementBounds(el);
                        if (bounds.minX < minX) minX = bounds.minX;
                        if (bounds.minY < minY) minY = bounds.minY;
                        if (bounds.maxX > maxX) maxX = bounds.maxX;
                        if (bounds.maxY > maxY) maxY = bounds.maxY;
                        foundAny = true;
                    }
                }
                if (foundAny) {
                    const pad = 6 / cameraRef.current.scale;
                    selectedBounds = {
                        minX: minX - pad,
                        minY: minY - pad,
                        maxX: maxX + pad,
                        maxY: maxY + pad
                    };
                }
            }

            const clickInSelectionBox = selectedBounds && 
                worldPos.x >= selectedBounds.minX && worldPos.x <= selectedBounds.maxX &&
                worldPos.y >= selectedBounds.minY && worldPos.y <= selectedBounds.maxY;

            const clickedEl = getElementAtPosition(worldPos.x, worldPos.y, elementsRef.current);

            if (clickInSelectionBox || clickedEl) {
                // If clicked an element that is NOT in the selection, and shift is not pressed, select only that element
                let nextSelection = selectedElementIds;
                if (clickedEl && !selectedElementIds.includes(clickedEl.id)) {
                    // Touch events do not have shiftKey natively on the touch event, check if supported or fallback
                    const hasShift = (e as any).shiftKey;
                    nextSelection = hasShift
                        ? [...selectedElementIds, clickedEl.id]
                        : [clickedEl.id];
                }

                setSelectedElementIds(nextSelection);
                isDraggingSelectionRef.current = true;
                hasDraggedRef.current = false;
                startPosRef.current = { x: worldPos.x, y: worldPos.y };

                dragStartPositionsRef.current = new Map(
                    elementsRef.current
                        .filter(el => nextSelection.includes(el.id))
                        .map(el => [el.id, cloneCanvasElement(el)])
                );
            } else {
                const hasShift = (e as any).shiftKey;
                if (!hasShift) {
                    setSelectedElementIds([]);
                }
                isMarqueeSelectingRef.current = true;
                hasDraggedRef.current = false;
                startPosRef.current = { x: worldPos.x, y: worldPos.y };
                lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
                activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y, timestamp: Date.now() }];
            }
            setIsDrawing(true);
            redrawViewCanvas();
            return;
        }

        if (activeTool === 'solve') {
            setIsDrawing(true);
            lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
            startPosRef.current = { x: worldPos.x, y: worldPos.y };
            activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y, timestamp: Date.now() }];
            redrawViewCanvas();
            return;
        }

        saveState();
        setIsDrawing(true);
        setIsCanvasEmpty(false);

        lastActivePosRef.current = { x: worldPos.x, y: worldPos.y };
        if (selectedShape === 'freehand') {
            activeStrokePointsRef.current = [{ x: worldPos.x, y: worldPos.y, timestamp: Date.now() }];
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
            const originalLength = elementsRef.current.length;
            elementsRef.current = elementsRef.current.filter(el => !hitTestElement(worldPos.x, worldPos.y, el, eraserRadius));
            if (elementsRef.current.length !== originalLength) {
                setIsCanvasEmpty(elementsRef.current.length === 0);
            }
            redrawViewCanvas(); // Always redraw to update eraser cursor preview
            return;
        }

        if (activeTool === 'select') {
            if (isResizingRef.current) {
                if (!hasDraggedRef.current) {
                    saveState();
                    hasDraggedRef.current = true;
                }
                performResize(worldPos.x, worldPos.y, (e as any).shiftKey);
                redrawViewCanvas();
                return;
            }
            if (isDraggingSelectionRef.current) {
                if (!hasDraggedRef.current) {
                    saveState();
                    hasDraggedRef.current = true;
                }
                const dx = worldPos.x - startPosRef.current.x;
                const dy = worldPos.y - startPosRef.current.y;

                elementsRef.current = elementsRef.current.map(el => {
                    const initial = dragStartPositionsRef.current.get(el.id);
                    if (initial) {
                        if (el.kind === 'text' || el.kind === 'image') {
                            const initTextOrImg = initial as any;
                            return { ...el, x: initTextOrImg.x + dx, y: initTextOrImg.y + dy };
                        } else {
                            return {
                                ...el,
                                bounds: undefined,
                                points: (initial as Stroke).points.map(pt => ({
                                    ...pt,
                                    x: pt.x + dx,
                                    y: pt.y + dy
                                }))
                            };
                        }
                    }
                    return el;
                });
            } else if (isMarqueeSelectingRef.current) {
                hasDraggedRef.current = true;
                if (selectedSelectionShape === 'lasso') {
                    activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y, timestamp: Date.now() });
                }
            }
            redrawViewCanvas();
            return;
        }

        if (!isDrawing) return;

        if (activeTool === 'solve') {
            activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y, timestamp: Date.now() });
            redrawViewCanvas();
            return;
        }

        if (selectedShape === 'freehand') {
            const isFreehandPen = ['pen', 'fountain', 'marker'].includes(activeTool);
            if (e.shiftKey && isFreehandPen && activeStrokePointsRef.current.length > 0) {
                const startPt = activeStrokePointsRef.current[0];
                activeStrokePointsRef.current = [
                    startPt,
                    { x: worldPos.x, y: worldPos.y, timestamp: Date.now() }
                ];
            } else {
                activeStrokePointsRef.current.push({ x: worldPos.x, y: worldPos.y, timestamp: Date.now() });
            }
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
                setIsPanning(false);
            }
            return;
        }

        if (isPanningRef.current) {
            if (e.touches.length === 0) {
                isPanningRef.current = false;
                setIsPanning(false);
            }
            return;
        }

        if (activeTool === 'select') {
            if (isResizingRef.current) {
                isResizingRef.current = false;
                activeResizeHandleRef.current = null;
                resizeInitialElementRef.current = null;
                setIsDrawing(false);
            } else if (isDraggingSelectionRef.current) {
                isDraggingSelectionRef.current = false;
                if (hasDraggedRef.current) {
                    // State already saved on first move
                } else {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const pos = getTouchPos(e);
                        const worldPos = getWordCoords(pos.x, pos.y);
                        const clickedEl = getElementAtPosition(worldPos.x, worldPos.y, elementsRef.current);
                        if (clickedEl && clickedEl.kind === 'text') {
                            setActiveTextEdit({
                                id: clickedEl.id,
                                x: clickedEl.x,
                                y: clickedEl.y,
                                text: clickedEl.text,
                                fontSize: clickedEl.fontSize,
                                color: clickedEl.color,
                                isNew: false
                            });
                        }
                    }
                }
            } else if (isMarqueeSelectingRef.current) {
                isMarqueeSelectingRef.current = false;
                const canvas = canvasRef.current;
                if (canvas && hasDraggedRef.current) {
                    const pos = getTouchPos(e);
                    const worldPos = getWordCoords(pos.x, pos.y);

                    let boundary: any;
                    if (selectedSelectionShape === 'rectangle') {
                        boundary = {
                            minX: Math.min(startPosRef.current.x, worldPos.x),
                            maxX: Math.max(startPosRef.current.x, worldPos.x),
                            minY: Math.min(startPosRef.current.y, worldPos.y),
                            maxY: Math.max(startPosRef.current.y, worldPos.y)
                        };
                    } else {
                        boundary = [...activeStrokePointsRef.current];
                    }

                    const newlySelected = getElementsInSelection(elementsRef.current, boundary, selectedSelectionShape);
                    setSelectedElementIds(newlySelected);
                }
                activeStrokePointsRef.current = [];
            }
            redrawViewCanvas();
            return;
        }

        if (!isDrawing) return;
        setIsDrawing(false);

        if (activeTool === 'eraser') {
            activeStrokePointsRef.current = [];
            redrawViewCanvas();
            return;
        }

        const canvas = canvasRef.current;

        if (activeTool === 'solve') {
            if (canvas) {
                const points = [...activeStrokePointsRef.current];

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                points.forEach(pt => {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                });

                if (points.length > 0 && maxX - minX > 5 && maxY - minY > 5) {
                    onSelectionSolve?.({
                        type: 'lasso',
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

            const newPoints = selectedShape === 'freehand'
                ? [...activeStrokePointsRef.current]
                : [{ x: sx, y: sy, timestamp: Date.now() }, { x, y, timestamp: Date.now() }];

            if (newPoints.length > 0) {
                const newStroke: CanvasElement = {
                    kind: 'stroke',
                    id: generateUUID(),
                    tool: selectedShape === 'freehand' ? activeTool as any : (selectedShape === 'rectangle' ? 'rect' : selectedShape as any),
                    color: colorRef.current,
                    width: strokeWidthRef.current,
                    opacity: strokeOpacityRef.current,
                    points: newPoints
                };

                elementsRef.current.push(newStroke);
                newPoints.forEach(pt => updateBounds(pt.x, pt.y));
                setIsCanvasEmpty(false);
            }
        }
        activeStrokePointsRef.current = [];
        redrawViewCanvas();
    };

    const drawStrokes = (rawStrokes: { x: number; y: number }[][]) => {
        elementsRef.current = [];
        setSelectedElementIds([]);
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
                y: pt.y + offsetY,
                timestamp: Date.now()
            }));
            
            const newStroke: CanvasElement = {
                kind: 'stroke',
                id: generateUUID(),
                tool: 'pen',
                color: colorRef.current,
                width: 3,
                opacity: 1.0,
                points: newPoints
            };
            elementsRef.current.push(newStroke);
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

    const zoomToContent = useCallback(() => {
        const elements = elementsRef.current;
        if (elements.length === 0) {
            resetView();
            return;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        elements.forEach(el => {
            const bounds = getElementBounds(el);
            if (bounds.minX < minX) minX = bounds.minX;
            if (bounds.maxX > maxX) maxX = bounds.maxX;
            if (bounds.minY < minY) minY = bounds.minY;
            if (bounds.maxY > maxY) maxY = bounds.maxY;
        });

        const padding = 80;
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        if (contentWidth < 1 || contentHeight < 1) {
            resetView();
            return;
        }

        const viewportWidth = windowSize.width;
        const viewportHeight = windowSize.height;

        const scaleX = (viewportWidth - padding * 2) / contentWidth;
        const scaleY = (viewportHeight - padding * 2) / contentHeight;
        let targetScale = Math.min(scaleX, scaleY);

        targetScale = Math.min(4, Math.max(0.2, targetScale));

        const contentCenterX = minX + contentWidth / 2;
        const contentCenterY = minY + contentHeight / 2;

        const targetOffsetX = viewportWidth / 2 - contentCenterX * targetScale;
        const targetOffsetY = viewportHeight / 2 - contentCenterY * targetScale;

        const start = performance.now();
        const startOffsetX = cameraRef.current.offsetX;
        const startOffsetY = cameraRef.current.offsetY;
        const startScale = cameraRef.current.scale;

        const animate = (time: number) => {
            const elapsed = time - start;
            const progress = Math.min(elapsed / 200, 1);
            const ease = 1 - Math.pow(1 - progress, 3);

            cameraRef.current = {
                offsetX: startOffsetX + (targetOffsetX - startOffsetX) * ease,
                offsetY: startOffsetY + (targetOffsetY - startOffsetY) * ease,
                scale: startScale + (targetScale - startScale) * ease
            };
            setCamera({ ...cameraRef.current });
            redrawViewCanvas();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }, [redrawViewCanvas, resetView, windowSize]);

    const zoomIn = useCallback(() => {
        const { offsetX, offsetY, scale } = cameraRef.current;
        // Limit zoom to maximum 400%
        const newScale = Math.min(4, scale + 0.1);
        if (newScale === scale) return;

        const viewportWidth = windowSize.width;
        const viewportHeight = windowSize.height;
        const centerX = viewportWidth / 2;
        const centerY = viewportHeight / 2;

        const worldCenterX = (centerX - offsetX) / scale;
        const worldCenterY = (centerY - offsetY) / scale;

        cameraRef.current = {
            offsetX: centerX - worldCenterX * newScale,
            offsetY: centerY - worldCenterY * newScale,
            scale: newScale
        };
        setCamera({ ...cameraRef.current });
        redrawViewCanvas();
    }, [redrawViewCanvas, windowSize]);

    const zoomOut = useCallback(() => {
        const { offsetX, offsetY, scale } = cameraRef.current;
        // Limit zoom to minimum 20%
        const newScale = Math.max(0.2, scale - 0.1);
        if (newScale === scale) return;

        const viewportWidth = windowSize.width;
        const viewportHeight = windowSize.height;
        const centerX = viewportWidth / 2;
        const centerY = viewportHeight / 2;

        const worldCenterX = (centerX - offsetX) / scale;
        const worldCenterY = (centerY - offsetY) / scale;

        cameraRef.current = {
            offsetX: centerX - worldCenterX * newScale,
            offsetY: centerY - worldCenterY * newScale,
            scale: newScale
        };
        setCamera({ ...cameraRef.current });
        redrawViewCanvas();
    }, [redrawViewCanvas, windowSize]);

    // Handle Ctrl+0/Cmd+0 keyboard shortcut for reset view, and Ctrl+Shift+0/Cmd+Shift+0 to zoom to content
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
            if (cmdOrCtrl && e.key === '0') {
                e.preventDefault();
                if (e.shiftKey) {
                    zoomToContent();
                } else {
                    resetView();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [resetView, zoomToContent]);



    const insertImageFile = useCallback(async (file: File) => {
        console.log("insertImageFile started. File properties:", {
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified
        });

        let targetFile: Blob | File = file;
        const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || 
                       file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

        if (isHeic) {
            console.log("HEIC image detected. Converting using heic2any...");
            try {
                // Dynamically import heic2any to avoid bundling the massive 2MB WASM decoder in the main entry chunk
                const heic2anyModule = await import('heic2any');
                const heic2any = heic2anyModule.default;

                const converted = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.8
                });
                
                const resultBlob = Array.isArray(converted) ? converted[0] : converted;
                targetFile = new File([resultBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                    type: 'image/jpeg'
                });
                console.log("HEIC conversion successful. Converted file properties:", {
                    name: (targetFile as File).name,
                    type: targetFile.type,
                    size: targetFile.size
                });
            } catch (err) {
                console.error("HEIC conversion failed:", err);
                return;
            }
        }

        const objectUrl = URL.createObjectURL(targetFile);
        console.log("Created object URL:", objectUrl);

        const img = new Image();
        img.onload = () => {
            console.log("img.onload fired successfully. Natural size:", img.width, "x", img.height);
            // Cap to max 600px on the longer side
            let w = img.width;
            let h = img.height;
            const maxDim = 600;
            if (w > maxDim || h > maxDim) {
                if (w > h) {
                    h = (h * maxDim) / w;
                    w = maxDim;
                } else {
                    w = (w * maxDim) / h;
                    h = maxDim;
                }
            }
            
            const screenX = windowSize.width / 2;
            const screenY = windowSize.height / 2;
            const worldCenter = getWordCoords(screenX, screenY);
            
            const imageEl: CanvasElement = {
                kind: 'image',
                id: generateUUID(),
                x: worldCenter.x - w / 2,
                y: worldCenter.y - h / 2,
                width: w,
                height: h,
                src: '', // Will be populated in background
                bitmap: img
            };
            
            saveState();
            elementsRef.current.push(imageEl);
            
            // Update bounds
            updateBounds(imageEl.x, imageEl.y);
            updateBounds(imageEl.x + w, imageEl.y + h);
            
            setIsCanvasEmpty(false);
            redrawViewCanvas();

            // Background read file to base64 for persistence
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result) {
                    imageEl.src = reader.result as string;
                    console.log("FileReader background base64 conversion completed successfully. Length:", imageEl.src.length);
                }
                URL.revokeObjectURL(objectUrl);
            };
            reader.onerror = (err) => {
                console.error("FileReader background read error:", err);
                URL.revokeObjectURL(objectUrl);
            };
            reader.readAsDataURL(targetFile);
        };
        img.onerror = (err) => {
            console.error("img.onerror triggered loading image from object URL. Error object/event:", err);
            URL.revokeObjectURL(objectUrl);
        };
        img.src = objectUrl;
    }, [windowSize, getWordCoords, saveState, redrawViewCanvas, setIsCanvasEmpty]);

    return {
        insertImageFile,
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
        elementsRef,
        strokesRef: elementsRef as any,
        selectedElementIds,
        setSelectedElementIds,
        selectedSelectionShape,
        setSelectedSelectionShape,
        undo: () => {
            if (undoStackRef.current.length === 0) return;

            const currentState: HistoryState = {
                elements: elementsRef.current.map(cloneCanvasElement),
                bounds: { ...drawBoundsRef.current }
            };
            redoStackRef.current.push(currentState);
            setCanRedo(true);

            const prevState = undoStackRef.current.pop()!;
            elementsRef.current = prevState.elements.map(cloneCanvasElement);
            drawBoundsRef.current = { ...prevState.bounds };
            setIsCanvasEmpty(elementsRef.current.length === 0);
            setCanUndo(undoStackRef.current.length > 0);
            
            redrawViewCanvas();
        },
        redo: () => {
            if (redoStackRef.current.length === 0) return;

            const currentState: HistoryState = {
                elements: elementsRef.current.map(cloneCanvasElement),
                bounds: { ...drawBoundsRef.current }
            };
            undoStackRef.current.push(currentState);
            setCanUndo(true);

            const nextState = redoStackRef.current.pop()!;
            elementsRef.current = nextState.elements.map(cloneCanvasElement);
            drawBoundsRef.current = { ...nextState.bounds };
            setIsCanvasEmpty(elementsRef.current.length === 0);
            setCanRedo(redoStackRef.current.length > 0);
            
            redrawViewCanvas();
        },
        isSpacePressed,
        isPanning,
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
        cloneCanvasElement,
        activeTextEdit,
        setActiveTextEdit
    };
};
