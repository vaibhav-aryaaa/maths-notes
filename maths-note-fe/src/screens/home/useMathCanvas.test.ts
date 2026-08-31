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
        expect(result.current.strokesRef.current).toEqual([]);
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
                    arc: () => {},
                    rect: () => {},
                    scale: () => {},
                    translate: () => {},
                    closePath: () => {},
                    fill: () => {},
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

    it('should manage undo and redo of vector strokes correctly', () => {
        const { result } = renderHook(() => useMathCanvas());
        
        // Mock canvas ref
        const mockCanvas = document.createElement('canvas');
        mockCanvas.getContext = (() => ({
            clearRect: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            setTransform: () => {},
            fillRect: () => {},
            drawImage: () => {},
            scale: () => {},
            translate: () => {},
            closePath: () => {},
            fill: () => {},
        } as unknown as CanvasRenderingContext2D)) as any;
        
        Object.defineProperty(result.current.canvasRef, 'current', {
            value: mockCanvas,
            writable: true
        });

        // Initially no strokes
        expect(result.current.strokesRef.current.length).toBe(0);

        // Draw a stroke
        act(() => {
            result.current.drawStrokes([[{ x: 10, y: 10 }, { x: 20, y: 20 }]]);
        });
        expect(result.current.strokesRef.current.length).toBe(1);

        // Emulate pointer events that push to strokes
        act(() => {
            result.current.startDrawing({
                clientX: 100,
                clientY: 100,
                button: 0,
            } as any);
        });

        act(() => {
            result.current.draw({
                clientX: 110,
                clientY: 110,
                buttons: 1,
            } as any);
        });

        act(() => {
            result.current.stopDrawing({
                clientX: 110,
                clientY: 110,
            } as any);
        });

        expect(result.current.strokesRef.current.length).toBe(2);
        expect(result.current.canUndo).toBe(true);

        // Undo
        act(() => {
            result.current.undo();
        });
        expect(result.current.strokesRef.current.length).toBe(1);
        expect(result.current.canRedo).toBe(true);

        // Redo
        act(() => {
            result.current.redo();
        });
        expect(result.current.strokesRef.current.length).toBe(2);
        expect(result.current.canRedo).toBe(false);
    });

    it('should expose flushLiveCanvasSave and scheduleAutosave functions', () => {
        const { result } = renderHook(() => useMathCanvas());
        expect(typeof result.current.flushLiveCanvasSave).toBe('function');
        expect(typeof result.current.scheduleAutosave).toBe('function');
    });
});
