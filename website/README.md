# Contributor documentation site

The Docusaurus site published at https://scripts.gapapp.app/ by
`.github/workflows/docs.yml` on every push to `main` that touches it.

```bash
cd website
npm install
npm start            # dev server; syncs the generated docs first
npm run build        # production build into build/; syncs first
npm run serve        # serve build/
npm run refs:check   # every GitHub code reference resolves; every image placeholder is listed
npm run sync         # copy EVENTS.md, PAGE_DISPATCH.md, BACKLOG.md into docs/reference/generated/
npm run typecheck    # the config, the sidebars and the components
```

## How the pages get their code

Code on the site is not pasted in. A fence whose meta says `reference` holds
a GitHub URL, and `@saucelabs/theme-github-codeblock` fetches those lines from
`main` when the page is viewed:

    ```ts reference title="app.gap.Tsum/src/skills/moana.ts"
    https://github.com/game-automation-platform/game-automation-scripts/blob/main/app.gap.Tsum/src/skills/moana.ts#L1-L9
    ```

No range means the whole file. Ranges drift as the code moves, so
`scripts/check-refs.js` resolves every reference against the checkout beside
the site and fails on a missing file, a range past the end, or a whole-file
reference over 200 lines. References into the catalogue repository are
checked when `../../game-automation-catalogue` exists and skipped otherwise.
Run it before a pull request and keep ranges short and anchored to small,
stable files.

## Generated pages

`docs/reference/generated/` is git-ignored and written by
`scripts/sync-docs.js` from `app.gap.Tsum/EVENTS.md`, `PAGE_DISPATCH.md` and
`BACKLOG.md`, with frontmatter and the rewrites MDX needs. `npm start` and
`npm run build` run it first. Regenerate the sources in the package
(`npm run pages:docs`, `npm run events:docs` there); never edit the copies.

## Images

`<ImagePlaceholder id="..." alt="..." />` renders a labelled box where a
screenshot belongs. `IMAGES_NEEDED.md` lists every id with what to capture;
`refs:check` keeps the list and the pages in step. The component is
registered globally in `src/theme/MDXComponents.tsx`, so pages need no import.

## Writing pages

Pages are `.md` parsed as MDX, so a few things plain Markdown allows are
errors here:

- No HTML comments (`<!-- -->`); use `{/* */}` or leave them out.
- `<br>` must be `<br />`.
- A `<word>` placeholder outside a code span (`<Publisher>`) is read as JSX —
  put it in backticks.
- `{` and `}` outside code are expressions — put them in backticks or escape
  them as `\{`.
- Link to repository files by full GitHub URL, not a relative path; relative
  links resolve against the site.
- Mermaid fences render as diagrams (`markdown.mermaid` is on).

The public-tree rule applies here as everywhere: nothing may name the private
toolkit repository or describe what it holds beyond "the development toolkit",
and nothing is copied from the host app's code.
