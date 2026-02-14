const PARAM_QUERY_NAMES = {
  X: ["width", "x"],
  Y: ["length", "y"],
  Z: ["height", "z"],
  scale_percent: ["scale", "scale_percent"],
};
const DEFAULT_TEMPLATE_ID = "classic_brick";

export function parseShareQuery(search, templates) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return null;
  }

  const query = new URLSearchParams(search || "");
  const defaultTemplate = templates[0];
  const templateHintRaw = query.get("template");
  const template = findTemplateByHint(templateHintRaw, templates) || defaultTemplate;

  if (!template) {
    return null;
  }

  const params = Object.create(null);
  let hasQueryInput = templateHintRaw !== null;

  for (const param of template.params) {
    const rawValue = readQueryValue(query, param.key);
    if (rawValue !== null) {
      hasQueryInput = true;
    }

    const parsedValue = rawValue === null ? param.defaultValue : Number(rawValue);
    const numericValue = Number.isFinite(parsedValue) ? parsedValue : param.defaultValue;
    params[param.key] = clamp(numericValue, param.min, param.max);
  }

  if (!hasQueryInput) {
    return null;
  }

  return {
    templateId: template.id,
    params,
  };
}

export function buildShareQuery(template, params = {}, options = {}) {
  const query = new URLSearchParams();
  const defaultTemplateHint = options.defaultTemplateId || DEFAULT_TEMPLATE_ID;
  if (!isMatchingTemplateHint(template.id, defaultTemplateHint)) {
    query.set("template", template.id);
  }

  for (const param of template.params) {
    const queryKey = getCanonicalQueryName(param.key);
    const rawValue = Number(params[param.key] ?? param.defaultValue);
    const numericValue = Number.isFinite(rawValue) ? rawValue : param.defaultValue;
    const clampedValue = clamp(numericValue, param.min, param.max);
    if (clampedValue === param.defaultValue) {
      continue;
    }
    query.set(queryKey, formatShareNumber(clampedValue));
  }

  const search = query.toString();
  return search ? `?${search}` : "";
}

export function getCanonicalQueryName(paramKey) {
  const aliases = PARAM_QUERY_NAMES[paramKey];
  if (aliases && aliases.length > 0) {
    return aliases[0];
  }
  return String(paramKey).toLowerCase();
}

function readQueryValue(query, paramKey) {
  const names = getQueryNames(paramKey);
  for (const name of names) {
    if (query.has(name)) {
      return query.get(name);
    }
  }
  return null;
}

function getQueryNames(paramKey) {
  const aliases = PARAM_QUERY_NAMES[paramKey] || [String(paramKey).toLowerCase()];
  const names = new Set(aliases);
  names.add(String(paramKey));
  names.add(String(paramKey).toLowerCase());
  return Array.from(names);
}

function findTemplateByHint(templateHintRaw, templates) {
  if (templateHintRaw === null) {
    return null;
  }

  const templateHint = toSlug(templateHintRaw);
  if (!templateHint) {
    return null;
  }

  return (
    templates.find((template) => {
      return toSlug(template.id) === templateHint;
    }) || null
  );
}

function isMatchingTemplateHint(templateId, templateHint) {
  return toSlug(templateId) === toSlug(templateHint);
}

function toSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatShareNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(6)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
