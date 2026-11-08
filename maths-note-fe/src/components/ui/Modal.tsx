import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
    opened: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ opened, onClose, title, children, maxWidth = '400px' }) => {
    useEffect(() => {
        if (!opened) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [opened, onClose]);

    if (!opened) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs lib-motion"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Dialog */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                style={{ maxWidth }}
                className="relative w-full bg-[var(--lib-bg-surface)] border border-[var(--lib-border)] rounded-[var(--lib-radius-lg)] p-5 shadow-[var(--lib-shadow-modal)] lib-motion z-10"
            >
                <div className="flex items-center justify-between pb-3 border-b border-[var(--lib-border-subtle)]">
                    <h2 id="modal-title" className="text-base font-semibold text-[var(--lib-text-primary)] tracking-tight">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close modal"
                        className="p-1 rounded-[var(--lib-radius-sm)] text-[var(--lib-text-tertiary)] hover:text-[var(--lib-text-primary)] hover:bg-[var(--lib-bg-raised)] cursor-pointer border-none bg-transparent lib-motion outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-accent-ring)]"
                    >
                        <X size={16} strokeWidth={1.5} />
                    </button>
                </div>

                <div className="pt-4">{children}</div>
            </div>
        </div>
    );
};
