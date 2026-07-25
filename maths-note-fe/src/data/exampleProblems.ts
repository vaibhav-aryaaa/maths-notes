export interface ExampleProblem {
    id: string;
    name: string;
    description: string;
    strokes: { x: number; y: number }[][];
}

const CHARACTER_STROKES: Record<string, { x: number; y: number }[][]> = {
  '0': [[{x: 2, y: 2}, {x: 18, y: 2}, {x: 18, y: 28}, {x: 2, y: 28}, {x: 2, y: 2}]],
  '1': [[{x: 5, y: 5}, {x: 10, y: 2}, {x: 10, y: 28}]],
  '2': [[{x: 2, y: 6}, {x: 18, y: 2}, {x: 18, y: 14}, {x: 2, y: 28}, {x: 18, y: 28}]],
  '3': [[{x: 2, y: 2}, {x: 18, y: 2}, {x: 18, y: 14}, {x: 8, y: 14}, {x: 18, y: 14}, {x: 18, y: 28}, {x: 2, y: 28}]],
  '4': [[{x: 2, y: 2}, {x: 2, y: 16}, {x: 18, y: 16}], [{x: 14, y: 2}, {x: 14, y: 28}]],
  '5': [[{x: 18, y: 2}, {x: 2, y: 2}, {x: 2, y: 14}, {x: 18, y: 14}, {x: 18, y: 28}, {x: 2, y: 28}]],
  '6': [[{x: 18, y: 2}, {x: 2, y: 2}, {x: 2, y: 28}, {x: 18, y: 28}, {x: 18, y: 14}, {x: 2, y: 14}]],
  '7': [[{x: 2, y: 2}, {x: 18, y: 2}, {x: 6, y: 28}]],
  '8': [[{x: 2, y: 2}, {x: 18, y: 2}, {x: 18, y: 28}, {x: 2, y: 28}, {x: 2, y: 2}], [{x: 2, y: 15}, {x: 18, y: 15}]],
  '9': [[{x: 18, y: 28}, {x: 18, y: 2}, {x: 2, y: 2}, {x: 2, y: 15}, {x: 18, y: 15}]],
  '+': [[{x: 2, y: 15}, {x: 18, y: 15}], [{x: 10, y: 5}, {x: 10, y: 25}]],
  '-': [[{x: 2, y: 15}, {x: 18, y: 15}]],
  '=': [[{x: 2, y: 11}, {x: 18, y: 11}], [{x: 2, y: 19}, {x: 18, y: 19}]],
  'x': [[{x: 2, y: 5}, {x: 18, y: 25}], [{x: 18, y: 5}, {x: 2, y: 25}]],
  'y': [[{x: 2, y: 5}, {x: 10, y: 18}, {x: 18, y: 5}], [{x: 10, y: 18}, {x: 2, y: 32}]],
  'r': [[{x: 2, y: 10}, {x: 2, y: 28}], [{x: 2, y: 14}, {x: 10, y: 10}, {x: 18, y: 14}]],
  'a': [[{x: 18, y: 10}, {x: 2, y: 10}, {x: 2, y: 28}, {x: 18, y: 28}, {x: 18, y: 10}, {x: 18, y: 28}]],
  'e': [[{x: 2, y: 18}, {x: 18, y: 18}, {x: 18, y: 10}, {x: 2, y: 10}, {x: 2, y: 28}, {x: 18, y: 28}]],
  'A': [[{x: 10, y: 2}, {x: 2, y: 28}], [{x: 10, y: 2}, {x: 18, y: 28}], [{x: 5, y: 18}, {x: 15, y: 18}]],
  '?': [[{x: 2, y: 6}, {x: 10, y: 2}, {x: 18, y: 6}, {x: 18, y: 14}, {x: 10, y: 19}], [{x: 10, y: 26}, {x: 10, y: 28}]],
  '^': [[{x: 2, y: 4}, {x: 12, y: 1}, {x: 12, y: 9}, {x: 2, y: 18}, {x: 12, y: 18}]], // smaller '2' superscript
};

