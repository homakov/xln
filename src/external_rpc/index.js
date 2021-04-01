// External RPC processes requests coming from outside world.

module.exports = async (ws, msg) => {
  // uws gives ArrayBuffer, we create a view

  //if (data instanceof ArrayBuffer) {
  //Buffer.from(arrayBuffer: This creates a view of the ArrayBuffer without copying the underlying memory
  //Buffer.from(buffer): Copies the passed buffer data onto a new Buffer instance
  let msgb = Buffer.from(Buffer.from(msg))

  // sanity checks
  if (msgb.length > 5000000) {
    l(`External_rpc, long input ${msgb.length}`)
    return false
  }

  // we have no control over potentially malicious user input, so ignore all errors
  try {
    let json = parse(msgb.toString())

    /*

    if (RPC.requireSig.includes(json.method) && !ec.verify(body, sig, pubkey)) {
      l('Invalid sig in external_rpc')
      return false
    }*/

    if (trace) l(`From ${trim(pubkey)}:`, json)

    if (json.method == 'auth') {
      if (ws.instance) {
        me.sockets[pubkey] = ws
      } else {
        me.sockets[pubkey] = new WebSocketClient()
        me.sockets[pubkey].instance = ws
      }
    } else if (
      [
        'updateChannel',
        'setLimits',
        'requestInsurance',
        'requestCredit',
        'giveWithdrawal',
        'requestWithdrawal',
        'testnet',
      ].includes(json.method)
    ) {
      require('./with_channel')(pubkey, json, ws)
    } else if (json.method == 'textMessage') {
      react({confirm: json.msg})
    }
    return
  } catch (e) {
    l('External RPC error', e)
  }
}
