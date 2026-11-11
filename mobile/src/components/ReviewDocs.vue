<script setup lang="ts">
/** Lets an admin open private documents and approve or reject documents and vehicles for one applicant. */
import { ref } from 'vue';
import { api } from '../api/endpoints';
import { fileUrl } from '../api/client';
import type { QueueDocument, VehicleView } from '../api/types';
import { VEHICLE_LABEL } from '../lib/format';
import { promptText, showError, toast } from '../lib/ui';

const props = defineProps<{ documents: QueueDocument[]; vehicles?: VehicleView[] }>();
const emit = defineEmits<{ (e: 'changed'): void }>();
const KIND: Record<string, string> = { ID_CARD: 'ID card', DRIVER_LICENCE: 'Driver’s licence', VEHICLE_PAPERS: 'Vehicle papers', BUSINESS_REG: 'Business registration', OTHER: 'Other document' };
const busy = ref('');

async function view(id: string) {
  busy.value = id;
  try {
    window.open(await fileUrl(`/admin/documents/${id}/file`), '_blank', 'noopener');
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = '';
  }
}
async function review(d: QueueDocument, status: 'APPROVED' | 'REJECTED') {
  let note: string | undefined;
  if (status === 'REJECTED') {
    const n = await promptText({ title: 'Why is it rejected?', message: 'The applicant sees this note.', placeholder: 'e.g. Photo is blurry', confirm: 'Reject' });
    if (n === null) return;
    note = n;
  }
  busy.value = d.id;
  try {
    await api.admin.reviewDocument(d.id, status, note);
    toast(status === 'APPROVED' ? 'Document approved.' : 'Document rejected.');
    emit('changed');
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = '';
  }
}
async function vehicle(v: VehicleView, ok: boolean) {
  let note = '';
  if (!ok) {
    const n = await promptText({ title: 'Why is it rejected?', message: 'The owner sees this note.', placeholder: 'e.g. Plate number not visible', confirm: 'Reject' });
    if (!n) return;
    note = n;
  }
  busy.value = v.id;
  try {
    if (ok) await api.admin.approveVehicle(v.id);
    else await api.admin.rejectVehicle(v.id, note);
    toast(ok ? 'Vehicle approved.' : 'Vehicle rejected.');
    emit('changed');
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <div class="rd">
    <p v-if="!props.documents.length && !props.vehicles?.length" class="small muted">No documents uploaded yet.</p>
    <ul v-if="props.documents.length" class="docs">
      <li v-for="d in props.documents" :key="d.id">
        <span class="grow"><strong>{{ KIND[d.kind] ?? d.kind }}</strong> <span class="status" :class="d.status === 'APPROVED' ? 'good' : d.status === 'REJECTED' ? 'bad' : 'warn'">{{ d.status.toLowerCase() }}</span><span v-if="d.note" class="xsmall muted block">{{ d.note }}</span></span>
        <button class="btn btn-quiet small-btn" type="button" :disabled="busy === d.id" @click="view(d.id)">View</button>
        <button v-if="d.status !== 'APPROVED'" class="btn btn-primary small-btn" type="button" :disabled="busy === d.id" @click="review(d, 'APPROVED')">Approve</button>
        <button v-if="d.status !== 'REJECTED'" class="btn btn-quiet small-btn" type="button" :disabled="busy === d.id" @click="review(d, 'REJECTED')">Reject</button>
      </li>
    </ul>
    <ul v-if="props.vehicles?.length" class="docs">
      <li v-for="v in props.vehicles" :key="v.id">
        <span class="grow"><strong>{{ VEHICLE_LABEL[v.type] ?? v.type }}</strong> {{ [v.make, v.model, v.color].filter(Boolean).join(' ') }} <span class="status" :class="v.status === 'APPROVED' ? 'good' : v.status === 'REJECTED' ? 'bad' : 'warn'">{{ v.status.toLowerCase() }}</span>
          <span class="xsmall muted block">Plate {{ v.plate || '—' }} · {{ v.capacityKg }} kg</span></span>
        <button v-if="v.status !== 'APPROVED'" class="btn btn-primary small-btn" type="button" :disabled="busy === v.id" @click="vehicle(v, true)">Approve</button>
        <button v-if="v.status !== 'REJECTED'" class="btn btn-quiet small-btn" type="button" :disabled="busy === v.id" @click="vehicle(v, false)">Reject</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rd {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
  background: var(--ink-wash);
}
.docs {
  list-style: none;
  margin: 0;
  padding: 0;
}
.docs li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
}
.block {
  display: block;
}
</style>
