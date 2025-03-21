# Reactor

A simple remake of React to understand how it works internally.

```js
import Reactor, { createElement, useState } from "./reactor";

Reactor.createRoot(document.getElementById("app")).render(createElement(App));

function App() {
    const [count, setCount] = useState(0);

    return [
        createElement("p", null, "Count: ", count),
        createElement("button", { onclick: () => setCount(count + 1) }, "Increment")
    ];
}
```

The Reactor library is contained entirely within `reactor.ts` for now. In `main.ts`, there is an example program made using Reactor with `htm`, as Reactor does not currently support JSX. You can also use the `createElement` function directly, as in React.

## Currently Supported Hooks
- `useState`