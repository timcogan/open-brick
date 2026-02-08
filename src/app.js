import {
  buildResolvedScadSource,
  computeBounds,
  computeNormal,
  evaluateScad,
  parseScad,
  parseTemplateMetadata,
  toAsciiStl,
} from "./scad-engine.mjs";
import { buildShareQuery, parseShareQuery } from "./share-query.mjs";

const TEMPLATE_CATALOG = [
  {
    id: "classic_brick",
    name: "Classic Brick",
    path: "../scad/classic_brick.scad",
  },
  {
    id: "classic_plate",
    name: "Classic Plate",
    path: "../scad/classic_plate.scad",
  },
  {
    id: "classic_tile",
    name: "Classic Tile",
    path: "../scad/classic_tile.scad",
  },
];

const DEFAULT_ROTATION = {
  x: degToRad(-52),
  y: degToRad(46),
};

const BRICK_COLOR_HEX = "#ffffff";

const elements = {
  templateSelect: document.querySelector("#templateSelect"),
  parameterControls: document.querySelector("#parameterControls"),
  downloadButton: document.querySelector("#downloadButton"),
  shareButton: document.querySelector("#shareButton"),
  status: document.querySelector("#status"),
  canvas: document.querySelector("#previewCanvas"),
  scadSource: document.querySelector("#scadSource"),
  rotationX: document.querySelector("#rotationX"),
  rotationY: document.querySelector("#rotationY"),
  resetViewButton: document.querySelector("#resetViewButton"),
};

const state = {
  activeTemplate: null,
  templateCache: Object.create(null),
  triangles: [],
  params: {},
  shareResetTimer: null,
  rotation: {
    x: DEFAULT_ROTATION.x,
    y: DEFAULT_ROTATION.y,
  },
  dragging: false,
  lastPointer: {
    x: 0,
    y: 0,
  },
};

init().catch((error) => setStatus(error.message, true));

async function init() {
  bindEvents();
  syncRotationControls();
  drawEmptyPreview("Loading...");
  fillTemplateSelect(TEMPLATE_CATALOG);

  const initialTemplateId = resolveInitialTemplateId(window.location.search);
  await setActiveTemplate(initialTemplateId, { skipRegenerate: true });

  if (!state.activeTemplate) {
    throw new Error("No SCAD templates were loaded.");
  }

  const sharedConfig = parseShareQuery(window.location.search, [state.activeTemplate]);
  if (sharedConfig) {
    applyParamsToControls(sharedConfig.params);
  }
  regenerate();
}

function bindEvents() {
  elements.templateSelect.addEventListener("change", () => {
    setActiveTemplate(elements.templateSelect.value).catch((error) => {
      setStatus(error.message, true);
    });
  });

  elements.downloadButton.addEventListener("click", () => {
    downloadStl();
  });
  elements.shareButton.addEventListener("click", () => {
    copyShareLink();
  });

  elements.rotationX.addEventListener("input", () => {
    state.rotation.x = normalizeAngle(degToRad(Number(elements.rotationX.value)));
    renderPreview();
  });

  elements.rotationY.addEventListener("input", () => {
    state.rotation.y = normalizeAngle(degToRad(Number(elements.rotationY.value)));
    renderPreview();
  });

  elements.resetViewButton.addEventListener("click", () => {
    state.rotation.x = DEFAULT_ROTATION.x;
    state.rotation.y = DEFAULT_ROTATION.y;
    syncRotationControls();
    renderPreview();
  });

  window.addEventListener("resize", () => {
    renderPreview();
  });

  bindCanvasRotation();
}

function bindCanvasRotation() {
  const canvas = elements.canvas;

  canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) {
      return;
    }

    const dx = event.clientX - state.lastPointer.x;
    const dy = event.clientY - state.lastPointer.y;
    state.lastPointer = { x: event.clientX, y: event.clientY };

    state.rotation.y = normalizeAngle(state.rotation.y + dx * 0.0045);
    state.rotation.x = normalizeAngle(state.rotation.x + dy * 0.0045);
    syncRotationControls();
    renderPreview();
  });

  const stopDragging = (event) => {
    state.dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);
}

