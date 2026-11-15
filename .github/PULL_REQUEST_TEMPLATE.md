## What changed

<!-- One paragraph. Link the issue if there is one. -->

## Why

<!-- The user-visible problem or the gap this closes. -->

## How it was verified

<!-- Commands run, plus machine or fixture used. Screenshots for UI changes. -->

```text
npm run check
appbridge doctor
```

- [ ] `npm run check` passes
- [ ] New behaviour has a test
- [ ] New tools are registered in MCP, reachable from REST/CLI, and documented in `docs/mcp-tools.md`
- [ ] No app or vendor names added to `packages/`
- [ ] Results stay honest: unverifiable actions report `verified: false` rather than `ok`
- [ ] Safety-relevant changes describe their effect class and approval path

## Known gaps

<!-- What this pull request does not cover. -->
