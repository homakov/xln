// Internal RPC serves requests made by the user's browser or by the merchant server app

const Router = require('../router')
const withdraw = require('../offchain/withdraw')

module.exports = async function (ws, json) {
  if (json.leak_channels) {
    this.leak_channels_ws.push(ws)
    return
  }
  // auth_code prevents all kinds of CSRF and DNS rebinding
  // strong coupling between the daemon and the browser client
  if (json.auth_code != this.Config.auth_code && ws != 'admin') {
    //if (!json.auth_code) {
    //l('Not authorized')
    ws[ws.end ? 'end' : 'send'](
      JSON.stringify({alert: 'Invalid auth_code, restart node'})
    )
    return
  }

  if (ws.send && json.is_wallet && !this.browsers.includes(ws)) {
    this.browsers.push(ws)
    //setBrowser(ws)
  }

  // internal actions that require authorization

  switch (json.method) {
    case 'load':
      // triggered by frontend to update

      // public + private info
      this.react({force: true})
      //return

      break
    case 'login':
      if (json.params.username.length == 66) {
        this.Config.seed = json.params.username
      } else {
        this.Config.seed =
          '0x' +
          (
            await require('../utils/derive')(
              json.params.username,
              json.params.password
            )
          ).toString('hex')
      }
      await this.start(this.Config.seed)
      this.react({})

      break

    case 'logout':
      if (this.external_http_server) {
        this.external_http_server.close()
        this.external_wss.clients.forEach((c) => c.close())
        // Object.keys(me.sockets).forEach( c=>me.sockets[c].end() )
      }

      this.Config = {}

      this.fatal(1)

      this.react({pubkey: null})
      break

    case 'sendOffchain':
      await this.payChannel(json.params)
      break

    case 'startDispute':
      let ch = await this.getChannel(json.params.they_pubkey)

      this.react({confirm: 'OK'})

      break
    case 'withChannel':
      require('./with_channel')(json.params)
      break

    case 'onchainFaucet':
      json.params.pubkey = this.pubkey
      json.params.method = 'onchainFaucet'

      this.send(Config.banks[0], json.params)

      break

    case 'externalDeposit':
      require('./external_deposit')(json.params)
      break

    case 'broadcast':
      Periodical.broadcast(json.params)
      this.react({force: true})
      return false
      break

    case 'getRoutes':
      let bestRoutes = await Router.bestRoutes(json.params.address, json.params)
      this.react({
        parsedAddress: await parseAddress(json.params.address),
        bestRoutes: bestRoutes,
      })

      break

    case 'clearBatch':
      this.batch = []
      react({confirm: 'Batch cleared'})
      break

    case 'getinfo':
      this.react(require('./get_info')())
      break

    // to be called by merchant app on the same server
    case 'receivedAndFailed':
      //result = await require('./received_and_failed')(ws)
      break

    default:
      this.react({alert: 'No method provided'})
  }

  // http or websocket?
  if (ws.end) {
    ws.end(JSON.stringify(result))
  } else if (ws == 'admin') {
    return result
  } else {
    //ws.send(JSON.stringify(result))
    //react(result)
  }
}
