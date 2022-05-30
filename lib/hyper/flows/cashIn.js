
const xstate = require('xstate')
const _ = require('lodash/fp')

const actionEmitter = require('../../action-emitter')
// 进钱模式1
const KEY = 'CashInMachine'

// 登入后进入state machine
const cashInMachine = xstate.Machine({
    key: KEY,
    initial: 'idle',
    strict: true,
    states: {
        idle: {        
            onEntry: ["atmCashInCleanUpLogic"],                     // 空
            on: {
                START: 'atmWaitingLogin',
            }
        },
        atmWaitingLogin: {                  // 登入页面
            on: {
                LOGIN: { 'atmCoinInLanding': { actions: [] } },
                BACK: { "idle": { actions: ['atmMachineProcessBack'] } }
            }
        },
        atmCoinInLanding: {                  // coinin 首页
            onEntry: ["atmInitialBill", "atmTransitionCoinInLanding"],
            on: {
                SELECTCOIN: "atmPaymentAddress",
                BACK: { "atmWaitingLogin": { actions: ["atmMachineProcessBack"] } }
            }
        },
        atmPaymentAddress: {                // 等待提供地址
            onEntry: ["atmTransitionPaymentAddress", "atmStartScanQR"],
            onExit: ["atmStopScanQR"],
            on: {
                SCAN: { 'atmConfirmAddress': { actions: [] } },
                LOAD: { 'atmGetWalletAddress': { actions: [] } },
                BACK: { "atmCoinInLanding": { actions: [] } }
            }
        },
        atmGetWalletAddress: {              // 获取wallet地址
            onEntry: ["atmGetWalletCoinAddressLogic"],
            on: {
                DONE: { 'atmConfirmAddress': { actions: [] } },
            }
        },
        atmConfirmAddress: {                // 确认地址
            onEntry: ["atmTransitionConfirmAddress"],
            on: {
                CONFIRM: { 'atmInitialBillIn': { actions: [] } },
                BACK: { "atmPaymentAddress": { actions: [] } }
            }
        },
        atmInitialBillIn: {                  // 开始收币
            onEntry: ["atmTransitionInitialBillIn", "atmAcceptingFirstBill"],
            on: {
                ONBILLIN: { 'acceptingBills': { actions: ['updateBillLogic'] } },
            }
        },
        acceptingBills: {                    // 继续收币
            onEntry: [],
            on: {
                DONE: { 'atmConfirmDepositDetail': { actions: ['atmConfirmDepositDetailLogic'] } },
            }
        },
        atmConfirmDepositDetail: {           // 确认放入的价值
            onEntry: [],
            on: {
                CONFIRM: { 'atmConfirmDepositInformation': { actions: ['atmConfirmDepositInformationLogic'] } },
            }
        },
        atmConfirmDepositInformation: {       // 再确认放入的价值
            onEntry: [],
            on: {
                PLACEORDER: { 'confirmDeposit': { actions: [] } },
            }
        },
        confirmDeposit: {                     // 确认 执行买
            onEntry: ["atmConfirmDepositLogic"],
            onExit: ["atmCashInCleanUpLogic", "atmCashInSessionStartLogic"],
            on: {
                END: "idle"
            }
        },
        failure: { onEntry: [] }, // failure
    }
})

let currentStateValue
let data
let sessionCounter = null

function getData() { return data }
function setData(value) { data = value }

function setSessionCounter (callback) {
    sessionCounter = setTimeout(()=>{
        console.log("setSessionCounter")
        callback()
    }, 10000) // 10sec
}
function delSessionCounter () {
    console.log("delSessionCounter")
    clearTimeout(sessionCounter)
}

function getState() { return currentStateValue }

function start() {
    currentStateValue = cashInMachine.initialState.value
    data = null
    dispatch('START')
}

function emitAction(action) {
    actionEmitter.emit('action', action, cashInMachine)
}

const emitAllActions = _.forEach(emitAction)

function dispatch(event) {
    console.debug("dispatch ", currentStateValue, event)

    const newState = cashInMachine.transition(currentStateValue, event)
    currentStateValue = newState.value

    const actions = newState.actions
    console.log("currentStateValue", currentStateValue,  actions)
    if (!actions) { return }
    emitAllActions(actions)
}

function isInState() {
    let currentState = getState()
    if (
        currentState == undefined || currentState == 'idle' || currentState == ''
    ) {
        return false;
    }
    return true;
}

cashInMachine.dispatch = dispatch

module.exports = {
    start,
    dispatch,
    getData,
    setData,
    getState,
    isInState,
    delSessionCounter,
    setSessionCounter
}
