const {readFileSync, statSync} = require('fs')
const dotenv = require('dotenv')

function parseDotenvFile(path, verbose = false) {
  let content

  try {
    content = readFileSync(path)
  } catch (error) {
    // The env file does not exist.
    if (verbose) {
      console.error('react-native-dotenv', error)
    }

    return {}
  }

  return dotenv.parse(content)
}

function safeObjectAssign(targetObject, sourceObject, exceptions = []) {
  const keys = Object.keys(targetObject)
  for (let i = 0, length = keys.length; i < length; i++) {
    if (targetObject[keys[i]] && sourceObject[keys[i]]) {
      targetObject[keys[i]] = sourceObject[keys[i]]
    }
  }

  for (let j = 0, length = exceptions.length; j < length; j++) {
    if (sourceObject[exceptions[j]]) {
      targetObject[exceptions[j]] = sourceObject[exceptions[j]]
    }
  }

  return targetObject
}

function mtime(filePath) {
  try {
    return statSync(filePath).mtimeMs
  } catch {
    return null
  }
}

module.exports = (api, options) => {
  const t = api.types
  this.env = {}
  options = {
    envName: 'APP_ENV',
    moduleName: '@env',
    path: '.env',
    whitelist: null,
    blacklist: null,
    allowlist: null,
    blocklist: null,
    safe: false,
    allowUndefined: true,
    verbose: false,
    ...options,
  }
  const babelMode = process.env[options.envName] || (process.env.BABEL_ENV && process.env.BABEL_ENV !== 'undefined' && process.env.BABEL_ENV !== 'development' && process.env.BABEL_ENV) || process.env.NODE_ENV || 'development'
  const localFilePath = options.path + '.local'
  const modeFilePath = options.path + '.' + babelMode
  const modeLocalFilePath = options.path + '.' + babelMode + '.local'

  if (options.verbose) {
    console.log('dotenvMode', babelMode)
  }

  api.cache.using(() => mtime(options.path))
  api.cache.using(() => mtime(localFilePath))
  api.cache.using(() => mtime(modeFilePath))
  api.cache.using(() => mtime(modeLocalFilePath))

  const dotenvTemporary = Object.assign({}, process.env)
  if (options.safe) {
    const parsed = parseDotenvFile(options.path, options.verbose)
    const localParsed = parseDotenvFile(localFilePath, options.verbose)
    const modeParsed = parseDotenvFile(modeFilePath, options.verbose)
    const modeLocalParsed = parseDotenvFile(modeLocalFilePath, options.verbose)

    this.env = safeObjectAssign(Object.assign(Object.assign(Object.assign(parsed, modeParsed), localParsed), modeLocalParsed), dotenvTemporary, ['NODE_ENV', 'BABEL_ENV', options.envName])
    this.env.NODE_ENV = process.env.NODE_ENV || babelMode
  } else {
    dotenv.config({
      path: modeLocalFilePath,
      silent: true,
    })
    dotenv.config({
      path: modeFilePath,
      silent: true,
    })
    dotenv.config({
      path: localFilePath,
      silent: true,
    })
    dotenv.config({
      path: options.path,
    })
    this.env = process.env
    this.env = Object.assign(this.env, dotenvTemporary)
  }

  api.addExternalDependency(options.path)
  api.addExternalDependency(localFilePath)
  api.addExternalDependency(modeFilePath)
  api.addExternalDependency(modeLocalFilePath)

  return ({
    name: 'dotenv-import',

    pre() {
      this.opts = {
        envName: 'APP_ENV',
        moduleName: '@env',
        path: '.env',
        whitelist: null,
        blacklist: null,
        allowlist: null,
        blocklist: null,
        safe: false,
        allowUndefined: true,
        verbose: false,
        ...this.opts,
      }

      const dotenvTemporary = Object.assign({}, process.env)
      if (this.opts.safe) {
        const parsed = parseDotenvFile(this.opts.path, this.opts.verbose)
        const localParsed = parseDotenvFile(localFilePath)
        const modeParsed = parseDotenvFile(modeFilePath)
        const modeLocalParsed = parseDotenvFile(modeLocalFilePath)
        this.env = safeObjectAssign(Object.assign(Object.assign(Object.assign(parsed, modeParsed), localParsed), modeLocalParsed), dotenvTemporary, ['NODE_ENV', 'BABEL_ENV', options.envName])
        this.env.NODE_ENV = process.env.NODE_ENV || babelMode
      } else {
        dotenv.config({
          path: modeLocalFilePath,
          silent: true,
        })
        dotenv.config({
          path: modeFilePath,
          silent: true,
        })
        dotenv.config({
          path: localFilePath,
          silent: true,
        })
        dotenv.config({
          path: options.path,
        })
        this.env = process.env
        this.env = Object.assign(this.env, dotenvTemporary)
      }
    },

    visitor: {
      ImportDeclaration(path, {opts}) {
        if (path.node.source.value === opts.moduleName) {
          for (const [idx, specifier] of path.node.specifiers.entries()) {
            if (specifier.type === 'ImportDefaultSpecifier') {
              throw path.get('specifiers')[idx].buildCodeFrameError('Default import is not supported')
            }

            if (specifier.type === 'ImportNamespaceSpecifier') {
              throw path.get('specifiers')[idx].buildCodeFrameError('Wildcard import is not supported')
            }

            if (specifier.imported && specifier.local) {
              const importedId = specifier.imported.name
              const localId = specifier.local.name

              if (Array.isArray(opts.allowlist) && !opts.allowlist.includes(importedId)) {
                throw path.get('specifiers')[idx].buildCodeFrameError(`"${importedId}" was not present in allowlist`)
              } else if (Array.isArray(opts.whitelist) && !opts.whitelist.includes(importedId)) {
                console.warn('[DEPRECATION WARNING] This option is will be deprecated soon. Use allowlist instead')
                throw path.get('specifiers')[idx].buildCodeFrameError(`"${importedId}" was not whitelisted`)
              }

              if (Array.isArray(opts.blocklist) && opts.blocklist.includes(importedId)) {
                throw path.get('specifiers')[idx].buildCodeFrameError(`"${importedId}" was not present in blocklist`)
              } else if (Array.isArray(opts.blacklist) && opts.blacklist.includes(importedId)) {
                console.warn('[DEPRECATION WARNING] This option is will be deprecated soon. Use blocklist instead')
                throw path.get('specifiers')[idx].buildCodeFrameError(`"${importedId}" was blacklisted`)
              }

              if (!opts.allowUndefined && !Object.prototype.hasOwnProperty.call(this.env, importedId)) {
                throw path.get('specifiers')[idx].buildCodeFrameError(`"${importedId}" is not defined in ${opts.path}`)
              }

              const binding = path.scope.getBinding(localId)
              for (const refPath of binding.referencePaths) {
                refPath.replaceWith(t.valueToNode(this.env[importedId]))
              }
            }
          }

          path.remove()
        }
      },
      MemberExpression(path) {
        const hasEnv = key => this.env[key] !== undefined
        const getValue = key => this.env[key]

        // Input:  process.env.VARIABLE1
        // Output: "VALUE1"
        if (path.get('object').matchesPattern('process.env')) {
          const keyObject = path.toComputedKey()
          if (t.isStringLiteral(keyObject)) {
            const key = keyObject.value
            if (!hasEnv(key)) {
              return
            }

            const value = getValue(key)
            path.replaceWith(t.valueToNode(value))
          }
        }

        // Input:  const {VARIABLE1} = process.env
        // Output: const {VARIABLE1 = "VALUE1"} = process.env
        if (path.matchesPattern('process.env')) {
          const {parent} = path

          if (parent.type === 'VariableDeclarator' && parent.id.type === 'ObjectPattern') {
            for (const variable of parent.id.properties) {
              const key = variable.key.name
              if (!hasEnv(key)) {
                return
              }

              const value = getValue(key)
              variable.value = t.assignmentPattern(
                variable.value,
                t.stringLiteral(value),
              )
            }
          }
        }
      },
    },
  })
}
