import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import type { GeneratedResult, DictOfVars } from '@/types';

export const useCopilotChat = (dictOfVars: DictOfVars, results: GeneratedResult[]) => {
    const [isCopilotOpen, setIsCopilotOpen] = useState(false);
    const [copilotMessages, setCopilotMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
        { role: 'ai', text: "Ready to bend the rules of math? Draw your equations on the canvas, hit Run, and let's dissect the universe together. No problem is too wild!" }
    ]);
    const [copilotInput, setCopilotInput] = useState('');
    const [isCopilotLoading, setIsCopilotLoading] = useState(false);
    
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

    const sendCopilotMessage = useCallback(async () => {
        const text = copilotInput.trim();
        if (!text || isCopilotLoading) return;

        setCopilotMessages(prev => [...prev, { role: 'user', text }]);
        setCopilotInput('');
        setIsCopilotLoading(true);

        try {
            const res = await axios.post(
                `${import.meta.env.VITE_API_URL}/copilot`,
                {
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
                },
                {
                    headers: {
                        'X-App-Key': import.meta.env.VITE_APP_KEY || '',
                    },
                }
            );
            setCopilotMessages(prev => [...prev, { role: 'ai', text: res.data.reply }]);
        } catch (err: unknown) {
            let errorMsg = 'Sorry, I ran into an error. Please try again.';
            if (axios.isAxiosError(err)) {
                errorMsg = err.response?.data?.detail || err.message || errorMsg;
            } else if (err instanceof Error) {
                errorMsg = err.message;
            }
            setCopilotMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${errorMsg}` }]);
        } finally {
            setIsCopilotLoading(false);
        }
    }, [copilotInput, isCopilotLoading, dictOfVars, results]);

    return {
        isCopilotOpen,
        setIsCopilotOpen,
        copilotMessages,
        copilotInput,
        setCopilotInput,
        isCopilotLoading,
        sendCopilotMessage,
    };
};
