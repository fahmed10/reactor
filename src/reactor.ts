import * as self from "./reactor";
export default self;

type Arrayable<T> = T | T[];
export type FunctionComponent = (props: any) => ReactorRenderable;
export type ReactorRenderable = Arrayable<ReactorElement> | string | number | bigint | boolean | null | undefined;
export type ReactorKey = string | number | bigint | null | undefined;
// TODO: Add type for props
export interface ReactorElement<T = string | Symbol | FunctionComponent> {
    type: T;
    props: { children?: ReactorElement[], internal?: boolean, value?: any, [name: string]: any };
    key?: ReactorKey;
    domRef?: Node;
    domParent?: ReactorElement<string>;
    symbol?: Symbol;
}
interface FunctionComponentData {
    instance: ReactorElement<FunctionComponent>;
    state: any[];
    cache?: Arrayable<ReactorElement> | null;
    hooksCalled?: number;
}

let currentStateIndex = -1;
let hooksCalled = 0;
let componentStateChanged = false;
let componentRerenders = 0;
let renderingComponent: Symbol | null = null;
const componentMap: Map<Symbol, FunctionComponentData> = new Map();
const MAX_COMPONENT_RERENDERS = 10;
const NODE_SYMBOL = Symbol("reactor.node");
const FRAGMENT_SYMBOL = Symbol("reactor.fragment");
export const Fragment = ({ children, key }: { children?: ReactorElement[], key?: ReactorKey }) => wrapFragment(children, key, false);

export function createRoot(container: HTMLElement | null) {
    if (!container) {
        throw Error("Container passed to createRoot is null.");
    }

    return { render: (root: Arrayable<ReactorElement>) => render(container, root) };
}

export function createElement(type: string | FunctionComponent, props: any = null, ...children: ReactorRenderable[]): ReactorElement {
    if (typeof type === "string") {
        type = type.toUpperCase();
    } else if (typeof type !== "function") {
        throw Error(`Invalid component type passed to createElement. Component types must be a string or function, but got '${(type as any).toString()}' instead.`);
    }

    while (children.length === 1 && Array.isArray(children[0])) {
        children = children[0];
    }

    props ??= {};
    const key = props.key;
    delete props.key;
    props.children = children.map(c => nodeToElement(c));

    return { type, props, key };
}

export function useState<T>(defaultValue?: T): [T, (value: T) => void] {
    hooksCalled++;
    currentStateIndex++;
    // Capture current state index to use in state setter closure.
    const capturedStateIndex = currentStateIndex;
    const component = componentMap.get(getRenderingComponent())!;
    component.state[currentStateIndex] ??= defaultValue;

    return [component.state[currentStateIndex], (value: T) => {
        if (Object.is(component.state[capturedStateIndex], value)) {
            return;
        }

        component.state[capturedStateIndex] = value;

        if (renderingComponent) {
            if (component.instance.symbol !== renderingComponent) {
                console.error("While rendering, state setter functions can only be called from the component they belong to.");
                return;
            }

            componentStateChanged = true;
            return;
        }

        const cache = wrapElements(component.cache);
        const result = wrapElements(renderFunctionComponent(component.instance.domParent!, component.instance));
        renderDiff(component.instance.domParent!, cache, result);
    }];
}

export function useEffect(effect: () => void | (() => void), dependencies?: any[]) {
    hooksCalled++;
    return [effect, dependencies];
}

function detachElement(element: ReactorElement) {
    if (isFunctionComponent(element)) {
        const data = componentMap.get(element.symbol!)!.cache;
        wrapArray(data).forEach(e => detachElement(e));
    } else if (isFragment(element)) {
        element.props.children!.forEach((c: ReactorElement) => detachElement(c));
    } else {
        element.domRef!.parentElement?.removeChild(element.domRef!);
    }
}

function getComponentName(element: ReactorElement): string {
    if (isFunctionComponent(element)) {
        return `<${element.type.name}>`;
    } else if (isFragment(element)) {
        return "<Fragment>";
    } else if (isDomElement(element)) {
        return `<${element.type}>`;
    }

    return "#text";
}

