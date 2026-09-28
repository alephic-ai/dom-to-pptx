import { parseColor } from './utils.js';

const ROOT_ATTRIBUTES = new Set([
  'xmlns',
  'viewBox',
  'width',
  'height',
  'preserveAspectRatio',
  'fill',
  'stroke',
  'stroke-width',
  'fill-opacity',
  'stroke-opacity',
  'opacity',
  'style',
]);

const PATH_ROOT_ATTRIBUTES = new Set([
  ...ROOT_ATTRIBUTES,
  'id',
  'data-name',
  'aria-hidden',
  'aria-label',
  'role',
  'data-alephic-slide-element',
  'data-alephic-svg-image-vectorized',
]);

const GROUP_ATTRIBUTES = new Set(['id', 'data-name']);

const PRIMITIVE_ATTRIBUTES = {
  rect: new Set([
    'x',
    'y',
    'width',
    'height',
    'fill',
    'stroke',
    'stroke-width',
    'fill-opacity',
    'stroke-opacity',
    'opacity',
    'style',
  ]),
  circle: new Set([
    'cx',
    'cy',
    'r',
    'fill',
    'stroke',
    'stroke-width',
    'fill-opacity',
    'stroke-opacity',
    'opacity',
    'style',
  ]),
  line: new Set(['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-opacity', 'opacity', 'style']),
};

const PATH_ATTRIBUTES = new Set([
  'd',
  'class',
  'fill',
  'stroke',
  'stroke-width',
  'fill-opacity',
  'stroke-opacity',
  'opacity',
  'style',
]);

const PAINT_STYLE_PROPERTIES = new Set(['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity']);

// The converter may carry the source image's measured box styling onto the
// inline SVG root. Geometry and stacking are supplied separately; computed
// transform, clip, and opacity values are still checked before lowering.
const ROOT_LAYOUT_STYLE_PROPERTIES = new Set([
  'box-sizing',
  'clip-path',
  'width',
  'height',
  'position',
  'left',
  'right',
  'top',
  'bottom',
  'display',
  'visibility',
  'overflow',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'opacity',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'transform',
  'transform-box',
  'transform-origin',
  'vertical-align',
  'z-index',
]);

const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const EPSILON = 1e-6;

function isSupportedStyleAttribute(node, isRoot) {
  const style = node.style;
  if (!style) return true;

  for (let i = 0; i < style.length; i++) {
    const property = style[i];
    if (!PAINT_STYLE_PROPERTIES.has(property) && !(isRoot && ROOT_LAYOUT_STYLE_PROPERTIES.has(property))) {
      return false;
    }
  }

  return true;
}

function hasOnlySupportedAttributes(node, allowed, isRoot = false) {
  for (const attribute of node.attributes) {
    if (attribute.name === 'style') continue;
    if (!allowed.has(attribute.name)) return false;
  }
  return isSupportedStyleAttribute(node, isRoot);
}

function hasOnlyEmptyStyleAttributes(node) {
  // Chromium can materialize empty style attributes on parsed SVG descendants.
  return [...node.attributes].every((attribute) => attribute.name === 'style' && attribute.value.trim() === '');
}

