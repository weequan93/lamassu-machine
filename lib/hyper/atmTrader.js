'use strict'
// reference to trader.js
const _ = require('lodash/fp');
const util = require('util')
const EventEmitter = require('events').EventEmitter
const lodash = require('lodash')
const bills = require('../../lib/f56/bills')

const _request = require('./request')
const logs = require('../../lib/logs')

const NETWORK_DOWN_COUNT_THRESHOLD = 3
let networkDownCount = 0

// const DISPENSE_TIMEOUT = 120000
// const NETWORK_TIMEOUT = 5000
const LOGS_SYNC_INTERVAL = 60 * 1000

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
    //console.log("=== globalOptions", JSON.stringify(globalOptions))
    this.request = options => _request.request(this.configVersion, {
        ...globalOptions
        , token: this.profile.token
    }, options)

    this.globalOptions = globalOptions

    this.state = { state: 'initial', isIdle: false }
    this.profile = {
        token: null, smsVerification: null, 
        today_buy_amount: 0, today_sell_amount: 0,
        remaining_buy_amount: 0, remaining_sell_amount: 0,
        remaining_kyc_buy_amount: 0, remaining_kyc_sell_amount: 0
    }
    this.tx = {
        type: "",
        needKYC: true,
        coinname: '',

        fiatAmount: 0,
        orderNo: 0,
        orderDetail: {},
        real: null
    }
    this.balances = []

    this.config = this.generateConfig({})

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
    setInterval(this.syncLogs.bind(this), LOGS_SYNC_INTERVAL)
    this.syncLogs()

    this.orderPolling = null
}

util.inherits(ATMTrader, EventEmitter)

