const http = require("http");

const buildHeader = function () {
  const headers = {}
  headers["Access-Control-Allow-Origin"] = "*";
  headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
  headers["Access-Control-Allow-Credentials"] = false;
  headers["Access-Control-Max-Age"] = '86400'; // 24 hours
  headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, atm-number,authorization";
  return headers
}

const MockServer = function () {

  const self = this;
  const mockServer = http.createServer(function (req, res) {

    const url = req.url;
    const method = req.method;

    res.writeHead(200, buildHeader());

    if ('OPTIONS' == method) {
      res.end();
      return
      
    } else if (url == "/client/get-atm-token") {
      res.end(JSON.stringify({ code: 0, }))
      return
    } else if (url == "/client/get-atm-config"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          code: 0,
          "fiat_currency": ["usd"],
          "buy_coins": [
            {
              "id": 1,
              "symbol": "USDT",
              "name": "USDT",
              "logo": "https://cdn-icons-png.flaticon.com/512/6001/6001566.png",
              "symbol_display": "USDT",
              "chain":"eth",
              "chain_display": "ETH",
              // "chain": [
              //   { "chain": "eth","chain_display":"ETH"},
              //   { "chain": "trx", "chain_display": "TRX" }
              // ],
              "decimals": 8
            }
          ],
          "sell_coins": [
            {
              "id": 1,
              "symbol": "USDT",
              "name": "USDT",
              "logo": "https://cdn-icons-png.flaticon.com/512/6001/6001566.png",
              "symbol_display": "USDT",
              "chain": "eth",
              "chain_display": "ETH",
              // "chain": [
              //   { "chain": "eth","chain_display":"ETH"},
              //   { "chain": "trx", "chain_display": "TRX" }
              // ],
              "decimals": 8
            }
          ],
          "boxes": [
            {
              "type": 0,
              "current_num_money": 100,
              "num_money": 1000,
              "denomination": 0
            },
            {
              "type": 1,
              "current_num_money": 100,
              "num_money": 1000,
              "denomination": 1
            },
            {
              "type": 1,
              "current_num_money": 100,
              "num_money": 1000,
              "denomination": 5
            }
          ],
          "max_trade_amount": 1000,
          "max_trade_kyc_amount": 2000,
          "min_amount": 1,
          "max_amount": 1000,
          "min_amount_kyc": 1,
          "max_amount_kyc": 2000,
          "amount_list": [1, 5, 10, 50],
          "amount_list_kyc": [1, 5, 10, 50],
        }
      }))
      return
    } else if (url =="/client/get-coin-price"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          code: 0,
          "rate": 1,
          "sell_rate": 0.01,
          "buy_rate": 0.01,
          "sell_fee_rate": 0.01,
          "buy_fee_rate": 0.01
        }
      }))
      return
    } else if (url == "/client/get-login-auth-code" && method == 'POST') {
      res.end(JSON.stringify({
        code: 0,
        auth_code: "randomauthenticationcode",
        valid_time: 9999,
        data: { auth_code:"randomauthenticationcode", valid_time:9999 },
      }))
      return
    } else if (url =="/client/get-login-token-by-auth-code"){
      res.end(JSON.stringify({
        code: 0,
        msg: "ok"
      }))
      return
    }else if (url =="/client/isOpenBuyCoin"){
      res.end(JSON.stringify({
        code: 0,
        data: true
      }))
      return
    } else if (url =="/client/send-sms"){
      res.end(JSON.stringify({
        code: 0,
        data: true
      }))
      return
    } else if (url == "/client/get-login-token-by-sms"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          token:"logintoken"
        }
      }))
      return
    } else if (url =="/client/get-hpy-user"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          'phone_area': '65',
          'phone_number': '96678182',
          'has_kyc': 1,
          token: "logintoken"
        }
      }))
      return
    } else if (url =="/client/get-trade-amount"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          buy_amount: 0,
          sell_amount:0
        }
      }))
      return
    } else if (url == "/client/getSnapshotInfo"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          id: 1,
          sell_amount: 0,
          coin_out: {
            fiat_usdt_rate:1,
            rate:1,
            sell_rate:0.1,
            buy_rate:0.1,
            sell_fee_rate:0.1,
            buy_fee_rate:0.1
          }
        }
      }))
      return
    } else if (url == "/client/init-atm-order-buy"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          order_no: 1,
        }
      }))
      return
    } else if (url =="/client/money-notice"){
      res.end(JSON.stringify({
        code: 0,
        data: true
      }))
      return
    } else if (url == "/client/add-atm-order-buy"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          order_no: "20221218990011"
        }
      }))
      return
    } else if (url == "/risk/atm/add-atm-order-buy"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          order_no: "20221218990011",
          trade_type:2
        }
      }))
      return
    } else if (url =="/client/add-atm-order-sell"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          order_no: "20221218990011",
          trade_type: 2,
          status:0,
          address: "sendtothisaddress",
          "digital_currency": "USDT", "chain_name": "eth", "digital_amount": 1, "fiat_currency": "usd", "coin_id": 1, "fiat_amount": 1, "saas_fee": 1, "merchant_fee": 1, "price": 0.3333333333333333, "price_origin": 1, "fiat_usdt_rate": 1, "fiat_usdt_amount": 1, "snapshot_info_Id": 1
        }
      }))
      return
    } else if (url =="/client/get-atm-order?orderNo=20221218990011"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          order_no: "20221218990011",
          trade_type: 2,
          status: 1,
          address: "sendtothisaddress",
          "digital_currency": "USDT", "chain_name": "eth", "digital_amount": 1, "fiat_currency": "usd", "coin_id": 1, "fiat_amount": 1, "saas_fee": 1, "merchant_fee": 1, "price": 0.3333333333333333, "price_origin": 1, "fiat_usdt_rate": 1, "fiat_usdt_amount": 1, "snapshot_info_Id": 1
        }
      }))
      return
    } else if (url =="/client/before-sell-spit-money"){
      res.end(JSON.stringify({
        code: 0
      }))
      return
    } else if (url =="/client/update-atm-order-status"){
      res.end(JSON.stringify({
        code: 0
      }))
      return
    } else if (url =="/client/get-coin-address"){
      res.end(JSON.stringify({
        code: 0,
        data: {
          address: "20221218990011"
        }
      }))
      return
    }
    else if (url == "/client/facephoto" && brain.scanner) {
      let {
        cam,
      } = brain.scanner.prepareForCapture("facephoto")

      var img = Buffer.from(cam.frameRaw())

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': img.length
      });
      return res.end(img)
    } else if (url == "/client/get-country" && method == 'GET') {
      res.end(JSON.stringify({
        code: 0,
        data: []
      }))
      return
    } else {
      res.writeHead(200, {
        "content-type": "text/html;charset=utf-8",
      });
      return res.end("Blank"+url)
    }
  });

  mockServer.listen(9999);

}

module.exports = MockServer