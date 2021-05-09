
import * as http from "http"


const WebSocketClient = require('./utils/ws')
const stringify = require('../lib/stringify')

// system
const assert = require('assert')
const fs = require('fs')

const os = require('os')
const ws = require('ws')
const querystring = require('querystring')
import crypto = require('crypto')

import { utils, ethers } from 'ethers'
import { XLN__factory, TokenA__factory, XLN } from '../types/ethers-contracts'


const RPC_HOST = 'http://127.0.0.1:8545'


const abi:string = fs.readFileSync('../AAAxln/build/contracts/XLN.json').toString()
const XLN_ADDRESS = JSON.parse(abi).networks[5777].address

// scrypt = require('scrypt') // require('./scrypt_'+os.platform())
const base58 = require('base-x')(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
)
 
const nacl = require('../lib/nacl')

export class Me {
  signer: any
  partners: any

  provider: any
  XLN: XLN

  MessageType = {
    JSON: 0,
    WithdrawProof: 1,
    CooperativeProof: 2,
    DisputeProof: 3,
  }

  sharedState: any = {}

  channels: Array<any>
  syncedChannels: Array<any>


  
  record: any
  datadir: string
  argv: any
  external_http_server: http.Server
  external_wss: any

  coordinator: string

  on_server: boolean

  boxPair: any


  ethers = ethers

  Config = {}
  Channels = {}
  Orders = {}

  

  websockets = {}
  websocketCallbacks = {}
  Profiles = {}
  Orderbook = []

  
  browsers = []
  

  busyPorts = [] // for cloud demos

  section_queue = {}

  leak_channels_ws = []

  node_started_at = new Date()
  last_react = new Date()
  last_sync_changes = 0
  last_sync_chain = 0

    // generic metric boilerplate: contains array of averages over time
  getMetric = () => {
    return {
      max: 0,
      started: new Date(),
      total: 0,
      current: 0,
      last_avg: 0,
      avgs: [],
    }
  }

  metrics = {
    volume: this.getMetric(),
    fail: this.getMetric(),
    settle: this.getMetric(),
    fees: this.getMetric(),
    syncChanges: this.getMetric(),

    //
    bandwidth: this.getMetric(),
    ecverify: this.getMetric(),
  }

  


  async start(seed: string):Promise<void> {

    this.signer = new this.ethers.Wallet(seed, new this.ethers.providers.JsonRpcProvider(RPC_HOST))
    this.XLN = XLN__factory.connect(XLN_ADDRESS, this.signer)


    this.sharedState.batch = this.getEmptyBatch()

    const sk = Buffer.from(seed.substr(2), 'hex')

    this.boxPair = nacl.box.keyPair.fromSecretKey(sk)

    this.sharedState.address = this.signer.address
    
    await this.syncL1()

    setInterval(()=>{this.syncL1()}, 2000)



    

    // are we a hub?
    const myHub = this.sharedState.hubs.find(h=>h.addr==this.signer.address)
    if (myHub) {
      this.startExternalRPC(parseInt(myHub.uri.split(':')[2]))

      this.admin('reserveToChannel', {receiver: '0xf17f52151EbEF6C7334FAD080c5704D77216b732', partner: this.coordinator, pairs: [[0, 10000]]})
      this.admin('reserveToChannel', {receiver: '0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef', partner: this.coordinator, pairs: [[0, 10000]]})

      setInterval(()=>{this.rebalanceChannels()}, 5000)
    } else if (this.argv.p <= 8002) {
      setTimeout(async ()=>{
        this.admin('openChannel', {address: this.coordinator})
        await this.sleep(200)
        this.admin('flushTransition', {address: this.coordinator, assetId: 0})
        await this.sleep(200)
        this.admin('setCreditLimit', {method: 'setCreditLimit', partner: this.coordinator, assetId: 0, credit_limit: 10000})


      },2000)
    }

    this.broadcastProfile()



    await fs.writeFileSync(
      this.datadir + '/config.json',
      JSON.stringify(this.Config)
    )
  }

