// this file is only used during genesis to set initial K params and create first validators
const derive = require('./derive')

module.exports = async (datadir) => {
  l('Start genesis')

  // all timeouts are in milliseconds
  let sec = 1000

  // K is a handy config JSON
  const K = {
    // Things that are different in testnet vs mainnet
    network_name: 'testnet',

    usable_blocks: 0, // blocks that have some extra space (to ensure disputes add on-time)
    total_blocks: 0, // total number of blocks full or not

    standalone_balance: 1000, // keep $10 on your own balance for unexpected onchain fees
    bank_standalone_balance: 100000, // bank has higher operational costs

    // up to X seconds, validators don't propose blocks if empty
    // the problem is all delayed actions also happen much later if no blocks made
    skip_empty_blocks: 0,

    // each genesis is randomized
    prev_hash: toHex(crypto.randomBytes(32)), // toHex(Buffer.alloc(32)),

    risk: 10000, // banks usually withdraw after this amount

    credit: 1000000, // how much can a user lose if bank is insolvent?
    acceptable_rebalance: 100, // in basis points, acceptable fee

    collected_fees: 0,

    // latest block done at
    ts: 0,

    assets_created: 2,

    // sanity limits for offchain payments
    min_amount: 5,
    max_amount: 300000000,

    validators: [],
    banks: [],

    cache_timeout: 3 * sec, //keep channel in memory since last use
    safe_sync_delay: 180 * sec, //after what time prohibit using wallet if unsynced
    sync_limit: 500, // how many blocks to share at once

    // global wide fee sanity limits
    min_fee: 1,
    max_fee: 5000,

    // hashlock and dispute-related
    secret_len: 32,

    dispute_delay_for_users: 8, // in how many blocks disputes are considered final
    dispute_delay_for_banks: 4, // fast reaction is expected by banks

    hashlock_exp: 16, // how many blocks (worst case scenario) a user needs to be a able to reveal secret
    hashlock_keepalive: 100, // for how many blocks onchain keeps it unlocked since reveal (it takes space on all fullnodes, so it must be deleted eventually)
    max_hashlocks: 20, // we don't want overweight huge dispute strings
    hashlock_service_fee: 100, // the one who adds hashlock pays for it

    // ensure it is much shorter than hashlock_exp
    dispute_if_no_ack: 60 * sec, // how long we wait for ack before going to blockchain
  }

  // Defines global Byzantine tolerance parameter
  // 0 would require 1 validator, 1 - 4, 2 - 7.
  // Long term goal is 3333 tolerance with 10,000 validators
  Config.tolerance = 1

  Config.total_shares = Config.tolerance * 3 + 1

  
  
  const Router = require('../router')

  // testing stubs to check dijkstra
  if (argv.generate_airports) {
    let addBank = (data) => {
      data.id = Config.banks.length + 1000
      data.fee_bps = Math.round(Math.random() * 500)

      data.pubkey = crypto.randomBytes(32)
      data.createdAt = new Date()
      data.location = 'ws://127.0.0.1:8100'
      Config.banks.push(data)
      return data
    }

    // https://www.kaggle.com/open-flights/flight-route-database/discussion
    let data = fs.readFileSync('./tools/routes.csv', {encoding: 'utf8'})

    let routes = data.split('\n').slice(0, 200)

    for (let route of routes) {
      let parts = route.split(',')

      // direct flights only
      if (parts[7] != '0') continue

      //from 2 to 4
      let from = Config.banks.find((h) => h.handle == parts[2])
      let to = Config.banks.find((h) => h.handle == parts[4])

      // if not exists, create stub-banks
      if (!from) from = addBank({handle: parts[2]})
      if (!to) to = addBank({handle: parts[4]})

      if (Router.getRouteIndex(from.id, to.id) == -1) {
        // only unique routes are saved
        Config.routes.push([from.id, to.id])
      }
    }
  }

  // private config
  const Config = {
    username: 'root',
    seed: bankSeed.toString('hex'),
    auth_code: toHex(crypto.randomBytes(32)),

    pendingBatchHex: null,
  }

  await fs.writeFileSync(
    './' + datadir + '/config.json',
    JSON.stringify(Config)
  )

  // not graceful to not trigger hooks
  process.exit(0)
}
