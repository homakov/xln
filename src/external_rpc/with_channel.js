module.exports = async (pubkey, json) => {
  //todo: ensure no conflicts happen if two parties withdraw from each other at the same time

  await section(['use', pubkey], async () => {
    let ch = await me.getChannel(pubkey)

    if (json.method == 'setLimits') {
      let subch = ch.d.subchannels.by('asset', json.asset)

      subch.they_credit = json.credit
      subch.they_acceptable_rebalance = json.acceptable_rebalance
      await subch.save()

      me.textMessage(ch.d.they_pubkey, 'Updated credit limits')
    } else if (json.method == 'requestInsurance') {
      let subch = ch.d.subchannels.by('asset', json.asset)
      subch.they_requested_insurance = true
      await subch.save()

      me.textMessage(ch.d.they_pubkey, 'Added to rebalance queue')
    } else if (json.method == 'giveWithdrawal') {
      let asset = parseInt(json.asset)
      let amount = parseInt(json.amount)
      let withdrawal_sig = fromHex(json.withdrawal_sig)

      /*
      if (!ch.ins) {
        me.textMessage(
          ch.d.they_pubkey,
          'You must be registered'
        )
        return
      }
      */

      let subch = ch.d.subchannels.by('asset', asset)

      let they = await User.findOne({
        where: {pubkey: ch.d.they_pubkey},
        include: [Balance],
      })
      if (!they || !me.record) return l('no pair ', they, me.record)

      let pair = [they.id, me.record.id]
      if (ch.d.isLeft()) pair.reverse()

      let withdrawal = [
        methodMap('withdraw'),
        pair[0],
        pair[1],
        ch.ins ? ch.ins.withdrawal_nonce : 0,
        amount,
        asset,
      ]

      if (!ec.verify(r(withdrawal), withdrawal_sig, pubkey)) {
        l('Invalid withdrawal given', withdrawal, json)
        return false
      }

      l('Got withdrawal for ' + amount)
      subch.withdrawal_amount = amount
      subch.withdrawal_sig = withdrawal_sig
      await subch.save()

      if (me.withdrawalRequests[subch.id]) {
        // returning ch back to requesting function
        me.withdrawalRequests[subch.id](ch)
      }
    } else if (json.method == 'requestWithdrawal') {
      if (me.CHEAT_dontwithdraw) {
        // if we dont give withdrawal or are offline for too long, the partner starts dispute
        return l('CHEAT_dontwithdraw')
      }

      if (ch.d.status != 'main') {
        return l('only return withdrawal to main status, now ' + ch.d.status)
      }

      if (!ch.ins) {
        me.textMessage(ch.d.they_pubkey, 'You must be registered')
        return
      }

      let subch = ch.d.subchannels.by('asset', json.asset)
      let amount = parseInt(json.amount)
      let asset = parseInt(json.asset)
      // TODO: don't forget hold

      // if we're bank, we let to withdraw from our onchain as well
      if (me.my_bank) {
        var available = ch.derived[asset].they_available
      } else {
        // otherwise we let bank to withdraw only from their insured side

        // if we'd let banks to withdraw they_available,
        // their compromise would lead to a disaster of failed credit
        var available =
          ch.derived[asset].they_insured - ch.derived[asset].inwards_hold
      }

      if (amount > available) {
        me.textMessage(
          ch.d.they_pubkey,
          `Sorry, you can only withdraw up to ${available}`
        )

        return false
      }

      // technically withdrawable: our onchain + insurance size
      let withdrawable =
        ch.derived[asset].they_insured + userAsset(me.record, asset)
      if (amount == 0 || amount > withdrawable) {
        me.textMessage(
          ch.d.they_pubkey,
          `Sorry, you can only withdraw up to ${withdrawable}`
        )
        return false
      }

      if (amount > subch.they_withdrawal_amount) {
        // only keep the highest amount we signed on
        subch.they_withdrawal_amount = amount
      }

      let weSigned = [
        methodMap('withdraw'),
        ch.ins.leftId,
        ch.ins.rightId,
        ch.ins.withdrawal_nonce,
        amount,
        asset,
      ]

      await subch.save()

      me.send(pubkey, {
        method: 'giveWithdrawal',
        withdrawal_sig: ec(r(weSigned), me.id.secretKey),
        amount: amount,
        asset: asset,
        weSigned,
      })
    } else if (json.method == 'testnet') {
      if (json.action == 'faucet') {

        let pay = {
          address: json.address,
          amount: json.amount,
          private_invoice: 'hi',
          asset: json.asset,
        }

        await me.payChannel(pay)
      }
    }
  })


  
    

}
