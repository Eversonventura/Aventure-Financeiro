import sharp from "sharp";
const svg = (s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><rect width="100%" height="100%" fill="#0b0b10"/><text x="50%" y="58%" font-family="sans-serif" font-size="${s*0.5}" font-weight="700" fill="#e5197d" text-anchor="middle" dominant-baseline="middle">CA</text></svg>`);
for (const s of [192, 512]) await sharp(svg(s)).png().toFile(`public/icons/icon-${s}.png`);
