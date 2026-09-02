# 13. Design System

We use the UI UX Pro Max skill (`nextlevelbuilder/ui-ux-pro-max-skill`) for design intelligence:
style selection, colour palettes, font pairings, chart types, and UX rules.

This document exists because the obvious way to use it is wrong, and the wrong way is invisible
until slice nine when the three apps no longer look like the same product.

## The rule

**Generate the design system once. Freeze it. Never regenerate it.**

The skill is a generator. Generators are non-deterministic. Run it at the start of a slice and you
get a palette. Run it at the start of the next slice and you get a slightly different palette, a
different font pairing, and a different opinion about card elevation. Nothing in the pipeline would
catch this, because every individual slice looks fine in isolation.

So the skill runs in exactly one place, at P0.5, before any UI slice exists. Its output is converted
into design tokens, committed, and treated as read-only from then on. Every subsequent UI slice
consumes the tokens and queries the skill only for component-level patterns, never for colour,
typography, or style direction.

## Installation

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

Queries run through the bundled script:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>
```

Domains include `style`, `color`, `typography`, `chart`, `landing`, `ux`, and `product`. The
`--design-system` flag runs the full generator. That flag is used once, in P0.5, and is otherwise
banned. Add it to the review checklist.

## P0.5, the design system slice

Sits between P0 (spine) and P1 (ledger). It produces no product behaviour and it is not optional.

### Step 1, generate three surface directions

We have three applications with genuinely different jobs, so we query three times.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "peer to peer secured lending marketplace, trustworthy, financial, calm" \
  --design-system -p "Marketplace"

python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "warehouse operations terminal, dense, high contrast, keyboard first, fixed screen" \
  --design-system -p "Vault Console"

python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "internal risk and reconciliation dashboard, data dense, tabular, neutral" \
  --design-system -p "Admin"
```

Save all three raw outputs to `.claude/work/p05-design-system/generated/`. They are evidence for why
the tokens are what they are, not something the build reads.

### Step 2, reconcile to one token set

Three generated systems, one product. Reconcile by hand, in this order:

- **One colour ramp, shared.** Take the marketplace palette as the base. The vault console and admin
  do not get their own hues. They get different *usage*: heavier weights, tighter spacing, larger
  type sizes for the terminal.
- **Two font families maximum.** One for headings, one for body and UI. If the three generated
  pairings disagree, take the marketplace pairing and drop the others.
- **Semantic naming, not descriptive.** `--color-surface-raised`, not `--color-gray-100`.
  `--color-status-danger`, not `--color-red-600`. The name says what it is for, so a rebrand changes
  values in one file and nothing else.
- **Status colours are fixed by domain, not by taste.** We have loan states, receipt states, and
  reconciliation drift. Map each state group to a semantic status token in P0.5 and never decide it
  again inside a slice.

### Step 3, write the tokens

`packages/ui/src/tokens.css` is the single source of truth. It is the only file in the repository
allowed to contain a raw colour value.

```css
:root {
  --color-surface-base: #f8fafc;
  --color-surface-raised: #ffffff;
  --color-surface-sunken: #eef2f6;

  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-text-inverse: #ffffff;

  --color-accent-default: #0f766e;
  --color-accent-hover: #115e59;

  --color-status-neutral: #64748b;
  --color-status-active: #0369a1;
  --color-status-success: #15803d;
  --color-status-warning: #b45309;
  --color-status-danger: #b91c1c;

  --font-heading: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  --density-row-height: 2.5rem;
}
```

Density is a token, not a per-app stylesheet. The vault console overrides three or four tokens under
a `[data-surface='terminal']` selector and inherits everything else:

```css
[data-surface='terminal'] {
  --density-row-height: 3rem;
  --space-4: 0.75rem;
  --color-text-secondary: #334155;
}
```

That is the whole mechanism for making a dense operational screen out of the same design system. No
second palette, no second component library.

### Step 4, map tokens into Tailwind

