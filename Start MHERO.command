#!/bin/zsh
set -e
cd "${0:A:h}"
ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
  NODE="$PWD/runtime/node-arm64/bin/node"
else
  NODE="$PWD/runtime/node-x64/bin/node"
fi
if [[ ! -x "$NODE" ]]; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  NODE="$(command -v node || true)"
fi
if [[ -z "$NODE" || ! -x "$NODE" ]]; then
  print 'Node.js is missing. Use the complete offline package or install Node.js 22.13+.'
  read '?Press Return to close.'
  exit 1
fi
if ! "$NODE" --no-warnings --input-type=module -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) process.exit(1);
  await import("node:sqlite");
'; then
  print 'This app needs Node.js 22.13+ with built-in SQLite. Install a compatible Node.js version or use the complete offline package.'
  read '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules/express ]]; then
  print 'Dependencies are missing. Use the complete offline package, or run npm ci once with internet.'
  read '?Press Return to close.'
  exit 1
fi
print '\nMHERO · Local registration\nUse the addresses below on the host Mac and tablets.\nPress Control+C to stop. Keep this window open during the event.\n'
exec /usr/bin/caffeinate -i "$NODE" server.js
