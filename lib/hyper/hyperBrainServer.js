
const { timeStamp } = require("console");
const http = require("http");
const hyperError = require('./hyperError')

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

    HyperBrain.prototype.hyperATMSocket = function (brain){

        console.debug("=== brain config", brain.config)

        const io = require('socket.io')({
            serveClient: false
        });

        const socket = io({
            path: 'http://server-domain.com/admin',
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            randomizationFactor: 0.5,
            timeout: 20000,
            autoConnect: true,
            query: {},
            // options of the Engine.IO client
            upgrade: true,
            forceJSONP: false,
            jsonp: true,
            forceBase64: false,
            enablesXDR: false,
            timestampRequests: true,
            timestampParam: 't',
            policyPort: 843,
            transports: ['polling', 'websocket'],
            transportOptions: {},
            rememberUpgrade: false,
            onlyBinaryUpgrades: false,
            requestTimeout: 0,
            protocols: [],
            // options for Node.js
            agent: false,
            pfx: null,
            key: null,
            passphrase: null,
            cert: null,
            ca: null,
            ciphers: [],
            rejectUnauthorized: true,
            perMessageDeflate: true,
            forceNode: false,
            localAddress: null,
            // options for Node.js / React Native
            extraHeaders: {
                "device_id": brain.config.device_id
            },
        });

        brain.socket = socket;

        brain.socket.on('connect', () => {
            this.listenSocketEvent()
        });
    }

    HyperBrain.prototype.listenSocketEvent =  ()=> {
        this.socket.on("machine_control", (action,callback)=>{
            // wait event
            if (action == "unpair"){
                this.trader.emit("unpair")
            } else if (action == "reboot") {
                this.trader.emit("reboot")
            } else if (action == "shutdown") {
                this.trader.emit("shutdown")
            } else if (action == "restart") {
                // modify restart our service
                this.trader.emit("restartServices")
            }
        })

        // path read package.tar
        // path read updater.js
        this.socket.on("software_update", (path, callback)=>{
            Updater._download(path)
        })  
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