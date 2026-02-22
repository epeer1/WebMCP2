import {
    Project,
    SyntaxKind,
    type SourceFile,
    type FunctionDeclaration,
    type ArrowFunction,
    type FunctionExpression,
    type Node,
    type CallExpression,
    type JsxOpeningElement,
    type JsxSelfClosingElement,
} from 'ts-morph';
import type {
    ComponentAnalysis,
    ComponentInfo,
    UIElement,
    EventHandler,
    StateVariable,
    PropDefinition,
    ComponentType,
} from '../types.js';

// ── Known third-party UI component → native tag mapping ─────
const KNOWN_INPUT_COMPONENTS: Record<string, { tag: string; inputType?: string }> = {
    // MUI
    TextField: { tag: 'input' },
    Select: { tag: 'select' },
    Checkbox: { tag: 'input', inputType: 'checkbox' },
    Switch: { tag: 'input', inputType: 'checkbox' },
    // Chakra / Radix / shadcn
    Input: { tag: 'input' },
    Textarea: { tag: 'textarea' },
    // Ant Design
    InputNumber: { tag: 'input', inputType: 'number' },
    // Generic patterns
    Button: { tag: 'button' },
};

const INTERACTIVE_TAGS = new Set(['input', 'button', 'select', 'textarea', 'form']);

// ── Public entry point ────────────────────────────────────────

export function parseReactFile(source: string, fileName: string): ComponentAnalysis {
    const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: { jsx: 2 /* React */, allowJs: true, checkJs: false },
    });
    const sourceFile = project.createSourceFile(fileName, source);

    const components = findComponents(sourceFile);
    const parsed: ComponentInfo[] = [];

    for (const fn of components) {
        const info = analyzeComponent(fn, sourceFile);
        // Only keep components that have something interesting
        if (info.elements.length > 0 || info.eventHandlers.length > 0) {
            parsed.push(info);
        }
    }

    return { fileName, framework: 'react', components: parsed };
}

// ── Component discovery ───────────────────────────────────────

type FunctionLike = FunctionDeclaration | ArrowFunction | FunctionExpression;

function findComponents(sourceFile: SourceFile): FunctionLike[] {
    const results: FunctionLike[] = [];

    // 1. export default function MyComponent() {}
    // 2. export function MyComponent() {}
    for (const fn of sourceFile.getFunctions()) {
        if (fn.isExported() || fn.isDefaultExport()) {
            if (returnsJSX(fn)) results.push(fn);
        }
    }

    // 3. export const MyComponent = () => {} / function() {}
    for (const varDecl of sourceFile.getVariableDeclarations()) {
        const init = varDecl.getInitializer();
        if (!init) continue;
        const fn =
            init.asKind(SyntaxKind.ArrowFunction) ??
            init.asKind(SyntaxKind.FunctionExpression);
        if (!fn) continue;
        const varStmt = varDecl.getVariableStatement();
        if (varStmt?.isExported() && returnsJSX(fn)) {
            results.push(fn);
        }
    }

    return results;
}

function returnsJSX(fn: FunctionLike): boolean {
    let found = false;
    fn.forEachDescendant((node) => {
        if (
            node.isKind(SyntaxKind.JsxElement) ||
            node.isKind(SyntaxKind.JsxSelfClosingElement) ||
            node.isKind(SyntaxKind.JsxFragment)
        ) {
            found = true;
        }
    });
    return found;
}

// ── Component analysis ────────────────────────────────────────

function analyzeComponent(fn: FunctionLike, _sourceFile: SourceFile): ComponentInfo {
    const name = getFunctionName(fn);
    const elements = extractJSXElements(fn);
    const stateVars = extractStateVariables(fn);
    const handlers = extractEventHandlers(fn);

    bindStateToElements(stateVars, elements);
    bindHandlersToElements(handlers, elements);

    return {
        name,
        type: classifyComponentType(elements, handlers),
        elements,
        eventHandlers: handlers,
        stateVariables: stateVars,
        props: extractProps(fn),
    };
}

function getFunctionName(fn: FunctionLike): string {
    if (fn.isKind(SyntaxKind.FunctionDeclaration)) {
        return fn.getName() ?? 'AnonymousComponent';
    }
    // Arrow / FunctionExpression — name comes from containing variable
    const parent = fn.getParent();
    if (parent?.isKind(SyntaxKind.VariableDeclaration)) {
        return parent.getName();
    }
    return 'AnonymousComponent';
}

// ── JSX element extraction ────────────────────────────────────

