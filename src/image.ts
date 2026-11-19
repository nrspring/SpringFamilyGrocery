// Phone cameras produce 5-15 MB photos. Crop to a centered square and shrink
// in the browser so headshots upload quickly and load instantly.

const HEADSHOT_SIZE = 384;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo. Try another one?"));
    };
    img.src = url;
  });
}

export async function prepareHeadshot(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

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
