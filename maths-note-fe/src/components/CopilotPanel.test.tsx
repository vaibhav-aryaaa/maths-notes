import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderMessageText } from './CopilotPanel';

describe('CopilotPanel - renderMessageText (Task 70D)', () => {
    it('$a \\neq b$ stays intact without eating \\n', () => {
        const input = 'Equation: $a \\neq b$.';
        const { container } = render(<div>{renderMessageText(input)}</div>);
        expect(container.textContent).toContain('$a \\neq b$');
        // Ensure \neq was not converted to newline + eq
        expect(container.textContent).not.toContain('\neq');
    });

    it('$\\nabla f$, \\nu, $x \\notin A$ stay intact', () => {
        const input = 'Vector gradient $\\nabla f$, Greek letter \\nu, and set notation $x \\notin A$.';
        const { container } = render(<div>{renderMessageText(input)}</div>);
        expect(container.textContent).toContain('$\\nabla f$');
        expect(container.textContent).toContain('\\nu');
        expect(container.textContent).toContain('$x \\notin A$');
    });

    it('a real two-line message renders as two lines', () => {
        const input = 'First line of response\nSecond line of response';
        const { container } = render(<div className="whitespace-pre-wrap">{renderMessageText(input)}</div>);
        expect(container.textContent).toBe('First line of response\nSecond line of response');
        expect(container.textContent?.split('\n').length).toBe(2);
    });

    it('**bold** outside maths renders bold, and $**x**$ is not split', () => {
        const input = 'This is **bold** text and here is math $**x**$ and **another bold**.';
        const { container } = render(<div>{renderMessageText(input)}</div>);
        
        // Bold tags outside math
        const strongElements = container.querySelectorAll('strong');
        expect(strongElements.length).toBe(2);
        expect(strongElements[0].textContent).toBe('bold');
        expect(strongElements[1].textContent).toBe('another bold');

        // Math block $**x**$ is preserved intact without being split into <strong>
        expect(container.textContent).toContain('$**x**$');
    });
});
