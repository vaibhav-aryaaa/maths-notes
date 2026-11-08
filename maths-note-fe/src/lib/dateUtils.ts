export function formatRelativeTime(dateStr?: string | null): string {
    if (!dateStr) return 'Edited recently';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Edited just now';

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Edited ${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Edited ${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
        return diffDays === 1 ? 'Edited yesterday' : `Edited ${diffDays} days ago`;
    }

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) {
        return diffWeeks === 1 ? 'Edited 1 week ago' : `Edited ${diffWeeks} weeks ago`;
    }

    try {
        const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
        const diffMonths = Math.floor(diffDays / 30);
        if (diffMonths < 12) {
            return `Edited ${rtf.format(-diffMonths, 'month')}`;
        }
        const diffYears = Math.floor(diffDays / 365);
        return `Edited ${rtf.format(-diffYears, 'year')}`;
    } catch {
        return `Edited ${date.toLocaleDateString()}`;
    }
}

export function formatFullDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return dateStr;
    }
}
