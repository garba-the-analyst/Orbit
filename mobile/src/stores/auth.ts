import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/endpoints';
import { session, setUnauthorizedHandler } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import type { RegisterBody, Role, User } from '../api/types';

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  CUSTOMER: '/c/shops',
  MERCHANT: '/m/orders',
  RIDER: '/r/jobs',
  ADMIN: '/a/queue',
};

export const useAuth = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const ready = ref(false);

  const isSignedIn = computed(() => !!user.value);
  const role = computed(() => user.value?.role ?? null);
  const isPending = computed(
    () => user.value?.status === 'PENDING_VERIFICATION' && (role.value === 'MERCHANT' || role.value === 'RIDER'),
  );
  const home = computed(() => (user.value ? HOME_BY_ROLE[user.value.role] : '/auth'));

  function clear() {
    session.token = null;
    user.value = null;
    disconnectSocket();
  }

  /** Restores a saved session on app start. Never throws. */
  async function init() {
    setUnauthorizedHandler(clear);
    if (session.token) {
      try {
        user.value = await api.me();
        connectSocket(session.token);
      } catch {
        clear();
      }
    }
    ready.value = true;
  }

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    session.token = res.token;
    user.value = res.user;
    connectSocket(res.token);
    return res.user;
  }

  async function register(body: RegisterBody) {
    const res = await api.register(body);
    session.token = res.token;
    user.value = res.user;
    connectSocket(res.token);
    return res.user;
  }

  /** Re-reads the account, e.g. after an admin approves it. */
  async function refresh() {
    user.value = await api.me();
    return user.value;
  }

  function setUser(u: User) {
    user.value = u;
  }

  function logout() {
    clear();
  }

  return { user, ready, isSignedIn, role, isPending, home, init, login, register, refresh, setUser, logout };
});