```ts
// packages/ui/tailwind.preset.ts
export default {
  theme: {
    extend: {
      colors: {
        surface: {
          base: 'var(--color-surface-base)',
          raised: 'var(--color-surface-raised)',
          sunken: 'var(--color-surface-sunken)',
        },
        status: {
          neutral: 'var(--color-status-neutral)',
          active: 'var(--color-status-active)',
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          danger: 'var(--color-status-danger)',
        },
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
      },
    },
  },
};
```

All three apps extend this preset. None of them defines a colour.

### Step 5, build the primitives

`packages/ui` gets the components every app needs, built against tokens:

```
Button  Field  Select  Checkbox  DataTable  Money  Rate  StatusBadge
Card  Dialog  Toast  Skeleton  EmptyState  Stepper  AppShell
```

Query the skill for patterns here, scoped tightly:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "data table dense readable" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "accessibility focus" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "loading states skeleton" --domain ux
```

Take the guidance. Do not take generated colour values.

### Step 6, write the design brief

`docs/DESIGN-BRIEF.md`, one page, generated once and then read by every UI slice:

- Chosen style name and the one-line reason
- The token table with each token's intended use
- Status colour to domain state mapping, exhaustive
- Typography scale with the heading levels actually in use
- Density rules for the terminal surface
- The five UX rules from the skill that this product cares about most

Every UI slice reads this file in Stage 0 instead of re-querying the skill for direction.

### Exit criteria for P0.5

- `packages/ui/src/tokens.css` committed
- Tailwind preset committed and consumed by all three apps
- Primitives built with unit tests and a Storybook or a static gallery route
- `docs/DESIGN-BRIEF.md` committed
- `scripts/check-design-tokens.sh` passing and wired into `pnpm check`
- The three raw generator outputs archived under `.claude/work/p05-design-system/generated/`

## Amendment, P8c: motion and elevation

The freeze forbids regenerating the system. It does not forbid naming something the system never
named, and the difference matters: regenerating drifts the values every screen already uses, while
adding a token nobody has used yet cannot move anything.

Motion, elevation and easing were never tokenised. Without them a slice that wants a transition has
two choices, both bad: hardcode a duration, which the token check does not catch and which drifts
between screens, or do without motion entirely. So P8c added, and only added:

```
--motion-control  --motion-enter  --motion-panel
--motion-ease-enter  --motion-ease-exit
--elevation-raised  --elevation-overlay
```

The conditions this amendment was made under, which any future one should meet too:

- **Additive only.** No existing token changed value. Every screen renders identically to before.
- **Semantic, like everything else.** `--motion-panel`, not `--duration-240`.
- **Bounded on purpose.** Three durations, two easings, two elevations. A scale nobody can exhaust
  is a scale nobody obeys.
- **Reduced motion is part of the token, not left to each caller.** The durations collapse to zero
  under `prefers-reduced-motion`, so a component cannot forget.

The palette and the typography remain frozen. Wanting a different visual world is still a P0.6
sized project: regenerate, reconcile once, re-freeze.

## Amendment, P8e: the page shell and the formatting primitives

Additive, on the P8c conditions. No token changed value.

`Page`, `PageHeader` and `PageSection` join the primitive list, along with `DateTime`,
`AppBoundary` and `useMutationFeedback`. `DataTable` gained an overflow container and a stacked
presentation below the medium breakpoint; its column definition did not change, so every caller
gained the behaviour without being edited.

`DateTime` is the typographic counterpart of `Money`: the wire carries one format, the reader sees
another, and no screen writes its own. Both cache their `Intl` formatter per locale.

## Amendment, P0.6: the floor scope

The marketplace became a dark workspace. That is the P0.6 the P8c amendment said this would take,
and it is a larger change than P8c was: P8c could claim every screen rendered identically
afterwards, and this one repaints an entire application. It is written down here rather than
carried in a commit message because it changes a rule this file states.

**What changed.** `[data-surface='terminal']` was documented as density overrides only, with the
line "the palette never forks". The palette now forks once, into `[data-surface='floor']`, which
the marketplace sets on its shell.

**Why the name.** `terminal` was taken. The vault console has used it since P0.5 for a fixed
terminal in a lit room, and reusing the word for a dark marketplace would have left two unrelated
meanings on one selector.

The conditions this amendment was made under, which any future one should meet too:

- **The light scope is untouched.** No value under `:root` changed. The vault console and the
  admin render exactly as they did, and `terminal` still overrides density only.
- **A fork carries its own recorded contrast table.** Not a claim that it was checked: a table,
  in `docs/DESIGN-BRIEF.md`, computed from the tokens by `packages/ui/src/contrast.spec.ts`. A
  ratio written by hand into a document is a ratio that drifts the first time somebody nudges a
  value.
- **One fork, not a mechanism for forks.** A second named scope needs another amendment. The
  difference between one exception and a pattern is whether the next one has to argue for itself.
- **Structurally identical scopes.** Both define the same token names. A component reads
  `--color-surface-raised` and never learns which scope answered.

`--color-border-strong` was added to both scopes at the same time, and is the one part of this
amendment that is a straight bug fix. A single `--color-border` had been serving both the hairline
between two table rows, which should recede, and the outline of a control a person has to find,
which WCAG 1.4.11 puts at 3:1. Those are different jobs. The dark scope is only where it became
impossible to ignore.

## Amendment, P8g: the typography split

The families changed. This is the second amendment that is not additive, and the honest framing is
that it is a P0.6 sized change to type rather than a P8c sized addition, taken deliberately and
recorded here because it moves a value the freeze protects.

**What changed.** IBM Plex Sans and IBM Plex Mono are out. Source Sans 3 carries headings, body and
figures; Source Code Pro carries identifiers. A fourth token, `--font-figure`, joins the three that
existed.

**Why.** One token was doing three jobs, and it was the wrong token for two of them.

`--font-mono` was set on every figure in the product: money, rates, loan to value, countdowns,
timestamps, counts. A monospace earns its place when a reader compares characters in a string, and
none of those are that. What they need is to line up down a column, which is what tabular numerals
are for, and tabular numerals do not require a typewriter. The cost of using one anyway was that
every screen with a number on it read as a terminal readout, and this product asks people to leave
money with a pawnbroker.

The same token was also on the things that genuinely are read character by character: receipt
references, intake hashes, settlement references, seal numbers. Those keep it. This is the same
shape as the `--color-border` split in P0.6, where one token was serving a hairline and a control
boundary at two different contrast requirements. One name, two jobs, and the fix is two names.

**Why these faces.** Source Sans 3 is a humanist workhorse with open apertures and round bowls,
which reads calm at the sizes this product uses and does not carry the institutional edge Plex has.
Source Code Pro is drawn against the same skeleton by the same hand, so a reference sitting next to
a figure looks related rather than borrowed. Both are on Google Fonts, which is the only font host
the apps load from.

Rejected, and why: Public Sans sets figures much wider and more geometric, which costs column width
in an order book and reads rigid; Figtree is soft but its numerals are brand shaped, and its `1` has
no foot to hold a column; Inter and Space Grotesk are the defaults every generated interface reaches
for. Keeping IBM Plex Sans for figures was the cheapest option and was rejected only after seeing
it beside the others: its numerals are the most closed of the four.

**How alignment is guaranteed.** `font-figure` is a Tailwind family that carries
`font-feature-settings: "tnum"` with it, so a column cannot lose its alignment because one caller
forgot a class. Same reasoning as the reduced motion collapse in P8c: the guarantee belongs to the
token rather than to whoever reaches for it. Source Sans 3 also sets figures on one width by
default, so the feature is a backstop rather than the only thing holding a table together. That was
measured in a browser against the served webfont, not assumed from the specimen.

The conditions this amendment was made under, which any future one should meet too:

- **Nothing but the families moved.** The scale, the weights from P8f, the spacing, the radii and
  every colour are untouched. No contrast ratio changes, because type does not carry colour.
- **Roles, not descriptions.** `--font-figure` names the job. It holds the same value as
  `--font-body` today and stays a separate token, because "the face the interface is set in" and
  "the face a borrower reads their balance in" are two decisions and one should be able to move
  without dragging the other.
- **Every call site was classified, not swept.** A figure became `font-figure`, an identifier kept
  `font-mono`, and a label that was monospace for no reason became body text. Anything still on
  `font-mono` is a string somebody reads one character at a time.
- **One change, not a licence.** The families are frozen again from here. Wanting a different one
  is another amendment that has to argue for itself.

## Using the skill inside UI slices

Allowed:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "wizard multi step form" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "dashboard" --domain chart
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "error empty state" --domain ux
```

