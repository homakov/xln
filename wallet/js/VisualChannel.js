export default {
  props: {
    derived: Object,
    max_visual_capacity: Number,
    commy: Function,
  },
  data() {
    return {}
  },
  methods: {
    displayOrNot: function (type) {
      let a = this.derived[type]
      // at least 5% to be readable
      if (a / this.max_visual_capacity > 0.05) {
        return this.commy(a, true, false)
      } else {
        return ''
      }
    },
    styles: function (type) {
      let colors = {
        gap: '',

        they_uninsured: '#dc3545',
        uninsured: '#dc3545',

        they_insured: '#5cb85c',
        insured: '#5cb85c',

        available_credit: '#ff9c9c',
        they_available_credit: '#ff9c9c',
      }

      let share =
        (type == 'gap'
          ? this.max_visual_capacity - this.derived.capacity
          : this.derived[type]) / this.max_visual_capacity

      let style = {
        width: (share * 100).toFixed(3) + '%',
      }
      if (type == 'gap') {
        style.opacity = '0'
      } else {
        style['background-color'] = colors[type]
      }
      return style
    },
  },

  template: `
  <div class="progress" style="width: 100%">
    

      <div
        v-if="derived.available_credit > 0"
        v-bind:style="styles('available_credit')"
        v-html="displayOrNot('available_credit')"
        class="progress-bar"
      ></div>

      <div
        v-if="derived.insured > 0"
        v-bind:style="styles('insured')"
        v-html="displayOrNot('insured')"
        class="progress-bar"
      ></div>

      <div v-if="derived.delta >= 0 && derived.delta < derived.insurance" v-bind:style="styles('gap')" class="progress-bar"></div>

      <div
        v-if="derived.uninsured > 0"
        v-bind:style="styles('uninsured')"
        v-html="displayOrNot('uninsured')"
        class="progress-bar"
      ></div>
 

      <div v-if="derived.delta < 0 || derived.delta >= derived.insurance" v-bind:style="styles('gap')" class="progress-bar"></div>

      <div
        v-if="derived.they_uninsured > 0"
        v-bind:style="styles('they_uninsured')"
        v-html="displayOrNot('they_uninsured')"
        class="progress-bar"
      ></div>

      <div
        v-if="derived.they_insured > 0"
        v-bind:style="styles('they_insured')"
        v-html="displayOrNot('they_insured')"
        class="progress-bar"
      ></div>

      <div
        v-if="derived.they_available_credit > 0"
        v-bind:style="styles('they_available_credit')"
        v-html="displayOrNot('they_available_credit')"
        class="progress-bar"
      ></div> 




  </div>`,
}