ATMTrader.prototype.generateConfig = function (atmConfigs){
    const self = this

    const base = Object.assign(self.config || {}, {
        _coins: [],
        _coinIndex: {},
        fiatCurrency: 'usd',
        fiatSymbol: "$",
        phoneCode: "65",
        needKycAmount: 0,
        //supportParValue: [],
        
        maxTradeAmount: 0,
        cashOutRequestTimeout: 1800,
        atmBoxIndex: {
            in: {},
            out: {}
        },
        minNonKYCAmount: 0,
        maxNonKYCAmount: 0,
        minKYCAmount: 0,
        maxKYCAmount: 0,
        predefinedNonKYCWithdrawList: [],
        predefinedKYCWithdrawList: []
        // atmBoxIn: []
    }) 

    if (atmConfigs.buy_coins && Array.isArray(atmConfigs.buy_coins)) {
        // group by coin
        base._coinIndex = atmConfigs.buy_coins.reduce((acc, curr) => {
            // coin key
            if (!acc[curr.symbol]) {
                acc[curr.symbol] = {
                    "symbol": curr.symbol,
                    "name": curr.name,
                    "logo": curr.logo,
                    "symbol_display": curr.symbol_display,
                    "chain_list": [],
                    "_chain_list": {},
                    "_chain": curr.chain,
                    "decimals": curr.decimals,
                    "canBuy": false,
                    "canSell": false
                }
            }
            acc[curr.symbol].canBuy = true
            if (!acc[curr.symbol]._chain_list[curr.id]){
                acc[curr.symbol]._chain_list[curr.id] = curr
                acc[curr.symbol]._chain_list[curr.id].canSell = false
                acc[curr.symbol]._chain_list[curr.id].canBuy = false
                acc[curr.symbol]["chain_list"].push(curr)
            }
            acc[curr.symbol]._chain_list[curr.id].canBuy = true
            return acc
        }, {})
        
        base._coins = Object.values(base._coinIndex)
    }

    if (atmConfigs.sell_coins && Array.isArray(atmConfigs.sell_coins)) {
        // group by coin
        base._coinIndex = atmConfigs.sell_coins.reduce((acc, curr) => {
            // coin key
            if (!acc[curr.symbol]) {
                acc[curr.symbol] = {
                    "symbol": curr.symbol,
                    "name": curr.name,
                    "logo": curr.logo,
                    "symbol_display": curr.symbol_display,
                    "chain_list": [],
                    "_chain_list": {},
                    "_chain": curr.chain,
                    "decimals": curr.decimals,
                    "canBuy": false,
                    "canSell": false
                }
            }
            acc[curr.symbol].canSell = true
            if (!acc[curr.symbol]._chain_list[curr.id]) {
                acc[curr.symbol]._chain_list[curr.id] = curr
                acc[curr.symbol]._chain_list[curr.id].canSell = false
                acc[curr.symbol]._chain_list[curr.id].canBuy = false
                acc[curr.symbol]["chain_list"].push(curr)
            }
            acc[curr.symbol]._chain_list[curr.id].canSell = true
            return acc
        }, base._coinIndex)

        base._coins = Object.values(base._coinIndex)
    }

    if (atmConfigs.fiat_curreny && Array.isArray(atmConfigs.fiat_curreny) && atmConfigs.fiat_curreny.length > 0) {
        base.fiatCurrency = atmConfigs.fiat_curreny[0]
        base.fiatSymbol = bills[atmConfigs.fiat_curreny[0]].symbol
    }
    if (self.globalOptions.connectionInfo["Phone-Code"]){
        base.phoneCode = self.globalOptions.connectionInfo["Phone-Code"]
    }
    if (atmConfigs.need_kyc_amount != null && atmConfigs.need_kyc_amount >= 0) {
        base.needKycAmount = atmConfigs.need_kyc_amount
    }
    // if (atmConfigs.support_par_value != null && Array.isArray(atmConfigs.support_par_value)){
    //     base.supportParValue = atmConfigs.support_par_value
    // }
    if (atmConfigs.boxes && Array.isArray(atmConfigs.boxes)) {
        // let atmBoxIn = []
        base.atmBoxIndex = atmConfigs.boxes.reduce((acc, curr)=>{
            let direction = acc.in
            if(curr.type != 0){
                direction = acc.out
                curr.remaining = curr.current_num_money
                curr.valid = curr.current_num_money > 0
                // atmBoxIn.push(curr)
            }else{
                curr.remaining = curr.num_money - curr.current_num_money
                curr.valid = curr.remaining > 0
            }
            if(!direction[curr.denomination]){
                direction[curr.denomination] = curr
            }
            return acc;
        }, {in: {}, out: {}})

        base.atmBoxes = atmConfigs.boxes
        // base.atmBoxIn = atmBoxIn
    }
    if (atmConfigs.max_trade_amount != null && atmConfigs.max_trade_amount >= 0) {
        base.maxTradeAmount = atmConfigs.max_trade_amount
    }
    if (atmConfigs.min_amount != null){
        base.minNonKYCAmount = atmConfigs.min_amount
    }
    if (atmConfigs.max_amount != null) {
        base.maxNonKYCAmount = atmConfigs.max_amount
    }
    if (atmConfigs.min_amount_kyc != null) {
        base.minKYCAmount = atmConfigs.min_amount_kyc
    }
    if (atmConfigs.max_amount_kyc != null) {
        base.maxKYCAmount = atmConfigs.max_amount_kyc
    }
    if (atmConfigs.amount_list && Array.isArray(atmConfigs.amount_list)) {
        base.predefinedNonKYCWithdrawList = atmConfigs.amount_list
    }
    if (atmConfigs.amount_list_kyc && Array.isArray(atmConfigs.amount_list_kyc)) {
        base.predefinedKYCWithdrawList = atmConfigs.amount_list_kyc
    }
    return base;
}

