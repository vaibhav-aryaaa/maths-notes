import React, { useState, useRef, useCallback } from 'react';

export interface GradientColorPickerProps {
    value: string;
    onChange: (color: string) => void;
    lightnessRange?: [number, number]; // e.g. [0.55, 0.90] or [55, 90]
    className?: string;
}

export function parseColorToRgb(colorStr: string): { r: number; g: number; b: number } | null {
    if (!colorStr) return null;
    const str = colorStr.trim().toLowerCase();

    // 1. Hex parsing (#RGB, #RRGGBB)
    if (str.startsWith('#')) {
        const hex = str.slice(1);
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b };
        } else if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b };
        }
    }

    // 2. rgb(r, g, b) or rgba(r, g, b, a)
    const rgbMatch = str.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
        return {
            r: Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10))),
            g: Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10))),
            b: Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)))
        };
    }

    // 3. Named colors fallback
    if (str === 'white') return { r: 255, g: 255, b: 255 };
    if (str === 'black') return { r: 0, g: 0, b: 0 };

    return null;
}

export function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => {
        const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase();
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
        if (max === rNorm) {
            h = 60 * (((gNorm - bNorm) / delta) % 6);
        } else if (max === gNorm) {
            h = 60 * (((bNorm - rNorm) / delta) + 2);
        } else {
            h = 60 * (((rNorm - gNorm) / delta) + 4);
        }
    }
    if (h < 0) h += 360;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hPrime = ((h % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs((hPrime % 2) - 1));
    let r1: number, g1: number, b1: number;
    if (0 <= hPrime && hPrime < 1) { r1 = c; g1 = x; b1 = 0; }
    else if (1 <= hPrime && hPrime < 2) { r1 = x; g1 = c; b1 = 0; }
    else if (2 <= hPrime && hPrime < 3) { r1 = 0; g1 = c; b1 = x; }
    else if (3 <= hPrime && hPrime < 4) { r1 = 0; g1 = x; b1 = c; }
    else if (4 <= hPrime && hPrime < 5) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }
    const m = l - c / 2;
    return [
        Math.round((r1 + m) * 255),
        Math.round((g1 + m) * 255),
        Math.round((b1 + m) * 255)
    ];
}

export function getColorFromCoordinates(
    x: number,
    y: number,
    lightnessRange?: [number, number]
): string {
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));

    const hue = clampedY * 360;
    const hPrime = (hue % 360) / 60;
    const f = hPrime - Math.floor(hPrime);
    let r0: number, g0: number, b0: number;
    const hFloor = Math.floor(hPrime);

    if (hFloor === 0) { r0 = 1; g0 = f; b0 = 0; }
    else if (hFloor === 1) { r0 = 1 - f; g0 = 1; b0 = 0; }
    else if (hFloor === 2) { r0 = 0; g0 = 1; b0 = f; }
    else if (hFloor === 3) { r0 = 0; g0 = 1 - f; b0 = 1; }
    else if (hFloor === 4) { r0 = f; g0 = 0; b0 = 1; }
    else { r0 = 1; g0 = 0; b0 = 1 - f; }

    // Layer 1 (White from left):
    const r1 = r0 * clampedX + (1 - clampedX);
    const g1 = g0 * clampedX + (1 - clampedX);
    const b1 = b0 * clampedX + (1 - clampedX);

    // Layer 2 (Black from bottom):
    const r2 = r1 * (1 - clampedY);
    const g2 = g1 * (1 - clampedY);
    const b2 = b1 * (1 - clampedY);

    const [, s, l] = rgbToHsl(
        Math.round(r2 * 255),
        Math.round(g2 * 255),
        Math.round(b2 * 255)
    );

    if (lightnessRange) {
        let [minL, maxL] = lightnessRange;
        if (minL > 1 || maxL > 1) {
            minL = minL / 100;
            maxL = maxL / 100;
        }
        const clampedL = Math.max(minL, Math.min(maxL, l));
        const [rClamp, gClamp, bClamp] = hslToRgb(hue, s, clampedL);
        return rgbToHex(rClamp, gClamp, bClamp);
    }

    return rgbToHex(Math.round(r2 * 255), Math.round(g2 * 255), Math.round(b2 * 255));
}

export function getCoordinatesFromColor(colorStr: string): { x: number; y: number } {
    const rgb = parseColorToRgb(colorStr);
    if (!rgb) return { x: 1, y: 0 };

    const [h] = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const y = h / 360;

    const rNorm = rgb.r / 255;
    const gNorm = rgb.g / 255;
    const bNorm = rgb.b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const hsvS = max === 0 ? 0 : (max - min) / max;

    return {
        x: Math.max(0, Math.min(1, hsvS)),
        y: Math.max(0, Math.min(1, y))
    };
}

