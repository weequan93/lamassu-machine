const path = require('path')
const fs = require('fs-extra')
const fullPath = process.cwd() + "/device_config.json"
// const deviceConfig = require('../device_config.json')
const deviceConfig =  fs.readJsonSync(fullPath);

module.exports = path.resolve(process.cwd(), deviceConfig.brain.dataPath)
