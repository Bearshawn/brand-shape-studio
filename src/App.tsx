"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type MediaKind = "image" | "video";
type MappingMode = "tone" | "sequence" | "random";
type FitMode = "cover" | "contain";
type AspectPreset = "source" | "1:1" | "4:5" | "16:9" | "9:16";

type ShapeItem = {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
  color: string;
  local?: boolean;
};

type RenderOptions = {
  columns: number;
  minScale: number;
  maxScale: number;
  contrast: number;
  threshold: number;
  rotation: number;
  mapping: MappingMode;
  fit: FitMode;
  inverted: boolean;
  transparent: boolean;
  background: string;
  sourceZoom: number;
  sourceOffsetX: number;
  sourceOffsetY: number;
  inputBlack: number;
  gamma: number;
  inputWhite: number;
  outputBlack: number;
  outputWhite: number;
};

type StudioSnapshot = RenderOptions & {
  aspectPreset: AspectPreset;
  shapes: ShapeItem[];
  paletteName: string;
};

const MAX_SHAPES = 5;
const DEFAULT_COLORS = ["#F4FF65", "#FF6B45", "#7C6CFF", "#45D6A8", "#FF78B8"];

const SHAPE_SVGS = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="black"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 95 50 50 95 5 50Z" fill="black"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M36 5h28v31h31v28H64v31H36V64H5V36h31Z" fill="black"/></svg>`,
];

const PRESETS = [
  { name: "Signal", background: "#10110F", colors: ["#F4FF65", "#F4FF65", "#F4FF65", "#F4FF65", "#F4FF65"] },
  { name: "Festival", background: "#193F2C", colors: ["#F54A2F", "#F5E9C7", "#FFB800", "#ECA6FF", "#65D5C1"] },
  { name: "Editorial", background: "#F0EFE9", colors: ["#191A17", "#E54B32", "#191A17", "#E54B32", "#191A17"] },
];

const BRAND_PALETTES = [
  { name: "Figma energy", background: "#171717", colors: ["#F24E1E", "#FF7262", "#A259FF", "#1ABCFE", "#0ACF83"] },
  { name: "Slack spectrum", background: "#4A154B", colors: ["#36C5F0", "#2EB67D", "#ECB22E", "#E01E5A", "#FFFFFF"] },
  { name: "Spotify pulse", background: "#121212", colors: ["#1ED760", "#FFFFFF", "#1ED760", "#B3B3B3", "#1ED760"] },
  { name: "Dropbox blue", background: "#F7F5F2", colors: ["#0061FF", "#1E1919", "#B4DC19", "#FF8C19", "#9B0032"] },
  { name: "Airbnb coral", background: "#FFFFFF", colors: ["#FF385C", "#222222", "#00A699", "#FC642D", "#767676"] },
  { name: "IKEA pop", background: "#0058A3", colors: ["#FFDA1A", "#FFFFFF", "#FFDA1A", "#F5F5F5", "#111111"] },
  { name: "Duolingo bright", background: "#131F24", colors: ["#58CC02", "#1CB0F6", "#FFC800", "#FF4B4B", "#CE82FF"] },
  { name: "Notion mono", background: "#FFFFFF", colors: ["#000000", "#000000", "#37352F", "#787774", "#D3D3D3"] },
];

function svgUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function seededRandom(x: number, y: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function drawSource(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  fit: FitMode,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const baseScale = fit === "cover"
    ? Math.max(width / sourceWidth, height / sourceHeight)
    : Math.min(width / sourceWidth, height / sourceHeight);
  const scale = baseScale * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (width - drawWidth) / 2 + offsetX * width * 0.5,
    (height - drawHeight) / 2 + offsetY * height * 0.5,
    drawWidth,
    drawHeight,
  );
}

function makeTintedShape(shape: ShapeItem, color: string, resolution = 256) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = resolution;
  canvas.height = resolution;
  if (!context) return canvas;

  const ratio = Math.min(resolution / shape.image.naturalWidth, resolution / shape.image.naturalHeight);
  const width = shape.image.naturalWidth * ratio;
  const height = shape.image.naturalHeight * ratio;
  context.drawImage(shape.image, (resolution - width) / 2, (resolution - height) / 2, width, height);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, resolution, resolution);
  context.globalCompositeOperation = "source-over";
  return canvas;
}

function getSourceSize(source: CanvasImageSource) {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth || 1, height: source.videoHeight || 1 };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth || 1, height: source.naturalHeight || 1 };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width || 1, height: source.height || 1 };
  }
  return { width: 1, height: 1 };
}

function outputDimensions(aspect: number, columns: number, longEdge: number) {
  const rows = Math.max(1, Math.round(columns / aspect));
  const cellsOnLongEdge = aspect >= 1 ? columns : rows;
  const cell = Math.max(1, Math.floor(longEdge / cellsOnLongEdge));
  return { width: columns * cell, height: rows * cell, rows, cell };
}

function renderMosaic(
  target: HTMLCanvasElement,
  source: CanvasImageSource,
  shapes: ShapeItem[],
  options: RenderOptions,
  width: number,
  height: number,
) {
  const context = target.getContext("2d", { alpha: true });
  if (!context || !shapes.length || width < 1 || height < 1) return;

  target.width = width;
  target.height = height;
  context.clearRect(0, 0, width, height);
  if (!options.transparent) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  }

  const cell = width / options.columns;
  const rows = Math.round(height / cell);
  const analysis = document.createElement("canvas");
  analysis.width = options.columns;
  analysis.height = rows;
  const analysisContext = analysis.getContext("2d", { willReadFrequently: true });
  if (!analysisContext) return;

  const sourceSize = getSourceSize(source);
  drawSource(
    analysisContext,
    source,
    sourceSize.width,
    sourceSize.height,
    options.columns,
    rows,
    options.fit,
    options.sourceZoom,
    options.sourceOffsetX,
    options.sourceOffsetY,
  );
  const pixels = analysisContext.getImageData(0, 0, options.columns, rows).data;
  const shapeResolution = Math.min(1024, Math.max(256, Math.ceil(cell * 3)));
  const tinted = shapes.map((shape) => makeTintedShape(shape, shape.color, shapeResolution));

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const pixelIndex = (row * options.columns + column) * 4;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      let luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      const inputRange = Math.max(1 / 255, (options.inputWhite - options.inputBlack) / 255);
      luminance = clamp((luminance - options.inputBlack / 255) / inputRange);
      luminance = Math.pow(luminance, 1 / options.gamma);
      luminance = options.outputBlack / 255 + luminance * ((options.outputWhite - options.outputBlack) / 255);
      luminance = clamp((luminance - 0.5) * options.contrast + 0.5 + options.threshold);
      let weight = options.inverted ? luminance : 1 - luminance;
      weight = clamp(weight);

      let shapeIndex = 0;
      if (options.mapping === "tone") {
        shapeIndex = Math.min(shapes.length - 1, Math.floor((1 - weight) * shapes.length));
      } else if (options.mapping === "sequence") {
        shapeIndex = (column + row) % shapes.length;
      } else {
        shapeIndex = Math.floor(seededRandom(column, row) * shapes.length);
      }

      const scale = options.minScale + weight * (options.maxScale - options.minScale);
      if (scale <= 0.025) continue;
      const drawSize = cell * scale;
      // Sub-pixel symbols lose their silhouette. Skip them cleanly instead of
      // drawing a broken-looking fragment of the original shape.
      if (drawSize < 1.5) continue;
      const centerX = column * cell + cell / 2;
      const centerY = row * cell + cell / 2;
      context.save();
      context.translate(centerX, centerY);
      context.rotate((options.rotation * Math.PI) / 180);
      context.drawImage(tinted[shapeIndex], -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      context.restore();
    }
  }
}

function getHistogram(source: CanvasImageSource, options: RenderOptions, aspect: number) {
  const width = 192;
  const height = Math.max(1, Math.round(width / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const bins = new Array<number>(256).fill(0);
  if (!context) return bins;
  const sourceSize = getSourceSize(source);
  drawSource(context, source, sourceSize.width, sourceSize.height, width, height, options.fit, options.sourceZoom, options.sourceOffsetX, options.sourceOffsetY);
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = Math.round(0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]);
    bins[luminance] += 1;
  }
  return bins;
}

function paintHistogram(canvas: HTMLCanvasElement, bins: number[]) {
  canvas.width = 512;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const peak = Math.max(1, ...bins);
  context.fillStyle = "#e2e3da";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#383a35";
  bins.forEach((count, index) => {
    const barHeight = Math.sqrt(count / peak) * canvas.height;
    context.fillRect(index * 2, canvas.height - barHeight, 2, barHeight);
  });
}

function createSampleSource() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const sky = context.createLinearGradient(0, 0, 1200, 800);
  sky.addColorStop(0, "#f4ddc3");
  sky.addColorStop(0.45, "#9fb8d8");
  sky.addColorStop(1, "#1b3445");
  context.fillStyle = sky;
  context.fillRect(0, 0, 1200, 800);
  context.fillStyle = "#f7cc65";
  context.beginPath();
  context.arc(890, 190, 108, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#476c5e";
  context.beginPath();
  context.moveTo(0, 610);
  context.bezierCurveTo(230, 430, 430, 470, 660, 610);
  context.bezierCurveTo(890, 730, 1030, 480, 1200, 550);
  context.lineTo(1200, 800);
  context.lineTo(0, 800);
  context.closePath();
  context.fill();
  context.fillStyle = "#12212a";
  context.beginPath();
  context.ellipse(540, 430, 120, 210, -0.25, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#dc765c";
  context.beginPath();
  context.arc(520, 270, 92, 0, Math.PI * 2);
  context.fill();
  return canvas;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function buildMosaicSvg(
  source: CanvasImageSource,
  shapes: ShapeItem[],
  options: RenderOptions,
  width: number,
  height: number,
) {
  const cell = width / options.columns;
  const rows = Math.round(height / cell);
  const analysis = document.createElement("canvas");
  analysis.width = options.columns;
  analysis.height = rows;
  const analysisContext = analysis.getContext("2d", { willReadFrequently: true });
  if (!analysisContext) return "";

  const sourceSize = getSourceSize(source);
  drawSource(
    analysisContext,
    source,
    sourceSize.width,
    sourceSize.height,
    options.columns,
    rows,
    options.fit,
    options.sourceZoom,
    options.sourceOffsetX,
    options.sourceOffsetY,
  );
  const pixels = analysisContext.getImageData(0, 0, options.columns, rows).data;
  const definitions = shapes.map((shape, index) => `
    <g id="shape-${index}"><image href="${escapeXml(shape.url)}" x="-0.5" y="-0.5" width="1" height="1" preserveAspectRatio="xMidYMid meet"/></g>
    <filter id="tint-${index}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feFlood flood-color="${escapeXml(shape.color)}" result="color"/>
      <feComposite in="color" in2="SourceAlpha" operator="in"/>
    </filter>`).join("");
  const symbols: string[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const pixelIndex = (row * options.columns + column) * 4;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      let luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      const inputRange = Math.max(1 / 255, (options.inputWhite - options.inputBlack) / 255);
      luminance = clamp((luminance - options.inputBlack / 255) / inputRange);
      luminance = Math.pow(luminance, 1 / options.gamma);
      luminance = options.outputBlack / 255 + luminance * ((options.outputWhite - options.outputBlack) / 255);
      luminance = clamp((luminance - 0.5) * options.contrast + 0.5 + options.threshold);
      let weight = options.inverted ? luminance : 1 - luminance;
      weight = clamp(weight);

      let shapeIndex = 0;
      if (options.mapping === "tone") {
        shapeIndex = Math.min(shapes.length - 1, Math.floor((1 - weight) * shapes.length));
      } else if (options.mapping === "sequence") {
        shapeIndex = (column + row) % shapes.length;
      } else {
        shapeIndex = Math.floor(seededRandom(column, row) * shapes.length);
      }

      const scale = options.minScale + weight * (options.maxScale - options.minScale);
      const drawSize = cell * scale;
      if (scale <= 0.025 || drawSize < 1.5) continue;
      const centerX = column * cell + cell / 2;
      const centerY = row * cell + cell / 2;
      symbols.push(`<use href="#shape-${shapeIndex}" filter="url(#tint-${shapeIndex})" transform="translate(${centerX.toFixed(3)} ${centerY.toFixed(3)}) rotate(${options.rotation}) scale(${drawSize.toFixed(3)})"/>`);
    }
  }

  const background = options.transparent ? "" : `<rect width="100%" height="100%" fill="${escapeXml(options.background)}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${definitions}</defs>
  ${background}
  ${symbols.join("\n  ")}
