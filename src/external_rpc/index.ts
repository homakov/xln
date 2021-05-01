// External RPC processes requests coming from outside world.
import * as WebSocketClient from '../utils/ws'

import { utils, ethers } from 'ethers'

module.exports = async function external_rpc(ws, msg) {
  // uws gives ArrayBuffer, we create a view

  // TODO: all messages must be signed

  //if (data instanceof ArrayBuffer) {
  //Buffer.from(arrayBuffer: This creates a view of the ArrayBuffer without copying the underlying memory
  //Buffer.from(buffer): Copies the passed buffer data onto a new Buffer instance
  const msgString:string = Buffer.from(Buffer.from(msg)).toString()

  try {
    const json = JSON.parse(msgString)

    console.log("Received", json)

    const addr = json.addr
    if (json.method == 'auth') {
      if (ws.instance) {
        // is it already wrapped ws
        this.websockets[json.addr] = ws
      } else {
        this.websockets[json.addr] = new WebSocketClient()
        this.websockets[json.addr].instance = ws
      }
    } else if (json.method == 'callback') {
      const key = addr+'_'+json.callback
      const fn = this.websocketCallbacks[key]
      if (fn) {
        delete this.websocketCallbacks[key]
        fn(json.data)  
      }
    } else if (json.method == 'broadcastProfile') {
      this.Profiles[json.addr] = json.data
    } else if (json.method == 'cooperativeClose') {

      const ch = this.Channels[json.addr]
      if (!ch) {
        return console.log("no channel")
      }

      const proof = this.getCooperativeProof(ch)
      console.log('coop proof', proof)
      const sig = await this.hashAndSign(proof)

      this.send(json.addr, {method: 'callback', callback: json.callback, data: sig})

    } else if (json.method == 'getWithdrawalSig') {

      const ch = this.Channels[json.addr]
      if (!ch) {
        return console.log("no channel")
      }

      const delayed = []

      // ensure pairs are valid
      for (const [assetId, amountToWithdraw] of json.pairs) {

        if (!ch.entries[assetId]) {
          return console.log("Bad withdrawal request")
        }

        const derived = this.deriveEntry(ch, assetId)

        if (amountToWithdraw <= derived.inbound_capacity && amountToWithdraw <= derived.they_secured) {
          // only executed if everything is correct
          delayed.push(()=>{
            ch.entries[assetId].they_pending_withdraw = amountToWithdraw
          })

        } else {
          return console.log("Not enough funds")
        }
      }

      delayed.map(f=>f())

      const sig = await this.hashAndSign(this.getWithdrawalProof(ch, json.pairs))

      this.send(json.addr, {method: 'callback', callback: json.callback, data: sig})
    } else if (json.method == 'getProfiles') {
      const profiles = json.addresses.map(a=>this.Profiles[a])

      this.send(json.addr, {method: 'callback', callback: json.callback, data: profiles})
    } else if (json.method == 'updateChannel') {
      
      
      
      await this.section(json.addr, async () => {

        await this.updateChannel(json.addr, json)


      })


    } else if (json.method == 'setCreditLimit') {
      this.Channels[addr].entries[json.assetId].they_credit_limit = json.credit_limit

    } else if (json.method == 'textMessage') {
      this.react({confirm: json.msg})
    }
    
    return
  } catch (e) {
    console.log('External RPC error', e)
  }
}
