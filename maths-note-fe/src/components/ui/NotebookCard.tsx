import React, { useState } from 'react';
import { MoreHorizontal, Edit2, FolderInput, Trash2, Check, X } from 'lucide-react';
import { DropdownMenu } from './DropdownMenu';
import { formatRelativeTime, formatFullDate } from '@/lib/dateUtils';
import type { CanvasMetadata } from '@/lib/canvasesApi';

export interface NotebookCardProps {
    canvas: CanvasMetadata;
    onClick: () => void;
    onRename: (newName: string) => Promise<void>;
    onMove?: () => void;
    onDelete: () => Promise<void>;
}

export const NotebookCard: React.FC<NotebookCardProps> = ({
    canvas,
    onClick,
    onRename,
    onMove,
    onDelete,
}) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(canvas.name);

    const handleSaveRename = async () => {
        if (!renameValue.trim() || renameValue.trim() === canvas.name) {
            setIsRenaming(false);
            setRenameValue(canvas.name);
            return;
        }
        await onRename(renameValue.trim());
        setIsRenaming(false);
    };

    const menuItems = [
        {
            label: 'Rename',
            icon: <Edit2 size={13} strokeWidth={1.5} />,
            onClick: () => {
                setIsRenaming(true);
                setRenameValue(canvas.name);
            },
        },
        ...(onMove
            ? [
                  {
                      label: 'Move to folder',
                      icon: <FolderInput size={13} strokeWidth={1.5} />,
                      onClick: () => onMove(),
                  },
              ]
            : []),
        {
            label: 'Delete',
            icon: <Trash2 size={13} strokeWidth={1.5} />,
            onClick: () => onDelete(),
            danger: true,
        },
    ];

    return (
        <div
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter') onClick();
            }}
            className="group relative flex flex-col text-left cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-accent-ring)] rounded-[var(--lib-radius-md)]"
        >
            {/* Cover Surface (Frameless GoodNotes style) */}
            <div className="relative aspect-[4/3] w-full rounded-[var(--lib-radius-md)] overflow-hidden border border-[var(--lib-border)] bg-[var(--lib-bg-surface)] lib-motion group-hover:-translate-y-0.5 group-hover:shadow-[var(--lib-shadow-hover)]">
                {canvas.thumbnail ? (
                    <img
                        src={canvas.thumbnail}
                        alt={canvas.name}
                        className="w-full h-full object-cover object-top light:invert-[0.93] light:hue-rotate-180 opacity-95 group-hover:opacity-100 lib-motion"
                    />
                ) : (
                    /* Blank notebook shows pure canvas dot grid */
                    <div className="w-full h-full lib-cover-grid" />
                )}

                {/* Subtle top-right 3-dots action menu button */}
                <div
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 lib-motion z-10"
                    onClick={(e) => e.stopPropagation()}
                >
                    <DropdownMenu
                        trigger={
                            <button
                                type="button"
                                aria-label="Notebook options"
                                className="w-7 h-7 flex items-center justify-center rounded-[var(--lib-radius-sm)] bg-[var(--lib-bg-surface)]/90 backdrop-blur-xs text-[var(--lib-text-secondary)] hover:text-[var(--lib-text-primary)] border border-[var(--lib-border)] shadow-xs cursor-pointer lib-motion outline-none focus-visible:ring-1 focus-visible:ring-[var(--lib-accent-ring)]"
                            >
                                <MoreHorizontal size={14} strokeWidth={1.5} />
                            </button>
                        }
                        items={menuItems}
                    />
                </div>
            </div>

            {/* Title & Metadata placed cleanly beneath cover without outer box */}
            <div className="pt-2 px-0.5">
                {isRenaming ? (
                    <div
                        className="flex items-center gap-1 mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename();
                                if (e.key === 'Escape') setIsRenaming(false);
                            }}
                            autoFocus
                            className="w-full h-7 text-xs font-medium px-2 rounded-[var(--lib-radius-sm)] border border-[var(--lib-accent)] bg-[var(--lib-bg-surface)] text-[var(--lib-text-primary)] outline-none"
                        />
                        <button
                            type="button"
                            onClick={handleSaveRename}
                            className="p-1 text-[var(--lib-accent)] hover:opacity-80 cursor-pointer border-none bg-transparent"
                            aria-label="Save name"
                        >
                            <Check size={13} strokeWidth={1.5} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsRenaming(false)}
                            className="p-1 text-[var(--lib-text-tertiary)] hover:text-[var(--lib-text-primary)] cursor-pointer border-none bg-transparent"
                            aria-label="Cancel rename"
                        >
                            <X size={13} strokeWidth={1.5} />
                        </button>
                    </div>
                ) : (
                    <>
                        <h4 className="text-sm font-medium text-[var(--lib-text-primary)] truncate">
                            {canvas.name}
                        </h4>
                        <p
                            className="text-xs text-[var(--lib-text-secondary)] mt-0.5 truncate"
                            title={formatFullDate(canvas.updated_at)}
                        >
                            {formatRelativeTime(canvas.updated_at)}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};
