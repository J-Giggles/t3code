---
module-name: "T3 Code Local"
description: "Dual-worktree Omarchy setup for dogfooding T3 Code (main live app + staging development)."
related-modules:
  - name: T3 Code Main
    path: ./t3code
  - name: T3 Code Staging
    path: ./t3code-staging
architecture:
  style: "Monorepo fork with two git worktrees and isolated Electron user data"
  components:
    - name: apps/server
      description: "WebSocket + Codex app-server broker"
    - name: apps/web
      description: "React/Vite UI"
    - name: apps/desktop
      description: "Electron shell loading Vite in dev"
    - name: packages/contracts
      description: "Shared schemas and protocol types"
  patterns:
    - name: "Dual desktop launchers"
      usage: "Walker entries t3code-local-main / t3code-local-staging with separate T3CODE_HOME trees"
    - name: "Staging-first development"
      usage: "Product changes on staging branch; main is live coding"
---

# T3 Code Local

## Layout

- `t3code/` — **main** worktree (live coding app)
- `t3code-staging/` — **staging** worktree (T3 Code product development)
- `.agents/scripts/` — agent launch, verify, and context refresh
- `.cursor/rules/` — workspace rules for Cursor agents

## Quick agent commands

```bash
./.agents/scripts/t3-launch.sh staging --wait
./.agents/scripts/t3-verify.sh staging --screenshot /tmp/t3.png
./.agents/scripts/refresh-project-context.sh
```

## Deeper detail

See `.context/docs.md` and generated maps under `.context/` after running `refresh-project-context.sh`.
