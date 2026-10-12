import type { LocationKind } from '@aj/shared';
import { memo } from 'react';

type Palette = Record<string, string>;

/** Renders a character map as crisp pixel rects. '.' is transparent. */
const PixelArt = memo(function PixelArt({ map, palette, size }: { map: string[]; palette: Palette; size: number }) {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const rects: JSX.Element[] = [];
  map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = palette[ch];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    });
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {rects}
    </svg>
  );
});

const BASE: Palette = { k: '#1b1b2f', w: '#f4efe2', g: '#7a7a8c', y: '#ffd166', b: '#3a86ff', r: '#e63946', n: '#8d5524' };

const SPRITES: Record<LocationKind, { map: string[]; palette: Palette }> = {
  // A warehouse with a code door: repositories.
  repo: {
    palette: { ...BASE, a: '#2a9d8f', d: '#264653' },
    map: [
      '....kkkkkkkk....',
      '...kaaaaaaaak...',
      '..kaaaaaaaaaak..',
      '.kaaaaaaaaaaaak.',
      'kkkkkkkkkkkkkkkk',
      'kwwwwwwwwwwwwwwk',
      'kwbbwwwwwwwwbbwk',
      'kwbbwwkkkkwwbbwk',
      'kwwwwwkddkwwwwwk',
      'kwwwwwkdykwwwwwk',
      'kwbbwwkddkwwbbwk',
      'kwbbwwkddkwwbbwk',
      'kwwwwwkddkwwwwwk',
      'kkkkkkkkkkkkkkkk',
    ],
  },
  // An office tower: monday boards.
  board: {
    palette: { ...BASE, p: '#8b5cff', l: '#c9b6ff' },
    map: [
      '...kkkkkkkkkk...',
      '...kppppppppk...',
      '...kplplplplk...',
      '...kppppppppk...',
      '...kplplplplk...',
      '...kppppppppk...',
      '...kplplplplk...',
      '...kppppppppk...',
      '...kplplplplk...',
      '...kppppppppk...',
      '...kpplkklppk...',
      '...kppkyykppk...',
      '...kppkyykppk...',
      'kkkkkkkkkkkkkkkk',
    ],
  },
  // A workshop with a chimney: tools.
  tool: {
    palette: { ...BASE, o: '#f4a261', s: '#c0c0c8' },
    map: [
      '..........kk....',
      '..........ks....',
      '...kkkkkkkkskk..',
      '..koooooooooook.',
      '.koooooooooooook',
      'kkkkkkkkkkkkkkkk',
      'kwwwwwwwwwwwwwwk',
      'kwyywwwwwwwwyywk',
      'kwyywwkkkkwwyywk',
      'kwwwwwknnkwwwwwk',
      'kwwwwwknnkwwwwwk',
      'kwwwwwknykwwwwwk',
      'kwwwwwknnkwwwwwk',
      'kkkkkkkkkkkkkkkk',
    ],
  },
  // A dish-topped station: external services.
  service: {
    palette: { ...BASE, c: '#00b4d8', e: '#90e0ef' },
    map: [
      '.....kkkkkk.....',
      '....keeeeeek....',
      '.....kkkkkk.....',
      '.......kk.......',
      '..kkkkkkkkkkkk..',
      '..kccccccccccck.',
      '..kcewcewcewcck.',
      '..kccccccccccck.',
      '..kcewcewcewcck.',
      '..kccccccccccck.',
      '..kcccckkcccck..',
      '..kcccckykcccck.',
      '..kcccckkkcccck.',
      'kkkkkkkkkkkkkkkk',
    ],
  },
  // A domed library: the Team Brain.
  brain: {
    palette: { ...BASE, m: '#ff8fab', v: '#ffc2d1', t: '#f1faee' },
    map: [
      '......kkkk......',
      '....kkmmmmkk....',
      '...kmmvmmvmmk...',
      '..kmmvmmmmvmmk..',
      '..kmmmmvvmmmmk..',
      '.kkkkkkkkkkkkkk.',
      '.ktktktktktktkk.',
      '.ktktktktktktkk.',
      '.ktktkkkkktktkk.',
      '.ktktkyyyktktkk.',
      '.ktktkyyyktktkk.',
      'kkkkkkkkkkkkkkkk',
    ],
  },
};

export function BuildingSprite({ kind, size = 56 }: { kind: LocationKind; size?: number }) {
  const sprite = SPRITES[kind];
  return <PixelArt map={sprite.map} palette={sprite.palette} size={size} />;
}

/** A little walking figure tinted with the platform color. */
export function AgentSprite({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <PixelArt
      size={size}
      palette={{ k: '#1b1b2f', s: '#ffd7b5', c: color, w: '#ffffff' }}
      map={[
        '..kkkk..',
        '.kssssk.',
        '.kswswk.',
        '.kssssk.',
        '..kkkk..',
        '.kcccck.',
        'kcccccck',
        'k.cccc.k',
        '..c..c..',
        '..k..k..',
      ]}
    />
  );
}
