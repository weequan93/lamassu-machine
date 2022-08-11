
'use strict';

const Tx = require('./hyperTx')

const _ = require('lodash/fp')
const minimist = require('minimist')
const semver = require('semver')
const deviceConfig = require('../../device_config.json')
const actionEmitter = require('../action-emitter')
const commandLine = minimist(process.argv.slice(2))
const BN = require('../bn')
const cashInMachine = require('./flows/cashIn')
const cashOutMachine = require('./flows/cashOut')
const selfCashOutMachine = require('./flows/selfCashOut')
const facephoto = require('../compliance/flows/facephoto')
const pairing = require('../pairing')
const POLL_INTERVAL = commandLine.pollTime || 5000
const hyperError = require('./hyperError')
const uuid = require('uuid')

const BILL_ACCEPTING_STATES = ['billInserted', 'billRead', 'acceptingBills',
    'acceptingFirstBill', 'maintenance']


let transitionTime
var Brain = require('../brain')



const HyperBrain = function (config) {
    Brain.call(this, config);
    this.hyperATMServer(this)
    this.hyperATMSocket(this)

    // init socket event
}


HyperBrain.prototype = Object.create(Brain.prototype);
HyperBrain.prototype.constructor = Brain;

require('./hyperBrainServer')(HyperBrain)
require('./hyperBrainEventProcessing')(HyperBrain)
require('./hyperBrainTransition')(HyperBrain)

HyperBrain.prototype.atmEnd = function () {
    if (cashInMachine.isInState()) {
        cashInMachine.dispatch("END")
    } else if (selfCashOutMachine.isInState()) {
        selfCashOutMachine.dispatch("END")
    } else if (cashOutMachine.isInState()) {
        cashOutMachine.dispatch("END")
    }

}

// hyper start scan address
HyperBrain.prototype.atmStartScanQR = function atmStartScanQR() {
    if (this.hasNewScanBay()) this.scanBayLightOn()
    const self = this
    this.scanner.atmStartScanQR((err, address) => {
        this.scanBayLightOff()
        if (err) {
            this.emit('error', err)
        }
        if (address) {
            this._handleScan(address)
            console.log("selfCashOutMachine.", selfCashOutMachine.isInState(), address)
            if (selfCashOutMachine.isInState() == true) {
                selfCashOutMachine.setData('address', address)
                selfCashOutMachine.dispatch('SCAN')
            } else {
                self.atmTrader.updateTx({ toAddress: address })
                cashInMachine.dispatch('SCAN')
                // emit respond
                //this.browser().send({ action: 'atmStartScanQR', address: address })
            }
        }
    })
}

// hyper stop scan address
HyperBrain.prototype.atmStopScanQR = function () {
    if (this.hasNewScanBay()) this.scanBayLightOff()
    this.scanner.cancel()
}

HyperBrain.prototype.atmWithdraw = function (data) {
    const self = this;
    selfCashOutMachine.dispatch("WITHDRAW")

}

HyperBrain.prototype.heartBeat = function(){

    const networkHeartBeat = this.networkHeartbeat()
    const downloadSpeed = this.checkDownloadSpeed()

    const dataSend = { ...networkHeartBeat, ...downloadSpeed }

    console.debug("=== downloadSpeed", downloadSpeed)
    console.debug("=== networkHeartBeat", networkHeartBeat)
    this.socket.emit('device_status', dataSend);
}

HyperBrain.prototype.atmInitialBill = function (data = { "cryptoCode": "BTC", "direction": "cashIn" }) {
    this.tx = Tx.update(this.tx, data)
}

HyperBrain.prototype.atmTraderRun = function () {
    this.pollHandle = setInterval(() => {
        this.atmTrader.poll()
    }, POLL_INTERVAL)
    return this.atmTrader.poll()
}


HyperBrain.prototype.atmSendSMS = function (data) {
    const self = this;
    // cast
    this.atmTrader.sendSms(data).then((respond) => {
        if (respond.statusCode == 200 && respond.body.code == 0) {
            self.atmTrader.updateProfile(
                {
                    smsVerification: {
                        phone_area: data.phone_area, phone_number: data.phone_number
                    }
                }
            )

            self.atmTransitionVerifySMS()
        }
    }).catch((err) => {
        self.atmError(err.response.body, err)
    })

}

HyperBrain.prototype.atmVerifySMS = function (data) {
    const self = this;

    const smsProfile = self.atmTrader.profile.smsVerification
    if (!smsProfile) {
        // reject -> redirect
        self.atmError(hyperError.errMsg["atmVerifyZeroProfileErr"], { message: "SMS profile missing" })
        return
    }

    self.atmTrader.getLoginTokenBySms({ ...smsProfile, verify_code: data.verify_code }).then((respond) => {
        if (respond.statusCode == 200 && respond.body.code == 0) {
            // reset smsVerification profile
            self.atmTrader.updateProfile(
                {
                    smsVerification: null
                }
            )
            actionEmitter.emit('action', 'atmSuccessLogin')
        }
    }).catch((err) => {
        self.atmError(err.response.body, err)
    })
}

HyperBrain.prototype.atmLog = function () {
    console.log("atmLog")
}

