const xstate = require('xstate')
const _ = require('lodash/fp')

const actionEmitter = require('../../action-emitter')

const KEY = 'SelfCashOutMachine'

const selfCashOutMachine = xstate.Machine({
    key: KEY,
    initial: 'idle',
    strict: true,
    states: {
        idle: {
            on: {
                START: "atmWaitingLogin"
            }
        },
        atmWaitingLogin: {
            on: {
                LOGIN: { 'atmSuccessLogin': { actions: [] } },
                BACK: { "idle": { actions: ['atmMachineProcessBack'] } }
            }
        },
        atmSuccessLogin: {
            onEntry: [ "atmTransitionSelfCashOutLanding", "atmStartScanQR"],
            onExit: [],
            on: {
                SCAN: { 'atmCollectionState': { actions: ["atmCollectionActionLogic"] } },
                BACK: { "atmWaitingLogin": { actions: ['atmMachineProcessBack'] } }
        
            }
        },
        atmCollectionState: {
           // onEntry: ["wtf"],
            //onExit: ["cbf"],
            on: {
                WITHDRAW: { 'atmCollectionWithdraw': { actions: ["atmWithdrawaActionLogic"] } },
            }
        },
        atmCollectionWithdraw: {
            on: {
                onExit: ["atmCashInCleanUpLogic", "atmCashInSessionStartLogic"],
                END: "idle",
                SUCCESS: "success",
                FAIL: "failure"
            }
        },
        failure: { onEntry: [] }, // failure
        success: { onEntry: [] }, // success
    }
})

let currentStateValue
let data = {}

function getData(key) { return data[key] }
function setData(key, value) { data[key] = value }

function getState() { return currentStateValue }

function start() {
    currentStateValue = selfCashOutMachine.initialState.value
    data = {}
    dispatch('START')
}

function emitAction(action) {
    actionEmitter.emit('action', action, selfCashOutMachine)
}

const emitAllActions = _.forEach(emitAction)

function dispatch(event) {
    console.debug("dispatch ", currentStateValue, event)

    const newState = selfCashOutMachine.transition(currentStateValue, event)
    currentStateValue = newState.value

    const actions = newState.actions
    console.log("currentStateValue", currentStateValue,  actions)
    if (!actions) { return }
    emitAllActions(actions)
}

function isInState(){
    let currentState =  getState()
    if(
        currentState == undefined || currentState == 'idle' || currentState == ''
    ){
        return false;
    }
    return true;
}

selfCashOutMachine.dispatch = dispatch

module.exports = {
    start,
    dispatch,
    getData,
    setData,
    getState,
    isInState
}
