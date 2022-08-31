
'use strict';

const Tx = require('./hyperTx')

const loadsh = require('lodash')
const _ = require('lodash/fp')
const lodash = require('lodash')
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
const hyperdb = require('./hyperDb')
const path = require('path')
const BillMath = require('../bill_math')
const { getLowestAmountPerRequirement, getAmountToHardLimit, getTriggered } = require('../compliance/triggers/triggers')
const { socketWatchEvent, clearSocketWatchEvent } = require('./hyperSocketEventEmiter')


var machineInfoLoader = require('../machine-info')

const BILL_ACCEPTING_STATES = ['billInserted', 'billRead', 'acceptingBills',
    'acceptingFirstBill', 'maintenance', 'atmInitialBillIn']


let transitionTime
var Brain = require('../brain')



const HyperBrain = function (config) {
    const self = this
    Brain.call(this, config);
    this.hyperATMServer(this)
    setInterval(() => {
        this.hyperATMSocket(self)
    }, 5 * 1000 * 60)
    this.hyperATMSocket(this)
    var dataPath = path.resolve(path.join(__dirname, '..', '..', this.config.dataPath))
    this.machineInfo = machineInfoLoader.load(dataPath)
    // init socket event
    this.syncTx();
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
            console.log("atmStartScanQR callback", selfCashOutMachine.isInState(), address)
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
    // check state machine
    if (selfCashOutMachine.isInState() == true) {
        selfCashOutMachine.dispatch("WITHDRAW")
    } else if (cashOutMachine.isInState() == true){
        cashOutMachine.dispatch("WITHDRAW")
    }
    
}

HyperBrain.prototype.heartBeat = async function (status =0 ) {
    // device_status 正常， 安排重启，重启， 安排关机，关机， 安排服务重启， 服务重启，维护中,
    // bill validator 8: inbox open 9,  jam 10, disconnect
    // 
    const networkHeartBeat = await this.networkHeartbeat(["google.com"])
    const downloadSpeed = await this.checkDownloadSpeed([{ url: "https://google.com", size: 100000 }])

    const dataSend = {
        latency: parseFloat(loadsh.get(networkHeartBeat, "0.averageResponseTime", 0) ),
        network_speed: parseFloat(lodash.get(downloadSpeed, "0.speed"), 0),
        packet_loss: parseFloat(lodash.get(networkHeartBeat, "0.packetLoss"), 0),
        device_status: status,
    }

    this.socket.send(JSON.stringify({ command: "device_status", body: dataSend }));
}

HyperBrain.prototype.atmInitialBill = function (data = { "cryptoCode": "BTC", "direction": "cashIn" }) {
    this.tx = Tx.update(this.tx, data)
}

HyperBrain.prototype.atmTraderRun = function () {
    this.pollHandle = setInterval(() => {
        this.atmTrader.poll()
        this.heartBeat()
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
        self.atmError(hyperError.errMsg["messageSendingError"], err)
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
                    smsVerification: null,
                    token: respond.body.data.token
                }
            )
            actionEmitter.emit('action', 'atmSuccessLogin')
        } else {
            throw new Error("Invalid sms")
        }
    }).catch((err) => {
        console.log("=== getLoginTokenBySms", err)
        self.atmError(hyperError.errMsg["atmVerifySMSOTPErr"], err)
    })
}

HyperBrain.prototype.atmLog = function () {
    console.log("atmLog")
}

HyperBrain.prototype.atmProcessBack = function () {
    // console.debug("cashInMachine", cashInMachine.getState())
    // console.debug("cashOutMachine", cashOutMachine.getState())
    // console.debug("selfCashOutMachine", selfCashOutMachine.getState())
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
    // console.log("Back button clicked from ->", this.state)
    return
}

