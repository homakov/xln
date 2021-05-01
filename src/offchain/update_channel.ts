// This method receives set of transitions by another party and applies it
// banks normally pass forward payments, end users normally decode payloads and unlock hashlocks



const nacl = require('../../lib/nacl')

import { utils, ethers } from 'ethers'


function swapType(array, fromType, toType) {
  array.forEach(element => {
    if (element.type == fromType) {
      element.type = toType
    }
  });
}


module.exports = async function (
  addr: string,
  json: any
) {

  // an array of partners we need to ack or flush changes at the end of processing
  const flushable = []

  if (!this.Channels[json.addr]) {
    // if we are hub
    if (this.external_wss) {
      this.buildChannel(json.addr)
      console.log("created ", json.addr)  
    } else {
      // only hubs allow opening channel to them
      return 
    }
    //this.flushChannel(json.addr, true)
    //return
  } 
  

  const ch = this.Channels[json.addr]

  //await this.sleep(500)

  
  ch.last_used = new Date()


  if (ch.status == 'disputed') {
    console.log('We are in a dispute')
    return
  }


  console.log('received json', json)

  /* 
  Step 1. Verify current dispute_nonce and ackSig as an acknowledgement of current state
  */

  // verify ack
  // our last known state has been ack.

  if(json.dispute_nonce == ch.dispute_nonce) {
    const signer = await this.hashAndVerify(this.getCanonicalDisputeProof(ch), json.ackSig)

    if (addr == signer) {
      // we must store latest dispute proof signature
      ch.ackSig = json.ackSig
      ch.ackRequestedAt = 0
        
      swapType(Object.values(ch.entries), 'AddEntrySent', 'AddEntryAck')
      swapType(Object.values(ch.entries), 'DeleteEntrySent', 'DeleteEntryAck')

      swapType(Object.values(ch.locks), 'AddLockSent', 'AddLockAck')
      swapType(Object.values(ch.locks), 'DeleteLockSent', 'DeleteLockAck')
    } else {
      console.log("Invalid signer for ackSig", signer, this.getCanonicalDisputeProof(ch), 'vs ', json.ackState)
    }
  } else {
    // they make transitions on top of different (older) dispute_nonce
    // it happens when both users make update at the same time 
    // REVERT if right, IGNORE, if left
    if (ch.isLeft) {
      // ignoring this request. there is no point in storing ackSig 
      // right user will have higher dispute_nonce+1 anyway
      return
    } else if (json.dispute_nonce == ch.dispute_nonce - 1) {
      // rollback to previous state, apply their transitions, 
      // then flush and re-apply our transitions
      

    } else {
      console.log("Invalid dispute_nonce in rollback")
      return
    }
  }


  ch.status = 'ready'

  let stateChanged = false

  // can be used later in revert if finalSig is invalid
  const originalLocksLength = ch.locks.length

  for (const t of json.transitions) {
    console.log("Processing transition: ", t)
    if (t.type == 'AddEntryNew' && !ch.entries[t.assetId]) {
      ch.entries[t.assetId] = this.buildEntry(t.assetId)
      ch.entries[t.assetId].type = 'AddEntrySent'
      stateChanged = true
    }    

    if (t.type == 'DeleteEntryNew' && ch.entries[t.assetId]) {
      ch.entries[t.assetId].type = 'DeleteEntrySent'
      stateChanged = true
    }


    if (t.type == 'AddLockNew' && ch.entries[t.assetId]) {

      let failure = false

      // every 'add' transition must pass an encrypted envelope (onion routing)
      const box = Buffer.from(t.unlocker, 'hex')
      // 24 unlocker + 32 pubkey = 56
      const binaryJSON = nacl.box.open(
        box.slice(56),//box
        box.slice(0,24),//nonce
        box.slice(24,56),//pubkey
        this.boxPair.secretKey
      )

      // create AddLockAck only when we are a hub mediating a payment
      // in all other scenarios create DeleteLockNew
      const boxData = binaryJSON ? JSON.parse(Buffer.from(binaryJSON).toString()) : {}
      console.log('boxdata', boxData)

      const inboundLock:any = {
        type: 'AddLockSent',
        assetId: t.assetId,
        inbound: true,
        amount: t.amount,
        hash: t.hash,
        exp: t.exp,
      }

      if (boxData.assetId == t.assetId && 
        boxData.amount == t.amount && 
        this.Channels[boxData.nextHop] && 
        this.Channels[boxData.nextHop].entries[t.assetId] &&
        boxData.unlocker) {


        // try paying to nextHop, ignoring outbound_capacity

        this.Channels[boxData.nextHop].locks.push({
          type: 'AddLockNew',
          assetId: t.assetId,
          inbound: false,
          amount: t.amount,
          hash: t.hash,
          exp: t.exp,
          unlocker: boxData.unlocker,
          inboundAddress: addr,
          inboundAssetId: t.assetId
        })

        if (!flushable.includes(boxData.nextHop)) {
          flushable.push(boxData.nextHop)
        }

      } else {
        // delete the lock right away IF we got the secret OR the payment is invalid
        inboundLock.type = 'DeleteLockNew'

        if (boxData.secret && utils.keccak256(Buffer.from(boxData.secret,'hex')) == t.hash) {
          console.log("good secret")
          inboundLock.outcome = boxData.secret
          inboundLock.outcomeType = 'secret'
        } else {
          inboundLock.outcomeType = 'invalid'
        }


      }

      ch.locks.push(inboundLock)



      stateChanged = true
    }



    if (t.type == 'DeleteLockNew' && ch.entries[t.assetId]) {

      const outboundLock = ch.locks.find(l=>{
        return !l.inbound && l.type == 'AddLockAck' && l.hash == t.hash && l.assetId == t.assetId
      })

      if (!outboundLock) {
        console.log("No such lock found")
        continue
      } 

      outboundLock.type = 'DeleteLockSent'

      if (t.outcomeType == 'secret' && utils.keccak256(Buffer.from(t.outcome,'hex')) == outboundLock.hash) {
        // received valid preimage, apply the lock to offdelta
        ch.entries[t.assetId].offdelta += ch.isLeft ? -outboundLock.amount : outboundLock.amount
      } else {
        // lock is not applied
      }

      if (outboundLock.inboundAddress && this.Channels[outboundLock.inboundAddress]) {
        const inboundLock = this.Channels[outboundLock.inboundAddress].locks.find(l=>{
          return l.inbound && l.type == 'AddLockAck' && l.hash == t.hash && l.assetId == outboundLock.inboundAssetId
        })

        console.log('found ', inboundLock, this.Channels[outboundLock.inboundAddress].locks)

        inboundLock.type = 'DeleteLockNew'
        inboundLock.outcome = t.outcome
        inboundLock.outcomeType = t.outcomeType

        if (!flushable.includes(outboundLock.inboundAddress)) {
          flushable.push(outboundLock.inboundAddress)
        }


      }

      stateChanged = true
    }

  }

  if (stateChanged) {
    ch.dispute_nonce += ch.isLeft ? 1 : 2

    // verify finalSig
    const signer = await this.hashAndVerify(this.getCanonicalDisputeProof(ch), json.finalSig)
    if (signer == addr) {

      swapType(Object.values(ch.entries), 'AddEntrySent', 'AddEntryAck')
      swapType(Object.values(ch.entries), 'DeleteEntrySent', 'DeleteEntryAck')
      swapType(Object.values(ch.locks), 'AddLockSent', 'AddLockAck')
      swapType(Object.values(ch.locks), 'DeleteLockSent', 'DeleteLockAck')
      
    } else {
      console.log('rollback everything - the finalSig is not valid',json.finalEntries, this.getCanonicalEntries(ch))

      // delete all newly created locks with splice
      ch.locks.splice(originalLocksLength)

      Object.keys(ch.entries).forEach(key=>{
        if (ch.entries[key].type == 'AddEntrySent') {
          // delete new entries
          delete ch.entries[key]
        } else if (ch.entries[key].type == 'DeleteEntrySent') {
          // revert deleted entries 
          ch.entries[key].type = 'AddEntryAck'
        }
      })

      swapType(Object.values(ch.entries), 'AddEntrySent', 'AddEntryAck')
      swapType(Object.values(ch.entries), 'DeleteEntrySent', 'DeleteEntryAck')
      swapType(Object.values(ch.locks), 'AddLockSent', 'AddLockAck')
      swapType(Object.values(ch.locks), 'DeleteLockSent', 'DeleteLockAck')
      
    }


    

  }


  
  /*
    


  
  
  
  
  
  
      outward_hl.type = t[0]
      outward_hl.status = 'ack'
      // pass same outcome down the chain
      outward_hl.outcome_type = outcome_type
      outward_hl.outcome = outcome

      ch.d.dispute_nonce++
      if (!deltaVerify(ch.d, refresh(ch), ackSig)) {
        let lastState = r(fromHex(t[3]))
        prettyState(lastState)

        mismatch('error: Invalid state sig at del', lastState)
        break
      }

      me.metrics[valid ? 'settle' : 'fail'].current++

      refresh(ch)
      outward_hl.resulting_balance = ch.derived[asset].available

      await outward_hl.save()

      // if there's an inward channel for this, we are bank
      if (outward_hl.inward_pubkey) {
        //await section(['use', outward_hl.inward_pubkey], async () => {
        var inward_ch = await me.getChannel(outward_hl.inward_pubkey)

        if (inward_ch.d.status == 'disputed' && valid) {
          loff(
            'The inward channel is disputed (pointless to flush), which means we revealSecret - by the time of resultion hashlock will be unlocked'
          )
          me.batchAdd('revealSecrets', outcome)
        } else {
          // pulling the money after receiving secrets, down the chain of channels
          var pull_hl = inward_ch.derived[asset].inwards.find((hl) =>
            hl.hash.equals(hash)
          )

          if (!pull_hl) {
            l(
              `error: Not found pull`,
              trim(pubkey),
              toHex(hash),
              valid,
              inward_ch.d.rollback_nonce,
              ascii_state(inward_ch.state)
            )
            return
            //this.fatal('Not found pull hl')
          }
          // pass same outcome down the chain

          pull_hl.outcome_type = outcome_type
          pull_hl.outcome = outcome
          pull_hl.type = 'del'
          pull_hl.status = 'new'

          // todo
          refresh(inward_ch)
          pull_hl.resulting_balance = inward_ch.derived[asset].available

          await pull_hl.save()

          if (trace)
            l(
              `Received a secret from ${trim(
                pubkey
              )}, acking and pulling inward payment`
            )
          uniqFlushable(outward_hl.inward_pubkey)

          // how much fee we just made by mediating the transfer?
          me.metrics.fees.current += pull_hl.amount - outward_hl.amount
          // add to total volume
          me.metrics.volume.current += pull_hl.amount
        }
        //})
      } else {
        if (valid) {
          this.react(
            {payment_outcome: 'success', confirm: 'Payment completed'},
            false
          )
        } else {
          // if not a bank, we are sender
          this.react(
            {
              payment_outcome: 'fail',
              alert:
                'Payment failed, try another route: ' + outcome_type + outcome,
            },
            false
          )
        }
      }

      if (me.CHEAT_dontack) {
        l('CHEAT: not acking the secret, but pulling from inward')
        ch.d.status = 'CHEAT_dontack'
        //await ch.d.save()
        this.react({private: true}) // lazy react
        return
      }
    }
  }

  // since we applied partner's diffs, all we need is to add the diff of our own transitions
  if (ch.d.rollback_nonce > 0) {
    // merging and leaving rollback mode
    ch.d.dispute_nonce += ch.d.rollback_nonce
    ch.d.rollback_nonce = 0


    
    ch.d.status = 'merge'
  }
  
  */  

  // if finalSig is valid, swap sent->ack, otherwise REVERT


  this.react({confirm: 'updateChannel'})

    /*
  We MUST ack if there were any transitions, otherwise if it was ack w/o transitions
  to ourselves then do an opportunistic flush (flush if any). Forced ack here would lead to recursive ack pingpong!
  Flushable are other channels that were impacted by this update
  Sometimes sender is already included in flushable, so don't flush twice
  */


  await this.flushChannel(addr, json.transitions.length != 0)

  flushable.map(f=>this.flushChannel(f))

  
  return flushable

  // If no transitions received, do opportunistic flush, otherwise give forced ack
}
