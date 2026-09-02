import type { ReactElement } from 'react';
import type { StandIn } from './landing-content';

/* Every visual on this page is drawn. There are no photographs of the vault
   and no stock imagery, so the alternative to geometry is an empty box. */

/* Three concentric segmented hexagons, the mark's own construction blown up
   and turned into a backdrop. Rotates and grows a little across the hero,
   driven by scroll rather than by a timer. */
export function HeroArtwork({ progress }: { readonly progress: number }): ReactElement {
  const rings = [
    { radius: 150, opacity: 0.3, dash: '10 8' },
    { radius: 110, opacity: 0.55, dash: '16 10' },
    { radius: 70, opacity: 0.85, dash: '22 12' },
  ];
  return (
    <svg
      viewBox="0 0 400 400"
      aria-hidden="true"
      className="h-full w-full text-accent"
      style={{
        transform: `rotate(${String(progress * 26)}deg) scale(${String(1 + progress * 0.06)})`,
        transformOrigin: '50% 50%',
      }}
    >
      <g className="text-edge-strong" stroke="currentColor" strokeWidth={1} opacity={0.35}>
        <line x1="200" y1="20" x2="200" y2="380" />
        <line x1="40" y1="110" x2="360" y2="290" />
        <line x1="40" y1="290" x2="360" y2="110" />
      </g>
      {rings.map((ring) => {
        const points = Array.from({ length: 6 }, (_, index) => {
          const angle = (Math.PI / 180) * (60 * index - 90);
          return `${String(200 + ring.radius * Math.cos(angle))},${String(200 + ring.radius * Math.sin(angle))}`;
        }).join(' ');
        return (
          <polygon
            key={ring.radius}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray={ring.dash}
            opacity={ring.opacity}
          />
        );
      })}
      <circle cx="200" cy="200" r="5" fill="currentColor" />
    </svg>
  );
}

/* One drawing per category, standing in for the photograph the vault took.
   Deliberately schematic: a drawing that pretended to be a photograph would
   be a lie about what the page is showing. */
const standIns: Record<StandIn, ReactElement> = {
  watch: (
    <g>
      <circle cx="60" cy="44" r="23" />
      <path d="M60 30 V44 L69 49" />
      <path d="M50 20 L52 8 H68 L70 20" />
      <path d="M50 68 L52 80 H68 L70 68" />
    </g>
  ),
  bullion: (
    <g>
      <path d="M28 62 L38 30 H82 L92 62 Z" />
      <path d="M38 30 L48 62 M72 62 L82 30" />
      <path d="M28 62 H92" />
    </g>
  ),
  jewellery: (
    <g>
      <circle cx="60" cy="54" r="22" />
      <path d="M48 34 L60 14 L72 34 Z" />
      <path d="M48 34 H72 M60 14 V34" />
    </g>
  ),
  collectible: (
    <g>
      <rect x="34" y="16" width="52" height="68" rx="4" />
      <rect x="42" y="26" width="36" height="34" rx="2" />
      <path d="M42 68 H78 M42 76 H66" />
    </g>
  ),
  art: (
    <g>
      <rect x="26" y="20" width="68" height="56" rx="2" />
      <path d="M34 66 L52 42 L64 58 L74 48 L86 66 Z" />
      <circle cx="76" cy="34" r="5" />
    </g>
  ),
};

export function StandInArtwork({ kind }: { readonly kind: StandIn }): ReactElement {
  return (
    <svg
      viewBox="0 0 120 100"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full text-accent"
    >
      {standIns[kind]}
    </svg>
  );
}

/* The five line drawings that sit beside the how it works cards. Abstract on
   purpose: each one is the shape of the step rather than a picture of it. */
const stepDrawings: readonly ReactElement[] = [
  <g key="1">
    <path d="M20 70 H100 M30 70 V40 H90 V70" />
    <path d="M46 40 V24 H74 V40" />
    <circle cx="60" cy="55" r="7" />
  </g>,
  <g key="2">
    <rect x="22" y="30" width="76" height="50" rx="4" />
    <circle cx="60" cy="55" r="13" />
    <path d="M44 30 L50 20 H70 L76 30" />
  </g>,
  <g key="3">
    <path d="M32 18 H88 V82 L60 70 L32 82 Z" />
    <path d="M44 38 H76 M44 50 H76 M44 62 H64" />
  </g>,
  <g key="4">
    <path d="M22 78 H98" />
    <path d="M34 78 V52 M52 78 V38 M70 78 V26 M88 78 V46" />
    <circle cx="52" cy="38" r="4" />
  </g>,
  <g key="5">
    <path d="M26 52 L48 74 L94 28" />
    <circle cx="60" cy="52" r="34" strokeDasharray="6 7" />
  </g>,
];

export function StepArtwork({ index }: { readonly index: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 120 100"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full text-accent"
    >
      {stepDrawings[index] ?? stepDrawings[0]}
    </svg>
  );
}
