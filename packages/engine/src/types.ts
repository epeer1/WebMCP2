// ────────────────────────────────────────────────────────────
// WebMCP Auto-Instrumentor — Core Type Definitions
// ────────────────────────────────────────────────────────────

// ── Risk & Classification ──────────────────────────────────

/** Risk level assigned to a proposed tool */
export type ToolRisk = 'safe' | 'caution' | 'destructive' | 'excluded';

/** Reason a tool was excluded from proposals */
export type ExclusionReason =
  | 'navigation'
  | 'file-upload'
  | 'password-only'
  | 'config-override'
  | 'no-handler';

// ── UI Element Model ───────────────────────────────────────

/** Represents a single interactive element found in source */
export interface UIElement {
  tag: string;                     // 'input' | 'button' | 'select' | 'textarea' | 'form' | custom component
  id?: string;
  name?: string;
  label?: string;                  // Resolved from <label>, aria-label, placeholder
  inputType?: string;              // 'text' | 'email' | 'password' | 'checkbox' | 'search' | 'submit' | ...
  attributes: Record<string, string>;
  /** Binding to state variable (React useState / ref) */
  stateBinding?: {
    variable: string;              // e.g. "email"
    setter?: string;               // e.g. "setEmail"
    accessPath?: string;           // e.g. "form.email" for object state
  };
  validation?: string[];           // ['required', 'minLength:3', 'pattern:...']
  accessibilityHints?: {
    ariaLabel?: string;
    ariaDescribedBy?: string;
    role?: string;
  };
  /** Parent form element tag/id, if nested inside a <form> */
  parentFormId?: string;
  /** Synthesized runtime selector strategies (populated during Phase 3 matching) */
  selectorFallback?: SelectorStrategy[];
}

// ── Event Handlers ─────────────────────────────────────────

export interface EventHandler {
  name: string;                    // Function name: "handleSubmit", "handleDelete"
  event: string;                   // "onSubmit" | "onClick" | "onChange"
  elementTag?: string;             // The tag that binds this handler
  elementId?: string;
  /** Raw source code of the handler body */
  body?: string;
  isAsync: boolean;
  /** API calls found inside the handler */
  apiCalls?: {
    method: string;                // 'POST' | 'DELETE' | ...
    url: string;                   // '/api/contact'
  }[];
}

// ── State Variables ────────────────────────────────────────

export interface StateVariable {
  name: string;                    // "email"
  setter?: string;                 // "setEmail"
  initialValue?: string;           // "''"
  type?: string;                   // 'string' | 'boolean' | 'object'
  /** How the state was declared */
  kind: 'useState' | 'useRef' | 'useReducer' | 'formLibrary' | 'other';
}

// ── Props ──────────────────────────────────────────────────

export interface PropDefinition {
  name: string;
  type?: string;
  required: boolean;
  defaultValue?: string;
}

// ── Component Model ────────────────────────────────────────

export type ComponentType = 'form' | 'action' | 'display' | 'mixed';

export interface ComponentInfo {
  name: string;                    // "ContactForm"
  type: ComponentType;
  elements: UIElement[];
  eventHandlers: EventHandler[];
  stateVariables: StateVariable[];
  props: PropDefinition[];
  /** If this component uses a form library, which one */
  formLibrary?: 'react-hook-form' | 'formik' | 'none';
}

export type FrameworkType = 'react' | 'html' | 'vue';

export interface ComponentAnalysis {
  fileName: string;
  framework: FrameworkType;
  components: ComponentInfo[];
}

// ── Selector Synthesis ───────────────────────────────────────

export interface SelectorStrategy {
  strategy: 'testid' | 'mcp' | 'label' | 'role' | 'css';
  value: string;
  score: number;
}

// ── Runtime Probe Models ─────────────────────────────────────

