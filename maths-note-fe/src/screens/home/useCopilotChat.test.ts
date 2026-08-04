import { renderHook, act } from '@testing-library/react';
import { useCopilotChat } from './useCopilotChat';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useCopilotChat', () => {
    const mockReader = {
        read: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn().mockImplementation(() => {
            return Promise.resolve({
                ok: true,
                body: {
                    getReader: () => mockReader,
                },
            } as any);
        });
    });

    it('should initialize with default states', () => {
        const { result } = renderHook(() => useCopilotChat({}, []));
        expect(result.current.isCopilotOpen).toBe(false);
        expect(result.current.copilotMessages.length).toBe(1);
        expect(result.current.copilotMessages[0].role).toBe('ai');
        expect(result.current.copilotInput).toBe('');
        expect(result.current.isCopilotLoading).toBe(false);
        expect(result.current.isCopilotStreaming).toBe(false);
    });

    it('should succeed on copilot API call', async () => {
        const chunks = [
            { done: false, value: new TextEncoder().encode('data: {"token": "Hello"}\n') },
            { done: false, value: new TextEncoder().encode('data: {"token": "! I am your AI assistant."}\n') },
            { done: true, value: undefined }
        ];
        let callCount = 0;
        mockReader.read.mockImplementation(() => {
            return Promise.resolve(chunks[callCount++]);
        });

        const { result } = renderHook(() => useCopilotChat({}, []));

        act(() => {
            result.current.setCopilotInput('Hi Vector');
        });

        await act(async () => {
            await result.current.sendCopilotMessage();
        });

        expect(result.current.isCopilotLoading).toBe(false);
        expect(result.current.isCopilotStreaming).toBe(false);
        expect(result.current.copilotMessages.length).toBe(3);
        expect(result.current.copilotMessages[1]).toEqual({ role: 'user', text: 'Hi Vector' });
        expect(result.current.copilotMessages[2]).toEqual({ role: 'ai', text: 'Hello! I am your AI assistant.' });
    });

    it('should show error response on copilot API failure', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Internal Server Error'));

        const { result } = renderHook(() => useCopilotChat({}, []));

        act(() => {
            result.current.setCopilotInput('Hi Vector');
        });

        await act(async () => {
            await result.current.sendCopilotMessage();
        });

        expect(result.current.isCopilotLoading).toBe(false);
        expect(result.current.isCopilotStreaming).toBe(false);
        expect(result.current.copilotMessages.length).toBe(3);
        expect(result.current.copilotMessages[2].text).toContain('Internal Server Error');
    });

    it('should map grouped results correctly in copilot API payload', async () => {
        const chunks = [
            { done: true, value: undefined }
        ];
        mockReader.read.mockResolvedValue(chunks[0]);

        const mockResults = [
            {
                id: 'abc-123',
                solutions: [
                    { expression: 'x', answer: '3', type: 'math' },
                    { expression: 'x', answer: '-3', type: 'math' }
                ],
                thought_process: 'Solve x^2 = 9',
                confidence_score: 99,
                latency: 200
            }
        ];

        const { result } = renderHook(() => useCopilotChat({ x: '3' }, mockResults));

        act(() => {
            result.current.setCopilotInput('Analyze the result');
        });

        await act(async () => {
            await result.current.sendCopilotMessage();
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                method: 'POST',
                body: expect.any(String)
            })
        );

        const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
        expect(requestBody.results).toEqual([
            { expression: 'x', answer: '3', thought_process: 'Solve x^2 = 9' },
            { expression: 'x', answer: '-3', thought_process: 'Solve x^2 = 9' }
        ]);
    });
});
