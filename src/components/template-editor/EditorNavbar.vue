<script setup>
import { useTemplateEditorContext } from "../../composables/useTemplateEditor.js"
import { IconUsers } from "../icons/index.js"

const editor = useTemplateEditorContext()
const {
  isAccount,
  route,
  router,
  user
} = editor
</script>

<template>
    <header class="navbar navbar-expand bg-white border-bottom px-3 py-2 justify-content-between flex-shrink-0">
      <div class="d-flex align-items-center gap-4">
        <router-link to="/" class="navbar-brand d-flex align-items-center gap-2 text-decoration-none m-0">
          <div style="width: 28px; height: 28px;">
            <svg viewBox="0 0 24 24" fill="none" class="w-100 h-100">
              <rect width="24" height="24" rx="7" fill="#2F5BEA" />
              <circle cx="12" cy="12" r="5" stroke="white" stroke-width="2.5" />
            </svg>
          </div>
          <span class="fw-bold text-dark fs-5">Blue Studios</span>
        </router-link>

        <nav class="nav gap-1">
          <router-link to="/studio" class="nav-link text-secondary py-1 px-2 rounded">My Studio</router-link>
          <span class="nav-link active text-primary fw-bold py-1 px-2 rounded">Templates</span>
          <router-link to="/marketplace" class="nav-link text-secondary py-1 px-2 rounded">Marketplace</router-link>
        </nav>
      </div>

      <div class="d-flex align-items-center gap-2">
        <router-link to="/" class="btn btn-outline-secondary btn-sm rounded-pill d-flex align-items-center gap-1 text-decoration-none">
          <IconUsers :size="16" :stroke-width="2" />
          <span>Join room</span>
        </router-link>
        <template v-if="isAccount">
          <router-link to="/studio" class="btn btn-sm btn-outline-secondary rounded-pill d-none d-sm-inline-flex align-items-center gap-1 text-decoration-none">
            <span>My Studio</span>
          </router-link>
          <span class="small fw-semibold text-truncate d-none d-md-inline" style="max-width: 130px;">
            {{ user.displayName || user.email }}
          </span>
          <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold" style="width: 32px; height: 32px; font-size: 13px;" :title="user.displayName || user.email">
            {{ (user.displayName || user.email || 'U').charAt(0).toUpperCase() }}
          </div>
        </template>
        <template v-else>
          <router-link :to="'/login?redirect=' + encodeURIComponent($route.fullPath)" class="btn btn-outline-primary btn-sm rounded-pill">
            Log in
          </router-link>
          <div class="rounded-circle bg-secondary text-white d-flex align-items-center justify-content-center fw-bold" style="width: 32px; height: 32px; font-size: 13px;" title="Browsing as guest">G</div>
        </template>
      </div>
    </header>
</template>
