# pi-colored-footer

A [Pi](https://pi.dev) extension that replaces Pi's default status row with a
full-width, color-blocked line. It uses only Pi's public `ctx.ui.setFooter()`
API and the packages Pi's extension loader supplies, so no edits to Pi's
installed source, bundle, or launcher are required.

## What Pi already shows

The footer itself is Pi's own; this extension leaves these rows untouched:

- A dim row with the working directory, git branch, and session name.
- A dim row with usage totals (`↑` input, `↓` output, `R` cache read, `W` cache
  write, `CH<rate>%`, `$cost`), context percentage/window, and the selected model
  (with provider when more than one provider is available). This extension moves
  the usage totals, context, and model parts into its own block row (see below).
- Any remaining extension statuses on a separate row.

## What this extension changes

Only the status row. The statuses emitted by the plugins you run are drawn as
full-width background-colored blocks instead of plain text. The usage totals, the
context percentage/window, and the selected model are drawn as colored blocks in
the same row, so they take part in the same ordering and coloring. The usage
totals and the context share a single `stats` block, so they sit together in one
component like Pi's original row; the model is its own block. Each block is
weighted by its longest observed display width during the current Pi process, and
foreground colors set by the plugins (and the warning/error tint on the context
part of `stats`) are preserved.

While drawing, each slot's remaining text width is broadcast on the shared
`pi.events` bus as `pi.footer.slotWidth` (`{ key, width }`). Extensions that own a
slot can subscribe to trim their status to fit. For example `pi-backend-start`
uses it to show `🟢 uptime:2h`, fall back to `🟢 2h`, or the light alone as the
`backend` slot narrows.

Statuses that are not part of a configured slot still appear, unchanged, on the
remaining extension status row.

## Reordering the blocks

The blocks are drawn left to right in a configurable order. The built-in slots
`stats` (usage totals + context) and `model` come from the footer itself; the
plugin slots are `backend`, `dsh-minimal`, and `tokenSpeed`. The default order is
`stats → backend → dsh-minimal → tokenSpeed → model`. The order is
stored in `~/.pi/agent/pi-colored-footer.json` (`{"order": ["stats", ...]}`).

Run `/footer` to open an interactive reorder screen listing each block with its
color swatch and current text. Plugin blocks also show the owning extension
(`key · extension-name`); the built-in `stats` and `model` blocks are not labeled. Since Pi's footer API only exposes status key → text, the owner is
inferred by scanning the installed extension sources for their `setStatus("<key>")`
call. The rows are ordered top-to-bottom exactly as the blocks appear
left-to-right in the footer, and the preview updates as you go:

- `↑` / `↓` move the selection (or the block you are holding).
- `space` grabs the selected block, and again drops it.
- `enter` saves the new order; `esc` (or `q`) cancels.
- `r` restores the default order.

For scripting, the same command still accepts arguments:

- `/footer` (no UI available, e.g. print mode) prints the current order.
- `/footer order <key...>` sets the full left-to-right order. Keys you omit are
  appended after the ones you list, in their previous order.
- `/footer up <key>` / `/footer down <key>` move one block one step.
- `/footer reset` restores the default order.

The command autocompletes its action names and slot keys, and changes take effect
immediately (no `/reload` needed).

## Example

Run it alongside whatever footer plugins you have. For example, with
`pi-backend-start`, `pi-dsh-minimal`, and `pi-token-speed` installed, their three
statuses are rendered as three colored blocks:

<!-- screenshot of the footer -->

## Install

```bash
pi install git:github.com/zrlu/pi-colored-footer
```

Or copy this directory into `~/.pi/agent/extensions/pi-colored-footer/`.

After installing or editing, run `/reload` or restart Pi. Normal managed Pi
upgrades replace the release directory and leave this user extension intact. If
a future release changes the public footer API, update this extension rather than
patching installed bundles.

## Disable

Move this directory outside `extensions` and run `/reload`.

## Notes

The color-block row is built in `layout.ts`. The slots and their background colors
are defined there. Adding a plugin slot to `FOOTER_SLOT_COLORS` also makes it
reorderable through `/footer`; the extension fills that slot from the matching
plugin status. The built-in `stats` and `model` slots are listed in
`BUILTIN_SLOT_KEYS` and their text is computed in `index.ts` before the row is
rendered. The saved order is read and written by `config.ts`, and the interactive
reorder screen lives in `reorder.ts`.