HyperBrain.prototype.atmProcessBack = function () {
    console.debug("cashInMachine", cashInMachine.getState())
    console.debug("cashOutMachine", cashOutMachine.getState())
    console.debug("selfCashOutMachine", selfCashOutMachine.getState())
    if (cashInMachine.isInState() == true) {
        cashInMachine.dispatch("BACK")
    } else if (cashOutMachine.isInState() == true) {
        cashOutMachine.dispatch("BACK")
    } else if (selfCashOutMachine.isInState() == true) {
        selfCashOutMachine.dispatch("BACK")
    } else if (this.state == 'atmLogin') {
        this._chooseCoinScreen(this)
    } else if (this.state == 'atmVerifySMS') {
        this.atmTrader.reset()
        this.atmTransitionLogin()
    } /*else if (this.state == 'atmSuccessLogin' || this.state == 'atmbuy' || this.state == 'atmSell' || this.state == '') {
        this.atmTrader.reset()
        this.atmTransitionLogin()
    }*/else {
        this.atmTrader.reset()
        this.atmTransitionLogin()
    }
    console.log("Back button clicked from ->", this.state)
    return
}

HyperBrain.prototype.atmChooseBuyCoin = function (data) {
    console.debug("atmChooseBuyCoin", this.tx.id)
    // update atm trader
    this.atmTrader.updateTx(data)
    // if kyc go kfc
    // else go
    cashInMachine.dispatch("SELECTCOIN")

}

HyperBrain.prototype.atmGetWalletCoinAddress = function () {
    cashInMachine.dispatch("LOAD")
}

HyperBrain.prototype.atmInitialWithdraw = function (data) {
    this.tx = Tx.update(this.tx, data)
    this.browser().send({ cryptoCode: data.cryptoCode })
    this.sendRates()
    this.startScreen()
}

HyperBrain.prototype.atmAllInitialState = function(data){
    this.atmEnd()
}

HyperBrain.prototype.atmMachineProcessBack = function () {
    const cashInState = cashInMachine.getState();
    if (cashInState == 'atmWaitingLogin') {
        this.atmTrader.reset()
        this.atmTransitionLogin()
        return
    }

    console.debug("cashInMachine > ", cashInMachine.getState())

    const cashOutState = cashOutMachine.getState();
    if (cashOutState == 'atmWaitingLogin') {
        this.atmTrader.reset()
        this.atmTransitionLogin()
        return
    }
    if (cashOutState == 'atmCashOutLanding') {
        this.atmSuccessLoginLogic()
        return
    }

    console.debug("cashOutMachine > ", cashOutMachine.getState())
    console.debug("selfCashOutMachine > ", selfCashOutMachine.getState())
    const selfCashOutState = selfCashOutMachine.getState()
    if (selfCashOutState == 'atmWaitingLogin') {
        this.atmTrader.reset()
        this.atmStopScanQR();
        this.atmTransitionLogin()
    }
    if (selfCashOutState == 'atmSuccessLogin') {
        this.atmStartScanQR();
        this.atmSuccessLoginLogic()
        return
    }
    console.debug("selfCashOutMachine > ", selfCashOutMachine.getState())
}

HyperBrain.prototype.atmConfirmAddress = function (data) {
    // update chain
    // update toAddress
    this.tx.toAddress = data.toAddress
    this.atmTrader.updateTx({ chain: data.chain })
    cashInMachine.dispatch("CONFIRM")
}

HyperBrain.prototype.atmGetWalletCoinAddressLogic = function () {
    const self = this
    return self.atmTrader.getCoinAddress({
        coin: self.atmTrader.tx.coinname.toLowerCase()
    }).then((respond) => {
        self.tx.toAddress = respond.body.data.address
        self.atmTrader.updateTx({ toAddress: respond.body.data.address })
        cashInMachine.dispatch("DONE")
    })
}




HyperBrain.prototype.atmConfirmDepositDetail = function () {
    cashInMachine.dispatch("DONE")
}

HyperBrain.prototype.atmConfirmDepositInformation = function () {
    cashInMachine.dispatch("CONFIRM")
}

HyperBrain.prototype.atmConfirmDeposit = function () {
    cashInMachine.dispatch("PLACEORDER")
}

HyperBrain.prototype.atmChooseSellCoin = function (data) {
    // update atm trader
    this.atmTrader.updateTx(data)
    cashOutMachine.dispatch("SELECTAMOUNT")
}

HyperBrain.prototype.atmSellOrder = function (data) {
    cashOutMachine.setData("sellOrder", data)
    cashOutMachine.dispatch("CONFIRMAMOUNT")
}

HyperBrain.prototype.updateBillLogic = function () {
    this._transitionState('acceptingBills', { path: "/depositSuccessful", tx: this.tx })
}


HyperBrain.prototype.updateBill = function () {
    cashInMachine.dispatch("ONBILLIN")
}

HyperBrain.prototype.atmWithdrawaActionLogic = function () {
    const self = this;
    this.atmInitialWithdraw({ "direction": "cashOut", "cryptoCode": "BTC", fiat: this.atmTrader.tx.orderDetail.fiat_amount ||1 })

    this.tx.direction = 'cashOut'
    this._chooseFiat("cashOut")

    this.toDeposit()


    setTimeout(() => {
        emit({ action: 'billDispenserCollected' })
        self._completed()
        
        setTimeout(() => {
            emit({ action: 'ledsOff' })
            //selfCashOutMachine.dispatch("END")
            self.atmConfirmEnd()
        }, 4000)

    }, 6000)

   
}

