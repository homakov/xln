// make a request to ask for mutual withdrawal proof from partner
// the promise returns either a valid proof or error
module.exports = async function (ch, subch, amount) {

  //ch.d.withdraw_sig = null
  //ch.d.withdraw_amount = 0

  l('Withdraw request for ' + amount, ch.ins.withdrawal_nonce)

  me.send(ch.d.they_pubkey, {
    method: 'requestWithdrawal',
    pairs: [[0, 100]],
  })

  return new Promise(async (resolve) => {
    let timeout = setTimeout(() => {
      // if the partner is offline
      delete me.withdrawalRequests[subch.id]
      resolve(ch)
    }, 6000)
    me.withdrawalRequests[subch.id] = (result) => {
      clearInterval(timeout)
      delete me.withdrawalRequests[subch.id]
      //l('Returning withdrawal ')
      resolve(result)
    }
  })
}
