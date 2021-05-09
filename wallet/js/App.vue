<template>
  <div>
    <template v-if="nonEmptyBatch(batch)">
      <div style="position:fixed;
      z-index:1500;
      opacity:0.9;
      bottom:0px;
      width:100%;
      background-color: #FFFDDE; border:thin solid #EDDD00">
       
        <div style='margin: 10px;text-align:center'>
          <span v-html="prettyBatch(batch)"></span>

          <button type="button" class="btn btn-outline-danger" @click="call('broadcastBatch', {gasprice: parseInt(gasprice)})">Sign & Broadcast</button> or <a class="dotted" @click="call('clearBatch')">clear batch</a>
        </div>

<!--
          <template v-if="pendingBatch.length > 0">
            Wait for validation...<dotsloader></dotsloader>
          </template>
          <template v-else-if="batch_estimate.size > 0">
          <span>
            <input style="width: 80px" type="number" v-model="gasprice">
     * {{batch_estimate.size}} = fee {{commy(uncommy(gasprice) * batch_estimate.size)}}
            </span>
          <div class="slidecontainer" style="display:inline-block;">
              <input type="range" min="1" max="100" class="slider" v-model="gasprice">
            </div>
          <span v-if="getAsset(1) - gasprice * batch_estimate.size >= 100">
            <button type="button" class="btn btn-outline-danger" @click="call('broadcastBatch', {gasprice: parseInt(gasprice)})">Sign & Broadcast</button> or <a class="dotted" @click="call('clearBatch')">clear batch</a></span>
          <span v-else>Not enough eoa</span>
          </template>
