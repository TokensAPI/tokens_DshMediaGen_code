import { readFile, stat } from 'node:fs/promises'

// The client bundle (lib/client.js) is committed as a built artifact; its
// TypeScript source is not part of this repository. This step verifies the
// committed bundle is present and structurally valid instead of rebuilding it.
const info = await stat('lib/client.js')
if (!info.isFile() || info.size === 0) {
  throw new Error('lib/client.js is missing or empty; the client bundle must be committed.')
}
const source = await readFile('lib/client.js', 'utf8')
if (!source.includes('window.__ModuleLoader__.load')) {
  throw new Error('lib/client.js does not look like a DSH client bundle.')
}
console.log(`verified lib/client.js (${info.size} bytes)`)
