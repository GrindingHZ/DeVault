import type { Config } from 'tailwindcss';

const preset: Omit<Config, 'content'> = {
  theme: {
    extend: {
      /* The motion and elevation tokens added in P8c, exposed as utilities so
         a component never has to reach for a raw duration. */
      transitionDuration: {
        control: 'var(--motion-control)',
        enter: 'var(--motion-enter)',
        panel: 'var(--motion-panel)',
      },
      transitionTimingFunction: {
        enter: 'var(--motion-ease-enter)',
        exit: 'var(--motion-ease-exit)',
        /* Resolves to the entering curve everywhere except the floor, which
           is the one scope that overshoots (P8h). A component asks for the
           spring and gets whatever the surface it landed on means by it. */
        spring: 'var(--motion-ease-spring)',
      },
      /* The P8h amplitude tokens, exposed the same way the durations are so
         a control never reaches for a raw transform. */
      scale: {
        press: 'var(--motion-press-scale)',
      },
      translate: {
        lift: 'var(--motion-lift)',
      },
      boxShadow: {
        raised: 'var(--elevation-raised)',
        overlay: 'var(--elevation-overlay)',
      },
      colors: {
        surface: {
          base: 'var(--color-surface-base)',
          raised: 'var(--color-surface-raised)',
          sunken: 'var(--color-surface-sunken)',
        },
        ink: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          inverse: 'var(--color-text-inverse)',
        },
        edge: {
          DEFAULT: 'var(--color-border)',
          /* WCAG 1.4.11: anything bounding a control, never a hairline. */
          strong: 'var(--color-border-strong)',
        },
        accent: {
          DEFAULT: 'var(--color-accent-default)',
          hover: 'var(--color-accent-hover)',
        },
        status: {
          neutral: 'var(--color-status-neutral)',
          active: 'var(--color-status-active)',
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          danger: 'var(--color-status-danger)',
        },
        /* Bound to the reader, not to the sign. See MarketDelta. */
        market: {
          favourable: 'var(--color-market-favourable)',
          adverse: 'var(--color-market-adverse)',
          flat: 'var(--color-market-flat)',
        },
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
        /* Tabular numerals ride along with the family, so a column of figures
           cannot lose its alignment because one caller forgot a class. Same
           reasoning as the reduced motion collapse in P8c: the guarantee
           belongs to the token, not to whoever reaches for it. */
        figure: ['var(--font-figure)', { fontFeatureSettings: '"tnum"' }],
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      /* The tape. Translating by half the track works because the content is
         rendered twice, so the moment the first copy leaves the second is
         exactly where it started. */
      keyframes: {
        ticker: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        ticker: 'ticker var(--motion-ticker) linear infinite',
      },
      height: {
        row: 'var(--density-row-height)',
        'row-floor': 'var(--density-row-floor)',
      },
      minHeight: {
        row: 'var(--density-row-height)',
        'row-floor': 'var(--density-row-floor)',
      },
    },
  },
};

export default preset;
