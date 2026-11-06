const sharp = require('d:/EV App/backend/node_modules/sharp');

const svg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#021B14"/>
      <stop offset="50%" stop-color="#043425"/>
      <stop offset="100%" stop-color="#021B14"/>
    </linearGradient>
    <linearGradient id="emblemGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
  </defs>

  <!-- Dark Background -->
  <rect width="1024" height="1024" fill="url(#bg)"/>

  <!-- Radar Energy Rings -->
  <circle cx="512" cy="460" r="260" fill="none" stroke="#34D399" stroke-width="3" opacity="0.25"/>
  <circle cx="512" cy="460" r="200" fill="none" stroke="#10B981" stroke-width="4" opacity="0.45"/>

  <!-- Central Rounded Emblem -->
  <rect x="372" y="320" width="280" height="280" rx="72" fill="url(#emblemGrad)"/>

  <!-- Electric Car Silhouette -->
  <path d="M440 430 Q470 380 512 380 Q554 380 584 430 L620 440 Q630 442 630 455 L630 490 Q630 500 620 500 L404 500 Q394 500 394 490 L394 455 Q394 442 404 440 Z" fill="#FFFFFF"/>
  <circle cx="436" cy="510" r="26" fill="#022C22" stroke="#FFFFFF" stroke-width="6"/>
  <circle cx="588" cy="510" r="26" fill="#022C22" stroke="#FFFFFF" stroke-width="6"/>

  <!-- Gold Lightning Bolt Badge -->
  <circle cx="630" cy="580" r="42" fill="#022C22" stroke="#F59E0B" stroke-width="5"/>
  <polygon points="634,545 614,582 630,582 622,615 648,574 632,574" fill="#F59E0B"/>

  <!-- Sleek Brand Typography -->
  <text x="512" y="720" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="64" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="8">EV RESCUE</text>
  <text x="512" y="775" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="24" font-weight="700" fill="#34D399" text-anchor="middle" letter-spacing="4">RAPID CHARGING NETWORK</text>
</svg>
`;

sharp(Buffer.from(svg))
  .png()
  .toFile('d:/EV App/mobile/assets/splash-icon.png')
  .then(() => {
    console.log('Successfully updated splash-icon.png with premium branding!');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

