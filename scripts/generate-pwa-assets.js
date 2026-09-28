const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '../frontend/public/favicon.svg');
const OUTPUT_DIR = path.join(__dirname, '../frontend/public/icons');

const sizes = [192, 512, 180, 152, 144, 128, 96, 72, 48];

async function generateIcons() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);

  for (const size of sizes) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
    
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`✅ Generated icon-${size}.png`);
  }

  // Generate maskable icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(OUTPUT_DIR, 'icon-maskable-512.png'));
  
  console.log('✅ Generated icon-maskable-512.png');

  // Generate apple-touch-icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(OUTPUT_DIR, 'apple-touch-icon.png'));
  
  console.log('✅ Generated apple-touch-icon.png');
}

generateIcons().catch(console.error);