</svg>`;
}

function decodeSvgDataUrl(url: string) {
  if (!url.startsWith("data:image/svg+xml")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  try {
    const header = url.slice(0, comma);
    const payload = url.slice(comma + 1);
    return header.includes(";base64") ? window.atob(payload) : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function illustratorShapeDefinition(shape: ShapeItem, index: number) {
  const svgSource = decodeSvgDataUrl(shape.url);
  if (!svgSource) {
    return {
      vector: false,
      markup: `<symbol id="ai-shape-${index}" viewBox="0 0 1 1"><image href="${escapeXml(shape.url)}" xlink:href="${escapeXml(shape.url)}" x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid meet"/></symbol>`,
    };
  }

  const documentNode = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  const root = documentNode.documentElement;
  if (root.nodeName.toLowerCase() === "parsererror") {
    return { vector: false, markup: "" };
  }

  root.querySelectorAll("path,rect,circle,ellipse,polygon,polyline,line,text").forEach((element) => {
    const fill = element.getAttribute("fill");
    const stroke = element.getAttribute("stroke");
    if (fill !== "none") element.setAttribute("fill", "currentColor");
    if (stroke && stroke !== "none") element.setAttribute("stroke", "currentColor");
    const style = element.getAttribute("style");
    if (style) {
      const cleaned = style
        .replace(/(^|;)\s*fill\s*:[^;]*/gi, "$1")
        .replace(/(^|;)\s*stroke\s*:[^;]*/gi, "$1");
      cleaned.trim().replace(/^;+|;+$/g, "")
        ? element.setAttribute("style", cleaned)
        : element.removeAttribute("style");
    }
  });

  const viewBox = root.getAttribute("viewBox")
    ?? `0 0 ${root.getAttribute("width") ?? 100} ${root.getAttribute("height") ?? 100}`;
  const serializer = new XMLSerializer();
  const content = Array.from(root.childNodes).map((node) => serializer.serializeToString(node)).join("");
  return {
    vector: true,
    markup: `<symbol id="ai-shape-${index}" viewBox="${escapeXml(viewBox)}" overflow="visible">${content}</symbol>`,
  };
}