Banned inside a slice:

- `--design-system`
- `--domain color`
- `--domain typography`
- `--domain style`
- `--domain landing`, since we have no marketing pages in scope

The reviewer checks the slice's brainstorm file for any of these and treats their presence as a
blocking finding.

## Token enforcement

The skill's own guidance is tokens first, then components, because generated UI tends to scatter hex
values across dozens of class strings. We enforce that mechanically rather than trusting it.

`scripts/check-design-tokens.sh` fails on:

- A hex colour in any file under `apps/` or in `packages/ui` outside `tokens.css`
- `rgb(`, `rgba(`, `hsl(` outside `tokens.css`
- A Tailwind arbitrary colour value, meaning `bg-[#...]`, `text-[#...]`, `border-[#...]`
- A hardcoded `font-family` outside `tokens.css`
- A raw `px` value in a margin, padding, or gap utility, since spacing comes from tokens

It runs inside `pnpm check` and on every edit through the `PostToolUse` hook, so a violation surfaces
next to the tool result rather than at review time.

This one check is what keeps the design system real. Without it the tokens exist and nothing uses
them.

## Precedence when guidance conflicts

The skill has opinions. So do our own documents. Order of precedence, highest first:

1. `docs/09-conventions.md`, which owns code style, naming, and the emoji ban
2. `docs/13-design-system.md`, this file, which owns tokens and the freeze rule
3. `docs/DESIGN-BRIEF.md`, which owns the specific chosen values
4. `docs/05-frontend.md`, which owns routing, state, and component structure
5. UI UX Pro Max guidance
6. Anthropic's `frontend-design` skill

