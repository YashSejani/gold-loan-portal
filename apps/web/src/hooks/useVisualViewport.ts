import { useEffect, useState } from 'react';

export interface ViewportBox {
  height: number;
  offsetTop: number;
}

/**
 * The part of the screen the user can actually see. On phones the on-screen keyboard shrinks it while the
 * layout viewport stays full height, so a `fixed inset-0` panel ends up partly behind the keyboard and the
 * browser scrolls its header away. Sizing to this box keeps the whole panel above the keyboard.
 */
export function useVisualViewport(active: boolean): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null);

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!active || !viewport) return;
    const update = () => setBox({ height: viewport.height, offsetTop: viewport.offsetTop });
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [active]);

  return active ? box : null;
}
