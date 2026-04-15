const loadImage = (src: string): Promise<HTMLImageElement> => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const getEffectiveOpacity = (red: number, green: number, blue: number, alpha: number): number => {
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return (luminance * alpha) / 255;
};

const computeCentroid = (
  data: Uint8ClampedArray,
  width: number,
  height: number
): { x: number; y: number; r: number; totalWeight: number } => {
  // 1. Check if grayscale
  let isGrayscale = true;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (width * y + x) * 4;
      if (data[offset] !== data[offset + 1] || data[offset + 1] !== data[offset + 2]) {
        isGrayscale = false;
        break outer;
      }
    }
  }

  // Inline helper for raw performance
  const getWeight = (offset: number) => {
    return isGrayscale
      ? data[offset + 3]
      : getEffectiveOpacity(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
  };

  // 2. PASS 1: Calculate Center of Mass
  let sumX = 0,
    sumY = 0,
    totalWeight = 0;
  let offset = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const weight = getWeight(offset);
      if (weight > 0) {
        sumX += x * weight;
        sumY += y * weight;
        totalWeight += weight;
      }
      offset += 4;
    }
  }

  if (totalWeight === 0) return { x: 0, y: 0, r: 0, totalWeight: 0 };

  const cx = sumX / totalWeight;
  const cy = sumY / totalWeight;

  // Find the maximum possible distance to any of the 4 corners of the image
  const maxDist = Math.ceil(
    Math.max(
      Math.sqrt(cx * cx + cy * cy),
      Math.sqrt((width - cx) ** 2 + cy * cy),
      Math.sqrt(cx * cx + (height - cy) ** 2),
      Math.sqrt((width - cx) ** 2 + (height - cy) ** 2)
    )
  );

  const distanceBins = new Float64Array(maxDist + 1);

  // 3. PASS 2: Distance Histogram
  offset = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const weight = getWeight(offset);
      if (weight > 0) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const penalty = Math.sqrt(1 - Math.pow(dist / maxDist, 3));

        distanceBins[Math.ceil(dist)] += weight * penalty;
      }
      offset += 4;
    }
  }

  // 4. Find the exact circular radius for the percentile
  const percentile = 0.95;
  const targetWeight = distanceBins.reduce((sum, w) => sum + w, 0) * percentile;
  let cumulativeWeight = 0;
  let r: number;

  // Accumulate buckets starting from the center (r = 0) outwards
  for (r = 0; r < distanceBins.length; r++) {
    cumulativeWeight += distanceBins[r];
    if (cumulativeWeight >= targetWeight) {
      break;
    }
  }

  console.log(
    `Centroid at (${cx.toFixed(2)}, ${cy.toFixed(2)}), circular radius for ${percentile * 100}% weight: ${r}px`
  );

  return { x: cx, y: cy, r, totalWeight };
};

/**
 * Shift an image so its alpha-weighted centroid sits at the geometric center.
 * Returns a canvas with the recentered content (square, sized to fit).
 */
const recenterImage = (img: HTMLImageElement): { canvas: OffscreenCanvas; scale: number } => {
  // Draw to a temporary canvas to read pixel data
  const tmp = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
  const tmpCtx = tmp.getContext('2d')!;
  tmpCtx.drawImage(img, 0, 0);
  const { data } = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);

  // Compute alpha-weighted centroid
  const {
    x: centroidX,
    y: centroidY,
    r: innerRadius,
    totalWeight
  } = computeCentroid(data, tmp.width, tmp.height);
  const scale = innerRadius > 0 ? Math.min(tmp.width, tmp.height) / (innerRadius * 2) : 1;

  if (totalWeight === 0) return { canvas: tmp, scale };

  const imgCx = tmp.width / 2;
  const imgCy = tmp.height / 2;
  const dx = imgCx - centroidX;
  const dy = imgCy - centroidY;

  // If offset is negligible, skip
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return { canvas: tmp, scale };

  // Create a new canvas large enough to hold the shifted image
  const newW = Math.ceil(tmp.width + Math.abs(dx) * 2);
  const newH = Math.ceil(tmp.height + Math.abs(dy) * 2);
  const canvas = new OffscreenCanvas(newW, newH);
  const ctx = canvas.getContext('2d')!;
  // Draw the original image shifted so centroid lands at new canvas center
  const drawX = newW / 2 - centroidX;
  const drawY = newH / 2 - centroidY;
  ctx.drawImage(img, drawX, drawY);
  return { canvas, scale };
};

