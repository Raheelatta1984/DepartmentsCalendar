import type { Entity } from '../types';

export type ThemeDraft = Pick<Entity, 'logoUrl' | 'portalHeader' | 'portalFooter' | 'brandColor' | 'backgroundColor' | 'fontFamily' | 'headingFont'>;

export const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter · crisp and modern' },
  { value: 'Arial', label: 'Arial · familiar and clear' },
  { value: 'Georgia', label: 'Georgia · editorial and warm' },
  { value: 'system', label: 'System · native to this device' },
] as const;

export function getEntityTheme(entity?: Entity | null): Required<ThemeDraft> {
  return {
    logoUrl: entity?.logoUrl ?? '',
    portalHeader: entity?.portalHeader ?? entity?.name ?? 'Department Calendar',
    portalFooter: entity?.portalFooter ?? 'Powered by Orbit · Department Calendar',
    brandColor: entity?.brandColor ?? '#3a63f0',
    backgroundColor: entity?.backgroundColor ?? '#f1f5f9',
    fontFamily: entity?.fontFamily ?? 'Inter',
    headingFont: entity?.headingFont ?? 'Inter',
  };
}

const paletteByMood: Record<string, { brand: string; background: string }> = {
  ocean: { brand: '#087e8b', background: '#eff8f8' },
  calm: { brand: '#526a8e', background: '#f3f5f8' },
  forest: { brand: '#28745b', background: '#f1f7f3' },
  green: { brand: '#28745b', background: '#f1f7f3' },
  warm: { brand: '#b65e3c', background: '#fbf4ef' },
  sunset: { brand: '#c05b46', background: '#fff5ef' },
  violet: { brand: '#7253a6', background: '#f6f3fa' },
  purple: { brand: '#7253a6', background: '#f6f3fa' },
  bold: { brand: '#2947d6', background: '#f3f5fb' },
  minimal: { brand: '#334155', background: '#f5f6f7' },
};

/** Local, prompt-guided theme concept generator. It intentionally does not send entity data to a third party. */
export function generateThemeSuggestion(entity: Entity, brief: string, logoColor?: string): ThemeDraft {
  const text = `${entity.name} ${entity.industry ?? ''} ${brief}`.toLowerCase();
  const mood = Object.keys(paletteByMood).find((key) => text.includes(key));
  const base = mood ? paletteByMood[mood] : paletteByMood.ocean;
  const seed = [...text].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const fonts: ThemeDraft['fontFamily'][] = ['Inter', 'Arial', 'Georgia', 'system'];
  const font = fonts[seed % fonts.length] ?? 'Inter';
  return {
    logoUrl: entity.logoUrl ?? '',
    portalHeader: entity.portalHeader || entity.name,
    portalFooter: entity.portalFooter || `© ${new Date().getFullYear()} ${entity.name} · All rights reserved`,
    brandColor: logoColor ?? base.brand,
    backgroundColor: base.background,
    fontFamily: font,
    headingFont: text.includes('editorial') || text.includes('classic') ? 'Georgia' : font,
  };
}

export function detectLogoColor(source: string): Promise<string | undefined> {
  if (!source) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve(undefined);
        context.drawImage(image, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const r = pixels[index] ?? 0;
          const g = pixels[index + 1] ?? 0;
          const b = pixels[index + 2] ?? 0;
          const alpha = pixels[index + 3] ?? 0;
          const brightness = (r + g + b) / 3;
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          if (alpha < 80 || brightness > 242 || brightness < 24 || saturation < 20) continue;
          red += r;
          green += g;
          blue += b;
          count += 1;
        }
        if (!count) return resolve(undefined);
        resolve(`#${[red, green, blue].map((channel) => Math.round(channel / count).toString(16).padStart(2, '0')).join('')}`);
      } catch {
        // Cross-origin hosted logos may not permit canvas sampling; fall back to the prompt palette.
        resolve(undefined);
      }
    };
    image.onerror = () => resolve(undefined);
    image.src = source;
  });
}

export function fontStack(font: ThemeDraft['fontFamily']): string {
  switch (font) {
    case 'Arial': return 'Arial, Helvetica, sans-serif';
    case 'Georgia': return 'Georgia, "Times New Roman", serif';
    case 'system': return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    default: return 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif';
  }
}
