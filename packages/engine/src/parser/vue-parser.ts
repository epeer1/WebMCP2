import { parse, compileTemplate, SFCTemplateBlock } from '@vue/compiler-sfc';
import { basename, extname } from 'node:path';
import type {
    ComponentAnalysis,
    ComponentInfo,
    UIElement,
    EventHandler,
    StateVariable
} from '../types.js';

// ── Public entry point ────────────────────────────────────────

export function parseVueFile(source: string, fileName: string): ComponentAnalysis {
    const componentName = basename(fileName, extname(fileName));
    const { descriptor } = parse(source);

    const elements: UIElement[] = [];
    const eventHandlers: EventHandler[] = [];
    const stateVariables: StateVariable[] = [];

    // 1. Parse Script to find state and handlers
    if (descriptor.scriptSetup) {
        const scriptContent = descriptor.scriptSetup.content;
        // Basic extraction of ref() and reactive()
        const refRegex = /const\s+([a-zA-Z0-9_]+)\s*=\s*(ref|reactive)\(/g;
        let match;
        while ((match = refRegex.exec(scriptContent)) !== null) {
            stateVariables.push({
                name: match[1],
                kind: 'other',
                type: match[2] // 'ref' or 'reactive'
            });
        }

        // Basic extraction of functions
        const fnRegex = /(?:const|function)\s+([a-zA-Z0-9_]+)\s*=?\s*(?:async\s*)?(?:\([^)]*\)\s*=>|\()/g;
        while ((match = fnRegex.exec(scriptContent)) !== null) {
            const fnName = match[1];
            if (fnName !== 'ref' && fnName !== 'reactive') {
                eventHandlers.push({
                    name: fnName,
                    event: 'unknown',
                    isAsync: scriptContent.includes(`async function ${fnName}`) || scriptContent.includes(`async () =>`) // heuristic
                });
            }
        }
    }

    // 2. Parse Template to find elements
    if (descriptor.template) {
        const compiled = compileTemplate({
            source: descriptor.template.content,
            filename: fileName,
            id: 'mock-id'
        });

        // Fall back to a regex-based extraction of the template if AST isn't fully exposed in a simple way
        // In a real implementation we would walk the Vue AST compiler.ast, but for now we'll do a basic
        // regex extraction similar to the HTML walker for simplicity, focusing on standard interactive elements.
        const templateContent = descriptor.template.content;

        // We'll extract v-model bindings and basic standard elements
        const tagRegex = /<([a-zA-Z0-9_-]+)([^>]*)>/g;
        let tagMatch;

        let currentFormId: string | undefined = undefined;
        let formDepth = 0;

        while ((tagMatch = tagRegex.exec(templateContent)) !== null) {
            const tag = tagMatch[1].toLowerCase();
            const attrsStr = tagMatch[2];

            const attrs: Record<string, string> = {};
            const attrRegex = /([a-zA-Z0-9_:-@]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
                const name = attrMatch[1];
                const val = attrMatch[2] || attrMatch[3] || attrMatch[4] || '';
                attrs[name] = val;
            }

            if (tag === 'form') {
                formDepth++;
                currentFormId = attrs['id'];
                elements.push({
                    tag: 'form',
                    id: attrs['id'],
                    name: attrs['name'],
                    attributes: attrs
                });

                // Extract submit handler
                const submitAttr = Object.keys(attrs).find(k => k.startsWith('@submit') || k.startsWith('v-on:submit'));
                if (submitAttr) {
                    const handlerName = attrs[submitAttr];
                    const existing = eventHandlers.find(h => h.name === handlerName);
                    if (existing) {
                        existing.event = 'onSubmit';
                        existing.elementTag = 'form';
                    } else {
                        eventHandlers.push({
                            name: handlerName,
                            event: 'onSubmit',
                            elementTag: 'form',
                            isAsync: false
                        });
                    }
                }
            }

            if (['input', 'textarea', 'select', 'button'].includes(tag)) {
                const el: UIElement = {
                    tag,
                    id: attrs['id'],
                    name: attrs['name'],
                    inputType: attrs['type'],
                    label: attrs['placeholder'] ?? attrs['aria-label'],
                    attributes: attrs,
                    parentFormId: formDepth > 0 ? currentFormId : undefined
                };

                // v-model binding
                const vModel = attrs['v-model'];
                if (vModel) {
                    el.stateBinding = {
                        variable: vModel
                    };
                }

                // click binding
                const clickAttr = Object.keys(attrs).find(k => k.startsWith('@click') || k.startsWith('v-on:click'));
                if (clickAttr) {
                    const handlerName = attrs[clickAttr];
                    const existing = eventHandlers.find(h => h.name === handlerName);
                    if (existing) {
                        existing.event = 'onClick';
                        existing.elementTag = tag;
                    } else {
                        eventHandlers.push({
                            name: handlerName,
                            event: 'onClick',
                            elementTag: tag,
                            isAsync: false
                        });
                    }
                }

                elements.push(el);
            }
        }
    }

    const component: ComponentInfo = {
        name: componentName,
        type: elements.some(e => ['input'].includes(e.tag)) ? 'form' : 'display',
        elements,
        eventHandlers,
        stateVariables,
        props: []
    };

    return {
        fileName,
        framework: 'vue',
        components: elements.length > 0 ? [component] : []
    };
}
