import Reactor, { useState, createElement } from "./reactor";
import htm from "htm";

const html = htm.bind(Reactor.createElement);
Reactor.createRoot(document.getElementById("app")!).render(createElement(App));

function App() {
    const [count, setCount] = useState(0);

    return html`
        <p>Count: ${count}</p>
        <button onclick=${() => setCount(count + 1)}>Increment counter</button>
        <hr />
        <${Container}>
            <${TodoList} />
        <//>
    `;
}

function Container({ children }: { children: Reactor.ReactorRenderable }) {
    return html`<section>${children}</section>`;
}

function TodoList() {
    const [items, setItems] = useState<string[]>([]);
    const [newItem, setNewItem] = useState("");

    function addItem() {
        setItems([...items, newItem]);
        setNewItem("");
    }

    function onchange(e: any) {
        setNewItem(e.target?.value);
    }

    return html`
        <div>
            <${List} type="ul" items=${items} />
            <input onchange=${onchange} value=${newItem} />
            <button onclick=${addItem}>Add</button>
        </div>
    `;
}

function List({ type, items }: { type: string; items: string[]; }) {
    return items.length > 0 
    ? html`<${type}>${items.map(item => html`<li>${item}</li>`)}<//>`
    : html`<p>No items</p>`;
}