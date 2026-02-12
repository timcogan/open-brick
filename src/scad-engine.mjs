const SYMBOL_SET = new Set(["(", ")", "{", "}", "[", "]", ",", ":", ";", "=", "+", "-", "*", "/"]);

export function parseTemplateMetadata(source, fallbackId = "brick") {
  const metadata = {
    id: fallbackId,
    name: fallbackId,
    description: "",
    params: [],
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("// @")) {
      continue;
    }

    const command = line.slice(4).trim();
    if (command.startsWith("id ")) {
      metadata.id = command.slice(3).trim();
      continue;
    }

    if (command.startsWith("name ")) {
      metadata.name = command.slice(5).trim();
      continue;
    }

    if (command.startsWith("description ")) {
      metadata.description = command.slice(12).trim();
      continue;
    }

    if (command.startsWith("param ")) {
      const fields = command
        .slice(6)
        .split("|")
        .map((part) => part.trim());

      if (fields.length < 6) {
        throw new Error(`Invalid @param metadata: ${line}`);
      }

      const [key, label, min, max, step, defaultValue] = fields;
      metadata.params.push({
        key,
        label,
        min: Number(min),
        max: Number(max),
        step: Number(step),
        defaultValue: Number(defaultValue),
      });
    }
  }

  return metadata;
}

export function parseScad(source) {
  const parser = new Parser(tokenize(source));
  return parser.parseProgram();
}

export function evaluateScad(program, inputParams = {}) {
  const rootScope = Object.create(null);
  Object.assign(rootScope, inputParams);
  return evaluateStatements(program.statements, rootScope);
}

export function computeBounds(triangles) {
  if (triangles.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const triangle of triangles) {
    for (const point of triangle) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      minZ = Math.min(minZ, point[2]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
      maxZ = Math.max(maxZ, point[2]);
    }
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
  };
}

export function toAsciiStl(triangles, solidName = "open_brick") {
  const lines = [`solid ${sanitizeSolidName(solidName)}`];

  for (const triangle of triangles) {
    const n = computeNormal(triangle);
    lines.push(`  facet normal ${formatFloat(n[0])} ${formatFloat(n[1])} ${formatFloat(n[2])}`);
    lines.push("    outer loop");
    lines.push(`      vertex ${formatFloat(triangle[0][0])} ${formatFloat(triangle[0][1])} ${formatFloat(triangle[0][2])}`);
    lines.push(`      vertex ${formatFloat(triangle[1][0])} ${formatFloat(triangle[1][1])} ${formatFloat(triangle[1][2])}`);
    lines.push(`      vertex ${formatFloat(triangle[2][0])} ${formatFloat(triangle[2][1])} ${formatFloat(triangle[2][2])}`);
    lines.push("    endloop");
    lines.push("  endfacet");
  }

  lines.push(`endsolid ${sanitizeSolidName(solidName)}`);
  return lines.join("\n");
}

export function buildResolvedScadSource(source, params) {
  const head = Object.entries(params)
    .map(([name, value]) => `${name} = ${trimNumber(value)};`)
    .join("\n");

  return `${head}\n\n${source.trim()}\n`;
}

export function computeNormal(triangle) {
  const a = triangle[0];
  const b = triangle[1];
  const c = triangle[2];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

function sanitizeSolidName(name) {
  return name.replace(/[^A-Za-z0-9_\-]/g, "_");
}

function trimNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(6)));
}

