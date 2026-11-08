import React, { useState, useRef, useEffect } from 'react';

export interface MenuItemProps {
    label: string;
    icon?: React.ReactNode;
    onClick: (e: React.MouseEvent) => void;
    danger?: boolean;
}

export interface DropdownMenuProps {
    trigger: React.ReactNode;
    items: MenuItemProps[];
    align?: 'left' | 'right';
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, items, align = 'right' }) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    return (
        <div ref={menuRef} className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((prev) => !prev);
                }}
            >
                {trigger}
            </div>

            {open && (
                <div
                    className={`absolute z-50 mt-1 w-44 rounded-[var(--lib-radius-md)] bg-[var(--lib-bg-surface)] border border-[var(--lib-border)] p-1 shadow-[var(--lib-shadow-menu)] lib-motion ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                >
                    {items.map((item, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                item.onClick(e);
                            }}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-[var(--lib-radius-sm)] border-none text-left cursor-pointer lib-motion outline-none focus-visible:ring-1 focus-visible:ring-[var(--lib-accent-ring)] ${
                                item.danger
                                    ? 'text-[var(--lib-danger)] hover:bg-[var(--lib-danger-subtle)]'
                                    : 'text-[var(--lib-text-primary)] hover:bg-[var(--lib-bg-raised)]'
                            }`}
                        >
                            {item.icon && <span className="shrink-0">{item.icon}</span>}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