function matchElements(old: ReactorElement[], current: ReactorElement[]): [ReactorElement?, ReactorElement?][] {
    const unmatched = [...old];
    const result: [ReactorElement?, ReactorElement?][] = [];

    const keys = current.filter(c => c.key != null).length;
    if (keys != 0 && keys != current.length) {
        console.error("All elements in a list should have a unique key prop assigned to them. Assigning keys to only some elements in a list can lead to unexpected behaviour.");
    }

    const keysSeen: ReactorKey[] = [];
    current.forEach(c => {
        if (c.key != null) {
            if (keysSeen.includes(c.key)) {
                console.error(`All elements in a list should have a unique key prop assigned to them. Found duplicate key '${c.key}' on ${getComponentName(c)} element.`);
            }
            keysSeen.push(c.key);

            const match = unmatched.findIndex(o => o.key === c.key);
            if (match !== -1) {
                result.push([unmatched.splice(match, 1)[0], c]);
            } else {
                result.push([undefined, c]);
            }
        } else {
            result.push([unmatched.shift(), c]);
        }
    });

    result.push(...unmatched.map(o => [o] as [ReactorElement]));
    return result;
}

function getComponentCachedSize(element: ReactorElement): number {
    if (isFunctionComponent(element)) {
        return wrapArray(componentMap.get(element.symbol!)!.cache).map(c => getComponentCachedSize(c)).reduce((a, b) => a + b, 0);
    } else if (isFragment(element)) {
        return element.props.children!.map(c => getComponentCachedSize(c)).reduce((a, b) => a + b, 0);
    }

    return 1;
}

function containsComponentInCache(container: ReactorElement, element: ReactorElement): boolean {
    if (container === element) {
        return true;
    }

    if (isFunctionComponent(container)) {
        return wrapArray(componentMap.get(container.symbol!)!.cache).some(c => containsComponentInCache(c, element));
    } else if (isFragment(container) || isDomElement(container)) {
        return container.props.children!.some(c => containsComponentInCache(c, element));
    }

    return false;
}

function insertElementAtIndex(parent: HTMLElement, child: Node, index: number) {
    if (index > parent.childNodes.length) {
        throw Error("Invalid index.");
    } else if (index === parent.childNodes.length) {
        parent.appendChild(child)
    } else {
        parent.insertBefore(child, parent.childNodes[index])
    }
}

function insertElement(root: ReactorElement<string>, element: ReactorElement) {
    const rootDom = root.domRef as HTMLElement;

    if (rootDom.childNodes.length === 0) {
        wrapArray(toHtmlNode(root, element)).forEach(e => rootDom.appendChild(e));
        return;
    }

    const elementsBefore = root.props.children!.slice(0, root.props.children!.findIndex(c => containsComponentInCache(c, element)));
    let index = elementsBefore.map(c => getComponentCachedSize(c)).reduce((a, b) => a + b, 0);
    wrapArray(toHtmlNode(root, element)).forEach(e => insertElementAtIndex(rootDom, e, index++));
}

function renderDiff(root: ReactorElement<string>, old?: ReactorElement | null, current?: ReactorElement | null) {
    if (old == null && current == null) {
        return;
    }

    if (old == null) {
        insertElement(root, current!);
        return;
    }

    if (current == null) {
        detachElement(old);
        return;
    }

    if (areElementsSame(old, current)) {
        if (isFunctionComponent(current)) {
            current.symbol = old.symbol;
            current.domParent = old.domParent;
            const oldTree = wrapArray(componentMap.get(current.symbol!)!.cache);
            const currentTree = wrapArray(renderFunctionComponent(root, current));
            matchElements(oldTree, currentTree).forEach(([o, c]) => renderDiff(root, o, c));
        } else if (isFragment(current)) {
            if (!current.props.internal && current.props.children!.some(c => c.key == null)) {
                console.error("All elements in a list should have a unique key prop assigned to them. Not assigning a key prop can lead to unexpected behaviour and degraded performance.");
            }

            matchElements(old.props.children!, current.props.children!).forEach(([o, c]) => renderDiff(root, o, c));
        } else {
            current.domRef = old.domRef!;

            if (current.props.children) {
                copyPropertiesToHtmlElement(current as ReactorElement<string>, current.domRef as HTMLElement);
                matchElements(old.props.children!, current.props.children).forEach(([o, c]) => renderDiff(current as ReactorElement<string>, o, c));
            } else if (old.props.value !== current.props.value) {
                current.domRef.nodeValue = current.props.value;
            }
        }
    } else {
        detachElement(old);
        insertElement(root, current);
    }
}

