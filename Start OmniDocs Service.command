#!/bin/zsh
cd "${0:A:h}" || exit 1
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print 'Install Node.js 22.14 or newer, then launch again.'
  read '?Press Enter to close…'
  exit 1
fi
npm run service:local
result=$?
if (( result != 0 )); then
  print 'Service could not start. See the error above.'
  read '?Press Enter to close…'
fi
exit $result
