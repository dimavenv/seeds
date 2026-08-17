// Картинка предпросмотра ссылки (Open Graph): public/og-image.jpg.
//
//   npm run img:og
//
// Её показывают Telegram, VK, WhatsApp и поисковики, когда кто-то делится
// ссылкой на магазин. Без неё в чате появляется голый текстовый прямоугольник,
// и ссылка выглядит подозрительно — по такой не переходят.
//
// Почему статический файл, а не генерация на лету (next/og): рисовать картинку
// на каждый запрос на одном VPS незачем — логотип и подпись меняются раз в
// год. Пересоберите этот файл, если поменяли логотип или название.
//
// Размер 1200×630 — то, что ждут все перечисленные сервисы; при других
// пропорциях они обрежут картинку по своему усмотрению.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 1200;
const H = 630;

// Цвета из app/globals.css (светлая тема).
const BG_TOP = "#f1f8ee"; // brand-50
const BG_BOTTOM = "#e3f0dc";
const GREEN = "#30591f"; // brand-700
const GREEN_MID = "#3c7424"; // brand-600
const ORANGE = "#f5731f"; // accent-500

const TITLE = "Семена томатов и овощей почтой по России";
const SUBTITLE = "Коллекционные сорта · tomatsemena.ru";

const LOGO_WIDTH = 420;
const logo = await sharp(path.join(root, "public", "logo.webp"))
  .resize({ width: LOGO_WIDTH, withoutEnlargement: true })
  .png()
  .toBuffer();
const logoMeta = await sharp(logo).metadata();

const logoTop = 34;
const logoBottom = logoTop + (logoMeta.height ?? 0);
// Текст ставим ОТ НИЗА ЛОГОТИПА, а не от края картинки: иначе при замене
// логотипа на другой по высоте строки наедут на него.
const titleBaseline = logoBottom + 60;
const subtitleBaseline = titleBaseline + 52;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="100%" stop-color="${BG_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="${W / 2}" y="${titleBaseline}" text-anchor="middle"
        font-family="DejaVu Sans" font-size="40" font-weight="bold" fill="${GREEN}">
    ${esc(TITLE)}
  </text>
  <text x="${W / 2}" y="${subtitleBaseline}" text-anchor="middle"
        font-family="DejaVu Sans" font-size="28" fill="${GREEN_MID}">
    ${esc(SUBTITLE)}
  </text>
  <rect x="0" y="${H - 12}" width="${W}" height="12" fill="${GREEN_MID}"/>
  <rect x="0" y="${H - 12}" width="${Math.round(W / 3)}" height="12" fill="${ORANGE}"/>
</svg>`;

const out = path.join(root, "public", "og-image.jpg");
await sharp({ create: { width: W, height: H, channels: 4, background: BG_TOP } })
  .composite([
    { input: Buffer.from(svg), top: 0, left: 0 },
    {
      input: logo,
      top: logoTop,
      left: Math.round((W - (logoMeta.width ?? LOGO_WIDTH)) / 2),
    },
  ])
  // JPEG, а не WebP: часть мессенджеров до сих пор не показывает WebP в
  // предпросмотре. Без цветовой субдискретизации — мелкий текст иначе мылится.
  .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
  .toFile(out);

const size = Math.round(fs.statSync(out).size / 1024);
console.log(`Готово: public/og-image.jpg — ${W}×${H}, ${size} КБ`);
