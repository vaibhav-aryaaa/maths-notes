import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'default' | 'outline' | 'destructive' | 'link';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'default' | 'icon';
    leftIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className = '', variant = 'primary', size = 'md', leftIcon, children, disabled, type = 'button', ...props }, ref) => {
        const baseStyles =
            'inline-flex items-center justify-center font-medium select-none cursor-pointer border outline-none disabled:opacity-50 disabled:pointer-events-none lib-motion focus-visible:ring-2 focus-visible:ring-[var(--lib-accent-ring)] focus-visible:border-[var(--lib-accent)]';

        const sizeStyles = {
            xs: 'h-7 px-2 text-xs gap-1 rounded-[var(--lib-radius-sm)]',
            sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-[var(--lib-radius-sm)]',
            md: 'h-9 px-3.5 text-sm gap-2 rounded-[var(--lib-radius-sm)]',
            default: 'h-9 px-3.5 text-sm gap-2 rounded-[var(--lib-radius-sm)]',
            lg: 'h-10 px-5 text-base gap-2 rounded-[var(--lib-radius-sm)]',
            icon: 'h-9 w-9 p-0 rounded-[var(--lib-radius-sm)]',
        }[size] || 'h-9 px-3.5 text-sm gap-2 rounded-[var(--lib-radius-sm)]';

        const resolvedVariant =
            variant === 'default' || variant === 'outline'
                ? 'secondary'
                : variant === 'destructive'
                ? 'danger'
                : variant === 'link'
                ? 'ghost'
                : variant;

        const variantStyles = {
            primary:
                'bg-[var(--lib-accent)] hover:bg-[var(--lib-accent-hover)] text-white border-transparent shadow-xs',
            secondary:
                'bg-[var(--lib-bg-surface)] hover:bg-[var(--lib-bg-raised)] text-[var(--lib-text-primary)] border-[var(--lib-border)] shadow-xs',
            ghost:
                'bg-transparent hover:bg-[var(--lib-bg-raised)] text-[var(--lib-text-secondary)] hover:text-[var(--lib-text-primary)] border-transparent',
            danger:
                'bg-transparent hover:bg-[var(--lib-danger-subtle)] text-[var(--lib-danger)] border-transparent',
        }[resolvedVariant] || 'bg-[var(--lib-accent)] hover:bg-[var(--lib-accent-hover)] text-white border-transparent shadow-xs';

        return (
            <button
                ref={ref}
                type={type}
                disabled={disabled}
                className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
                {...props}
            >
                {leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
