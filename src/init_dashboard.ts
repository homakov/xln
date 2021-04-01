// serves default wallet and internal rpc on the same port
const child_process = require('child_process')
const querystring = require('querystring')
const ws = require('ws')

const opn = require('../lib/opn')
module.exports = async (me) => {
  const crashCallback = async (err) => {
    if (me._crashedSafely) return false

    console.log('crashCallback', err)
    me._crashedSafely = true

    me.fatal('Bye')
  }

  process.on('unhandledRejection', crashCallback)
  process.on('uncaughtException', crashCallback)
  process.on('exit', crashCallback)
  process.on('beforeExit', () => {
    console.log('before exit')
  })

  const finalhandler = require('finalhandler')
  const serveStatic = require('serve-static')
  const path = require('path')

  let bundler

  const cb = async function (req, res) {
    // Clickjacking protection
    res.setHeader('X-Frame-Options', 'DENY')

    var [path, query] = req.url.split('?')
    if (path == '/demoinstance') {
      let startingPort = 8500
      for (var i = startingPort; i < startingPort + 30; i++) {
        if (!me.busyPorts[i]) {
          var nextPort = i
          me.busyPorts[nextPort] = new Date()
          break
        }
      }

      if (nextPort) {
        console.log('Started demoinstance ' + nextPort)
        console.log(
          child_process
            .execSync(
              `pm2 delete f${nextPort} > /dev/null; 
            rm -rf data${nextPort};
            mkdir data${nextPort}; 
            cp -r data/onchain data${nextPort}/onchain;
            pm2 start --name f${nextPort} fair.js -- --wallet-dist --datadir=data${nextPort} -p${nextPort} -s > /dev/null;`
            )
            .toString()
        )
        //--wallet-dist --prod-server

        await me.sleep(2500)

        let instanceLog = child_process
          .execSync(`cat data${nextPort}/config.json`)
          .toString()

          console.log('instance log', instanceLog)

        if (!instanceLog) {
          return
        }

        let auth_code = instanceLog.split('auth_code":"')[1].split('"')[0]
        // we redirect the user to authenticated cloud instance
        res.writeHead(302, {
          Location: `http://fairlayer.com:${nextPort}/#auth_code=${auth_code}`,
        })

        /*
        res.writeHead(302, {
          Location: `http://demo-${
            nextPort - startingPort
          }.fairlayer.com/#auth_code=${auth_code}`,
        })*/

        setTimeout(() => {
          console.log(`Destroying demo... ${nextPort}`)
          //child_process.execSync(``)
          // free up port
          delete me.busyPorts[nextPort]
        }, 300 * 60 * 1000)

        res.end('redirect')
      } else {
        res.end(
          'No available slot found for your cloud demo. Wait, or install locally.'
        )
      }
    } else if (path == '/health') {
      res.end(
        JSON.stringify({
          uptime: 3//new Date() - me.node_started_at,
        })
      )
    } else if (path == '/rpc') {
      res.setHeader('Content-Type', 'application/json')

      var queryData = ''
      req.on('data', function (data) {
        queryData += data
      })

      req.on('end', function () {
        // HTTP /rpc endpoint supports passing request in GET too
        var json = Object.assign(querystring.parse(query), JSON.parse(queryData))

        if (!json.params) json.params = {}
        me.internal_rpc(res, json)
      })
    } else {
      bundler(req, res, finalhandler(req, res))
    }
  }

  if (me.argv['wallet-url']) {
    const walletUrl = me.argv['wallet-url']
    const http = require('http')
    const proxy = require('http-proxy').createProxyServer({
      target: walletUrl,
    })
    bundler = (req, res) => proxy.web(req, res, {}, finalhandler(req, res))
    let retries = 0

    while (true) {
      const statusCode = await new Promise((resolve) => {
        console.log('Reaching wallet ', walletUrl)
        http
          .get(walletUrl, (res) => {
            const {statusCode} = res
            resolve(statusCode)
          })
          .on('error', (e) => {
            resolve(404)
          })
      })
      if (statusCode !== 200) {
        if (retries > 0) {
          console.log(`Waiting for Parcel (HTTP ${statusCode})`)
        }
        if (retries > 5) {
          throw new Error('No parcel on ' + walletUrl)
        }
        await me.sleep(1000 * Math.pow(1.5, retries))
        retries++
        continue
      }
      console.log('Parcel: OK')
      break
    }
  } else if (me.argv['wallet-dist']) {
    let dist = path.resolve(__dirname, '../dist')
    console.log('Start parcel at dist ' + dist)
    bundler = serveStatic(dist)
  } else {
    let Parcel = require('parcel-bundler')
    let index = path.resolve(__dirname, '../wallet/index.html')
    console.log('Start parcel at ' + index)
    bundler = new Parcel(index, {
      logLevel: 2,
      // for more options https://parceljs.org/api.html
    }).middleware()
  }

  // this serves dashboard HTML page
  var server = require('http').createServer(cb)

  server
    .listen(me.on_server ? me.base_port : me.base_port)
    .once('error', function (err) {
      if (err.code === 'EADDRINUSE') {
        console.log(
          `Port ${
            me.base_port
          } is currently in use. Pass -p PORT to use another port.`
        )
        process.exit(0)
      }
    })

  const url = `http://${
    me.on_server ? 'fairlayer.com' : 'localhost'
  }:${me.base_port}/#auth_code=${me.Config.auth_code}`
  console.log(`Open ${url} in your browser`)

  // opn doesn't work in SSH console
  if (!me.argv.silent && !me.argv.s) {
    opn(url)
  }

  me.internal_wss = new ws.Server({server: server, maxPayload: 64 * 1024 * 1024})

  me.internal_wss.on('error', function (err) {
    console.error(err)
  })
  me.internal_wss.on('connection', function (socket) {
    socket.on('message', (msg) => {
      me.internal_rpc(socket, JSON.parse(Buffer.from(msg).toString()))
    })
  })
}
