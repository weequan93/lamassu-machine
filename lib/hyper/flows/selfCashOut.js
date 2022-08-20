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
            onEntry: ["atmCleanUpLogic"],
            on: {
                START: "atmWaitingLogin"
            }
        },
        atmWaitingLogin: {
            onEntry: ["atmStopScanQR", "atmTransitionLogin"],
            on: {
                LOGIN: { 'atmSelfCashOutLanding': { actions: [] } },
                BACK: { "idle": { actions: ["_connectedBrowser"] } },
            }
        },
        atmSelfCashOutLanding: {
            onEntry: [ "atmTransitionSelfCashOutLanding", "atmStartScanQR"],
            on: {
                SCAN: { 'atmCollectionState': { actions: [] } },
                BACK: { "atmWaitingLogin": { actions: ["atmMachineProcessBack"] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
        
            },
            onExit: ["atmStopScanQR"]
        },
        atmCollectionState: {
            onEntry: ["atmCollectionActionLogic"],
            on: {
                WITHDRAW: { 'atmCollectionWithdraw': { actions: [] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
                ERROR_TRANSACTION: "atmErrorTransaction"
            }
        },
        atmErrorTransaction: {
            onEntry: ["atmErrorTransactionLogic"],
            on: {
                // retry ? no need start over from new whole selfcashout state
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        atmCollectionWithdraw: {
            onEntry: ["atmWithdrawaActionLogic"],
            on: {
                END: { "idle": { actions: ['atmAllInitialState'] } },
            },
            onExit: ["atmCleanUpLogic"]
        }
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
