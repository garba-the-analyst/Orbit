import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Counts shown on tab bar badges. Screens set these after they load, so the tab bar stays in sync. */
export const useBadges = defineStore('badges', () => {
  const merchantNew = ref(0);
  const riderJobs = ref(0);
  const riderActive = ref(0);
  const adminQueue = ref(0);
  const customerActive = ref(0);
  const adminSos = ref(0);
  const adminComplaints = ref(0);
  return { merchantNew, riderJobs, riderActive, adminQueue, customerActive, adminSos, adminComplaints };
});