function buildCompactIllustratorSvg(
  source: CanvasImageSource,
  shapes: ShapeItem[],
  options: RenderOptions,
  width: number,
  height: number,
) {
  const cell = width / options.columns;
  const rows = Math.round(height / cell);
  const analysis = document.createElement("canvas");
  analysis.width = options.columns;
  analysis.height = rows;
  const analysisContext = analysis.getContext("2d", { willReadFrequently: true });
  if (!analysisContext) return null;

  const sourceSize = getSourceSize(source);
  drawSource(
    analysisContext,
    source,
    sourceSize.width,
    sourceSize.height,
    options.columns,
    rows,
    options.fit,
    options.sourceZoom,
    options.sourceOffsetX,
    options.sourceOffsetY,
  );
  const pixels = analysisContext.getImageData(0, 0, options.columns, rows).data;
  const definitions = shapes.map(illustratorShapeDefinition);
  const uses: string[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const pixelIndex = (row * options.columns + column) * 4;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      let luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      const inputRange = Math.max(1 / 255, (options.inputWhite - options.inputBlack) / 255);
      luminance = clamp((luminance - options.inputBlack / 255) / inputRange);
      luminance = Math.pow(luminance, 1 / options.gamma);
      luminance = options.outputBlack / 255 + luminance * ((options.outputWhite - options.outputBlack) / 255);
      luminance = clamp((luminance - 0.5) * options.contrast + 0.5 + options.threshold);
      const weight = clamp(options.inverted ? luminance : 1 - luminance);

      let shapeIndex = 0;
      if (options.mapping === "tone") {
        shapeIndex = Math.min(shapes.length - 1, Math.floor((1 - weight) * shapes.length));
      } else if (options.mapping === "sequence") {
        shapeIndex = (column + row) % shapes.length;
      } else {
        shapeIndex = Math.floor(seededRandom(column, row) * shapes.length);
      }

      const scale = options.minScale + weight * (options.maxScale - options.minScale);
      const drawSize = cell * scale;
      if (scale <= 0.025 || drawSize < 1.5 || !definitions[shapeIndex]?.markup) continue;
      const centerX = column * cell + cell / 2;
      const centerY = row * cell + cell / 2;
      const x = centerX - drawSize / 2;
      const y = centerY - drawSize / 2;
      const color = shapes[shapeIndex].color;
      uses.push(`<use href="#ai-shape-${shapeIndex}" xlink:href="#ai-shape-${shapeIndex}" x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${drawSize.toFixed(3)}" height="${drawSize.toFixed(3)}" preserveAspectRatio="xMidYMid meet" fill="${escapeXml(color)}" color="${escapeXml(color)}" transform="rotate(${options.rotation} ${centerX.toFixed(3)} ${centerY.toFixed(3)})"/>`);
    }
  }

  const background = options.transparent ? "" : `<rect width="100%" height="100%" fill="${escapeXml(options.background)}"/>`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>Brand Shape Studio — Compact Illustrator SVG</title>
  <desc>Reusable symbols keep this file compact. In Illustrator, select all and use Object > Expand to edit individual instances.</desc>
  <defs>${definitions.map(({ markup }) => markup).join("\n")}</defs>
  ${background}
  ${uses.join("\n  ")}
