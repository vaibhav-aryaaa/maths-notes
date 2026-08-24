import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { DictOfVars } from '@/types';
import type { HistoryEntry } from '@/hooks/useSolveHistory';
import { ErrorBoundary } from './ErrorBoundary';

interface HistorySidebarProps {
    isOpen: boolean;
    onClose: () => void;
    dictOfVars: DictOfVars;
    history: HistoryEntry[];
    onSelectEntry: (entry: HistoryEntry) => void;
    onClearHistory: () => void;
    onDeleteEntry: (id: string) => void;
    getHistoryEntryImage: (id: string) => Promise<string>;
}

export function HistorySidebar(props: HistorySidebarProps) {
    return (
        <div className={`absolute top-[calc(4.5rem+env(safe-area-inset-top))] left-[calc(1.25rem+env(safe-area-inset-left))] w-80 max-h-[calc(100vh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] bg-white/95 dark:bg-[#1c1c1f]/95 border border-stone-200/85 dark:border-stone-850 p-4 z-sidebar text-stone-800 dark:text-white shadow-2xl backdrop-blur-md rounded-2xl flex flex-col transition-all duration-300 origin-top-left ${props.isOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <ErrorBoundary name="History Sidebar" onReset={props.onClose}>
                <HistorySidebarInner {...props} />
            </ErrorBoundary>
        </div>
    );
}

function HistorySidebarInner({
    dictOfVars,
    history,
    onSelectEntry,
    onClearHistory,
    onDeleteEntry,
    getHistoryEntryImage
}: Omit<HistorySidebarProps, 'isOpen' | 'onClose'>) {
    const [confirmClear, setConfirmClear] = useState(false);

    return (
        <>
            {/* Logo Branding */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-stone-200 dark:border-white/10 shrink-0 h-10 select-none">
                <span className="text-xl font-extrabold tracking-tight font-sans">
                    solve<span className="text-stone-900 dark:text-white">IQ</span>
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-900/50 px-2 py-0.5 rounded-md border border-stone-200/50 dark:border-stone-800/40">
                    History
                </span>
            </div>

            <div className="flex-1 flex flex-col gap-5 overflow-hidden min-h-0">
                {/* Variable memory panel */}
                <div className="shrink-0 flex flex-col max-h-[30%] min-h-[100px] overflow-hidden">
                    <h3 className="text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider mb-2 shrink-0">Variable Memory</h3>
                    <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
                        {Object.keys(dictOfVars).length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 align-content-start py-0.5">
                                {Object.entries(dictOfVars).map(([name, value]) => (
                                    <div key={name} className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-2.5 py-1 rounded-lg text-xs">
                                        <span className="font-mono font-bold text-stone-750 dark:text-stone-300">{name}</span>
                                        <span className="text-stone-500 dark:text-stone-400">=</span>
                                        <span className="font-mono text-stone-800 dark:text-stone-200">{value}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-stone-600 dark:text-stone-400 italic py-1">No active variables. Draw &quot;x = 5&quot; to assign.</p>
                        )}
                    </div>
                </div>

                {/* History list panel */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden border-t border-stone-200 dark:border-white/10 pt-4">
                    <h3 className="text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider mb-2 shrink-0">Solve History</h3>
                    <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-thin">
                        {history.length > 0 ? (
                            history.map((entry) => (
                                <div 
                                    key={entry.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={async () => {
                                        const fullEntry = { ...entry };
                                        if (!entry.strokes && !entry.canvasImage) {
                                            fullEntry.canvasImage = await getHistoryEntryImage(entry.id);
                                        }
                                        onSelectEntry(fullEntry);
                                    }}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            const fullEntry = { ...entry };
                                            if (!entry.strokes && !entry.canvasImage) {
                                                fullEntry.canvasImage = await getHistoryEntryImage(entry.id);
                                            }
                                            onSelectEntry(fullEntry);
                                        }
                                    }}
                                    aria-label={`Load history entry: ${entry.results[0]?.solutions[0]?.expression || 'Equation'} = ${entry.results[0]?.solutions[0]?.answer || '?'}`}
                                    className="group relative flex items-center gap-3 bg-stone-50 dark:bg-stone-900/40 hover:bg-stone-100 dark:hover:bg-stone-900 border border-stone-200/50 dark:border-stone-800/40 hover:border-stone-300 dark:hover:border-stone-700 p-2 rounded-xl cursor-pointer transition-all shrink-0"
                                >
                                    <div className="w-12 h-12 bg-white dark:bg-black rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800 flex items-center justify-center shrink-0">
                                        {entry.canvasThumbnail ? (
                                            <img src={entry.canvasThumbnail} alt="Thumbnail" className="w-full h-full object-contain" />
                                        ) : (
                                            <div className="w-full h-full bg-stone-100 dark:bg-stone-900" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 pr-6">
                                        <p className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate">
                                            {entry.results[0]?.solutions[0]?.expression || 'Equation'}
                                        </p>
                                        <p className="text-[10px] text-stone-600 dark:text-stone-400 font-mono mt-0.5 truncate">
                                            = {entry.results[0]?.solutions[0]?.answer || '?'}
                                        </p>
                                    </div>
                                    
                                    {/* Inline Delete Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteEntry(entry.id);
                                        }}
                                        className="absolute right-2 opacity-30 group-hover:opacity-100 transition-opacity p-1 text-stone-400 hover:text-red-500 dark:text-stone-600 dark:hover:text-red-400 cursor-pointer"
                                        title="Delete Entry"
                                        aria-label="Delete history entry"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-stone-600 dark:text-stone-400 italic py-1">Solve expressions on the canvas to build history.</p>
                        )}
                    </div>

                    {/* Footer buttons / actions */}
                    {history.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-stone-200 dark:border-white/10 shrink-0">
                            {confirmClear ? (
                                <div className="flex items-center justify-between bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 p-2 rounded-xl animate-fade-in">
                                    <span className="text-[10px] font-bold text-red-700 dark:text-red-400">Purge all history?</span>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => {
                                                onClearHistory();
                                                setConfirmClear(false);
                                            }}
                                            className="cursor-pointer text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded"
                                            aria-label="Confirm clear all solve history"
                                        >
                                            Yes
                                        </button>
                                        <button
                                            onClick={() => setConfirmClear(false)}
                                            className="cursor-pointer text-[10px] font-bold bg-stone-100 hover:bg-stone-200 dark:bg-white/10 dark:hover:bg-white/15 text-stone-600 dark:text-gray-300 px-2 py-1 rounded border border-stone-200 dark:border-transparent"
                                            aria-label="Cancel clear solve history"
                                        >
                                            No
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmClear(true)}
                                    className="cursor-pointer w-full text-[11px] font-bold text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 border border-red-200 dark:border-red-500/20 hover:border-red-300 dark:hover:border-red-500/40 bg-red-50 dark:bg-red-500/5 hover:bg-red-100 dark:hover:bg-red-500/10 py-1.5 rounded-xl transition-all font-sans flex items-center justify-center gap-1.5"
                                    aria-label="Clear all solve history entries"
                                >
                                    Clear History
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
