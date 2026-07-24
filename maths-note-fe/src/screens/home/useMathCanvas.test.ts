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
});
