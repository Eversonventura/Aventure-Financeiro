import sharp from "sharp";
const svg = (s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><rect width="100%" height="100%" fill="#18181b"/><text x="50%" y="58%" font-family="sans-serif" font-size="${s*0.5}" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">CA</text></svg>`);
for (const s of [192, 512]) await sharp(svg(s)).png().toFile(`public/icons/icon-${s}.png`);
