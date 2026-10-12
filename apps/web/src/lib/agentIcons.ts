import { AGENT_ICON_COUNT } from '@aj/shared';

/**
 * Player icons: 20 headgear silhouettes worn on the same body. Agents on one platform
 * share a color, so the outline of the hat is what tells them apart at a glance.
 *
 * Each hat is 4 rows of 8 pixels drawn above the head.
 * k = outline, c = platform color, y = gold, w = white, . = empty.
 */
export const AGENT_ICONS: { name: string; hat: [string, string, string, string] }[] = [
  { name: 'Cap', hat: ['........', '..kkkk..', '.kcccck.', 'kkkkkkk.'] },
  { name: 'Top hat', hat: ['..kkkk..', '..kcck..', '..kcck..', '.kkkkkk.'] },
  { name: 'Crown', hat: ['........', '.y.yy.y.', '.yyyyyy.', '.yyyyyy.'] },
  { name: 'Wizard hat', hat: ['....k...', '...kck..', '..kccck.', '.kkkkkkk'] },
  { name: 'Beanie', hat: ['...ww...', '..kkkk..', '.kcccck.', '.kwwwwk.'] },
  { name: 'Antenna', hat: ['...yy...', '...yy...', '....k...', '....k...'] },
  { name: 'Halo', hat: ['........', '.yyyyyy.', 'y......y', '.yyyyyy.'] },
  { name: 'Horns', hat: ['........', 'k......k', 'kc....ck', '.kc..ck.'] },
  { name: 'Cat ears', hat: ['........', '.k....k.', '.kk..kk.', '.kckkck.'] },
  { name: 'Bunny ears', hat: ['.kk..kk.', '.kc..ck.', '.kc..ck.', '.kk..kk.'] },
  { name: 'Helmet', hat: ['..kkkk..', '.kcccck.', 'kccwwcck', 'kkkkkkkk'] },
  { name: 'Bow', hat: ['........', '.kk..kk.', 'kcckkcck', '.kk..kk.'] },
  { name: 'Mohawk', hat: ['...cc...', '...cc...', '..kcck..', '..kcck..'] },
  { name: 'Headphones', hat: ['........', '..kkkk..', '.k....k.', 'kc....ck'] },
  { name: 'Propeller', hat: ['yyy..yyy', '...kk...', '..kcck..', '..kkkk..'] },
  { name: 'Chef hat', hat: ['.wwwwww.', 'wwwwwwww', '.wwwwww.', '.kkkkkk.'] },
  { name: 'Cowboy hat', hat: ['...kk...', '..kcck..', '..kcck..', 'kkkkkkkk'] },
  { name: 'Headband', hat: ['........', '........', 'kcccccck', '.kkkkkkc'] },
  { name: 'Flower', hat: ['...w....', '..wyw...', '...w....', '...kc...'] },
  { name: 'Star', hat: ['...yy...', '.yyyyyy.', '..yyyy..', '.yy..yy.'] },
];

if (AGENT_ICONS.length !== AGENT_ICON_COUNT) {
  throw new Error(`Expected ${AGENT_ICON_COUNT} agent icons, found ${AGENT_ICONS.length}`);
}

export const iconFor = (icon: number | undefined) => AGENT_ICONS[(icon ?? 0) % AGENT_ICON_COUNT]!;
