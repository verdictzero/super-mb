// Palette slots are shared by every theme; a theme only changes the colours.
export const SLOTS = [
  'none', 'ink',
  'dirtD', 'dirt', 'dirtL', 'dirtX',
  'grassL', 'grass', 'grassD',
  'rimL', 'rimD',
  'brickD', 'brick', 'brickL',
  'goldD', 'gold', 'goldL',
  'stoneD', 'stone', 'stoneL',
  'pipeD', 'pipe', 'pipeL',
  'white', 'cloudD',
  'bushD', 'bush', 'bushL',
  'woodD', 'wood', 'woodL',
  'redD', 'red',
  'gemD', 'gem', 'gemL',
  'steelD', 'steel', 'steelL',
  'hillD', 'hill',
  'heroD', 'hero', 'heroL',
  'foeD', 'foe', 'foeL',
  'yellow', 'orange',
  // parallax background
  'bgFar', 'bgFarL', 'bgMid', 'bgMidL', 'bgMidD', 'bgNear', 'bgNearD', 'bgWater', 'bgWaterL', 'bgWaterD', 'sun', 'sunL', 'bgCloud', 'bgCloudD',
  // underside of ground (ceilings) and the growths that hang from it
  'ceilL', 'ceil', 'ceilD',
  'acidD', 'acid', 'acidL', // hazardous liquid
];
export const P = Object.fromEntries(SLOTS.map((n, i) => [n, i]));

// Look: saturated, high-contrast colour pairs, glossy highlights and banded gradient skies,
// in the spirit of mid-90s 32-bit arcade platformers. Each theme pairs a patterned soil colour
// with a two-colour striped edge (grass / grassD) and a contrasting ceiling stripe (ceil / ceilL).
const base = {
  ink: '#140a2e',
  white: '#ffffff', cloudD: '#b8dcff',
  goldD: '#d85a00', gold: '#ffb400', goldL: '#fff27a',
  redD: '#a8004e', red: '#ff2a6a',
  gemD: '#0a6ae0', gem: '#2ad8ff', gemL: '#e0ffff',
  steelD: '#4a5a9a', steel: '#9ab0f0', steelL: '#f0f6ff',
  heroD: '#b8220a', hero: '#ff5a1a', heroL: '#ffd070',
  foeD: '#4a1a9a', foe: '#9a4aff', foeL: '#e0b0ff',
  yellow: '#fff03a', orange: '#ff8a1a',
  woodD: '#7a2a5a', wood: '#d0508a', woodL: '#ffa0c0',
  acidD: '#128a2a', acid: '#4cf040', acidL: '#d4ffb0',
};