  admin(method, params) {
    this.internal_rpc('admin', {method: method, params: params})
  }

  getEmptyBatch() {
    return {
      channelToReserve: [],
      reserveToChannel: [],

      reserveToToken: [],
      tokenToReserve: [],

      reserveToReserve: [],

      cooperativeProof: [],
      disputeProof: [],
      revealEntries: [],

      revealSecret: [],
      cleanSecret: [],

      hub_id: 0,
    }
  }

  async broadcastBatch(){
    if (Object.values(this.sharedState.batch).join('') == '0') return

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
  }


  async syncL1() {
    const partners = Object.keys(this.Channels);
    //['0xf17f52151EbEF6C7334FAD080c5704D77216b732','0x821aEa9a577a9b44299B9c15c88cf3087F3b5544'];
    //Object.keys(Channels)

    

    [
      this.sharedState.assets, 
      this.sharedState.hubs, 
      this.sharedState.EOA_balance,
      this.sharedState.currentUser,
      this.syncedChannels
    ] = await Promise.all([
      this.XLN.getAllAssets(),
      this.XLN.getAllHubs(), 
      this.signer.getBalance(),
      this.XLN.getUser(this.signer.address), 

      this.XLN.getChannels(this.signer.address, partners)
    ])

    this.sharedState.reserves = this.sharedState.currentUser.assets.map(r=>r.reserve.toString())

    this.syncedChannels.map(gotCh=>{
      
      const ch = this.Channels[gotCh.partner]

      ch.channel_counter = gotCh.channel.channel_counter.toNumber()
      ch.cooperative_nonce = gotCh.channel.cooperative_nonce.toNumber()
      ch.dispute_until_block = gotCh.channel.dispute_until_block.toNumber()

      for (const assetId in gotCh.collaterals) {
        if (ch.entries[assetId]) {
          ch.entries[assetId].collateral = gotCh.collaterals[assetId].collateral.toNumber()
          ch.entries[assetId].ondelta = gotCh.collaterals[assetId].ondelta.toNumber()
        }
      }

    })

    //console.log('current', this.sharedState.currentUser.assets)
    //this.sharedState.currentUser[0]

    this.sharedState.EOA_balance = utils.formatEther(this.sharedState.EOA_balance)

    this.coordinator = this.sharedState.hubs[1].addr

  }


  async startExternalRPC(usePort: number) {

    
    
    if (this.external_http_server) {
      return console.log('Already have external server started')
    }

    this.external_http_server = http.createServer(
      async (req, res) => {
        var [path, query] = req.url.split('?')
        // call /faucet?address=ME&amount=100&asset=1
        if (path.startsWith('/faucet')) {
          res.setHeader('Access-Control-Allow-Origin', '*')

          const args = querystring.parse(query)
          console.log('faucet ', args)

          const status = await this.payChannel({
            address: args.address,
            amount: parseInt(args.amount),
            asset: parseInt(args.asset),
          })
          res.end(status)
        } else {
          res.end('hello')
        }
      }
    )

    this.external_http_server.listen(usePort)

    this.external_wss = new ws.Server({
      //noServer: true,
      clientTracking: false,
      perMessageDeflate: false,
      // attach to existing HTTP server
      server: this.external_http_server,
      maxPayload: 64 * 1024 * 1024,
    })

    this.external_wss.on('error', function (err) {
      console.log(err)
    })
    this.external_wss.on('connection', (websocket) => {
      //console.log(websocket)
      
      websocket.on('message', (msg) => {
        this.external_rpc(websocket, msg)
      })
    })

    console.log(`Started external_wss at: ${usePort}`)
  }

  textMessage(they_pubkey, msg) {
    this.send(they_pubkey, {method: 'textMessage', msg: msg})
  }

