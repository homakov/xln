// Internal RPC serves requests made by the user's browser or by the merchant server app

import *  as Router from '../router'
import { utils, ethers } from 'ethers'

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

  if (!this.signer && !['load','login'].includes(json.method)){
    return console.log("Authenticated method only")
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

    case 'startDispute':{
      const ch = this.Channels[json.params.partner]

      this.sharedState.batch.disputeProof.push({
        partner: ch.partner,
        dispute_nonce: ch.dispute_nonce,
        entries_hash: this.getCanonicalEntriesHash(ch),
        entries: [], // empty for now
        sig: ch.ackSig,
      })
      
      this.react({confirm: 'OK'})

      break
    }

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
    

    case 'setCreditLimit':{

      

      this.send(json.params.partner, json.params)
      console.log("Set credit ", json.params)

      this.Channels[json.params.partner].entries[json.params.assetId].credit_limit = json.params.credit_limit
      
      this.react({})
      this.broadcastProfile()

      break
    }

    case 'onchainFaucet':
      json.params.pubkey = this.pubkey
      json.params.method = 'onchainFaucet'

      this.send(this.coordinator, json.params)

      break

    case 'reserveToChannel': {
      this.sharedState.batch.reserveToChannel.push({
        receiver: json.params.receiver,
        partner: json.params.partner,
        pairs: json.params.pairs, 
      })
      
      break
    }

    case 'channelToReserve': {
      const sig = await this.sendSync(json.params.partner, {method: 'getWithdrawalSig', pairs: json.params.pairs})

      console.log("Got sig ", sig)

      if (sig) {      
        this.sharedState.batch.channelToReserve.push({
          sig: sig,
          partner: json.params.partner,
          pairs: json.params.pairs,
        })
      } else {
        this.react({alert: "Partner is unresponsive"})
      }
      
      break
    }

    case 'cooperativeClose': {
      const ch = this.Channels[json.params.partner]
      const sig = await this.sendSync(json.params.partner, {method: 'cooperativeClose'})

      if (!sig) {
        this.react({alert: "Partner is unresponsive"})
      }

      const signer = await this.hashAndVerify(this.getCooperativeProof(ch), sig)
      if (signer != json.params.partner) {
        this.react({alert: "Partner provided bad signature"})
      }
    
      this.sharedState.batch.cooperativeProof.push({
        sig: sig,
        partner: json.params.partner,
        entries: this.getCanonicalEntries(ch),
      })
      
      break
    }
  
    case 'broadcastBatch': {
      console.log("Broadcasting batch ",this.sharedState.batch)
      try {
        const tx = await this.XLN.processBatch(this.sharedState.batch,  {
          gasLimit: 5000000
        })
            
      

      console.log(this.sharedState.receipt = await tx.wait())
      this.sharedState.logEvents = this.sharedState.receipt.events.map(e=>`${e.args[0]} ${e.args[1].toString()}`)

      this.sharedState.batch = this.getEmptyBatch()
      }catch(e){console.log("err ", e)}

      this.react({confirm: "Batch broadcasted"})
      return false
      break
    }

    case 'getRoutes': {
      //got direct channel
      /*
      if (this.Channels[json.params.address]) {
        return [
          [0, []]
        ]
      }*/

      const profile = await this.getProfile(json.params.address)

      if (!profile) return this.react({alert: "Invalid address "+json.params.address})

      //profile.hubs

      const bestRoutes = [
        [0, this.Channels[json.params.address] ? [] : [this.coordinator]]
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
      this.sharedState.batch = this.getEmptyBatch()
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
