
'use strict'

var cp = require('child_process')

var BASE = '/tmp/extract'
var PACKAGE = Base + "/package"
var INSTALLED = "/opt"

const NeeedNpmInstall = false

function frontend(){
  return new Promise((resolve)=>{
    cp.exec(`rm ${INSTALLED}/hyper-browser/build.zip`, null, function(){
      return resolve()
    })
  }).then(()=>{
    return new Promise((resolve) => {
      cp.exec(`rm -rf ${INSTALLED}/hyper-browser/build`, null, function () {
        return resolve()
      })
    })
  }).then(() => {
    return new Promise((resolve) => {
      cp.exec(`cp ${PACKAGE}/build.zip ${INSTALLED}/hyper-browser`, null, function () {
        return resolve()
      })
    })
  }).then(() => {
    return new Promise((resolve) => {
      cp.exec(`unzip ${INSTALLED}/hyper-browser/build.zip`, null, function () {
        return resolve()
      })
    })
  }).then(()=>{
    return new Promise((resolve) => {
      cp.exec('supervisorctl restart hyper-browser-server hyper-browser', null, function () {
        return resolve()
      })
    })
  })
}

function hyperMachine(){
  return new Promise((resolve, reject)=>{
    cp.exec(`cp -fR ${PACKAGE}/hyper-machine/* ${INSTALLED}/hyper-machine`, null, function () {
      return resolve()
    })
  })
}

function start(){
  frontend().then(()=>{
    return hyperMachine();
  }).then(()=>{
    cp.exec('supervisorctl restart hyper-janitor hyper-server hyper-updater hyper-watchdog', null, function () {
      return resolve()
    })
  })
}

start();