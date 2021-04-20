// Internal RPC serves requests made by the user's browser or by the merchant server app

import *  as Router from '../router'

module.exports = async function internal_rpc (ws, json) {
  const result = {}

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
      this.react({})
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
        // Object.keys(me.websockets).forEach( c=>me.websockets[c].end() )
      }

      this.Config = {}

      this.fatal(1)

      this.react({address: null})
      break

    case 'payChannel':
      await this.payChannel(json.params)
      this.react({})
      break

    case 'startDispute':
      //let ch = await this.getChannel(json.params.they_pubkey)

      this.react({confirm: 'OK'})

      break

    case 'openChannel':{
      await this.flushChannel(json.params.address, true)

      this.broadcastProfile()
      break
    }

    case 'flushTransition':{
      const ch = this.Channels[json.params.address]

      ch.entries[json.params.assetId] = this.buildEntry(json.params.assetId)

      await this.flushChannel(json.params.address)
      this.react({})

      this.broadcastProfile()

      break
    }
    

    case 'setCreditLimit':

      this.send(json.params.partner, json.params)

      this.Channels[json.params.partner].entries[json.params.assetId].credit_limit = json.params.credit_limit
      
      this.react({})
      this.broadcastProfile()

      break

    case 'onchainFaucet':
      json.params.pubkey = this.pubkey
      json.params.method = 'onchainFaucet'

      this.send(this.coordinator, json.params)

      break

    case 'externalDeposit':
      require('./external_deposit')(json.params)
      break

    case 'broadcast':
      //Periodical.broadcast(json.params)
      this.react({force: true})
      return false
      break

    case 'getRoutes': {
      //got direct channel
      if (this.Channels[json.params.address]) {
        return [
          [0, []]
        ]
      }

      const profile = await this.getProfile(json.params.address)

      if (!profile) return this.react({alert: "Invalid address"})

      //profile.hubs

      const bestRoutes = [
        [0, [this.coordinator]]
      ]


      //await Router.bestRoutes(json.params.address, json.params)
      this.react({
        //parsedAddress: await parseAddress(json.params.address),
        bestRoutes: bestRoutes,
        hubsForAddress: profile.hubs
      })

      break
    }

    case 'clearBatch':
      this.batch = []
      this.react({confirm: 'Batch cleared'})
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
