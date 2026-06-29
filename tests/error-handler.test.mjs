import assert from "node:assert/strict";
import test from "node:test";
import "./setup.mjs";

const { logError } = await import("../src/utils/errorHandler.ts");

test("logError calls console.error with formatted message", () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  logError(new Error("boom"), "test:ctx");
  console.error = original;
  assert.equal(logs.length, 1);
  assert.ok(logs[0][0].includes("test:ctx"));
  assert.ok(logs[0][1].includes("Error: boom"));
});

test("logError stringifies non-Error values", () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  logError("raw string", "misc");
  console.error = original;
  assert.equal(logs[0][1], "raw string");
});

test("logError handles null and undefined", () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  logError(null, "a");
  logError(undefined, "b");
  console.error = original;
  assert.equal(logs[0][1], "null");
  assert.equal(logs[1][1], "undefined");
});

test("logError handles objects", () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  logError({ code: 42 }, "obj");
  console.error = original;
  assert.ok(typeof logs[0][1] === "string" && logs[0][1].length > 0);
});
