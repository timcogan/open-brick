import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { computeBounds, evaluateScad, parseScad, parseTemplateMetadata } from "../src/scad-engine.mjs";

const source = readFileSync(new URL("../scad/classic_tile.scad", import.meta.url), "utf8");
const metadata = parseTemplateMetadata(source, "classic_tile");
const ast = parseScad(source);

function defaultParams() {
  return Object.fromEntries(metadata.params.map((param) => [param.key, param.defaultValue]));
}

test("metadata exposes classic tile template and expected parameters", () => {
  assert.equal(metadata.id, "classic_tile");
  assert.equal(metadata.name, "Classic Tile");

  const keys = metadata.params.map((param) => param.key);
  assert.deepEqual(keys, ["X", "Y", "scale_percent"]);
});

test("default tile model generates non-empty geometry", () => {
  const triangles = evaluateScad(ast, defaultParams());
  assert.ok(triangles.length > 0);

  const bounds = computeBounds(triangles);
  assert.ok(bounds);
  assert.ok(bounds.size[0] > 0);
  assert.ok(bounds.size[1] > 0);
  assert.ok(bounds.size[2] > 0);
});

test("1x1 tile configuration generates valid geometry", () => {
  const params = { ...defaultParams(), X: 1, Y: 1, scale_percent: 100 };
  const triangles = evaluateScad(ast, params);
  const bounds = computeBounds(triangles);

  assert.ok(triangles.length > 0);
  assert.ok(bounds);
  assert.ok(bounds.size[0] > 0);
  assert.ok(bounds.size[1] > 0);
  assert.ok(bounds.size[2] > 0);
});
