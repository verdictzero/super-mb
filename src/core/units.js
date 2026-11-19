// One tile is TILE pixels. S is the scale relative to the original 16px design grid:
// art coordinates, prefab geometry and physics constants are written in 16px units and
// multiplied by S, so changing TILE re-renders everything at a new resolution.
export const TILE = 32;
export const S = TILE / 16;