-->
        
      </div>
    </template> 


    <br>
    <div class="container"> 

      <template v-if="address">

        <p style="word-wrap: break-word">Your address: <b>{{address}}</b></p>
        <h4 @dblclick="devmode=!devmode">EOA balance: {{EOA_balance}}</h4>
        <h4 v-bind:key="'reserve'+index" v-for="(r,index) in reserves" v-if="r!='0'">{{addressToName(assets[index][1])}} balance: {{r}}</h4>

 
        <template v-if="channels.length > 0">
        <select v-model="chosenPartner" @input="choosePartner" class="custom-select custom-select-lg mb-6">
          <option v-for="(ch,index) in channels" v-bind:key="index" :value="index">{{addressToName(ch.partner)}}</option>
        </select> 

        <div v-for="ch in [channels[chosenPartner]]">
          <pre v-if="devmode">{{ch}}{{hubsForAddress}}</pre>
          <h1>
            {{addressToName(ch.partner)}} 
          </h1>
          

          <table  class="table">
            <thead  class="thead-dark">
              <tr>
                <th>Asset</th>
                <th>Outbound Capacity</th>
                <th>Secured</th>
                <th>Unsecured</th>
                <th>Credit Limit</th>
                <th>Inbound Capacity</th>
              </tr>  
            </thead>

            <tbody>

            <template v-for="i in Object.keys(ch.entries)">
              <tr>
                  <td>{{addressToName(assets[i][1])}}</td>
                  <td><b>{{ch.derived[i].outbound_capacity}}</b></td>
                  <td>{{ch.derived[i].secured}}</td>
                  <td>{{ch.derived[i].unsecured}}</td>
                  <td>{{ch.entries[i].credit_limit}}</td>
                  <td><b>{{ch.derived[i].inbound_capacity}}</b></td>
              </tr>
                
              <tr>
                <td colspan="99">                 
                  <visual-channel :derived="ch.derived[i]" :max_visual_capacity="max_visual_capacity[i]" :commy="commy"></visual-channel>
                </td>
              </tr>

            </template>
              </tbody>


          </table>


          <p><ul class="nav nav-tabs">
            <li class="nav-item" :key="id" v-for="id in ['offchain','configure','closeChannel', 'settings']">
               <a class="nav-link" @click="go(id)" v-bind:class="[tab==id ? 'active' : '']">{{t(id)}}</a>
            </li>
          </ul></p>

          <form style="width: 600px">

    

            <template v-if="tab=='offchain'">


              <div class="form-group">
                <p>
                  <label>Address</label>
                  <input type="text" class="form-control " v-model="newPayment.address" :disabled="['none','amount'].includes(newPayment.editable)" placeholder="Address"  @input="updateRoutes">
                </p>


                  <label>Asset</label>


                <p><select @input="updateRoutes" v-model="newPayment.assetId" class="form-control ">
                  <option v-for="(a, index) in assets" :value="index">{{addressToName(a[1])}}</option>
                </select></p>

                  <label>Amount</label>

                <input type="text" class="form-control small-input" v-model="newPayment.amount" :disabled="newPayment.editable=='none'" placeholder="Amount" aria-describedby="basic-addon2" @input="updateRoutes">
              </div>

              <template v-if="newPayment.address.length > 0">
                <p v-if="bestRoutes.length == 0">
                  No route found, try onchain.
                </p>
                <template v-else>
                  <h5>Choose route/fee:</h5>
                  <div class="radio" v-for="(r, index) in bestRoutes.slice(0, bestRoutesLimit)">
                    <label>
                      <input type="radio" :value="r[1].join('_')" v-model="chosenRoute"> {{routeToText(r)}} (<b>{{r[0].toFixed(3)}}</b>) </label>
                  </div>
                  <p v-if="bestRoutes.length > bestRoutesLimit"><a class="dotted" @click="bestRoutesLimit += 5">Show More Routes</a></p>
                </template>
              </template>
              
              <button type="button" class="btn btn-outline-success pay-now" @click="call('payChannel', {address: newPayment.address, assetId: newPayment.assetId, amount: newPayment.amount, chosenRoute: chosenRoute.split('_')});">Pay Offchain</button>



              <table v-if="payments.length > 0" class="table">


                <transition-group name="list" tag="tbody">
                  <tr v-bind:key="h.id" v-for="(h, index) in payments.slice(0, history_limit)">
                    <td width="10%" v-html="skipDate(h, index)"></td>
                    <td width="50%" @click="addr=(h.is_inward ? h.source_address : h.destination_address);if (addr){newPayment.address=addr+'#'+h.private_invoice; newPayment.amount=commy(h.amount);newPayment.asset = h.asset;}"><u class="dotted">{{paymentToDetails(h)}}</u>: {{h.invoice}} via {{toUser(channels.find(ch=>ch.d.id==h.channelId).partner)}}</td>


                    <td width="15%"><span v-bind:class="['badge', h.is_inward ? 'badge-success' : 'badge-danger']">{{h.is_inward ? '+'+commy(h.amount) : commy(-h.amount)}} {{toTicker(h.asset)}}</span> {{paymentStatus(h)}}</td>
                    <td>{{commy(h.resulting_balance)}}</td>
                  </tr>
                </transition-group>
                <tr v-if="payments.length > history_limit">
                  <td colspan="7" align="center"><a @click="history_limit += 20">Show More</a></td>
                </tr>
              </table>
            </template>
            <template v-else-if="tab=='configure'">


            <div class="form-group">

              <h5>Asset to configure</h5>

              <p><select v-model="assetId" class="form-control custom-select custom-select-lg mb-6">
                <option v-for="(a, index) in assets" v-bind:key="index" :value="index">{{addressToName(a[1])}}</option>
              </select></p>




            <template v-if="ch.entries[assetId]">
              <small class="form-text text-muted">All operations below will be applied to this specific asset inside the channel.</small>

              <h5>Set credit limit</h5>
                <input type="text" class="form-control" v-model="creditLimit" placeholder="New credit limit">
                <small class="form-text text-muted">Current credit limit to this hub is {{ch.entries[assetId].credit_limit}}. It defines your maximum unsecured balance and increases your inbound capacity.</small>
                <p>
                <button class="btn btn-outline-primary"  @click="call('setCreditLimit', {method: 'setCreditLimit', partner: ch.partner, assetId: assetId, credit_limit: parseInt(creditLimit)})" >Set Credit</button>
                </p>


              <h5>Request Collateral Size</h5>
              <p><input  class="form-control" v-model="requestCollateral" placeholder="Choose collateral"> <a class="dotted" @click="requestCollateral=ch.derived[assetId].unsecured + ch.entries[assetId].collateral">max</a></p>

              <small class="form-text text-muted">Current collateral is {{ch.entries[assetId].collateral}}. You can request the hub to <b>increase collateral and collateralize your unsecured balance</b>, or <b>decrease it to get more interest on your unsecured balance.</b></small>

              <p> 
              <button class="btn btn-outline-primary" @click="call('requestCollateral', {partner: ch.partner, method:'requestCollateral', assetId: assetId, collateral: parseInt(requestCollateral)})">Request Collateral</button>
              </p>

              <h5>Withdraw</h5>
              <input class="form-control" v-model="withdrawAmount" placeholder="Amount to Withdraw"> <a class="dotted" @click="withdrawAmount=ch.derived[assetId].secured">max</a>
              <small class="form-text text-muted">Request withdrawal proof from the hub for this amount. Assets will be moved from channel collateral (up to your current secured balance) to your reserve balance</small>
              <p>
              <button class="btn btn-outline-primary" @click="call('channelToReserve', {partner: ch.partner, pairs: [[assetId, parseInt(withdrawAmount)]]})">Withdraw to Reserve</button>
              </p>

              <h5>Deposit</h5>
              <input  class="form-control" v-model="depositAmount" placeholder="Amount to Deposit"> <a class="dotted" @click="depositAmount=reserves[assetId]">max</a>
              <small class="form-text text-muted">Deposit collateral from your reserve balance to this channel. This will increase your outbound capacity.</small>
              <p>
              <button class="btn btn-outline-primary" @click="call('reserveToChannel', {partner: ch.partner, pairs: [[assetId, parseInt(withdrawAmount)]]})">Deposit from Reserve</button>
              </p>




            </template>
            <template v-else>
              <p>
                <button  class="btn btn-outline-primary" @click="call('flushTransition', {address: ch.partner, type: 'addEntry', assetId: assetId})">Use Asset</button>
              </p>
            </template>





              </div>


            </template>
            <template v-else-if="tab=='closeChannel'">

              <p>Cooperative close will instantly return all secured balances from the channel to your reserves. <b>Unsecured balances are not guaranteed</b>: the smart contract attempts to take them from reserves of the hub, or enforces as debts.</p>
              <button class="btn btn-success" @click="call('cooperativeClose', {partner: ch.partner})">Cooperative Close</button>
              <hr>
              <p>Dispute close requires a long delay, only use it in case the hub doesn't cooperate.</p>
              <button class="btn btn-danger" @click="call('startDispute', {address: ch.partner})">Dispute Close</button>
              
            </template>
            <!--<template v-else-if="tab=='swap'">
              
              
              <p><select  v-model="swapFrom" class="form-control ">
                <option v-for="(a, index) in assets" :value="index">{{addressToName(a[1])}}</option>
              </select></p>


            </template>-->

          </form>


        </div>
        </template>
        <template v-if="channels.length == 0 || tab=='settings'">

          <div :key="h[0]" v-for="h in hubs.slice(1)">
            <h3>Hub name: {{h[0]}}</h3>         
            <button v-if="!channels.find(ch=>ch.partner==h[0])" class="btn btn-outline-success" @click="call('openChannel', {address: h[0]})">Join</button>
            <b v-else>(already used)</b>
            <br>
            <br>
          </div>

          <p><button class="btn btn-danger" @click="call('logout')">Logout</button></p>
        </template>






      </template>

      <form v-else class="form-signin" v-on:submit.prevent="call('login',{username, password})">

        <h4 class="danger danger-primary">Your private key is derived from your username and password. Don't forget the password - it cannot be recovered.</h4>

        <label for="inputUsername" class="sr-only">Username</label>
        <input v-model="username" type="text" id="inputUsername" class="form-control" placeholder="Username" required autofocus>
        <br>
        <label for="inputPassword" class="sr-only">Password</label>
        <input v-model="password" type="password" id="inputPassword" class="form-control" placeholder="Password">
        <button class="btn btn-lg btn-outline-primary btn-block step-login" id="login" type="submit">Generate Wallet</button>
     
        <pre>
          To use dev accounts put any private key in username field
  (0) 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3
  (1) 0xae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f
  (2) 0x0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1
  (3) 0xc88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c
  (4) 0x388c684f0ba1ef5017716adb5d21a053ea8e90277d0868337519f97bede61418
  (5) 0x659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63
  (6) 0x82d052c865f5763aad42add438569276c00d3d88a2d062d36b2bae914d58b8c8
  (7) 0xaa3680d5d48a8283413f7a108367c7299ca73f553735860a87b08f39395618b7
  (8) 0x0f62d96d6675f32685bbdb8ac13cda7c23436f63efbb9d07700d8669ff12b7c4
  (9) 0x8d5366123cb560bb606379f90a0bfd4769eecc0557f1b362dcae9012b548b1e5
        </pre>
     </form>    



     <pre v-if="devmode">{{consoleLog}}</pre>
     <br><br>



    </div>
    
    
    
  </div>