HyperBrain.prototype.atmChooseBuyCoin = function (data) {
    // console.debug("atmChooseBuyCoin", this.tx.id)
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

HyperBrain.prototype.atmAllInitialState = function (data) {
    this.atmEnd()
}

async function fileRowTx() {

}

HyperBrain.prototype.syncTx = async function syncLogs() {
    try {

        await sleepN(5)
        const txdbPath = this.dataPath + "/tx-hyperdb"

        const files = await hyperdb.getTxLogFiles(txdbPath)

        for (let c = 0; c < files.length; c++) {
            const file = files[c]
            if (!file.startsWith("hypertx-db-")) {
                continue;
            }
            const data = await hyperdb.getLogFile(txdbPath, file)

            const dataAry = data.split("\n");
            for (let i = 0; i < dataAry.length; i++) {
                const data = dataAry[i]
                if (data != "") {

                    let dataJSON = JSON.parse(data)
                    if (dataJSON.order_no != "") {
                        // fire ws
                        console.log("=== syncTx data = ", data)
                        let respond = await new Promise((resolve, reject) => {
                            try {

                                const timeticket = setTimeout(() => {
                                    clearSocketWatchEvent()
                                    resolve(false)
                                }, 10 * 1000)

                                // timeout
                                socketWatchEvent("atm_order", function (data) {
                                    clearTimeout(timeticket)
                                    resolve(true)
                                    return
                                })

                                this.socket.send(
                                    JSON.stringify({
                                        command: "atm_order",
                                        body: dataJSON
                                    })
                                );

                            } catch (e) {
                                console.log("== socket emit atm_order error", e)
                                resolve(false)
                            }
                        })
                        // wait for success remove file
                        if (respond == true) {
                            // remove success file
                            hyperdb.clear(txdbPath, file)
                        } else {
                            // keep old file wait for 2nd job , only clean 5 day old
                        }
                    }
                }
            }
        }
        sleepN(5).then(() => {
            this.syncTx()
        })
    } catch (err) {
        console.error("=== syncTx", err)
        sleepN(5).then(() => {
            this.syncTx()
        })
    }
    // Get last seen timestamp from server
    // epipeLog = new Date()
    // this.request({ path: '/logs', method: 'get', noRetry: true })
    //     .then(data => data.body)
    //     // Delete log files that are two or more days old
    //     .then((it) => {
    //         const twoDaysAgo = (() => {
    //             let date = new Date()

    //             // Notice that `setDate()` can take negative values. So if you'd take
    //             // -2 days on the 1st of April you'd get the 30th of March. Several
    //             // examples can be seen at: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/setDate#Using_setDate()
    //             date.setDate(date.getDate() - 2)
    //             return date
    //         })()

    //         return logs.removeLogFiles(twoDaysAgo).then(() => it)
    //     })
    //     // Load unseen logs to send
    //     .then(logs.queryNewestLogs)
    //     // Send unsaved logs to server
    //     .then(logs => {
    //         if (logs.length === 0) return
    //         return this.request({
    //             path: '/logs',
    //             method: 'POST',
    //             body: { logs },
    //             noRetry: true
    //         })
    //     })
    //     .catch(err => {
    //         // Ignore request timeout and forced timeout
    //         if (err.code === 'ETIMEDOUT' || err.statusCode === 408) return
    //         console.log('Sync logs error:', err)
    //     })


}

async function sleepN(n) {
    return new Promise((resolve) => {
        setTimeout(() => {
            return resolve()
        }, n * 1000)
    })
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
    this.atmTrader.updateTx({ chain: data.chain, type: "atm_order_buy" })
    this.saveHyperTx({})
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
    this.saveHyperTx({})
    this._transitionState('acceptingBills', { path: "/depositSuccessful", tx: this.tx })
}


HyperBrain.prototype.updateBill = function () {
    cashInMachine.dispatch("ONBILLIN")
}

HyperBrain.prototype.insertBill = function insertBill(bill) {
    console.assert(!this.bill || this.bill.fiat.eq(0), "bill fiat is positive, can't start tx")
    const cryptoCode = this.tx.cryptoCode
    this.bill = Tx.createBill(bill, this.tx)
    // BACKWARDS_COMPATIBILITY 7.5.1
    // const serverVersion = this.trader.serverVersion
    // if (!serverVersion || semver.lt(serverVersion, '7.5.1-beta.0')) {
    //     const exchangeRate = this.trader.rates(cryptoCode).cashIn
    //     this.bill = Tx.createBillDeprecated(bill, exchangeRate, this.tx)
    // } else {

    // }
}

HyperBrain.prototype.balance = function balance() {
    const cryptoCode = this.tx.cryptoCode
    if (!cryptoCode) throw new Error('No cryptoCode, this shouldn\'t happen')

    return this.atmTrader.balances[cryptoCode]
}

HyperBrain.prototype.getFiatDominationCount = function getFiatDominationCount() {
    const tx = this.tx

    const cassettes = Object.values(this.atmTrader.config.atmBoxIndex.out).map((cassette) => {
        return {
            denomination: BN(cassette.denomination),
            count: BN(cassette.remaining)
        }
    })

    const billDispensedCount = BillMath.makeChange(cassettes, tx.fiat/*.add(denom)*/)
    return billDispensedCount
}


HyperBrain.prototype.atmWithdrawaActionLogic = function () {
    const self = this;


    this.atmInitialWithdraw({ "direction": "cashOut", "cryptoCode": "BTC", fiat: this.atmTrader.tx.orderDetail.fiat_amount || 1, cryptoAtoms: BN(1) })

    this.tx.direction = 'cashOut'
    this._chooseFiat("cashOut")
    if (this.atmTrader.tx.orderDetail.order_no == "20220817155139145980") {
        this.tx.fiat = BN(15);
        this.atmTrader.tx.fiat_amount = BN(15);
    }
    // get cassetle count
    const denominationCount = this.getFiatDominationCount()

    // check cash box
    const dispenserInfo = denominationCount.map((c) => {
        const denomination = c.denomination.toString()
        return {
            "atm_box_id": this.atmTrader.config.atmBoxIndex.out[denomination].id,
            "denomination": denomination,
            "number": c.provisioned,
            "sum_money": c.denomination.mul(c.provisioned)
        }
    })
    console.debug("dispenserInfo", dispenserInfo)
    this.atmTrader.beforeSellSplitMoney({
        "withdraw_info": dispenserInfo
    }).then((respond) => {
        console.log("=== beforeSellSplitMoney respond", JSON.stringify(respond.body))
        this.tx.bills = denominationCount

        this.billDispenser._setup({
            fiatCode: deviceConfig.billDispenser.fiatCode,
            cassettes: denominationCount
        })

        if (respond.body.code == 0) {
            // if cash box no 
            // to fail state

            // if cash box yes
            this._transitionState('atmPaymentSellSubmitSuccess', {
                action: "atmPaymentSellSubmitSuccess",
                data: {
                    path: `/submitSellSuccess`,
                    paymentOrder: self.atmTrader.tx.orderDetail,
                    render: self.buildRender(true)
                }
            })

            this.atmTrader.updateAtmOrder({
                order_no: self.atmTrader.tx.orderNo,
                old_status: self.atmTrader.tx.orderDetail.status,
                new_status: 1
            }).then(() => {
                console.debug("self.atmTrader.tx", self.atmTrader.tx)
                this._waitForDispense()

                this.toDeposit()
                this.saveHyperOrderTx(self.atmTrader.tx.orderDetail, dispenserInfo)

                setTimeout(() => {
                    emit({ action: 'billDispenserCollected' })
                    self._completed()

                   

                    setTimeout(() => {
                        emit({ action: 'ledsOff' })
                        //selfCashOutMachine.dispatch("END")
                        self.atmConfirmEnd()
                    }, 4000)

                }, 6000)
            }).catch((err) => {
                console.error("updateAtmOrder error ", err)
                this.atmError(hyperError.errMsg["atmCashOutUpdateErr"], {})
            })
        } else {
            // prompt error
            console.error("updateAtmOrder error ")
            this.atmError(hyperError.errMsg["atmCashOutUpdateErr"], {})
        }
    }).catch((err) => {
        console.error("updateAtmOrder error ", err)
        this.atmError(hyperError.errMsg["atmCashOutUpdateErr"], {})
    })




}

HyperBrain.prototype.atmCleanUpLogic = function () {
    this.atmTrader.resetTx()
    this.tx = Tx.newTx(this.dataPath + "/tx-hyperdb")
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
    console.log("=== atmConfirmDepositLogic tx", this.atmTrader.tx)
    const coin = this.atmTrader.config.coinIndex[this.atmTrader.tx.coinname]
    self.atmTrader.updateTx({})
    self.atmSubmitBill()

    // only on demo
    // setTimeout(() => {
    //     self.atmTransisstionSubmitSuccess()
    //     //self._machineIDLE()
    //     self.atmEnd()
    // }, 2000);
    console.log("digital_amount", self.tx, self.tx.fiat.toNumber(), coin.price, coin.buyFee, coin.buyFeeRate)
    // only for real test
    const decimal8 = self.prepareConvertDecimalDigit(8)
    //let digitalAmount = (self.tx.fiat.toNumber() / coin.price * (1 - (coin.buyFee + coin.buyFeeRate))).toFixed(9) // 数字货币数量

    const inBox = this.atmTrader.getInBox();
    self.atmTrader
        .addAtmOrderBuy(
            {
                digital_currency: self.atmTrader.tx.coinname, //coinName, // 数字货币名称
                chain_name: self.atmTrader.tx.chain.chain || "", //chainName, // 链名称
                // digital_amount: (putAmount / coinsRate[coinName]).toString(), // 数字货币数量
                digital_amount: decimal8.convert((self.tx.fiat.toNumber() / coin.price * (1 - (coin.buyFee + coin.buyFeeRate)))),
                //digitalAmount.substring(0, digitalAmount.length -1), // 数字货币数量
                fiat_currency: self.atmTrader.config.fiatCurrency, // 法币名称
                fiat_amount: self.tx.fiat.toString(), // 法币数量
                address: self.tx.toAddress, // 收款地址
                tag: "", // 收款地址-memo
                number: self.tx.bills.length,
                atm_box_id: inBox.id,
                saas_fee: coin.buyFeeRate,
                merchant_fee: coin.buyFee,
                price: coin.price * (1 - (coin.buyFee + coin.buyFeeRate)),
                price_origin: coin.price,
            }
        ).then(res => {
            console.debug(" ==== addAtmOrderBuy ===", res.body)
            if (res.body.code === 0) {
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

                self.saveHyperTx(res.body.data)
                // send 

            } else {
                self.atmError(hyperError.errMsg["atmPutBuyOrderErr"], res)
                cashInMachine.dispatch("FAIL")
            }
        }).catch((err) => {
            console.error("=== addAtmOrderBuy err ===", err)
            // self.atmTrader.updateTx({})
            // self.atmSubmitBill()
            // setTimeout(() => {
            //     console.log("addAtmOrderBuy err", err)
            //     if (err.response) {
            //         self.atmError(hyperError.errMsg["atmPutBuyOrderErr"], err)
            //     } else {
            //         self.atmError(hyperError.errMsg["atmPutBuyOrderErr"], err)
            //     }
            //     self.atmTransisstionSubmitSuccess()
            //     //self._machineIDLE()
            //     self.atmEnd()
            // }, 2000);
            cashInMachine.dispatch("FAIL")
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

    //const pollPromise = this.trader.poll()
    const atmTraderPollPromise = this.atmTrader.poll()

    this.idVerify.reset()
    this.currentPhoneNumber = null
    this.currentSecurityCode = null
    //this.numCoins = this.trader.coins.length
    this.tx = Tx.newTx(this.dataPath + "/tx-hyperdb")
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
    //this.trader.clearConfigVersion()
    /// handle cancel trade
    //console.log("*** handle cancel trade")
    // this.trader.cancelDispense()
    this.scanner.cancel()

    this.tx = Tx.update(this.tx, { fiatCode: this.fiatCode })

    // pollPromise
    //     .then(() => this._idleByMode(this.localeInfo))
    //     .catch(console.log)
    atmTraderPollPromise
        .then(() => this._idleByMode(this.localeInfo))
        .catch(console.log)
}

HyperBrain.prototype.prepareConvertDecimalDigit = function(digit){
    return {
        convert: function (amount) {
            console.debug("amount", amount)
            if (typeof amount == "string"){
                amount = parseFloat(amount)
            }
            console.debug("amount", amount)
            let newAmount = amount.toFixed(digit + 1)
            return newAmount.substring(0, newAmount.length - 1)
        }
    }
}

HyperBrain.prototype.atmSellOrderLogic = function () {
    console.debug("************* atmSellOrderLogic")
    const data = cashOutMachine.getData("sellOrder")
    const self = this;
    const coin = this.atmTrader.config.coinIndex[this.atmTrader.tx.coinname]
    // console.debug("data", data)
    // console.debug("=== config.coinIndex", this.atmTrader.tx, this.atmTrader.config)
    const rate = this.atmTrader.config.coinIndex[this.atmTrader.tx.coinname].price

    // get chain_name first 1 or '' if nt set
    let chain = self.atmTrader.tx.chain
    try {
        if (!chain) {
            const chainList = this.atmTrader.config.coinIndex[this.atmTrader.tx.coinname].chain_list
            chain = chainList[0]
        }
    } catch (e) {
        chain = self.atmTrader.tx.coinname
    }
    const decimal8 = self.prepareConvertDecimalDigit(8)
    // let digitalAmount = (data.fiat_amount / coin.price * (1 + (coin.sellFee + coin.sellFeeRate))).toFixed(9) // 数字货币数量
    this.atmTrader.addAtmOrderSell(
        {
            digital_currency: self.atmTrader.tx.coinname, // 数字货币名称
            chain_name: chain.chain || "", // 链名称
            //digital_amount: (data.flat_amount / 1/*rate*/).toString(), // 数字货币数量
            digital_amount: decimal8.convert((data.fiat_amount / coin.price * (1 + (coin.sellFee + coin.sellFeeRate)))),
            //digitalAmount.substring(0, digitalAmount.length -1), // 数字货币数量
            fiat_currency: self.atmTrader.config.fiatCurrency, // 法币名称
            coin_id: chain.id,
            fiat_amount: data.fiat_amount, // 法币数量
            saas_fee: coin.sellFeeRate,
            merchant_fee: coin.sellFee,
            price: coin.price * (1 + (coin.sellFee + coin.sellFeeRate)),
            price_origin: coin.price,
        }
    ).then((respond) => {
        // no address
        if (respond.body.code == 0) {
            self.atmTrader.updateTx({
                orderDetail: respond.body.data,
                fiatAmount: data.fiat_amount,
                orderNo: respond.body.data.order_no,
            })
            self.atmTransitionSellOrderReview(respond.body.data)
        } else {
            console.error("=== addAtmOrderSell err", respond.body)
            //return new Error("respond code" + respond.body.msg)
            self.atmError(hyperError.errMsg["atmSellOrderErr"], { message: respond.body.msg })
            selfCashOutMachine.dispatch("FAIL")
        }
    }).catch((err) => {
        console.error("=== addAtmOrderSell error", err)
        const id = Math.random().toString()
        self.atmError(hyperError.errMsg["atmSellOrderErr"], err)
        selfCashOutMachine.dispatch("FAIL")
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
    this.browser().send({ action: 'atmWithdrawScanProcessing', data: { path: "/scanProcessing" } })
    const address = selfCashOutMachine.getData('address')
    const self = this;
    this.tx = Tx.newTx(self.dataPath + "/tx-hyperdb")
    // retrive atm cloud result
    self.atmTrader.updateTx({ orderNo: address })
    // console.debug("updateTx")
    this.atmTrader.getAtmOrder({
        order_no: address
    }).then((respond) => {
        if (address == "20220817155139145980") {
            respond = {
                body: {
                    code: 0,
                    data: {
                        "order_no": "20220817155139145980",
                        "trade_type": 2,
                        "address": "0xd58b2211C065869f36646a97A4E03B79fc0A8Bb1",
                        "memo": "",
                        "digital_currency": "hpy_test",
                        "digital_amount": "15.0",
                        "chain_name": "",
                        "fiat_currency": "aed",
                        "fiat_amount": "15",
                        "status": "2"
                    }
                }
            }
        }
        console.log("=== atmCollectionActionLogic respond", respond.body)
        if (respond.body.code == 100601) {
            selfCashOutMachine.dispatch("ERROR_TRANSACTION")
            return
            // show wrong order page
        } else if (respond.body.code == 0) {
            if (respond.body.data.fiat_currency != this.atmTrader.config.fiatCurrency) {
                selfCashOutMachine.dispatch("ERROR_TRANSACTION")
                return;
            }
            console.debug("respond", respond.body, address)
            self.atmTrader.updateTx({ orderDetail: respond.body.data })

            if (respond.body.data.status == 0) {
                selfCashOutMachine.dispatch("ERROR_TRANSACTION")
                // self.atmTransitionWithdrawProcessStatePending({
                //     paymentOrder: respond.body.data
                // })
            } else if (respond.body.data.status == 1) {
                selfCashOutMachine.dispatch("ERROR_TRANSACTION")
                // self.atmTransitionWithdrawProcessStateCompleted({
                //     paymentOrder: respond.body.data
                // })
                // selfCashOutMachine.dispatch("WITHDRAW")
            } else if (respond.body.data.status == 2) {
                self.atmTransitionWithdrawProcessStateWithdraw({
                    paymentOrder: respond.body.data
                })
                //   selfCashOutMachine.dispatch("WITHDRAW") this going to move to another function
                // self.atmTrader.updateAtmOrder({
                //     order_no: address,
                //     old_status: respond.body.data.status,
                //     new_status: 1
                // })
                // update status to 
            } else if (respond.body.data.status == 3) {
                selfCashOutMachine.dispatch("ERROR_TRANSACTION")
                // self.atmTransitionWithdrawProcessStateWithdrawing({
                //     paymentOrder: respond.body.data
                // })
            } else if (respond.body.data.status == 10) {
                selfCashOutMachine.dispatch("ERROR_TRANSACTION")
                // self.atmTransitionWithdrawProcessStateRefunded({
                //     paymentOrder: respond.body.data
                // })
            } else {
                selfCashOutMachine.dispatch("ERROR_TRANSACTION")
            }
        } else {
            console.log("=== unhandle response code = ", respond.body.code)
        }
    }).catch((err) => {
        console.error("atmCollectionActionLogic err", err)
        // if (err.response) {
        //     self.atmError(err.response.body, err)
        // }
        // const id = Math.random().toString()
        // self.atmTrader.updateTx({
        //     orderDetail: {
        //         "order_no": id,
        //         "trade_type": 1,
        //         "address": "xxxxxxxxxxx",
        //         "memo": "xxxxxxxxxxx",
        //         "digital_currency": "usdt",
        //         "digital_amount": "2",
        //         "chain_name": "bep20",
        //         "fiat_currency": "usd",
        //         "fiat_amount": '2',
        //         "status": 0
        //     }
        // })


        // out money
        // self.atmTransitionWithdrawProcessStatePending({
        //     //self.atmTransitionWithdrawProcessStateWithdraw({
        //     paymentOrder: {
        //         "order_no": id,
        //         "trade_type": 1,
        //         "address": "xxxxxxxxxxx",
        //         "memo": "xxxxxxxxxxx",
        //         "digital_currency": "usdt",
        //         "digital_amount": "2",
        //         "chain_name": "bep20",
        //         "fiat_currency": "usd",
        //         "fiat_amount": '2',
        //         "status": 0
        //     }
        // })
        //selfCashOutMachine.dispatch("WITHDRAW")
    })
    // transition
    // base on result
}

HyperBrain.prototype.atmPrintBuyReceipt = function (data) {
    this.browser().send({ action: 'printing', receiptStatus: 'printing' })
    this._printBuyReceipt()
        .then(() => this.browser().send({ action: 'printing', receiptStatus: 'success' }))
        .catch(() => {
            this.browser().send({ action: 'printing', receiptStatus: 'failed' })
            setTimeout(() => {
                this.browser().send({ action: 'printing', receiptStatus: 'available' })
            }, 2500)
        })
}

//atmPrintReceipt()
// print order
HyperBrain.prototype.atmPrintReceipt = function (data) {

    this.browser().send({ action: 'printing', receiptStatus: 'printing' })
    this._printReceipt(data)
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
    // console.debug("this.tx.direction", this.tx.direction)
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
    // console.debug("atmSuccessLoginLogic")
    const rec = {}
    // find redirect
    if (this.tx.direction == 'cashOut') {
        rec.action = "atmSuccessLogin"
        rec.data = { path: '/scanCollectionAddress', render: this.buildRender(true) }
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
        if (order.status == 0) {
            self._transitionState('atmPaymentSellCurrency', {
                action: "atmPaymentSellCurrency",
                data: {
                    path: `/paymentSellCurrency?orderNo=${order.order_no}`,
                    paymentOrder: order,
                    render: self.buildRender(true)
                }
            })
            // 1  = finish
        } else if (order.status == 1) {
            // self._transitionState('atmPaymentSellSubmitSuccess', {
            //     action: "atmPaymentSellSubmitSuccess",
            //     data: {
            //         path: `/submitSellSuccess`,
            //         paymentOrder: order,
            //         render: self.buildRender(true)
            //     }
            // })
            self.atmTrader.stopPollOrder()
            //self.atmEnd()
        } else if(order.status == 2){
            self.atmTransitionWithdrawProcessStateWithdraw({
                paymentOrder: order
            })
        }else if(order.status == 3){
            self.atmTrader.stopPollOrder()
        }else if(order.status == 10){
            self.atmTrader.stopPollOrder()
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
    console.log("Err ", data, err)
    this.browser().send({
        action: 'atmErr',
        data: data
    })
}

HyperBrain.prototype.atmBuy = function () {

    // check  number close to last 5 stop
    if (this.atmTrader.acceptInBill() != true) {
        this.atmError(hyperError.errMsg["atmCashInBoxFull"], {})
        return
    }

    if (!this.tx) {
        this.tx = Tx.newTx(this.dataPath + "/tx-hyperdb")
    }
    this.tx.direction = "cashIn"// = Tx.update(this.tx, {direction: "cashIn"})
    //this.tx.cryptoCode = "BTC"
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
    if (!this.tx) {
        this.tx = Tx.newTx(this.dataPath + "/tx-hyperdb")
    }
    if (!this.billDispenser) {
        this.billDispenser = chooseBillDispenser(this.rootConfig)

        // watchout order
        const cassettes = Object.values(this.atmTrader.config.atmBoxIndex.out).map((cassette) => {
            console.log("=== watchout cassette order ", cassette.denomination.toString())
            return {
                denomination: BN(cassette.denomination),
                count: BN(cassette.remaining)
            }
        })

        this.billDispenser.init(
            {
                fiatCode: deviceConfig.billDispenser.fiatCode,
                cassettes: cassettes
            }
        )
    }
    // this.tx.fiatCode = "USD"
    this.tx.direction = "cashOut"// = Tx.update(this.tx, {direction: "cashIn"})
    // this.tx.cryptoCode = "BTC"

    if (!this.atmTrader.isLogin()) {
        this.atmTransitionLogin()
    } else {
        this.atmSuccessLogin()
    }
}

function chooseBillDispenser(config) {
    const billDispenserConfig = config.billDispenser
    const billDispenser = billDispenserConfig.model
    const isMockedDispenser = config.mockBillDispenser

    if (isMockedDispenser) {
        return require('./mocks/billdispenser').factory(billDispenserConfig)
    }

    return billDispenser === 'f56'
        ? require('../f56/f56-dispenser').factory(billDispenserConfig)
        : require('../puloon/puloon-dispenser').factory(billDispenserConfig)
}

HyperBrain.prototype.atmSell = function () {
    if (!this.tx) {
        this.tx = Tx.newTx(this.dataPath + "/tx-hyperdb")
    }
    this.tx.direction = "cashOutFake"// = Tx.update(this.tx, {direction: "cashIn"})
    // this.tx.cryptoCode = "BTC"
    //this._chooseFiat()

    if (!this.billDispenser) {
        this.billDispenser = chooseBillDispenser(this.rootConfig)

        // watchout order
        const cassettes = Object.values(this.atmTrader.config.atmBoxIndex.out).map((cassette) => {
            console.log("=== watchout cassette order ", cassette.denomination.toString())
            return {
                denomination: BN(cassette.denomination),
                count: BN(cassette.remaining)
            }
        })

        this.billDispenser.init(
            {
                fiatCode: deviceConfig.billDispenser.fiatCode,
                cassettes: cassettes
            }
        )
    }
    
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
    // console.log("=== _dispenseUpdate ", tx)
    const overZeroConf = this.exceedsZeroConf(tx)
    tx.status = 'confirmed'
    const status = 'confirmed'//tx.status
    const needToRedeem = !_.includes(status, ['instant', 'confirmed']) && overZeroConf
    // console.debug("status", status)
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
    // console.log("*** handle pick cryto code")
    const cryptoCode = this.tx.cryptoCode
    const coin = _.find(['cryptoCode', cryptoCode], this.atmTrader.config.coins)

    // console.log("*** handle update info")
    const updateRec = {
        direction: direction,
        fiatCode: this.fiatCode,
        commissionPercentage: BN(0).div(100),
        rawTickerPrice: BN(1)
    }

    const update = _.assignAll([this.tx, updateRec])

    delete update.fiat;
    this.tx = Tx.update(this.tx, update)
    // console.log("***** this.tx", this.tx)

    const response = this._getFiatButtonResponse()

    if (response.activeDenominations.isEmpty) return this._timedState('outOfCash')

    //
    console.log("*** handle printing")
    // this._transitionState('chooseFiat', {
    //     chooseFiat: response,
    //     receiptStatus: this.trader.receiptPrintingActive ? 'available' : 'disabled'
    // })

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

HyperBrain.prototype.saveHyperOrderTx = function (order, dispenserInfo) {
    const self = this;
    let chain = order.chain_name
    const coin = order.digital_currency

    const decimal8 = self.prepareConvertDecimalDigit(8)

    let newLayout = {
        id: this.tx.id,
        order_no: order.order_no || "",
        device_id: this.atmTrader.globalOptions.connectionInfo["ATM-Number"],
        chain_name: chain,
        digital_amount: decimal8.convert(order.digital_amount),
        "digital_currency": coin,
        "fiat_amount": order.fiat_amount,
        "fiat_currency": order.fiat_currency,
        "type": "atm_order_sell",
        "fee": 0,
        bills: [],
        created: new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '').replace(/-/, '/').replace(/-/, '/')
    }


    for (let count = 0; count < dispenserInfo.length; count++) {
        const bill = dispenserInfo[count]
        if (bill.provisioned > 0 ) {
            for (let provisioned1 = 0; provisioned1 < bill.provisioned; provisioned1++) {
                newLayout.bills.push({
                    atm_box_id: bill.atm_box_id,
                    "denomination": bill.denomination
                })
            }
        }
        if ( bill.number > 0) {
            for (let number1 = 0; number1 < bill.number; number1++) {
                newLayout.bills.push({
                    atm_box_id: bill.atm_box_id,
                    "denomination": bill.denomination
                })
            }
        }
    }

    return hyperdb.save(this.dataPath + "/tx-hyperdb", newLayout)
}

HyperBrain.prototype.saveHyperTx = function (order) {
    const self = this;
    let chain = this.atmTrader.tx.chain
    const coin = this.atmTrader.config.coinIndex[this.atmTrader.tx.coinname]
   
    const decimal8 = self.prepareConvertDecimalDigit(8)

    try {
        if (!chain) {
            const chainList = this.atmTrader.config.coinIndex[this.atmTrader.tx.coinname].chain_list
            chain = chainList[0]
        }
    } catch (e) {
        console.log("e", e)
        chain = self.atmTrader.tx.coinname
    }

    let newLayout = {
        id: this.tx.id,
        order_no: order.order_no || "",
        device_id: this.atmTrader.globalOptions.connectionInfo["ATM-Number"],
        chain_name: chain.chain,
        address: this.atmTrader.tx.toAddress,
        digital_amount: 0,
        "digital_currency":this.atmTrader.tx.coinname,
        "fiat_amount": this.tx.fiat,
        "fiat_currency": this.atmTrader.config.fiatCurrency,
        "type": "atm_order_buy",
        "fee": 0,
        bills: [],
        created: new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '').replace(/-/, '/').replace(/-/, '/')
    }
    newLayout.digital_amount = decimal8.convert((this.tx.fiat.toNumber() / coin.price * (1 - (coin.buyFee + coin.buyFeeRate)))) 
    for (let count = 0; count < this.tx.bills.length; count++) {
        const bill = this.tx.bills[count]
        newLayout.bills.push({
            atm_box_id: this.atmTrader.getInBox().id,
            "denomination": bill.fiat
        })
    }
    return hyperdb.save(this.dataPath + "/tx-hyperdb", newLayout)
}

HyperBrain.prototype._doSendCoins = function _doSendCoins() {
    return this._executeSendCoins()
}

HyperBrain.prototype.updateBillScreen = function updateBillScreen(blockedCustomer) {
    const bill = this.bill

    // No going back
    this.clearBill()
    this.lastRejectedBillFiat = BN(0)

    emit('billValidatorPending')

    var billUpdate
    // BACKWARDS_COMPATIBILITY 7.5.0-beta.1
    // const serverVersion = this.trader.serverVersion
    // if (!serverVersion || semver.lt(serverVersion, '7.5.0-beta.1')) {
    //     billUpdate = Tx.billUpdateDeprecated(bill)
    // } else {
    //     billUpdate = Tx.billUpdate(bill)
    // }
    billUpdate = Tx.billUpdate(bill)


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
        console.error('Attempting to reject, not in bill accepting state.')
        return billValidator.reject()
    }

    if (this.atmTrader.acceptInBill(lodash.get(this.tx, "bills", []).length) != true) {
        billValidator.reject()
        console.error("Cash box full")
        this.atmError(hyperError.errMsg["atmCashInBoxFull"], {})
        cashInMachine.dispatch("DONE")
        return
    }


    this.insertBill(data.denomination)
    console.log("=== _billRead data", JSON.stringify(data), " after insert bill=", this.bill)
    // console.log("=== _billRead data", this.bill)

    // check if hit the in limit 

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
    // const remainingFiatToInsert = BN.klass.min(this.balance(), failedTierThreshold).sub(fiatBeforeBill)

    // // Minimum allowed transaction
    // const minimumAllowedTx = this.tx.minimumTx

    // const amount = fiatBeforeBill.add(currentBill)
    // const triggerTx = { fiat: amount, direction: this.tx.direction }

    // const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
    // const isCompliant = _.isEmpty(nonCompliantTiers)

    // // If threshold is 0,
    // // the sms verification is being handled at the beginning of this.startScreen.
    // if (!isCompliant) {
    //     // Cancel current bill
    //     this.billValidator.reject()

    //     // If id tier force another verification screen
    //     const nonCompliantTier = _.head(nonCompliantTiers)
    //     const idTier = nonCompliantTier === 'idCardData' || nonCompliantTier === 'idCardPhoto'
    //     if (idTier) return this.transitionToVerificationScreen(nonCompliantTier)

    //     return this.runComplianceTiers(nonCompliantTiers)
    // }

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
            config: this.atmTrader.config
        }
    }

    this.browser().send(rec)
}

HyperBrain.prototype._start = function _start() {
    console.debug("__start")
    if (this.startDisabled) return

    // const cryptoCode = this.tx.cryptoCode
    // console.log("=== _start", cryptoCode, this.atmTrader.config)
    // const coin = _.find(['symbol', cryptoCode], this.atmTrader.config.coins)

    // const updateRec = {
    //     direction: 'cashIn',
    //     cashInFee: coin.cashInFee,
    //     commissionPercentage: BN(coin.cashInCommission).div(100),
    //     rawTickerPrice: BN(coin.rates.ask),
    //     minimumTx: this.billValidator.lowestBill(coin.minimumTx),
    //     cryptoNetwork: coin.cryptoNetwork
    // }

    // const update = _.assignAll([this.tx, updateRec])
    // this.tx = Tx.update(this.tx, update)

    // const amount = this.complianceAmount()
    // const triggerTx = { fiat: amount, direction: this.tx.direction }

    // const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
    // const isCompliant = _.isEmpty(nonCompliantTiers)

    // if (!isCompliant) {
    //     return this.smsCompliance()
    // }

    // const printPaperWallet = _.get('compliance.paperWallet')(deviceConfig) &&
    //     deviceConfig.kioskPrinter

    // if (printPaperWallet) {
    //     if (this.tx.cryptoCode !== 'BTC') {
    //         // Only BTC supported for now
    //         return this._idle()
    //     }
    //     return this._privateWalletPrinting()
    // }

    // todo printing facility check
    console.log("*** printer facility check")
    // this.browser().send({
    //     tx: this.tx,
    //     receiptStatus: this.trader.receiptPrintingActive ? 'available' : 'disabled'
    // })
}

HyperBrain.prototype._chooseCoinScreen = function () {
    return this.atmTransitionChooseCoin()
}

HyperBrain.prototype.stopEmptyBillValidator = function () {
    emit('ledsOff')

    this.disableBillValidator()
}

// HyperBrain.prototype.saveTx = function saveTx (tx) {
//     return hyperdb.save(this.dbRoot, tx)
//   }

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

    //const pollPromise = this.trader.poll()
    const atmTraderPollPromise = this.atmTrader.poll()
    this.idVerify.reset()
    this.currentPhoneNumber = null
    this.currentSecurityCode = null
    //this.numCoins = this.trader.coins.length
    this.tx = Tx.newTx(this.dataPath + "/tx-hyperdb")
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
    //this.trader.clearConfigVersion()
    // handle cancel transaction
    // this.trader.cancelDispense()
    //console.log("*** handle cancel trade")
    this.scanner.cancel()

    this.atmTrader.reset()

    this.tx = Tx.update(this.tx, { fiatCode: this.fiatCode })

    // pollPromise
    //     .then(() => this._idleByMode(this.localeInfo))
    //     .catch(console.log)

    atmTraderPollPromise.then(() => this._idleByMode(this.localeInfo))
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

HyperBrain.prototype._initTraderEvents = function _initTraderEvents() {
    const self = this
    this.atmTrader.on('pollUpdate', needsRefresh => this._pollUpdate(needsRefresh))
    this.atmTrader.on('networkDown', function () { self._networkDown() })
    this.atmTrader.on('networkUp', function () { self._networkUp() })
    this.atmTrader.on('error', function (err) { console.log(err.stack) })
    this.atmTrader.on('unpair', function () { self._unpair() })
    this.atmTrader.on('reboot', function () { self._reboot() })
    this.atmTrader.on('shutdown', function () { self._shutdown() })
    this.atmTrader.on('restartServices', function () { self._restartServices('Remote restart services', true) })
}

HyperBrain.prototype._pollUpdate = function _pollUpdate(needsRefresh) {
    this.fiatCode = this.atmTrader.config.fiatCurrency

    if (!this.isIdleState()) return

    this.sendRates()
    if (needsRefresh) this._idle()
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