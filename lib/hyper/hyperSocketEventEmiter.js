

var events = require('events');
var socketEventEmitter = new events.EventEmitter();

const socketProcessEvent = function (brain, req) {
  console.debug("socketProcessEvent", req,)

  switch (req.command) {
    case 'atm_order':
      socketEventEmitter.emit("atm_order", req)
      break;
    case 'machine_control':
      if (req.body && req.body.action) {
        switch (req.body.action) {
          case 'unpair':
            console.log("todo machine_control unpair ")
            //this.trader.emit("unpair")
            break;
          case 'reboot':
            console.log("todo machine_control reboot ")
            brain.trader.emit("reboot")
            break;
          case 'shutdown':
            console.log("todo machine_control shutdown ")
            brain.trader.emit("shutdown")
            break;
          case 'restartServices':
            console.log("todo machine_control restart ")
            this.trader.emit("restartServices")
            break;
          default: 
            console.log(`Sorry, action unknown ${req.body.action}`);
          brain.socket.send(JSON.stringify({"command":"device_status","code":0,}))
        }
      }
      break;
    default:
      console.log(`Sorry, action unknown ${req.command}`);
  }

  if (req.command == "atm_order") {

  } else if (req.command == "machine_control") {
    if (req.body && req.body.action == "") {

    }
  }
}

const socketWatchEvent = function (event, callback) {
  const listener = function (data) {
    callback(data)
    socketEventEmitter.removeAllListeners(event)
  }

  socketEventEmitter.addListener(event, listener)
}

const clearSocketWatchEvent = function (event) {
  socketEventEmitter.removeAllListeners(event)
}

module.exports = { socketEventEmitter, socketProcessEvent, socketWatchEvent, clearSocketWatchEvent }