</template>

<script>
//import Vue from 'vue'
/*
Vue.exports = {
    runtimeCompiler: true
}*/

const plugin = {
  install() {
    Vue.prototype.commy = function(b, asset = 1) {
      var dot = true
      var withSymbol = ''

      if (asset == 2) {
        withSymbol = '€'
      }

      let prefix = b < 0 ? '-' : ''

      b = Math.abs(Math.round(b)).toString()
      if (dot) {
        if (b.length == 1) {
          b = '0.0' + b
        } else if (b.length == 2) {
          b = '0.' + b
        } else {
          var insert_dot_at = b.length - 2
          b = b.slice(0, insert_dot_at) + '.' + b.slice(insert_dot_at)
        }
      }

      if (withSymbol) {
        prefix = prefix + withSymbol
      }

      return prefix + b //b.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

    }
    Vue.commy = Vue.prototype.commy
  }
}

Vue.use(plugin)


//import Highlight from './Highlight'
import Home from './Home'
import Tutorial from './Tutorial'
import Event from './Event'

import Dotsloader from './Dotsloader'

import VisualChannel from './VisualChannel'



export default {
  components: {
    //Highlight,
    'visual-channel': VisualChannel,
    Home,
    Tutorial,
    Event,
    Dotsloader
  },
  mounted() {
    window.app = this

    window.onscroll = function(ev) {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
        app.history_limit += 20
      }
    }


    app.call('load')

    const tab = location.hash.substr(1).split(/\/|\?/)[0]
    if (tab.length > 0) app.go(tab)

    this.interval = setInterval(function() {
      app.call('load')
    }, localStorage.auth_code ? 6000 : 15000)


    setInterval(() => app.$forceUpdate(), 1000)

    app.updateRoutes()
  },
  destroyed() {
    clearInterval(this.interval)
  },

  data() {
    return require('./data')
  },
  computed: {
    current_derived: function() {
      let ch = this.channels.find(ch => ch.d.id == this.mod.ch.d.id)

      return ch.derived[this.mod.subch.asset]
    }
  },
  methods: require('./methods')

}
</script>
