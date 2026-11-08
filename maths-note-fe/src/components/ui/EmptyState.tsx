import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, actionLabel, onAction }) => {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center max-w-sm mx-auto">
            {/* Minimal paper sheet outline with subtle dot grid */}
            <div className="w-20 h-26 rounded-[var(--lib-radius-md)] border border-[var(--lib-border)] lib-cover-grid shadow-xs mb-4 flex items-center justify-center" />

            <h3 className="text-base font-semibold text-[var(--lib-text-primary)] mb-1">{title}</h3>
            {description && (
                <p className="text-xs text-[var(--lib-text-secondary)] leading-relaxed mb-4">{description}</p>
            )}

            {actionLabel && onAction && (
                <Button variant="primary" size="sm" onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
        </div>
    );
};
