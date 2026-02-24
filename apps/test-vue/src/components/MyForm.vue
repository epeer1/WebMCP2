<script setup lang="ts">
import { ref } from 'vue';

const email = ref('');
const handleSubmit = () => {
    console.log("Submitted with email", email.value);
};
</script>

<template>
    <form id="vue-contact-form" @submit.prevent="handleSubmit">
        <h2>Vue Test Form</h2>
        <input type="email" placeholder="Email Address" v-model="email" />
        <button type="submit" class="submit-btn text-white bg-green-500 p-2 m-2">Submit</button>
    </form>
</template>
