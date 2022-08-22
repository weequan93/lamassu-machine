
const Tx = require('../tx')
const _ = require('lodash/fp')
const BN = require('../bn')

const { 
    truncateCrypto, toCrypto, eq
} = Tx;

Tx.mergeTx = function (oldTx, updateTx) {
    // console.debug("oldTx", oldTx)
    // console.debug("updateTx", updateTx)
    if (typeof updateTx.fiat === 'string' && updateTx.fiat !== "") {
        updateTx.fiat = BN(updateTx.fiat);
    }
    if (typeof updateTx.fiat === 'number' && updateTx.fiat !== 0) {
        updateTx.fiat = BN(updateTx.fiat);
    }

    const bills = _.unionBy(_.get('id'), oldTx.bills, updateTx.bills)

    const cashInNewFields = () => ({
        bills,
        fiat: updateTx.fiat ? oldTx.fiat.add(updateTx.fiat) : oldTx.fiat,
    })

    const cashOutNewFields = () => {
        console.debug("cashOutNewFields", oldTx.fiat, updateTx.fiat)
        return ({

            fiat: oldTx.fiat.add(updateTx.fiat || 0),
            //cryptoAtoms: truncateCrypto(toCrypto(mergedTx, oldTx.fiat.add(updateTx.fiat || 0)), cryptoCode)
        })
    }
    var newFields
    if (oldTx.direction === 'cashIn') {
        newFields = cashInNewFields()
    } else if (oldTx.direction === 'cashOut') {
        newFields = cashOutNewFields()
    }

    return _.assignAll([oldTx, updateTx, newFields])
};

Tx.update = function (oldTx, updateTx) {
    const newTx = this.mergeTx(oldTx, updateTx)
    const dirty = newTx.dirty || !eq(oldTx, newTx)
    const txVersion = newTx.txVersion + 1

    return _.assign(newTx, { dirty, txVersion })
}

module.exports = Tx;