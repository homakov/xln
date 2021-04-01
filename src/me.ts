
import * as http from "http"


const WebSocketClient = require('./utils/ws')
const stringify = require('../lib/stringify')

// system
const assert = require('assert')
const fs = require('fs')

const os = require('os')
const ws = require('ws')
const querystring = require('querystring')

// scrypt = require('scrypt') // require('./scrypt_'+os.platform())
const base58 = require('base-x')(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
)
 
/*
nacl = require('../../lib/nacl')

encrypt_box = nacl.box
open_box = nacl.box.open

// more highlevel wrappers that operate purely with JSON
encrypt_box_json = (box_data, target_pubkey) => {
  // we don't care about authentication of box, but nacl requires that
  let throwaway = nacl.box.keyPair()

  let unlocker_nonce = crypto.randomBytes(24)

  let box = encrypt_box(
    bin(JSON.stringify(box_data)),
    unlocker_nonce,
    target_pubkey,
    throwaway.secretKey
  )
  return r([bin(box), unlocker_nonce, bin(throwaway.publicKey)])
}

open_box_json = (box) => {
  let unlocker = r(box)
  let raw_box = open_box(
    unlocker[0],
    unlocker[1],
    unlocker[2],
    this.box.secretKey
  )
  if (raw_box == null) {
    return false
  } else {
    return parse(bin(raw_box).toString())
  }
}
 */

export class Me {
  account: unknown
  web3: any

  record: unknown
  datadir: string
  argv: unknown
  external_http_server: http.Server
  external_wss: any

  on_server: boolean



  Config = {}
  Channels = {}

  batch = []

  sockets = {}
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


  async start(seed) {
    console.log('Seed ', seed)

    this.account = this.web3.eth.accounts.privateKeyToAccount(seed)
    console.log('Account ', this.account)

    /*
    this.block_keypair = nacl.sign.keyPair.fromSeed(sha3('block' + this.seed))
    this.box = nacl.box.keyPair.fromSecretKey(this.seed)
    */

    await fs.writeFileSync(
      this.datadir + '/config.json',
      JSON.stringify(this.Config)
    )
  }


  async startExternalRPC(advertized_url) {
    if (!advertized_url) {
      return console.log('Cannot start rpc on ', advertized_url)
    }

    if (this.external_http_server) {
      return console.log('Already have external server started')
    }
    // there's 2nd dedicated websocket server for validator/bank commands

    this.external_http_server = http.createServer(
      async (req, res) => {
        var [path, query] = req.url.split('?')
        // call /faucet?address=ME&amount=100&asset=1
        if (path.startsWith('/faucet')) {
          res.setHeader('Access-Control-Allow-Origin', '*')

          let args = querystring.parse(query)
          console.log('faucet ', args)

          let status = await this.payChannel({
            address: args.address,
            amount: parseInt(args.amount),
            asset: parseInt(args.asset),
          })
          res.end(status)
        }
      }
    )

    var port = parseInt(advertized_url.split(':')[2])
    this.external_http_server.listen(this.on_server ? port : port)

    console.log(`Bootstrapping external_wss at: ${advertized_url}`)

    // lowtps/hightps

    //new (base_port == 8433 && false
    // ? require('uws')
    this.external_wss = new ws.Server({
      //noServer: true,
      //port: port,
      clientTracking: false,
      perMessageDeflate: false,
      server: this.external_http_server,
      maxPayload: 64 * 1024 * 1024,
    })

    this.external_wss.on('error', function (err) {
      console.log(err)
    })
    this.external_wss.on('connection', function (ws) {
      ws.on('message', (msg) => {
        this.external_rpc(ws, msg)
      })
    })
  }

  textMessage(they_pubkey, msg) {
    this.send(they_pubkey, {method: 'textMessage', msg: msg})
  }

  // a generic interface to send a websocket message to some user or validator
  // accepts Buffer or valid Service object
  send(addr:string, msg:any, optional_cb?:unknown) {
    if (this.sockets[addr]) {
      this.sockets[addr].send(msg)
      return true
    } else {
      
      this.sockets[addr] = new WebSocketClient()

      this.sockets[addr].onmessage = (msg) => {
        this.external_rpc(this.sockets[addr], msg)
      }

      this.sockets[addr].onerror = function (e) {
        console.log('Failed to open the socket to ', addr, e)
        delete this.sockets[addr]
      }
      this.sockets[addr].onopen = function (e) {
        if (this.addr) {
          this.send(addr, {method: 'auth', data: new Date()})
        }

        // first auth, then send actual message

        this.sockets[addr].send(msg)
      }

      this.sockets[addr].open('hub.uri')
    }

    return true
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
            let [got_job, got_resolve] = this.section_queue[key].shift()
            let started = performance.now()

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
  internal_rpc = require('./internal_rpc')
  external_rpc = require('./external_rpc')
  
  getChannel = require('./offchain/get_channel')
  payChannel = require('./offchain/pay_channel')
  flushChannel = require('./offchain/flush_channel')
  updateChannel = require('./offchain/update_channel')
  
  react = async function (result) {
    // Flush an object to browser websocket. Send force=false for lazy react (for high-tps nodes like banks)

    // banks dont react OR no alive browser socket
    if (this.my_bank && !result.force) {
      return //l('No working this.browser')
    }

    //if (new Date() - this.last_react < 500) {
      //l('reacting too often is bad for performance')
      //return false
    //}
    this.last_react = new Date()

    if (this.browsers.length == 0) {
      //l('headless')
      return
    }

    if (this.account) {
      // slice channels
      result.channels = this.Channels
      result.account = this.account
      result.batch = this.batch
      
    }

    try {
      let data = JSON.stringify(result)
      this.browsers.map((ws) => {
        if (ws.readyState == 1) {
          ws.send(data)
        }
      })
    } catch (e) {
      console.log(e)
    }
  }

}

//module.exports = Me