  broadcastProfile() {
    const peerHubs = []
    for (const hub of this.sharedState.hubs) {
      const ch = this.Channels[hub.addr]
      if (ch) {

        const entriesWithInboundCapacity = Object.keys(ch.entries).filter(e=>{
          return true //this.deriveEntry(ch, e).inbound_capacity > 0
        })

        if (entriesWithInboundCapacity.length > 0) {
          peerHubs.push([hub.addr, entriesWithInboundCapacity])
        }
      }
    }
    

    this.send(this.coordinator, {
      method: 'broadcastProfile',
      addr: this.signer.address,
      data: {
        addr: this.signer.address,
        boxPubkey: Buffer.from(this.boxPair.publicKey).toString('hex'),
        hubs: peerHubs
      }
    })
  }

  async getProfile(addr) {
    return (await this.sendSync(this.coordinator, {method:'getProfiles', addresses: [addr]}))[0]
  }

  async hashAndSign(str: string) {
    const hash = utils.arrayify(utils.keccak256(str))
    return this.signer.signMessage(hash)
  }

  async hashAndVerify(str: string, sig: string) {
    const hash = utils.arrayify(utils.keccak256(str))
    return utils.verifyMessage(hash, sig)
  }

  // a generic interface to send a websocket message
  send(addr:string, msg:any, optional_cb?:unknown) {
    if (this.signer){
      msg.addr = this.signer.address
    }

    msg.timestamp = new Date()

    msg = Buffer.from(JSON.stringify(msg))

    if (this.websockets[addr]) {
      // if there is live connection to this address
      this.websockets[addr].send(msg)
      return true
    } else {
      // try to connect using their advertised URI
      this.websockets[addr] = new WebSocketClient()

      this.websockets[addr].onmessage = (msg) => {
        this.external_rpc(this.websockets[addr], msg)
      }

      this.websockets[addr].onerror = (e)=>{
        console.log('Failed to open the socket to ', addr, e)
        delete this.websockets[addr]
      }

      this.websockets[addr].onopen = (e)=>{
        // first auth, then send actual message
        if (this.signer.address) {
          const authMsg = Buffer.from(JSON.stringify({
            method: 'auth', 
            addr: this.signer.address, 
            data: new Date()
          }))

          this.websockets[addr].send(authMsg)
        }

        this.websockets[addr].send(msg)
      }

      const foundHub = this.sharedState.hubs.find(h=>h.addr == addr)
      if (foundHub) {
        this.websockets[addr].open(foundHub.uri)
        return true
      } else {
        console.log("No such hub or socket exists for addr "+addr)
        return false
      }
    }
  }

  sendSync(addr:string, msg:any) {
    return new Promise(async (resolve) => {
      msg.callback = crypto.randomBytes(32).toString('hex')
      const key = addr+'_'+msg.callback
      this.websocketCallbacks[key] = resolve

      setTimeout(()=>{
        // fallback
        const fn = this.websocketCallbacks[key]
        if (fn) {
          delete this.websocketCallbacks[key]  
          fn(false)
        }
      }, 3000)

      this.send(addr, msg)
    })
  }

  async fatal(reason) {
    console.log(reason)
    this.react({reload: true}) //reloads UI window
    //this.intervals.map(clearInterval)

    //await Periodical.syncChanges()
    //.then(async () => {
    //await sequelize.close()
    //await privSequelize.close()
    await this.sleep(500)
    process.exit()
    //})
  }

  // for handicaps
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /*var {performance} = require('perf_hooks')
  withChannel = async (key, job) => {}
  */

