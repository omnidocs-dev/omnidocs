#!/bin/zsh
cd "${0:A:h}" || exit 1
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print 'Install Node.js 22.14 or newer, then run this launcher again.'
  read '?Press Enter to close…'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm install || exit 1
fi
print 'Starting OmniDocs Studio at http://127.0.0.1:4174'
npm run studio
