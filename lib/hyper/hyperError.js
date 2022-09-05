
var _ = require('lodash/fp');

// { short: "", msg: "", code: "" }
const dictionary = [
    { short: "messageSendingError", msg: "信息发送错误", code: "00001"}, // atm cloud error
    { short: "atmPollingErr", msg: "polling失败", code: "00002"}, // atm cloud error
    { short: "atmGetCountryErr", msg: "获取国家列表失败", code: "00003"}, // atm cloud error
    { short: "atmGetLoginAuthCodeErr", msg: "获取登入码失败", code: "00004" }, // atm cloud error
    { short: "atmGetCoinPriceErr", msg: "获取币价失败", code: "00005" }, // atm cloud error
    { short: "atmVerifyZeroProfileErr", msg: "无用户验证信息", code: "00006"}, // atm cloud error
    { short: "atmVerifySMSOTPErr", msg: "短讯验证失败", code: "00007" }, // atm cloud error
    { short: "atmPutBuyOrderErr", msg: "买币交易失败", code: "00008"}, // atm cloud error
    { short: "atmSellOrderErr", msg: "卖币交易失败", code: "00009"}, // atm cloud error
    { short: "atmRetriveOrderErr", msg: "获取交易失败", code: "0010"}, // atm cloud error

    { short: "atmCashInBoxFull", msg: "钱箱维护", code: "0011"} ,// atm local error
    { short: "atmCashOutUpdateErr", msg: "出币更新错误", code: "0012" }, // atm local error

    { short: "atmOverWithdrawKYCLimit", msg: "提现超出KYC限额", code: "90000" },
    { short: "atmOverWithdrawNonKYCLimit", msg: "提现超出限额", code: "90001" },
    { short: "atmOverDepositKYCLimit", msg: "存入超出KYC限额", code: "90002" },
    { short: "atmOverDepositNonKYCLimit", msg: "存入超出限额", code: "90003" },
]

module.exports = { 
    errMsg: _.keyBy('short')(dictionary),
    errMsgCode: _.keyBy('code')(dictionary)
 }