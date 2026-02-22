// ────────────────────────────────────────────────────────────
// WebMCP Error Taxonomy
// Every error the user can hit, with a clear message + suggestion.
// ────────────────────────────────────────────────────────────

export class WebMCPError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly userMessage: string,
        public readonly suggestion?: string,
    ) {
        super(message);
        this.name = 'WebMCPError';
    }
}

export const ERRORS = {
    FILE_NOT_FOUND: (path: string) =>
        new WebMCPError(
            `File not found: ${path}`,
            'FILE_NOT_FOUND',
            `Could not find file: ${path}`,
            'Check the path and try again.',
        ),

    UNSUPPORTED_FILE_TYPE: (ext: string) =>
        new WebMCPError(
            `Unsupported file type: ${ext}`,
            'UNSUPPORTED_TYPE',
            `File type "${ext}" is not supported.`,
            'Supported types: .tsx, .jsx, .html. Vue support coming in v2.',
        ),

    NO_ELEMENTS_FOUND: (file: string) =>
        new WebMCPError(
            `No instrumentable elements in ${file}`,
            'NO_ELEMENTS',
            `No forms, buttons, or interactive elements found in ${file}.`,
            'Try pointing at a specific page or form component.',
        ),

    LLM_UNAVAILABLE: () =>
        new WebMCPError(
            'No LLM backend available',
            'LLM_UNAVAILABLE',
            'No LLM backend detected.',
            'Set OPENAI_API_KEY, run `gh auth login`, or start Ollama.',
        ),

    SCHEMA_VALIDATION_FAILED: (errors: string[]) =>
        new WebMCPError(
            `Schema validation failed: ${errors.join(', ')}`,
            'SCHEMA_INVALID',
            'Generated schema did not pass validation.',
            'This is usually a transient LLM error. Try again.',
        ),

    PROPOSAL_EXPIRED: () =>
        new WebMCPError(
            'Cached proposal expired',
            'PROPOSAL_EXPIRED',
            'Your tool proposal has expired (5 min timeout).',
            'Run @webmcp instrument again to get a fresh proposal.',
        ),

    PARSE_FAILED: (file: string, detail: string) =>
        new WebMCPError(
            `Failed to parse ${file}: ${detail}`,
            'PARSE_FAILED',
            `Could not parse ${file}.`,
            'Make sure the file contains valid .tsx, .jsx, or .html source code.',
        ),

    WRITE_FAILED: (path: string, detail: string) =>
        new WebMCPError(
            `Failed to write to ${path}: ${detail}`,
            'WRITE_FAILED',
            `Could not write output file: ${path}`,
            'Check file permissions and available disk space.',
        ),
} as const;

/** Type guard for WebMCPError */
export function isWebMCPError(err: unknown): err is WebMCPError {
    return err instanceof WebMCPError;
}

/** Format a WebMCPError for CLI display */
export function formatError(err: WebMCPError): string {
    let out = `\n✖ ${err.userMessage}`;
    if (err.suggestion) out += `\n  → ${err.suggestion}`;
    return out;
}
