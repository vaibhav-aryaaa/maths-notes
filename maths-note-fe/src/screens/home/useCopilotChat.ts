import { useState, useRef, useCallback, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import type { GeneratedResult, DictOfVars } from '@/types';
import { trackEvent } from '@/lib/analytics';

export const useCopilotChat = (dictOfVars: DictOfVars, results: GeneratedResult[]) => {
    const [isCopilotOpen, setIsCopilotOpen] = useState(false);
    const [copilotMessages, setCopilotMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
        { role: 'ai', text: "Ready to bend the rules of math? Draw your equations on the canvas, hit Run, and let's dissect the universe together. No problem is too wild!" }
    ]);
    const [copilotInput, setCopilotInput] = useState('');
    const [isCopilotLoading, setIsCopilotLoading] = useState(false);
    const [isCopilotStreaming, setIsCopilotStreaming] = useState(false);

    const abortControllerRef = useRef<AbortController | null>(null);
    
    const sessionId = useRef((() => {
        let id = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('solveiq_copilot_session_id') : null;
        if (!id || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id)) {
            id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('solveiq_copilot_session_id', id);
            }
        }
        return id;
    })());

    // Clean up active streams on unmount to handle network disconnects or navigation away
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const sendCopilotMessage = useCallback(async () => {
        const text = copilotInput.trim();
        if (!text || isCopilotLoading || isCopilotStreaming) return;

        trackEvent('copilot_message_sent');

        if (!navigator.onLine) {
            notifications.show({
                title: 'Offline Mode',
                message: "You're offline — AI Copilot chat requires an internet connection.",
                color: 'red',
                autoClose: 5000
            });
            return;
        }

        setCopilotMessages(prev => [...prev, { role: 'user', text }]);
        setCopilotInput('');
        setIsCopilotLoading(true);

        // Cancel previous pending requests
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            // Append placeholder AI message for streaming
            setCopilotMessages(prev => [...prev, { role: 'ai', text: '' }]);

            const response = await fetch(`${import.meta.env.VITE_API_URL}/copilot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Key': import.meta.env.VITE_APP_KEY || '',
                },
                body: JSON.stringify({
                    session_id: sessionId.current,
                    message: text,
                    canvas_image: '',
                    dict_of_vars: dictOfVars,
                    results: results.flatMap(r =>
                        r.solutions.map(sol => ({
                            expression: sol.expression,
                            answer: sol.answer,
                            thought_process: r.thought_process,
                        }))
                    ),
                }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const detail = errorData.detail || `HTTP error! status: ${response.status}`;
                throw new Error(detail);
            }

            setIsCopilotLoading(false);
            setIsCopilotStreaming(true);

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is not readable');
            }

            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine) continue;

                    if (cleanLine.startsWith('data: ')) {
                        const jsonStr = cleanLine.substring(6).trim();
                        if (jsonStr) {
                            try {
                                const parsed = JSON.parse(jsonStr);
                                if (parsed.error) {
                                    throw new Error(parsed.error);
                                }
                                if (parsed.token) {
                                    setCopilotMessages(prev => {
                                        const updated = [...prev];
                                        if (updated.length > 0) {
                                            const last = updated[updated.length - 1];
                                            if (last.role === 'ai') {
                                                updated[updated.length - 1] = {
                                                    ...last,
                                                    text: last.text + parsed.token
                                                };
                                            }
                                        }
                                        return updated;
                                    });
                                }
                            } catch (e) {
                                console.error('Error parsing stream chunk:', e);
                            }
                        }
                    }
                }
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                return;
            }
            console.error('Copilot streaming error:', err);
            
            const isOfflineError = !navigator.onLine || 
                                   err.message?.includes('Failed to fetch') || 
                                   err.message?.includes('Network Error') || 
                                   err.message?.includes('network error');
            
            const errorMsg = isOfflineError 
                ? "You're offline — AI Copilot chat requires an internet connection." 
                : (err.message || 'Sorry, I ran into an error. Please try again.');
            
            setCopilotMessages(prev => {
                const updated = [...prev];
                if (updated.length > 0) {
                    const last = updated[updated.length - 1];
                    if (last.role === 'ai') {
                        updated[updated.length - 1] = {
                            ...last,
                            text: last.text === '' ? `⚠️ ${errorMsg}` : last.text + `\n\n⚠️ ${errorMsg}`
                        };
                    }
                } else {
                    updated.push({ role: 'ai', text: `⚠️ ${errorMsg}` });
                }
                return updated;
            });
        } finally {
            setIsCopilotLoading(false);
            setIsCopilotStreaming(false);
            abortControllerRef.current = null;
        }
    }, [copilotInput, isCopilotLoading, isCopilotStreaming, dictOfVars, results]);

    return {
        isCopilotOpen,
        setIsCopilotOpen,
        copilotMessages,
        copilotInput,
        setCopilotInput,
        isCopilotLoading,
        isCopilotStreaming,
        sendCopilotMessage,
    };
};