export const THEMES = {
  meadow: {
    label: 'Garden', sky: ['#1a4ae0', '#3ab8ff', '#ffc8f0'],
    colors: { ...base,
      dirtX: '#4a1a8a', dirtD: '#7a2ac0', dirt: '#b050f0', dirtL: '#f0a8ff',
      grassL: '#fbffc0', grass: '#b0f828', grassD: '#10b870',
      rimL: '#ffd8ff', rimD: '#2a0a5a',
      brickD: '#c83a10', brick: '#ff7a28', brickL: '#ffd080',
      stoneD: '#5068b0', stone: '#98b0f0', stoneL: '#eef4ff',
      pipeD: '#0878c0', pipe: '#28c8f8', pipeL: '#c0faff',
      bushD: '#089868', bush: '#28e088', bushL: '#c0ffb8',
      hillD: '#10a088', hill: '#30d0a0',
      bgFar: '#7898ff', bgFarL: '#d0e0ff', bgMid: '#28d0a0', bgMidL: '#b8ffc8', bgMidD: '#0e9c88', bgNear: '#1870d0', bgNearD: '#0a4898',
      bgWater: '#3088ff', bgWaterL: '#c8f4ff', bgWaterD: '#1858e0', sun: '#fff6c2', sunL: '#ffffff', bgCloud: '#ffffff', bgCloudD: '#a8d0ff',
      ceilL: '#ffe870', ceil: '#ff9a28', ceilD: '#b84810',
    },
  },
  cavern: {
    label: 'Neon', sky: ['#04031a', '#18084a', '#5a1890'],
    colors: { ...base,
      dirtX: '#050f2c', dirtD: '#0c2860', dirt: '#1848a0', dirtL: '#38a8f8',
      grassL: '#f0ffff', grass: '#18f0e0', grassD: '#f018c0',
      rimL: '#80c8ff', rimD: '#02061a',
      brickD: '#5a189a', brick: '#a040f8', brickL: '#e4a8ff',
      stoneD: '#26386c', stone: '#5878c0', stoneL: '#b8d0ff',
      pipeD: '#a01868', pipe: '#f838a0', pipeL: '#ffb8e4',
      bushD: '#086878', bush: '#18c0c0', bushL: '#a8fff0',
      hillD: '#200a5a', hill: '#3a1a8a',
      bgFar: '#181860', bgFarL: '#4848c8', bgMid: '#3a1890', bgMidL: '#f038c0', bgMidD: '#1e0a58', bgNear: '#0a0a3c', bgNearD: '#05052a',
      bgWater: '#102a90', bgWaterL: '#18f0e0', bgWaterD: '#0a1858', sun: '#18f0e0', sunL: '#f0ffff', bgCloud: '#2a2a80', bgCloudD: '#181860',
      ceilL: '#fff03a', ceil: '#f88018', ceilD: '#782808',
      white: '#e8f0ff', cloudD: '#6878c8',
    },
  },
  factory: {
    label: 'Factory', sky: ['#0a1038', '#26349a', '#8a5cd0'],
    colors: { ...base,
      dirtX: '#182240', dirtD: '#2e3e6c', dirt: '#48609c', dirtL: '#94b4e8',
      grassL: '#fffac8', grass: '#ffd018', grassD: '#22202e',
      rimL: '#c4dcff', rimD: '#080e20',
      brickD: '#a84614', brick: '#f08228', brickL: '#ffca7c',
      stoneD: '#3e4860', stone: '#7888a8', stoneL: '#c8d4f0',
      pipeD: '#088870', pipe: '#20d0a0', pipeL: '#b4ffe4',
      bushD: '#186e78', bush: '#28b0b0', bushL: '#a4f0e0',
      hillD: '#16244a', hill: '#28407a',
      bgFar: '#1a2a6c', bgFarL: '#3a52b4', bgMid: '#2a4280', bgMidL: '#f0c020', bgMidD: '#16244c', bgNear: '#101a3c', bgNearD: '#080e26',
      bgWater: '#c020c4', bgWaterL: '#ff94f0', bgWaterD: '#6a0a8c', sun: '#ffe060', sunL: '#fff8d0', bgCloud: '#5c62ac', bgCloudD: '#3a4284',
      ceilL: '#ff8ab0', ceil: '#d0246c', ceilD: '#5a0a3a',
      acidD: '#8a0a9c', acid: '#f440e4', acidL: '#ffc4ff',
      white: '#eaf0ff', cloudD: '#8090c8',
    },
  },
  dusk: {
    label: 'Sunset', sky: ['#38188c', '#f03c8c', '#ffc23a'],
    colors: { ...base,
      dirtX: '#064048', dirtD: '#0a7078', dirt: '#18a8a0', dirtL: '#88f4d4',
      grassL: '#fffac8', grass: '#ffc818', grassD: '#f05828',
      rimL: '#c8fff0', rimD: '#02262c',
      brickD: '#8a1860', brick: '#e83c94', brickL: '#ffa8cc',
      stoneD: '#58387c', stone: '#9a78c8', stoneL: '#e4d4fc',
      pipeD: '#3828b8', pipe: '#6c60f8', pipeL: '#c8c8ff',
      bushD: '#b03818', bush: '#f47c28', bushL: '#ffd878',
      hillD: '#4a1a7a', hill: '#6a2a9a',
      bgFar: '#a038a4', bgFarL: '#f884c4', bgMid: '#6a2aa0', bgMidL: '#c864d8', bgMidD: '#481a7c', bgNear: '#2a1064', bgNearD: '#1a0a4a',
      bgWater: '#f06850', bgWaterL: '#ffe490', bgWaterD: '#c03c7c', sun: '#ffe470', sunL: '#fffcd8', bgCloud: '#ffa070', bgCloudD: '#e45c8c',
      ceilL: '#c8c8ff', ceil: '#6c60f8', ceilD: '#28188c',
      white: '#fff0e4', cloudD: '#f4a4b4',
    },
  },
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// The sky is drawn as discrete colour bands through the theme's three stops (no smooth blend).
export function skyBands(themeName, n = 18) {
  const stops = (THEMES[themeName] || THEMES.meadow).sky.map(rgb);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(t)), f = t - k;
    return stops[k].map((v, c) => Math.round(v + (stops[k + 1][c] - v) * f));
  });
}

export function themeRGBA(themeName) {
  const t = THEMES[themeName] || THEMES.meadow;
  const out = new Uint8Array(SLOTS.length * 4);
  SLOTS.forEach((n, i) => {
    if (!i) return;
    const hex = t.colors[n] || '#ff00ff';
    out[i * 4] = parseInt(hex.slice(1, 3), 16); out[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    out[i * 4 + 2] = parseInt(hex.slice(5, 7), 16); out[i * 4 + 3] = 255;
  });
  return out;
}
