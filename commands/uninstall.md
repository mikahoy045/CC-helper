---
description: Remove the cc-usage status line from your Claude Code settings
allowed-tools: Bash(node:*)
---

Run the cc-usage uninstaller:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.mjs"`

Report the output to the user. If they had a previous status line before installing cc-usage, it is restored automatically.
