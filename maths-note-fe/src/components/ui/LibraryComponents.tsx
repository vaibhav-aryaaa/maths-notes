import React from 'react';
import { NotebookCard } from './NotebookCard';
import { SidebarItem } from './SidebarItem';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { Modal } from './Modal';
import { DropdownMenu } from './DropdownMenu';
import { formatRelativeTime, formatFullDate } from '@/lib/dateUtils';
import { Folder, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';

export interface TrashItemRowProps {
    type: 'notebook' | 'folder';
    name: string;
    deletedAt?: string | null;
    thumbnail?: string | null;
    onRestore: () => Promise<void>;
    onPermanentDelete: () => void;
}

export const TrashItemRow: React.FC<TrashItemRowProps> = ({
    type,
    name,
    deletedAt,
    thumbnail,
    onRestore,
    onPermanentDelete,
}) => {
    return (
        <div className="flex items-center justify-between p-3 rounded-[var(--lib-radius-md)] border border-[var(--lib-border)] bg-[var(--lib-bg-surface)] lib-motion">
            <div className="flex items-center gap-3 overflow-hidden min-w-0">
                {type === 'folder' ? (
                    <div className="w-10 h-8 rounded-[var(--lib-radius-sm)] bg-[var(--lib-bg-raised)] flex items-center justify-center text-[var(--lib-text-secondary)] shrink-0">
                        <Folder size={16} strokeWidth={1.5} />
                    </div>
                ) : (
                    <div className="w-10 h-8 rounded-[var(--lib-radius-sm)] border border-[var(--lib-border)] overflow-hidden shrink-0 bg-[var(--lib-bg-raised)]">
                        {thumbnail ? (
                            <img
                                src={thumbnail}
                                alt={name}
                                className="w-full h-full object-cover light:invert-[0.93] light:hue-rotate-180"
                            />
                        ) : (
                            <div className="w-full h-full lib-cover-grid" />
                        )}
                    </div>
                )}

                <div className="overflow-hidden min-w-0">
                    <h4 className="text-sm font-medium text-[var(--lib-text-primary)] truncate">{name}</h4>
                    <p
                        className="text-xs text-[var(--lib-text-secondary)] truncate"
                        title={formatFullDate(deletedAt)}
                    >
                        {formatRelativeTime(deletedAt)}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-3">
                <Button variant="secondary" size="sm" onClick={onRestore}>
                    Restore
                </Button>
                <Button variant="danger" size="sm" onClick={onPermanentDelete}>
                    Delete permanently
                </Button>
            </div>
        </div>
    );
};

export interface NotebookRowProps {
    name: string;
    folderName?: string;
    updatedAt?: string | null;
    thumbnail?: string | null;
    onClick: () => void;
    onRename: () => void;
    onMove?: () => void;
    onDelete: () => Promise<void>;
}

export const NotebookRow: React.FC<NotebookRowProps> = ({
    name,
    folderName,
    updatedAt,
    thumbnail,
    onClick,
    onRename,
    onMove,
    onDelete,
}) => {
    const menuItems = [
        {
            label: 'Rename',
            icon: <Edit2 size={13} strokeWidth={1.5} />,
            onClick: () => onRename(),
        },
        ...(onMove
            ? [
                  {
                      label: 'Move to folder',
                      icon: <Folder size={13} strokeWidth={1.5} />,
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
            className="group flex items-center justify-between p-2.5 rounded-[var(--lib-radius-md)] border border-transparent hover:border-[var(--lib-border)] hover:bg-[var(--lib-bg-surface)] cursor-pointer select-none lib-motion outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-accent-ring)]"
        >
            <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div className="w-10 h-8 rounded-[var(--lib-radius-sm)] border border-[var(--lib-border)] overflow-hidden shrink-0 bg-[var(--lib-bg-raised)]">
                    {thumbnail ? (
                        <img
                            src={thumbnail}
                            alt={name}
                            className="w-full h-full object-cover light:invert-[0.93] light:hue-rotate-180"
                        />
                    ) : (
                        <div className="w-full h-full lib-cover-grid" />
                    )}
                </div>

                <div className="overflow-hidden min-w-0">
                    <h4 className="text-sm font-medium text-[var(--lib-text-primary)] truncate">{name}</h4>
                    {folderName && (
                        <span className="text-[11px] text-[var(--lib-text-tertiary)] flex items-center gap-1">
                            <Folder size={11} strokeWidth={1.5} />
                            <span className="truncate">{folderName}</span>
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4 shrink-0 ml-3">
                <span
                    className="text-xs text-[var(--lib-text-secondary)] hidden sm:inline"
                    title={formatFullDate(updatedAt)}
                >
                    {formatRelativeTime(updatedAt)}
                </span>

                <DropdownMenu
                    trigger={
                        <button
                            type="button"
                            aria-label="Actions"
                            className="p-1 rounded-[var(--lib-radius-sm)] text-[var(--lib-text-tertiary)] hover:text-[var(--lib-text-primary)] hover:bg-[var(--lib-bg-raised)] cursor-pointer border-none bg-transparent"
                        >
                            <MoreHorizontal size={15} strokeWidth={1.5} />
                        </button>
                    }
                    items={menuItems}
                />
            </div>
        </div>
    );
};

export { NotebookCard, SidebarItem, EmptyState, Button, Modal, DropdownMenu };
