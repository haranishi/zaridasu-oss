const { isAbsolute, resolve } = require('node:path')
const { globSync, convertPathToPattern } = require('tinyglobby')
const picomatch = require('picomatch')

// Only @node-minify/utils wildcards.js is reviewed. Do not expand this contract implicitly.
exports.globSync = (patterns, options) => {
  const inputs = typeof patterns === 'string' ? [patterns] : patterns
  if (!Array.isArray(inputs) || inputs.some((pattern) => typeof pattern !== 'string') ||
      !options || Object.keys(options).some((key) => key !== 'ignore') ||
      (options.ignore !== undefined && (!Array.isArray(options.ignore) ||
        options.ignore.some((pattern) => typeof pattern !== 'string')))) {
    throw new TypeError('node-minify-glob only supports globSync(string | string[], { ignore?: string[] })')
  }

  const negative = inputs.filter((pattern) => pattern.startsWith('!') && pattern[1] !== '(')
  const positive = inputs.filter((pattern) => !negative.includes(pattern))
  // fast-glob matches relative exclusions against the returned path, absolute ones against its resolved path.
  const ignored = [...(options.ignore ?? []), ...negative.map((pattern) => pattern.slice(1))]
  const absoluteIgnored = ignored.filter(isAbsolute)
  const relativeIgnored = ignored.filter((pattern) => !isAbsolute(pattern))
  const matchesAbsoluteIgnore = picomatch(absoluteIgnored, { dot: true, posix: true })
  const matchesRelativeIgnore = picomatch(relativeIgnored, { dot: true, posix: true })
  // Retain each pattern's path form, including mixed absolute/relative arrays.
  return [...new Set([false, true].flatMap((absolute) => {
    const matching = positive.filter((pattern) => isAbsolute(pattern) === absolute)
    return matching.length === 0 ? [] : globSync(matching, {
      // Only use cwd-relative exclusions for pruning when they cannot over-exclude absolute results.
      ignore: [...absoluteIgnored, ...relativeIgnored.filter((pattern) => !absolute || pattern.startsWith('**/'))],
      absolute,
      expandDirectories: false,
    })
  }))].filter((entry) => !matchesRelativeIgnore(entry) && !matchesAbsoluteIgnore(resolve(entry)))
}

exports.convertPathToPattern = convertPathToPattern
