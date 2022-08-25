
'use strict'

var cp = require('child_process')

var BASE = '/tmp/extract'
var PACKAGE = BASE + "/package"
var INSTALLED = "/opt"

const NeeedNpmInstall = false

function frontend() {
  return new Promise((resolve) => {
    const cmd = `rm ${INSTALLED}/hyper-browser/build.zip`
    console.log(cmd)
    cp.exec(cmd, null, function () {
      return resolve()
    })
  }).then(() => {
    return new Promise((resolve) => {
      const cmd = `rm -rf ${INSTALLED}/hyper-browser/build`
      console.log(cmd)
      cp.exec(cmd, null, function () {
        return resolve()
      })
    })
  }).then(() => {
    return new Promise((resolve) => {
      const cmd = `cp ${PACKAGE}/build.zip ${INSTALLED}/hyper-browser`
      console.log(cmd)
      cp.exec(cmd, null, function () {
        return resolve()
      })
    })
  }).then(() => {
    return new Promise((resolve) => {
      const cmd = `unzip -o ${INSTALLED}/hyper-browser/build.zip -d ${INSTALLED}/hyper-browser`
      console.log(cmd)
      cp.exec(cmd, null, function () {
        return resolve()
      })
    })
  }).then(() => {
    return new Promise((resolve) => {
      const cmd = 'supervisorctl restart hyper-machine-browser hyper-browser'
      console.log(cmd)
      cp.exec(cmd, null, function () {
        return resolve()
      })
    })
  })
}

function hyperMachine() {
  return new Promise((resolve, reject) => {
    const cmd = `cp -fR ${PACKAGE}/hyper-machine/* ${INSTALLED}/hyper-machine`
    console.log(cmd)
    cp.exec(cmd, null, function () {
      return resolve()
    })
  })
}

function start() {
  frontend().then(() => {
    return hyperMachine();
  }).then(() => {
    return new Promise((resolve, reject) => {
      const cmd = 'supervisorctl restart hyper-janitor hyper-machine'
      console.log(cmd)
      cp.exec(cmd, null, function () {
        return resolve()
      })
    })
  })
}

start();