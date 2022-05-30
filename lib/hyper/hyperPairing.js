
const Pairing = require('../pairing')

function extractHostname(totem) {
    return totem.slice(68, 68 + getHostnameSize(totem)).toString()
}

function extractATMHostname(totem) {
    return totem.slice(68 + getHostnameSize(totem) + 4).toString()
}

Pairing.pair = function (totemStr, clientCert, connectionInfoPath, model, numOfCassettes) {
    const totem = Buffer.from(bsAlpha.decode(totemStr))
    const hostname = extractHostname(totem)
    const atmhostname = extractATMHostname(totem)
    const expectedCaHash = totem.slice(0, 32)
    const token = totem.slice(32, 64).toString('hex')
    const hexToken = token.toString('hex')
    const caHexToken = crypto.createHash('sha256').update(hexToken).digest('hex')

    const initialOptions = {
        json: true,
        key: clientCert.key,
        cert: clientCert.cert,
        rejectUnauthorized: false
    }

    return got(`https://${hostname}:${PORT}/ca?token=${caHexToken}`, initialOptions)
        .then(r => {
            const ca = r.body.ca
            const caHash = crypto.createHash('sha256').update(ca).digest()

            if (!caHash.equals(expectedCaHash)) throw new E.CaHashError()

            const options = {
                key: clientCert.key,
                cert: clientCert.cert,
                ca
            }

            const query = querystring.stringify({ token: hexToken, model, numOfCassettes })
            return got.post(`https://${hostname}:${PORT}/pair?${query}`, options)
                .then(() => {
                    const connectionInfo = {
                        host: hostname,
                        atmhost: atmhostname,
                        ca
                    }

                    fs.writeFileSync(connectionInfoPath, JSON.stringify(connectionInfo))
                })
        })
        .catch(err => {
            console.log(err)
            throw new Error("Pairing error - Please make sure you have a stable network connection and that you are using the right QR Code")
        })
}

module.exports = Pairing;