If both design skills are installed, UI UX Pro Max wins on colour, typography, and style, because it
is what produced our tokens. Neither one wins on anything covered by items 1 to 4.

Two conflicts worth naming now:

- **Emoji.** The skill's quality checklist already says SVG icons rather than emoji, which matches
  our rule. If any generated snippet contains one, remove it. `scripts/check-prose.sh` will catch it.
- **Raw values in generated snippets.** The skill emits Tailwind with hex values inline, as in
  `bg-[#F97316]`. Every generated snippet is rewritten to token classes before it is committed. The
  token check enforces this.

## Accessibility

The skill supplies contrast and focus guidance. We verify it rather than assume it.

- Every token pair that renders text on a background is contrast-checked in P0.5, and the ratio is
  recorded in `docs/DESIGN-BRIEF.md`. Body text meets WCAG AA at minimum.
- Status is never carried by colour alone. Every `StatusBadge` has a text label. This is a hard rule
  from `docs/05-frontend.md` and it survives any design guidance to the contrary.
- `@axe-core/playwright` runs on the primary route of each app in every pipeline verify stage and
  fails on serious violations.
- The vault console is checked at 1366 by 768 with keyboard navigation only. Staff use a fixed
  terminal, not a laptop with a trackpad.

## Amendment, P8h: press motion and the shared control surface

Additive, on the P8c conditions. No token changed value, and no palette, typeface or spacing entry
moved.

### What was wrong

P8c tokenised how long a thing takes and never what it does. The result was that `transition-colors`
appeared twenty two times across the three applications and there were zero press states in the
whole repository. Every control in the product answered a hand on exactly one channel, colour, which
is the channel a reader with a colour vision deficiency has least access to and the one a person
using the product in bright sun on a phone can see least well.

Underneath that sat a second problem the first one hid. There was no tab component and no chip
component, so four screens grew their own version of the same selected pill and all four disagreed:
two paddings, two type sizes, and three different ideas about what selected looks like. The admin
navigation carried selection in text colour alone, which DESIGN-BRIEF rule 3 forbids outright.

### The tokens

```
--motion-press-scale  --motion-lift  --motion-ease-spring
```