function readNumber(node, attribute, fallback) {
  if (!node.hasAttribute(attribute)) return fallback;
  const value = node.getAttribute(attribute).trim();
  if (!NUMBER_PATTERN.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readViewBox(node) {
  const source = node.getAttribute('viewBox');
  if (!source) return null;
  const values = source
    .trim()
    .split(/[\s,]+/)
    .map((value) => {
      if (!NUMBER_PATTERN.test(value)) return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    });
  if (values.length !== 4 || values.some((value) => value === null)) return null;
  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function getViewBoxMapping(node, width, height, viewBox) {
  const preserveAspectRatio = node.getAttribute('preserveAspectRatio')?.trim() || 'xMidYMid meet';
  const alignment = preserveAspectRatio.split(/\s+/);
  const scaleX = width / viewBox.width;
  const scaleY = height / viewBox.height;

  if (alignment.length === 1 && alignment[0] === 'none') {
    return { scaleX, scaleY, offsetX: 0, offsetY: 0, mode: 'none' };
  }

  if (
    (alignment[0] !== 'xMidYMid' && alignment[0] !== 'xMinYMid') ||
    (alignment.length > 1 && alignment[1] !== 'meet') ||
    alignment.length > 2
  ) {
    return null;
  }

  const scale = Math.min(scaleX, scaleY);
  return {
    scaleX: scale,
    scaleY: scale,
    offsetX: alignment[0] === 'xMinYMid' ? 0 : (width - viewBox.width * scale) / 2,
    offsetY: (height - viewBox.height * scale) / 2,
    mode: 'meet',
  };
}

function parseSupportedStylesheet(node) {
  if (!hasOnlyEmptyStyleAttributes(node) || [...node.childNodes].some((child) => child.nodeType !== 3)) {
    return null;
  }

  let source = node.textContent || '';
  const selectors = new Set();
  while (source.trim()) {
    source = source.trimStart();
    const match = /^\.([A-Za-z_][\w-]*)\s*\{([^{}]*)\}/.exec(source);
    if (!match || selectors.has(match[1])) return null;

    let hasFill = false;
    let hasZeroStrokeWidth = false;
    const declarations = match[2]
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean);
    if (declarations.length === 0) return null;
    for (const declaration of declarations) {
      const separator = declaration.indexOf(':');
      if (separator < 0) return null;
      const property = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1).trim();
      if (property === 'fill' && !hasFill && /^#[\da-f]{3}(?:[\da-f])?$|^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) {
        hasFill = true;
        continue;
      }
      if (property === 'stroke-width' && !hasZeroStrokeWidth && /^0+(?:\.0+)?(?:px)?$/i.test(value)) {
        hasZeroStrokeWidth = true;
        continue;
      }
      return null;
    }
    if (!hasFill) return null;

    selectors.add(match[1]);
    source = source.slice(match[0].length);
  }

  return selectors.size > 0 ? selectors : null;
}

function parseOpacity(value) {
  const opacity = Number(value);
  return Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? opacity : null;
}

function parsePaint(value) {
  if (value === 'none') return { color: null, opacity: 0 };
  // Computed solid SVG colors are serialized as rgb()/rgba() in supported browsers.
  // Refuse paint servers and browser-specific color syntax rather than guess.
  if (!/^(?:rgba?\(|#)/i.test(value.trim())) return null;
  const parsed = parseColor(value);
  if (!parsed.hex || !Number.isFinite(parsed.opacity)) return null;
  return { color: parsed.hex, opacity: parsed.opacity };
}

function hasDefaultEffects(style) {
  return (
    style.transform === 'none' &&
    style.filter === 'none' &&
    style.clipPath === 'none' &&
    style.mask === 'none' &&
    style.mixBlendMode === 'normal' &&
    style.strokeDasharray === 'none' &&
    style.strokeDashoffset === '0px' &&
    style.markerStart === 'none' &&
    style.markerMid === 'none' &&
    style.markerEnd === 'none' &&
    style.vectorEffect === 'none' &&
    style.paintOrder === 'normal' &&
    style.strokeLinecap === 'butt' &&
    style.strokeLinejoin === 'miter'
  );
}

function hasOnlyUniformScaleAndTranslation(transform) {
  if (transform === 'none') return true;
  const matrix = /^matrix\(([^)]+)\)$/.exec(transform);
  if (!matrix) return false;
  const values = matrix[1].split(/\s*,\s*/).map(Number);
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return false;
  const [scaleX, skewY, skewX, scaleY] = values;
  const tolerance = Math.max(Math.abs(scaleX), Math.abs(scaleY), 1) * 1e-9;
  return (
    scaleX > 0 &&
    scaleY > 0 &&
    Math.abs(scaleX - scaleY) <= tolerance &&
    Math.abs(skewX) <= tolerance &&
    Math.abs(skewY) <= tolerance
  );
}

function hasUnrepresentedAncestorEffect(node) {
  let ancestor = node.parentElement;
  while (ancestor) {
    const style = window.getComputedStyle(ancestor);
    if (
      !hasOnlyUniformScaleAndTranslation(style.transform) ||
      style.filter !== 'none' ||
      style.clipPath !== 'none' ||
      style.mask !== 'none' ||
      style.mixBlendMode !== 'normal'
    )
      return true;
    ancestor = ancestor.parentElement;
  }
  return false;
}

function tokenizePathData(source) {
  const tokens = [];
  const pattern = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[a-zA-Z]/gi;
  let previousIndex = 0;
  let previousToken = null;

  for (const match of source.matchAll(pattern)) {
    const separator = source.slice(previousIndex, match.index);
    if (!/^[\s,]*$/.test(separator) || /,\s*,/.test(separator)) return null;

    const isCommand = /^[a-z]$/i.test(match[0]);
    if (separator.includes(',') && (!previousToken || previousToken.command || isCommand)) return null;
    if (!separator && previousToken && !previousToken.command && !isCommand && !/^[+\-.]/.test(match[0])) return null;

    const token = isCommand ? { command: match[0] } : { number: Number(match[0]) };
    if ('number' in token && !Number.isFinite(token.number)) return null;
    tokens.push(token);
    previousToken = token;
    previousIndex = match.index + match[0].length;
  }

  const trailing = source.slice(previousIndex);
  if (!/^[\s]*$/.test(trailing) || source.trim().endsWith(',')) return null;
  return tokens;
}

function parseSupportedPathData(source) {
  const tokens = tokenizePathData(source);
  if (!tokens?.length) return null;

  const points = [];
  let index = 0;
  let command = null;
  let current = { x: 0, y: 0 };
  let subpathStart = null;
  let subpathOpen = false;
  let previousCommand = null;
  let previousCubicControl = null;
  let hasDrawingSegment = false;

  while (index < tokens.length) {
    if (tokens[index].command) {
      command = tokens[index++].command;
      const upper = command.toUpperCase();
      if (!'MLHVCSZ'.includes(upper)) return null;

      if (upper === 'Z') {
        if (!subpathOpen) return null;
        points.push({ close: true });
        current = { ...subpathStart };
        subpathOpen = false;
        previousCommand = 'Z';
        previousCubicControl = null;
        command = null;
        continue;
      }
    } else if (!command) {
      return null;
    }

    if (!command) return null;
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const count = upper === 'M' || upper === 'L' ? 2 : upper === 'H' || upper === 'V' ? 1 : upper === 'C' ? 6 : 4;
    let groups = 0;

    while (index < tokens.length && !tokens[index].command) {
      if (index + count > tokens.length) return null;
      const args = tokens.slice(index, index + count);
      if (args.some((token) => !('number' in token))) return null;
      const values = args.map((token) => token.number);
      index += count;
      groups++;

      if (upper === 'M') {
        if (subpathOpen || (groups > 1 && !subpathStart)) return null;
        const next = {
          x: relative ? current.x + values[0] : values[0],
          y: relative ? current.y + values[1] : values[1],
        };
        if (groups === 1) {
          points.push({ ...next, moveTo: true });
          subpathStart = { ...next };
          subpathOpen = true;
          previousCommand = 'M';
        } else {
          points.push(next);
          previousCommand = 'L';
          hasDrawingSegment = true;
        }
        current = next;
        previousCubicControl = null;
      } else {
        if (!subpathOpen) return null;
        let next;
        let point;

        if (upper === 'L') {
          next = {
            x: relative ? current.x + values[0] : values[0],
            y: relative ? current.y + values[1] : values[1],
          };
          point = next;
        } else if (upper === 'H') {
          next = { x: relative ? current.x + values[0] : values[0], y: current.y };
          point = next;
        } else if (upper === 'V') {
          next = { x: current.x, y: relative ? current.y + values[0] : values[0] };
          point = next;
        } else if (upper === 'C') {
          const control1 = {
            x: relative ? current.x + values[0] : values[0],
            y: relative ? current.y + values[1] : values[1],
          };
          const control2 = {
            x: relative ? current.x + values[2] : values[2],
            y: relative ? current.y + values[3] : values[3],
          };
          next = {
            x: relative ? current.x + values[4] : values[4],
            y: relative ? current.y + values[5] : values[5],
          };
          point = { ...next, curve: { type: 'cubic', x1: control1.x, y1: control1.y, x2: control2.x, y2: control2.y } };
          previousCubicControl = control2;
        } else {
          const control1 =
            previousCommand === 'C' || previousCommand === 'S'
              ? { x: current.x * 2 - previousCubicControl.x, y: current.y * 2 - previousCubicControl.y }
              : { ...current };
          const control2 = {
            x: relative ? current.x + values[0] : values[0],
            y: relative ? current.y + values[1] : values[1],
          };
          next = {
            x: relative ? current.x + values[2] : values[2],
            y: relative ? current.y + values[3] : values[3],
          };
          point = { ...next, curve: { type: 'cubic', x1: control1.x, y1: control1.y, x2: control2.x, y2: control2.y } };
          previousCubicControl = control2;
        }

        points.push(point);
        current = next;
        if (upper !== 'C' && upper !== 'S') previousCubicControl = null;
        previousCommand = upper;
        hasDrawingSegment = true;
      }
    }

    if (groups === 0) return null;
    if (upper === 'M') command = relative ? 'l' : 'L';
  }

  if (subpathOpen || !hasDrawingSegment) return null;
  return points;
}

function cubicAxisBounds(start, control1, control2, end) {
  const a = -start + 3 * control1 - 3 * control2 + end;
  const b = 2 * (start - 2 * control1 + control2);
  const c = control1 - start;
  const roots = [];

  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) >= 1e-12) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
    }
  }

  const values = [start, end];
  for (const t of roots) {
    if (t <= 0 || t >= 1) continue;
    const inverse = 1 - t;
    values.push(
      inverse ** 3 * start + 3 * inverse ** 2 * t * control1 + 3 * inverse * t ** 2 * control2 + t ** 3 * end
    );
  }

  return { min: Math.min(...values), max: Math.max(...values) };
}

