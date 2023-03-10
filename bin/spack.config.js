/* eslint-disable require-jsdoc */
const path = require('path')
const fs = require('fs')

class FileUtils {
  /**
     *
     * @param {string} file
     * @return { string[] }
     */
  static readdir(file) {
    return new Promise((resolve, reject) => {
      fs.readdir(file, (err, files) => {
        if (err) {
          reject(err)
        } else {
          resolve(files)
        }
      })
    })
  }

  static exists(file) {
    return new Promise((resolve) => {
      fs.exists(file, resolve)
    })
  }
}

const getLocalConfigs = async () => {
  const workdir = process.cwd()
  const root = path.dirname(path.dirname(require.main.filename))
  const srcFolder = path.join(workdir, 'src')
  const subfolders = (await FileUtils.exists(srcFolder)) ? (await FileUtils.readdir(srcFolder)) : []
  const frameworks = await FileUtils.readdir(path.join(root, 'frameworks'))
  const entries = {}
  let localCfg
  const localCfgFile =
    process.env.SPACK_CONFIG_FILE || './.spack.config.js'
  if (localCfgFile && (await FileUtils.exists(localCfgFile))) {
    try {
      localCfg = require(localCfgFile)
    } catch {
      console.log(`Config File Error: ${localCfgFile}`)
    }
  }
  for (const subfolder of subfolders) {
    let indexFile
    let template
    let extractCss = false
    const includeTemplate = false
    let monolith = true
    for (const fm of frameworks) {
      const file = path.join(srcFolder, subfolder, `${fm}-app.html`)
      if (await FileUtils.exists(file)) {
        indexFile = file
        template = path.join(root, `frameworks/${fm}/index.html`)
        break
      }
    }
    if (!indexFile) {
      continue
    }
    entries[subfolder] = Object.assign(
      { path: indexFile, template, extractCss, monolith, includeTemplate },
      localCfg && localCfg.entries && localCfg.entries[subfolder]
    )
  }
  const dist = (localCfg && localCfg.dist) || 'dist'
  const templates = path.join(root, 'templates')
  return {
    libsRoot: path.join(root, 'libs'),
    templates,
    defaultTemplate: (await FileUtils.readdir(templates))[0],
    cd: (localCfg && localCfg.cd) || {},
    dist,
    entries,
    output: localCfg?.output || {
      path: path.join(workdir, dist),
      filename: '[name]'
    }
  }
}

module.exports = getLocalConfigs()