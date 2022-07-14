
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
            onEntry: ["atmCleanUpLogic"],                     // 空
            on: {
                START: 'atmWaitingLogin',
            }
        },
        atmWaitingLogin: {                  // 登入页面
            on: {
                LOGIN: { 'atmCoinInLanding': { actions: [] } },
                BACK: { "idle": { actions: ['_connectedBrowser'] } }
            }
        },
        atmCoinInLanding: {                  // coinin 首页
            onEntry: ["atmInitialBill", "atmTransitionCoinInLanding"],
            on: {
                SELECTCOIN: "atmPaymentAddress",
                BACK: { "atmWaitingLogin": { actions: ["atmMachineProcessBack"] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        atmPaymentAddress: {                // 等待提供地址
            onEntry: ["atmTransitionPaymentAddress", "atmStartScanQR"],
            onExit: ["atmStopScanQR"],
            on: {
                SCAN: { 'atmConfirmAddress': { actions: [] } },
                LOAD: { 'atmGetWalletAddress': { actions: [] } },
                BACK: { "atmCoinInLanding": { actions: [] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        atmGetWalletAddress: {              // 获取wallet地址
            onEntry: ["atmGetWalletCoinAddressLogic"],
            on: {
                DONE: { 'atmConfirmAddress': { actions: [] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        atmConfirmAddress: {                // 确认地址
            onEntry: ["atmTransitionConfirmAddress", "stopEmptyBillValidator"],
            on: {
                CONFIRM: { 'atmInitialBillIn': { actions: [] } },
                BACK: { "atmPaymentAddress": { actions: [] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        atmInitialBillIn: {                  // 开始收币
            onEntry: ["atmTransitionInitialBillIn", "atmAcceptingFirstBill"],
            on: {
                ONBILLIN: { 'acceptingBills': { actions: [] } },
                BACK: {"atmConfirmAddress": {actions: []}},
                END: { "idle": { actions: ['atmAllInitialState'] } },
            },
        },
        acceptingBills: {                    // 继续收币
            onEntry: ["updateBillLogic"],
            on: {
                DONE: { 'atmConfirmDepositDetail': { actions: [] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        atmConfirmDepositDetail: {           // 确认放入的价值
            onEntry: ["atmTransitionConfirmDepositDetail"],
            on: {
                CONFIRM: { 'atmConfirmDepositInformation': { actions: [] } },
                BACK: { "acceptingBills": { actions: [] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            },
        },
        atmConfirmDepositInformation: {       // 再确认放入的价值
            onEntry: ["atmTransitionConfirmDepositInformation"],
            on: {
                PLACEORDER: { 'confirmDeposit': { actions: [] } },
                BACK: { "atmConfirmDepositDetail": { actions: [] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        confirmDeposit: {                     // 确认 执行买
            onEntry: ["atmConfirmDepositLogic"],
            onExit: ["atmCleanUpLogic"/*, "atmCashInSessionStartLogic"*/],
            on: {
                END: { "idle": { actions: ['atmAllInitialState'] } },
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