function pathPointsAreInsideViewBox(points, viewBox, toleranceX, toleranceY) {
  let current = null;
  let subpathStart = null;

  for (const point of points) {
    if ('close' in point) {
      current = subpathStart;
      continue;
    }

    if (point.moveTo) {
      current = { x: point.x, y: point.y };
      subpathStart = current;
      continue;
    }

    if (point.curve) {
      const xBounds = cubicAxisBounds(current.x, point.curve.x1, point.curve.x2, point.x);
      const yBounds = cubicAxisBounds(current.y, point.curve.y1, point.curve.y2, point.y);
      if (
        xBounds.min < viewBox.x - toleranceX ||
        xBounds.max > viewBox.x + viewBox.width + toleranceX ||
        yBounds.min < viewBox.y - toleranceY ||
        yBounds.max > viewBox.y + viewBox.height + toleranceY
      ) {
        return false;
      }
    } else if (
      point.x < viewBox.x - toleranceX ||
      point.x > viewBox.x + viewBox.width + toleranceX ||
      point.y < viewBox.y - toleranceY ||
      point.y > viewBox.y + viewBox.height + toleranceY
    ) {
      return false;
    }

    current = point;
  }

  return true;
}

function collectPathElements(svg) {
  const paths = [];
  const stylesheetClasses = new Set();

  function visit(parent) {
    for (const child of parent.childNodes) {
      if (child.nodeType === 3 && !child.nodeValue.trim()) continue;
      if (child.nodeType === 8) continue;
      if (child.nodeType !== 1) return false;

      if (child.localName === 'defs') {
        const definitions = [...child.childNodes].filter((node) => node.nodeType === 1);
        if (
          !hasOnlyEmptyStyleAttributes(child) ||
          [...child.childNodes].some(
            (node) => (node.nodeType === 3 && node.nodeValue.trim()) || ![1, 3, 8].includes(node.nodeType)
          ) ||
          definitions.length > 1 ||
          (definitions.length === 1 && definitions[0].localName !== 'style')
        ) {
          return false;
        }
        if (definitions.length === 0) continue;
        const selectors = parseSupportedStylesheet(definitions[0]);
        if (!selectors) return false;
        for (const selector of selectors) stylesheetClasses.add(selector);
        continue;
      }

      if (child.localName === 'g') {
        if (!hasOnlySupportedAttributes(child, GROUP_ATTRIBUTES)) return false;
        const style = window.getComputedStyle(child);
        if (style.display === 'none' || parseOpacity(style.opacity) === 0) continue;
        if (!hasDefaultEffects(style) || parseOpacity(style.opacity) !== 1) return false;
        if (!visit(child)) return false;
        continue;
      }

      if (child.localName !== 'path' || !hasOnlySupportedAttributes(child, PATH_ATTRIBUTES)) return false;
      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden' || parseOpacity(style.opacity) === 0) continue;
      if (!hasDefaultEffects(style) || parseOpacity(style.opacity) !== 1 || style.fillRule !== 'nonzero') return false;
      if (style.stroke !== 'none' || parseOpacity(style.strokeOpacity) !== 1) return false;

      const fill = parsePaint(style.fill);
      const fillOpacity = parseOpacity(style.fillOpacity);
      if (!fill?.color || fill.opacity !== 1 || fillOpacity !== 1) return false;

      const points = parseSupportedPathData(child.getAttribute('d') || '');
      if (!points) return false;
      paths.push({
        points,
        fill: fill.color,
        classes: (child.getAttribute('class') || '').split(/\s+/).filter(Boolean),
      });
    }

    return true;
  }

  if (!visit(svg) || paths.length === 0) return null;
  const pathClasses = new Set(paths.flatMap(({ classes }) => classes));
  if (![...stylesheetClasses].every((className) => pathClasses.has(className))) return null;
  return paths;
}

