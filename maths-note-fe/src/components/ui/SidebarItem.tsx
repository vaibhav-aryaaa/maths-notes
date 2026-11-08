import React from 'react';

export interface SidebarItemProps {
    label: string;
    icon: React.ReactNode;
    count?: number;
    active?: boolean;
    onClick: () => void;
    level?: 0 | 1;
    trailingAction?: React.ReactNode;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
    label,
    icon,
    count,
    active = false,
    onClick,
    level = 0,
    trailingAction,
}) => {
    return (
        <div
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={`group relative flex items-center justify-between w-full px-2.5 py-1.5 rounded-[var(--lib-radius-sm)] text-xs font-medium cursor-pointer select-none lib-motion outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-accent-ring)] ${
                level === 1 ? 'pl-6' : ''
            } ${
                active
                    ? 'bg-[var(--lib-bg-surface)] text-[var(--lib-text-primary)] font-semibold shadow-xs'
                    : 'text-[var(--lib-text-secondary)] hover:text-[var(--lib-text-primary)] hover:bg-[var(--lib-bg-raised)]'
            }`}
        >
            {/* Active 2px indicator marker */}
            {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--lib-accent)]" />
            )}

            <div className="flex items-center gap-2 overflow-hidden min-w-0">
                <span className={`shrink-0 ${active ? 'text-[var(--lib-accent)]' : 'text-[var(--lib-text-tertiary)]'}`}>
                    {icon}
                </span>
                <span className="truncate">{label}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                {count !== undefined && count > 0 && (
                    <span className="text-[11px] text-[var(--lib-text-tertiary)] px-1.5 py-0.2 rounded font-normal">
                        {count}
                    </span>
                )}
                {trailingAction && <span className="opacity-0 group-hover:opacity-100 lib-motion">{trailingAction}</span>}
            </div>
        </div>
    );
};