function formatFloat(value) {
  return Number(value).toFixed(6);
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;

  function current() {
    return source[index];
  }

  function next() {
    return source[index + 1];
  }

  function advance(amount = 1) {
    for (let i = 0; i < amount; i += 1) {
      if (source[index] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      index += 1;
    }
  }

  function add(type, value, tokenLine = line, tokenColumn = column) {
    tokens.push({ type, value, line: tokenLine, column: tokenColumn });
  }

  while (index < source.length) {
    const ch = current();

    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    if (ch === "/" && next() === "/") {
      while (index < source.length && current() !== "\n") {
        advance();
      }
      continue;
    }

    if (ch === "/" && next() === "*") {
      advance(2);
      while (index < source.length && !(current() === "*" && next() === "/")) {
        advance();
      }
      if (index >= source.length) {
        throw new Error("Unterminated block comment.");
      }
      advance(2);
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(next()))) {
      const tokenLine = line;
      const tokenColumn = column;
      let raw = "";
      let hasDot = false;

      while (index < source.length) {
        const char = current();
        if (char === ".") {
          if (hasDot) {
            break;
          }
          hasDot = true;
          raw += char;
          advance();
          continue;
        }

        if (!/[0-9]/.test(char)) {
          break;
        }

        raw += char;
        advance();
      }

      add("number", Number(raw), tokenLine, tokenColumn);
      continue;
    }

    if (/[$A-Za-z_]/.test(ch)) {
      const tokenLine = line;
      const tokenColumn = column;
      let raw = "";
      while (index < source.length && /[$A-Za-z0-9_]/.test(current())) {
        raw += current();
        advance();
      }
      add("identifier", raw, tokenLine, tokenColumn);
      continue;
    }

    if (SYMBOL_SET.has(ch)) {
      add("symbol", ch, line, column);
      advance();
      continue;
    }

    throw new Error(`Invalid token '${ch}' at ${line}:${column}`);
  }

  tokens.push({ type: "eof", value: "<eof>", line, column });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  parseProgram() {
    const statements = [];
    while (!this.is("eof")) {
      statements.push(this.parseStatement());
    }
    return { type: "program", statements };
  }

  parseStatement() {
    if (this.isIdentifier("for")) {
      return this.parseFor();
    }

    if (this.is("identifier") && this.peek(1).type === "symbol" && this.peek(1).value === "=") {
      return this.parseAssignment();
    }

    const call = this.parseCall();
    this.matchSymbol(";");
    return { type: "call", call };
  }

  parseAssignment() {
    const name = this.consumeIdentifier();
    this.consumeSymbol("=");
    const expression = this.parseExpression();
    this.matchSymbol(";");
    return {
      type: "assignment",
      name,
      expression,
    };
  }

  parseFor() {
    this.consumeIdentifier("for");
    this.consumeSymbol("(");
    const variable = this.consumeIdentifier();
    this.consumeSymbol("=");
    this.consumeSymbol("[");

    const start = this.parseExpression();
    this.consumeSymbol(":");
    let middle = this.parseExpression();
    let step = null;
    let end = middle;

    if (this.matchSymbol(":")) {
      step = middle;
      end = this.parseExpression();
    }

    this.consumeSymbol("]");
    this.consumeSymbol(")");
    const body = this.parseBlock();

    return {
      type: "for",
      variable,
      start,
      step,
      end,
      body,
    };
  }

  parseBlock() {
    this.consumeSymbol("{");
    const statements = [];

    while (!this.matchSymbol("}")) {
      if (this.is("eof")) {
        throw this.error("Unterminated block. Missing '}'.");
      }
      statements.push(this.parseStatement());
    }

    return { type: "block", statements };
  }

  parseCall() {
    const name = this.consumeIdentifier();
    this.consumeSymbol("(");
    const args = this.parseArgs();
    this.consumeSymbol(")");
    let block = null;

    if (this.isSymbol("{")) {
      block = this.parseBlock();
    }

    return {
      type: "invocation",
      name,
      args,
      block,
    };
  }

  parseArgs() {
    const positional = [];
    const named = Object.create(null);

    if (this.isSymbol(")")) {
      return { positional, named };
    }

    while (true) {
      if (this.is("identifier") && this.peek(1).type === "symbol" && this.peek(1).value === "=") {
        const key = this.consumeIdentifier();
        this.consumeSymbol("=");
        named[key] = this.parseExpression();
      } else {
        positional.push(this.parseExpression());
      }

      if (!this.matchSymbol(",")) {
        break;
      }
    }

    return { positional, named };
  }

  parseExpression() {
    return this.parseAdditive();
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (this.isSymbol("+") || this.isSymbol("-")) {
      const operator = this.consumeSymbol().value;
      const right = this.parseMultiplicative();
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  parseMultiplicative() {
    let node = this.parseUnary();
    while (this.isSymbol("*") || this.isSymbol("/")) {
      const operator = this.consumeSymbol().value;
      const right = this.parseUnary();
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  parseUnary() {
    if (this.isSymbol("-")) {
      this.consumeSymbol("-");
      return { type: "unary", operator: "-", argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.matchSymbol("(")) {
      const expression = this.parseExpression();
      this.consumeSymbol(")");
      return expression;
    }

    if (this.isSymbol("[")) {
      return this.parseArray();
    }

    if (this.is("number")) {
      return { type: "literal", value: this.consume("number").value };
    }

    if (this.is("identifier")) {
      const value = this.consumeIdentifier();
      if (value === "true") {
        return { type: "literal", value: true };
      }
      if (value === "false") {
        return { type: "literal", value: false };
      }
      return { type: "variable", name: value };
    }

    throw this.error(`Unexpected token: ${this.peek().value}`);
  }

  parseArray() {
    this.consumeSymbol("[");
    const items = [];
    if (!this.matchSymbol("]")) {
      do {
        items.push(this.parseExpression());
      } while (this.matchSymbol(","));
      this.consumeSymbol("]");
    }

    return { type: "array", items };
  }

  is(type) {
    return this.peek().type === type;
  }

  isIdentifier(expected) {
    return this.is("identifier") && this.peek().value === expected;
  }

  isSymbol(value) {
    return this.is("symbol") && this.peek().value === value;
  }

  matchSymbol(value) {
    if (this.isSymbol(value)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  consume(type) {
    if (!this.is(type)) {
      throw this.error(`Expected token ${type}, found ${this.peek().type}`);
    }
    const token = this.peek();
    this.index += 1;
    return token;
  }

  consumeSymbol(value) {
    const token = this.consume("symbol");
    if (value && token.value !== value) {
      throw this.error(`Expected symbol '${value}', found '${token.value}'`);
    }
    return token;
  }

  consumeIdentifier(value) {
    const token = this.consume("identifier");
    if (value && token.value !== value) {
      throw this.error(`Expected '${value}', found '${token.value}'`);
    }
    return token.value;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset] ?? this.tokens[this.tokens.length - 1];
  }

  error(message) {
    const token = this.peek();
    return new Error(`${message} (line ${token.line}, col ${token.column})`);
  }
}

function evaluateStatements(statements, scope) {
  const triangles = [];
  for (const statement of statements) {
    triangles.push(...evaluateStatement(statement, scope));
  }
  return triangles;
}

function evaluateStatement(statement, scope) {
  switch (statement.type) {
    case "assignment": {
      scope[statement.name] = evaluateExpression(statement.expression, scope);
      return [];
    }
    case "call":
      return evaluateCall(statement.call, scope);
    case "for":
      return evaluateFor(statement, scope);
    default:
      throw new Error(`Unsupported statement type: ${statement.type}`);
  }
}

function evaluateFor(statement, scope) {
  const start = toNumber(evaluateExpression(statement.start, scope));
  const end = toNumber(evaluateExpression(statement.end, scope));
  const step = statement.step ? toNumber(evaluateExpression(statement.step, scope)) : start <= end ? 1 : -1;

  if (step === 0) {
    throw new Error("For-loop step cannot be 0.");
  }

  const triangles = [];
  if (step > 0) {
    for (let value = start; value <= end + 1e-9; value += step) {
      const loopScope = Object.create(scope);
      loopScope[statement.variable] = value;
      triangles.push(...evaluateStatements(statement.body.statements, loopScope));
    }
  } else {
    for (let value = start; value >= end - 1e-9; value += step) {
      const loopScope = Object.create(scope);
      loopScope[statement.variable] = value;
      triangles.push(...evaluateStatements(statement.body.statements, loopScope));
    }
  }

  return triangles;
}

function evaluateCall(call, scope) {
  switch (call.name) {
    case "union":
      return evaluateBlock(call.block, scope);
    case "translate": {
      if (!call.block) {
        throw new Error("translate requires a block.");
      }
      if (call.args.positional.length < 1) {
        throw new Error("translate requires a vector argument.");
      }

      const vector = toVector(evaluateExpression(call.args.positional[0], scope), 3);
      const triangles = evaluateStatements(call.block.statements, Object.create(scope));
      return triangles.map((triangle) =>
        triangle.map((point) => [point[0] + vector[0], point[1] + vector[1], point[2] + vector[2]])
      );
    }
    case "cube": {
      const sizeExpr = call.args.named.size ?? call.args.positional[0];
      if (!sizeExpr) {
        throw new Error("cube requires size.");
      }
      const size = toVector(evaluateExpression(sizeExpr, scope), 3);
      const center = Boolean(getNamedArg(call.args.named, "center", scope, false));
      return createCubeTriangles(size, center);
    }
    case "cylinder": {
      const hExpr = call.args.named.h ?? call.args.positional[0];
      if (!hExpr) {
        throw new Error("cylinder requires h.");
      }

      const rExpr = call.args.named.r;
      const dExpr = call.args.named.d;
      if (!rExpr && !dExpr) {
        throw new Error("cylinder requires r or d.");
      }

      const h = toNumber(evaluateExpression(hExpr, scope));
      const r = rExpr ? toNumber(evaluateExpression(rExpr, scope)) : toNumber(evaluateExpression(dExpr, scope)) / 2;
      const center = Boolean(getNamedArg(call.args.named, "center", scope, false));
      const segments = Math.max(6, Math.round(getNamedArg(call.args.named, "$fn", scope, 24)));
      return createCylinderTriangles({ h, r, center, segments });
    }
    default:
      throw new Error(`Unsupported SCAD call: ${call.name}`);
  }
}

function evaluateBlock(block, scope) {
  if (!block) {
    return [];
  }
  return evaluateStatements(block.statements, Object.create(scope));
}

function getNamedArg(named, key, scope, fallback) {
  if (!(key in named)) {
    return fallback;
  }
  return evaluateExpression(named[key], scope);
}

function evaluateExpression(node, scope) {
  switch (node.type) {
    case "literal":
      return node.value;
    case "variable":
      return getVariable(scope, node.name);
    case "array":
      return node.items.map((item) => evaluateExpression(item, scope));
    case "unary": {
      const value = evaluateExpression(node.argument, scope);
      if (node.operator === "-") {
        return -toNumber(value);
      }
      throw new Error(`Unsupported unary operator: ${node.operator}`);
    }
    case "binary": {
      const left = evaluateExpression(node.left, scope);
      const right = evaluateExpression(node.right, scope);
      const leftNumber = toNumber(left);
      const rightNumber = toNumber(right);
      switch (node.operator) {
        case "+":
          return leftNumber + rightNumber;
        case "-":
          return leftNumber - rightNumber;
        case "*":
          return leftNumber * rightNumber;
        case "/":
          if (rightNumber === 0) {
            throw new Error("Division by zero.");
          }
          return leftNumber / rightNumber;
        default:
          throw new Error(`Unsupported operator: ${node.operator}`);
      }
    }
    default:
      throw new Error(`Unsupported expression node: ${node.type}`);
  }
}

function getVariable(scope, name) {
  let current = scope;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, name)) {
      return current[name];
    }
    current = Object.getPrototypeOf(current);
  }
  throw new Error(`Undefined variable: ${name}`);
}

function toNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Expected a number, received: ${String(value)}`);
  }
  return number;
}

function toVector(value, length) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`Expected a ${length}-item vector.`);
  }
  return value.map((entry) => toNumber(entry));
}

function createCubeTriangles(size, center) {
  const sx = toNumber(size[0]);
  const sy = toNumber(size[1]);
  const sz = toNumber(size[2]);

  const x0 = center ? -sx / 2 : 0;
  const y0 = center ? -sy / 2 : 0;
  const z0 = center ? -sz / 2 : 0;
  const x1 = x0 + sx;
  const y1 = y0 + sy;
  const z1 = z0 + sz;

  const vertices = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];

  const triangles = [];
  appendQuad(triangles, vertices[0], vertices[3], vertices[2], vertices[1]);
  appendQuad(triangles, vertices[4], vertices[5], vertices[6], vertices[7]);
  appendQuad(triangles, vertices[0], vertices[1], vertices[5], vertices[4]);
  appendQuad(triangles, vertices[1], vertices[2], vertices[6], vertices[5]);
  appendQuad(triangles, vertices[2], vertices[3], vertices[7], vertices[6]);
  appendQuad(triangles, vertices[3], vertices[0], vertices[4], vertices[7]);
  return triangles;
}

function createCylinderTriangles({ h, r, center, segments }) {
  const z0 = center ? -h / 2 : 0;
  const z1 = z0 + h;
  const bottomCenter = [0, 0, z0];
  const topCenter = [0, 0, z1];
  const bottomRing = [];
  const topRing = [];
  const triangles = [];

  for (let i = 0; i < segments; i += 1) {
    const angle = (Math.PI * 2 * i) / segments;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    bottomRing.push([x, y, z0]);
    topRing.push([x, y, z1]);
  }

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    triangles.push([bottomRing[i], bottomRing[next], topRing[next]]);
    triangles.push([bottomRing[i], topRing[next], topRing[i]]);
    triangles.push([bottomCenter, bottomRing[next], bottomRing[i]]);
    triangles.push([topCenter, topRing[i], topRing[next]]);
  }

  return triangles;
}

function appendQuad(target, a, b, c, d) {
  target.push([a, b, c], [a, c, d]);
}
