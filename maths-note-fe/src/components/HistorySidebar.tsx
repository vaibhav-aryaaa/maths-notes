import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { DictOfVars } from '@/types';
import type { HistoryEntry } from '@/hooks/useSolveHistory';

interface HistorySidebarProps {
    isOpen: boolean;
    onClose: () => void;
    dictOfVars: DictOfVars;
    history: HistoryEntry[];
    onSelectEntry: (entry: HistoryEntry) => void;
    onClearHistory: () => void;
    onDeleteEntry: (id: string) => void;
}

export function HistorySidebar({
    isOpen,
    onClose,
    dictOfVars,
    history,
    onSelectEntry,
    onClearHistory,
    onDeleteEntry
}: HistorySidebarProps) {
    const [confirmClear, setConfirmClear] = useState(false);

    return (
        <>
            {/* Backdrop for mobile */}
            {isOpen && (
                <div 
                    className="absolute inset-0 bg-black/60 z-30 lg:hidden pointer-events-auto"
                    onClick={onClose}
                />
            )}

            {/* Sidebar main panel */}
            <div className={`absolute top-0 left-0 w-72 h-full bg-black/90 backdrop-blur-md border-r border-white/10 p-5 z-40 text-white shadow-2xl transition-transform duration-300 ease-in-out pt-[calc(1.25rem+env(safe-area-inset-top))] pl-[calc(1.25rem+env(safe-area-inset-left))] flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                
                {/* Close button for mobile */}
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white lg:hidden cursor-pointer p-1"
                >
                    <X size={18} />
                </button>

                {/* Logo Branding */}
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10 shrink-0">
                    <span className="text-xl font-extrabold tracking-tight font-sans">
                        solve<span className="text-[#d97706]">IQ</span>
                    </span>
                </div>

                <div className="flex-1 flex flex-col gap-5 overflow-hidden min-h-0">
                    {/* Variable memory panel */}
                    <div className="shrink-0 flex flex-col max-h-[30%] min-h-[100px] overflow-hidden">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-white/10 pb-1 mb-2 font-sans shrink-0">
                            Agent Memory
                        </h3>
                        {Object.keys(dictOfVars).length === 0 ? (
                            <p className="text-gray-500 text-[11px] leading-relaxed font-sans pr-1">
                                No active variables. Draw e.g. "x = 5" to assign a variable.
                            </p>
                        ) : (
                            <div className="flex-col gap-2 overflow-y-auto pr-1 flex scrollbar-thin">
                                {Object.entries(dictOfVars).map(([key, value]) => (
                                    <div key={key} className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/10 shadow-inner py-1.5">
                                        <span className="text-sm font-mono text-purple-400 font-bold">{key}</span>
                                        <span className="text-sm font-mono text-green-400 font-bold">= {value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Solve history panel */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-white/10 pb-1 mb-2 font-sans shrink-0">
                            Solve History
                        </h3>
                        {history.length === 0 ? (
                            <p className="text-gray-500 text-[11px] leading-relaxed font-sans">
                                Solve expressions on the canvas to build history.
                            </p>
                        ) : (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1 scrollbar-thin min-h-0">
                                    {history.map((entry) => {
                                        // Generate visual solve summaries
                                        const summary = entry.results[0]?.solutions?.[0]?.expression
                                            ? `${entry.results[0].solutions[0].expression} = ${entry.results[0].solutions[0].answer}`
                                            : entry.results[0]?.solutions?.[0]
                                            ? entry.results[0].solutions.map(s => `${s.expression}=${s.answer}`).join(', ')
                                            : 'Solved Canvas';

                                        const dateStr = new Date(entry.timestamp).toLocaleTimeString([], { 
                                            hour: '2-digit', 
                                            minute: '2-digit' 
                                        });

                                        return (
                                            <div 
                                                key={entry.id}
                                                onClick={() => onSelectEntry(entry)}
                                                className="cursor-pointer group flex gap-2.5 items-center bg-white/5 border border-white/10 hover:border-white/20 p-2 rounded-xl transition-all shadow hover:bg-white/[0.08]"
                                            >
                                                <div className="w-14 h-10 bg-black rounded-lg overflow-hidden border border-white/15 flex-shrink-0 flex items-center justify-center">
                                                    {entry.canvasThumbnail ? (
                                                        <img 
                                                            src={entry.canvasThumbnail} 
                                                            alt="Solve thumbnail"
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                        />
                                                    ) : (
                                                        <span className="text-[9px] text-gray-600 font-sans">Empty</span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                    <span className="text-xs text-gray-200 font-bold truncate font-sans">
                                                        {summary}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500 font-sans">
                                                        {dateStr}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteEntry(entry.id);
                                                    }}
                                                    className="cursor-pointer text-gray-500 hover:text-red-400 p-1 rounded transition-colors shrink-0"
                                                    title="Delete solve entry"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Confirm delete footer */}
                                <div className="shrink-0 mt-2">
                                    {confirmClear ? (
                                        <div className="flex gap-2 items-center bg-red-950/20 border border-red-500/20 p-2 rounded-xl animate-in fade-in zoom-in-95">
                                            <span className="text-[10px] text-red-400 font-bold font-sans">Clear all history?</span>
                                            <button
                                                onClick={() => {
                                                    onClearHistory();
                                                    setConfirmClear(false);
                                                }}
                                                className="cursor-pointer text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded"
                                            >
                                                Yes
                                            </button>
                                            <button
                                                onClick={() => setConfirmClear(false)}
                                                className="cursor-pointer text-[10px] font-bold bg-white/10 hover:bg-white/15 text-gray-300 px-2 py-1 rounded"
                                            >
                                                No
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmClear(true)}
                                            className="cursor-pointer w-full text-[11px] font-bold text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 py-1.5 rounded-xl transition-all font-sans flex items-center justify-center gap-1.5"
                                        >
                                            Clear History
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
