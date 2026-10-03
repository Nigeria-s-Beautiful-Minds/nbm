// Turns the founder's brand PNGs in images/ into web-ready files in public/brand/.
//   node scripts/prepare-brand.mjs
import sharp from "sharp";

const SRC = "images";
const OUT = "public/brand";

/** Makes the white background transparent, fading anti-aliased edges instead of cutting them. */
async function whiteToTransparent(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lightest = Math.min(data[i], data[i + 1], data[i + 2]);
    if (lightest >= 245) data[i + 3] = 0;
    else if (lightest > 215) data[i + 3] = Math.round(((245 - lightest) / 30) * data[i + 3]);
  }
  return sharp(data, { raw: info });
}

const logo = await whiteToTransparent(`${SRC}/NBM_logo.png`);
const logoPng = await logo.png().toBuffer();

// Full lockup (emblem, NBM, name, tagline) for the sign-in and join pages.
await sharp(logoPng).trim().resize({ width: 520 }).png({ compressionLevel: 9 }).toFile(`${OUT}/nbm-logo.png`);

// The circular emblem alone, for the header and the browser tab.
// sharp trims before it extracts within one pipeline, so cut first and trim in a second pass.
// The box is the emblem's measured position in the 1254px source (ink rows 100-741, columns 297-955).
const emblemCut = await sharp(logoPng).extract({ left: 287, top: 90, width: 678, height: 662 }).png().toBuffer();
const emblem = await sharp(emblemCut).trim().toBuffer();
await sharp(emblem).resize({ height: 96 }).png({ compressionLevel: 9 }).toFile(`${OUT}/nbm-emblem.png`);
await sharp(emblem).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile("app/icon.png");

// Network map watermark used behind white page areas.
await sharp(`${SRC}/Nigeria_Network_Map_Icon.png`).resize({ width: 900 }).png({ compressionLevel: 9, palette: true }).toFile(`${OUT}/nigeria-network-map.png`);

console.log("Brand files written to public/brand and app/icon.png");
