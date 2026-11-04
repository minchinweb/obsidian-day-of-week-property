# Day of Week Property

An [Obsidian](https://obsidian.md) plugin that shows a **computed, read-only row**
in the Properties panel, such as `Day of the week: Wednesday`, for notes in the
folders you choose. The note files are never modified, so nothing leaks into
exports, static-site generators, or sync.

It's meant for daily notes whose file name (or a `date` property) already holds the date,
so you don't have to maintain the weekday by hand.

## Install (BRAT)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. BRAT → *Add beta plugin* → `minchinweb/obsidian-day-of-week-property`.
3. Enable **Day of Week Property** in *Settings → Community plugins*.

## Settings

Add one or more rules. The first matching rule that produces a date wins.

| Setting | Meaning |
| --- | --- |
| Folder | Applies to notes in this folder and its subfolders. Blank = whole vault. |
| Date source | Read the date from the **file name** or from a **frontmatter property**. |
| Property name | (Property source only.) Default `date`. |
| Input date format | [Moment.js](https://momentjs.com/docs/#/parsing/string-format/) format. File names are parsed strictly (default `YYYY-MM-DD`), so notes whose names aren't dates get no row. |
| Label | The row's name. Default `Day of the week`. |
| Output format | Moment format for the value. Default `dddd` (`Wednesday`). |
| Position | Above or below the real properties. |
| Icon | A [Lucide](https://lucide.dev/icons) icon name. Default `calendar-days`. |

## Limitations

- It's display only. The row isn't a real property, so it doesn't appear in Bases, search, or
  the separate Properties sidebar view.
- Obsidian has no API for virtual properties, so the row is inserted into the page's DOM next to
  the native properties. An Obsidian or theme update could change how that looks or works.
- The row only appears for notes that already show a Properties block.

## Releasing

Set `version` in `manifest.json` and `versions.json`, commit, then push a tag with the same
name and no `v` prefix (`git tag 0.1.0 && git push --tags`). The workflow attaches `main.js`,
`manifest.json` and `styles.css` to a GitHub release, which is what BRAT installs.

## License

MIT
