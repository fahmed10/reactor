const reactor = require("../reactor")!;

test("wrapArray", () => {
    expect(reactor.wrapArray([1, 2, 3])).toEqual([1, 2, 3]);
    expect(reactor.wrapArray(5)).toEqual([5]);
});