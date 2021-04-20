// Flush all new transitions to state channel. Types:
/*
Payment lifecycles:
outbound: addNew > addSent > addAck > delAck
inbound: addAck > delNew > delSent > delAck

add - add outbound lock
del - remove inbound lock by providing secret (applies amount to offdelta) or reason of failure (offdelta is unchanged)



*/

module.exports = async function(addr, forceAck) {

  if (!this.ethers.utils.isAddress(addr)) return console.log("not an address")


  console.log(`Requested Flush ${addr} forceAck ${forceAck}`)

  const ch = this.Channels[addr] ? this.Channels[addr] : this.buildChannel(addr)

  ch.last_used = new Date()

  // an array of partners we need to ack or flush changes at the end of processing
  const flushable: Array<string> = []

  if (ch.status == 'disputed') {
    /*
    for (let t of ch.payments) {
      if (t.type + t.status == 'addnew') {
        t.type = 'del'
        t.status = 'ack'
        t.outcome_type = 'fail'
        await t.save()

        if (t.inward_pubkey) {
          inward_ch = await me.getChannel(t.inward_pubkey)

          let to_fail = inward_ch.payments.find((p) => p.hash.equals(t.hash))
          to_fail.type = 'del'
          to_fail.status = 'new'
          to_fail.outcome_type = 'outcomeCapacity'
          to_fail.outcome = 'outcomeCapacity'
          await to_fail.save()

          me.metrics.fail.current++
        }
      }
    }
    */
  }

  if (ch.status == 'sent') {
    console.log(`End flush ${addr}, in sent`)

    //me.send(addr, 'update', ch.d.pending)
    return
  }

  const flushData = {
    method: 'updateChannel',

    dispute_nonce: ch.dispute_nonce,

    ackEntries: this.getCanonicalEntries(ch),
    ackSig: await this.signer.signMessage(this.getCanonicalState(ch)),

    transitions: [],
 
    finalState: false,
    finalSig: false,
    finalEntries: false
  }

  //console.log(ch)


  if (ch.status != 'ready') {
    console.log("not ready: ", ch.status)
    return false
  }

  for (const t of (<any>Object).values(ch.entries)) {

    if (t.type == 'AddEntryNew') {
      flushData.transitions.push({
        type: t.type,
        assetId: t.assetId
      })
      t.type = 'AddEntrySent'
    }

    if (t.type == 'DeleteEntryNew') {
      flushData.transitions.push({
        type: t.type,
        assetId: t.assetId
      })
      t.type = 'DeleteEntrySent'
    }


    
  }

  // first we unlock locks to increase outbound capacity
  for (const t of ch.locks) {
    if (t.type != 'DeleteLockNew') continue
  

    // remove a hashlock and provide either secret or reason of failure

    
    if (t.outcomeType == 'secret') {
      ch.entries[t.assetId].offdelta += ch.isLeft ? t.amount : -t.amount
    }
    flushData.transitions.push({
      type: t.type, 
      assetId: t.assetId,
      hash: t.hash,
      outcomeType: t.outcomeType,
      outcome: t.outcome 
    })

    t.type = 'DeleteLockSent'
  }

  // then add locks
  for (const t of ch.locks) {
    if (t.type != 'AddLockNew') continue
    const derived = this.deriveEntry(ch, t.assetId)

    //derived.outbound.length >= 10
    if (t.amount > derived.outbound_capacity) {

      console.log(
          `Cannot transit ${t.amount}/${derived.outbound_capacity}. Locks ${derived.outbound_locks.length}.`
        )

      // if we are hub, notify next hop to increase capacity

      if (this.external_wss && t.amount > derived.outbound_capacity) {
        this.textMessage(
          addr,
          `Not enough inbound capacity to receive ${t.amount}, extend credit by ${
            t.amount - derived.outbound_capacity
          }`
        )
      }

      //this.metrics.fail.current++
      t.type = 'DeleteLockAck'

      if (t.inboundAddress) {
        const inboundLock = this.Channels[t.inboundAddress].locks.find(l=>l.inbound && l.assetId==t.inboundAssetId && l.hash == t.hash)
        inboundLock.type = 'DeleteLockNew'
        t.outcomeType = 'NoCapacity'
        if (!flushable.includes(t.inboundAddress)) flushable.push(t.inboundAddress)

      }

      continue



    } 
  
    // set exp right before flushing to keep it fresh

    //this.Config.usable_blocks + this.Config.hashlock_exp


    flushData.transitions.push({
      type: t.type, 
      assetId: t.assetId, 
      amount: t.amount, 
      hash: t.hash, 
      exp: t.exp, 
      unlocker: t.unlocker
    })
    t.type = 'AddLockSent'

  }


  



  if (flushData.transitions.length == 0) {
    if (forceAck) {
      // continue anyway without transitions just to send ack
    } else {
      console.log(`Nothing to flush ${addr}`)
      return  
    }
  } else {
    // there are transitions, need to give finalAck on top
    ch.ackRequestedAt = new Date()
    ch.status = 'sent'

    // left increments nonce +2, see rollbacks
    ch.dispute_nonce += ch.isLeft ? 2 : 1

    flushData.finalEntries = this.getCanonicalEntries(ch)
    flushData.finalState = this.getCanonicalState(ch)
      
    // signing the final state
    flushData.finalSig = await this.signer.signMessage(this.getCanonicalState(ch))
  }
  


  console.log('flushData',flushData)


  this.send(addr, flushData)

  return //Promise.all(flushable.map((fl) => me.flushChannel(fl, true)))

}
