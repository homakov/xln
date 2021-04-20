import { getAllJSDocTags } from "typescript"

//import * as minimist from 'minimist'
import minimist = require('minimist')

import crypto = require('crypto')
import fs = require('fs')
import {Me} from './me' //= require('./me')








async function main() {


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const me:any = new Me()


  //me.web3 = new Web3('http://127.0.0.1:8545')
  //console.log(me.web3.givenProvider)

  me.argv = minimist(process.argv.slice(2), {
    string: ['username', 'password'],
  })

  me.base_port = me.argv.p ? parseInt(me.argv.p) : 8001
  me.datadir = me.base_port == 8001 ? 'data' : 'data' + me.base_port
  
  me.on_server = !!me.argv['prod-server']
  process.title = 'XLN ' + me.base_port





  if (!fs.existsSync('./' + me.datadir)) {
    console.log('Creating ' + me.datadir)
    fs.mkdirSync('./' + me.datadir,'0777')
  }

  const file = './' + me.datadir + '/config.json'
  console.log('Loading ' + file)

  if (fs.existsSync(file)) {
    console.log("reading config")
    me.Config = JSON.parse(fs.readFileSync(file).toString())
  } else {
    me.Config = {
      auth_code: crypto.randomBytes(32).toString('hex'),
      pendingBatchHex: null,
    }
    //fs.mkdirSync('./' + me.datadir+'/sdf')

    console.log("Writing config")
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
  repl.context.t = this


}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
