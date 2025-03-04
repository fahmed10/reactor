import Reactor, { useState, createElement } from "./reactor"

Reactor.createRoot(document.getElementById("app")!).render(createElement(App));

function App() {
    const [count, setCount] = useState(0);

    return [
        createElement("p", null, "Count: ", count),
        createElement("button", { onclick: () => setCount(count + 1) }, "Increment counter"),
        createElement("hr"),
        createElement(Container, null,
            createElement(TodoList)
        )
    ];
}

function Container({ children }: { children: Reactor.ReactorRenderable }) {
    return createElement("section", null, children);
}

function TodoList() {
    const [items, setItems] = useState<string[]>([]);
    const [newItem, setNewItem] = useState("");

    function addItem() {
        setItems([...items, newItem]);
    }

    function onchange(e: any) {
        setNewItem(e.target?.value);
    }

    return createElement("div", null,
        createElement(List, { type: "ul", items }),
        createElement("input", { onchange, value: newItem }),
        createElement("button", { onclick: addItem }, "Add")
    );
}

function List({ type, items }: { type: "ul" | "ol"; items: string[]; }) {
    return items.length > 0 ? createElement(type, null,
        ...items.map(item => createElement("li", null, item))
    ) : createElement("p", null, "No items");
}