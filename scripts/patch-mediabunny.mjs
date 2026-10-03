import { patchMediabunny } from './lib/mediabunny-patch.mjs'

const changed = await patchMediabunny(process.cwd())
console.info(`Mediabunny 1.55.6 AAC clock/span patch verified; ${changed} files corrected.`)
