import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportHtmlToPptx } from '../node-exporter.js';

describe('native SVG path export', () => {
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
          .mark-fill { fill: #c26d4f; }
        </style>
      </head>
      <body>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs></defs>
            <g>
              <path class="mark-fill" d="M 10 30 C 20 0 40 0 50 30 S 80 60 90 30 Z m 10 0 c 5 10 15 10 20 0 z" />
            </g>
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M 10 10 Q 50 20 90 90 Z" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M .09 90 C -.25 90.8 .37 90.8 1.28 91 L 5 95 Z" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M98,10 C101,10 99,20 98,20 L98,10 Z" fill="#c26d4f" />
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

  it('lowers cubic and smooth compound paths to native custom geometry', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'text/xml');
    const shapes = [...xml.getElementsByTagName('p:sp')].filter(
      (shape) => shape.getElementsByTagName('p:txBody').length === 0
    );

    expect(shapes).toHaveLength(1);
    expect(shapes[0].getElementsByTagName('a:custGeom')).toHaveLength(1);
    expect(shapes[0].getElementsByTagName('a:cubicBezTo')).toHaveLength(3);
    expect(shapes[0].getElementsByTagName('a:moveTo')).toHaveLength(2);
    expect(shapes[0].getElementsByTagName('a:close')).toHaveLength(2);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('keeps a path with an unsupported quadratic command as one vector picture', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide2.xml').async('string'), 'text/xml');

    expect(xml.getElementsByTagName('p:sp')).toHaveLength(0);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(1);
  });

  it('accepts cubic control points outside the viewBox when the curve only overshoots within rounding tolerance', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide3.xml').async('string'), 'text/xml');
    const shape = xml.getElementsByTagName('p:sp')[0];

    expect(shape).toBeTruthy();
    expect(shape.getElementsByTagName('a:custGeom')).toHaveLength(1);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('accepts an outside control point when the actual cubic curve stays within the viewBox', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide4.xml').async('string'), 'text/xml');
    const shape = xml.getElementsByTagName('p:sp')[0];

    expect(shape).toBeTruthy();
    expect(shape.getElementsByTagName('a:custGeom')).toHaveLength(1);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });
});
