
const HyperBrainExtend = function (HyperBrain) {

    HyperBrain.prototype.atmTransitionInitialBillIn = function () {
        this._transitionState('atmInitialBillIn', {
            action: "atmInitialBillIn",
            data: {
                path: "/paperMoney",
                orderNo: this.atmTrader.tx.orderNo,
                render: this.buildRender() 
            }
        })
    }

    HyperBrain.prototype.atmTransitionConfirmAddress = function () {
        this._transitionState('atmConfirmAddress', {
            action: "atmConfirmAddress",
            data: {
                path: '/confirmAddress', 
                address: this.tx.toAddress,
                render: this.buildRender() 
            },
        })
    }

    HyperBrain.prototype.atmTransitionSelectWithdrawAmount = function _atmChooseSellConLogic() {
        this._transitionState('atmWithdrawAmount', {
            action: "atmWithdrawAmount",
            data: {
                path: "/chooseWithdrawalAmount",
                render: this.buildRender() 
            }
        })
    }

    HyperBrain.prototype.atmTransitionCoinInLanding = function () {
        this.setInProgress()
        this._transitionState("atmSuccessLogin", {
            data: { path: '/chooseBuyCoin', render: this.buildRender() }
        })
    }

    HyperBrain.prototype.atmTransitionCashOutLanding = function () {
        this.setInProgress()
        this._transitionState("atmSuccessLogin", {
            data: { path: '/chooseSellCoin', render: this.buildRender(true)}
        })
    }

    HyperBrain.prototype.setInProgress = function(){
        this.tx.start = true
        // write log file
    }
    
    HyperBrain.prototype.atmTransitionSelfCashOutLanding = function () {
        this.setInProgress()
        this._transitionState("atmSuccessLogin", {
            data: { path: '/scanCollectionAddress', render: this.buildRender(true) }
        })
    }

    HyperBrain.prototype.atmTransitionPaymentAddress = function () {
        this._transitionState('atmPaymentAddress', {
            action: "atmPaymentAddress",
            data: {
                path: "/paymentAddress",
                render: this.buildRender() 
            }
        })
    }

    HyperBrain.prototype.atmTransitionMerchantOffline = function (){
        this._transitionState('merchantServiceOffline', {
            action: "merchantServiceOffline",
            data: {
                path: "/merchantServiceOffline",
                render: this.buildRender(true)
            }
        })
    }

    HyperBrain.prototype.atmTransitionLogin = function () {
        this._transitionState('atmLogin', {
            action: "atmLogin",
            data: {
                path: "/login",
                render: this.buildRender(true,{ autoNext: false, timeout: 120 })
            }
        })
    }

    HyperBrain.prototype.atmTransitionChooseCoin = function () {
        this._transitionState('chooseCoin', {
            action: "chooseCoin",
            data: {
                path: "/home",
            }
        })
    }

    HyperBrain.prototype.atmTransitionVerifySMS = function () {
        this._transitionState('atmVerifySMS', {
            action: "atmVerifySMS",
            data: {
                path: `/smsVerification`,
                render: this.buildRender(true, { autoNext: false, timeout: 120 })
            }
        })
    }

    HyperBrain.prototype.atmTransitionConfirmDepositDetail = function () {
        this._transitionState('atmConfirmDepositDetail', {
            action: "atmConfirmDepositDetail",
            data: {
                path: "/depositDetail",
                render: this.buildRender(true, {autoNext: true}) 
            }
        })
    }
    
    HyperBrain.prototype.atmTransitionConfirmDepositInformation = function () {
        this._transitionState('atmConfirmDepositInformation', {
            action: "atmConfirmDepositInformation",
            data: {
                path: "/checkInformation",
                render: this.buildRender(true) 
            }
        })
    }

    HyperBrain.prototype.atmTransisstionSubmitSuccess = function () {
        this._transitionState('atmBuySucess', {
            action: "atmBuySucess",
            data: {
                // add profile
                path: "/submitSuccess"
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStatePending = function (data = {}) {
        this._transitionState('atmWithdrawProcessPending', {
            action: "atmWithdrawProcessPending",
            data: {
                path: "/sellCoinUnpaid",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStateCompleted = function (data = {}) {
        this._transitionState('atmWithdrawProcessCompleted', {
            action: "atmWithdrawProcessCompleted",
            data: {
                path: "/sellCoinUnpaid",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStateWithdraw = function (data = {}) {
        this._transitionState('atmWithdrawProcessWithdraw', {
            action: "atmWithdrawProcessWithdraw",
            data: {
                path: "/scanCashConfirm",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStateWithdrawing = function (data = {}) {
        this._transitionState('atmWithdrawProcessWithdrawing', {
            action: "atmWithdrawProcessWithdrawing",
            data: {
                path: "/sellCoinUnpaid",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmErrorTransactionLogic = function (data = {}) {
        this._transitionState('atmWithdrawScanError', {
            action: "atmWithdrawScanError",
            data: {
                path: "/sellCoinUnpaid",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStateRefunded = function (data = {}) {
        this._transitionState('atmWithdrawProcessRefunded', {
            action: "atmWithdrawProcessRefunded",
            data: {
                path: "/sellCoinUnpaid",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionSellOrderReview = function (data = {}) {
        this._transitionState('atmPaymentSellCurrency', {
            force:true,
            action: "atmPaymentSellCurrency",
            data: {
                path: `/paymentSellCurrency?orderNo=${data.order_no}`,
                paymentOrder: data,
                render: this.buildRender(true) 
            }
        })
    }
}

module.exports = HyperBrainExtend