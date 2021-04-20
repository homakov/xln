module.exports = function buildChannel(addr: string) {
  if (!this.signer || addr == this.signer.address) {
    console.log('Channel to self?')
    return false
  }

  if (this.Channels[addr]) {
    return this.Channels[addr]
  } 
            

  const buf_a1 = Buffer.from(this.signer.address.slice(2).toLowerCase(), "hex");
  const buf_a2 = Buffer.from(addr.slice(2).toLowerCase(), "hex");

  const ch:any = {
    isLeft: Buffer.compare(buf_a1, buf_a2) == -1,
    partner: addr,
    status: 'ready',

    channel_counter: 0,
    cooperative_nonce: 0,
    
    dispute_nonce: 0,
    dispute_until_block: 0,


    entries: {},
    locks: [],

    last_used: new Date
  }



  ch.locks = []

  console.log(`Creating new channel ${addr}`)
  this.Channels[addr] = ch  

  return ch

}
