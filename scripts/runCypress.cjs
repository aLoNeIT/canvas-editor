const { spawn } = require('node:child_process')
const path = require('node:path')

const args = process.argv.slice(2)
const env = { ...process.env }

delete env.ELECTRON_RUN_AS_NODE

const cypressPackageJson = require.resolve('cypress/package.json')
const cypressBin = path.join(path.dirname(cypressPackageJson), 'bin', 'cypress')
const child = spawn(process.execPath, [cypressBin, ...args], {
  stdio: 'inherit',
  env
})

child.on('error', error => {
  console.error(error)
  process.exit(1)
})

child.on('exit', code => {
  process.exit(code ?? 1)
})
