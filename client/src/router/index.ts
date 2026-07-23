import { createRouter, createWebHistory } from 'vue-router'
import LobbyView from '../views/LobbyView.vue'
import TableView from '../views/TableView.vue'
import PrivateTableView from '../views/PrivateTableView.vue'
import GameHubView from '../views/GameHubView.vue'
import LoginView from '../views/LoginView.vue'
import SeatSelectionView from '../views/SeatSelectionView.vue'
import { seatStore } from '../stores/seatStore'
import { sessionStore } from '../stores/sessionStore'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/app' },
    { path: '/app', name: 'app-login', component: LoginView },
    { path: '/app/login', redirect: { name: 'app-login' } },
    { path: '/app/games', name: 'game-hub', component: GameHubView, meta: { requiresAuth: true } },
    { path: '/app/games/holdem/rooms', name: 'room-list', component: LobbyView, meta: { requiresAuth: true } },
    { path: '/app/games/holdem/rooms/:id/seat', name: 'room-seat', component: SeatSelectionView, meta: { requiresAuth: true } },
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
