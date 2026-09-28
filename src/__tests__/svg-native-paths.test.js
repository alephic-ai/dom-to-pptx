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
          .slide:nth-of-type(5) svg { width: 172px; height: 28px; }
          .scaled-ancestor { position: relative; transform: scale(0.125); transform-origin: top left; }
          .rotated-ancestor { position: relative; transform: rotate(5deg); transform-origin: top left; }
          #hidden-group { visibility: hidden; }
          .force-visible { visibility: visible; }
          .collapse-path { visibility: collapse; }
          svg rect:first-child { visibility: collapse; }
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
        <div class="slide">
          <div class="scaled-ancestor">
          <svg id="alephic-svg-image-0-id-0" data-name="Layer 2" data-alephic-slide-element="brand-dark" data-alephic-svg-image-vectorized="" aria-label="Alephic" role="img" viewBox="0 0 760 116.42" preserveAspectRatio="xMinYMid meet" xmlns="http://www.w3.org/2000/svg" style="box-sizing: border-box; clip-path: none; display: block; height: 28px; inset: 58px 1664px 994px 84px; left: 0px; margin: 0px; opacity: 1; padding: 0px; position: absolute; top: 0px; transform: none; transform-box: view-box; transform-origin: 86px 14px; vertical-align: baseline; width: 172px; z-index: auto; fill: rgb(0, 0, 0); stroke-width: 1px;">
            <defs style="">
              <style style="">
                .alephic-svg-image-0-cls-1 { fill: #231f20; stroke-width: 0px; }
              </style>
            </defs>
            <g id="alephic-svg-image-0-id-1">
              <g>
                <path class="alephic-svg-image-0-cls-1" d="M30.44,2.51h27.3l30.44,111.4h-22.44l-6.12-23.69h-31.07l-6.12,23.69H0L30.44,2.51ZM33.57,70.76h21.02l-10.51-41.26-10.51,41.26Z" style="" />
                <path class="alephic-svg-image-0-cls-1" d="M120.03,2.51h22.28v91.32h48.64v20.08h-70.91V2.51Z" />
                <path class="alephic-svg-image-0-cls-1" d="M226.71,2.51h69.66v20.08h-47.39v25.58h45.5v19.77h-45.5v25.89h48.64v20.08h-70.92V2.51Z" />
                <path class="alephic-svg-image-0-cls-1" d="M340.3,2.51h35.93c23.07,0,39.07,14.28,39.07,35.77s-16,35.77-39.07,35.77h-13.65v39.85h-22.28V2.51ZM373.88,53.82c12.4,0,18.52-5.33,18.52-15.53s-6.12-15.69-18.52-15.69h-11.29v31.22h11.29Z" />
                <path class="alephic-svg-image-0-cls-1" d="M450.13,2.51h22.28v45.35h34.52V2.51h22.28v111.4h-22.28v-45.97h-34.52v45.97h-22.28V2.51Z" />
                <path class="alephic-svg-image-0-cls-1" d="M571.88,93.83h24.32V22.59h-24.32V2.51h70.92v20.08h-24.32v71.23h24.32v20.08h-70.92v-20.08Z" />
                <path class="alephic-svg-image-0-cls-1" d="M676.69,58.37c0-36.09,15.53-58.37,42.67-58.37,21.65,0,36.4,14.91,40.32,41.26l-22.9,1.1c-2.2-14.59-8.79-22.59-17.42-22.59-12.71,0-19.77,13.81-19.77,38.6s7.06,38.28,19.77,38.28c8.94,0,15.69-8.47,17.89-24.16l22.75,1.1c-3.61,27.14-18.36,42.83-40.64,42.83-27.14,0-42.67-22.12-42.67-58.05Z" />
              </g>
            </g>
          </svg>
          </div>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(1)">
            <path d="M 10 10 L 90 10 L 90 90 Z" fill="#c26d4f" />
            </g>
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="paint"><stop stop-color="#c26d4f" /></linearGradient></defs>
            <path d="M 10 10 L 90 10 L 90 90 Z" fill="url(#paint)" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs><style>.mark-fill:hover { fill: #c26d4f; }</style></defs>
            <path class="mark-fill" d="M 10 10 L 90 10 L 90 90 Z" />
          </svg>
        </div>
        <div class="slide">
          <div class="rotated-ancestor">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <path d="M 10 10 L 90 10 L 90 90 Z" fill="#c26d4f" />
            </svg>
          </div>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs style="fill: #ff0000">
              <style>.mark-fill { fill: #c26d4f; }</style>
            </defs>
            <path class="mark-fill" d="M 10 10 L 90 10 L 90 90 Z" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <g id="hidden-group">
              <path class="force-visible" d="M 10 10 L 30 10 L 30 30 Z" fill="#c26d4f" />
            </g>
            <path d="M 50 50 L 70 50 L 70 70 Z" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path class="collapse-path" d="M 10 10 L 30 10 L 30 30 Z" fill="#c26d4f" />
            <path d="M 50 50 L 70 50 L 70 70 Z" fill="#c26d4f" />
          </svg>
        </div>
        <div class="slide">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="20" height="20" fill="#c26d4f" />
            <rect x="50" y="50" width="20" height="20" fill="#c26d4f" />
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

  it('lowers class-styled paths inside metadata groups to native shapes', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide5.xml').async('string'), 'text/xml');
    const shapes = [...xml.getElementsByTagName('p:sp')];

    expect(shapes).toHaveLength(7);
    for (const shape of shapes) {
      expect(shape.getElementsByTagName('a:custGeom')).toHaveLength(1);
      expect(shape.getElementsByTagName('a:srgbClr')[0]?.getAttribute('val')).toBe('231F20');
    }
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('keeps unsupported SVG transforms, paint servers, and styles on the image fallback', async () => {
    for (const slideNumber of [6, 7, 8, 9, 10]) {
      const xml = new DOMParser().parseFromString(
        await zip.file(`ppt/slides/slide${slideNumber}.xml`).async('string'),
        'text/xml'
      );
      expect(xml.getElementsByTagName('p:sp')).toHaveLength(0);
      expect(xml.getElementsByTagName('p:pic')).toHaveLength(1);
    }
  });

  it('does not drop visible paths that override a hidden group', async () => {
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide11.xml').async('string'), 'text/xml');
    const shapes = [...xml.getElementsByTagName('p:sp')];

    expect(shapes).toHaveLength(2);
    expect(shapes.every((shape) => shape.getElementsByTagName('a:custGeom').length === 1)).toBe(true);
    expect(xml.getElementsByTagName('p:pic')).toHaveLength(0);
  });

  it('does not lower SVG elements whose visibility is collapsed', async () => {
    const pathXml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide12.xml').async('string'), 'text/xml');
    const pathShapes = [...pathXml.getElementsByTagName('p:sp')];
    expect(pathShapes).toHaveLength(1);
    expect(pathShapes[0].getElementsByTagName('a:custGeom')).toHaveLength(1);
    expect(pathXml.getElementsByTagName('p:pic')).toHaveLength(0);

    const primitiveXml = new DOMParser().parseFromString(
      await zip.file('ppt/slides/slide13.xml').async('string'),
      'text/xml'
    );
    const primitiveShapes = [...primitiveXml.getElementsByTagName('p:sp')];
    expect(primitiveShapes).toHaveLength(1);
    expect(primitiveShapes[0].getElementsByTagName('a:prstGeom')[0]?.getAttribute('prst')).toBe('rect');
    expect(primitiveXml.getElementsByTagName('p:pic')).toHaveLength(0);
  });
});
