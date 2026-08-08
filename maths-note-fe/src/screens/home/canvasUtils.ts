import type { Stroke } from '@/types';
import { getStroke } from 'perfect-freehand';

export const getStrokeBounds = (stroke: Stroke) => {
    if (stroke.bounds) {
        return stroke.bounds;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pts = stroke.points;
    if (pts.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    if (stroke.tool === 'rect' || stroke.tool === 'triangle' || stroke.tool === 'line') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            minX = Math.min(p1.x, p2.x);
            maxX = Math.max(p1.x, p2.x);
            minY = Math.min(p1.y, p2.y);
            maxY = Math.max(p1.y, p2.y);
        }
    } else if (stroke.tool === 'circle') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const radius = Math.sqrt(dx * dx + dy * dy);
            minX = p1.x - radius;
            maxX = p1.x + radius;
            minY = p1.y - radius;
            maxY = p1.y + radius;
        }
    } else {
        // freehand pen
        for (const pt of pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }
    }
    const halfWidth = stroke.width / 2;
    stroke.bounds = {
        minX: minX - halfWidth,
        minY: minY - halfWidth,
        maxX: maxX + halfWidth,
        maxY: maxY + halfWidth
    };
    return stroke.bounds;
};

export const getStrokeOutline = (stroke: Stroke): number[][] => {
    const pts = stroke.points;
    
    let size = stroke.width;
    let thinning = 0.0; // Default to 0 (constant width) for standard pen, marker, highlighter
    let smoothing = 0.5;
    let streamline = 0.5;
    let simulatePressure = false;
    const last = stroke.id !== 'temp';

    if (stroke.tool === 'fountain') {
        thinning = 0.65;
        smoothing = 0.5;
        streamline = 0.65; // High streamline smoothing to prevent sharp corner loops
        simulatePressure = true;
        return getStroke(pts, {
            size,
            thinning,
            smoothing,
            streamline,
            simulatePressure,
            last,
            start: { taper: true, cap: true },
            end: { taper: true, cap: true }
        });
    } else if (stroke.tool === 'highlighter') {
        thinning = 0.0;
        smoothing = 0.3;
        streamline = 0.4;
        simulatePressure = false;
    } else if (stroke.tool === 'marker') {
        thinning = 0.0;
        smoothing = 0.4;
        streamline = 0.4;
        simulatePressure = false;
        return getStroke(pts, {
            size,
            thinning,
            smoothing,
            streamline,
            simulatePressure,
            last,
            start: { cap: false },
            end: { cap: false }
        });
    }

    return getStroke(pts, {
        size,
        thinning,
        smoothing,
        streamline,
        simulatePressure,
        last
    });
};

export const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const pts = stroke.points;
    if (pts.length === 0) return;

    if (ctx.save) ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.globalCompositeOperation = 'source-over';

    if (stroke.tool === 'fountain') {
        const outline = getStrokeOutline(stroke);
        if (outline.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) {
            ctx.lineTo(outline[i][0], outline[i][1]);
        }
        ctx.closePath();
        ctx.fillStyle = stroke.color;
        ctx.fill();
    } else if (['pen', 'highlighter', 'marker'].includes(stroke.tool)) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }

        if (stroke.tool === 'marker') {
            ctx.lineCap = 'square';
            ctx.lineJoin = 'round';
        } else {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }

        if (stroke.tool === 'highlighter') {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.6;
        }

        ctx.stroke();
    } else if (stroke.tool === 'line') {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    } else if (stroke.tool === 'rect') {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            ctx.beginPath();
            ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            ctx.stroke();
        }
    } else if (stroke.tool === 'circle') {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            ctx.beginPath();
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const radius = Math.sqrt(dx * dx + dy * dy);
            ctx.arc(p1.x, p1.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    } else if (stroke.tool === 'triangle') {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p1.x, p2.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            ctx.stroke();
        }
    }
    if (ctx.restore) ctx.restore();
};

export function rasterizeRegion(
    strokes: Stroke[],
    region: { x: number; y: number; width: number; height: number },
    options?: { clipPath?: { x: number; y: number }[]; scale?: number; excludeHighlighter?: boolean }
): HTMLCanvasElement {
    const scale = options?.scale ?? 1.0;
    const canvas = document.createElement('canvas');
    canvas.width = region.width * scale;
    canvas.height = region.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(scale, scale);

    if (options?.clipPath && options.clipPath.length > 0) {
        ctx.beginPath();
        ctx.moveTo(options.clipPath[0].x - region.x, options.clipPath[0].y - region.y);
        for (let i = 1; i < options.clipPath.length; i++) {
            ctx.lineTo(options.clipPath[i].x - region.x, options.clipPath[i].y - region.y);
        }
        ctx.closePath();
        ctx.clip();
    }

    ctx.translate(-region.x, -region.y);

    // Pass 1: Highlighter strokes (only if not excluded)
    if (!options?.excludeHighlighter) {
        for (const stroke of strokes) {
            if (stroke.tool === 'highlighter') {
                const bounds = getStrokeBounds(stroke);
                const intersects = !(
                    bounds.maxX < region.x || bounds.minX > region.x + region.width ||
                    bounds.maxY < region.y || bounds.minY > region.y + region.height
                );
                if (intersects) {
                    drawStroke(ctx, stroke);
                }
            }
        }
    }

    // Pass 2: Non-highlighter strokes
    for (const stroke of strokes) {
        if (stroke.tool !== 'highlighter') {
            const bounds = getStrokeBounds(stroke);
            const intersects = !(
                bounds.maxX < region.x || bounds.minX > region.x + region.width ||
                bounds.maxY < region.y || bounds.minY > region.y + region.height
            );
            if (intersects) {
                drawStroke(ctx, stroke);
            }
        }
    }

    ctx.restore();
    return canvas;
}


