const path = require('path')
const fs = require('fs')
const uuid = require('uuid')

const dataPath = require('./lib/data-path')
const txFolder = dataPath + "/" + "tx-hyperdb"

function janitorJob(){
  fs.readdir(txFolder, function(err, files) {
    files.forEach(function(file, index) {
      fs.stat(path.join(txFolder, file), function(err, stat) {
        var endTime, now;
        if (err) {
          return console.error(err);
        }
        now = new Date().getTime();
        endTime = new Date(stat.ctime).getTime() + 604800000;
        if (now > endTime) {
          fs.unlink(path.join(txFolder, file), function(err) {
            if (err) {
              return console.error(err);
            }
            console.log('successfully deleted path = ',path.join(txFolder, file));
          });
        }
      });
    });
  });
}

setInterval(()=>{
  janitorJob() 
  console.debug("running = janitorJob")
}, 1000 * 60 *5)

janitorJob() 