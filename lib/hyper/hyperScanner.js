

const Scanner = require('../scanner')

const { scanQR, _prepareForCapture } = Scanner

Scanner.atmStartScanQR = function (callback) {

    scanQR(function (err, result) {
        if (err) return callback(err)
        if (!result) return callback(null, null)

        var resultStr = result.toString()
        console.log('DEBUG55: %s', resultStr)

        callback(null, resultStr)
    })

}

Scanner.atmStartStreamPhoto = function (callback) {

    const {
        cam
    } = _prepareForCapture("facephoto")

    // handle = setInterval(capture, 200)
    capture()
    function capture() {
        cam.capture(function loop(success) {
            cam.capture(loop);
        })
    }
    callback(null)
}

Scanner.prepareForCapture = function (mode) {
    openedFromOutside = true
    return _prepareForCapture(mode)
}


module.exports = Scanner;