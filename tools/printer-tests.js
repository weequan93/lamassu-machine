const minimist = require('minimist')
const SerialPort = require('serialport')
const Handlebars = require("handlebars");
const BN = require('../lib/bn')
const coinUtils = require('../lib/coins/utils')
const printerLoader = require('../lib/printer/loader')

const deviceConfig = require('../device_config.json')
const dataPath = require('../lib/data-path')
const fs  = require("fs")
const printType = process.argv[2]

if (!printType || (printType !== 'wallet' && printType !== 'receipt')) {
  console.log('usage: node printer-tests.js <type>')
  console.log(`type can be one of: 'wallet' or 'receipt'`)
}

printerLoader.load(deviceConfig.kioskPrinter)
  .then(printer => {
    if (printType === 'wallet') {
      const wallet = coinUtils.createWallet('BTC')
      printer.printWallet(wallet, deviceConfig.kioskPrinter)
    }

    if (printType === 'receipt') {
      const cashInCommission = BN(1.1)

      const rate = BN(10000).mul(cashInCommission).round(5)
      const date = new Date()
      const dateString = `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`

      const data = {
        address: "address",
        atmNo: "atmNo",
        fiatCurrency: "fiatCurrency",
        fiat: 'fiat',
        order_no: "order_no",
        created: dateString,
        chain: "chain",
        coinname: "coinname",
        Icon: dataPath + "/" +"assets/image/header.png",
        Icon2: dataPath + "/" + "assets/image/app.png",
        QRCode: "123456789"
      }

      // switch language
      const templatePath = dataPath + "/" + "template/order_buy.en.tpl"
      const templateRaw = fs.readFileSync(templatePath, "utf-8")
      const templatePlaceholder = Handlebars.compile(templateRaw);
      const template = templatePlaceholder(data)
  
      printer.print(template, data, deviceConfig.kioskPrinter).then((err)=>{
        console.log("err",err)
      })
    }
  }).catch(console.log)
