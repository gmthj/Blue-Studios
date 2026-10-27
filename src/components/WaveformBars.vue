<script setup>
// bars = an array like [{ height: 80, color: '#14a39a' }, { height: 35, color: '#7c3aed' }, ...]
// height is 0 to 100 (percent of the box height)
const props = defineProps({
  bars: Array,
})
</script>

<template>
  <div class="waveform">
    <div
      v-for="(bar, index) in bars"
      :key="index"
      class="bar"
      :style="{ height: Math.max(bar.height, 4) + '%', background: bar.color }"
    ></div>

    <!-- Nothing loaded yet: show a flat grey line -->
    <div v-if="bars.length === 0" class="empty-line"></div>
  </div>
</template>

<style scoped>
/* Flexbox lines the bars up side by side, centred vertically like a real waveform */
.waveform {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: #f1f3f5;
  border-radius: 0.375rem;
  padding: 0 8px;
}

/* flex: 1 makes every bar the same width, filling the box */
.bar {
  flex: 1;
  border-radius: 2px;
}

.empty-line {
  flex: 1;
  height: 2px;
  background: #ced4da;
}
</style>