  // https://en.wikipedia.org/wiki/Critical_section
  async section(key, job) {
    return new Promise(async (resolve) => {
      key = JSON.stringify(key)

      if (this.section_queue[key]) {
        if (this.section_queue[key].length > 10) {
          console.log('Queue overflow for: ' + key)
        }

        this.section_queue[key].push([job, resolve])
      } else {
        this.section_queue[key] = [[job, resolve]]

        while (this.section_queue[key].length > 0) {
          try {
            const [got_job, got_resolve] = this.section_queue[key].shift()
            //const started = performance.now()

            //let deadlock = setTimeout(function() {
            //  this.fatal('Deadlock in q ' + key)
            //}, 20000)

            got_resolve(await got_job())

            //clearTimeout(deadlock)
            //l('Section took: ' + (performance.now() - started))
          } catch (e) {
            console.log('Error in critical section: ', e)
            setTimeout(() => {
              this.fatal(e)
            }, 100)
          }
        }
        delete this.section_queue[key]
      }
    })
  }

  buildEntry(assetId: number){
    return {
      type: 'AddEntryNew',
      assetId: assetId,
      
      collateral: 0,
      ondelta: 0,
  
      offdelta: 0,

      they_requested_deposit: 0,
   
  
      pending_withdraw: 0,
      they_pending_withdraw: 0,
  
      credit_limit: 0,
      they_credit_limit: 0,
  
      interest_rate: 0,
      they_interest_rate: 0
  
    }
  }

  /*
  sha3 = (a) =>
    crypto
      .createHash('sha256')
      .update(bin(a))
      .digest()
  js_sha3 = require('js-sha3')
  sha3 = (a) => bin(js_sha3.sha3_256.digest(bin(a)))


  hrtime() {
    let hrTime = process.hrtime()
    return hrTime[0] * 1000000 + Math.round(hrTime[1] / 1000)
  }
  perf(label) {
    let started_at = hrtime()

    // unlocker you run in the end
    return () => {
      if (!perf.entries[label]) perf.entries[label] = []

      perf.entries[label].push(hrtime() - started_at)
    }
  } 
  perf.entries = {}
  perf.stats = (label) => {
    if (label) {
      var sum,
        avg = 0

      if (perf.entries[label].length) {
        sum = perf.entries[label].reduce(function (a, b) {
          return a + b
        })
        avg = sum / perf.entries[label].length
      }
      return [parseInt(sum), parseInt(avg)]
    } else {
      Object.keys(perf.entries).map((key) => {
        let nums = perf.stats(key)
        l(`${key}: sum ${commy(nums[0], false)} avg ${commy(nums[1], false)}`)
      })
    }
  }
  beforeFee(amount, bank) {
    let new_amount:number = Math.round((amount / (10000 - bank.fee_bps)) * 10000)
    if (new_amount == amount) new_amount = amount + this.Config.min_fee
    if (new_amount > amount + this.Config.max_fee)
      new_amount = amount + this.Config.max_fee
    amount = new_amount

    return new_amount
  }

  afterFees(amount, banks) {
    if (!(banks instanceof Array)) banks = [banks]
    for (var bank of banks) {
      let taken_fee = Math.round((amount * bank.fee_bps) / 10000)
      if (taken_fee == 0) taken_fee = this.Config.min_fee
      if (taken_fee > this.Config.max_fee) taken_fee = this.Config.max_fee
      amount = amount - taken_fee
    }

    return amount
  }

  commy(b, dot = true) {
    let prefix = b < 0 ? '-' : ''

    b = Math.abs(b).toString()
    if (dot) {
      if (b.length == 1) {
        b = '0.0' + b
      } else if (b.length == 2) {
        b = '0.' + b
      } else {
        var insert_dot_at = b.length - 2
        b = b.slice(0, insert_dot_at) + '.' + b.slice(insert_dot_at)
      }
    }
    return prefix + b.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }


  */
  async react(result) {
    // Flush an object to browser websocket. Send force=false for lazy react (for high-tps nodes like banks)

    

    Object.assign(result, this.sharedState)
    
    //if (new Date() - this.last_react < 500) {
      //l('reacting too often is bad for performance')
      //return false
    //}
    this.last_react = new Date()

    if (this.browsers.length == 0) {
      //l('headless')
      return
    }

    if (this.signer) {
      // slice channels
      result.channels = Object.values(this.Channels)

      result.channels.forEach(element => {
        element.derived = {}
        Object.keys(element.entries).forEach(id=>{
          element.derived[id] = this.deriveEntry(element, id)
        })
      });


    }

    try {
      const data = JSON.stringify(result)
      this.browsers.map((ws) => {
        if (ws.readyState == 1) {
          ws.send(data)
        }
      })
    } catch (e) {
      console.log(e)
    }
  }