function extractJSXElements(fn: FunctionLike): UIElement[] {
    const elements: UIElement[] = [];
    let formDepth = 0;
    let currentFormId: string | undefined;

    fn.forEachDescendant((node) => {
        const opening =
            node.asKind(SyntaxKind.JsxOpeningElement) ??
            node.asKind(SyntaxKind.JsxSelfClosingElement);
        if (!opening) return;

        const tagName = getTagName(opening);
        const attrs = collectAttributes(opening);

        // Track form nesting
        if (tagName === 'form') {
            formDepth++;
            currentFormId = attrs['id'];
        }

        const nativeTag = resolveToNativeTag(tagName);
        if (!nativeTag) return;

        // Extract inner text (for buttons: <button>Delete Account</button>)
        let innerText: string | undefined;
        if (node.isKind(SyntaxKind.JsxOpeningElement)) {
            const parentEl = node.getParent();
            if (parentEl?.isKind(SyntaxKind.JsxElement)) {
                const textChildren = parentEl.getJsxChildren()
                    .filter(c => c.isKind(SyntaxKind.JsxText))
                    .map(c => c.getText().trim())
                    .filter(Boolean);
                if (textChildren.length > 0) innerText = textChildren.join(' ');
            }
        }

        const el: UIElement = {
            tag: nativeTag,
            id: attrs['id'],
            name: attrs['name'],
            inputType: attrs['type'] ?? KNOWN_INPUT_COMPONENTS[tagName]?.inputType,
            label: attrs['placeholder'] ?? attrs['aria-label'] ?? attrs['label'] ?? innerText,
            attributes: attrs,
            parentFormId: formDepth > 0 ? currentFormId : undefined,
        };

        // Resolve validation
        const validation: string[] = [];
        if (attrs['required'] !== undefined) validation.push('required');
        if (attrs['minLength']) validation.push(`minLength:${attrs['minLength']}`);
        if (attrs['pattern']) validation.push(`pattern:${attrs['pattern']}`);
        if (validation.length) el.validation = validation;

        // Accessibility
        if (attrs['aria-label'] || attrs['aria-describedby'] || attrs['role']) {
            el.accessibilityHints = {
                ariaLabel: attrs['aria-label'],
                ariaDescribedBy: attrs['aria-describedby'],
                role: attrs['role'],
            };
        }

        elements.push(el);
    });

    // Reset form tracking (simple approach — handles flat forms well)
    // For nested or multi-form JSX the depth tracking above already handles it.
    return elements;
}

function getTagName(node: JsxOpeningElement | JsxSelfClosingElement): string {
    return node.getTagNameNode().getText();
}

function resolveToNativeTag(tagName: string): string | null {
    if (INTERACTIVE_TAGS.has(tagName)) return tagName;
    const mapped = KNOWN_INPUT_COMPONENTS[tagName];
    if (mapped) return mapped.tag;
    return null;
}

function collectAttributes(node: JsxOpeningElement | JsxSelfClosingElement): Record<string, string> {
    const attrs: Record<string, string> = {};

    for (const attr of node.getAttributes()) {
        if (attr.isKind(SyntaxKind.JsxAttribute)) {
            const name = attr.getNameNode().getText();
            const initializer = attr.getInitializer();

            if (!initializer) {
                // Boolean attribute e.g. `required`
                attrs[name] = 'true';
                continue;
            }

            if (initializer.isKind(SyntaxKind.StringLiteral)) {
                attrs[name] = initializer.getLiteralValue();
            } else if (initializer.isKind(SyntaxKind.JsxExpression)) {
                // Capture the raw expression text for reference
                const expr = initializer.getExpression();
                if (expr) attrs[name] = expr.getText();
            }
        }
    }

    return attrs;
}

// ── State variable extraction ─────────────────────────────────

