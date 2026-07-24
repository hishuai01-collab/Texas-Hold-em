import { createRouter, createWebHistory } from 'vue-router'
import LobbyView from '../views/LobbyView.vue'
import HomeView from '../views/HomeView.vue'
import PrivateTableView from '../views/PrivateTableView.vue'
import PromoView from '../views/PromoView.vue'
import ProfileView from '../views/ProfileView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'
import SeatSelectionView from '../views/SeatSelectionView.vue'
import TableView from '../views/TableView.vue'
import { seatStore } from '../stores/seatStore'
import { sessionStore } from '../stores/sessionStore'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/app' },
    { path: '/app', name: 'app-login', component: LoginView },
    { path: '/app/login', redirect: { name: 'app-login' } },
    { path: '/app/settings', name: 'app-settings', component: SettingsView, meta: { requiresAuth: true } },
    { path: '/app/home', name: 'app-home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/app/lobby', name: 'app-lobby', component: LobbyView, meta: { requiresAuth: true } },
    { path: '/app/promo', name: 'app-promo', component: PromoView, meta: { requiresAuth: true } },
    { path: '/app/profile', name: 'app-profile', component: ProfileView, meta: { requiresAuth: true } },
    { path: '/app/games', name: 'game-hub', component: HomeView, meta: { requiresAuth: true } },
    { path: '/app/games/holdem/rooms', name: 'room-list', component: LobbyView, meta: { requiresAuth: true } },
    { path: '/app/games/holdem/rooms/:id/seat', name: 'room-seat', component: SeatSelectionView, meta: { requiresAuth: true, requiresSeat: true } },
    { path: '/app/games/holdem/rooms/:id/table', name: 'table', component: TableView, meta: { requiresAuth: true, requiresSeat: true } },
    { path: '/table/:id', redirect: to => ({ name: 'room-seat', params: { id: to.params.id } }) },
    { path: '/t/:slug', name: 'private-table', component: PrivateTableView },
    { path: '/:pathMatch(.*)*', redirect: '/app' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && sessionStore.status.value !== 'ready') {
    return { name: 'app-login', query: { next: to.fullPath } }
  }
  if (to.meta.requiresSeat) {
    const tableId = typeof to.params.id === 'string' ? to.params.id : ''
    if (!seatStore.canEnter(tableId)) return { name: 'room-seat', params: { id: tableId } }
  }
  return true
})
