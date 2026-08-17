import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';

interface CopilotMessage {
    role: 'user' | 'ai';
    text: string;
    confidence?: number;
    latency?: number;
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
        <div className="absolute bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-controls w-auto sm:w-[360px] h-[480px] sm:h-[520px] flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-[#18181c]">
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
    sendCopilotMessage,
    onClose
}: CopilotPanelProps) {
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [copilotMessages, isCopilotLoading]);

    return (
        <div className="flex-1 flex flex-col overflow-hidden h-full relative">
            {/* Slim Header Bar - Hidden in welcome state */}
            {copilotMessages.length > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-200 dark:border-white/10 bg-white dark:bg-[#18181c] shrink-0">
                    <div className="flex items-center gap-2 select-none">
                        <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-yellow-400 flex items-center justify-center shadow-md overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-45" />
                        </div>
                        <span className="text-stone-900 dark:text-stone-100 font-extrabold text-sm tracking-tight">Vector</span>
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 rounded-md text-stone-500 hover:text-stone-700 dark:text-gray-400 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            aria-label="Close Copilot Panel"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            )}

            {/* Absolute close button when header bar is hidden (welcome state) */}
            {copilotMessages.length <= 1 && onClose && (
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-full text-stone-500 hover:text-stone-700 dark:text-gray-400 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-white/10 transition-all cursor-pointer z-50 shadow-sm border border-stone-100 dark:border-white/5 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm"
                    aria-label="Close Copilot Panel"
                >
                    <X size={16} />
                </button>
            )}

            {/* Chat Messages / Empty State */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4 flex flex-col gap-4 scrollbar-thin">
                {copilotMessages.length <= 1 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 select-none my-auto">
                        <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-yellow-400 opacity-40 blur-xl animate-pulse" />
                            <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-rose-500 via-orange-500 to-yellow-400 shadow-lg shadow-orange-500/25 flex items-center justify-center overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-45" />
                            </div>
                        </div>
                        <p className="text-stone-900 dark:text-stone-100 font-extrabold text-lg sm:text-xl tracking-tight mb-2">Vector</p>
                        <p className="text-center text-stone-600 dark:text-gray-400 text-sm leading-relaxed font-medium px-6 max-w-[280px]">
                            {copilotMessages[0]?.text || "Hi! I'm Vector, your AI workspace assistant. Ask me anything about your math notes or equations!"}
                        </p>
                    </div>
                ) : (
                    copilotMessages.slice(1).map((msg, i) => {
                        const actualIdx = i + 1;
                        return (
                            <div key={actualIdx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}>
                                <div className={`max-w-[85%] px-4 py-2.5 rounded-3xl text-sm leading-relaxed shadow-sm ${
                                    msg.role === 'user'
                                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-tr-none'
                                        : 'bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-850 dark:text-stone-100 rounded-tl-none'
                                }`}>
                                    <div className="whitespace-pre-wrap">
                                        {msg.text}
                                        {msg.role === 'ai' && actualIdx === copilotMessages.length - 1 && isCopilotStreaming && (
                                            <span className="inline-block w-1.5 h-4 bg-stone-900 dark:bg-white ml-0.5 animate-pulse align-middle" />
                                        )}
                                    </div>
                                    
                                    {msg.role === 'ai' && (msg.confidence !== undefined || msg.latency !== undefined) && (
                                        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-stone-200/50 dark:border-stone-800 text-[10px] text-stone-500 dark:text-stone-400 font-sans font-semibold select-none">
                                            {msg.confidence !== undefined && (
                                                <span>{msg.confidence}% Confident</span>
                                            )}
                                            {msg.latency !== undefined && (
                                                <span>{msg.confidence !== undefined ? '• ' : ''}{msg.latency}ms</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
                {isCopilotLoading && (
                    <div className="flex justify-start animate-fade-in">
                        <div className="bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-4 py-2.5 rounded-3xl rounded-tl-none flex gap-1.5 items-center shadow-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="px-4 pb-4 pt-2 bg-white dark:bg-[#18181c]">
                <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-900/50 border border-stone-200/60 dark:border-stone-800/60 rounded-2xl px-4 py-2.5 focus-within:border-stone-400 dark:focus-within:border-stone-600 focus-within:ring-2 focus-within:ring-stone-100 dark:focus-within:ring-stone-950 transition-all shadow-sm">
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
                        aria-label="Ask a question about the canvas workspace"
                    />
                    <button
                        onClick={sendCopilotMessage}
                        disabled={isCopilotLoading || !copilotInput.trim()}
                        className="w-8 h-8 rounded-full bg-stone-950 dark:bg-stone-200 hover:bg-stone-800 dark:hover:bg-stone-300 text-white dark:text-stone-950 flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
                        aria-label="Send message to AI Copilot"
                    >
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-white dark:text-stone-950">
                            <line x1="12" y1="19" x2="12" y2="5"></line>
                            <polyline points="5 12 12 5 19 12"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
