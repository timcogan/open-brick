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
  {
    id: "mechanical_axle",
    name: "Mechanical Axle",
    path: "../scad/mechanical_axle.scad",
  },
];

const DEFAULT_ROTATION = {
  x: degToRad(-52),
  y: degToRad(46),
};
const DEFAULT_ZOOM = 100;
const ZOOM_MIN = 30;
const ZOOM_MAX = 280;

const BRICK_COLOR_HEX = "#ffffff";
const BACKDROP_TOP = [0.047, 0.078, 0.125];
const BACKDROP_BOTTOM = [0.027, 0.043, 0.071];

const VERTEX_SHADER_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

varying vec3 vNormal;
varying vec3 vViewPos;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vec4 viewPos = uView * worldPos;
  gl_Position = uProjection * viewPos;
  vNormal = mat3(uModel) * aNormal;
  vViewPos = viewPos.xyz;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec3 vNormal;
varying vec3 vViewPos;

uniform vec3 uColor;
uniform vec3 uLightDir;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDir);
  vec3 viewDir = normalize(-vViewPos);
  float diffuse = max(dot(normal, lightDir), 0.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfVec), 0.0), 28.0) * 0.18;
  float shade = 0.24 + diffuse * 0.76;
  vec3 color = uColor * shade + vec3(specular);
  gl_FragColor = vec4(color, 1.0);
}
`;

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
  zoomLevel: document.querySelector("#zoomLevel"),
  resetViewButton: document.querySelector("#resetViewButton"),
};

const state = {
  activeTemplate: null,
  templateCache: Object.create(null),
  triangles: [],
  mesh: null,
  params: {},
  renderer: null,
  shareResetTimer: null,
  rotation: {
    x: DEFAULT_ROTATION.x,
    y: DEFAULT_ROTATION.y,
  },
  zoom: DEFAULT_ZOOM,
  dragging: false,
  lastPointer: {
    x: 0,
    y: 0,
  },
};

init().catch((error) => setStatus(error.message, true));
registerServiceWorker();

async function init() {
  ensureZoomControl();
  state.renderer = createPreviewRenderer(elements.canvas);
  bindEvents();
  syncViewControls();
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

  if (elements.zoomLevel) {
    elements.zoomLevel.addEventListener("input", () => {
      state.zoom = clamp(Number(elements.zoomLevel.value), ZOOM_MIN, ZOOM_MAX);
      renderPreview();
    });
  }

  elements.resetViewButton.addEventListener("click", () => {
    state.rotation.x = DEFAULT_ROTATION.x;
    state.rotation.y = DEFAULT_ROTATION.y;
    state.zoom = DEFAULT_ZOOM;
    syncViewControls();
    renderPreview();
  });

  window.addEventListener("resize", () => {
    renderPreview();
  });

  bindCanvasRotation();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

function ensureZoomControl() {
  if (elements.zoomLevel) {
    return;
  }

  const viewControls = document.querySelector(".view-controls");
  if (!viewControls) {
    return;
  }

  const zoomField = document.createElement("label");
  zoomField.className = "mini-field";
  zoomField.setAttribute("for", "zoomLevel");
  zoomField.textContent = "Zoom";

  const zoomInput = document.createElement("input");
  zoomInput.id = "zoomLevel";
  zoomInput.type = "range";
  zoomInput.min = String(ZOOM_MIN);
  zoomInput.max = String(ZOOM_MAX);
  zoomInput.step = "1";
  zoomInput.value = String(DEFAULT_ZOOM);

  zoomField.append(zoomInput);
  viewControls.append(zoomField);
  elements.zoomLevel = zoomInput;

  const hint = document.querySelector(".hint");
  if (hint) {
    hint.textContent = "Drag to rotate. Use mouse wheel or Zoom slider to zoom.";
  }
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
    syncViewControls();
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

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      let delta = event.deltaY;
      if (event.deltaMode === 1) {
        delta *= 16;
      } else if (event.deltaMode === 2) {
        delta *= window.innerHeight;
      }

      const zoomFactor = Math.exp(-delta * 0.0013);
      const nextZoom = clamp(state.zoom * zoomFactor, ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(nextZoom - state.zoom) < 0.001) {
        return;
      }
      state.zoom = nextZoom;
      syncViewControls();
      renderPreview();
    },
    { passive: false }
  );
}

function createPreviewRenderer(canvas) {
  const gl =
    canvas.getContext("webgl", { antialias: true, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: false }) ||
    canvas.getContext("experimental-webgl");
  if (!gl) {
    return { kind: "2d" };
  }

  const program = createWebglProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
  const positionBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  if (!program || !positionBuffer || !normalBuffer) {
    return {
      kind: "webgl",
      gl,
      program: null,
      positionBuffer: null,
      normalBuffer: null,
      attributes: { position: -1, normal: -1 },
      uniforms: { model: null, view: null, projection: null, color: null, lightDir: null },
    };
  }

  const renderer = {
    kind: "webgl",
    gl,
    program,
    positionBuffer,
    normalBuffer,
    attributes: {
      position: gl.getAttribLocation(program, "aPosition"),
      normal: gl.getAttribLocation(program, "aNormal"),
    },
    uniforms: {
      model: gl.getUniformLocation(program, "uModel"),
      view: gl.getUniformLocation(program, "uView"),
      projection: gl.getUniformLocation(program, "uProjection"),
      color: gl.getUniformLocation(program, "uColor"),
      lightDir: gl.getUniformLocation(program, "uLightDir"),
    },
  };

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);
  gl.disable(gl.BLEND);

  return renderer;
}

function buildRenderMesh(triangles) {
  const bounds = computeBounds(triangles);
  if (!bounds) {
    return null;
  }

  const vertexCount = triangles.length * 3;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  let writeOffset = 0;

  for (const triangle of triangles) {
    const normal = computeNormal(triangle);
    for (const point of triangle) {
      positions[writeOffset] = point[0] - bounds.center[0];
      positions[writeOffset + 1] = point[1] - bounds.center[1];
      positions[writeOffset + 2] = point[2] - bounds.center[2];

      normals[writeOffset] = normal[0];
      normals[writeOffset + 1] = normal[1];
      normals[writeOffset + 2] = normal[2];
      writeOffset += 3;
    }
  }

  return {
    positions,
    normals,
    vertexCount,
    maxSize: Math.max(1, ...bounds.size),
  };
}

function uploadMeshToRenderer(mesh) {
  const renderer = state.renderer;
  if (!renderer || renderer.kind !== "webgl" || !renderer.program || !renderer.positionBuffer || !renderer.normalBuffer) {
    return;
  }

  const { gl } = renderer;
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);
}

function createWebglProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
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

    const mesh = buildRenderMesh(triangles);
    if (!mesh) {
      throw new Error("Unable to prepare preview mesh.");
    }

    state.params = params;
    state.triangles = triangles;
    state.mesh = mesh;
    uploadMeshToRenderer(mesh);
    elements.downloadButton.disabled = false;
    elements.shareButton.disabled = false;
    syncShareQuery();
    if (elements.scadSource) {
      elements.scadSource.textContent = buildResolvedScadSource(state.activeTemplate.source, params);
    }
    setStatus(`${state.activeTemplate.name}: ${triangles.length} triangles ready for export.`);
    renderPreview();
  } catch (error) {
    state.triangles = [];
    state.mesh = null;
    elements.downloadButton.disabled = true;
    elements.shareButton.disabled = true;
    resetShareButtonLabel();
    drawEmptyPreview("Geometry Error");
    setStatus(error.message, true);
  }
}

function renderPreview() {
  if (!state.mesh || state.triangles.length === 0) {
    drawEmptyPreview("No mesh");
    return;
  }

  if (state.renderer && state.renderer.kind === "webgl") {
    renderPreviewWebgl(state.renderer, state.mesh);
  } else {
    renderPreview2d();
  }
}

function renderPreviewWebgl(renderer, mesh) {
  const { gl } = renderer;
  const canvas = elements.canvas;
  resizeCanvas(canvas);
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.clearColor(BACKDROP_BOTTOM[0], BACKDROP_BOTTOM[1], BACKDROP_BOTTOM[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (!renderer.program || !renderer.positionBuffer || !renderer.normalBuffer || mesh.vertexCount === 0) {
    return;
  }

  gl.useProgram(renderer.program);

  const aspect = canvas.width / Math.max(1, canvas.height);
  const maxSize = Math.max(1, mesh.maxSize);
  const cameraDistance = getCameraDistance(maxSize);
  const projection = createPerspectiveMatrix(degToRad(46), aspect, 1, cameraDistance + maxSize * 10 + 160);
  const view = createTranslationMatrix(0, 0, -cameraDistance);
  const rotationZ = createRotationZMatrix(state.rotation.y);
  const rotationX = createRotationXMatrix(state.rotation.x);
  const model = multiplyMatrices(rotationX, rotationZ);

  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.positionBuffer);
  gl.enableVertexAttribArray(renderer.attributes.position);
  gl.vertexAttribPointer(renderer.attributes.position, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.normalBuffer);
  gl.enableVertexAttribArray(renderer.attributes.normal);
  gl.vertexAttribPointer(renderer.attributes.normal, 3, gl.FLOAT, false, 0, 0);

  const color = getBrickColor();
  const light = normalize([0.35, -0.5, 0.8]);
  gl.uniformMatrix4fv(renderer.uniforms.model, false, model);
  gl.uniformMatrix4fv(renderer.uniforms.view, false, view);
  gl.uniformMatrix4fv(renderer.uniforms.projection, false, projection);
  gl.uniform3f(renderer.uniforms.color, color.r / 255, color.g / 255, color.b / 255);
  gl.uniform3f(renderer.uniforms.lightDir, light[0], light[1], light[2]);

  gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
}

function renderPreview2d() {
  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
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
  const cameraDistance = getCameraDistance(maxSize);
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
    const center = [
      (transformed[0][0] + transformed[1][0] + transformed[2][0]) / 3,
      (transformed[0][1] + transformed[1][1] + transformed[2][1]) / 3,
      (transformed[0][2] + transformed[1][2] + transformed[2][2]) / 3,
    ];
    const toCamera = normalize([-center[0], -center[1], -cameraDistance - center[2]]);
    if (dot(normal, toCamera) <= 0) {
      continue;
    }
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
  if (!context) {
    return;
  }
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0c1420");
  gradient.addColorStop(1, "#070b12");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawEmptyPreview(text) {
  const canvas = elements.canvas;
  resizeCanvas(canvas);
  if (state.renderer && state.renderer.kind === "webgl") {
    const { gl } = state.renderer;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(BACKDROP_TOP[0], BACKDROP_TOP[1], BACKDROP_TOP[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  drawBackdrop(context, width, height);
  context.fillStyle = "#98aec4";
  context.font = "600 20px Avenir Next, Futura, Trebuchet MS, sans-serif";
  context.textAlign = "center";
  context.fillText(text, width / 2, height / 2);
}

function resizeCanvas(canvas) {
  const rawRatio = window.devicePixelRatio || 1;
  const maxRatio = state.renderer && state.renderer.kind === "webgl" ? 1.5 : 2;
  const ratio = Math.min(rawRatio, maxRatio);
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

function createPerspectiveMatrix(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

function createTranslationMatrix(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

function createRotationZMatrix(angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new Float32Array([
    cos, sin, 0, 0,
    -sin, cos, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function createRotationXMatrix(angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, cos, sin, 0,
    0, -sin, cos, 0,
    0, 0, 0, 1,
  ]);
}

function multiplyMatrices(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
  return out;
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

function syncViewControls() {
  if (!elements.rotationX || !elements.rotationY) {
    return;
  }
  elements.rotationX.value = String(Math.round(radToDeg(state.rotation.x)));
  elements.rotationY.value = String(Math.round(radToDeg(normalizeAngle(state.rotation.y))));
  if (elements.zoomLevel) {
    elements.zoomLevel.value = String(Math.round(state.zoom));
  }
}

function getCameraDistance(maxSize) {
  const baseDistance = maxSize * 3.6 + 36;
  const zoom = clamp(state.zoom, ZOOM_MIN, ZOOM_MAX);
  return baseDistance / (zoom / 100);
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
