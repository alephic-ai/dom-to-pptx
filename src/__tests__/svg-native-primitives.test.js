import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportHtmlToPptx } from '../node-exporter.js';

describe('native SVG primitive export', () => {
  let zip;

  beforeAll(async () => {
    const html = `
      <!doctype html>
      <html>
      <head>
        <style>
          body { margin: 0; }
          .slide { position: relative; width: 400px; height: 225px; }
          svg { position: absolute; left: 0; top: 0; width: 100px; height: 100px; }
          .slide:nth-of-type(3) svg { width: 200px; height: 100px; }
        </style>
      </head>
      <body>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="10" width="40" height="24" fill="#c26d4f" stroke="#222222" stroke-width="2" />
            <circle cx="65" cy="25" r="12" fill="#356f8e" />
            <line x1="8" y1="60" x2="82" y2="60" stroke="#232323" stroke-width="3" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M 10 10 Q 50 20 90 50 L 10 90 Z" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="180" height="80" fill="#c26d4f" stroke="#222222" stroke-width="2%" />
          </svg>
        </div>
      </body>
      </html>
    `;
    const buffer = await exportHtmlToPptx(html, {
      selector: '.slide',
      pptxOptions: {
        height: 7.5,
        svgAsVector: true,
        width: 13.333333,
      },
    });

    zip = await JSZip.loadAsync(buffer);
  }, 60000);

  it('lowers supported rect, circle, and line elements without adding a picture', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'text/xml');
    const shapes = [...xml.getElementsByTagName('p:sp')].filter(
      (shape) => shape.getElementsByTagName('p:txBody').length === 0
    );

    expect(shapes).toHaveLength(3);
    expect(shapes.map((shape) => shape.getElementsByTagName('a:prstGeom')[0]?.getAttribute('prst'))).toEqual([
      'rect',
      'ellipse',
      'line',
    ]);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('keeps an unsupported path-only SVG as one vector picture', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide2.xml').async('string'), 'text/xml');

    expect(xml.getElementsByTagName('p:sp')).toHaveLength(0);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(1);
  });

  it('keeps percentage-width strokes in the SVG picture fallback', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide3.xml').async('string'), 'text/xml');

    expect(xml.getElementsByTagName('p:sp')).toHaveLength(0);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(1);
  });
});