function fillTemplateSelect(catalog) {
  elements.templateSelect.innerHTML = "";
  for (const template of catalog) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    elements.templateSelect.append(option);
  }
}

async function setActiveTemplate(templateId, options = {}) {
  const template = await loadTemplateById(templateId);

  state.activeTemplate = template;
  elements.templateSelect.value = template.id;
  buildParameterControls(template.params);
  if (!options.skipRegenerate) {
    regenerate();
  }
}

async function loadTemplateById(templateId) {
  const catalogEntry = findTemplateCatalogEntry(templateId);
  if (!catalogEntry) {
    throw new Error(`Unknown template id: ${templateId}`);
  }

  if (state.templateCache[catalogEntry.id]) {
    return state.templateCache[catalogEntry.id];
  }

  const templateUrl = new URL(catalogEntry.path, import.meta.url);
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`Unable to load ${templateUrl.pathname}`);
  }

  const source = await response.text();
  const metadata = parseTemplateMetadata(source, catalogEntry.id);
  const ast = parseScad(source);

  if (metadata.params.length === 0) {
    throw new Error(`Template has no parameters: ${catalogEntry.path}`);
  }

  const template = {
    ...metadata,
    id: catalogEntry.id,
    name: metadata.name || catalogEntry.name,
    path: catalogEntry.path,
    source,
    ast,
  };

  state.templateCache[catalogEntry.id] = template;
  return template;
}

function resolveInitialTemplateId(search) {
  const query = new URLSearchParams(search || "");
  const templateHint = query.get("template");
  const catalogEntry = findTemplateCatalogEntry(templateHint);
  if (catalogEntry) {
    return catalogEntry.id;
  }
  return TEMPLATE_CATALOG[0].id;
}

function findTemplateCatalogEntry(templateHint) {
  const normalizedHint = normalizeTemplateHint(templateHint);
  if (!normalizedHint) {
    return null;
  }

  return (
    TEMPLATE_CATALOG.find((entry) => {
      const entryId = normalizeTemplateHint(entry.id);
      return entryId === normalizedHint || entryId.replace(/_/g, "-") === normalizedHint;
    }) || null
  );
}

function normalizeTemplateHint(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim().toLowerCase();
}

function applyParamsToControls(params) {
  if (!state.activeTemplate) {
    return;
  }

  for (const param of state.activeTemplate.params) {
    const input = elements.parameterControls.querySelector(`[data-param-key="${param.key}"]`);
    if (!input) {
      continue;
    }

    const rawValue = Number(params[param.key]);
    const value = Number.isFinite(rawValue) ? clamp(rawValue, param.min, param.max) : param.defaultValue;
    input.value = String(value);

    const output = input.closest(".param")?.querySelector("output");
    if (output) {
      output.textContent = formatParamValue(param, value);
    }
  }
}

function buildParameterControls(params) {
  elements.parameterControls.innerHTML = "";

  for (const param of params) {
    const card = document.createElement("section");
    card.className = "param";

    const head = document.createElement("div");
    head.className = "param-head";

    const label = document.createElement("label");
    label.textContent = param.label;
    label.setAttribute("for", `param-${param.key}`);

    const output = document.createElement("output");
    output.textContent = formatParamValue(param, param.defaultValue);

    head.append(label, output);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = `param-${param.key}`;
    slider.dataset.paramKey = param.key;
    slider.min = String(param.min);
    slider.max = String(param.max);
    slider.step = String(param.step);
    slider.value = String(param.defaultValue);

    slider.addEventListener("input", () => {
      output.textContent = formatParamValue(param, Number(slider.value));
      regenerate();
    });

    card.append(head, slider);
    elements.parameterControls.append(card);
  }
}

