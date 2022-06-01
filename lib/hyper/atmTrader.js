'use strict'
// reference to trader.js
const _ = require('lodash/fp');
const util = require('util')
const EventEmitter = require('events').EventEmitter

const _request = require('./request')

const NETWORK_DOWN_COUNT_THRESHOLD = 3
let networkDownCount = 0

let epipePoll = null

/*

*/
const ATMTrader = function (protocol, clientCert, connectionInfo, dataPath, relayedModel) {
    if (!(this instanceof ATMTrader)) return new ATMTrader(protocol, clientCert, connectionInfo, dataPath, relayedModel)
    EventEmitter.call(this)

    const globalOptions = {
        protocol,
        connectionInfo,
        clientCert
    }

    this.request = options => _request.request(this.configVersion, {
        ...globalOptions
        , token: this.profile.token
    }, options)

    this.globalOptions = globalOptions

    this.state = { state: 'initial', isIdle: false }
    this.profile = { token: null, smsVerification: null }
    this.tx = {
        needKYC: true,
        coinname: '',

        fiatAmount: 0,
        orderNo: 0,
        orderDetail: {},
        real: null
    }

    this.coins = []
    this.coinIndex = {};
    this.fiatCurrency = ''
    this.needKycAmount = 0
    this.supportParValue = []
    this.maxTradeAmount = 0
    this.cashOutRequestTimeout = 0

    // this.model = relayedModel ? relayedModel : 'unknown'
    // this.balanceRetries = 0
    // this.pollRetries = 0
    // this.state = { state: 'initial', isIdle: false }
    // this.configVersion = null
    // this.dispenseIntervalPointer = null
    // this.terms = false
    // this.termsConfigVersion = null
    // this.dataPath = dataPath
    //this.operatorInfo = operatorInfo.load(dataPath)
    //this.areThereAvailablePromoCodes = null

    // Start logs sync
    //setInterval(this.syncLogs.bind(this), LOGS_SYNC_INTERVAL)
    //this.syncLogs()

    this.orderPolling = null
}

util.inherits(ATMTrader, EventEmitter)


ATMTrader.prototype.resetTx = function () {
    this.state = { state: 'initial', isIdle: false }
    this.tx = {
        needKYC: true,
        coinname: '',

        fiatAmount: 0,
        orderNo: 0,
        orderDetail: {},
        real: null
    }

    this.coins = []
    this.coinIndex = {}
    this.fiatCurrency = ''
    this.needKycAmount = 0
    this.supportParValue = []
    this.maxTradeAmount = 0
    this.cashOutRequestTimeout = 0
}

ATMTrader.prototype.reset = function reset() {
    this.resetTx()
    this.resetProfile()
}

ATMTrader.prototype.resetProfile = function resetProfile() {
    this.profile = { token: null, smsVerification: null }
}

ATMTrader.prototype.pollOrder = function pollOrder() {
    console.debug("===== pollOrder")
    const self = this;
    if (!self.tx.orderNo) {
        return
    }
    console.debug("===== pollOrder", self.tx.orderNo)
    // 
    if (this.orderPolling != null){
        this.stopPollOrder()
    }
    
    this.orderPolling = setInterval(() => {
        console.debug("===== pollOrder interval ", self.tx.orderNo)
        self.getAtmOrder({
            order_no: self.tx.orderNo
        }).then((respond) => {
            if (self.tx.orderDetail.status != respond.body.data.status) {
                self.updateTx({ orderDetail: respond.body.data })
                // 
                self.emit("atmSellOrderUpdate")
            }
            
        }).catch((r)=>console.log(r))
    }, 3000)
}

ATMTrader.prototype.stopPollOrder = function pollOrder() {
    clearInterval(this.orderPolling)
    this.orderPolling = null;
}


ATMTrader.prototype.isLogin = function isLogin() {
    return this.profile.token ? true : false;
}

ATMTrader.prototype.updateTx = function updateTx(data) {

    // check tx.coinname

    // check kyc against

    this.tx = _.assign(this.tx, data)
    if (data.toAddress) {
        // update trader address
    }
    if (data.orderNo) {

    }

    // 监听 trade_type =2
    if (data.orderDetail && data.orderDetail.trade_type == 2) {
        // 
        setTimeout(() => {
            // this.emit("atmSellOrderUpdate")
        }, 2000)
        this.pollOrder()
    }

}

ATMTrader.prototype.updateUser = function updateUser() {
    const self = this;
    this.getUserInfo().then((respond) => {
        self.updateProfile({ personnel: respond.body.data })
        self.emit("traderPersonnelProfileUpdate")
    })
}

