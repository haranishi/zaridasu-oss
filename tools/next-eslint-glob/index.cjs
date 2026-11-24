const { isAbsolute, parse } = require('node:path')
const { globSync } = require('tinyglobby')

// Only the API used by Next.js get-root-dirs is supported. New callers must be reviewed.
exports.globSync = (pattern, options) => {
  if (typeof pattern !== 'string' || options?.onlyDirectories !== true ||
      Object.keys(options).some((key) => key !== 'onlyDirectories')) {
    throw new TypeError('next-eslint-glob only supports globSync(string, { onlyDirectories: true })')
  }

  return globSync(pattern, {
    onlyDirectories: true,
    expandDirectories: false,
    absolute: isAbsolute(pattern),
  }).map((entry) => entry === parse(entry).root ? entry : entry.replace(/\/$/, ''))
}
