import Reactor, { useState } from "./reactor";
import htm from "htm";

const html = htm.bind(Reactor.createElement);
Reactor.createRoot(document.getElementById("app")!).render(html`<${Container}><${App} /><//>`);

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
        setItems([...items, crypto.randomUUID()]);
        setNewItem("");
    }

    function addItemAtStart() {
        setItems([crypto.randomUUID(), ...items]);
        setNewItem("");
    }

    function onchange(e: any) {
        setNewItem(e.target?.value);
    }

    return html`
        <div>
            <${List} type="ul" items=${items} />
                <div style="display: flex; gap: 0.5rem;">
                    <input onchange=${onchange} value=${newItem} />
                    <button onclick=${addItem}>Add</button>
                    <button onclick=${addItemAtStart}>Add at start</button>
                </div>
        </div>
    `;
}

function List({ type, items }: { type: string, items: string[] }) {
    return items.length > 0
        ? html`<${type}>${items.map(item => html`<li key=${item}>
        <${StatefulCounter} /><p>${item}</p>
        </li>`)}<//>`
        : html`<p>No items</p>`;
}

export function StatefulCounter() {
    const [count, setCount] = useState(0);

    if (count === 5) {
        setCount(0);
    }

    return html`<p style="user-select: none;" onclick=${() => setCount(count + 1)}>${count}</p>`;
}