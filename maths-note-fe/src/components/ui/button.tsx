import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'default' | 'outline' | 'destructive' | 'link';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'default' | 'icon';
    leftIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className = '', variant = 'primary', size = 'md', leftIcon, children, disabled, type = 'button', ...props }, ref) => {
        const baseStyles =
            'inline-flex items-center justify-center font-medium select-none cursor-pointer border border-transparent outline-none disabled:opacity-50 disabled:pointer-events-none lib-motion focus-visible:ring-2 focus-visible:ring-[var(--lib-accent-ring)] focus-visible:border-[var(--lib-accent)]';

        const sizeStyles: Record<string, string> = {
            xs: 'h-7 px-2 text-xs gap-1 rounded-[var(--lib-radius-sm)]',
            sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-[var(--lib-radius-sm)]',
            md: 'h-9 px-3.5 text-sm gap-2 rounded-[var(--lib-radius-sm)]',
            default: 'h-9 px-3.5 text-sm gap-2 rounded-[var(--lib-radius-sm)]',
            lg: 'h-10 px-5 text-base gap-2 rounded-[var(--lib-radius-sm)]',
            icon: 'h-9 w-9 p-0 rounded-[var(--lib-radius-sm)]',
        };

        const variantStyles: Record<string, string> = {
            primary:
                'bg-[var(--lib-accent)] hover:bg-[var(--lib-accent-hover)] text-white border-transparent shadow-xs',
            secondary:
                'bg-[var(--lib-bg-surface)] hover:bg-[var(--lib-bg-raised)] text-[var(--lib-text-primary)] border-[var(--lib-border)] shadow-xs',
            ghost:
                'bg-transparent hover:bg-[var(--lib-bg-raised)] text-[var(--lib-text-secondary)] hover:text-[var(--lib-text-primary)] border-transparent',
            danger:
                'bg-transparent hover:bg-[var(--lib-danger-subtle)] text-[var(--lib-danger)] border-transparent',
            destructive:
                'bg-transparent hover:bg-[var(--lib-danger-subtle)] text-[var(--lib-danger)] border-transparent',
            outline:
                'bg-[var(--lib-bg-surface)] hover:bg-[var(--lib-bg-raised)] text-[var(--lib-text-primary)] border-[var(--lib-border)] shadow-xs',
            default:
                'bg-transparent text-[var(--lib-text-primary)] border-transparent',
            link:
                'bg-transparent text-[var(--lib-accent)] underline-offset-4 hover:underline border-transparent',
        };

        const resolvedSize = sizeStyles[size] || sizeStyles.md;
        const resolvedVariant = variantStyles[variant] || variantStyles.primary;

        return (
            <button
                ref={ref}
                type={type}
                disabled={disabled}
                className={cn(baseStyles, resolvedSize, resolvedVariant, className)}
                {...props}
            >
                {leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