</svg>`;
  return { svg, rasterCount: definitions.filter(({ vector }) => !vector).length, instanceCount: uses.length };
}

export default function ShapeStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const histogramRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceRef = useRef<CanvasImageSource | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const recordingRef = useRef<MediaRecorder | null>(null);
  const historyRef = useRef<StudioSnapshot[]>([]);
  const lastSnapshotRef = useRef<StudioSnapshot | null>(null);
  const lastSnapshotSignatureRef = useRef("");
  const historyReadyRef = useRef(false);
  const isRestoringHistoryRef = useRef(false);

  const [sourceName, setSourceName] = useState("Mountain sample");
  const [mediaKind, setMediaKind] = useState<MediaKind>("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [sourceAspect, setSourceAspect] = useState(1.5);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("source");
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [columns, setColumns] = useState(52);
  const [minScale, setMinScale] = useState(0.08);
  const [maxScale, setMaxScale] = useState(0.92);
  const [contrast, setContrast] = useState(1.25);
  const [threshold, setThreshold] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [mapping, setMapping] = useState<MappingMode>("tone");
  const [fit, setFit] = useState<FitMode>("cover");
  const [inverted, setInverted] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState("#10110F");
  const [sourceZoom, setSourceZoom] = useState(1);
  const [sourceOffsetX, setSourceOffsetX] = useState(0);
  const [sourceOffsetY, setSourceOffsetY] = useState(0);
  const [inputBlack, setInputBlack] = useState(0);
  const [gamma, setGamma] = useState(1);
  const [inputWhite, setInputWhite] = useState(255);
  const [outputBlack, setOutputBlack] = useState(0);
  const [outputWhite, setOutputWhite] = useState(255);
  const [paletteName, setPaletteName] = useState("Signal");
  const [exportSize, setExportSize] = useState(4096);
  const [videoSize, setVideoSize] = useState(1920);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [message, setMessage] = useState("Mountain sample loaded. Upload your own source and brand shapes when ready.");

  const options = useMemo<RenderOptions>(() => ({
    columns,
    minScale,
    maxScale,
    contrast,
    threshold,
    rotation,
    mapping,
    fit,
    inverted,
    transparent,
    background,
    sourceZoom,
    sourceOffsetX,
    sourceOffsetY,
    inputBlack,
    gamma,
    inputWhite,
    outputBlack,
    outputWhite,
  }), [columns, minScale, maxScale, contrast, threshold, rotation, mapping, fit, inverted, transparent, background, sourceZoom, sourceOffsetX, sourceOffsetY, inputBlack, gamma, inputWhite, outputBlack, outputWhite]);

  const currentSnapshot = useMemo<StudioSnapshot>(() => ({
    ...options,
    aspectPreset,
    shapes,
    paletteName,
  }), [aspectPreset, options, paletteName, shapes]);

  const snapshotSignature = useMemo(() => JSON.stringify({
    ...options,
    aspectPreset,
    paletteName,
    shapes: shapes.map(({ id, name, url, color }) => ({ id, name, url, color })),
  }), [aspectPreset, options, paletteName, shapes]);

  const aspect = useMemo(() => {
    if (aspectPreset === "1:1") return 1;
    if (aspectPreset === "4:5") return 4 / 5;
    if (aspectPreset === "16:9") return 16 / 9;
    if (aspectPreset === "9:16") return 9 / 16;
    return sourceAspect;
  }, [aspectPreset, sourceAspect]);

  const previewDimensions = useMemo(() => outputDimensions(aspect, columns, 1280), [aspect, columns]);
  const imageDimensions = useMemo(() => outputDimensions(aspect, columns, exportSize), [aspect, columns, exportSize]);
  const videoDimensions = useMemo(() => outputDimensions(aspect, columns, videoSize), [aspect, columns, videoSize]);

  useEffect(() => {
    if (!shapes.length) return;
    if (!historyReadyRef.current) {
      historyReadyRef.current = true;
      lastSnapshotRef.current = currentSnapshot;
      lastSnapshotSignatureRef.current = snapshotSignature;
      return;
    }
    if (isRestoringHistoryRef.current) {
      isRestoringHistoryRef.current = false;
      lastSnapshotRef.current = currentSnapshot;
      lastSnapshotSignatureRef.current = snapshotSignature;
      return;
    }
    if (snapshotSignature === lastSnapshotSignatureRef.current) return;

    const timer = window.setTimeout(() => {
      if (lastSnapshotRef.current) {
        historyRef.current = [...historyRef.current, lastSnapshotRef.current].slice(-10);
        setHistoryDepth(historyRef.current.length);
      }
      lastSnapshotRef.current = currentSnapshot;
      lastSnapshotSignatureRef.current = snapshotSignature;
    }, 220);
    return () => window.clearTimeout(timer);
  }, [currentSnapshot, shapes.length, snapshotSignature]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(SHAPE_SVGS.map((shape) => loadImage(svgUrl(shape)))).then((images) => {
      if (cancelled) return;
      setShapes(images.map((image, index) => ({
        id: `default-${index}`,
        name: ["Circle", "Diamond", "Cross"][index],
        url: image.src,
        image,
        color: DEFAULT_COLORS[index],
      })));
    });
    loadImage("/default-source.jpg").then((image) => {
      if (cancelled) return;
      sourceRef.current = image;
      setSourceName("Mountain sample");
      setSourceAspect(image.naturalWidth / image.naturalHeight);
      setMediaKind("image");
      setMediaUrl("");
      setMessage("Mountain sample loaded. Upload your own source and brand shapes when ready.");
    }).catch(() => {
      if (cancelled) return;
      const sample = createSampleSource();
      sourceRef.current = sample;
      setSourceName("Studio sample");
      setSourceAspect(sample.width / sample.height);
      setMessage("Fallback sample loaded. Upload your own source when ready.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const source = mediaKind === "video" ? videoRef.current : sourceRef.current;
    if (!canvas || !source || !shapes.length) return;
    if (source instanceof HTMLVideoElement && source.readyState < 2) return;
    if (showOriginal) {
      canvas.width = previewDimensions.width;
      canvas.height = previewDimensions.height;
      const context = canvas.getContext("2d");
      const sourceSize = getSourceSize(source);
      if (!context) return;
      drawSource(context, source, sourceSize.width, sourceSize.height, canvas.width, canvas.height, options.fit, options.sourceZoom, options.sourceOffsetX, options.sourceOffsetY);
    } else {
      renderMosaic(canvas, source, shapes, options, previewDimensions.width, previewDimensions.height);
    }
    if (histogramRef.current) paintHistogram(histogramRef.current, getHistogram(source, options, aspect));
  }, [aspect, mediaKind, options, previewDimensions, shapes, showOriginal]);

  useEffect(() => {
    if (mediaKind === "image") {
      drawPreview();
      return;
    }

    const loop = () => {
      drawPreview();
      const video = videoRef.current;
      if (video) {
        setVideoTime(video.currentTime);
        setExportProgress(video.duration ? video.currentTime / video.duration : 0);
      }
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [drawPreview, mediaKind]);

  async function handleSourceUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    const url = URL.createObjectURL(file);
    mediaUrlRef.current = url;
    setSourceName(file.name);

    if (file.type.startsWith("video/")) {
      sourceRef.current = null;
      setMediaKind("video");
      setMediaUrl(url);
      setMessage("Video loaded. Press play to preview the generated motion.");
    } else {
      try {
        const image = await loadImage(url);
        sourceRef.current = image;
        setMediaKind("image");
        setMediaUrl("");
        setSourceAspect(image.naturalWidth / image.naturalHeight);
        setMessage("Image loaded. The result updates as you adjust the controls.");
      } catch {
        setMessage("This image could not be opened. Try a JPG, PNG or WebP file.");
      }
    }
    event.target.value = "";
  }

  async function handleShapeUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const available = MAX_SHAPES - shapes.length;
    if (available <= 0) {
      setMessage("Five shapes are already loaded. Remove one before adding another.");
      return;
    }
    const selected = files.slice(0, available);
    const additions: ShapeItem[] = [];
    for (const [index, file] of selected.entries()) {
      try {
        const url = await fileToDataUrl(file);
        const image = await loadImage(url);
        additions.push({
          id: `${file.name}-${file.lastModified}-${index}`,
          name: file.name,
          url,
          image,
          color: DEFAULT_COLORS[(shapes.length + index) % DEFAULT_COLORS.length],
        });
      } catch {
        continue;
      }
    }
    setShapes((current) => [...current, ...additions].slice(0, MAX_SHAPES));
    setMessage(`${additions.length} shape${additions.length === 1 ? "" : "s"} added. Transparent SVG or PNG works best.`);
    event.target.value = "";
  }

  function removeShape(id: string) {
    setShapes((current) => {
      const item = current.find((shape) => shape.id === id);
      if (item?.local) URL.revokeObjectURL(item.url);
      return current.filter((shape) => shape.id !== id);
    });
  }

  function updateShapeColor(id: string, color: string) {
    setShapes((current) => current.map((shape) => shape.id === id ? { ...shape, color } : shape));
  }

  function moveShape(index: number, direction: -1 | 1) {
    setShapes((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function clearShapes() {
    shapes.forEach((shape) => {
      if (shape.local) URL.revokeObjectURL(shape.url);
    });
    setShapes([]);
    setMessage("Shapes cleared. Upload one to five transparent SVG or PNG files.");
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setBackground(preset.background);
    setPaletteName(preset.name);
    setShapes((current) => current.map((shape, index) => ({
      ...shape,
      color: preset.colors[index % preset.colors.length],
    })));
  }

  function randomBrandPalette() {
    const candidates = BRAND_PALETTES.filter((palette) => palette.name !== paletteName);
    const palette = candidates[Math.floor(Math.random() * candidates.length)] ?? BRAND_PALETTES[0];
    setBackground(palette.background);
    setShapes((current) => current.map((shape, index) => ({
      ...shape,
      color: palette.colors[index % palette.colors.length],
    })));
    setPaletteName(palette.name);
    setMessage(`${palette.name} applied. Click Random color again for another curated combination.`);
  }

  function resetLevels() {
    setInputBlack(0);
    setGamma(1);
    setInputWhite(255);
    setOutputBlack(0);
    setOutputWhite(255);
    setMessage("Levels reset. The source luminance is mapped without clipping.");
  }

  function autoLevels() {
    const source = mediaKind === "video" ? videoRef.current : sourceRef.current;
    if (!source || (source instanceof HTMLVideoElement && source.readyState < 2)) return;
    const bins = getHistogram(source, options, aspect);
    const total = bins.reduce((sum, count) => sum + count, 0);
    const percentile = (target: number) => {
      let count = 0;
      for (let index = 0; index < bins.length; index += 1) {
        count += bins[index];
        if (count >= total * target) return index;
      }
      return 255;
    };
    const black = percentile(0.01);
    const white = percentile(0.99);
    if (white - black < 8) {
      setMessage("Auto Levels found very little luminance range, so the current values were kept.");
      return;
    }
    setInputBlack(black);
    setInputWhite(white);
    setGamma(1);
    setMessage(`Auto Levels set the source range to ${black}–${white}. Fine-tune Midtones if needed.`);
  }

  function resetComposition() {
    setSourceZoom(1);
    setSourceOffsetX(0);
    setSourceOffsetY(0);
    setRotation(0);
    setMessage("Composition and rotation reset. Uploaded shapes now keep their exact orientation.");
  }

  function undoLastChange() {
    const snapshot = historyRef.current.pop();
    if (!snapshot) {
      setMessage("There are no more changes to undo.");
      return;
    }
    isRestoringHistoryRef.current = true;
    setAspectPreset(snapshot.aspectPreset);
    setShapes(snapshot.shapes);
    setPaletteName(snapshot.paletteName);
    setColumns(snapshot.columns);
    setMinScale(snapshot.minScale);
    setMaxScale(snapshot.maxScale);
    setContrast(snapshot.contrast);
    setThreshold(snapshot.threshold);
    setRotation(snapshot.rotation);
    setMapping(snapshot.mapping);
    setFit(snapshot.fit);
    setInverted(snapshot.inverted);
    setTransparent(snapshot.transparent);
    setBackground(snapshot.background);
    setSourceZoom(snapshot.sourceZoom);
    setSourceOffsetX(snapshot.sourceOffsetX);
    setSourceOffsetY(snapshot.sourceOffsetY);
    setInputBlack(snapshot.inputBlack);
    setGamma(snapshot.gamma);
    setInputWhite(snapshot.inputWhite);
    setOutputBlack(snapshot.outputBlack);
    setOutputWhite(snapshot.outputWhite);
    setHistoryDepth(historyRef.current.length);
    setMessage(`Change undone. ${historyRef.current.length} earlier step${historyRef.current.length === 1 ? "" : "s"} available.`);
  }

  function saveSetup() {
    const setup = {
      version: 2,
      savedAt: new Date().toISOString(),
      note: "Source photo or video is intentionally not included.",
      aspectPreset,
      columns,
      minScale,
      maxScale,
      contrast,
      threshold,
      rotation,
      mapping,
      fit,
      inverted,
      transparent,
      background,
      sourceZoom,
      sourceOffsetX,
      sourceOffsetY,
      inputBlack,
      gamma,
      inputWhite,
      outputBlack,
      outputWhite,
      exportSize,
      videoSize,
      shapes: shapes.map(({ name, url, color }) => ({ name, url, color })),
    };
    downloadBlob(new Blob([JSON.stringify(setup, null, 2)], { type: "application/json" }), "brand-shape-setup.json");
    setMessage("Setup saved with shapes, colors and controls. The source photo or video is not included.");
  }

  async function loadSetup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const setup = JSON.parse(await file.text());
      if (!setup || !Array.isArray(setup.shapes)) throw new Error("Invalid setup");
      const loadedShapes: ShapeItem[] = [];
      for (const [index, savedShape] of setup.shapes.slice(0, MAX_SHAPES).entries()) {
        if (typeof savedShape.url !== "string") continue;
        const image = await loadImage(savedShape.url);
        loadedShapes.push({
          id: `loaded-${Date.now()}-${index}`,
          name: String(savedShape.name ?? `Shape ${index + 1}`),
          url: savedShape.url,
          image,
          color: typeof savedShape.color === "string" ? savedShape.color : DEFAULT_COLORS[index],
        });
      }
      setShapes(loadedShapes);
      setAspectPreset((["source", "1:1", "4:5", "16:9", "9:16"].includes(setup.aspectPreset) ? setup.aspectPreset : "source") as AspectPreset);
      setColumns(clamp(Number(setup.columns) || 52, 12, 200));
      setMinScale(Number.isFinite(setup.minScale) ? setup.minScale : 0.08);
      setMaxScale(Number.isFinite(setup.maxScale) ? setup.maxScale : 0.92);
      setContrast(Number.isFinite(setup.contrast) ? setup.contrast : 1.25);
      setThreshold(Number.isFinite(setup.threshold) ? setup.threshold : 0);
      setRotation(Number.isFinite(setup.rotation) ? setup.rotation : 0);
      setMapping((["tone", "sequence", "random"].includes(setup.mapping) ? setup.mapping : "tone") as MappingMode);
      setFit((setup.fit === "contain" ? "contain" : "cover") as FitMode);
      setInverted(Boolean(setup.inverted));
      setTransparent(Boolean(setup.transparent));
      setBackground(typeof setup.background === "string" ? setup.background : "#10110F");
      setSourceZoom(Number.isFinite(setup.sourceZoom) ? setup.sourceZoom : 1);
      setSourceOffsetX(Number.isFinite(setup.sourceOffsetX) ? setup.sourceOffsetX : 0);
      setSourceOffsetY(Number.isFinite(setup.sourceOffsetY) ? setup.sourceOffsetY : 0);
      setInputBlack(Number.isFinite(setup.inputBlack) ? setup.inputBlack : 0);
      setGamma(Number.isFinite(setup.gamma) ? setup.gamma : 1);
      setInputWhite(Number.isFinite(setup.inputWhite) ? setup.inputWhite : 255);
      setOutputBlack(Number.isFinite(setup.outputBlack) ? setup.outputBlack : 0);
      setOutputWhite(Number.isFinite(setup.outputWhite) ? setup.outputWhite : 255);
      setExportSize(Number(setup.exportSize) || 4096);
      setVideoSize(Number(setup.videoSize) || 1920);
      setMessage("Setup loaded. Upload the source photo or video you want to use with it.");
    } catch {
      setMessage("This setup file could not be loaded. Choose a JSON file saved by Brand Shape Studio.");
    }
    event.target.value = "";
  }

  async function exportImage() {
    const source = mediaKind === "video" ? videoRef.current : sourceRef.current;
    if (!source || !shapes.length) {
      setMessage("Add a source image and at least one shape before exporting.");
      return;
    }
    const canvas = document.createElement("canvas");
    renderMosaic(canvas, source, shapes, options, imageDimensions.width, imageDimensions.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `brand-shape-${imageDimensions.width}x${imageDimensions.height}.png`);
      setMessage(`PNG exported at ${imageDimensions.width} × ${imageDimensions.height}px.`);
    }, "image/png");
  }

  function exportSvg() {
    if (mediaKind !== "image") {
      setMessage("SVG export is available for still images only.");
      return;
    }
    const source = sourceRef.current;
    if (!source || !shapes.length) {
      setMessage("Add a source image and at least one shape before exporting.");
      return;
    }
    const svg = buildMosaicSvg(source, shapes, options, imageDimensions.width, imageDimensions.height);
    if (!svg) {
      setMessage("The SVG could not be created in this browser.");
      return;
    }
    downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `brand-shape-${imageDimensions.width}x${imageDimensions.height}.svg`);
    setMessage(`SVG exported with ${columns} columns at ${imageDimensions.width} × ${imageDimensions.height}px.`);
  }

  function exportIllustratorSvg() {
    if (mediaKind !== "image") {
      setMessage("Illustrator SVG export is available for still images only.");
      return;
    }
    const source = sourceRef.current;
    if (!source || !shapes.length) {
      setMessage("Add a source image and at least one shape before exporting.");
      return;
    }
    const result = buildCompactIllustratorSvg(source, shapes, options, imageDimensions.width, imageDimensions.height);
    if (!result) {
      setMessage("The Illustrator SVG could not be created in this browser.");
      return;
    }
    downloadBlob(
      new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }),
      `brand-shape-illustrator-compact-${imageDimensions.width}x${imageDimensions.height}.svg`,
    );
    const rasterNote = result.rasterCount
      ? ` ${result.rasterCount} raster shape${result.rasterCount === 1 ? " was" : "s were"} embedded; upload SVG shapes for fully vector artwork.`
      : " All uploaded shapes are reusable vector symbols.";
    setMessage(`Compact Illustrator SVG exported with ${result.instanceCount.toLocaleString()} instances.${rasterNote}`);
  }

  async function exportVideo() {
    const video = videoRef.current;
    if (!video || !shapes.length || typeof MediaRecorder === "undefined") {
      setMessage("Video export is not supported in this browser. Try the latest Chrome.");
      return;
    }
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = videoDimensions.width;
    exportCanvas.height = videoDimensions.height;
    const captureCanvas = exportCanvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream };
    if (!captureCanvas.captureStream) {
      setMessage("Canvas video export is not supported in this browser. Try the latest Chrome.");
      return;
    }

    const stream = captureCanvas.captureStream(30);
    const videoWithCapture = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    const sourceStream = videoWithCapture.captureStream?.() ?? videoWithCapture.mozCaptureStream?.();
    sourceStream?.getAudioTracks().forEach((track) => stream.addTrack(track));
    const mimeCandidates = [
      "video/mp4;codecs=avc1.64003E,mp4a.40.2",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
    ];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      setMessage("This browser cannot create MP4 directly. Update Chrome or Safari, then try again.");
      return;
    }
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setMessage("MP4 encoding could not start in this browser. Update Chrome or Safari, then try again.");
      return;
    }
    recordingRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      downloadBlob(new Blob(chunks, { type: mimeType }), "brand-shape-video.mp4");
      setIsExportingVideo(false);
      setExportProgress(1);
      stream.getTracks().forEach((track) => track.stop());
      setMessage(`Video exported at ${videoDimensions.width} × ${videoDimensions.height}px as MP4.`);
    };

    setIsExportingVideo(true);
    setExportProgress(0);
    video.pause();
    video.currentTime = 0;
    const renderRecordingFrame = () => {
      if (!isNaN(video.duration)) setExportProgress(video.currentTime / video.duration);
      renderMosaic(exportCanvas, video, shapes, options, videoDimensions.width, videoDimensions.height);
      if (!video.ended && recordingRef.current?.state === "recording") {
        requestAnimationFrame(renderRecordingFrame);
      }
    };
    const stop = () => {
      if (recorder.state === "recording") recorder.stop();
      video.removeEventListener("ended", stop);
    };
    video.addEventListener("ended", stop);
    recorder.start(250);
    await video.play();
    requestAnimationFrame(renderRecordingFrame);
    setMessage("Exporting in real time. Keep this tab open until the video finishes.");
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }

  function seekVideo(value: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setVideoTime(value);
    drawPreview();
  }

  function quickSave() {
    if (mediaKind === "image") exportImage();
    else exportVideo();
  }

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Brand Shape Studio</span>
        </div>
        <div className="privacy-pill"><span /> Local processing</div>
      </header>

      <section className="workspace">
        <aside className="panel panel-left">
          <div className="panel-heading">
            <span className="step">01</span>
            <div><h1>Source</h1><p>Photo or video</p></div>
          </div>

          <label className="dropzone source-dropzone">
            <span className="drop-icon">↥</span>
            <strong>Upload source</strong>
            <small>JPG, PNG, WebP, MP4 or WebM</small>
            <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={handleSourceUpload} />
          </label>
          <p className="file-label" title={sourceName}>{sourceName}</p>

          <div className="section-rule" />
          <div className="panel-heading compact">
            <span className="step">02</span>
            <div><h2>Brand shapes</h2><p>{shapes.length} / {MAX_SHAPES} loaded</p></div>
          </div>

          <div className="shape-list">
            {shapes.map((shape, index) => (
              <div className="shape-row" key={shape.id}>
                <span className="shape-order">{index + 1}</span>
                <span className="shape-preview" style={{ background: shape.color }}>
                  {/* Blob and data URLs uploaded in-browser cannot use the framework image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shape.url} alt="" />
                </span>
                <span className="shape-name" title={shape.name}>{shape.name}</span>
                <input
                  className="mini-color"
                  type="color"
                  aria-label={`Color for ${shape.name}`}
                  value={shape.color}
                  onChange={(event) => updateShapeColor(shape.id, event.target.value)}
                />
                <span className="shape-actions">
                  <button type="button" onClick={() => moveShape(index, -1)} disabled={index === 0} aria-label="Move earlier">↑</button>
                  <button type="button" onClick={() => moveShape(index, 1)} disabled={index === shapes.length - 1} aria-label="Move later">↓</button>
                  <button type="button" onClick={() => removeShape(shape.id)} aria-label="Remove shape">×</button>
                </span>
              </div>
            ))}
          </div>

          <div className="shape-buttons">
            <label className={`small-upload ${shapes.length >= MAX_SHAPES ? "disabled" : ""}`}>
              + Add shapes
              <input
                type="file"
                accept="image/svg+xml,image/png,image/webp,image/jpeg"
                multiple
                disabled={shapes.length >= MAX_SHAPES}
                onChange={handleShapeUpload}
              />
            </label>
            <button type="button" className="text-button" onClick={clearShapes} disabled={!shapes.length}>Clear</button>
          </div>
          <p className="hint">Transparent SVG or PNG gives the cleanest result. Shape proportions are preserved inside every square cell.</p>
        </aside>

        <section className="stage-column">
          <div className="stage-toolbar">
            <div className="stage-file">
              <span className="status-dot" />
              <span>{sourceName}</span>
            </div>
            <div className="stage-actions" aria-label="Canvas quick actions">
              <button type="button" className={showOriginal ? "active" : ""} aria-pressed={showOriginal} onClick={() => setShowOriginal((current) => !current)} title="Compare with the original source">◐ <span>Original</span></button>
              <button type="button" onClick={undoLastChange} disabled={!historyDepth} title="Undo up to 10 recent changes">↶ <span>Undo</span><small>{historyDepth}</small></button>
              <button id="quick-save" type="button" className="quick-save" onClick={quickSave} disabled={!shapes.length || isExportingVideo} title={mediaKind === "image" ? "Quick save PNG" : "Quick save MP4"}>↓ <span>Quick save</span></button>
            </div>
            <span className="preview-size">{previewDimensions.width} × {previewDimensions.height}</span>
          </div>
          <div className={`canvas-stage ${transparent ? "checkerboard" : ""}`}>
            <canvas ref={canvasRef} aria-label="Generated brand-shape preview" />
            {!shapes.length && <div className="empty-state"><strong>Add a brand shape</strong><span>Upload one to five SVG or PNG graphics.</span></div>}
          </div>

          {mediaKind === "video" && (
            <div className="video-controls">
              <button type="button" onClick={togglePlayback}>{isPlaying ? "Pause" : "Play"}</button>
              <input
                type="range"
                min="0"
                max={videoDuration || 0}
                step="0.01"
                value={videoTime}
                onChange={(event) => seekVideo(Number(event.target.value))}
              />
              <span>{videoTime.toFixed(1)}s / {videoDuration.toFixed(1)}s</span>
            </div>
          )}

          <div className="message-bar"><span>i</span>{message}</div>

          {mediaKind === "video" && mediaUrl && (
            <video
              className="source-video"
              ref={videoRef}
              src={mediaUrl}
              playsInline
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
              setSourceAspect(video.videoWidth / video.videoHeight);
                setVideoDuration(video.duration || 0);
                setVideoTime(0);
                drawPreview();
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          )}
        </section>

        <aside className="panel panel-right">
          <div className="panel-heading">
            <span className="step">03</span>
            <div><h2>Build the system</h2><p>Live controls</p></div>
          </div>

          <div className="preset-row">
            {PRESETS.map((preset) => (
              <button type="button" key={preset.name} onClick={() => applyPreset(preset)}>{preset.name}</button>
            ))}
          </div>

          <div className="brand-palette-card">
            <div>
              <span>Curated brand palette</span>
              <strong>{paletteName}</strong>
            </div>
            <div className="palette-swatches" aria-label={`${paletteName} colors`}>
              {shapes.map((shape) => <i key={shape.id} style={{ background: shape.color }} />)}
            </div>
            <button type="button" onClick={randomBrandPalette}>↻ Random color</button>
          </div>

          <div className="control-label"><span>Canvas ratio</span><small>Square cells stay exact</small></div>
          <div className="ratio-row">
            {(["source", "1:1", "4:5", "16:9", "9:16"] as AspectPreset[]).map((ratio) => (
              <button
                type="button"
                key={ratio}
                className={aspectPreset === ratio ? "active" : ""}
                onClick={() => setAspectPreset(ratio)}
              >
                {ratio === "source" ? "Source" : ratio}
              </button>
            ))}
          </div>

          <Control label="Grid columns" value={columns} display={`${columns}`} min={12} max={200} step={1} onChange={setColumns} />
          <Control label="Minimum shape" value={minScale} display={`${Math.round(minScale * 100)}%`} min={0} max={1} step={0.01} onChange={setMinScale} />
          <Control label="Maximum shape" value={maxScale} display={`${Math.round(maxScale * 100)}%`} min={0.05} max={1} step={0.01} onChange={setMaxScale} />
          <Control label="Contrast" value={contrast} display={contrast.toFixed(2)} min={0.2} max={3} step={0.05} onChange={setContrast} />
          <Control label="Tone shift" value={threshold} display={threshold.toFixed(2)} min={-0.5} max={0.5} step={0.01} onChange={setThreshold} />
          <Control label="Rotation" value={rotation} display={`${rotation}°`} min={-180} max={180} step={1} onChange={setRotation} />

          <div className="subsection-title"><span>Source composition</span><button type="button" onClick={resetComposition}>Reset</button></div>
          <Control label="Source zoom" value={sourceZoom} display={`${Math.round(sourceZoom * 100)}%`} min={1} max={3} step={0.01} onChange={setSourceZoom} />
          <Control label="Move horizontal" value={sourceOffsetX} display={sourceOffsetX.toFixed(2)} min={-1} max={1} step={0.01} onChange={setSourceOffsetX} />
          <Control label="Move vertical" value={sourceOffsetY} display={sourceOffsetY.toFixed(2)} min={-1} max={1} step={0.01} onChange={setSourceOffsetY} />
          <p className="orientation-note">At 0°, every uploaded shape keeps its original orientation. There is no automatic rotation.</p>

          <div className="subsection-title levels-heading">
            <span>Levels</span>
            <span><button type="button" onClick={autoLevels}>Auto</button><button type="button" onClick={resetLevels}>Reset</button></span>
          </div>
          <div className="histogram-wrap">
            <canvas ref={histogramRef} aria-label="Source grayscale histogram" />
            <span className="histogram-black" style={{ left: `${(inputBlack / 255) * 100}%` }} />
            <span className="histogram-white" style={{ left: `${(inputWhite / 255) * 100}%` }} />
          </div>
          <p className="levels-note">Set the source black and white points, then tune midtones. The histogram reveals brightness even when color is distracting.</p>
          <Control label="Input black" value={inputBlack} display={`${inputBlack}`} min={0} max={254} step={1} onChange={(value) => setInputBlack(Math.min(value, inputWhite - 1))} />
          <Control label="Midtones" value={gamma} display={gamma.toFixed(2)} min={0.1} max={3} step={0.01} onChange={setGamma} />
          <Control label="Input white" value={inputWhite} display={`${inputWhite}`} min={1} max={255} step={1} onChange={(value) => setInputWhite(Math.max(value, inputBlack + 1))} />
          <div className="levels-output-grid">
            <Control label="Output black" value={outputBlack} display={`${outputBlack}`} min={0} max={254} step={1} onChange={(value) => setOutputBlack(Math.min(value, outputWhite - 1))} />
            <Control label="Output white" value={outputWhite} display={`${outputWhite}`} min={1} max={255} step={1} onChange={(value) => setOutputWhite(Math.max(value, outputBlack + 1))} />
          </div>

          <div className="field-grid">
            <label><span>Shape mapping</span><select value={mapping} onChange={(event) => setMapping(event.target.value as MappingMode)}><option value="tone">By tone</option><option value="sequence">Sequence</option><option value="random">Stable random</option></select></label>
            <label><span>Source fit</span><select value={fit} onChange={(event) => setFit(event.target.value as FitMode)}><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
          </div>

          <div className="toggle-grid">
            <Toggle label="Invert tones" checked={inverted} onChange={setInverted} />
            <Toggle label="Transparent BG" checked={transparent} onChange={setTransparent} />
          </div>

          <label className="background-field"><span>Background</span><span><input type="color" value={background} onChange={(event) => setBackground(event.target.value)} /><code>{background.toUpperCase()}</code></span></label>

          <div className="section-rule" />
          <div className="panel-heading compact">
            <span className="step">04</span>
            <div><h2>Export</h2><p>Production-ready files</p></div>
          </div>

          <label className="export-select"><span>Image long edge</span><select value={exportSize} onChange={(event) => setExportSize(Number(event.target.value))}><option value="2048">2,048 px</option><option value="4096">4,096 px</option><option value="6000">6,000 px</option></select></label>
          <div className="still-export-actions">
            <button type="button" className="primary-button" onClick={exportImage} disabled={!shapes.length}>Export PNG <span>{imageDimensions.width} × {imageDimensions.height}</span></button>
            {mediaKind === "image" && <button type="button" className="svg-button" onClick={exportSvg} disabled={!shapes.length}>Export Web SVG <span>Browser optimized</span></button>}
            {mediaKind === "image" && <button type="button" className="svg-button illustrator-button" onClick={exportIllustratorSvg} disabled={!shapes.length}>Illustrator SVG <span>Compact vector symbols</span></button>}
          </div>
          {mediaKind === "image" && <p className="vector-note">For fully vector artwork, upload SVG shapes. In Illustrator choose Select All → Object → Expand to edit individual instances.</p>}

          <div className="setup-actions">
            <button type="button" onClick={saveSetup} disabled={!shapes.length}>Save setup</button>
            <label>Load setup<input type="file" accept="application/json,.json" onChange={loadSetup} /></label>
          </div>
          <p className="setup-note">Setup files include brand shapes, colors and controls, but never your source photo or video.</p>

          {mediaKind === "video" && (
            <div className="video-export-block">
              <label className="export-select"><span>Video long edge</span><select value={videoSize} onChange={(event) => setVideoSize(Number(event.target.value))}><option value="1080">1,080 px</option><option value="1920">1,920 px</option><option value="2560">2,560 px</option></select></label>
              <button type="button" className="secondary-button" onClick={exportVideo} disabled={isExportingVideo || !shapes.length}>{isExportingVideo ? `Exporting ${Math.round(exportProgress * 100)}%` : "Export MP4 video"}</button>
              {isExportingVideo && <progress max="1" value={exportProgress} />}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function Control({ label, value, display, min, max, step, onChange }: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span><b>{label}</b><output>{display}</output></span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>
  );
}