ATMTrader.prototype.syncLogs = function syncLogs() {
    // console.log("=== syncLogs remove 5 day old log")

    const fiveDaysAgo = (() => {
        let date = new Date()

        // Notice that `setDate()` can take negative values. So if you'd take
        // -2 days on the 1st of April you'd get the 30th of March. Several
        // examples can be seen at: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/setDate#Using_setDate()
        date.setDate(date.getDate() - 5)
        return date
    })()

    return logs.removeLogFiles(fiveDaysAgo)
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

ATMTrader.prototype.getInBox = function(){
    const inBox = lodash.get( this.config, "atmBoxIndex.in.0", null)
    return inBox;
}

ATMTrader.prototype.getOutBox = function(denomination){
    const inBox = lodash.get( this.config, "atmBoxIndex.out."+denomination, null)
    return inBox;
}


ATMTrader.prototype.acceptInBill = function(inBillCount = 0){
    const remaining = lodash.get( this.getInBox(), "remaining", 0)
    return (remaining - inBillCount) > 0;
}

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

    this.config = this.generateConfig({})
}

ATMTrader.prototype.reset = function reset() {
    this.resetTx()
    this.resetProfile()
}

ATMTrader.prototype.resetProfile = function resetProfile() {
    this.profile = { token: null, smsVerification: null }
}

ATMTrader.prototype.poolLogin = function poolLogin({ auth_code, valid_time }) {
    console.debug("===== poolLogin")
    const self = this;
    if (self.auth_code) {
        // perform reset
        this.stopPoolLogin()
        return
    }

    self.auth_code = auth_code;
    this.loginCutoff = setTimeout(function(){
        self.stopPoolLogin()
    }, valid_time * 1000)

    this.loginPooling = setInterval(function(){
         // fire check login api
        self.getLoginTokenByAuthCode({ "auth_code": self.auth_code }).then((respond)=>{
            if (respond.body.code==0){
                // TODO handle new code
            } else if (respond.body.code == 100404){
                console.log("getLoginTokenByAuthCode continue waiting" + respond.body.msg)
            }else{
                console.error("getLoginTokenByAuthCode error" + respond.body.msg)
            }
            // respond.body.data
        }).catch((err)=>{
            console.error("getLoginTokenByAuthCode error" + err.message)
        })
       
    }, 2 * 1000)

}

ATMTrader.prototype.stopPoolLogin = function stopPoolLogin (){
    if (this.loginCutoff!= null){
        clearTimeout(this.loginCutoff)
        this.loginCutoff = null
    }
    if (this.loginPooling != null ){
        clearInterval(this.loginPooling)
        this.loginPooling = null
    }
    // reset code to empty
    this.auth_code = ""
}

