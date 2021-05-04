[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

<img src='/wallet/img/shot.png' />

# Intro

Fairlayer is a two-layered blockchain capable of processing billion+ transaction per second. It implements the idea of Extended Lightning Network [XLN](https://medium.com/fairlayer/xln-extended-lightning-network-80fa7acf80f3).

Our goal is to keep it easy to be a full node on any laptop, no matter how many payments happen on the second layer. The node processes few publicly broadcasted onchain transactions (insurance rebalances, disputes etc). All the payments happen instantly offchain and can be enforced in onchain "court" when needed.

# Installation

Use `./simulate` to start local node.

When you install on a server, pass `-s/--silent` to switch off `opn` that tries to open a browser with the wallet for you. The script will simply output the URL with auth_code you need to visit.

