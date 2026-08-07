import type { Stroke } from '@/types';

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

export const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const pts = stroke.points;
    if (pts.length === 0) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.globalCompositeOperation = 'source-over';

    ctx.beginPath();
    if (stroke.tool === 'pen') {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
    } else if (stroke.tool === 'line') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    } else if (stroke.tool === 'rect') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            ctx.stroke();
        }
    } else if (stroke.tool === 'circle') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const radius = Math.sqrt(dx * dx + dy * dy);
            ctx.arc(p1.x, p1.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    } else if (stroke.tool === 'triangle') {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        if (p1 && p2) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p1.x, p2.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            ctx.stroke();
        }
    }
};

export function rasterizeRegion(
    strokes: Stroke[],
    region: { x: number; y: number; width: number; height: number },
    options?: { clipPath?: { x: number; y: number }[]; scale?: number }
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

    for (const stroke of strokes) {
        const bounds = getStrokeBounds(stroke);
        const intersects = !(
            bounds.maxX < region.x || bounds.minX > region.x + region.width ||
            bounds.maxY < region.y || bounds.minY > region.y + region.height
        );
        if (intersects) {
            drawStroke(ctx, stroke);
        }
    }

    ctx.restore();
    return canvas;
}
