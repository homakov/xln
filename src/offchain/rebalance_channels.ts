/*
Once in a while the hub must submit a rebalance batch onchain.
Net-receivers request more collateral, so the hub needs to withdraw from net-senders.


The most important job of the bank is to rebalance assets once in a while.
1. the bank finds who wants to insure their uninsured balances. They can learn automatically (given soft limit) or manually (Request Insurance in the wallet)
2. now the bank tries to find the total amount of insurance needed from the net-spenders who are currently online
3. it's up to the alg implementation to start disputes with net-spenders who are offline for too long
4. if bank fails to find enough net-spenders right now, they may drop some low value or high value net-receivers to match the numbers on both sides
5. packs withdrawals and deposits into one large rebalance batch and broadcasts onchain

Current implementation is super simple and straightforward. There's huge room for improvement:
* smart learning based on balances over time not on balance at the time of matching
* use as little withdrawals/deposits to transfer as much as possible volume
* have different schedule for different assets, e.g. rebalance FRD every 1 block but rare assets every 1k blocks
* often bank needs to request insurance from another bank (cross-bank payments).

General recommendations:
1. assets stuck in a dispute is a waste. It's better to do everything by mutual agreement as much as possible, w/o suffering dispute delays and locked up liquidity
2. the bank must store as little funds on their @onchain balances as possible. So once bank withdraw from net-spenders they should immediately deposit it to net-receiver.



tier1 
tier2 
tier3 reserve-backed
tier4 custodial
*/


module.exports = async function () {
  //let current_rebalance_fee = Config.min_gasprice * 200

  const addrs = Object.keys(this.Channels)

  for (let assetId = 0; assetId <= this.sharedState.assets.length; assetId++) {
    const minRisk = 500
    const netSenders = []
    const netReceivers = []
    const pullable = []

    for (const addr of addrs) {
      //await section(['use', d.they_pubkey], async () => {
      const ch = this.Channels[addr]
      
      if (!ch.entries[assetId]) continue

      const derived = this.deriveEntry(ch, assetId)
      const entry = ch.entries[assetId]

      
      // finding who has uninsured balances AND
      // requests insurance OR gone beyond soft limit

      if (entry.they_requested_deposit > 0) {
        netReceivers.push([entry, addr])
      }

      if (derived.secured >= minRisk) {
        if (this.websockets[ch.partner]) {
          pullable.push([derived.secured, ch.partner])
        }
      }
    }

    // sort receivers, bigger ones are given priority
    netReceivers.sort(
      (a, b) =>
        b[0].they_requested_deposit - a[0].they_requested_deposit
    )

    const totalToReceive = netReceivers.reduce(function(a, b) { return a + b[0].they_requested_deposit; }, 0);

    // no need to pull
    if (totalToReceive == 0) return

    pullable.sort(
      (a, b) =>
        b[0] - a[0]
    )


    for (const [secured, addr] of pullable) {
      const pairs = [[assetId, secured]]

      const promise = this.sendSync(addr, {method: 'getWithdrawalSig', pairs: pairs}).then(async sig=>{
        console.log("Response sig", sig)
        if (sig) {      
          this.sharedState.batch.channelToReserve.push({
            sig: sig,
            partner: addr,
            pairs: pairs,
          })
          return pairs[0][1]
        } else {
          this.react({alert: "Partner is unresponsive"})
          return 0
        }
      })

      console.log("Adding netsender ", addr)
      netSenders.push(promise)
    }
    
    /*else if (subch.withdrawal_requested_at == null) {
      l('Delayed pull')
      subch.withdrawal_requested_at = new Date()
    } else if (subch.withdrawal_requested_at + 600000 < new Date()) {
      l('User is offline for too long, or tried to cheat')
      me.batchAdd('dispute', await startDispute(ch))
    }
  }*/


    //})

    // checking on all withdrawals we expected to get, then rebalance
    const withdrawn = (await Promise.all(netSenders)).reduce(function(a, b) { return a + b; }, 0);

    // 1. how much we own of this asset
    if (withdrawn > 0)
    console.log('withdrawn', withdrawn, netReceivers)

    let weOwn = this.sharedState.reserves[assetId] + withdrawn
    
    
    // 3. debts will be enforced on us (if any), so let's deduct them beforehand
    //let debts = await me.record.getDebts({where: {asset: asset}})
    //for (let d of debts) {
    //  weOwn -= d.amount_left
    //}


    // dont let our reserve go lower than that
    const safety = 0

    // 4. now do our best to cover net receivers
    for (const [entry, addr] of netReceivers) {
      weOwn -= entry.they_requested_deposit
      
      if (weOwn >= safety) {
        this.sharedState.batch.reserveToChannel.push({
          receiver: this.signer.address,
          partner: addr,
          pairs: [[assetId, entry.they_requested_deposit]], 
        })

        // nullify their request
        entry.they_requested_deposit = 0
      } else {
        console.log(
          `Run out of funds for asset ${assetId}, own ${weOwn} `
        )
        break
      }
    }

  }


  //this.broadcastBatch()
}
