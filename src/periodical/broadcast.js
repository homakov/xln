// signs and broadcasts
module.exports = async function (opts) {
  section('broadcast', async () => {
    if (Config.pendingBatchHex) {
      console.log('Have pendingBatchHex, only 1 tx is supported')

      return
    }
    // TODO: make batch persistent on disk

    let estimated = await me.batch_estimate(opts)

    if (!estimated) return

    if (trace) l('Broadcasting now with batch_nonce ', estimated.batch_nonce)
    // saving locally to ensure it is added, and rebroadcast if needed
    Config.pendingBatchHex = toHex(estimated.signed_batch)

    rebroadcast(estimated.signed_batch)
    me.pendingBatch = me.batch
    me.batch = []
  })
}
