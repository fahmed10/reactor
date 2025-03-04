import * as self from "./reactor.js";
export default self;

type Arrayable<T> = T | T[];
export type FunctionComponent = (props: any) => ReactorRenderable;
export type ReactorRenderable = Arrayable<ReactorElement> | string | number;
type ReactorDOMElement = ReactorElement<string | Symbol>;
// TODO: Add type for props
export interface ReactorElement<T = string | Symbol | FunctionComponent> {
    type: T;
    props: any;
    domRef?: Node;
    domParent?: ReactorElement<string>;
    symbol?: Symbol;
}
interface FunctionComponentData {
    instance: ReactorElement<FunctionComponent>;
    state: any[];
    cache?: Arrayable<ReactorElement>;
}

let currentStateIndex = -1;
let renderingComponent: Symbol | null = null;
const componentMap: Map<Symbol, FunctionComponentData> = new Map();
const NODE_SYMBOL = Symbol("reactor.node");
const FRAGMENT_SYMBOL = Symbol("reactor.fragment");

export function createRoot(container: HTMLElement) {
    return { render: (root: ReactorElement) => render(container, root) };
}

export function createElement(type: string | FunctionComponent, props: any = null, ...children: ReactorRenderable[]): ReactorElement {
    if (typeof type === "string") {
        type = type.toUpperCase();
    }

    while (children.length === 1 && Array.isArray(children[0])) {
        children = children[0];
    }

    props ??= {};
    props.children = children.map(c => nodeToElement(c));

    return { type, props };
}

export function useState<T>(defaultValue: T): [T, (value: T) => void] {
    currentStateIndex++;
    const capturedStateIndex = currentStateIndex;
    const component = componentMap.get(getRenderingComponent())!;
    component.state[currentStateIndex] ??= defaultValue;

    return [component.state[currentStateIndex], (value: T) => {
        if (component.state[capturedStateIndex] === value) {
            return;
        }

        component.state[capturedStateIndex] = value;
        const cache = wrapFragment(component.cache);
        const result = wrapFragment(renderFunctionComponent(component.instance.domParent!, component.instance));
        renderDiff(component.instance.domParent!, cache, result);
    }];
}

function detachElement(element: ReactorElement) {
    if (isFunctionComponent(element)) {
        const data = componentMap.get(element.symbol!)!.cache;
        wrapArray(data).forEach(e => detachElement(e));
    } else if (isFragment(element)) {
        element.props.children.forEach((c: ReactorElement) => detachElement(c));
    } else {
        element.domRef!.parentElement?.removeChild(element.domRef!);
    }
}

function zipArrays<T>(a: T[], b: T[]): [T, T][] {
    return Array.from({ length: Math.max(a.length, b.length) }).map((_, i) => [a[i], b[i]]);
}

function renderDiff(root: ReactorElement<string>, old?: ReactorElement, nov?: ReactorElement) {
    if (old == null && nov == null) {
        return;
    }

    if (old == null) {
        wrapArray(toHtmlNode(root, nov!)).forEach(e => (root.domRef as HTMLElement).appendChild(e));
        return;
    }

    if (nov == null) {
        detachElement(old);
        return;
    }

    if (areElementsSame(old, nov)) {
        if (isFunctionComponent(nov)) {
            nov.symbol = old.symbol;
            nov.domParent = old.domParent;
            const oldTree = wrapArray(componentMap.get(nov.symbol!)!.cache);
            const newTree = wrapArray(renderFunctionComponent(root, nov));
            zipArrays(oldTree, newTree).forEach(([o, n]) => renderDiff(root, o, n));
        } else if (isFragment(nov)) {
            zipArrays<ReactorElement>(old.props.children, nov.props.children).forEach(([o, n]) => renderDiff(root, o, n));
        } else {
            nov.domRef = old.domRef!;

            if (nov.props.children) {
                copyPropertiesToHtmlElement(nov as ReactorElement<string>, nov.domRef as HTMLElement);
                zipArrays<ReactorElement>(old.props.children, nov.props.children).forEach(([o, n]) => renderDiff(nov as ReactorElement<string>, o, n));
            } else if (old.props.value !== nov.props.value) {
                nov.domRef.nodeValue = nov.props.value;
            }
        }
    } else {
        (old.domRef as HTMLElement).replaceWith(...wrapArray(toHtmlNode(root, nov)));
    }
}

function areElementsSame(a: ReactorElement, b: ReactorElement): boolean {
    return a.type === b.type;
}

function render(container: HTMLElement, root: ReactorElement) {
    renderDiff({ type: container.tagName, props: {}, domRef: container }, undefined, root);
}

function wrapArray<T>(value?: Arrayable<T>): T[] {
    if (value == null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function wrapFragment(value?: Arrayable<ReactorElement>): ReactorElement<typeof FRAGMENT_SYMBOL> {
    return { type: FRAGMENT_SYMBOL, props: { children: wrapArray(value) } };
}

function copyPropertiesToHtmlElement(element: ReactorElement<string>, domElement: HTMLElement) {
    Object.keys(element.props).filter(k => k !== "children" && (domElement as any)[k] !== element.props[k]).forEach(k => (domElement as any)[k] = element.props[k]);
}

function toHtmlNode(root: ReactorElement<string>, element: ReactorElement): Arrayable<Node> {
    if (isFunctionComponent(element)) {
        return wrapArray(renderFunctionComponent(root, element)).flatMap(e => toHtmlNode(root, e));
    }

    if (typeof element.type === "string") {
        const domElement = document.createElement(element.type);
        copyPropertiesToHtmlElement(element as ReactorElement<string>, domElement);
        element.domRef = domElement;
        const children: ReactorDOMElement[] = element.props.children;
        domElement.replaceChildren(...children.flatMap(c => toHtmlNode(element as ReactorElement<string>, c)));
        return domElement;
    }

    if (isFragment(element)) {
        const children: ReactorDOMElement[] = element.props.children;
        return children.flatMap(c => toHtmlNode(root, c));
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

function nodeToElement(node: ReactorRenderable) {
    if (typeof node === "object") {
        return node;
    }

    return { type: NODE_SYMBOL, props: { value: node } };
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

    currentStateIndex = -1;
    const element = nodeToElement(component.type(component.props));
    renderingComponent = null;
    componentData.cache = element;
    return element;
}