HyperBrain.prototype.atmCleanUpLogic = function () {
    this.atmTrader.resetTx()
    this.tx = Tx.newTx()
}

/*
HyperBrain.prototype.atmCashInSessionStartLogic = function () {
    const self = this;
    cashInMachine.setSessionCounter(() => {
        self.atmTrader.resetProfile();
    })
}
*/

HyperBrain.prototype.atmConfirmEnd = function () {
    this.scanner.cancel()
    this.atmTrader.resetProfile();
    this.atmCleanUpLogic()

    this.atmTransitionChooseCoin()
    if (cashInMachine.isInState()) {
    } else if (selfCashOutMachine.isInState()) {

    }
    this.atmAllInitialState()
}

HyperBrain.prototype.atmConfirmDepositLogic = function () {
    const self = this;

    const rate = this.atmTrader.coinIndex[this.atmTrader.tx.coinname].price
    self.atmTrader.updateTx({})
    self.atmSubmitBill()

    // only on demo
    // setTimeout(() => {
    //     self.atmTransisstionSubmitSuccess()
    //     //self._machineIDLE()
    //     self.atmEnd()
    // }, 2000);
    
    // only for real test
    self.atmTrader
        .addAtmOrderBuy(
            {
                digital_currency: self.atmTrader.tx.coinname, //coinName, // 数字货币名称
                chain_name: self.atmTrader.tx.chain || "", //chainName, // 链名称
                // digital_amount: (putAmount / coinsRate[coinName]).toString(), // 数字货币数量
                digital_amount: (self.tx.fiat / rate).toString(), // 数字货币数量
                fiat_currency: self.atmTrader.fiatCurrency, // 法币名称
                fiat_amount: self.tx.fiat.toString(), // 法币数量
                address: self.tx.toAddress, // 收款地址
                tag: "" // 收款地址-memo
            }
        ).then(res => {
            console.debug(" ==== addAtmOrderBuy ===", res.body)
            if (res.code === 200) {
                self.atmTrader.updateTx({
                    orderDetail: res.body.data, 
                    orderNo: res.body.data.order_no
                })
                self.atmSubmitBill()
                setTimeout(() => {
                    //self.atmPrintReceipt()
                    self.atmTransisstionSubmitSuccess()
                    // self._machineIDLE()
                    self.atmEnd()
                }, 2000);

            } else {
                self.atmError(hyperError.errMsg["atmPutBuyOrderErr"], err)
            }
        }).catch((err) => {
            self.atmTrader.updateTx({})
            self.atmSubmitBill()
            setTimeout(() => {
                if (err.response){
                    self.atmError(err.response.body, err)
                }else{
                    self.atmError(err.message, err)
                }
                self.atmTransisstionSubmitSuccess()
                //self._machineIDLE()
                self.atmEnd()
            }, 2000);


        })
        
}

HyperBrain.prototype._machineIDLE = function _machineIDLE(locale) {
    const self = this
    const delay = transitionTime
        ? MIN_SCREEN_TIME - (Date.now() - transitionTime)
        : 0

    if (delay > 0 && self._isPendingScreen()) {
        setTimeout(function () { self._idle(locale) }, delay)
        return
    }

    emit('ledsOff')

    this.disableBillValidator()

    if (this.networkDown) return this._forceNetworkDown()

    const pollPromise = this.trader.poll()
    this.idVerify.reset()
    this.currentPhoneNumber = null
    this.currentSecurityCode = null
    this.numCoins = this.trader.coins.length
    this.tx = Tx.newTx()
    this.pk = null
    this.bill = null
    this.lastRejectedBillFiat = BN(0)
    this.failedCompliance = null
    this.failedComplianceValue = null
    this.redeem = false
    this.returnState = null
    this.complianceReason = null
    this.flow = null
    this.permissionsGiven = {}
    this.requirementAmountTriggered = {}
    this.suspendTriggerId = null

    /**
     * Clear any data from previously
     * validated customers (id & dailyVolume)
     */
    this.customer = null
    this.customerTxHistory = []

    this._setState('pendingIdle')

    // We've got our first contact with server

    const localeInfo = _.cloneDeep(this.localeInfo)
    locale = locale || localeInfo.primaryLocale
    localeInfo.primaryLocale = locale

    this.localeInfo = localeInfo

    this.beforeIdleState = false
    this.trader.clearConfigVersion()
    this.trader.cancelDispense()
    this.scanner.cancel()

    this.tx = Tx.update(this.tx, { fiatCode: this.fiatCode })

    pollPromise
        .then(() => this._idleByMode(this.localeInfo))
        .catch(console.log)
}



