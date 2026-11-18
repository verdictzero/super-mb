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
];
export const P = Object.fromEntries(SLOTS.map((n, i) => [n, i]));

const base = {
  ink: '#1b1630',
  white: '#fbfbf4', cloudD: '#c9d8f0',
  goldD: '#b5651d', gold: '#f2a71b', goldL: '#ffe17a',
  redD: '#9c1f3a', red: '#e8404e',
  gemD: '#1479a8', gem: '#35c6e8', gemL: '#d2fbff',
  steelD: '#56607a', steel: '#9aa6bf', steelL: '#e6ecf7',
  heroD: '#a3371c', hero: '#f26b2b', heroL: '#ffc27a',
  foeD: '#4a2b6b', foe: '#8a52b8', foeL: '#d3a8f0',
  yellow: '#ffe14a', orange: '#f58a1f',
  woodD: '#6e3f22', wood: '#a8683a', woodL: '#d69a5c',
};

export const THEMES = {
  meadow: {
    label: 'Meadow', sky: ['#58b4f5', '#bfe6fb'],
    colors: { ...base,
      dirtD: '#a04a22', dirt: '#c9682e', dirtL: '#e89655', dirtX: '#72301a',
      grassL: '#b4ec5a', grass: '#52b83a', grassD: '#256e33',
      rimL: '#f0b071', rimD: '#5c2716',
      brickD: '#7a2f24', brick: '#c2543a', brickL: '#eb8a62',
      stoneD: '#6b5a52', stone: '#a8958a', stoneL: '#ddd0c4',
      pipeD: '#2d3a94', pipe: '#4f6fe0', pipeL: '#a9c2ff',
      bushD: '#1f7a4a', bush: '#3fb665', bushL: '#9ae88a',
      hillD: '#3d9a6e', hill: '#6fca8c',
    },
  },
  cavern: {
    label: 'Cavern', sky: ['#0d1026', '#1b2145'],
    colors: { ...base,
      dirtD: '#2c3f7a', dirt: '#4160a8', dirtL: '#6f92d6', dirtX: '#1a2550',
      grassL: '#b7fff0', grass: '#3fd6c0', grassD: '#177a80',
      rimL: '#8fb0ee', rimD: '#121a3d',
      brickD: '#233063', brick: '#3f5aa3', brickL: '#7d9be0',
      stoneD: '#3b4460', stone: '#6c7896', stoneL: '#b4bfd9',
      pipeD: '#7a2b62', pipe: '#c94f9a', pipeL: '#ffaedb',
      bushD: '#1c5c6e', bush: '#2f93a0', bushL: '#7fe0d8',
      hillD: '#1d2752', hill: '#2a3870',
      cloudD: '#2a3870', white: '#3d4f8f',
    },
  },
  dusk: {
    label: 'Dusk', sky: ['#3b2a6e', '#f29a6b'],
    colors: { ...base,
      dirtD: '#5b3a6e', dirt: '#84559a', dirtL: '#b785c4', dirtX: '#38224a',
      grassL: '#ffe58a', grass: '#f2a03a', grassD: '#a8502a',
      rimL: '#d2a2dc', rimD: '#2a1838',
      brickD: '#6e2a4a', brick: '#b0486a', brickL: '#e88a9a',
      stoneD: '#4f4a6b', stone: '#8a84a8', stoneL: '#cfc9e6',
      pipeD: '#1f6a6e', pipe: '#35aaa6', pipeL: '#a2f0e0',
      bushD: '#7a3a4a', bush: '#c2603a', bushL: '#f5b05a',
      hillD: '#5a3a7e', hill: '#7a52a0',
      white: '#ffd9c2', cloudD: '#e89a9a',
    },
  },
};

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
