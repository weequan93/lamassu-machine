
const deviceConfig = require('../../device_config.json')

const HyperBrainExtend = function (HyperBrain) {

    HyperBrain.prototype.processAction = function processAction(action, stateMachine) {
        console.debug("processAction > ", action)
        switch (action) {
            case 'atmInitialBill':
                this.atmInitialBill()
                break;
            case 'atmStopScanQR':
                this.atmStopScanQR()
                break;
            case 'atmTransitionCoinInLanding':
                this.atmTransitionCoinInLanding()
                break;
            case 'atmTransitionCashOutLanding':
                this.atmTransitionCashOutLanding()
                break;
            case 'atmTransitionSelfCashOutLanding':
                this.atmTransitionSelfCashOutLanding()
                break;
            case 'atmStartScanQR':
                this.atmStartScanQR()
                break;
            case 'atmAcceptingFirstBill':
                this.atmAcceptingFirstBill()
                break;
            case 'stopATMTraderPolling':
                this.stopATMTraderPolling()
                break;
            case 'atmTransitionInitialBillIn':
                this.atmTransitionInitialBillIn()
                break;
            // case 'atmCashInSessionStartLogic':
            //     this.atmCashInSessionStartLogic()
                break;
            case 'atmCleanUpLogic':
                this.atmCleanUpLogic()
                break;
            case 'stopEmptyBillValidator':
                this.stopEmptyBillValidator()
                break;
            case '_connectedBrowser':
                this._connectedBrowser()
                break;
            case 'atmCashOutLanding':
                this.atmCashOutLanding()
                break;
            case 'atmAllInitialState':
                this.atmAllInitialState()
                break;
            case 'atmMachineProcessBack':
                this.atmMachineProcessBack()
                break
            case 'atmSuccessLogin':
                this.atmSuccessLogin()
                break
            case 'atmSuccessLoginLogic':
                this.atmSuccessLoginLogic()
                break
            case 'atmWithdrawaActionLogic':
                this.atmWithdrawaActionLogic()
                break
            case 'atmTransitionPaymentAddress':
                this.atmTransitionPaymentAddress()
                break
            case 'validateInMerchant':
                this.validateInMerchant()
                break
            case 'handleValidateInOverTransactionLimit':
                this.handleValidateInOverTransactionLimit()
                break
            case 'handleValidateOutOverTransactionLimit':
                this.handleValidateOutOverTransactionLimit()
                break
            case 'atmGetWalletCoinAddressLogic':
                this.atmGetWalletCoinAddressLogic()
                break
            case 'atmTransitionSelectWithdrawAmount':
                this.atmTransitionSelectWithdrawAmount()
                break
            case 'atmSellOrderLogic':
                this.atmSellOrderLogic()
                break
            case 'atmCollectionActionLogic':
                this.atmCollectionActionLogic()
                break
            case 'atmErrorTransactionLogic':
                this.atmErrorTransactionLogic()
                break
            case 'updateBillLogic':
                this.updateBillLogic()
                break
            case 'atmTransitionConfirmDepositDetail':
                this.atmTransitionConfirmDepositDetail()
                break
            
            case 'atmTransitionConfirmDepositInformation':
                this.atmTransitionConfirmDepositInformation()
                break
            case 'atmConfirmDepositLogic':
                this.atmConfirmDepositLogic()
                break
            case 'atmTransitionConfirmAddress':
                this.atmTransitionConfirmAddress()
                break



            // idCardData actions
            case 'scanPDF':
                this.scanPDF()
                break
            case 'authorizeIdCardData':
                this.authorizeIdCardData()
                break
            // idCardPhoto actions
            case 'scanPhotoCard':
                this.scanPhotoCard()
                break
            case 'authorizePhotoCardData':
                this.authorizePhotoCardData()
                break
            // facephoto actions
            case 'retryTakeFacephoto':
            case 'takeFacephoto':
                this.takeFacephoto()
                break
            case 'authorizeFacephotoData':
                this.authorizeFacephotoData()
                break
            // generic actions
            case 'timeoutToScannerCancel':
                this.timeoutToScannerCancel(stateMachine)
                break
            case 'transitionScreen':
                this.transitionScreen()
                break
            case 'timeoutToFail':
                setTimeout(() => stateMachine.dispatch('FAIL'), _.get('scanner.timeout', this.rootConfig))
                break
            case 'success':
                this.smsFlowHandleReturnState()
                break
            case 'failure':
                this.failedCompliance = stateMachine.key
                this.failedComplianceValue = this.requirementAmountTriggered[this.failedCompliance]
                this.smsFlowHandleReturnState()
                break
            // sanctions
            case 'triggerSanctions':
                this.triggerSanctions()
                break
            case 'sanctionsFailure':
                this._timedState('sanctionsFailure')
                break
            // suspend
            case 'triggerSuspend':
                this.triggerSuspend()
                break
            // block
            case 'triggerBlock':
                this.triggerBlock()
                break
            // us ssn
            case 'saveUsSsn':
                this.saveUsSsn()
        }
    }

    HyperBrain.prototype._processReal = function _processReal(req) {
        const model = deviceConfig.cryptomatModel || 'sintra'
        console.log("_processReal >> ", req.button)

        switch (req.button) {
            // atm  业务
            case 'atmUpdateSellOrder':
                this.atmUpdateSellOrder(req.data)
                break
            case 'atmSendSMS':
                this.atmSendSMS(req.data)
                break
            case 'atmVerifySMS':
                this.atmVerifySMS(req.data)
                break
            case 'atmProcessBack':
                this.atmProcessBack()
                break;
            case 'atmEnd':
                this.atmEnd()
                break;
            case 'atmBuy':
                this.atmBuy(req.data)
                break
            case 'atmChooseBuyCoin':
                this.atmChooseBuyCoin(req.data)
                break;
            case 'atmGetWalletCoinAddress':
                this.atmGetWalletCoinAddress()
                break
            case 'atmConfirmAddress':
                this.atmConfirmAddress(req.data)
                break
            case 'atmConfirmDepositDetail':
                this.atmConfirmDepositDetail()
                break
            case 'atmConfirmDepositInformation':
                this.atmConfirmDepositInformation()
                break;
            case 'atmConfirmDeposit':
                this.atmConfirmDeposit()
                break;
            case 'atmSell':
                this.atmSell()
                break;
            case 'atmCollectSellOrder':
                this.atmCollectSellOrder()
                break;
            case 'atmChooseSellCoin':
                this.atmChooseSellCoin(req.data)
                break;
            case 'atmSellOrder':
                this.atmSellOrder(req.data)
                break;
            case 'atmWithdraw':
                this.atmWithdraw(req.data)
                break
            case 'atmConfirmEnd':
                this.atmConfirmEnd()
                break
            case 'atmTimeout':
                console.debug("debug waiting", req.button)
                break
            case 'atmPrintReceipt':
                this.atmPrintReceipt(req.data)
                break;
            case 'atmPrintBuyReceipt':
                this.atmPrintBuyReceipt(req.data)

            // 测试
            case 'takeFacePhoto':
                this.takeFacephoto()
                break
            case 'atmStartStreamPhoto':
                this.atmStartStreamPhoto()
                break


            case 'locked':
                this._locked()
                break
            case 'unlock':
                this._unlock(req.data)
                break
            case 'cancelLockPass':
                this._cancelLockPass()
                break
            case 'wifiSelect':
                this._wifiPass(req.data)
                break
            case 'wifiConnect':
                this._wifiConnect(req.data)
                break
            case 'cancelWifiList':
                this._cancelWifiList()
                break
            case 'cancelWifiPass':
                this._cancelWifiPass()
                break
            case 'initialize':
                this.initialize()
                break
            case 'pairingScan':
                this._pairingScan()
                break
            case 'pairingScanCancel':
                this.scanner.cancel()
                break
            case 'pairingErrorOk':
                this._unpaired()
                break
            case 'testMode':
                this._testMode()
                break
            case 'start':
                this._chooseCoin(req.data)
                break
            case 'idDataActionCancel':
                this._scanActionCancel(idCardData)
                break
            case 'idPhotoActionCancel':
                this._scanActionCancel(idCardPhoto)
                break
            case 'cancelIdScan':
                this._cancelIdScan()
                break
            case 'cancelUsSsn':
                this.failedCompliance = 'usSsn'
                this.failedComplianceValue = this.requirementAmountTriggered[this.failedCompliance]

                if (this.returnState && !_.includes(this.complianceReason, ARE_YOU_SURE_HANDLED_SMS_COMPLIANCE)) {
                    return this.smsFlowHandleReturnState()
                }

                this._idle()
                break
            case 'idCodeFailedRetry':
                idCardData.start()
                break
            case 'idVerificationFailedOk':
                idCardData.dispatch('FAIL')
                break
            case 'photoScanVerificationCancel':
                idCardPhoto.dispatch('FAIL')
                break
            case 'cancelScan':
                this._cancelScan()
                break
            case 'bye':
                this._bye()
                break
            case 'retryPhotoScan':
                idCardPhoto.start(model)
                break
            case 'fiatReceipt':
                this._fiatReceipt()
                break
            case 'cancelInsertBill':
                this._cancelInsertBill()
                break
            case 'sendCoins':
                this._sendCoins()
                break

            /**
             * User clicked finish button before completing sms compliance.
             * If the user has inserted any bills, set the sendCoins state
             * else redirect user to chooseCoin state
             */
            case 'finishBeforeSms':
                if (this.tx.direction === 'cashOut') this._idle()
                if (this.tx.fiat.gt(0)) return this._sendCoins()
                this._idle()
                break
            case 'completed':
                this._completed()
                break
            case 'machine':
                this._machine()
                break
            case 'cancelMachine':
                this._cancelMachine()
                break
            case 'powerOff':
                this._powerOffButton()
                break
            case 'cam':
                this._cam()
                break
            case 'fixTransaction':
                this._fixTransaction()
                break
            case 'abortTransaction':
                this._abortTransaction()
                break
            case 'chooseFiatCancel':
                this._chooseFiatCancel()
                break
            case 'fiatButton':
                this._fiatButton(req.data)
                break
            case 'clearFiat':
                this._clearFiat()
                break
            case 'depositTimeout':
                this._depositTimeout()
                break
            case 'depositTimeoutNotSent':
                this.depositTimeoutNotSent()
                break
            case 'cashOut':
                this._cashOut()
                break
            case 'redeem':
                this._redeem()
                break
            case 'changeLanguage':
                this._timedState('changeLanguage')
                break
            case 'setLocale':
                this._setLocale(req.data)
                break
            case 'idle':
                this._idle()
                break
            case 'chooseCoin':
                this._chooseCoin(req.data)
                break
            case 'retryFacephoto':
                this.retryFacephoto()
                break
            case 'scanIdCardPhoto':
                idCardPhoto.dispatch('READY_TO_SCAN')
                break
            case 'permissionIdCompliance':
                this.permissionsGiven.id = true
                this._continueSmsCompliance()
                break
            case 'permissionSmsCompliance':
                this.permissionsGiven.sms = true
                this._continueSmsCompliance()
                break
            case 'permissionPhotoCompliance':
                this.permissionsGiven.photo = true
                this._continueSmsCompliance()
                break
            case 'permissionUsSsnCompliance':
                this.permissionsGiven.usSsn = true
                this._continueSmsCompliance()
                break
            case 'blockedCustomerOk':
                this._idle()
                break
            case 'termsAccepted':
                this.acceptTerms()
                break
            case 'invalidAddressTryAgain':
                this._startAddressScan()
                break
            case 'printAgain':
                this._privateWalletPrinting()
                break
            case 'printerScanAgain':
                this._startPrintedWalletScan()
                break
            case 'usSsn':
                this.registerUsSsn(req.data)
                break
            case 'insertPromoCode':
                this._insertPromoCode()
                break
            case 'cancelPromoCode':
                this._cancelPromoCode()
                break
            case 'submitPromoCode':
                this._submitPromoCode(req.data)
                break
            case 'printReceipt':
                this._startPrintReceipt()
                break
        }
    }

}

module.exports = HyperBrainExtend