ATMTrader.prototype.updateProfile = function updateProfile(data) {
    this.profile = _.assign(this.profile, data)
    if (data.token) {
        this.updateUser()
    } else if (data.personnel) {

    }
}


ATMTrader.prototype.poll = function poll() {
    epipePoll = new Date()
    const path = '/client/get-atm-config'
    return this.request({
        path,
        method: 'GET',
        noRetry: true
    })
        .then(r => this.pollHandler(r.body))
        .catch(err => this.pollError(err))
}


ATMTrader.prototype.pollHandler = function pollHandler(res) {
    const self = this;
    this.coins = res.data.crypto_coin
    this.fiatCurrency = 'usd'
    this.needKycAmount = res.data.need_kyc_amount
    this.supportParValue = res.data.support_par_value
    this.maxTradeAmount = res.data.max_trade_amount
    this.cashOutRequestTimeout = 1800
    // res.data.amount_list
    // res.data.amount_list_has_kyc

    // retrive coin price
    new Promise((resolve) => {
        return resolve()
    }).then(async () => {
        for (let coin of self.coins) {
            try{
                const res = await self.getCoinPrice({ digital_currency: coin.name, fiat_currency: self.fiatCurrency })
                coin.price = res.body.data.rate
            }catch(err){
                console.log("Err getCoinPrice = ", err.message)
            }
        }

        self.coinIndex = _.keyBy("name")(self.coins)
        this.emit("atmSync")
    })


    /*
    this.locale = res.locale
    this.hasLightning = res.hasLightning
    this.operatorInfo = res.operatorInfo
    this.machineInfo = res.machineInfo
    this.receiptPrintingActive = res.receiptPrintingActive
    this.serverVersion = res.version

    // BACKWARDS_COMPATIBILITY 7.5
    // Servers before 7.5 uses old compliance settings
    if (res.version && semver.gte(res.version, '7.5.0-beta.0')) {
        this.triggers = res.triggers
    } else {
        this.triggers = createCompatTriggers(res)
    }

    machineInfo.save(this.dataPath, res.machineInfo)
        .catch(err => console.log('failure saving machine info', err))

    operatorInfo.save(this.dataPath, res.operatorInfo)
        .catch(err => console.log('failure saving operator info', err))

    networkDownCount = 0

    if (res.cassettes) {
        const mapper = (v, k) => k === 'denomination' ? BN(v) : v
        this.cassettes = _.map(mapValuesWithKey(mapper), _.orderBy(['denomination'], ['asc'], res.cassettes.cassettes))
        this.virtualCassettes = _.map(BN, res.cassettes.virtualCassettes)
    }

    this.twoWayMode = res.twoWayMode
    this.zeroConfLimit = res.zeroConfLimit
    this._rates = _.mapValues(_.mapValues(toBN), res.rates)
    this.coins = _.filter(coin => isActiveCoin(res, coin), _.map(_.mapValues(toBN), res.coins))
    this.balances = _.mapValues(toBN, res.balances)
    this.latestConfigVersion = res.configVersion
    this.areThereAvailablePromoCodes = res.areThereAvailablePromoCodes

    // BACKWARDS_COMPATIBILITY 7.4.9
    // Servers before 7.4.9 sends terms on poll
    if (res.version && semver.gte(res.version, '7.4.9')) {
        this.fetchTerms(res.configVersion)
    } else {
        this.terms = res.terms || false
    }

    // BACKWARDS_COMPATIBILITY 7.5.3
    // Servers before 7.5.3 don't send URLs to ping and for the speedtest.
    if (res.version && semver.gte(res.version, '7.5.3')) {
        this.urlsToPing = res.urlsToPing
        this.speedtestFiles = res.speedtestFiles
    } else {
        this.urlsToPing = [
            `us.archive.ubuntu.com`,
            `uk.archive.ubuntu.com`,
            `za.archive.ubuntu.com`,
            `cn.archive.ubuntu.com`
        ]
        this.speedtestFiles = [
            {
                url: `https://deb.debian.org/debian/pool/main/p/python-defaults/python-defaults_2.7.18-3.tar.gz`,
                size: 8900
            }
        ]
    }

    if (_.isEmpty(this.coins)) {
        return this.emit('networkDown')
    }

    if (res.reboot) this.emit('reboot')
    if (res.shutdown) this.emit('shutdown')
    if (res.restartServices) this.emit('restartServices')
    this.emit('pollUpdate', isNewState(this))
    this.emit('networkUp')
    */
}

