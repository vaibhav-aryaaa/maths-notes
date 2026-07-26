import { renderHook, act } from '@testing-library/react';
import { useCanvasSolver } from './useCanvasSolver';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn()
    }
}));

describe('useCanvasSolver', () => {
    let canvasRef: React.RefObject<HTMLCanvasElement | null>;
    let masterCanvasRef: React.RefObject<HTMLCanvasElement | null>;
    let drawBoundsRef: React.RefObject<{ minX: number; minY: number; maxX: number; maxY: number }>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock canvas DOM element
        const mockContext = {
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage: vi.fn(),
            clearRect: vi.fn(),
        };

        canvasRef = {
            current: {
                width: 800,
                height: 600,
                getContext: vi.fn().mockReturnValue(mockContext),
            } as unknown as HTMLCanvasElement
        };

        masterCanvasRef = {
            current: {
                width: 6000,
                height: 6000,
                getContext: vi.fn().mockReturnValue(mockContext),
            } as unknown as HTMLCanvasElement
        };

        drawBoundsRef = {
            current: { minX: 100, minY: 150, maxX: 300, maxY: 350 }
        };
    });

    it('should initialize with default states', () => {
        const { result } = renderHook(() => useCanvasSolver(canvasRef, masterCanvasRef, drawBoundsRef));
        expect(result.current.dictOfVars).toEqual({});
        expect(result.current.results).toEqual([]);
        expect(result.current.isScanning).toBe(false);
    });

    it('should succeed on calculate API call', async () => {
        const mockResponse = {
            data: {
                status: 'success',
                data: [
                    { expr: 'x', result: '5', assign: true, type: 'math', thought_process: 'Solves x = 5', confidence_score: 95, latency: 120 }
                ]
            }
        };
        vi.mocked(axios).mockResolvedValue(mockResponse);

        // Mock document.createElement for canvas crop drawing
        const mockTempCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({
                fillStyle: '',
                fillRect: vi.fn(),
                drawImage: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mocked_image_bytes'),
        };
        const origCreateElement = document.createElement;
        document.createElement = vi.fn().mockImplementation((tag) => {
            if (tag === 'canvas') return mockTempCanvas;
            return origCreateElement.call(document, tag);
        });

        const { result } = renderHook(() => useCanvasSolver(canvasRef, masterCanvasRef, drawBoundsRef));

        await act(async () => {
            await result.current.runRoute();
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.dictOfVars).toEqual({ x: '5' });
        expect(result.current.results.length).toBe(1);
        expect(result.current.results[0]).toEqual({
            id: expect.any(String),
            solutions: [
                { expression: 'x', answer: '5', type: 'math' }
            ],
            thought_process: 'Solves x = 5',
            confidence_score: 95,
            latency: 120,
            bounds: { minX: 100, minY: 150, maxX: 300, maxY: 350 },
            steps: undefined
        });

        // Restore createElement
        document.createElement = origCreateElement;
    });

    it('should show toast alert on calculation failure', async () => {
        vi.mocked(axios).mockRejectedValue(new Error('Network Error'));

        // Mock document.createElement for canvas crop drawing
        const mockTempCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({
                fillStyle: '',
                fillRect: vi.fn(),
                drawImage: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mocked_image_bytes'),
        };
        const origCreateElement = document.createElement;
        document.createElement = vi.fn().mockImplementation((tag) => {
            if (tag === 'canvas') return mockTempCanvas;
            return origCreateElement.call(document, tag);
        });

        const { result } = renderHook(() => useCanvasSolver(canvasRef, masterCanvasRef, drawBoundsRef));

        await act(async () => {
            await result.current.runRoute();
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.results).toEqual([]);

        // Restore createElement
        document.createElement = origCreateElement;
    });
});