HyperBrain.prototype.atmSellOrderLogic = function () {
    console.debug("************* atmSellOrderLogic")
    const data = cashOutMachine.getData("sellOrder")
    const self = this;
    console.debug("data", data)

    const rate = this.atmTrader.coinIndex[this.atmTrader.tx.coinname].price

    // get chain_name first 1 or '' if nt set
    let chain_name = self.atmTrader.tx.chain
    try {
        if (!chain_name) {
            const chainList = this.atmTrader.coinIndex[this.atmTrader.tx.coinname].chain_list
            chain_name = chainList[0]
        }
    } catch (e) {
        chain_name = self.atmTrader.tx.coinname
    }
    this.atmTrader.addAtmOrderSell(
        {
            digital_currency: self.atmTrader.tx.coinname, // 数字货币名称
            chain_name: chain_name || "", // 链名称
            //digital_amount: (data.flat_amount / 1/*rate*/).toString(), // 数字货币数量
            digital_amount: (data.fiat_amount / rate).toString(),
            fiat_currency: self.atmTrader.fiatCurrency, // 法币名称
            fiat_amount: data.fiat_amount//"100" // 法币数量
        }
    ).then((respond) => {
        console.log("addAtmOrderSell respond", respond.body)
        // no address
        if(respond.code == 500){
            return new Error("respond code" + respond.message)
        }else{
            self.atmTrader.updateTx({
                orderDetail: respond.body.data,
                fiatAmount: data.fiat_amount,
                orderNo: respond.body.data.order_no,
            })
            self.atmTransitionSellOrderReview(respond.body.data)
            
        }
    }).catch((err) => {
        console.log("erR",err)
        const id = Math.random().toString()
        self.atmError(err.response.body, err)
        // self.atmTrader.updateTx({
        //     fiatAmount: data.fiat_amount,
        //     orderNo: id/*respond.body.data.order_no*/,
        // })
        // self.atmTransitionSellOrderReview({
        //     "order_no": id,
        //     "trade_type": 1,
        //     "address": "xxxxxxxxxxx",
        //     "memo": "xxxxxxxxxxx",
        //     "digital_currency": "usdt",
        //     "digital_amount": "15",
        //     "chain_name": "bep20",
        //     "fiat_currency": "usd",
        //     "fiat_amount": '100',
        //     "status": 0
        // })
    })
}

HyperBrain.prototype.atmCollectionActionLogic = function () {
    // transition to loading
    this.browser().send({ action: 'atmWithdrawScanProcessing', data: { path: "/scanProcessing"} })
    const address = selfCashOutMachine.getData('address')
    const self = this;
    // retrive atm cloud result
    self.atmTrader.updateTx({ orderNo: address })
    // console.debug("updateTx")
    this.atmTrader.getAtmOrder({
        order_no: address
    }).then((respond) => {
        console.debug("respond", respond.body, address)
        self.atmTrader.updateTx({ orderDetail: respond.body.data })

        if (respond.body.data.status == 0) {
            self.atmTransitionWithdrawProcessStatePending({
                paymentOrder: respond.body.data
            })
        } else if (respond.body.data.status == 1) {
            self.atmTransitionWithdrawProcessStateCompleted({
                paymentOrder: respond.body.data
            })
            //selfCashOutMachine.dispatch("WITHDRAW")
            self.atmTrader.updateAtmOrder({
                order_no: address,
                old_status: respond.body.data.status,
                new_status: 1
            })
        } else if (respond.body.data.status == 2) {
            self.atmTransitionWithdrawProcessStateWithdraw({
                paymentOrder: respond.body.data
            })
            selfCashOutMachine.dispatch("WITHDRAW")
            self.atmTrader.updateAtmOrder({
                order_no: address,
                old_status: respond.body.data.status,
                new_status: 1
            })
            // update status to 
        } else if (respond.body.data.status == 3) {
            self.atmTransitionWithdrawProcessStateWithdrawing({
                paymentOrder: respond.body.data
            })
        } else if (respond.body.data.status == 10) {
            self.atmTransitionWithdrawProcessStateRefunded({
                paymentOrder: respond.body.data
            })
        }
    }).catch((err) => {
        console.debug("atmCollectionActionLogic err", err)
        if (err.response){
            self.atmError(err.response.body, err)
        }
        const id = Math.random().toString()
        self.atmTrader.updateTx({ orderDetail: {
            "order_no": id,
            "trade_type": 1,
            "address": "xxxxxxxxxxx",
            "memo": "xxxxxxxxxxx",
            "digital_currency": "usdt",
            "digital_amount": "2",
            "chain_name": "bep20",
            "fiat_currency": "usd",
            "fiat_amount": '2',
            "status": 0
        } })


        // out money
        self.atmTransitionWithdrawProcessStatePending({
        //self.atmTransitionWithdrawProcessStateWithdraw({
            paymentOrder: {
                "order_no": id,
                "trade_type": 1,
                "address": "xxxxxxxxxxx",
                "memo": "xxxxxxxxxxx",
                "digital_currency": "usdt",
                "digital_amount": "2",
                "chain_name": "bep20",
                "fiat_currency": "usd",
                "fiat_amount": '2',
                "status": 0
            }
        })
        //selfCashOutMachine.dispatch("WITHDRAW")
    })
    // transition
    // base on result
}