/**
 * Recenter an SVG so its visual centroid sits at the geometric center,
 * and produce a square viewBox for uniform sizing.
 */
export const recenterSvg = async (raw: string): Promise<{ svg: string; scale: number }> => {
  const vbMatch = raw.match(/viewBox="([^"]+)"/);
  if (!vbMatch) return { svg: raw, scale: 1 };
  const [vbMinX, vbMinY, vbWidth, vbHeight] = vbMatch[1].split(/\s+/).map(Number);

  // Rasterize at a reasonable resolution for centroid computation
  const targetSize = 256;
  const scale = targetSize / Math.max(vbWidth, vbHeight);
  const renderW = Math.round(vbWidth * scale);
  const renderH = Math.round(vbHeight * scale);
  const renderSvg = raw.replace('<svg', `<svg width="${renderW}" height="${renderH}"`);

  const blob = new Blob([renderSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const {
      x: centroidPxX,
      y: centroidPxY,
      r: innerRadius,
      totalWeight
    } = computeCentroid(data, canvas.width, canvas.height);
    const scale = innerRadius > 0 ? Math.min(canvas.width, canvas.height) / (innerRadius * 2) : 1;

    if (totalWeight === 0) return { svg: raw, scale };

    // Convert centroid to viewBox coordinates
    const centroidVbX = vbMinX + (centroidPxX / canvas.width) * vbWidth;
    const centroidVbY = vbMinY + (centroidPxY / canvas.height) * vbHeight;

    // Square viewBox centered on centroid, large enough to contain all content
    const halfSide = Math.max(
      centroidVbX - vbMinX,
      vbMinX + vbWidth - centroidVbX,
      centroidVbY - vbMinY,
      vbMinY + vbHeight - centroidVbY
    );

    const newViewBox = `${centroidVbX - halfSide} ${centroidVbY - halfSide} ${halfSide * 2} ${halfSide * 2}`;
    return { svg: raw.replace(vbMatch[0], `viewBox="${newViewBox}"`), scale };
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const tintSvg = (
  raw: string,
  color: [number, number, number],
  alpha: number = 1
): Uint8Array => {
  const hex = '#' + color.map((c) => c.toString(16).padStart(2, '0')).join('');
  // Use CSS !important to override any embedded fill styles (e.g. .cls-1 { fill: #fff })
  const fillCss = `* { fill: ${hex} !important; }`;
  let tinted = raw.includes('</style>')
    ? raw.replace('</style>', `${fillCss}</style>`)
    : raw.replace('<svg', `<svg style="fill: ${hex}"`);
  // Set opacity as an SVG attribute on the root (not CSS *) to avoid compounding on nested elements
  if (alpha < 1) {
    tinted = tinted.replace('<svg', `<svg opacity="${alpha}"`);
  }
  return new TextEncoder().encode(tinted);
};

export const tintImage = async (
  src: string,
  color: [number, number, number],
  alpha: number = 1,
  doRecenter: boolean = false
): Promise<{ image: Uint8Array; scale: number }> => {
  const img = await loadImage(src);
  let canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D;
  let scale = 1;
  if (doRecenter) {
    const { canvas: recenteredCanvas, scale: recenterScale } = recenterImage(img);
    canvas = recenteredCanvas;
    scale = recenterScale;
    ctx = canvas.getContext('2d')!;
  } else {
    canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = Math.round(
      getEffectiveOpacity(data[i], data[i + 1], data[i + 2], data[i + 3]) * alpha
    );
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
  }

  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { image: new Uint8Array(await blob.arrayBuffer()), scale };
};
