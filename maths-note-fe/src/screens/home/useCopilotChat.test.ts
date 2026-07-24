import { renderHook, act } from '@testing-library/react';
import { useCopilotChat } from './useCopilotChat';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => {
    return {
        default: {
            post: vi.fn(),
            isAxiosError: vi.fn().mockImplementation((err) => !!(err && err.isAxiosError)),
        },
    };
});

describe('useCopilotChat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with default states', () => {
        const { result } = renderHook(() => useCopilotChat({}, []));
        expect(result.current.isCopilotOpen).toBe(false);
        expect(result.current.copilotMessages.length).toBe(1);
        expect(result.current.copilotMessages[0].role).toBe('ai');
        expect(result.current.copilotInput).toBe('');
        expect(result.current.isCopilotLoading).toBe(false);
    });

    it('should succeed on copilot API call', async () => {
        const mockResponse = {
            data: {
                reply: 'Hello! I am your AI assistant.'
            }
        };
        vi.mocked(axios.post).mockResolvedValue(mockResponse);

        const { result } = renderHook(() => useCopilotChat({}, []));

        act(() => {
            result.current.setCopilotInput('Hi Vector');
        });

        await act(async () => {
            await result.current.sendCopilotMessage();
        });

        expect(result.current.isCopilotLoading).toBe(false);
        expect(result.current.copilotMessages.length).toBe(3);
        expect(result.current.copilotMessages[1]).toEqual({ role: 'user', text: 'Hi Vector' });
        expect(result.current.copilotMessages[2]).toEqual({ role: 'ai', text: 'Hello! I am your AI assistant.' });
    });

    it('should show error response on copilot API failure', async () => {
        vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));

        const { result } = renderHook(() => useCopilotChat({}, []));

        act(() => {
            result.current.setCopilotInput('Hi Vector');
        });

        await act(async () => {
            await result.current.sendCopilotMessage();
        });

        expect(result.current.isCopilotLoading).toBe(false);
        expect(result.current.copilotMessages.length).toBe(3);
        expect(result.current.copilotMessages[2].text).toContain('Network Error');
    });
});
