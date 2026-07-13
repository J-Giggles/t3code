# Isolate new editing agents by default

A newly created Coding Agent that may edit code receives a semantically named isolated worktree by default. Sharing the originating writable worktree requires an explicit request and Voice Confirmation because concurrent agents can overwrite or misinterpret uncommitted changes; read-only research agents may share. This trades a small amount of setup and handoff context for predictable concurrent ownership.
