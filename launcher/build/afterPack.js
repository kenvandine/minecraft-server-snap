'use strict'

const fs = require('fs')
const path = require('path')

// Writes a custom AppRun into the app output directory so that --no-sandbox
// is baked into the AppImage. AppImages cannot have SUID binaries, so the
// Chrome sandbox can never be configured correctly and must be disabled.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return

  const executableName = context.packager.executableName
  const appRunPath = path.join(context.appOutDir, 'AppRun')

  const script = [
    '#!/bin/bash',
    'HERE="$(dirname "$(readlink -f "${0}")")"',
    `exec "\${HERE}/${executableName}" --no-sandbox "$@"`,
    '',
  ].join('\n')

  fs.writeFileSync(appRunPath, script, { mode: 0o755 })
}