  channelKey(a1:string, a2:string): string {
    const buf_a1 = Buffer.from(a1.slice(2).toLowerCase(), "hex");
    const buf_a2 = Buffer.from(a2.slice(2).toLowerCase(), "hex");
    const ordered_pair =
      Buffer.compare(buf_a1, buf_a2) == 1 ? [buf_a2, buf_a1] : [buf_a1, buf_a2];
    return "0x" + Buffer.concat(ordered_pair).toString("hex");

  }

  getCanonicalEntries(ch): Array<any>{

    const stateEntries = []

    for (const e of (<any>Object).values(ch.entries)) {
      if (!['AddEntrySent','AddEntryAck','DeleteEntryNew'].includes(e.type)) continue

      const left_locks = []
      const right_locks = []
      let offdelta = e.offdelta

      for (const t of ch.locks) {


        // lock is still in state
        if ([
          'AddLockSent',
          'AddLockAck',
          'DeleteLockNew'
        ].includes(t.type)) {
          if (ch.isLeft ^ t.inbound) {
            left_locks.push([t.amount, t.exp, t.hash])
          } else {
            right_locks.push([t.amount, t.exp, t.hash])
          }
        }


        if (t.type == 'DeleteLockSent' && t.outcomeType == 'secret') {
          offdelta += (ch.isLeft ^ t.inbound) ? -t.amount : t.amount
        }
      }

      // asset_id, offdelta, left_locks, right_locks
      stateEntries.push([e.assetId, offdelta, left_locks, right_locks])
    }

    return stateEntries

  }

  getCanonicalEntriesHash(ch): string{
    // offdelta is int and can be negative
    const encodedEntries = utils.defaultAbiCoder.encode(
      ['(uint,int,(uint,uint,bytes32)[],(uint,uint,bytes32)[])[]'], 
      [this.getCanonicalEntries(ch)]
      )

    return utils.keccak256(encodedEntries)
  }

  getCanonicalDisputeProof(ch): string{
    return utils.defaultAbiCoder.encode(["uint", "bytes", "uint", "uint", "bytes32"], [
      this.MessageType.DisputeProof,
      this.channelKey(this.signer.address, ch.partner),
      ch.channel_counter,
      ch.dispute_nonce,
      this.getCanonicalEntriesHash(ch),
    ])
  }

  getCooperativeProof(ch): string{
    return utils.defaultAbiCoder.encode(["uint", "bytes", "uint", "uint", "(uint,int,(uint,uint,bytes32)[],(uint,uint,bytes32)[])[]"], [
      this.MessageType.CooperativeProof,
      this.channelKey(this.signer.address, ch.partner),
      ch.channel_counter,
      ch.cooperative_nonce,
      this.getCanonicalEntries(ch),
    ])
  }

  getWithdrawalProof(ch, pairs: Array<Array<number>>): string{
    return utils.defaultAbiCoder.encode(["uint", "bytes", "uint", "uint", "(uint,uint)[]"], [
      this.MessageType.WithdrawProof,
      this.channelKey(this.signer.address, ch.partner),
      ch.channel_counter,
      ch.cooperative_nonce,
      pairs,
    ])
  }

  internal_rpc = require('./internal_rpc')
  external_rpc = require('./external_rpc')
 
  buildChannel = require('./offchain/build_channel')
  deriveEntry = require('./offchain/derive_entry')
  payChannel = require('./offchain/pay_channel')
  flushChannel = require('./offchain/flush_channel')
  updateChannel = require('./offchain/update_channel')
  rebalanceChannels = require('./offchain/rebalance_channels')
  
}

