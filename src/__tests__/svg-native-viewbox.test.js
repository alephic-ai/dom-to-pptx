import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportHtmlToPptx } from '../node-exporter.js';

const EMU_PER_INCH = 914400;
const SLIDE_WIDTH_IN = 13.333333;
const SLIDE_WIDTH_PX = 400;

function slideXml(zip, slideNumber) {
  return zip.file(`ppt/slides/slide${slideNumber}.xml`).async('string');
}

function shapeTransform(shape) {
  const xfrm = shape.getElementsByTagName('a:xfrm')[0];
  const off = xfrm.getElementsByTagName('a:off')[0];
  const ext = xfrm.getElementsByTagName('a:ext')[0];
  return {
    x: Number(off.getAttribute('x')),
    y: Number(off.getAttribute('y')),
    cx: Number(ext.getAttribute('cx')),
    cy: Number(ext.getAttribute('cy')),
  };
}

function firstPathPoint(shape, commandTag = 'a:moveTo') {
  const command = shape.getElementsByTagName(commandTag)[0];
  const point = command.getElementsByTagName('a:pt')[0];
  return { x: Number(point.getAttribute('x')), y: Number(point.getAttribute('y')) };
}

function emuFromPx(px) {
  return Math.round((px / SLIDE_WIDTH_PX) * SLIDE_WIDTH_IN * EMU_PER_INCH);
}

describe('SVG viewBox mapping for native PowerPoint shapes', () => {
  let zip;

  beforeAll(async () => {
    const html = `
      <!doctype html>
      <html>
      <head>
        <style>
          body { margin: 0; }
          .slide { position: relative; width: 400px; height: 225px; }
          svg { position: absolute; left: 0; top: 0; }
          .slide:nth-of-type(1) svg,
          .slide:nth-of-type(2) svg,
          .slide:nth-of-type(4) svg,
          .slide:nth-of-type(5) svg,
          .slide:nth-of-type(6) svg,
          .slide:nth-of-type(7) svg,
          .slide:nth-of-type(8) svg { width: 200px; height: 100px; }
          .slide:nth-of-type(3) svg { width: 100px; height: 200px; }
        </style>
      </head>
      <body>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="20" width="30" height="40" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="20" width="30" height="40" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M 10 20 L 30 20 L 30 40 Z" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 10 20 L 30 20 L 30 40 Z" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="20" width="30" height="40" fill="#c26d4f" stroke="#222222" stroke-width="2" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMinYMin meet" xmlns="http://www.w3.org/2000/svg">
            <path d="M 10 20 L 30 20 L 30 40 Z" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="20" width="30" height="40" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMinYMid meet" xmlns="http://www.w3.org/2000/svg">
            <path d="M 10 20 L 30 20 L 30 40 Z" fill="#c26d4f" />
          </svg>
        </div>
      </body>
      </html>
    `;

    const buffer = await exportHtmlToPptx(html, {
      selector: '.slide',
      pptxOptions: { height: 7.5, svgAsVector: true, width: SLIDE_WIDTH_IN },
    });
    zip = await JSZip.loadAsync(buffer);
  }, 60000);

  it('centers native primitives for xMidYMid meet when the viewport is wider than the viewBox', async () => {
    const xml = new DOMParser().parseFromString(await slideXml(zip, 1), 'text/xml');
    const shape = xml.getElementsByTagName('p:sp')[0];
    expect(shape).toBeTruthy();
    const bounds = shapeTransform(shape);

    expect(shape.getElementsByTagName('a:prstGeom')[0]?.getAttribute('prst')).toBe('rect');
    expect(bounds.x).toBeCloseTo(emuFromPx(60), -1);
    expect(bounds.y).toBeCloseTo(emuFromPx(20), -1);
    expect(bounds.cx).toBeCloseTo(emuFromPx(30), -1);
    expect(bounds.cy).toBeCloseTo(emuFromPx(40), -1);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('stretches fill-only primitives for preserveAspectRatio none', async () => {
    const xml = new DOMParser().parseFromString(await slideXml(zip, 2), 'text/xml');
    const shape = xml.getElementsByTagName('p:sp')[0];
    expect(shape).toBeTruthy();
    const bounds = shapeTransform(shape);

    expect(bounds.x).toBeCloseTo(emuFromPx(20), -1);
    expect(bounds.y).toBeCloseTo(emuFromPx(20), -1);
    expect(bounds.cx).toBeCloseTo(emuFromPx(60), -1);
    expect(bounds.cy).toBeCloseTo(emuFromPx(40), -1);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('centers custom path geometry for xMidYMid meet when the viewport is taller than the viewBox', async () => {
    const xml = new DOMParser().parseFromString(await slideXml(zip, 3), 'text/xml');
    const shape = xml.getElementsByTagName('p:sp')[0];
    expect(shape).toBeTruthy();
    const start = firstPathPoint(shape);

    expect(shape.getElementsByTagName('a:custGeom')).toHaveLength(1);
    expect(start.x).toBeCloseTo(emuFromPx(10), -1);
    expect(start.y).toBeCloseTo(emuFromPx(70), -1);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('stretches filled custom path geometry for preserveAspectRatio none', async () => {
    const xml = new DOMParser().parseFromString(await slideXml(zip, 4), 'text/xml');
    const shape = xml.getElementsByTagName('p:sp')[0];
    expect(shape).toBeTruthy();
    const start = firstPathPoint(shape);
    const firstLine = firstPathPoint(shape, 'a:lnTo');

    expect(start.x).toBeCloseTo(emuFromPx(20), -1);
    expect(start.y).toBeCloseTo(emuFromPx(20), -1);
    expect(firstLine.x).toBeCloseTo(emuFromPx(60), -1);
    expect(firstLine.y).toBeCloseTo(emuFromPx(20), -1);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('keeps stroked primitives on the image fallback for nonuniform none scaling', async () => {
    const xml = new DOMParser().parseFromString(await slideXml(zip, 5), 'text/xml');

    expect(xml.getElementsByTagName('p:sp')).toHaveLength(0);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(1);
  });

  it('keeps unsupported preserveAspectRatio alignment and slice modes on the image fallback', async () => {
    const alignedXml = new DOMParser().parseFromString(await slideXml(zip, 6), 'text/xml');
    const slicedXml = new DOMParser().parseFromString(await slideXml(zip, 7), 'text/xml');

    expect(alignedXml.getElementsByTagName('p:sp')).toHaveLength(0);
    expect(alignedXml.getElementsByTagName('p:pic')).toHaveLength(1);
    expect(slicedXml.getElementsByTagName('p:sp')).toHaveLength(0);
    expect(slicedXml.getElementsByTagName('p:pic')).toHaveLength(1);
  });

  it('left-aligns custom path geometry for xMinYMid meet', async () => {
    const xml = new DOMParser().parseFromString(await slideXml(zip, 8), 'text/xml');
    const shape = xml.getElementsByTagName('p:sp')[0];
    expect(shape).toBeTruthy();
    const start = firstPathPoint(shape);

    expect(shape.getElementsByTagName('a:custGeom')).toHaveLength(1);
    expect(start.x).toBeCloseTo(emuFromPx(10), -1);
    expect(start.y).toBeCloseTo(emuFromPx(20), -1);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });
});