function readCurrentParams() {
  const params = Object.create(null);
  if (!state.activeTemplate) {
    return params;
  }

  for (const param of state.activeTemplate.params) {
    const input = elements.parameterControls.querySelector(`[data-param-key="${param.key}"]`);
    if (!input) {
      continue;
    }

    const numericValue = Number(input.value);
    params[param.key] = clamp(numericValue, param.min, param.max);
  }

  return params;
}

function regenerate() {
  if (!state.activeTemplate) {
    return;
  }

  try {
    const params = readCurrentParams();
    const triangles = evaluateScad(state.activeTemplate.ast, params);

    if (triangles.length === 0) {
      throw new Error("Generated geometry is empty.");
    }

    state.params = params;
    state.triangles = triangles;
    elements.downloadButton.disabled = false;
    elements.shareButton.disabled = false;
    syncShareQuery();
    if (elements.scadSource) {
      elements.scadSource.textContent = buildResolvedScadSource(state.activeTemplate.source, params);
    }
    setStatus(
      `${state.activeTemplate.name}: ${triangles.length} triangles ready for export. ${state.activeTemplate.description}`
    );
    renderPreview();
  } catch (error) {
    state.triangles = [];
    elements.downloadButton.disabled = true;
    elements.shareButton.disabled = true;
    resetShareButtonLabel();
    drawEmptyPreview("Geometry Error");
    setStatus(error.message, true);
  }
}

function renderPreview() {
  if (state.triangles.length === 0) {
    drawEmptyPreview("No mesh");
    return;
  }

  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  resizeCanvas(canvas);

  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  drawBackdrop(context, width, height);

  const bounds = computeBounds(state.triangles);
  if (!bounds) {
    drawEmptyPreview("No mesh");
    return;
  }

  const color = getBrickColor();
  const maxSize = Math.max(1, ...bounds.size);
  const cameraDistance = maxSize * 3.6 + 36;
  const scale = Math.min(width, height) / (maxSize * 2.7);
  const light = normalize([0.35, -0.5, 0.8]);
  const faces = [];

  for (const triangle of state.triangles) {
    const transformed = triangle.map((point) => transformPoint(point, bounds.center, state.rotation));
    const projected = [];
    let skip = false;
    let depthSum = 0;

    for (const point of transformed) {
      const depth = point[2] + cameraDistance;
      if (depth < 1e-3) {
        skip = true;
        break;
      }
      const perspective = cameraDistance / depth;
      const x = point[0] * scale * perspective + width / 2;
      const y = -point[1] * scale * perspective + height / 2;
      depthSum += depth;
      projected.push([x, y]);
    }

    if (skip) {
      continue;
    }

    const normal = computeNormal(transformed);
    const lightPower = clamp(dot(normal, light), 0, 1);
    const intensity = 0.28 + lightPower * 0.72;
    faces.push({
      projected,
      depth: depthSum / 3,
      intensity,
    });
  }

  faces.sort((a, b) => b.depth - a.depth);

  for (const face of faces) {
    context.beginPath();
    context.moveTo(face.projected[0][0], face.projected[0][1]);
    context.lineTo(face.projected[1][0], face.projected[1][1]);
    context.lineTo(face.projected[2][0], face.projected[2][1]);
    context.closePath();

    context.fillStyle = shadeRgb(color, face.intensity);
    context.strokeStyle = shadeRgb(color, Math.max(0.15, face.intensity - 0.24));
    context.lineWidth = 1;
    context.fill();
    context.stroke();
  }
}

function drawBackdrop(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0c1420");
  gradient.addColorStop(1, "#070b12");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawEmptyPreview(text) {
  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  resizeCanvas(canvas);
  const width = canvas.width;
  const height = canvas.height;
  drawBackdrop(context, width, height);
  context.fillStyle = "#98aec4";
  context.font = "600 20px Avenir Next, Futura, Trebuchet MS, sans-serif";
  context.textAlign = "center";
  context.fillText(text, width / 2, height / 2);
}

function resizeCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const displayHeight = Math.max(1, Math.round(canvas.clientHeight * ratio));

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
}