HyperBrain.prototype.atmPrintReceipt = function () {
    this.atmConfirmEnd()
    return
    this.browser().send({ action: 'printing', receiptStatus: 'printing' })
    this._printReceipt()
        .then(() => this.browser().send({ action: 'printing', receiptStatus: 'success' }))
        .catch(() => {
            this.browser().send({ action: 'printing', receiptStatus: 'failed' })
            setTimeout(() => {
                this.browser().send({ action: 'printing', receiptStatus: 'available' })
            }, 2500)
        })
}

HyperBrain.prototype.atmAcceptingFirstBill = function () {
    this.enableBillValidator()
}

HyperBrain.prototype.atmSubmitBill = function () {
    this._doSendCoins()
}

HyperBrain.prototype.atmStartStreamPhoto = function () {
    this.scanner.atmStartStreamPhoto((err, result) => {
        if (err) {
            console.error(err)
            return facephoto.dispatch('SCAN_ERROR')
        }
        if (!result) {
            console.log('No photo result')
            return
        }
    })
}

HyperBrain.prototype.atmSuccessLogin = function () {
    console.debug("this.tx.direction", this.tx.direction)
    if (this.tx.direction == 'cashIn') {
        cashInMachine.start()
        cashInMachine.dispatch("LOGIN")
    } else if (this.tx.direction == 'cashOut') {
        selfCashOutMachine.start()
        selfCashOutMachine.dispatch("LOGIN")
    } else if (this.tx.direction == 'cashOutFake') {
        cashOutMachine.start()
        cashOutMachine.dispatch("LOGIN")
    }
}

HyperBrain.prototype.atmSuccessLoginLogic = function () {
    console.debug("atmSuccessLoginLogic")
    const rec = {}
    // find redirect
    if (this.tx.direction == 'cashOut') {
        rec.action = "atmSuccessLogin"
        rec.data = { path: '/scanCollectionAddress', render: this.buildRender(true)}
        this.atmStartScanQR()
    }
    this._transitionState(rec.action, rec)
}

HyperBrain.prototype.initATMTraderEvents = function () {
    const self = this
    self.atmTrader.on('traderPersonnelProfileUpdate', function () {
        // broadcast change
        self.browser().send({ action: 'profileUpdate', data: self.atmTrader.profile.personnel })
    })
    self.atmTrader.on('atmSellOrderUpdate', function () {

        const order = self.atmTrader.tx.orderDetail
        if (order.status == 0){
            self._transitionState('atmPaymentSellCurrency', {
                action: "atmPaymentSellCurrency",
                data: {
                    path: `/paymentSellCurrency?orderNo=${order.order_no}`,
                    paymentOrder: order,
                    render: self.buildRender(true)
                }
            })
        }else if (order.status == 1){
            self._transitionState('atmPaymentSellSubmitSuccess', {
                action: "atmPaymentSellSubmitSuccess",
                data: {
                    path: `/submitSellSuccess`,
                    paymentOrder: order,
                    render: self.buildRender(true)
                }
            })
            self.atmTrader.stopPollOrder()
            //self.atmEnd()
        }
        //self.browser().send({ action: 'atmSellOrderUpdate', data:  })
    })
    self.atmTrader.on('atmSync', function () {
        self.sendRates()
    })
    self.atmTrader.on('atmTraderPollingErr', function (err) {
        self.atmError(hyperError.errMsg["atmPollingErr"], err)
    })
}

Brain.prototype._initActionEvents = function _initActionEvents() {
    actionEmitter.on('action', (...args) => this.processAction.apply(this, args))
    actionEmitter.on('brain', (...args) => this.processBrainAction.apply(this, args))
}

Brain.prototype.atmError = function (data, err) {
    console.log("Err ", data.code, err.message)
    this.browser().send({
        action: 'atmErr',
        data: data
    })
}

HyperBrain.prototype.atmBuy = function () {

     if(!this.tx){
        this.tx = Tx.newTx()
    }
    this.tx.direction = "cashIn"// = Tx.update(this.tx, {direction: "cashIn"})
    this.tx.cryptoCode = "BTC"
    this._start()


    if (!this.atmTrader.isLogin()) {
        this.atmTransitionLogin()
    } else {
        cashInMachine.delSessionCounter()
        this.atmSuccessLogin();
        // this.atmTransitionCoinInLanding()
    }

}


HyperBrain.prototype.atmCollectSellOrder = function () {
    if(!this.tx){
        this.tx = Tx.newTx()
    }
    if (!this.billDispenser) {
        this.billDispenser = chooseBillDispenser(this.rootConfig)
    }
    this.tx.fiatCode = "USD"
    this.tx.direction = "cashOut"// = Tx.update(this.tx, {direction: "cashIn"})
    this.tx.cryptoCode = "BTC"

    if (!this.atmTrader.isLogin()) {
        this.atmTransitionLogin()
    } else {
        this.atmSuccessLogin()
    }
}

HyperBrain.prototype.atmSell = function () {
    this.tx.direction = "cashOutFake"// = Tx.update(this.tx, {direction: "cashIn"})
    this.tx.cryptoCode = "BTC"
    //this._chooseFiat()

    if (!this.atmTrader.isLogin()) {
        this.atmTransitionLogin()
    } else {
        //this.atmTransitionCashOutLanding()
        this.atmSuccessLogin()
    }
}

function emit(_event) {
    const event = _.isString(_event)
        ? { action: _event }
        : _event

    actionEmitter.emit('brain', event)
}

