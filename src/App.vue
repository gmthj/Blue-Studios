<template>
  <nav class="navbar bg-primary mb-4">
    <div class="container">
      <router-link to="/" class="navbar-brand text-white fw-bold">Blue Studios Photobooth</router-link>
    </div>
  </nav>

  <main class="container pb-5">
    <!-- The page that matches the URL (see router.js) is shown here -->
    <router-view />
  </main>
</template>