ATMTrader.prototype.pollOrder = function pollOrder() {
    console.debug("===== pollOrder")
    const self = this;
    if (!self.tx.orderNo) {
        return
    }
    console.debug("===== pollOrder", self.tx.orderNo)
    // only pool for 1 order
    if (this.orderPolling != null) {
        this.stopPollOrder()
    }

    this.orderPolling = setInterval(() => {
        if (self.tx.orderNo == 0) {
            console.debug("==== pollOrder forgot to turn off, switch off here")
            this.stopPollOrder()
            return
        }
        console.debug("===== pollOrder interval ", self.tx.orderNo)
        self.getAtmOrder({
            order_no: self.tx.orderNo
        }).then((respond) => {
            console.debug("=== pollOrder ", self.tx, respond.body)
            if (self.tx.orderDetail.status != respond.body.data.status) {
                self.updateTx({ orderDetail: respond.body.data })
                // 
                console.debug("=== atmSellOrderUpdate")
                self.emit("atmSellOrderUpdate")
            }

        }).catch((r) => console.log(r))
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
        if (data.noPool == true){
            return
        }
        setTimeout(() => {
            // this.emit("atmSellOrderUpdate")
        }, 2000)
        this.pollOrder()
    }

}

ATMTrader.prototype.updateTodayAmount = function updateTodayAmount() {
    const self = this;
    return this.getTradeAmount().then((respond)=>{
        //console.debug("getTradeAmount respond", respond.body)
        // respond.body = {
        //     data: {
        //         buy_amount: 0,
        //         sell_amount: 0
        //     }
        // }
        const remaining_buy_amount = this.config.maxNonKYCAmount - respond.body.data.buy_amount
        const remaining_sell_amount = this.config.maxNonKYCAmount - respond.body.data.sell_amount

        const remaining_kyc_buy_amount = this.config.maxKYCAmount - respond.body.data.buy_amount
        const remaining_kyc_sell_amount = this.config.maxKYCAmount - respond.body.data.sell_amount

        self.updateProfile({
            personnel: {
                today_buy_amount: respond.body.data.buy_amount,
                today_sell_amount: respond.body.data.sell_amount,
                // is this sum up ?
                remaining_buy_amount: remaining_buy_amount < 0 ? 0 : remaining_buy_amount,
                remaining_sell_amount: remaining_sell_amount < 0 ? 0 : remaining_sell_amount,
                remaining_kyc_buy_amount: remaining_kyc_buy_amount < 0 ? 0 : remaining_kyc_buy_amount,
                remaining_kyc_sell_amount: remaining_kyc_sell_amount < 0 ? 0 : remaining_kyc_sell_amount
            }
        })
        self.emit("traderPersonnelProfileUpdate")
    })  
}

ATMTrader.prototype.updateUser = async function updateUser() {
    const self = this;
    return this.getUserInfo().then((respond) => {
        self.updateProfile({ personnel: respond.body.data })
        //self.emit("traderPersonnelProfileUpdate")
    }).then(()=>{
        return self.updateTodayAmount()
    })/*.catch((e) => {
        self.updateProfile({
            personnel: {
                'phone_area': '86',
                'phone_number': '12866717742',
                'has_kyc': 1,
            }
        })
        self.emit("traderPersonnelProfileUpdate")
    })*/
}

ATMTrader.prototype.updateProfile = function updateProfile(data, callback) {

    if(data.personnel){
        this.profile.personnel = _.assign(this.profile.personnel, data.personnel)
    }else{
        this.profile = _.assign(this.profile, data)
    }
    if (data.token) {
        this.updateUser().then(()=>{
            if(callback){
                callback()
            }
        })
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


ATMTrader.prototype.pollHandler = function (res) {
    //console.log("=== pollHandler", JSON.stringify(res))
    const self = this;

    this.config = this.generateConfig(res.data)

    // retrive coin price
    new Promise((resolve) => {
        return resolve()
    }).then(async () => {
        const cname = lodash.get(self, "tx.coinname", "")
        if (cname == ""){
            const _c = self.config._coins
            for (let coini in _c) {
                let coin = _c[coini]
                try {
                    const res = await self.getCoinPrice({ chain: coin._chain, digital_currency: coin.symbol, fiat_currency: self.config.fiatCurrency || "usd" })
                    if(res.body.code != 0){
     
                    }
                    // console.debug(">>>>>>>>>>>>>>>>>>>>>>> getCoinPrice", coin._chain, coin.symbol,res.body)
                    //console.debug("res.body", res.body)
                    coin.price = res.body.data.rate
                    coin.sellFee = res.body.data.sell_rate || 0
                    coin.buyFee = res.body.data.buy_rate || 0
                    coin.sellFeeRate = res.body.data.sell_fee_rate || 0
                    coin.buyFeeRate = res.body.data.buy_fee_rate || 0
                    
                } catch (err) {
                    //console.debug("Err getCoinPrice = ", JSON.stringify(coin), err, JSON.stringify(res))
                    if(coin.name=="hpy_test"){
                        coin.price = 1;
                        coin.sellFee =  0.01
                        coin.buyFee = 0.01
                        coin.sellFeeRate = 0.01
                        coin.buyFeeRate = 0.01
                    }else{
                        coin.price = 1;
                        coin.sellFee = 1
                        coin.buyFee = 1
                        coin.sellFeeRate = 1
                        coin.buyFeeRate = 1
                    }
                }
            }

            self.config.coinIndex = lodash.keyBy(_c, 'name');  
            self.config.coins = Object.values(self.config.coinIndex)
            //console.debug(">>>> ", self.config.coins)
        }
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
    
    this.emit('networkUp')
    */
    this.emit('pollUpdate', isNewState(this))
    this.emit('networkUp')
}

ATMTrader.prototype.pollError = function pollError(err) {
    if (isNetworkError(err)) {
        networkDownCount++

        if (networkDownCount > NETWORK_DOWN_COUNT_THRESHOLD) {
            return this.emit('networkDown')
        }

        console.log('ATMTrader Temporary network hiccup [%s]', err.message)

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

let oldState = {}
function isNewState(res) {
    const pare = r => ({
        twoWayMode: r.twoWayMode,
        locale: r.locale,
        coins: _.map('cryptoCode', r.coins)
    })

    if (_.isEqual(pare(res), oldState)) return false

    oldState = pare(res)
    return true
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
    data.phone_area  = data.phone_area.replace(/[^\d]/g, '');
    // drop + 
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
    data.phone_area  = data.phone_area.replace(/[^\d]/g, '');
    const _data = {
        phone_area: data.phone_area.toString(),
        phone_number: data.phone_number.toString(),
        verify_code: data.verify_code.toString().slice(0, 6)
    }

    const self = this;
    return this.request({
        path: '/client/get-login-token-by-sms',
        method: 'POST',
        body: _data
     })//.then((res) => {
    //     console.log("res", res, res.body)
    //     if(res.body.code ==0){
    //         self.updateProfile({ token: res.body.data.token })
    //         return res
    //     }
      
    // })
    /*.catch((err) => {
        self.updateProfile({ token: "res.body.data.token" })
        return {
            body: {
                code: 0,
                data: { token: "res.body.data.token" }
            }, statusCode: 200
        }
    })*/
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
    //console.log("=== getCoinPrice", JSON.stringify(data))
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
    console.log("=== addAtmOrderBuy", JSON.stringify(data))
    return this.request({
        path: '/client/add-atm-order-buy',
        method: 'POST',
        body: data
    })
}

// 提交订单(卖币) data={digital_currency,chain_name,digital_amount,fiat_currency,fiat_amount}
ATMTrader.prototype.addAtmOrderSell = function addAtmOrderSell(data) {
    console.log("=== addAtmOrderSell", JSON.stringify(data))
    return this.request({
        path: '/client/add-atm-order-sell',
        method: 'POST',
        body: data
    })
}

// 查询订单 data={order_no}
ATMTrader.prototype.getAtmOrder = function getAtmOrder(data) {
    return this.request({
        path: `/client/get-atm-order`,
        qs: `orderNo=${data.order_no}`,
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
ATMTrader.prototype.getTradeAmount = function getTradeAmount() {
    return this.request({
        path: '/client/get-trade-amount',
        method: 'GET'
    })
}

// 
ATMTrader.prototype.beforeSellSplitMoney = function beforeSellSplitMoney(data) {
    console.log("=== beforeSellSplitMoney", JSON.stringify(data))
    return this.request({
        path: '/client/before-sell-spit-money',
        method: 'POST',
        body: data
    })
}

// 初始化买单
ATMTrader.prototype.initAtmOrderBuy = function initAtmOrderBuy (data) {
    // address
    console.log("=== initAtmOrderBuy", JSON.stringify(data))
    return this.request({
        path: '/client/init-atm-order-buy',
        method: 'POST',
        body: data
    })
}

// 是否开放买币功能
ATMTrader.prototype.isATMOperating = function initAtmOrderBuy() {
    // address
    console.log("=== isATMOperating")
    return this.request({
        path: '/client/isOpenBuyCoin',
        method: 'POST'
    })
}

// 是否开放买币功能
ATMTrader.prototype.addATMInBill = function addATMInBill(data) {
    console.log("=== addATMInBill", JSON.stringify(data))
    return this.request({
        path: '/client/money-notice',
        method: 'POST',
        body: data
    })
}


module.exports = ATMTrader