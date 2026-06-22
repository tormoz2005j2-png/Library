import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "../src/index.js";

test("validDate accepts real dates and rejects calendar overflow", () => {
  assert.equal(__test.validDate("2026-02-28"), "2026-02-28");
  assert.throws(() => __test.validDate("2026-02-30"), /Некорректная дата/);
});

test("email and password validation", () => {
  assert.equal(__test.validEmail(" USER@example.com "), "user@example.com");
  assert.throws(() => __test.validEmail("wrong"), /email/);
  assert.throws(() => __test.validPassword("short"), /8 символов/);
});

test("catalog item rejects unsafe identifiers", () => {
  assert.throws(() => __test.normalizeItem({ id: "../x", title: "X", type: "Книга", status: "Хочу прочитать" }), /безопасный ID/);
});
