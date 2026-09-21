import { describe, it, expect } from 'vitest';
import {
    parseColorToRgb,
    rgbToHex,
    rgbToHsl,
    hslToRgb,
    getColorFromCoordinates,
    getCoordinatesFromColor
} from './GradientColorPicker';

describe('GradientColorPicker color utilities', () => {
    it('parses hex and rgb strings correctly', () => {
        expect(parseColorToRgb('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseColorToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseColorToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
        expect(parseColorToRgb('rgb(245, 158, 11)')).toEqual({ r: 245, g: 158, b: 11 });
        expect(parseColorToRgb('white')).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseColorToRgb('invalid')).toBeNull();
    });

    it('converts rgb to hex and back', () => {
        expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
        expect(rgbToHex(0, 0, 0)).toBe('#000000');
        expect(rgbToHex(245, 158, 11)).toBe('#F59E0B');
    });

    it('converts between rgb and hsl accurately', () => {
        const [h, s, l] = rgbToHsl(255, 0, 0); // Pure Red
        expect(h).toBe(0);
        expect(s).toBe(1);
        expect(l).toBe(0.5);

        const [r, g, b] = hslToRgb(0, 1, 0.5);
        expect(r).toBe(255);
        expect(g).toBe(0);
        expect(b).toBe(0);
    });

    it('maps top-left corner to white and bottom to dark', () => {
        const whiteHex = getColorFromCoordinates(0, 0);
        expect(whiteHex).toBe('#FFFFFF');

        const blackHex = getColorFromCoordinates(0, 1);
        expect(blackHex).toBe('#000000');
    });

    it('clamps lightness range for highlighter', () => {
        // High lightness test (55% to 90%)
        const color = getColorFromCoordinates(0, 0, [0.55, 0.90]);
        const rgb = parseColorToRgb(color)!;
        const [, , l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
        expect(l).toBeLessThanOrEqual(0.91);
        expect(l).toBeGreaterThanOrEqual(0.54);

        // Low lightness test (55% to 90%)
        const darkColor = getColorFromCoordinates(0, 1, [0.55, 0.90]);
        const darkRgb = parseColorToRgb(darkColor)!;
        const [, , darkL] = rgbToHsl(darkRgb.r, darkRgb.g, darkRgb.b);
        expect(darkL).toBeGreaterThanOrEqual(0.54);
    });

    it('computes coordinate positions from color', () => {
        const coordsWhite = getCoordinatesFromColor('#FFFFFF');
        expect(coordsWhite.x).toBe(0);

        const coordsRed = getCoordinatesFromColor('#FF0000');
        expect(coordsRed.y).toBe(0);
        expect(coordsRed.x).toBe(1);
    });
});
