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
