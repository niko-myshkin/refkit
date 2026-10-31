# Security policy

Refkit is an early beta and a local tool without authentication (see the Security section in the README).

## Reporting a vulnerability
Please report it privately through GitHub: **Security tab, "Report a vulnerability"** on this repository. Do not open a public issue for security problems.

Helpful details: what you did, what happened, your macOS and Node versions, and whether Claude Code or Codex was involved. I will reply as soon as I can; this is a one-person project, so please be patient.

## Scope
Things that matter most: other websites or programs reaching the local API, files outside the library folder being read or written, commands being run from saved content, and secrets ending up in the repository.

## Known limitations (not yet fixed)
- A saved page can contain instructions that steer the agent (prompt injection); the agent can read local files and search the web depending on your permissions.
- Saving a link makes the local server fetch it, including addresses on your local network.
- The MCP tool that saves an image from a path accepts any readable image path.