export const GradientColorPicker: React.FC<GradientColorPickerProps> = ({
    value,
    onChange,
    lightnessRange,
    className = ''
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    // Track previous external value to sync state during render
    const [prevValue, setPrevValue] = useState(value);

    // Track active indicator position (0 to 1)
    const [coords, setCoords] = useState<{ x: number; y: number }>(() => {
        return getCoordinatesFromColor(value);
    });

    // Hex text input state
    const [typedHex, setTypedHex] = useState(() => {
        const rgb = parseColorToRgb(value);
        return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : value.toUpperCase();
    });

    // Adjust state during render when external `value` prop changes
    if (prevValue !== value) {
        setPrevValue(value);
        const rgb = parseColorToRgb(value);
        if (rgb) {
            const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
            setTypedHex(hex);
            setCoords(getCoordinatesFromColor(hex));
        }
    }

    const handlePointerMove = useCallback((clientX: number, clientY: number) => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const rawX = (clientX - rect.left) / rect.width;
        const rawY = (clientY - rect.top) / rect.height;

        const clampedX = Math.max(0, Math.min(1, rawX));
        const clampedY = Math.max(0, Math.min(1, rawY));

        setCoords({ x: clampedX, y: clampedY });
        const newColor = getColorFromCoordinates(clampedX, clampedY, lightnessRange);
        setTypedHex(newColor);
        onChange(newColor);
    }, [onChange, lightnessRange]);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        isDraggingRef.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        handlePointerMove(e.clientX, e.clientY);
    };

    const handlePointerMoveEvent = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current) return;
        handlePointerMove(e.clientX, e.clientY);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isDraggingRef.current) {
            isDraggingRef.current = false;
            try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // Ignore if pointer capture already released
            }
        }
    };

    const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.trim();
        setTypedHex(raw);

        // Check if valid hex
        const formatted = raw.startsWith('#') ? raw : `#${raw}`;
        const rgb = parseColorToRgb(formatted);
        if (rgb) {
            let finalHex = rgbToHex(rgb.r, rgb.g, rgb.b);
            if (lightnessRange) {
                const [, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
                let [minL, maxL] = lightnessRange;
                if (minL > 1 || maxL > 1) {
                    minL = minL / 100;
                    maxL = maxL / 100;
                }
                const clampedL = Math.max(minL, Math.min(maxL, l));
                const [h] = rgbToHsl(rgb.r, rgb.g, rgb.b);
                const [cr, cg, cb] = hslToRgb(h, s, clampedL);
                finalHex = rgbToHex(cr, cg, cb);
            }
            setCoords(getCoordinatesFromColor(finalHex));
            onChange(finalHex);
        }
    };

    const currentColorHex = (() => {
        const rgb = parseColorToRgb(value);
        return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : value;
    })();

    return (
        <div className={`flex flex-col gap-2.5 w-full min-w-[200px] select-none ${className}`}>
            {/* 3-Layer Continuous Gradient Box */}
            <div
                ref={containerRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMoveEvent}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative w-full h-32 rounded-lg cursor-crosshair overflow-hidden border border-stone-300 dark:border-[#3a3a3d] shadow-inner touch-none"
                style={{
                    background: `
                        linear-gradient(to top, #000000 0%, transparent 100%),
                        linear-gradient(to right, #ffffff 0%, rgba(255,255,255,0) 100%),
                        linear-gradient(to bottom, #ff0000 0%, #ffff00 16.666%, #00ff00 33.333%, #00ffff 50%, #0000ff 66.666%, #ff00ff 83.333%, #ff0000 100%)
                    `
                }}
            >
                {/* Active Position Indicator Thumb */}
                <div
                    className="absolute w-4 h-4 rounded-full pointer-events-none transform -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.8),inset_0_0_2px_rgba(0,0,0,0.8)] transition-transform duration-75"
                    style={{
                        left: `${coords.x * 100}%`,
                        top: `${coords.y * 100}%`,
                        backgroundColor: currentColorHex
                    }}
                />
            </div>

            {/* Live Preview Swatch and Two-Way Hex Text Input */}
            <div className="flex items-center gap-2">
                <div
                    className="w-7 h-7 rounded-md border border-stone-200 dark:border-[#3a3a3d] shadow-sm shrink-0"
                    style={{ backgroundColor: currentColorHex }}
                    title={`Current color: ${currentColorHex}`}
                />
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={typedHex}
                        onChange={handleHexInputChange}
                        placeholder="#FFFFFF"
                        maxLength={7}
                        className="w-full h-7 px-2 text-xs font-mono font-semibold uppercase bg-stone-100 dark:bg-[#252528] border border-stone-200 dark:border-[#3a3a3d] rounded-md text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        aria-label="Hex color value"
                    />
                </div>
            </div>
        </div>
    );
};
