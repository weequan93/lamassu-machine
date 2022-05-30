
var _ = require('lodash/fp');

// { short: "", msg: "", code: "" }
const dictionary = [
    { short: "messageSendingError", msg: "信息发送错误", code: "00001"},
    { short: "atmPollingErr", msg: "polling失败", code: "00002" },
    { short: "atmGetCountryErr", msg: "获取国家列表失败", code: "00003" },
    { short: "atmGetLoginAuthCodeErr", msg: "获取登入码失败", code: "00004" },
    { short: "atmGetCoinPriceErr", msg: "获取币价失败", code: "00005" },
    { short: "atmVerifyZeroProfileErr", msg: "无用户验证信息", code: "00006" },
    { short: "atmVerifySMSOTPErr", msg: "短讯验证失败", code: "00007" },
    { short: "atmPutBuyOrderErr", msg: "买币交易失败", code: "00008" },
    { short: "atmSellOrderErr", msg: "卖币交易失败", code: "00009" },
    { short: "atmRetriveOrderErr", msg: "获取交易失败", code: "0010" }
]

module.exports = { 
    errMsg: _.keyBy('short')(dictionary)
 }