// derives private key from username and password using memory hard alg

module.exports = async (username, password) => {
  return new Promise((resolve, reject) => {
    require('../../lib/scrypt')(
      password,
      username,
      {
        N: Math.pow(2, 12),
        r: 8,
        p: 1,
        dkLen: 32,
        encoding: 'binary'
      },
      (r) => {
        r = Buffer.from(r)
        resolve(r)
      }
    )

    /* Native scrypt. TESTNET: we use pure JS scrypt
    var seed = await scrypt.hash(pw, {
      N: Math.pow(2, 16),
      interruptStep: 1000,
      p: 2,
      r: 8,
      dkLen: 32,
      encoding: 'binary'
    }, 32, username)

    return seed; */
  })
}