function extractStateVariables(fn: FunctionLike): StateVariable[] {
    const vars: StateVariable[] = [];

    fn.forEachDescendant((node) => {
        if (!node.isKind(SyntaxKind.CallExpression)) return;
        const call = node as CallExpression;
        const callee = call.getExpression().getText();

        // useState
        if (callee === 'useState' || callee.endsWith('.useState')) {
            const parent = call.getParent();
            if (parent?.isKind(SyntaxKind.VariableDeclaration)) {
                const nameNode = parent.getNameNode();
                if (nameNode.isKind(SyntaxKind.ArrayBindingPattern)) {
                    const elements = nameNode.getElements();
                    // Use ts-morph's getName() which handles OmittedExpression safely
                    const first = elements[0];
                    const second = elements[1];
                    const stateName = first?.isKind(SyntaxKind.BindingElement) ? first.getNameNode().getText() : '';
                    const setter = second?.isKind(SyntaxKind.BindingElement) ? second.getNameNode().getText() : undefined;
                    const init = call.getArguments()[0];
                    vars.push({
                        name: stateName,
                        setter,
                        initialValue: init?.getText(),
                        type: inferStateType(init?.getText()),
                        kind: 'useState',
                    });
                }
            }
        }

        // useRef
        if (callee === 'useRef' || callee.endsWith('.useRef')) {
            const parent = call.getParent();
            if (parent?.isKind(SyntaxKind.VariableDeclaration)) {
                const name = parent.getName();
                vars.push({ name, kind: 'useRef', type: 'ref' });
            }
        }

        // useForm (React Hook Form)
        if (callee === 'useForm' || callee.endsWith('.useForm')) {
            vars.push({ name: '__rhf__', kind: 'formLibrary', type: 'react-hook-form' });
        }

        // useFormik / Formik
        if (callee === 'useFormik') {
            vars.push({ name: '__formik__', kind: 'formLibrary', type: 'formik' });
        }
    });

    return vars;
}

function inferStateType(initialValue?: string): string {
    if (!initialValue) return 'string';
    if (initialValue === 'true' || initialValue === 'false') return 'boolean';
    if (initialValue === '0' || /^\d+$/.test(initialValue)) return 'number';
    if (initialValue.startsWith('{')) return 'object';
    if (initialValue.startsWith('[')) return 'array';
    return 'string';
}

// ── Event handler extraction ──────────────────────────────────

function extractEventHandlers(fn: FunctionLike): EventHandler[] {
    const handlers: EventHandler[] = [];
    const seen = new Set<string>();

    fn.forEachDescendant((node) => {
        // Find JSX attributes that are event handlers: onSubmit, onClick, onChange, etc.
        if (!node.isKind(SyntaxKind.JsxAttribute)) return;

        const name = node.getNameNode().getText();
        if (!/^on[A-Z]/.test(name)) return; // only event props

        // We only care about the "action" events for tool proposals
        if (!['onSubmit', 'onClick', 'onChange'].includes(name)) return;

        const initializer = node.getInitializer();
        if (!initializer?.isKind(SyntaxKind.JsxExpression)) return;

        const expr = initializer.getExpression();
        if (!expr) return;

        const handlerRef = expr.getText();
        // Skip inline trivial setters like (e) => setEmail(e.target.value)
        // We only want named handlers or arrow fns with meaningful bodies
        const isInlineArrow = expr.isKind(SyntaxKind.ArrowFunction);
        const isIdentifier = expr.isKind(SyntaxKind.Identifier);

        let handlerName: string;
        let handlerBody: string | undefined;
        let isAsync = false;

        if (isIdentifier) {
            handlerName = handlerRef;
            // Look up the actual function body
            const resolved = resolveHandlerBody(fn, handlerName);
            handlerBody = resolved?.body;
            isAsync = resolved?.isAsync ?? false;
        } else if (isInlineArrow) {
            const arrow = expr.asKind(SyntaxKind.ArrowFunction)!;
            const body = arrow.getBody();
            handlerBody = body.getText();
            // Skip trivial setters (single call like setEmail(e.target.value))
            if (isTrivialSetter(handlerBody)) return;
            handlerName = `inline_${name}_handler`;
            isAsync = arrow.isAsync();
        } else {
            return;
        }

        if (seen.has(handlerName)) return;
        seen.add(handlerName);

        const parentJsx = getParentJSXElement(node);
        const parentTag = parentJsx ? getTagName(parentJsx) : undefined;
        const parentId = parentJsx ? collectAttributes(parentJsx)['id'] : undefined;

        const apiCalls: NonNullable<EventHandler['apiCalls']> = handlerBody ? extractAPICalls(handlerBody) : [];

        handlers.push({
            name: handlerName,
            event: name,
            elementTag: parentTag,
            elementId: parentId,
            body: handlerBody,
            isAsync,
            apiCalls: apiCalls.length > 0 ? apiCalls : undefined,
        });
    });

    return handlers;
}