ATMTrader.prototype.pollError = function pollError(err) {
    if (isNetworkError(err)) {
        networkDownCount++

        if (networkDownCount > NETWORK_DOWN_COUNT_THRESHOLD) {
            return this.emit('networkDown')
        }

        console.log('Temporary network hiccup [%s]', err.message)

        return
    }

    if (err.statusCode === 403) return this.emit('unpair')

    this.emit('atmTraderPollingErr', err)
    this.emit('networkDown')
}

function isNetworkError(err) {
    switch (err.name) {
        case 'RequestError':
        case 'ReadError':
        case 'ParseError':
            return true
        default:
            return false
    }
}


// 获取手机区域
ATMTrader.prototype.getAreaList = function getAreaList() {
    return this.request({
        path: '/client/get-country',
        method: 'GET'
    })
}

// 获取登录授权码
ATMTrader.prototype.getLogoAuthCode = function getLogoAuthCode() {
    return this.request({
        path: '/client/get-login-auth-code',
        method: 'POST'
    })
}

// 根据授权码获取登录token data={auth_code}
ATMTrader.prototype.getLoginTokenByAuthCode = function getLoginTokenByAuthCode(data) {
    return this.request({
        path: '/client/get-login-token-by-auth-code',
        method: 'POST',
        body: data
    })
}

// 发送登录验证码 data={phone_area, phone_number}
ATMTrader.prototype.sendSms = function sendSms(data) {
    const _data = {
        phone_area: data.phone_area.toString(),
        phone_number: data.phone_number.toString()
    }
    return this.request({
        path: '/client/send-sms',
        method: 'POST',
        body: _data
    })
}

// 手机号验证码登录 data={phone_area,phone_number,verify_code}
ATMTrader.prototype.getLoginTokenBySms = function getLoginTokenBySms(data) {
    const _data = {
        phone_area: data.phone_area.toString(),
        phone_number: data.phone_number.toString(),
        verify_code: data.verify_code.toString().slice(0,6)
    }

    const self = this;
    return this.request({
        path: '/client/get-login-token-by-sms',
        method: 'POST',
        body: _data
    }).then((res) => {
        self.updateProfile({ token: res.body.data.token })
        return res
    })
}

// 获取用户信息
ATMTrader.prototype.getUserInfo = function getUserInfo() {
    return this.request({
        path: '/client/get-hpy-user',
        method: 'POST'
    })
}

// 退出登录
ATMTrader.prototype.logout = function logout() {
    return this.request({
        path: '/client/logout',
        method: 'POST'
    })
}

// ATM机配置信息 用在polling
ATMTrader.prototype.getAtmConfig = function getAtmConfig(data) {
    return this.request({
        path: '/client/get-atm-config',
        method: 'GET'
    })
}

// 获取币价 data={digital_currency,fiat_currency} 
ATMTrader.prototype.getCoinPrice = function getCoinPrice(data) {
    return this.request({
        path: '/client/get-coin-price',
        method: 'POST',
        body: data
    })
}

// 钱包收款地址(买币) data={coin}
ATMTrader.prototype.getCoinAddress = function getCoinAddress(data) {
    return this.request({
        path: '/client/get-coin-address',
        method: 'POST',
        body: data
    })
}

// 提交订单(买币) data={digital_currency,chain_name,digital_amount,fiat_currency,fiat_amount,address,tag} 
ATMTrader.prototype.addAtmOrderBuy = function addAtmOrderBuy(data) {
    console.debug("addAtmOrderBuy ===", data)
    return this.request({
        path: '/client/add-atm-order-buy',
        method: 'POST',
        body: data
    })
}

// 提交订单(卖币) data={digital_currency,chain_name,digital_amount,fiat_currency,fiat_amount}
ATMTrader.prototype.addAtmOrderSell = function addAtmOrderSell(data) {
    console.debug("addAtmOrderSell === ", data)
    return this.request({
        path: '/client/add-atm-order-sell',
        method: 'POST',
        body: data
    })
}

// 查询订单 data={order_no}
ATMTrader.prototype.getAtmOrder = function getAtmOrder(data) {
    return this.request({
        path: `/client/get-atm-order?order_no=${data.order_no}`,
        method: 'GET'
    })
}

// 更新订单状态 data={order_no,old_status,new_status}
ATMTrader.prototype.updateAtmOrder = function updateAtmOrder(data) {
    return this.request({
        path: '/client/update-atm-order-status',
        method: 'POST',
        body: data
    })
}

// 用户已用额度
ATMTrader.prototype.getTradeAmount = function updateAtmOrder() {
    return this.request({
        path: '/client/get-trade-amount',
        method: 'GET'
    })
}


module.exports = ATMTrader