function buildTextStrokes(text: string, startX: number, startY: number, scale = 1.0): { x: number; y: number }[][] {
    const strokes: { x: number; y: number }[][] = [];
    let currentX = startX;

    for (const char of text) {
        if (char === ' ') {
            currentX += 24 * scale;
            continue;
        }

        const charStrokes = CHARACTER_STROKES[char];
        if (charStrokes) {
            charStrokes.forEach(stroke => {
                strokes.push(
                    stroke.map(pt => ({
                        x: currentX + pt.x * scale,
                        y: startY + pt.y * scale
                    }))
                );
            });
        }
        currentX += 28 * scale;
    }
    return strokes;
}

// 1. Simple algebra: "x + 5 = 12"
const algebraicStrokes = buildTextStrokes("x + 5 = 12", 200, 200, 1.8);

// 2. System of equations: "x + y = 10" & "y = 2x"
const systemStrokes = [
    ...buildTextStrokes("x + y = 10", 200, 160, 1.5),
    ...buildTextStrokes("y = 2x", 200, 240, 1.5)
];

// 3. Word problem / Quadratic solver: "x^ - 9 = 0"
const quadraticStrokes = buildTextStrokes("x^ - 9 = 0", 200, 200, 1.8);

// 4. Geometry (Right Triangle)
const geometryTriangleStrokes: { x: number; y: number }[][] = [
    // Vertical line
    [{ x: 250, y: 150 }, { x: 250, y: 350 }],
    // Horizontal line
    [{ x: 250, y: 350 }, { x: 500, y: 350 }],
    // Diagonal line
    [{ x: 500, y: 350 }, { x: 250, y: 150 }],
    // Right angle indicator
    [{ x: 270, y: 350 }, { x: 270, y: 330 }, { x: 250, y: 330 }],
    // Labels
    ...buildTextStrokes("6", 210, 230, 1.2),
    ...buildTextStrokes("8", 360, 370, 1.2),
    ...buildTextStrokes("x", 380, 220, 1.2)
];

// Helper to build circle strokes
const buildCircleStrokes = (): { x: number; y: number }[][] => {
    const strokes: { x: number; y: number }[][] = [];
    const circleStroke: { x: number; y: number }[] = [];
    const center = { x: 300, y: 220 };
    const radius = 70;

    for (let angle = 0; angle <= 360; angle += 10) {
        const rad = (angle * Math.PI) / 180;
        circleStroke.push({
            x: center.x + radius * Math.cos(rad),
            y: center.y + radius * Math.sin(rad)
        });
    }
    strokes.push(circleStroke);

    // Radius line
    strokes.push([center, { x: center.x + radius, y: center.y }]);

    // Labels
    strokes.push(...buildTextStrokes("r = 7", 310, 180, 1.0));
    strokes.push(...buildTextStrokes("Area = ?", 210, 320, 1.3));

    return strokes;
};

const geometryCircleStrokes = buildCircleStrokes();

export const EXAMPLE_PROBLEMS: ExampleProblem[] = [
    {
        id: 'algebra',
        name: 'Simple Algebra',
        description: 'Single-variable linear equation solving (x + 5 = 12)',
        strokes: algebraicStrokes,
    },
    {
        id: 'system',
        name: 'System of Equations',
        description: 'Two linear variables system (x + y = 10, y = 2x)',
        strokes: systemStrokes,
    },
    {
        id: 'quadratic',
        name: 'Quadratic Equation',
        description: 'Solving powers and exponents (x² - 9 = 0)',
        strokes: quadraticStrokes,
    },
    {
        id: 'geometry_triangle',
        name: 'Pythagorean Theorem',
        description: 'Geometric right triangle solving side lengths (6, 8, x)',
        strokes: geometryTriangleStrokes,
    },
    {
        id: 'geometry_circle',
        name: 'Circle Area',
        description: 'Calculating area of a circle with a radius label (r = 7)',
        strokes: geometryCircleStrokes,
    }
];
