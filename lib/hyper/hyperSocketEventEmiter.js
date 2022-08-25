

var events = require('events');
var socketEventEmitter = new events.EventEmitter();

const socketProcessEvent = function (brain, req) {
  console.debug("socketProcessEvent", JSON.stringify(req))

  switch (req.command) {
    case 'atm_log':
      break;
    case 'device_status':
      break;
    case 'atm_order':
      socketEventEmitter.emit("atm_order", req)
      break;
    case 'machine_control':
      if (req.body && req.body.action) {
        switch (req.body.action) {
          case 'unpair':
            console.log("before fire machine_control unpair ")
            //this.trader.emit("unpair")
            break;
          case 'reboot':
            console.log("before fire machine_control reboot ")
            brain.atmTrader.emit("reboot")
            break;
          case 'shutdown':
            console.log("before fire machine_control shutdown ")
            brain.atmTrader.emit("shutdown")
            break;
          case 'restart':
            console.log("before fire machine_control restart ")
            this.atmTrader.emit("restartServices")
            break;
          case 'restartServices':
            console.log("before fire machine_control restart ")
            this.atmTrader.emit("restartServices")
            break;
          default: 
            console.log(`Sorry, action unknown ${req.body.action}`);
            brain.socket.send(JSON.stringify({ "command":"machine_control","code":0,}))
        }
      }
      break;
    default:
      console.log(`Sorry, action unknown ${req.command}`);
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

