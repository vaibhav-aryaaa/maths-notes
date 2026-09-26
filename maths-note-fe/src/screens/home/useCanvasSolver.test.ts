import { renderHook, act } from '@testing-library/react';
import { useCanvasSolver } from './useCanvasSolver';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { CanvasElement } from '@/types';

vi.mock('axios');
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn()
    }
}));

describe('useCanvasSolver', () => {
    let canvasRef: React.RefObject<HTMLCanvasElement | null>;
    let strokesRef: React.RefObject<CanvasElement[]>;
    let drawBoundsRef: React.RefObject<{ minX: number; minY: number; maxX: number; maxY: number }>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock canvas DOM element
        const mockContext = {
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage: vi.fn(),
            clearRect: vi.fn(),
            scale: vi.fn(),
            translate: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            rect: vi.fn(),
            closePath: vi.fn(),
            fill: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        };

        canvasRef = {
            current: {
                width: 800,
                height: 600,
                getContext: vi.fn().mockReturnValue(mockContext),
            } as unknown as HTMLCanvasElement
        };

        strokesRef = {
            current: [
                {
                    kind: 'stroke',
                    id: '1',
                    tool: 'pen',
                    color: 'white',
                    width: 3,
                    points: [{ x: 100, y: 150, timestamp: 0 }, { x: 300, y: 350, timestamp: 0 }]
                }
            ]
        };

        drawBoundsRef = {
            current: { minX: 100, minY: 150, maxX: 300, maxY: 350 }
        };
    });

    it('should initialize with default states', () => {
        const { result } = renderHook(() => useCanvasSolver(canvasRef, strokesRef, drawBoundsRef));
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
                scale: vi.fn(),
                translate: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                rect: vi.fn(),
                closePath: vi.fn(),
                fill: vi.fn(),
                save: vi.fn(),
                restore: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mocked_image_bytes'),
        };
        const origCreateElement = document.createElement;
        document.createElement = vi.fn().mockImplementation((tag) => {
            if (tag === 'canvas') return mockTempCanvas;
            return origCreateElement.call(document, tag);
        });

        const { result } = renderHook(() => useCanvasSolver(canvasRef, strokesRef, drawBoundsRef));

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
            isSelection: false,
            steps: undefined,
            image: expect.any(String),
            dictOfVars: expect.any(Object)
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
                scale: vi.fn(),
                translate: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                rect: vi.fn(),
                closePath: vi.fn(),
                fill: vi.fn(),
                save: vi.fn(),
                restore: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mocked_image_bytes'),
        };
        const origCreateElement = document.createElement;
        document.createElement = vi.fn().mockImplementation((tag) => {
            if (tag === 'canvas') return mockTempCanvas;
            return origCreateElement.call(document, tag);
        });

        const { result } = renderHook(() => useCanvasSolver(canvasRef, strokesRef, drawBoundsRef));

        await act(async () => {
            await result.current.runRoute();
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.results).toEqual([]);

        // Restore createElement
        document.createElement = origCreateElement;
    });

    it('should increment guest solve count on successful guest solve', async () => {
        sessionStorage.clear();
        const mockResponse = {
            data: {
                status: 'success',
                data: [
                    { expr: 'y', result: '10', assign: true, type: 'math' }
                ]
            }
        };
        vi.mocked(axios).mockResolvedValue(mockResponse);

        const mockTempCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({
                fillStyle: '',
                fillRect: vi.fn(),
                drawImage: vi.fn(),
                scale: vi.fn(),
                translate: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                rect: vi.fn(),
                closePath: vi.fn(),
                fill: vi.fn(),
                save: vi.fn(),
                restore: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mocked_image_bytes'),
        };
        const origCreateElement = document.createElement;
        document.createElement = vi.fn().mockImplementation((tag) => {
            if (tag === 'canvas') return mockTempCanvas;
            return origCreateElement.call(document, tag);
        });

        const { result } = renderHook(() => useCanvasSolver(
            canvasRef,
            strokesRef,
            drawBoundsRef,
            undefined,
            undefined,
            true // isGuest
        ));

        await act(async () => {
            await result.current.runRoute();
        });

        expect(sessionStorage.getItem('guest_solve_count')).toBe('1');
        document.createElement = origCreateElement;
    });

    it('should block API call and invoke onGuestLimitReached when guest reaches 5 solves', async () => {
        sessionStorage.setItem('guest_solve_count', '5');
        const onLimitReached = vi.fn();

        const { result } = renderHook(() => useCanvasSolver(
            canvasRef,
            strokesRef,
            drawBoundsRef,
            undefined,
            undefined,
            true, // isGuest
            onLimitReached
        ));

        await act(async () => {
            await result.current.runRoute();
        });

        expect(axios).not.toHaveBeenCalled();
        expect(onLimitReached).toHaveBeenCalledTimes(1);
    });

    it('should pass only the single newResult to onSaveHistory while updating cumulative live results', async () => {
        const onSaveHistory = vi.fn();
        const mockResponse1 = {
            data: {
                status: 'success',
                data: [{ expr: 'x + 1', result: '3', assign: false, type: 'math' }]
            }
        };
        const mockResponse2 = {
            data: {
                status: 'success',
                data: [{ expr: 'y * 2', result: '10', assign: false, type: 'math' }]
            }
        };

        const mockTempCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({
                fillStyle: '',
                fillRect: vi.fn(),
                drawImage: vi.fn(),
                scale: vi.fn(),
                translate: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                rect: vi.fn(),
                closePath: vi.fn(),
                fill: vi.fn(),
                save: vi.fn(),
                restore: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mocked_image_bytes'),
        };
        const origCreateElement = document.createElement;
        document.createElement = vi.fn().mockImplementation((tag) => {
            if (tag === 'canvas') return mockTempCanvas;
            return origCreateElement.call(document, tag);
        });

        const { result } = renderHook(() => useCanvasSolver(
            canvasRef,
            strokesRef,
            drawBoundsRef,
            onSaveHistory
        ));

        // First solve
        vi.mocked(axios).mockResolvedValueOnce(mockResponse1);
        await act(async () => {
            await result.current.runRoute();
        });

        expect(result.current.results.length).toBe(1);
        expect(onSaveHistory).toHaveBeenCalledTimes(1);
        expect(onSaveHistory.mock.calls[0][1]).toHaveLength(1);
        expect(onSaveHistory.mock.calls[0][1][0].solutions[0].expression).toBe('x + 1');

        // Second solve
        vi.mocked(axios).mockResolvedValueOnce(mockResponse2);
        await act(async () => {
            await result.current.runRoute();
        });

        // Cumulative live results has 2 items
        expect(result.current.results.length).toBe(2);
        // onSaveHistory called second time with ONLY the 2nd single result
        expect(onSaveHistory).toHaveBeenCalledTimes(2);
        expect(onSaveHistory.mock.calls[1][1]).toHaveLength(1);
        expect(onSaveHistory.mock.calls[1][1][0].solutions[0].expression).toBe('y * 2');

        document.createElement = origCreateElement;
    });
});
