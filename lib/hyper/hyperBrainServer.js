
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
            } else if (url == "/client/get-coin-price" && method == 'POST') {
                const body = [];
                req.on('data', (chunk) => {
                    body.push(chunk);
                });
                req.on('end', () => {
                    const parsedBody = Buffer.concat(body).toString();

                    brain.atmTrader.getCoinPrice(JSON.parse(parsedBody)).then((respond) => {
                        return res.end(JSON.stringify(respond.body))
                    }).catch((err) => {
                        return httpRequestHandler.bind(self)(err, hyperError.errMsg["atmGetCoinPriceErr"], res)
                        // self.atmError(hyperError.errMsg["atmGetCoinPriceErr"], err)
                        // res.writeHead(err.statusCode, buildHeader());
                        // return res.end()
                    })
                });
            } else if (url == "/client/get-login-auth-code" && method == 'POST') {
                brain.atmTrader.getLogoAuthCode().then((respond) => {
                    return res.end(JSON.stringify(respond.body))
                }).catch((err) => {
                    return httpRequestHandler.bind(self) (err, hyperError.errMsg["atmGetLoginAuthCodeErr"], res)
                    // self.atmError(hyperError.errMsg["atmGetLoginAuthCodeErr"], err)
                    // res.writeHead(err.statusCode, buildHeader());
                    // return res.end()

                })
            } else if (url == "/client/get-country" && method == 'GET') {
                brain.atmTrader.getAreaList().then((respond) => {
                    return res.end(JSON.stringify(respond.body))
                }).catch((err) => {
                    return httpRequestHandler.bind(self) (err, hyperError.errMsg["atmGetCountryErr"],res)
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