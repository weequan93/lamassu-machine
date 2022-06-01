
const HyperBrainExtend = function (HyperBrain) {

    HyperBrain.prototype.atmTransitionInitialBillIn = function () {
        this._transitionState('atmInitialBillIn', {
            action: "atmInitialBillIn",
            data: {
                path: "/paperMoney",
                render: this.buildRender() 
            }
        })
    }

    HyperBrain.prototype.atmTransitionConfirmAddress = function () {
        this._transitionState('atmConfirmAddress', {
            action: "atmConfirmAddress",
            data: {
                path: '/confirmAddress', 
                address: this.atmTrader.tx.toAddress,
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
        this._transitionState("atmSuccessLogin", {
            data: { path: '/chooseBuyCoin', render: this.buildRender() }
        })
    }

    HyperBrain.prototype.atmTransitionCashOutLanding = function () {
        this._transitionState("atmSuccessLogin", {
            data: { path: '/chooseSellCoin', render: this.buildRender(true)}
        })
    }

    HyperBrain.prototype.atmTransitionSelfCashOutLanding = function () {
        this._transitionState("atmSuccessLogin", {
            data: { path: '/scanCollectionAddress' }
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

    HyperBrain.prototype.atmTransitionLogin = function () {
        this._transitionState('atmLogin', {
            action: "atmLogin",
            data: {
                path: "/login",
                render: this.buildRender()
            }
        })
    }

    HyperBrain.prototype.atmTransitionChooseCoin = function () {
        this._transitionState('chooseCoin', {
            action: "chooseCoin",
            data: {
                path: "/home",
                // cassettes: this.cassettes,
                // coins: this.atmTrader.coins,
                // fiatCurrency: this.atmTrader.fiatCurrency,
                // needKycAmount: this.atmTrader.needKycAmount,
                // supportParValue: this.atmTrader.supportParValue,
                // maxTradeAmount: this.atmTrader.maxTradeAmount
            }
        })
    }

    HyperBrain.prototype.atmTransitionVerifySMS = function () {
        this._transitionState('atmVerifySMS', {
            action: "atmVerifySMS",
            data: {
                path: `/smsVerification`,
                render: this.buildRender(true) 
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
                path: "/withdrawProcessPending",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStateCompleted = function (data = {}) {
        this._transitionState('atmWithdrawProcessCompleted', {
            action: "atmWithdrawProcessCompleted",
            data: {
                path: "/withdrawProcessCompleted",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStateWithdraw = function (data = {}) {
        this._transitionState('atmWithdrawProcessWithdraw', {
            action: "atmWithdrawProcessWithdraw",
            data: {
                path: "/withdrawProcessWithdraw",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStateWithdrawing = function (data = {}) {
        this._transitionState('atmWithdrawProcessWithdrawing', {
            action: "atmWithdrawProcessWithdrawing",
            data: {
                path: "/withdrawProcessWithdrawing",
                ...data
            }
        })
    }

    HyperBrain.prototype.atmTransitionWithdrawProcessStateRefunded = function (data = {}) {
        this._transitionState('atmWithdrawProcessRefunded', {
            action: "atmWithdrawProcessRefunded",
            data: {
                path: "/withdrawProcessRefunded",
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