

var events = require('events');
var socketEventEmitter = new events.EventEmitter();

const socketProcessEvent = function(req){
  console.debug("socketProcessEvent", req,)
  if(req.command == "atm_order"){
    socketEventEmitter.emit("atm_order", req)
  }
}

const socketWatchEvent = function(event, callback){
  const listener = function(data){
    callback(data)
    socketEventEmitter.removeAllListeners(event)
  }

  socketEventEmitter.addListener(event, listener)
}

const clearSocketWatchEvent = function (event){
  socketEventEmitter.removeAllListeners(event)
}

module.exports = { socketEventEmitter, socketProcessEvent,socketWatchEvent,clearSocketWatchEvent }

