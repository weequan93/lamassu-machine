const xstate = require('xstate')
const _ = require('lodash/fp')

const actionEmitter = require('../../action-emitter')
// 写单
const KEY = 'CashOutMachine'

const cashOutMachine = xstate.Machine({
    key: KEY,
    initial: 'idle',
    strict: true,
    states: {
        idle: {         
            onEntry: ["atmCleanUpLogic"],                    // 空
            on: {
                START: "atmWaitingLogin"
            }
        },
        atmWaitingLogin: {                  // 登入页面
            on: {
                LOGIN: { 'atmCashOutLanding': { actions: [] } },
                BACK: { "idle": { actions: ['_connectedBrowser'] } },
            }
        },
        atmCashOutLanding: {                // cashout 首页
            onEntry: ["atmTransitionCashOutLanding"],
            on: {
                SELECTAMOUNT: { 'chooseWithdrawalAmount': { actions: [] } },
                BACK: { "atmWaitingLogin": { actions: ['atmMachineProcessBack'] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        chooseWithdrawalAmount: {           // 选择 提出数量
            onEntry: ["atmTransitionSelectWithdrawAmount"],
            on: {
                CONFIRMAMOUNT: { 'paymentSellCurrency': { actions: [] } },
                BACK: { "atmCashOutLanding": { actions: ['atmMachineProcessBack'] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            }
        },
        paymentSellCurrency: {              // 卖交易成功 等待下单
            onEntry: ["atmSellOrderLogic"],
            on: {
                BACK: { "chooseWithdrawalAmount": { actions: ['atmMachineProcessBack'] } },
                UPDATE: { "paymentSellCurrency": { actions: [] } },
                END: { "idle": { actions: ['atmAllInitialState'] } },
            },
            onExit: ["stopATMTraderPolling"]
        },
        failure: { onEntry: [] }, // failure
    }
})

let currentStateValue
let data = {}

function getData(key) { return data[key] }
function setData(key, value) { data[key] = value }

function getState() { return currentStateValue }

function start() {
    currentStateValue = cashOutMachine.initialState.value
    data = {}
    dispatch('START')
}

function emitAction(action) {
    actionEmitter.emit('action', action, cashOutMachine)
}

const emitAllActions = _.forEach(emitAction)

function dispatch(event) {
    console.debug("dispatch ", currentStateValue, event)

    const newState = cashOutMachine.transition(currentStateValue, event)
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

cashOutMachine.dispatch = dispatch

module.exports = {
    start,
    dispatch,
    getData,
    setData,
    getState,
    isInState
}