function transformPoint(point, center, rotation) {
  const x = point[0] - center[0];
  const y = point[1] - center[1];
  const z = point[2] - center[2];

  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const x1 = x * cosY - y * sinY;
  const y1 = x * sinY + y * cosY;
  const z1 = z;

  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const y2 = y1 * cosX - z1 * sinX;
  const z2 = y1 * sinX + z1 * cosX;

  return [x1, y2, z2];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function formatValue(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(2)));
}

function formatParamValue(param, value) {
  const base = formatValue(value);
  if (param.key === "scale_percent") {
    return `${base}%`;
  }
  return base;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function getBrickColor() {
  return hexToRgb(BRICK_COLOR_HEX);
}

function shadeRgb(base, intensity) {
  return `rgb(${Math.round(base.r * intensity)}, ${Math.round(base.g * intensity)}, ${Math.round(base.b * intensity)})`;
}

function setStatus(text, isError = false) {
  elements.status.textContent = text;
  elements.status.classList.toggle("error", isError);
}

function syncShareQuery() {
  if (!state.activeTemplate) {
    return;
  }

  const nextSearch = buildShareQuery(state.activeTemplate, state.params);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  if (currentUrl !== nextUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

async function copyShareLink() {
  if (!state.activeTemplate || state.triangles.length === 0) {
    return;
  }

  syncShareQuery();
  const shareUrl = window.location.href;

  try {
    await copyTextToClipboard(shareUrl);
    flashShareButtonLabel("Link Copied!");
  } catch {
    flashShareButtonLabel("Copy Failed");
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.append(textArea);
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  const copied = document.execCommand("copy");
  textArea.remove();
  if (!copied) {
    throw new Error("Copy failed");
  }
}

function flashShareButtonLabel(text) {
  if (!elements.shareButton) {
    return;
  }

  elements.shareButton.textContent = text;
  if (state.shareResetTimer) {
    window.clearTimeout(state.shareResetTimer);
  }
  state.shareResetTimer = window.setTimeout(() => {
    resetShareButtonLabel();
  }, 2000);
}

function resetShareButtonLabel() {
  if (!elements.shareButton) {
    return;
  }
  elements.shareButton.textContent = "Share";
  if (state.shareResetTimer) {
    window.clearTimeout(state.shareResetTimer);
    state.shareResetTimer = null;
  }
}

function downloadStl() {
  if (!state.activeTemplate || state.triangles.length === 0) {
    return;
  }

  const stl = toAsciiStl(state.triangles, state.activeTemplate.id);
  const blob = new Blob([stl], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildFileName();
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildFileName() {
  const tokens = [];
  for (const [key, value] of Object.entries(state.params)) {
    if (key === "studs_x" || key === "studs_y" || key === "height_units" || key === "scale_percent") {
      tokens.push(`${key}-${formatValue(value)}`);
    }
  }

  const suffix = tokens.length > 0 ? `-${tokens.join("_")}` : "";
  return `${state.activeTemplate.id}${suffix}.stl`;
}

function syncRotationControls() {
  if (!elements.rotationX || !elements.rotationY) {
    return;
  }
  elements.rotationX.value = String(Math.round(radToDeg(state.rotation.x)));
  elements.rotationY.value = String(Math.round(radToDeg(normalizeAngle(state.rotation.y))));
}

function normalizeAngle(radians) {
  const fullTurn = Math.PI * 2;
  let value = radians % fullTurn;
  if (value > Math.PI) {
    value -= fullTurn;
  }
  if (value < -Math.PI) {
    value += fullTurn;
  }
  return value;
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function radToDeg(value) {
  return (value * 180) / Math.PI;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
