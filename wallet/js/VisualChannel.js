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

        they_unsecured: '#dc3545',
        unsecured: '#dc3545',

        they_secured: '#5cb85c',
        secured: '#5cb85c',

        available_credit: '#ff9c9c',
        they_available_credit: '#ff9c9c',
      }

      let share =
        (type == 'gap'
          ? this.max_visual_capacity - this.derived.total_capacity
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
        v-bind:style="styles('available_credit')"
        v-html="displayOrNot('available_credit')"
        class="progress-bar"
      ></div>

      <div
        v-bind:style="styles('secured')"
        v-html="displayOrNot('secured')"
        class="progress-bar"
      ></div>

      <div
        v-bind:style="styles('unsecured')"
        v-html="displayOrNot('unsecured')"
        class="progress-bar"
      ></div>
 

      <div v-bind:style="styles('gap')" class="progress-bar"></div>

      <div
        v-bind:style="styles('they_unsecured')"
        v-html="displayOrNot('they_unsecured')"
        class="progress-bar"
      ></div>

      <div
        v-bind:style="styles('they_secured')"
        v-html="displayOrNot('they_secured')"
        class="progress-bar"
      ></div>

      <div
        v-bind:style="styles('they_available_credit')"
        v-html="displayOrNot('they_available_credit')"
        class="progress-bar"
      ></div> 




  </div>`,
}
