import type { NativeImage } from 'electron';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

type CaptureSource = { capturePage(): Promise<Pick<NativeImage, 'isEmpty' | 'toPNG'>> };

export async function saveScreenshot(source: CaptureSource, filename: string) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    let image: Pick<NativeImage, 'isEmpty' | 'toPNG'>;
    try {
      image = await source.capturePage();
      if (image.isEmpty()) throw new Error('VizSentEmptyBitmap');
    } catch (error) {
      // A visible X11 window can still be between compositor surfaces after
      // showing or resizing. Retry capture only, never the scenario's assertions.
      const transient = error instanceof Error && ['UnknownVizError', 'VizSentEmptyBitmap'].includes(error.message);
      if (!transient || attempt === 5) throw new Error(`Screenshot failed: ${filename}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      await delay(100);
      continue;
    }
    await writeFile(filename, image.toPNG());
    return;
  }
}
