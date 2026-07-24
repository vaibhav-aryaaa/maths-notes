export interface GeneratedResult {
    expression: string;
    answer: string;
    type?: string;
    thought_process?: string;
    confidence_score?: number;
    latency?: number;
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