Amplitude is a token rather than a class because the same component has to be emphatic on the
marketplace floor and nearly still on a vault terminal. A component says `active:scale-press` once
and the surface it landed on decides how far that is:

| Scope | Press | Lift | Release |
|---|---|---|---|
| `:root`, the admin | 0.97 | 1px | settles, no overshoot |
| `[data-surface='terminal']` | 0.99 | none | settles, no overshoot |
| `[data-surface='floor']` | 0.96 | 1px | overshoots and comes back |

The floor is the only scope permitted to overshoot, on the same reasoning that made it the only
scope permitted to fork the palette in P0.6. It is the surface a lender chooses to be on. The
console is a fixed screen one person drives through hundreds of intakes, where a control that hops
under the cursor is an irritation rather than a confirmation.

`--motion-ease-spring` resolves to `--motion-ease-enter` everywhere except the floor, so the tiering
costs a component nothing: it asks for the spring and gets whatever the surface means by it.

### Reduced motion, and why the collapse moved

The P8c durations collapse in a media query near the top of the file. The amplitude tokens cannot,
because a scope selector and `:root` carry the same specificity and the floor override is written
further down. Collapsing amplitude beside the durations would let document order reinstate exactly
the motion the query exists to remove. So there is a second `prefers-reduced-motion` block at the
foot of `tokens.css` that names all three scopes. Duration is not repeated there, because nothing
below the first block sets one.

### The control surface

`packages/ui/src/pressable.ts` is the single definition of what touching a control feels like.
`Button`, `Tab`, `Chip` and the marketplace rail compose it rather than restating it. It exports
`pressable` and `pressableInset`, which differ only in whether the focus ring is drawn outside the
control or inside it, for one sitting flush against a container edge that would clip it. The two are
alternatives rather than additions: putting both rings in one class list leaves the winner to
stylesheet order rather than to the caller.

Two primitives join the list in step 5:

- **`TabStrip`, `Tab`, `TabItem`.** One of a set of views or destinations. Selection is carried by a
  bottom edge bar, by weight, and by tone, which is `NavRailItem`'s rule turned ninety degrees. That
  is deliberate: the rail and the strip are the same idea on two axes. `Tab` is a button and reports
  `aria-pressed` because it changes what is on screen. `TabItem` is presentation only, for a router
  link to wrap, because a destination is a place and the link owns `aria-current`.
- **`Chip`.** A constraint that is on or off. It is a separate component from `Tab` rather than a
  size of one because the two answer different questions: a tab asks which of these views am I
  looking at, and exactly one is always chosen, while a chip asks whether this constraint is on, and
  none of them being on is the ordinary case.

### The conditions this was made under

- **Additive only.** No existing token changed value.
- **Semantic.** `--motion-press-scale`, not `--scale-96`.
- **Bounded.** Two amplitudes and one easing. No second scale for anybody to pick from.
- **Reduced motion belongs to the token.** A component cannot forget, and a scope cannot undo it.
- **Tiering lives in the scope, not in the component.** A surface that wants less motion overrides a
  value. It does not get its own component, and it never gets its own palette.

## Visual regression

Once tokens are frozen, drift becomes detectable. Playwright takes a screenshot of one representative
screen per app and compares against a committed baseline:

- Marketplace: listing detail with a populated offer book
- Vault console: the intake wizard at the appraisal step
- Admin: the reconciliation screen with drift rows present

A visual diff failing is a real failure. The pipeline treats it as a gate failure and goes back to
Stage 3. Updating a baseline is a deliberate commit, `chore(ui): update visual baseline for <reason>`,
never a side effect of a slice.

## What not to do

- **Do not regenerate the design system to fix an ugly screen.** The screen is wrong, not the tokens.
- **Do not add a token mid-slice because a component needs a shade.** Use an existing token or make
  adding the token its own commit with a one-line justification in the message.
- **Do not let the vault console or admin app grow their own palette.** Density overrides only.
- **Do not commit the generator's raw output as documentation.** It is archived evidence.
  `docs/DESIGN-BRIEF.md` is the document.
- **Do not query the skill during the review stage.** The reviewer checks against the brief, not
  against fresh generated opinions.
