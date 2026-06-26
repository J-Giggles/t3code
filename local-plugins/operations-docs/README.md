# Jordan Patch-Stack Maintenance Workflow

## Purpose

Document the local replay stack, promotion rules, and staging review order for future upstream refreshes.

## Current Commits

- `1700400eeef985e3f4c16473dbb7b95357de3c48` `docs(operations): document Jordan patch-stack maintenance workflow`

## Squash / Replay History

This docs topic stays late in the replay stack because it records the preceding topic order and verification rules.

## Added Features

- Operational ledger for the Jordan topic stack.
- Staging review guide for topic-by-topic review.
- Agent instructions for worktree topology and promotion constraints.

## Added UI

- No product UI.

## Added Server And Runtime Behavior

- No runtime behavior.

## Added Tests

- Documentation-only topic; validation is covered by standard repo checks.

## Component Entrypoints

Componentization status: `not-applicable`. This topic is documentation-only and owns no runtime entrypoint.

## Integration Points

- `AGENTS.md`
- `docs/operations/jordan-topic-stack.md`
- `docs/operations/staging-review-guide.md`

## Focused Implementation Snippets

`docs/operations/jordan-topic-stack.md`

```md
Current topic order:

1. remote-access
2. dev-launch
   ...
```

## Replay Notes

Replay after all product and test topics so the ledger can describe the final stack accurately.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Keep this plugin README and manifest synchronized whenever the docs topic is rewritten.
