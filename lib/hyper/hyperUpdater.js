'use strict';

var cp = require('child_process');
var fs = require('fs');
var zlib = require('zlib');
var async = require('async');
var cp = require('child_process');

var TIMEOUT = 120000;

var hardwareCode = process.argv[2] || 'N7G1';

var BASE = '/tmp/extract'
var PACKAGE = BASE + '/package'
// var SCRIPT_PATH =  PACKAGE + '/updatescript.js'
var ATM_PACKAGE = PACKAGE + '/ui' // whole package
var ATM_SERVER = PACKAGE + '/server' // keep file structure

function report(err, cb) {
  console.log('> report', err);
  if (!cb && typeof (err) === 'function') {
    cb = err;
    err = null;
  }

  fs.writeFileSync('log', err)

  try {
    require('./report').report(err, 'finished.', cb);
  } catch (err) {
    cb(err);
  }
}

function command(cmd, cb) {
  cp.exec(cmd, { timeout: TIMEOUT }, function (err, stdout, stderr) {
    console.log('> ' + cmd);
    if (err && stderr) err.stderr = stderr;
    cb(err);
  });
}

function installDebs(cb) {
  async.series([
    async.retry(2, async.apply(command, 'apt install -y libopencv-core2.4 libopencv-highgui2.4 libopencv-imgproc2.4 libopencv-video2.4 libopencv-features2d2.4 libopencv-objdetect2.4')),
  ], cb);
}

// - after get the package // done in another process
// - start maintenece page
// - stop 3 supervisor service
// - copy browser to directory
// - copy update file to lamassu machine
// - start 3 supervisor service

// 
async function startMaintainence (){
  const command = 'supervisorctl restart hyper-browser'
  await new Promise((resolve, reject)=>{
    cp.execFile(command, [], {}, function (msg) {
      console.log(msg)
      return resolve()
      
    })
  })
}

async function stopService (){

  let command = 'supervisorctl stop hyper-browser'
  await new Promise((resolve, reject) => {
    cp.execFile(command, [], {}, function (msg) {
      console.log(msg)
      return resolve()

    })
  })

  command = 'supervisorctl stop hyper-machine'
  await new Promise((resolve, reject) => {
    cp.execFile(command, [], {}, function (msg) {
      console.log(msg)
      return resolve()

    })
  })
}

async function prpareBrowser(){

  async.series([
    async.apply(command, `cp ${ATM_PACKAGE} ${applicationParentFolder}/hyper-browser/`),
    // report
    //async.apply(report, null, 'finished.')
    async.apply(command, `cp ${ATM_SERVER} ${applicationParentFolder}/hyper-server/`), // only replace file exsit
    // report
  ], function (err){

  })
}

async function startService(){
 let command = 'supervisorctl start hyper-browser'
  await new Promise((resolve, reject) => {
    cp.execFile(command, [], {}, function (msg) {
      console.log(msg)
      return resolve()

    })
  })

  command = 'supervisorctl start hyper-machine'
  await new Promise((resolve, reject) => {
    cp.execFile(command, [], {}, function (msg) {
      console.log(msg)
      return resolve()

    })
  })
}



async.series([
  async.apply(startMaintainence),
  // report
  async.apply(stopService),
  // report
  async.apply(report),
  //report
  async.apply(prpareBrowser),
  // report
  async.apply(startService)
], function (err) {
  async.series([
    async.apply(report, err),
  ], function (err2) {
    if (err2) throw err2;
    else throw err;
  });
});
