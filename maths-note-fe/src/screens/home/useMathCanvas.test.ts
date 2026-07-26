import { renderHook, act } from '@testing-library/react';
import { useMathCanvas } from './useMathCanvas';
import { describe, it, expect } from 'vitest';

describe('useMathCanvas', () => {
    it('should initialize with default states', () => {
        const { result } = renderHook(() => useMathCanvas());
        expect(result.current.isDrawing).toBe(false);
        expect(result.current.isEraser).toBe(false);
        expect(result.current.color).toBe('rgb(255, 255, 255)');
        expect(result.current.selectedShape).toBe('freehand');
    });

    it('should update eraser and color states', () => {
        const { result } = renderHook(() => useMathCanvas());
        
        act(() => {
            result.current.setIsEraser(true);
            result.current.setColor('rgb(255, 0, 0)');
            result.current.setSelectedShape('circle');
        });

        expect(result.current.isEraser).toBe(true);
        expect(result.current.color).toBe('rgb(255, 0, 0)');
        expect(result.current.selectedShape).toBe('circle');
    });

    it('should manage isCanvasEmpty state correctly', () => {
        const { result } = renderHook(() => useMathCanvas());
        expect(result.current.isCanvasEmpty).toBe(true);

        // Mock canvas ref
        const mockCanvas = document.createElement('canvas');
        mockCanvas.getContext = ((contextId: string) => {
            if (contextId === '2d') {
                return {
                    clearRect: () => {},
                    beginPath: () => {},
                    moveTo: () => {},
                    lineTo: () => {},
                    stroke: () => {},
                    setTransform: () => {},
                    fillRect: () => {},
                    drawImage: () => {},
                } as unknown as CanvasRenderingContext2D;
            }
            return null;
        }) as unknown as typeof mockCanvas.getContext;

        Object.defineProperty(result.current.canvasRef, 'current', {
            value: mockCanvas,
            writable: true
        });

        act(() => {
            result.current.drawStrokes([[{ x: 10, y: 10 }, { x: 20, y: 20 }]]);
        });
        expect(result.current.isCanvasEmpty).toBe(false);

        act(() => {
            result.current.resetCanvas();
        });
        expect(result.current.isCanvasEmpty).toBe(true);
    });
});
