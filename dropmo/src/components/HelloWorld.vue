<script setup>
import { storeToRefs } from 'pinia';
import { usePublicVarsStore } from '../stores/publicvars';

defineProps({
  msg: String,
})

const publicVarsStore = usePublicVarsStore();

publicVarsStore.addPublicVar('hello', 'world');

const { publicVars: pubvar } = storeToRefs(publicVarsStore);

</script>

<template>
  <div class="card">
  <h1>{{ msg }}</h1>
  <h1>Public Variable: {{ pubvar }}</h1>
  
  </div>
</template>


<style scoped>
.read-the-docs {
  color: #888;
}
</style>


