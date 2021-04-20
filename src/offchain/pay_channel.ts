const Router = require('../router')
// short helper to create a Payment on some delta and flush the channel right after it

import crypto = require('crypto')


const nacl = require('../../lib/nacl')

// more highlevel wrappers that operate purely with JSON
function encryptJSONBox(box_data, target_pubkey) {
  // we don't care about authentication of box, but nacl requires that
  const throwaway = nacl.box.keyPair()

  const unlocker_nonce = crypto.randomBytes(24)

  const box = nacl.box(
    Buffer.from(JSON.stringify(box_data)),
    unlocker_nonce,
    target_pubkey,
    throwaway.secretKey
  )
  return Buffer.concat([unlocker_nonce, throwaway.publicKey, box])
}




module.exports = async function (opts) {
  
  const secret = crypto.randomBytes(32)
  const hash = this.ethers.utils.keccak256(secret)
  const assetId = parseInt(opts.assetId)


  const addr = opts.address
  

  const profile = await this.getProfile(addr)



  opts.private_invoice = crypto.randomBytes(16).toString('hex')

  const amount = parseInt(opts.amount)

  // NaN
  if (!Number.isInteger(amount)) return 'NaN'


  

  // 1. encrypt msg for destination that has final amount/asset etc and empty envelope
  let onion = encryptJSONBox(
    {
      amount: amount, // final amount
      assetId: assetId,

      // buffers are in hex for JSON
      secret: secret.toString('hex'),
      private_invoice: opts.private_invoice,

      timestamp: new Date(),
      source_address: this.signer.address
    },
    Buffer.from(profile.boxPubkey,'hex')
  ).toString('hex')

  let nextHop = addr

  // 2. encrypt msg for each hop in reverse order
  
  for (const hop of opts.chosenRoute.reverse()) {
    //const hub = this.hubs.find(h=>h.addr == hop)
    
    //amount = beforeFee(amount, bank)
    const profile = await this.getProfile(hop)

    console.log("got profile", profile)
    if (!profile) return this.react({alert: "Invalid address "+hop})

    onion = encryptJSONBox(
      {
        assetId: assetId,
        amount: amount,
        nextHop: nextHop,

        unlocker: onion,
      },
      Buffer.from(profile.boxPubkey,'hex')
    ).toString('hex')

    nextHop = hop
  }
  

  // 3. now nextHop is equal our first hop, and amount includes all fees
  //await section(['use', nextHop], async () => {
  const ch = this.Channels[nextHop]
  if (!ch || !ch.entries[assetId]) {
    return this.react({alert: `No channel to ${nextHop}`})
  }

  const derived = this.deriveEntry(ch, assetId)
  
  // 4. do we have enough available for this hop?
  if (amount > derived.outbound_capacity) {
    /*if (me.my_bank) {
      // ask to increase credit
      me.textMessage(
        ch.d.they_pubkey,
        `Cannot send ${commy(amount)} when available is ${commy(
          available
        )}, extend credit`
      )
    }*/
    this.react({alert: `Not enough funds ${derived.outbound_capacity}`})

    return 'Not enough available'
  }

  ch.locks.push({
    type: 'AddLockNew',
    assetId: assetId,
    amount: amount,
    hash: hash.toString('hex'),

    secret: secret.toString('hex'),

    exp: 777,


    unlocker: onion,
    destination_address: addr,
    private_invoice: opts.private_invoice,

    inbound: false,
  })


  

  await this.flushChannel(nextHop)
  
  this.react({})
  

  return 'sent'

}