function isTrivialSetter(body: string): boolean {
    // e.g. "setEmail(e.target.value)" or "{ setName(e.target.value) }"
    return /^[\s{(]*set[A-Z]\w+\(/.test(body.trim());
}

function resolveHandlerBody(fn: FunctionLike, name: string): { body: string; isAsync: boolean } | null {
    let result: { body: string; isAsync: boolean } | null = null;

    fn.forEachDescendant((node) => {
        if (result) return;

        // const handleX = (e) => { ... }
        if (node.isKind(SyntaxKind.VariableDeclaration)) {
            if (node.getName() === name) {
                const init = node.getInitializer();
                const arrow = init?.asKind(SyntaxKind.ArrowFunction);
                const func = init?.asKind(SyntaxKind.FunctionExpression);
                const fn2 = arrow ?? func;
                if (fn2) {
                    result = { body: fn2.getBody().getText(), isAsync: fn2.isAsync() };
                }
            }
        }

        // function handleX(e) { ... }
        if (node.isKind(SyntaxKind.FunctionDeclaration)) {
            if (node.getName() === name) {
                result = { body: node.getBody()?.getText() ?? '', isAsync: node.isAsync() };
            }
        }
    });

    return result;
}

function getParentJSXElement(node: Node): JsxOpeningElement | JsxSelfClosingElement | null {
    let current: Node | undefined = node.getParent();
    while (current) {
        const asOpening = current.asKind(SyntaxKind.JsxOpeningElement);
        const asSelf = current.asKind(SyntaxKind.JsxSelfClosingElement);
        if (asOpening) return asOpening;
        if (asSelf) return asSelf;
        current = current.getParent();
    }
    return null;
}

type APICall = { method: string; url: string };

function extractAPICalls(body: string): APICall[] {
    const calls: APICall[] = [];
    // Match fetch('/api/...', { method: 'POST' })
    const fetchRe = /fetch\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*\{[^}]*method\s*:\s*['"`](\w+)['"`])?/g;
    let m: RegExpExecArray | null;
    while ((m = fetchRe.exec(body)) !== null) {
        calls.push({ url: m[1]!, method: (m[2] ?? 'GET').toUpperCase() });
    }
    // Match axios.post/delete/put/patch
    const axiosRe = /axios\.(post|put|patch|delete|get)\(\s*['"`]([^'"`]+)['"`]/g;
    while ((m = axiosRe.exec(body)) !== null) {
        calls.push({ url: m[2]!, method: m[1]!.toUpperCase() });
    }
    return calls;
}


// ── Binding ───────────────────────────────────────────────────

function bindStateToElements(stateVars: StateVariable[], elements: UIElement[]): void {
    for (const el of elements) {
        // value={email} → look for state var named "email"
        const valueExpr = el.attributes['value'] ?? el.attributes['checked'];
        if (!valueExpr) continue;

        // Direct: value={email}
        const direct = stateVars.find(v => v.name === valueExpr);
        if (direct) {
            el.stateBinding = { variable: direct.name, setter: direct.setter };
            continue;
        }

        // Object: value={form.email}
        const dotMatch = valueExpr.match(/^(\w+)\.(\w+)$/);
        if (dotMatch) {
            const [, obj, field] = dotMatch;
            const objVar = stateVars.find(v => v.name === obj);
            if (objVar) {
                el.stateBinding = { variable: field, setter: objVar.setter, accessPath: valueExpr };
            }
        }
    }
}

function bindHandlersToElements(handlers: EventHandler[], elements: UIElement[]): void {
    for (const handler of handlers) {
        // Match by elementTag + elementId already captured during extraction
        // Also: find the submit button for submit handlers
        if (handler.event === 'onSubmit') {
            const form = elements.find(el => el.tag === 'form');
            if (form && !form.attributes['__submitHandler']) {
                form.attributes['__submitHandler'] = handler.name;
            }
        }
    }
}

// ── Classification ────────────────────────────────────────────

function classifyComponentType(elements: UIElement[], handlers: EventHandler[]): ComponentType {
    const hasForms = elements.some(el => el.tag === 'form');
    const hasInputs = elements.some(el => ['input', 'textarea', 'select'].includes(el.tag));
    const hasButtons = elements.some(el => el.tag === 'button');
    const hasSubmit = handlers.some(h => h.event === 'onSubmit');

    if ((hasForms || hasSubmit) && hasInputs) return 'form';
    if (hasButtons && !hasInputs) return 'action';
    if (hasInputs || hasButtons) return 'mixed';
    return 'display';
}

// ── Props extraction ──────────────────────────────────────────

function extractProps(fn: FunctionLike): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Get first parameter
    const params = fn.getParameters();
    if (params.length === 0) return props;

    const firstParam = params[0];
    const typeNode = firstParam.getTypeNode();
    if (!typeNode) return props;

    // Walk object type literal: { name: string; required?: boolean }
    typeNode.forEachDescendant((node) => {
        if (node.isKind(SyntaxKind.PropertySignature)) {
            const name = node.getNameNode().getText();
            const optional = node.hasQuestionToken();
            const type = node.getTypeNode()?.getText() ?? 'unknown';
            props.push({ name, type, required: !optional });
        }
    });

    return props;
}