/**
 * Lower supported filled SVG paths to editable PptxGenJS custom geometry.
 * Any unsupported path, group, style, or effect returns null for picture fallback.
 */
export function lowerSupportedSvgPaths(node, { x, y, w, h, domOrder, zIndex, pptx, inheritedOpacity = 1 }) {
  if (hasUnrepresentedAncestorEffect(node)) return null;
  if (!hasOnlySupportedAttributes(node, PATH_ROOT_ATTRIBUTES, true)) return null;

  const rootStyle = window.getComputedStyle(node);
  if (!hasDefaultEffects(rootStyle) || parseOpacity(rootStyle.opacity) !== 1 || inheritedOpacity !== 1) return null;

  const viewBox = readViewBox(node);
  if (!viewBox || w <= 0 || h <= 0) return null;
  const mapping = getViewBoxMapping(node, w, h, viewBox);
  if (!mapping) return null;

  const paths = collectPathElements(node);
  if (!paths) return null;
  const toleranceX = 0.1 / (mapping.scaleX * 96);
  const toleranceY = 0.1 / (mapping.scaleY * 96);
  if (paths.some(({ points }) => !pathPointsAreInsideViewBox(points, viewBox, toleranceX, toleranceY))) return null;

  return paths.map(({ points, fill }, pathIndex) => {
    const pptxPoints = points.map((point) => {
      if ('close' in point) return { close: true };
      const mapped = {
        x: mapping.offsetX + (point.x - viewBox.x) * mapping.scaleX,
        y: mapping.offsetY + (point.y - viewBox.y) * mapping.scaleY,
        ...(point.moveTo && { moveTo: true }),
      };
      if (point.curve) {
        mapped.curve = {
          type: 'cubic',
          x1: mapping.offsetX + (point.curve.x1 - viewBox.x) * mapping.scaleX,
          y1: mapping.offsetY + (point.curve.y1 - viewBox.y) * mapping.scaleY,
          x2: mapping.offsetX + (point.curve.x2 - viewBox.x) * mapping.scaleX,
          y2: mapping.offsetY + (point.curve.y2 - viewBox.y) * mapping.scaleY,
        };
      }
      return mapped;
    });

    return {
      type: 'shape',
      zIndex: zIndex.concat([0, -1, pathIndex]),
      domOrder,
      shapeType: pptx.ShapeType.custGeom,
      options: {
        x,
        y,
        w,
        h,
        points: pptxPoints,
        fill: { color: fill },
        line: { color: 'FFFFFF', transparency: 100 },
      },
    };
  });
}

