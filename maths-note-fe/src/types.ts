export interface GeneratedSolution {
    expression: string;
    answer: string;
    type?: string;
}

export interface SolutionStep {
    order: number;
    description: string;
    expression?: string;
}

export interface GeneratedResult {
    id: string;
    solutions: GeneratedSolution[];
    thought_process?: string;
    confidence_score?: number;
    latency?: number;
    steps?: SolutionStep[];
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
    isSelection?: boolean;
}

export type DictOfVars = Record<string, string | number>;

export interface CalculateRequest {
    image: string;
    dict_of_vars: DictOfVars;
}

export interface CalculateResponseItem {
    expr: string;
    result: string;
    assign: boolean;
    type?: string;
    thought_process?: string;
    confidence_score?: number;
    latency?: number;
    steps?: SolutionStep[];
}

export interface CalculateResponse {
    data: CalculateResponseItem[];
}

export interface CopilotRequest {
    session_id: string;
    message: string;
    canvas_image: string;
    dict_of_vars: DictOfVars;
    results: {
        expression: string;
        answer: string;
        thought_process?: string;
    }[];
}

export interface CopilotResponse {
    reply: string;
}

export type PenType = 'pen' | 'fountain' | 'marker' | 'highlighter';

export interface Stroke {
    id: string;              // crypto.randomUUID()
    tool: PenType | 'eraser' | 'rect' | 'circle' | 'triangle' | 'line';
    color: string;
    width: number;
    opacity?: number;        // opacity range: 0 to 1
    points: { x: number; y: number; timestamp: number }[]; // world-space coordinates
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface StrokeElement extends Stroke {
    kind?: 'stroke';
}

export interface TextElement {
    kind: 'text';
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
    color: string;
}

export interface ImageElement {
    kind: 'image';
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    src: string; // Base64 data URL
    bitmap?: ImageBitmap | HTMLImageElement;
}

export type CanvasElement = StrokeElement | TextElement | ImageElement;