HyperBrain.prototype._connectedBrowser = function () {
    this.atmTransitionChooseCoin()
}

HyperBrain.prototype._dispenseUpdate = function _dispenseUpdate(tx) {
    const overZeroConf = this.exceedsZeroConf(tx)
    tx.status = 'confirmed'
    const status = 'confirmed'//tx.status
    const needToRedeem = !_.includes(status, ['instant', 'confirmed']) && overZeroConf
    console.debug("status", status)
    if (needToRedeem && tx.phone) return this._redeemLater()

    if (needToRedeem) {
        console.log('WARNING: This shouldn\'t happen; over zero-conf limit and not secured')
        return this._idle()
    }

    switch (status) {
        case 'rejected':
            this.smsCompliance({ returnState: 'redeemLater', reason: 'rejected_zero_conf' })
            break
        case 'published':
            this._transitionState('pendingDeposit')
            this._waitForDispense('published')
            break
        case 'authorized':
        case 'instant':
        case 'confirmed':
            this._dispense()
            break
    }
}

HyperBrain.prototype._waitForDispense = function _waitForDispense(status) {
    const originalTx = this.tx
    return this._dispenseUpdate(originalTx)
}

HyperBrain.prototype._chooseFiat = function _chooseFiat(direction = 'cashOut') {

    const amount = this.complianceAmount()
    const triggerTx = { fiat: amount, direction: 'cashOut' }

    const txId = this.tx.id
    const cryptoCode = this.tx.cryptoCode
    const coin = _.find(['cryptoCode', cryptoCode], this.trader.coins)

    const updateRec = {
        direction: direction,
        fiatCode: this.fiatCode,
        commissionPercentage: BN(coin.cashOutCommission).div(100),
        rawTickerPrice: BN(coin.rates.bid)
    }

    const update = _.assignAll([this.tx, updateRec])

    delete update.fiat;
    this.tx = Tx.update(this.tx, update)

    const response = this._getFiatButtonResponse()

    if (response.activeDenominations.isEmpty) return this._timedState('outOfCash')

    this._transitionState('chooseFiat', {
        chooseFiat: response,
        receiptStatus: this.trader.receiptPrintingActive ? 'available' : 'disabled'
    })

    const self = this
    this.dirtyScreen = false
    const interval = setInterval(function () {
        const doClear = self.state !== 'chooseFiat' ||
            self.tx.id !== txId
        if (doClear) return clearInterval(interval)

        const isDirty = self.dirtyScreen
        self.dirtyScreen = false
        if (isDirty) return
        clearInterval(interval)
        self._idle()
    }, 120000)
}

HyperBrain.prototype._doSendCoins = function _doSendCoins() {
    return this._executeSendCoins()
}

HyperBrain.prototype.updateBillScreen = function updateBillScreen(blockedCustomer) {
    console.debug("updateBillScreen")
    const bill = this.bill

    // No going back
    this.clearBill()
    this.lastRejectedBillFiat = BN(0)

    emit('billValidatorPending')

    var billUpdate
    // BACKWARDS_COMPATIBILITY 7.5.0-beta.1
    const serverVersion = this.trader.serverVersion
    if (!serverVersion || semver.lt(serverVersion, '7.5.0-beta.1')) {
        billUpdate = Tx.billUpdateDeprecated(bill)
    } else {
        billUpdate = Tx.billUpdate(bill)
    }

    return this.fastUpdateTx(billUpdate)
        .then(() => {
            //this._transitionState('acceptingBills', { path: "/depositSuccessful", tx: this.tx })

            this.updateBill();
            this._screenTimeout(() => this._sendCoins(), this.config.billTimeout)
        })
        .then(() => this.completeBillHandling(blockedCustomer))
}

HyperBrain.prototype._billRead = function _billRead(data) {
    const billValidator = this.billValidator

    if (!_.includes(this.state, BILL_ACCEPTING_STATES)) {
        console.trace('Attempting to reject, not in bill accepting state.')
        return billValidator.reject()
    }

    this.insertBill(data.denomination)

    // Current inserting bill
    const currentBill = this.bill.fiat

    // Current transaction's fiat not including current bill
    const fiatBeforeBill = this.tx.fiat

    // Total fiat inserted including current bill
    const fiatAfterBill = fiatBeforeBill.add(currentBill)

    // Limit next bills by failed compliance value
    // if value is null it was triggered by velocity or consecutive days
    const failedTierThreshold = _.isNil(this.failedCompliance) ? BN(Infinity) : BN(this.failedComplianceValue || 0)

    // Available cryptocurrency balance expressed in fiat not including current bill
    const remainingFiatToInsert = BN.klass.min(this.balance(), failedTierThreshold).sub(fiatBeforeBill)

    // Minimum allowed transaction
    const minimumAllowedTx = this.tx.minimumTx

    const amount = fiatBeforeBill.add(currentBill)
    const triggerTx = { fiat: amount, direction: this.tx.direction }

    const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
    const isCompliant = _.isEmpty(nonCompliantTiers)

    // If threshold is 0,
    // the sms verification is being handled at the beginning of this.startScreen.
    if (!isCompliant) {
        // Cancel current bill
        this.billValidator.reject()

        // If id tier force another verification screen
        const nonCompliantTier = _.head(nonCompliantTiers)
        const idTier = nonCompliantTier === 'idCardData' || nonCompliantTier === 'idCardPhoto'
        if (idTier) return this.transitionToVerificationScreen(nonCompliantTier)

        return this.runComplianceTiers(nonCompliantTiers)
    }

    this.browser().send({
        action: 'acceptingBill',
        amount: data.denomination
    })

    this._setState('billRead')

    billValidator.stack()
}

