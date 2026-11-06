const sharp = require('d:/EV App/backend/node_modules/sharp');

const splashSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#021B14"/>
      <stop offset="40%" stop-color="#043425"/>
      <stop offset="70%" stop-color="#064E3B"/>
      <stop offset="100%" stop-color="#021B14"/>
    </linearGradient>
    <linearGradient id="emblemGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="#10B981" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#059669" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#021B14" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Dark Background -->
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="440" r="360" fill="url(#glow)"/>

  <!-- Radar Energy Rings -->
  <circle cx="512" cy="440" r="280" fill="none" stroke="#34D399" stroke-width="3" opacity="0.25" stroke-dasharray="12, 12"/>
  <circle cx="512" cy="440" r="210" fill="none" stroke="#10B981" stroke-width="4" opacity="0.4"/>
  <circle cx="512" cy="440" r="150" fill="none" stroke="#6EE7B7" stroke-width="2" opacity="0.5"/>

  <!-- Central Rounded Emblem -->
  <rect x="372" y="300" width="280" height="280" rx="72" fill="url(#emblemGrad)"/>

  <!-- Electric Car Silhouette -->
  <path d="M440 410 Q470 360 512 360 Q554 360 584 410 L620 420 Q630 422 630 435 L630 470 Q630 480 620 480 L404 480 Q394 480 394 470 L394 435 Q394 422 404 420 Z" fill="#FFFFFF"/>
  <circle cx="436" cy="490" r="26" fill="#022C22" stroke="#FFFFFF" stroke-width="6"/>
  <circle cx="588" cy="490" r="26" fill="#022C22" stroke="#FFFFFF" stroke-width="6"/>

  <!-- Gold Lightning Bolt Badge -->
  <circle cx="630" cy="560" r="42" fill="#022C22" stroke="#F59E0B" stroke-width="5"/>
  <polygon points="634,525 614,562 630,562 622,595 648,554 632,554" fill="#F59E0B"/>

  <!-- Brand Typography -->
  <text x="512" y="690" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="68" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="8">EV RESCUE</text>
  <text x="512" y="745" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="22" font-weight="800" fill="#34D399" text-anchor="middle" letter-spacing="5">RAPID CHARGING NETWORK</text>
</svg>
`;

const iconSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="iconBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#021B14"/>
      <stop offset="50%" stop-color="#043425"/>
      <stop offset="100%" stop-color="#021B14"/>
    </linearGradient>
    <linearGradient id="iconEmblem" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#iconBg)"/>
  <circle cx="512" cy="470" r="320" fill="none" stroke="#10B981" stroke-width="6" opacity="0.35"/>
  <rect x="282" y="240" width="460" height="460" rx="120" fill="url(#iconEmblem)"/>
  <path d="M390 420 Q440 340 512 340 Q584 340 634 420 L690 440 Q706 444 706 465 L706 520 Q706 536 690 536 L334 536 Q318 536 318 520 L318 465 Q318 444 334 440 Z" fill="#FFFFFF"/>
  <circle cx="386" cy="550" r="42" fill="#022C22" stroke="#FFFFFF" stroke-width="10"/>
  <circle cx="638" cy="550" r="42" fill="#022C22" stroke="#FFFFFF" stroke-width="10"/>
  <circle cx="700" cy="660" r="70" fill="#022C22" stroke="#F59E0B" stroke-width="8"/>
  <polygon points="706,605 674,664 700,664 688,716 730,652 704,652" fill="#F59E0B"/>
  <text x="512" y="860" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="82" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="8">EV RESCUE</text>
</svg>
`;

async function generate() {
  await sharp(Buffer.from(splashSvg)).png().toFile('d:/EV App/mobile/assets/splash-icon.png');
  await sharp(Buffer.from(iconSvg)).png().toFile('d:/EV App/mobile/assets/icon.png');
  await sharp(Buffer.from(iconSvg)).resize(512, 512).png().toFile('d:/EV App/mobile/assets/android-icon-foreground.png');
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#021B14' } }).png().toFile('d:/EV App/mobile/assets/android-icon-background.png');
  await sharp(Buffer.from(iconSvg)).resize(48, 48).png().toFile('d:/EV App/mobile/assets/favicon.png');
  console.log('Branded assets successfully generated!');
}

generate().catch(console.error);

