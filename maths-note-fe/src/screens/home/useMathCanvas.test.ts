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

    it('should copy, paste, and duplicate selected elements correctly with offset and single undo', () => {
        const { result } = renderHook(() => useMathCanvas());

        const mockCanvas = document.createElement('canvas');
        mockCanvas.getContext = (() => ({
            clearRect: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            setTransform: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            setLineDash: () => {},
            save: () => {},
            restore: () => {},
            drawImage: () => {},
            scale: () => {},
            translate: () => {},
            closePath: () => {},
            fill: () => {},
            arc: () => {},
            rect: () => {},
        } as unknown as CanvasRenderingContext2D)) as any;

        Object.defineProperty(result.current.canvasRef, 'current', {
            value: mockCanvas,
            writable: true
        });

        // Set up initial strokes
        act(() => {
            result.current.drawStrokes([
                [{ x: 10, y: 10 }, { x: 20, y: 20 }],
                [{ x: 50, y: 50 }, { x: 60, y: 60 }]
            ]);
        });

        expect(result.current.elementsRef.current.length).toBe(2);
        const originalId1 = result.current.elementsRef.current[0].id;
        const originalId2 = result.current.elementsRef.current[1].id;

        // In pen mode, copy should do nothing
        act(() => {
            result.current.setSelectedElementIds([originalId1]);
            result.current.copySelectedElements();
        });

        // Switch to select tool
        act(() => {
            result.current.setActiveTool('select');
        });

        // Copy first stroke
        act(() => {
            result.current.setSelectedElementIds([originalId1]);
            result.current.copySelectedElements();
        });

        // Paste stroke
        act(() => {
            result.current.pasteElements(20);
        });

        // Elements count should now be 3
        expect(result.current.elementsRef.current.length).toBe(3);
        const originalElement1 = result.current.elementsRef.current[0];
        const pastedElement = result.current.elementsRef.current[2];
        expect(pastedElement.id).not.toBe(originalId1);
        if (pastedElement.kind === undefined || pastedElement.kind === 'stroke') {
            const origX = (originalElement1 as any).points[0].x;
            const origY = (originalElement1 as any).points[0].y;
            expect(pastedElement.points[0].x).toBe(origX + 20);
            expect(pastedElement.points[0].y).toBe(origY + 20);
        }
        // Newly pasted element should be selected
        expect(result.current.selectedElementIds).toEqual([pastedElement.id]);

        // Duplicate the newly pasted element in one step
        act(() => {
            result.current.duplicateSelectedElements(20);
        });

        // Elements count should now be 4
        expect(result.current.elementsRef.current.length).toBe(4);
        const duplicatedElement = result.current.elementsRef.current[3];
        expect(duplicatedElement.id).not.toBe(pastedElement.id);
        if (duplicatedElement.kind === undefined || duplicatedElement.kind === 'stroke') {
            const pastedX = (pastedElement as any).points[0].x;
            const pastedY = (pastedElement as any).points[0].y;
            expect(duplicatedElement.points[0].x).toBe(pastedX + 20);
            expect(duplicatedElement.points[0].y).toBe(pastedY + 20);
        }
        // Duplicated element should be selected
        expect(result.current.selectedElementIds).toEqual([duplicatedElement.id]);

        // Copy and paste multiple elements at once (multi-selection)
        act(() => {
            result.current.setSelectedElementIds([originalId1, originalId2]);
        });

        act(() => {
            result.current.copySelectedElements();
        });

        act(() => {
            result.current.pasteElements(20);
        });

        // 4 + 2 = 6 elements
        expect(result.current.elementsRef.current.length).toBe(6);
        expect(result.current.selectedElementIds.length).toBe(2);

        // Undo should remove both pasted elements in a SINGLE step
        act(() => {
            result.current.undo();
        });
        expect(result.current.elementsRef.current.length).toBe(4);
    });

    it('should correctly erase strokes on pointer drag with eraser tool', () => {
        const { result } = renderHook(() => useMathCanvas());

        const mockCanvas = document.createElement('canvas');
        mockCanvas.getContext = (() => ({
            clearRect: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            setTransform: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            setLineDash: () => {},
            save: () => {},
            restore: () => {},
            drawImage: () => {},
            scale: () => {},
            translate: () => {},
            closePath: () => {},
            fill: () => {},
            arc: () => {},
            rect: () => {},
            quadraticCurveTo: () => {},
        } as unknown as CanvasRenderingContext2D)) as any;

        Object.defineProperty(result.current.canvasRef, 'current', {
            value: mockCanvas,
            writable: true
        });

        // Draw a stroke using pen pointer events
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
        expect(result.current.elementsRef.current.length).toBe(1);

        // Switch to eraser tool
        act(() => {
            result.current.setActiveTool('eraser');
        });

        // Start drawing eraser over the stroke
        act(() => {
            result.current.startDrawing({
                clientX: 105,
                clientY: 105,
                button: 0,
            } as any);
        });

        // Drag eraser
        act(() => {
            result.current.draw({
                clientX: 108,
                clientY: 108,
                buttons: 1,
            } as any);
        });

        // Stop drawing eraser
        act(() => {
            result.current.stopDrawing({
                clientX: 108,
                clientY: 108,
            } as any);
        });

        // Stroke should be erased
        expect(result.current.elementsRef.current.length).toBe(0);
    });
});

