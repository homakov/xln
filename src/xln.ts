import { getAllJSDocTags } from "typescript"

//import Web3 from 'web3'
const Web3 = require('web3')

import crypto = require('crypto')
import fs = require('fs')
import {Me} from './me' //= require('./me')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const me:any = new Me()
 

me.web3 = new Web3('http://127.0.0.1:8545')
console.log(me.web3.givenProvider)



//const SegfaultHandler = require('segfault-handler')
//SegfaultHandler.registerHandler('crash.log')

me.argv = require('minimist')(process.argv.slice(2), {
  string: ['username', 'password'],
})

me.datadir = me.argv.datadir ? me.argv.datadir : 'data'
me.base_port = me.argv.p ? parseInt(me.argv.p) : 8001
me.on_server = !!me.argv['prod-server']

process.title = 'XLN ' + me.base_port


//let git_commit = child_process.execSync('cat HEAD').toString().trim()

const startDaemon = async () => {
  if (!fs.existsSync('./' + me.datadir)) {
    console.log('Creating ' + me.datadir)
    fs.mkdirSync('./' + me.datadir)
  }

  const file = './' + me.datadir + '/config.json'
  console.log('Loading ' + file)

  if (fs.existsSync(file)) {
    me.Config = JSON.parse(fs.readFileSync(file).toString())
  } else {
    me.Config = {
      auth_code: crypto.randomBytes(32).toString('hex'),
      pendingBatchHex: null,
    }
    fs.writeFileSync(file, JSON.stringify(me.Config))
  }

  console.log(me.Config)


  
  if (me.argv.username && me.argv.password) {
    me.Config.seed = '0x'+(await require('./utils/derive')(me.argv.username, me.argv.password)).toString('hex')
  }
  if (me.Config.seed) {
    await me.start(me.Config.seed)
  }

  require('./init_dashboard')(me)

  const repl = require('repl').start('')
  repl.context.me = me
}

startDaemon()