export interface ProbeElement {
  tag: string;
  id?: string;
  nameAttribute?: string;
  inputType?: string;
  /** The computed accessible name (e.g. from aria-label, <label>, or innerText) */
  accessibleName: string;
  /** The computed ARIA role (e.g. 'button', 'textbox', 'checkbox') */
  role: string;
  /** Unique structural path/selector (e.g. xpath or unique CSS) */
  selector: string;
  /** Boundary geometry for proximity matching */
  bounds?: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
  isInteractive: boolean;
}

export interface ProbeResult {
  url: string;
  elements: ProbeElement[];
  timestamp: number;
}

// ── Tool Proposal ──────────────────────────────────────────

/** A proposed tool ready for user review */
export interface ToolProposal {
  index: number;                   // 1-based for display
  id: string;                      // Deterministic hash of semantic intent
  name: string;                    // "submit_contact_form"
  description: string;             // "Fill and submit the contact form"
  risk: ToolRisk;
  riskReason?: string;             // "Handler calls DELETE /api/account"
  isStable?: boolean;              // Result of Confidence Threshold Policy score check
  unstableReason?: string;         // E.g., "Max selector score < 0.6"
  /** Pre-selected for generation? safe=true, caution=true, destructive=false */
  selected: boolean;
  /** The input schema the agent will call this tool with */
  inputSchema: ToolInputSchema;
  /** Which component / elements this tool maps to */
  sourceMapping: {
    componentName: string;
    triggerElement?: UIElement;
    inputElements: UIElement[];
    handler?: EventHandler;
  };
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, ToolInputProperty>;
  required: string[];
}

export interface ToolInputProperty {
  type: string;                    // JSON Schema type: "string" | "number" | "boolean" | "integer"
  description: string;
  enum?: string[];                 // For selects / radio groups
  default?: unknown;
}

// ── Pipeline I/O ───────────────────────────────────────────

export interface PipelineInput {
  sourceCode: string;
  fileName: string;
  fileType: 'tsx' | 'jsx' | 'html' | 'vue';
  userInstructions?: string;
  config?: WebMCPConfig;
}

export type OutputFormat = 'iife' | 'esm';

export interface PipelineOutput {
  proposals: ToolProposal[];
  selectedTools?: ToolProposal[];
  generatedCode?: string;
  outputFormat: OutputFormat;
  outputPath?: string;
  sourceHash: string;
}

// ── LLM Adapter ────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface LLMAdapter {
  readonly name: string;
  generate(messages: LLMMessage[], options?: LLMOptions): Promise<string>;
  generateJSON<T>(messages: LLMMessage[], options?: LLMOptions): Promise<T>;
  isAvailable(): Promise<boolean>;
}

// ── Configuration ──────────────────────────────────────────

export interface WebMCPConfig {
  classification?: {
    include?: string[];
    exclude?: string[];
    destructive?: 'exclude' | 'include-with-warning';
    navigation?: 'exclude' | 'include';
    customRules?: { match: string; risk: ToolRisk }[];
  };
  output?: {
    format?: 'iife' | 'esm' | 'auto';
    directory?: string;
    fileExtension?: '.mcp.js' | '.mcp.ts';
  };
  llm?: {
    backend?: 'github-models' | 'openai' | 'ollama' | 'none';
    model?: string;
    temperature?: number;
  };
  specVersion?: string;
}

// ── Tool Risk Classification ───────────────────────────────

export const DESTRUCTIVE_KEYWORDS = [
  'delete', 'remove', 'destroy', 'drop', 'purge', 'erase',
  'revoke', 'terminate', 'cancel', 'unsubscribe', 'deactivate',
  'reset', 'wipe', 'clear-all',
] as const;

export const CAUTION_KEYWORDS = [
  'update', 'edit', 'modify', 'change', 'save', 'submit',
  'post', 'put', 'patch', 'send', 'publish', 'create',
  'toggle', 'enable', 'disable', 'set',
] as const;

export const EXCLUDED_PATTERNS = [
  'navigate', 'redirect', 'route', 'link', 'href', 'goto',
  'file-upload', 'upload-file',
] as const;
