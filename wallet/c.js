//import Vue from 'vue'
import VisualChannel from './js/VisualChannel.js'

Vue.component('visual-channel', VisualChannel)

window.onload = function () {
  var ws = new WebSocket('ws://fairlayer.com:8000/')

  ws.onopen = function () {
    ws.send('{"leak_channels":true}')
  }

  ws.onmessage = function (m) {
    let data = JSON.parse(m.data)

    var caps = data.map((ch) => ch.insurance + ch.credit + ch.they_credit)
    app.max_visual_capacity = Math.round(Math.max(...caps) * 1.1)

    app.channels = data

    console.log(data)
  }

  var channels = [
    {
      name: 'alice',
      insurance: 100,
      delta: 50,
      credit: 200,
      they_credit: 100,
    },
  ]

  if (location.hash.length > 2) {
    var channels = JSON.parse(atob(location.hash.slice(1)))
  }

  window.app = new Vue({
    el: '#app',
    components: {VisualChannel},

    data: {
      max_visual_capacity: 999999,
      channels: channels,

      ch: {
        b1: channels,
      },

      cmd: `Alice-Bob 100`,

      onchain: {},
    },
    methods: {
      commy: function (b, asset = 1) {
        var dot = true
        var withSymbol = ''

        if (asset == 2) {
          withSymbol = '€'
        }

        let prefix = b < 0 ? '-' : ''

        b = Math.abs(Math.round(b)).toString()
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

        if (withSymbol) {
          prefix = prefix + withSymbol
        }

        return prefix + b.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      },
      resolveChannel: function (c) {
        c.they_uninsured = c.delta < 0 ? -c.delta : 0
        c.insured =
          c.delta > c.insurance ? c.insurance : c.delta > 0 ? c.delta : 0
        c.they_insured =
          c.delta > c.insurance
            ? 0
            : c.delta > 0
            ? c.insurance - c.delta
            : c.insurance
        c.uninsured = c.delta > c.insurance ? c.delta - c.insurance : 0

        if (!c.is_left) {
          for (let word of ['insured', 'uninsured']) {
            let old = c[word]
            c[word] = c['they_' + word]
            c['they_' + word] = old
          }
        }

        c.available_credit = c.they_credit - c.they_uninsured
        c.they_available_credit = c.credit - c.uninsured

        c.capacity = c.insurance + c.credit + c.they_credit

        //console.log(c)

        return c
      },

      execCmd: function () {
        let split = this.cmd.split(' ')
        if (parseInt(split[2]) > 0) {
          // money transfer
        } else if (split[2] == 'credit') {
        }

        console.log(this.cmd)
      },

      payChan: (ch, left) => {
        let amount = 10
        //parseInt(prompt("How much?"))

        if (isNaN(amount)) amount = 10

        if (left) {
          let available = ch.state + ch.they_credit
          if (available < amount) {
            return //alert('Only '+available+' is available, cannot pay '+amount)
          } else {
            ch.state -= amount
          }
        } else {
          let available = ch.collateral + ch.credit - ch.state
          if (available < amount) {
            return //alert('Only '+available+' is available, cannot pay '+amount)
          } else {
            ch.state += amount
          }
        }
      },
    },
  })

  setInterval(function () {
    //location.hash = btoa(JSON.stringify(app.channels))
  }, 500)
}
