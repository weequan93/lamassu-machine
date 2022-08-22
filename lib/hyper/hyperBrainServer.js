
const { timeStamp } = require("console");
const http = require("http");
const hyperError = require('./hyperError')
const pairing = require('./hyperPairing')
const logging = require('../../logging')
const {socketProcessEvent} = require("../hyper/hyperSocketEventEmiter");
const _request = require('./request')
const HyperBrainExtend = function (HyperBrain) {

    HyperBrain.prototype.hyperATMServer = function (brain) {
        const self = this;
        const server = http.createServer(function (req, res) {

            const url = req.url;
            const method = req.method;

            res.writeHead(200, buildHeader());

            if ('OPTIONS' == method) {
                res.end();
                return
            } else if (url == "/client/facephoto" && brain.scanner) {
                let {
                    cam,
                } = brain.scanner.prepareForCapture("facephoto")

                var img = Buffer.from(cam.frameRaw())

                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': img.length
                });
                return res.end(img)
            } /*else if (url == "/client/get-coin-price" && method == 'POST') {
                const body = [];
                req.on('data', (chunk) => {
                    body.push(chunk);
                });
                req.on('end', () => {
                    const parsedBody = Buffer.concat(body).toString();

                    brain.atmTrader.getCoinPrice(JSON.parse(parsedBody)).then((respond) => {
                        return res.end(JSON.stringify(respond.body))
                    }).catch((err) => {
                        return httpRequestHandler.bind(self)(err, err.response.body, res)
                        // self.atmError(hyperError.errMsg["atmGetCoinPriceErr"], err)
                        // res.writeHead(err.statusCode, buildHeader());
                        // return res.end()
                    })
                });
            } */else if (url == "/client/get-login-auth-code" && method == 'POST') {
                brain.atmTrader.getLogoAuthCode().then((respond) => {
                    return res.end(JSON.stringify(respond.body))
                }).catch((err) => {
                    return httpRequestHandler.bind(self)(err, err.response.body, res)
                    // self.atmError(hyperError.errMsg["atmGetLoginAuthCodeErr"], err)
                    // res.writeHead(err.statusCode, buildHeader());
                    // return res.end()

                })
            } else if (url == "/client/get-country" && method == 'GET') {
                brain.atmTrader.getAreaList().then((respond) => {
                    return res.end(JSON.stringify(respond.body))
                }).catch((err) => {
                    return httpRequestHandler.bind(self)(err, err.response.body,res)
                    // self.atmError(hyperError.errMsg["atmGetCountryErr"], err)
                    // res.writeHead(err.statusCode, buildHeader());
                    // return res.end()
                })
            } else {
                res.writeHead(200, {
                    "content-type": "text/html;charset=utf-8",
                });
                return res.end("Blank")
            }
        });
        server.listen(5000);
    }

    HyperBrain.prototype.hyperATMSocket = async function (brain){

        const protocol = brain.config.http ? 'http:' : 'https:'
        const connectionInfo = pairing.connectionInfo(brain.connectionInfoPath)

        const request = options => _request.request(this.configVersion, {
            protocol,
            connectionInfo: connectionInfo
        }, options)

        const res = await  request({
            path: '/client/get-atm-token',
            method: 'GET'
        })


        const WebSocket = require('ws')
        const socket = new WebSocket("wss://" + connectionInfo.atmhost + "/ws?token=" + res.body.data.token, {
            followRedirects: true,
            rejectUnauthorized: false
        })
        brain.socket = socket;

        brain.socket.on('open', () => {
            console.log("=== hyper socket connected using token = ", res.body.data.token)
            // this.listenSocketEvent()
            // overwrite it
            logging.initWSWriteLog(socket)
        });
        brain.socket.on('disconnected', () => {
            console.log("=== hyper socket disconnected using token = ", res.body.data.token)
        });

        brain.socket.on('error', () => {
            console.log("=== hyper socket error using token = ", res.body.data.token)
        });

        brain.socket.on('connect_error', (connect_error) => {
            console.log("=== hyper socket connect_error using token = ", res.body.data.token, connect_error)
        });

        brain.socket.on('connect_timeout', () => {
            console.log("=== hyper socket connect_timeout using token = ", res.body.data.token)
        });
        brain.socket.on('close', () => {
            this.hyperATMSocket(brain)
            console.log("=== hyper socket close using token = ", res.body.data.token)
        });

        brain.socket.on('message', (req) => {
            //console.log("=== hyper socket message using token = ", JSON.stringify(req))
            try{
                socketProcessEvent(brain, JSON.parse(req));
            }catch(e){
                console.error("error parsing socket evnet", req)
            }
           
        });
    }

    HyperBrain.prototype.listenSocketEvent =  function() {
        this.socket.on("machine_control", (action,callback)=>{
            if (action != "" && action!=null){
                // wait event
                if (action == "unpair") {
                    this.trader.emit("unpair")
                } else if (action == "reboot") {
                    this.trader.emit("reboot")
                } else if (action == "shutdown") {
                    this.trader.emit("shutdown")
                } else if (action == "restart") {
                    // modify restart our service
                    this.trader.emit("restartServices")
                } else if (action == "software_update") {
                    // modify restart our service
                    // fix path
                    Updater._download(path)
                }
                callback(JSON.stringify({
                    body: {
                        "command": "machine_control",
                        "code": 0,
                    }
                }))
            }
        })

        // path read package.tar
        // path read updater.js
        // this.socket.on("software_update", (path, callback)=>{
        //     Updater._download(path)
        // })  
    }
}

const buildHeader = function () {
    const headers = {}
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Credentials"] = false;
    headers["Access-Control-Max-Age"] = '86400'; // 24 hours
    headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, atm-number,authorization";
    return headers
}

const httpRequestHandler = function (err, atmError, res) {
    this.atmError(atmError, err)
    if (err.code == 'ETIMEDOUT'){
        res.writeHead(err.statusCode || 500, buildHeader());
        return res.end()
    }else{
        res.writeHead(err.statusCode || 500, buildHeader());
    }
    return res.end()
}

module.exports = HyperBrainExtend