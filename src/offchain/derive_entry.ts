module.exports = function deriveEntry(ch, assetId) {


  const entry = ch.entries[assetId]
  const delta = entry.ondelta + entry.offdelta
  const col = entry.collateral

  // for left user
// Defines how payment channels work, based on "insurance" and delta=(ondelta+offdelta)
// There are 3 major scenarios of delta position
// . is 0 point, | is delta, = is insured, - is uninsured
// 4,6  .====--| (left user owns entire insurance, has 2 uninsured)
// 4,2  .==|==   (left and right both have 2 insured)
// 4,-2 |--.==== (right owns entire insurance, 2 in uninsured balance)
// https://codepen.io/anon/pen/wjLGgR visual demo

/*
collateralized uncollateralized
secured        unsecured
insured        uninsured
protected      unprotected
covered        uncovered
*/
    



  const o = {
    they_unsecured: delta < 0 ? -delta : 0,
    secured: delta > col ? col : delta > 0 ? delta : 0,
    they_secured: delta > col ? 0 : delta > 0 ? col - delta : col,
    unsecured: delta > col ? delta - col : 0,

    inbound_locks: [],
    outbound_locks: [],
    inbound_hold: 0,
    outbound_hold: 0,

    inbound_capacity: 0,
    outbound_capacity: 0,
    total_capacity: col + entry.credit_limit + entry.they_credit_limit,

    available_credit: 0,
    they_available_credit: 0
  }

  if (!ch.isLeft) {
    [o.secured, o.unsecured, o.they_secured, o.they_unsecured] = [o.they_secured, o.they_unsecured, o.secured, o.unsecured];
  }

  o.available_credit = entry.they_credit_limit - o.they_unsecured
  o.they_available_credit = entry.credit_limit - o.unsecured


  for (const t of ch.locks) {
    //delsent in revert
    if ([
      'AddLockSent',
      'AddLockAck',
      'DeleteLockNew',
    ].includes(t.type)) {
      if (t.inbound) {
        o.inbound_locks.push(t)
        o.inbound_hold += t.amount
      } else {
        o.outbound_locks.push(t)
        o.outbound_hold += t.amount
      }
    }
  }

  o.inbound_capacity = o.they_secured + o.they_unsecured + entry.credit_limit - o.unsecured - o.inbound_hold
  o.outbound_capacity = o.secured + o.unsecured + entry.they_credit_limit - o.they_unsecured - o.outbound_hold
    
  return o
}