HyperBrain.prototype.sendRates = function sendRates() {

    // const cryptoCode = this.tx.cryptoCode
    // if (!cryptoCode) return
    const rec = {
        action: "atmSync",
        data: {
            cassettes: this.cassettes,
            coins: this.atmTrader.coins,
            fiatCurrency: this.atmTrader.fiatCurrency,
            needKycAmount: this.atmTrader.needKycAmount,
            supportParValue: this.atmTrader.supportParValue,
            maxTradeAmount: this.atmTrader.maxTradeAmount,
            cashOutRequestTimeout: this.atmTrader.cashOutRequestTimeout
        }
    }

    this.browser().send(rec)
}

HyperBrain.prototype._start = function _start() {
    console.debug("__start")
    if (this.startDisabled) return

    const cryptoCode = this.tx.cryptoCode
    const coin = _.find(['cryptoCode', cryptoCode], this.trader.coins)

    const updateRec = {
        direction: 'cashIn',
        cashInFee: coin.cashInFee,
        commissionPercentage: BN(coin.cashInCommission).div(100),
        rawTickerPrice: BN(coin.rates.ask),
        minimumTx: this.billValidator.lowestBill(coin.minimumTx),
        cryptoNetwork: coin.cryptoNetwork
    }

    const update = _.assignAll([this.tx, updateRec])
    this.tx = Tx.update(this.tx, update)

    const amount = this.complianceAmount()
    const triggerTx = { fiat: amount, direction: this.tx.direction }

    const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
    const isCompliant = _.isEmpty(nonCompliantTiers)

    if (!isCompliant) {
        return this.smsCompliance()
    }

    const printPaperWallet = _.get('compliance.paperWallet')(deviceConfig) &&
        deviceConfig.kioskPrinter

    if (printPaperWallet) {
        if (this.tx.cryptoCode !== 'BTC') {
            // Only BTC supported for now
            return this._idle()
        }
        return this._privateWalletPrinting()
    }

    this.browser().send({
        tx: this.tx,
        receiptStatus: this.trader.receiptPrintingActive ? 'available' : 'disabled'
    })
}

HyperBrain.prototype._chooseCoinScreen = function () {
    return this.atmTransitionChooseCoin()
}

Brain.prototype.stopEmptyBillValidator = function () {
    emit('ledsOff')

    this.disableBillValidator()
}

HyperBrain.prototype._idle = function _idle(locale) {
    const self = this
    const delay = transitionTime
        ? MIN_SCREEN_TIME - (Date.now() - transitionTime)
        : 0

    if (delay > 0 && self._isPendingScreen()) {
        setTimeout(function () { self._idle(locale) }, delay)
        return
    }

    emit('ledsOff')

    this.disableBillValidator()

    if (this.networkDown) return this._forceNetworkDown()

    const pollPromise = this.trader.poll()
    const atmTraderPollPromise = this.atmTrader.poll()
    this.idVerify.reset()
    this.currentPhoneNumber = null
    this.currentSecurityCode = null
    this.numCoins = this.trader.coins.length
    this.tx = Tx.newTx()
    this.pk = null
    this.bill = null
    this.lastRejectedBillFiat = BN(0)
    this.failedCompliance = null
    this.failedComplianceValue = null
    this.redeem = false
    this.returnState = null
    this.complianceReason = null
    this.flow = null
    this.permissionsGiven = {}
    this.requirementAmountTriggered = {}
    this.suspendTriggerId = null

    /**
     * Clear any data from previously
     * validated customers (id & dailyVolume)
     */
    this.customer = null
    this.customerTxHistory = []

    this._setState('pendingIdle')

    // We've got our first contact with server

    const localeInfo = _.cloneDeep(this.localeInfo)
    locale = locale || localeInfo.primaryLocale
    localeInfo.primaryLocale = locale

    this.localeInfo = localeInfo

    this.beforeIdleState = false
    this.trader.clearConfigVersion()
    this.trader.cancelDispense()
    this.scanner.cancel()

    this.atmTrader.reset()

    this.tx = Tx.update(this.tx, { fiatCode: this.fiatCode })

    pollPromise
        .then(() => this._idleByMode(this.localeInfo))
        .catch(console.log)

    atmTraderPollPromise/*.then(() => this._idleByMode(this.localeInfo))*/
        .catch(console.log)
}

HyperBrain.prototype.completeBillHandling = function completeBillHandling(blockedCustomer) {
    // const availableCryptoAsFiat = this.balance().sub(this.tx.fiat)
    // const highestBill = this.billValidator.highestBill(availableCryptoAsFiat)
    // const hasLowBalance = highestBill.lte(0)

    this.updateBillLogic()

    // this.browser().send({
    //     action: "acceptingBills",
    //     path: "/acceptingBills",
    //     credit: this._uiCredit(),
    //     sendOnly: hasLowBalance || blockedCustomer,
    //     reason: blockedCustomer ? 'blockedCustomer' : false,
    //     cryptoCode: this.tx.cryptoCode,
    //     tx: this.tx
    // })
}

