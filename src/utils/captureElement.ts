import html2canvas from 'html2canvas';

function compressCanvas(canvas: HTMLCanvasElement, maxDimension = 1024, quality = 0.5): string {
  const width = canvas.width;
  const height = canvas.height;
  let newWidth = width;
  let newHeight = height;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      newWidth = maxDimension;
      newHeight = Math.round((height * maxDimension) / width);
    } else {
      newHeight = maxDimension;
      newWidth = Math.round((width * maxDimension) / height);
    }
  }

  const resizedCanvas = document.createElement('canvas');
  resizedCanvas.width = newWidth;
  resizedCanvas.height = newHeight;
  const ctx = resizedCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
    return resizedCanvas.toDataURL('image/jpeg', quality);
  }
  return canvas.toDataURL('image/jpeg', quality);
}

function getComputedBackgroundColor(el: HTMLElement): string {
  let current: HTMLElement | null = el;
  while (current) {
    const bg = window.getComputedStyle(current).backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
      return bg;
    }
    current = current.parentElement;
  }
  const bodyBg = window.getComputedStyle(document.body).backgroundColor;
  if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') {
    return bodyBg;
  }
  const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
  if (htmlBg && htmlBg !== 'transparent' && htmlBg !== 'rgba(0, 0, 0, 0)') {
    return htmlBg;
  }
  return '#ffffff';
}

export async function captureElement(element: HTMLElement): Promise<string> {
  const rect = element.getBoundingClientRect();
  const width = Math.max(Math.ceil(rect.width), element.clientWidth, 1);
  const height = Math.max(Math.ceil(rect.height), element.clientHeight, 1);

  const canvas = await html2canvas(element, {
    scale: window.devicePixelRatio || 1,
    backgroundColor: getComputedBackgroundColor(element),
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    useCORS: true,
    allowTaint: false,
    imageTimeout: 8000,
    logging: false,
  });

  return compressCanvas(canvas, 1024, 0.5);
}
