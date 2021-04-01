const Periodical = {
  syncChanges: require('./sync_changes'),

  rebalance: require('./rebalance'),
  ensureAck: require('./ensure_ack'),
  broadcast: require('./broadcast'),
  forceReact: () => {
    react({})
  },

  leakData: async function () {
    if (me.leak_channels_ws.length > 0) {
      let result = {
        channels: [],
        users: cached_result.users,
      }

      let chans = await Channel.findAll()
      for (let d of chans) {
        let ch = await me.getChannel(d.they_pubkey)

        result.channels.push({
          insurance: ch.derived[1].insurance,
          delta: ch.derived[1].delta,
          credit: ch.derived[1].credit,
          they_credit: ch.derived[1].they_credit,

          is_left: ch.derived[1].is_left,
          name: ch.d.they_pubkey,

          status: ch.d.status,
          nonce: ch.d.dispute_nonce,
        })
      }

      //only first asset
      me.leak_channels_ws.map((ws) => {
        if (ws.readyState == 1) {
          ws.send(JSON.stringify(result))
        }
      })
    }
  },

  timeouts: {},
}

Periodical.schedule = function schedule(task, timeout) {
  if (Periodical.timeouts[task]) {
    // clear if there's existing timeout and re-schedule
    clearTimeout(Periodical.timeouts[task])
    delete Periodical.timeouts[task]
  }

  if (timeout == 0) return

  var wrap = async function () {
    //l('Start ', task)
    await Periodical[task]()
    Periodical.timeouts[task] = setTimeout(wrap, timeout)
  }

  wrap()
}

Periodical.startBank = () => {
  me.startExternalRPC(me.my_bank.location)

  Periodical.schedule('rebalance', Config.blocktime * 2)
}

module.exports = Periodical