function isInsideViewBox(bounds, viewBox) {
  return (
    bounds.left >= viewBox.x - EPSILON &&
    bounds.top >= viewBox.y - EPSILON &&
    bounds.right <= viewBox.x + viewBox.width + EPSILON &&
    bounds.bottom <= viewBox.y + viewBox.height + EPSILON
  );
}

function transparency(opacity) {
  return Math.round((1 - opacity) * 100);
}

/**
 * Convert a deliberately small, fully supported inline SVG subset to editable
 * PowerPoint shapes. Returning null means the caller must preserve the SVG via
 * its existing image fallback.
 */
export function lowerSimpleSvgPrimitives(node, { x, y, w, h, domOrder, zIndex, pptx, inheritedOpacity = 1 }) {
  if (hasUnrepresentedAncestorEffect(node)) return null;
  if (!hasOnlySupportedAttributes(node, ROOT_ATTRIBUTES, true)) return null;

  const rootStyle = window.getComputedStyle(node);
  if (!hasDefaultEffects(rootStyle) || parseOpacity(rootStyle.opacity) !== 1 || inheritedOpacity !== 1) return null;

  const viewBox = readViewBox(node);
  if (!viewBox || w <= 0 || h <= 0) return null;
  const mapping = getViewBoxMapping(node, w, h, viewBox);
  if (!mapping) return null;

  const nativeShapes = [];
  let primitiveIndex = 0;
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && !child.nodeValue.trim()) continue;
    if (child.nodeType === 8) continue;
    if (child.nodeType !== 1) return null;

    const tag = child.localName;
    const allowedAttributes = PRIMITIVE_ATTRIBUTES[tag];
    if (!allowedAttributes || !hasOnlySupportedAttributes(child, allowedAttributes)) return null;

    const childStyle = window.getComputedStyle(child);
    const childOpacity = parseOpacity(childStyle.opacity);
    if (childOpacity === 0 || childStyle.display === 'none' || childStyle.visibility === 'hidden') continue;
    if (childOpacity !== 1 || !hasDefaultEffects(childStyle)) return null;

    const fill = tag === 'line' ? { color: null, opacity: 0 } : parsePaint(childStyle.fill);
    const stroke = parsePaint(childStyle.stroke);
    if (!fill || !stroke) return null;

    const fillOpacity = parseOpacity(childStyle.fillOpacity);
    const strokeOpacity = parseOpacity(childStyle.strokeOpacity);
    const strokeWidthValue = childStyle.strokeWidth.trim();
    if (strokeWidthValue.includes('%')) return null;
    const strokeWidth = Number.parseFloat(strokeWidthValue);
    if (fillOpacity === null || strokeOpacity === null || !Number.isFinite(strokeWidth) || strokeWidth < 0) return null;

    const hasFill = Boolean(fill.color) && fillOpacity * fill.opacity > 0;
    const hasStroke = Boolean(stroke.color) && strokeOpacity * stroke.opacity > 0 && strokeWidth > 0;
    if (!hasFill && !hasStroke) continue;

    const scaleTolerance = Math.max(mapping.scaleX, mapping.scaleY) * 1e-9;
    if (mapping.mode === 'none' && hasStroke && Math.abs(mapping.scaleX - mapping.scaleY) > scaleTolerance) {
      return null;
    }

    const strokeHalfWidth = hasStroke ? strokeWidth / 2 : 0;
    let shapeType;
    let shapeX;
    let shapeY;
    let shapeW;
    let shapeH;
    let flipV = false;
    let bounds;

    if (tag === 'rect') {
      const rectX = readNumber(child, 'x', 0);
      const rectY = readNumber(child, 'y', 0);
      const rectW = readNumber(child, 'width', 0);
      const rectH = readNumber(child, 'height', 0);
      if ([rectX, rectY, rectW, rectH].some((value) => value === null) || rectW <= 0 || rectH <= 0) return null;
      shapeType = pptx.ShapeType.rect;
      shapeX = rectX;
      shapeY = rectY;
      shapeW = rectW;
      shapeH = rectH;
      bounds = {
        left: rectX - (hasStroke ? strokeWidth : 0),
        top: rectY - (hasStroke ? strokeWidth : 0),
        right: rectX + rectW + (hasStroke ? strokeWidth : 0),
        bottom: rectY + rectH + (hasStroke ? strokeWidth : 0),
      };
    } else if (tag === 'circle') {
      const cx = readNumber(child, 'cx', 0);
      const cy = readNumber(child, 'cy', 0);
      const radius = readNumber(child, 'r', 0);
      if ([cx, cy, radius].some((value) => value === null) || radius <= 0) return null;
      shapeType = pptx.ShapeType.ellipse;
      shapeX = cx - radius;
      shapeY = cy - radius;
      shapeW = radius * 2;
      shapeH = radius * 2;
      bounds = {
        left: shapeX - strokeHalfWidth,
        top: shapeY - strokeHalfWidth,
        right: shapeX + shapeW + strokeHalfWidth,
        bottom: shapeY + shapeH + strokeHalfWidth,
      };
    } else {
      const x1 = readNumber(child, 'x1', 0);
      const y1 = readNumber(child, 'y1', 0);
      const x2 = readNumber(child, 'x2', 0);
      const y2 = readNumber(child, 'y2', 0);
      if ([x1, y1, x2, y2].some((value) => value === null) || (!hasStroke && !hasFill)) return null;
      shapeType = pptx.ShapeType.line;
      shapeX = Math.min(x1, x2);
      shapeY = Math.min(y1, y2);
      shapeW = Math.abs(x2 - x1);
      shapeH = Math.abs(y2 - y1);
      flipV = (x2 - x1) * (y2 - y1) < 0;
      bounds = {
        left: shapeX - strokeHalfWidth,
        top: shapeY - strokeHalfWidth,
        right: shapeX + shapeW + strokeHalfWidth,
        bottom: shapeY + shapeH + strokeHalfWidth,
      };
    }

    if (!isInsideViewBox(bounds, viewBox)) return null;

    const fillTransparency = transparency(fill.opacity * fillOpacity);
    const strokeTransparency = transparency(stroke.opacity * strokeOpacity);
    const pointsPerViewBoxUnit = mapping.scaleX * 72;
    const options = {
      x: x + mapping.offsetX + (shapeX - viewBox.x) * mapping.scaleX,
      y: y + mapping.offsetY + (shapeY - viewBox.y) * mapping.scaleY,
      w: shapeW * mapping.scaleX,
      h: shapeH * mapping.scaleY,
      fill: hasFill ? { color: fill.color, transparency: fillTransparency } : { color: 'FFFFFF', transparency: 100 },
      line: hasStroke
        ? { color: stroke.color, transparency: strokeTransparency, width: strokeWidth * pointsPerViewBoxUnit }
        : { color: 'FFFFFF', transparency: 100 },
      ...(flipV && { flipV }),
    };

    nativeShapes.push({
      type: 'shape',
      zIndex: zIndex.concat([0, -1, primitiveIndex]),
      domOrder,
      shapeType,
      options,
    });
    primitiveIndex++;
  }

  return nativeShapes;
}
