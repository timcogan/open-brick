import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { computeBounds, evaluateScad, parseScad, parseTemplateMetadata } from "../src/scad-engine.mjs";

const source = readFileSync(new URL("../scad/mechanical_axle.scad", import.meta.url), "utf8");
const metadata = parseTemplateMetadata(source, "mechanical_axle");
const ast = parseScad(source);

function defaultParams() {
  return Object.fromEntries(metadata.params.map((param) => [param.key, param.defaultValue]));
}

test("metadata exposes mechanical axle template and expected parameters", () => {
  assert.equal(metadata.id, "mechanical_axle");
  assert.equal(metadata.name, "Mechanical Axle");

  const keys = metadata.params.map((param) => param.key);
  assert.deepEqual(keys, ["L", "scale_percent"]);
});

test("default mechanical axle model generates non-empty geometry", () => {
  const triangles = evaluateScad(ast, defaultParams());
  assert.ok(triangles.length > 0);

  const bounds = computeBounds(triangles);
  assert.ok(bounds);
  assert.ok(bounds.size[0] > 0);
  assert.ok(bounds.size[1] > 0);
  assert.ok(bounds.size[2] > 0);
});

test("axle length grows when L increases", () => {
  const shortBounds = computeBounds(evaluateScad(ast, { ...defaultParams(), L: 2, scale_percent: 100 }));
  const longBounds = computeBounds(evaluateScad(ast, { ...defaultParams(), L: 6, scale_percent: 100 }));

  assert.ok(shortBounds && longBounds);
  assert.ok(longBounds.size[2] > shortBounds.size[2]);
});
