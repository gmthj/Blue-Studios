<script setup>
// A table column header that sorts the table when clicked (click again to flip the order).
//   <SortHeader :sort="sort" column="name" label="Name" />   sort comes from useSort() in useAdminTab.js
defineProps({
  sort: { type: Object, required: true },
  column: { type: String, required: true },
  label: { type: String, required: true },
})
</script>

<template>
  <th :aria-sort="sort.sortKey.value !== column ? 'none' : sort.sortDir.value === 'asc' ? 'ascending' : 'descending'">
    <button type="button" class="sort" @click="sort.toggle(column)">{{ label }} {{ sort.arrow(column) }}</button>
  </th>
</template>

<style scoped>
.sort {
  border: 0;
  background: none;
  padding: 0;
  font-weight: inherit;
  color: inherit;
  white-space: nowrap;
}
</style>
