---
description: Install the cc-usage status line (context %, 5h/weekly usage, reset countdowns) into your Claude Code settings
allowed-tools: Bash(node:*)
---

Run the cc-usage installer:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs"`

Report the installer output to the user, including the file paths it printed.

If the installer reported that a different status line already exists, tell the user they can replace it by running `node "${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs" --force` (their existing status line is backed up and restored on uninstall). Do not run the force command yourself unless the user confirms.
