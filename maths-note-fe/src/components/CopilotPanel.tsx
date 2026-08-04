import { useEffect, useRef } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface CopilotMessage {
    role: 'user' | 'ai';
    text: string;
}

interface CopilotPanelProps {
    copilotMessages: CopilotMessage[];
    copilotInput: string;
    setCopilotInput: (val: string) => void;
    isCopilotStreaming: boolean;
    isCopilotLoading: boolean;
    sendCopilotMessage: () => void;
    onClose?: () => void;
}

export function CopilotPanel(props: CopilotPanelProps) {
    return (
        <div className="absolute bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-50 w-auto sm:w-[360px] h-[480px] sm:h-[520px] flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/95 dark:bg-[#18181c]/95 backdrop-blur-md">
            <ErrorBoundary name="AI Copilot" onReset={props.onClose}>
                <CopilotPanelInner {...props} />
            </ErrorBoundary>
        </div>
    );
}

function CopilotPanelInner({
    copilotMessages,
    copilotInput,
    setCopilotInput,
    isCopilotStreaming,
    isCopilotLoading,
    sendCopilotMessage
}: CopilotPanelProps) {
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [copilotMessages, isCopilotLoading]);

    return (
        <>
            <div className="flex-1 overflow-y-auto px-5 pb-5 pt-8 flex flex-col gap-4 scrollbar-thin">
                {copilotMessages.map((msg, i) => {
                    if (i === 0) {
                        return (
                            <div key={i} className="flex flex-col items-center py-4 select-none">
                                <div className="relative w-24 h-24 mb-3 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-yellow-400 opacity-40 blur-xl animate-pulse" />
                                    <div className="relative w-18 h-18 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-yellow-400 shadow-lg shadow-orange-500/25 flex items-center justify-center overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-45" />
                                    </div>
                                </div>
                                <p className="text-stone-900 dark:text-stone-100 font-extrabold text-lg sm:text-xl tracking-tight mb-2">Vector</p>
                                <p className="text-center text-stone-600 dark:text-stone-400 text-sm leading-relaxed font-medium px-4">
                                    {msg.text}
                                </p>
                            </div>
                        );
                    }

                    return (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                msg.role === 'user'
                                    ? 'bg-stone-900 dark:bg-stone-200 text-white dark:text-stone-950 rounded-br-sm'
                                    : 'bg-stone-100 dark:bg-stone-800/80 border border-stone-200/50 dark:border-stone-800/50 text-stone-800 dark:text-stone-200 rounded-bl-sm'
                            }`}>
                                {msg.text}
                                {msg.role === 'ai' && i === copilotMessages.length - 1 && isCopilotStreaming && (
                                    <span className="inline-block w-1.5 h-4 bg-amber-500 ml-0.5 animate-pulse align-middle" />
                                )}
                            </div>
                        </div>
                    );
                })}
                {isCopilotLoading && (
                    <div className="flex justify-start animate-fade-in">
                        <div className="bg-stone-100 dark:bg-stone-85/80 border border-stone-200/50 dark:border-stone-800/50 px-4 py-2.5 rounded-2xl rounded-bl-sm flex gap-1.5 items-center shadow-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            <div className="px-4 pb-4 pt-2 bg-white dark:bg-[#18181c]">
                <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-900/50 border border-stone-200/60 dark:border-stone-800/60 rounded-2xl px-4 py-2.5 focus-within:border-stone-400 dark:focus-within:border-stone-600 focus-within:ring-2 focus-within:ring-stone-105 dark:focus-within:ring-stone-950 transition-all shadow-sm">
                    <input
                        type="text"
                        value={copilotInput}
                        onChange={(e) => setCopilotInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                sendCopilotMessage();
                            }
                        }}
                        placeholder="Ask about your canvas..."
                        className="flex-1 bg-transparent text-sm text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 outline-none font-sans"
                    />
                    <button
                        onClick={sendCopilotMessage}
                        disabled={isCopilotLoading || !copilotInput.trim()}
                        className="w-8 h-8 rounded-full bg-stone-950 dark:bg-stone-200 hover:bg-stone-800 dark:hover:bg-stone-300 text-white dark:text-stone-950 flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
                    >
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                            <line x1="12" y1="19" x2="12" y2="5"></line>
                            <polyline points="5 12 12 5 19 12"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
        </>
    );
}
