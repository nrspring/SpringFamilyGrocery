// Phone cameras produce 5-15 MB photos. The cropper hands us a square region
// of the original; shrink it to a small JPEG in the browser so headshots
// upload quickly and load instantly.

const HEADSHOT_SIZE = 384;

/**
 * Crops a `side` x `side` square (in the image's natural pixels) starting at
 * (sx, sy) and scales it to a headshot-sized JPEG.
 */
export function cropToHeadshot(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  side: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = HEADSHOT_SIZE;
  canvas.height = HEADSHOT_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, HEADSHOT_SIZE, HEADSHOT_SIZE);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo"))),
      "image/jpeg",
      0.85,
    ),
  );
}
