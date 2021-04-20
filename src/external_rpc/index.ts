// External RPC processes requests coming from outside world.
import * as WebSocketClient from '../utils/ws'
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
      this.websocketCallbacks[key](json.data)
      delete this.websocketCallbacks[key]

    } else if (json.method == 'broadcastProfile') {
      this.Profiles[json.addr] = json.data
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
