import assert from "node:assert/strict";
import test from "node:test";
import "./setup.mjs";

const { logError, setErrorLogger } = await import("../src/utils/errorHandler.ts");

test("logError does nothing when no logger is set", () => {
  setErrorLogger(null);
  logError(new Error("boom"), "test:ctx");
});

test("logError formats Error instances with name and message", () => {
  const logs = [];
  setErrorLogger((message, ctx) => logs.push({ message, ctx }));
  logError(new TypeError("bad input"), "form:validate");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, "TypeError: bad input");
  assert.equal(logs[0].ctx, "form:validate");
});

test("logError stringifies non-Error values", () => {
  const logs = [];
  setErrorLogger((message, ctx) => logs.push({ message, ctx }));
  logError("raw string", "misc");
  assert.equal(logs[0].message, "raw string");
});

test("logError handles null and undefined", () => {
  const logs = [];
  setErrorLogger((message) => logs.push(message));
  logError(null, "a");
  logError(undefined, "b");
  assert.equal(logs[0], "null");
  assert.equal(logs[1], "undefined");
});

test("logError handles objects", () => {
  const logs = [];
  setErrorLogger((message) => logs.push(message));
  logError({ code: 42 }, "obj");
  assert.ok(typeof logs[0] === "string" && logs[0].length > 0);
});

test("setErrorLogger(null) clears the logger", () => {
  const logs = [];
  setErrorLogger((m) => logs.push(m));
  logError("first", "x");
  setErrorLogger(null);
  logError("second", "y");
  assert.equal(logs.length, 1);
  assert.equal(logs[0], "first");
});
