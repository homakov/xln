const fs = require('fs')
const path = require('path')

const generateMonkeys = async () => {
  const derive = require('./derive')
  const addr = []

  for (let i = 8001; i < 8060; i++) {
    const username = i.toString()
    const seed = await derive(username, 'password')
    const me = new Me()
    await me.start(seed)
    // all monkeys use first bank by default

    addr.push(me.getAddress())
  }
  // save new-line separated monkey addresses
  await fs.writeFileSync('./tools/monkeys.txt', addr.join('\n'))
}

const loadMonkeys = (monkey_port) => {
  const monkeys = fs
    .readFileSync('./tools/monkeys.txt')
    .toString()
    .split('\n')
    .slice(3, parseInt(monkey_port) - 8000)

  l('Loaded monkeys: ' + monkeys.length)

  return monkeys
}
module.exports = {
  generateMonkeys: generateMonkeys,
  loadMonkeys: loadMonkeys,
}
