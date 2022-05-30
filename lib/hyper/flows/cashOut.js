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
        idle: {                             // 空
            on: {
                START: "atmWaitingLogin"
            }
        },
        atmWaitingLogin: {                  // 登入页面
            on: {
                LOGIN: { 'atmCashOutLanding': { actions: [] } },
                BACK: { "idle": { actions: ['atmMachineProcessBack'] } }
            }
        },
        atmCashOutLanding: {                // cashout 首页
            onEntry: ["atmTransitionCashOutLanding"],
            on: {
                SELECTAMOUNT: { 'chooseWithdrawalAmount': { actions: [] } },
                BACK: { "atmWaitingLogin": { actions: ['atmMachineProcessBack'] } }
            }
        },
        chooseWithdrawalAmount: {           // 选择 提出数量
            onEntry: ["atmTransitionSelectWithdrawAmount"],
            //onExit: ["cbf"],
            on: {
                CONFIRMAMOUNT: { 'paymentSellCurrency': { actions: [] } },
                //LOAD: { 'atmConfirmAddress': { actions: ["atmGetWalletCoinAddressLogic"] } },
                BACK: { "atmCashOutLanding": { actions: ['atmMachineProcessBack'] } }
                //FAIL: 'failure'
            }
        },
        paymentSellCurrency: {              // 卖交易成功 等待下单
            onEntry: ["atmSellOrderLogic"],
            on: {
                 BACK: { "chooseWithdrawalAmount": { actions: ['atmMachineProcessBack'] } }
            }
        },

        print: {
            on: {
                FINISH: {'paymentSellCurrency': {actions: []}}
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