function areElementsSame(a: ReactorElement, b: ReactorElement): boolean {
    return a.type === b.type;
}

function render(container: HTMLElement, root: Arrayable<ReactorElement>) {
    renderDiff({ type: container.tagName, props: { children: [] }, domRef: container }, null, wrapElements(root));
}

function wrapArray<T>(value?: Arrayable<T> | null): T[] {
    if (value == null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function wrapElements(value?: Arrayable<ReactorElement> | null): ReactorElement | null | undefined {
    return Array.isArray(value) ? wrapFragment(value) : value;
}

function wrapFragment(value: Arrayable<ReactorElement> | null | undefined, key?: ReactorKey, internal: boolean = true): ReactorElement<typeof FRAGMENT_SYMBOL> {
    return { type: FRAGMENT_SYMBOL, props: { children: wrapArray(value), internal }, key };
}

function copyPropertiesToHtmlElement(element: ReactorElement<string>, domElement: HTMLElement) {
    Object.keys(element.props).filter(k => k !== "children" && (domElement as any)[k] !== element.props[k]).forEach(k => (domElement as any)[k] = element.props[k]);
}

function toHtmlNode(root: ReactorElement<string>, element: ReactorElement): Arrayable<Node> {
    if (isFunctionComponent(element)) {
        return wrapArray(renderFunctionComponent(root, element)).flatMap(e => toHtmlNode(root, e));
    }

    if (isDomElement(element)) {
        const domElement = document.createElement(element.type);
        copyPropertiesToHtmlElement(element, domElement);
        element.domRef = domElement;
        domElement.replaceChildren(...element.props.children!.flatMap(c => toHtmlNode(element, c)));
        return domElement;
    }

    if (isFragment(element)) {
        return element.props.children!.flatMap(c => toHtmlNode(root, c));
    }

    const domNode = document.createTextNode(element.props.value);
    element.domRef = domNode;
    return domNode;
}

function isFunctionComponent(component: ReactorElement): component is ReactorElement<FunctionComponent> {
    return typeof component.type === "function";
}

function isFragment(component: ReactorElement): component is ReactorElement<typeof FRAGMENT_SYMBOL> {
    return component.type === FRAGMENT_SYMBOL;
}

function isDomElement(component: ReactorElement): component is ReactorElement<string> {
    return typeof component.type === "string";
}

function nodeToElement(node: ReactorRenderable) {
    if (typeof node === "boolean") {
        return null;
    }

    if (typeof node === "object" || node == null) {
        return node;
    }

    return { type: NODE_SYMBOL, props: { value: node.toString() } };
}

function getRenderingComponent(): Symbol {
    if (!renderingComponent) {
        throw Error("Invalid hook call. Hooks can only be called inside of functional components.");
    }

    return renderingComponent;
}

function renderFunctionComponent(domParent: ReactorElement<string>, component: ReactorElement<FunctionComponent>): Arrayable<ReactorElement> {
    component.domParent = domParent;
    component.symbol ??= Symbol(`<${component.type.name}>`);
    renderingComponent = component.symbol;

    if (!componentMap.has(renderingComponent)) {
        componentMap.set(renderingComponent, { instance: component, state: [] });
    }
    const componentData = componentMap.get(renderingComponent)!;

    componentRerenders = 0;
    let element;
    do {
        componentStateChanged = false;
        hooksCalled = 0;
        currentStateIndex = -1;
        element = nodeToElement(component.type(component.props));
        componentRerenders++;

        if (componentData.hooksCalled !== undefined && hooksCalled != componentData.hooksCalled) {
            console.error(`The number of hooks called by component ${getComponentName(component)} has changed between renders.`);
        }

        componentData.hooksCalled = hooksCalled;

        if (componentRerenders > MAX_COMPONENT_RERENDERS) {
            console.error("You are calling a state setter function on every render, causing an infinite loop. Setting state while rendering should only be done conditionally.");
            break;
        }
    } while (componentStateChanged);

    renderingComponent = null;
    componentData.cache = element;
    return element ?? [];
}

if (process.env.NODE_ENV === "test") { [matchElements, getComponentCachedSize, containsComponentInCache, insertElement, insertElementAtIndex, areElementsSame, wrapArray, wrapElements, wrapFragment].forEach((fn: Function) => module.exports[fn.name] = fn); }