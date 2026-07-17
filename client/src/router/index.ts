import { createRouter, createWebHistory } from 'vue-router'
import LobbyView from '../views/LobbyView.vue'
import TableView from '../views/TableView.vue'
import PrivateTableView from '../views/PrivateTableView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'lobby', component: LobbyView },
    { path: '/table/:id', name: 'table', component: TableView },
    { path: '/t/:slug', name: 'private-table', component: PrivateTableView },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
