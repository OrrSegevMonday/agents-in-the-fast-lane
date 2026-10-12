import { useEffect, useRef, useState } from 'react';
import { placePoint, route, type Place, type Pt } from '../lib/board.ts';

export const STEP_MS = 220;

const samePlace = (a: Place, b: Place) =>
  a.kind === b.kind && (a.kind !== 'slot' || (b.kind === 'slot' && a.slot === b.slot));

/** Walks a token along the ring road whenever its target place changes. */
export function useWalk(target: Place, animate: boolean): { point: Pt; walking: boolean } {
  const [point, setPoint] = useState<Pt>(() => placePoint(target));
  const [walking, setWalking] = useState(false);
  const placeRef = useRef<Place>(target);

  useEffect(() => {
    const from = placeRef.current;
    if (samePlace(from, target)) return;
    placeRef.current = target;

    if (!animate) {
      setPoint(placePoint(target));
      return;
    }
    const path = route(from, target);
    let i = 1;
    setWalking(true);
    const timer = setInterval(() => {
      const next = path[i];
      if (!next) {
        clearInterval(timer);
        setWalking(false);
        return;
      }
      setPoint(next);
      i += 1;
    }, STEP_MS);
    return () => {
      clearInterval(timer);
      setWalking(false);
    };
  }, [target, animate]);

  return { point, walking };
}
