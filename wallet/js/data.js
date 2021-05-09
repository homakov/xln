module.exports = {
  onchain: 'Onchain',

  online: true,

  lang: 'en',

  demochannels: [],
  max_visual_capacity: {},

  
  onServer: location.hostname == 'fairlayer.com',
  auth_code: localStorage.auth_code,

  bestRoutes: [],

  bestRoutesLimit: 5,
  chosenPartner: 0,
  
  creditLimit: '',
  depositAmount: '',
  withdrawAmount: '',
  requestCollateral: '',

  chosenRoute: '',

  gasprice: 1,
  events: [],

  reserves: [],

  assets: [],
  hubs: [],
  channels: [],
  payments: [],
  
  batch: [],

  pendingBatch: [],

  busyPorts: 0,

  
  new_bank: {
    handle: 'BestBank',
    location: `ws://${location.hostname}:${parseInt(location.port) + 100}`,
    fee_bps: 10,
    add_routes: '1',
    remove_routes: '',
  },

  
  address: false,
  EOA_balance: '',
  assetId: 0,
  
  password: '',
  username: '',

  consoleLog: '',


  tab: 'offchain',


  install_snippet: false,

  mod: {
    shown: false,
    subch: {},
    ch: {},
    acceptable_rebalance: '',
    credit: '',
  },

  expandedChannel: -1,

  off_to: '',
  off_amount: '',



  metrics: {},

  prefill: {},

  hubsForAddress: [],


  chosenHub:0,

  
  
  
  parsedAddress: {},

  settings: !localStorage.settings,

  newPayment: {
    address: hashargs['address'] ? hashargs['address'] : '',
    amount: hashargs['amount'] ? hashargs['amount'] : '',
    private_invoice: hashargs['invoice'],
    public_invoice: hashargs['invoice'],
    assetId: hashargs['assetId'] ? parseInt(hashargs['assetId']) : 0,

    type: 'offchain',
    bank: -1,
    editable: hashargs['editable'] ? hashargs['editable'] : 'all',

  },


  
  order: {
    amount: '',
    rate: '',
    buyAssetId: 2,
  },

  hardfork: '',

  // useful for visual debugging
  devmode: false,
  sync_started_at: false,
}