HyperBrain.prototype.activate = function activate() {
    const connectionInfo = pairing.connectionInfo(this.connectionInfoPath)
    const config = this.rootConfig
    const protocol = config.http ? 'http:' : 'https:'

    this._transitionState('booting')

    if (config.mockTrader) {
        this.trader = require('../mocks/trader')(protocol, this.clientCert, connectionInfo, this.dataPath, deviceConfig.cryptomatModel)
    } else {
        this.trader = require('../trader')(protocol, this.clientCert, connectionInfo, this.dataPath, deviceConfig.cryptomatModel)
    }
    this.atmTrader = _activateLoadATMTrader(config, protocol, this.clientCert, connectionInfo, this.dataPath, deviceConfig.cryptomatModel)

    this.idVerify = require('../compliance/id_verify').factory({ trader: this.trader })

    this._initTraderEvents()

    this.initATMTraderEvents()

    this.atmTraderRun()

    return this.traderRun()
        .then(() => this.initValidator())
}

HyperBrain.prototype.buildRender = function (back = true, params = { timeout: 59, autoNext: false }) {
    return {
        back: back,
        timeout: params.timeout || 59,
        autoNext: params.autoNext || false
    }
}

HyperBrain.prototype.atmUpdateSellOrder = function (data) {
    // data.chain
    // update trader .chain
    this.atmTrader.updateTx({ chain: data.chain })
    cashOutMachine.dispatch("UPDATE")
}

HyperBrain.prototype.stopATMTraderPolling = function () {
    this.atmTrader.stopPollOrder()
}

HyperBrain.prototype.transitionScreen = function transitionScreen() {
    let appState = null

    appState = __transitionScreen()

    // check idCardData state
    let machineState = idCardData.getState()
    switch (machineState) {
        case 'scanId':
            appState = 'scan_id_data'
            break
        case 'authorizing':
            appState = 'verifying_id_data'
            break
        case 'idScanFailed':
            appState = 'failed_scan_id_data'
            break
        case 'idVerificationFailed':
            appState = 'failed_permission_id'
            break
    }

    if (!appState) {
        // otherwise check idCardPhoto state
        machineState = idCardPhoto.getState()
        switch (machineState) {
            case 'scanPhotoCard':
                appState = 'scan_id_photo'
                break
            case 'scanPhotoCardManual':
                appState = 'scan_manual_id_photo'
                break
            case 'authorizing':
                appState = 'verifying_id_photo'
                break
            case 'photoCardScanFailed':
                appState = 'failed_scan_id_photo'
                break
            case 'photoCardVerificationFailed':
                appState = 'failed_verifying_id_photo'
                break
        }
    }

    if (!appState) {
        // otherwise check facephoto state
        machineState = facephoto.getState()
        switch (machineState) {
            case 'takeFacephoto':
                appState = 'scan_face_photo'
                break
            case 'retryTakeFacephoto':
                appState = 'retry_scan_face_photo'
                break
            case 'authorizing':
                appState = 'verifying_face_photo'
                break
            case 'facephotoFailed':
                appState = 'failed_scan_face_photo'
                break
            case 'facephotoVerificationFailed':
                appState = 'failed_permission_id'
                break
        }

        if (!appState) {
            // sanctions state
            machineState = sanctions.getState()
            switch (machineState) {
                case 'triggerSanctions':
                    appState = 'waiting'
                    break
            }
        }

        if (!appState) {
            // usSsn state
            machineState = usSsn.getState()
            switch (machineState) {
                case 'askForSsn':
                    appState = 'registerUsSsn'
                    break
                case 'authorizing':
                    appState = 'waiting'
                    break
            }
        }
    }

    if (!appState) { return }

    this._transitionState(appState, { context: 'compliance' })
}


const __transitionScreen = function __transitionScreen() {
    let appState = null

    let machineState = cashInMachine.getState()

    console.debug("__transitionScreen", machineState)

    switch (machineState) {
        case 'scanId':
            appState = 'scan_id_data'
            break
        case 'authorizing':
            appState = 'verifying_id_data'
            break
        case 'idScanFailed':
            appState = 'failed_scan_id_data'
            break
        case 'idVerificationFailed':
            appState = 'failed_permission_id'
            break
    }

    return appState
}

const _activateLoadATMTrader = function (config, protocol, clientCert, connectionInfo, dataPath, cryptomatModel) {
    if (config.mockTrader) {
        return require('./mocks/atmTrader')(protocol, clientCert, connectionInfo, dataPath, cryptomatModel)
    } else {
        return require('./atmTrader')(protocol, clientCert, connectionInfo, dataPath, cryptomatModel)
    }
}

// 

HyperBrain.prototype.machineUnpair = () => {

}

HyperBrain.prototype.machineReboot = () => {

}

HyperBrain.prototype.machineShutdown = () => {

}

HyperBrain.prototype.machineRestart = () => {

}

module.exports = HyperBrain