<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { ClinicDetail } from '@abapro/shared';
import { apiRequest } from '@/api/client';
import { displayStoredAddress } from '@/components/address/postal-address';
import ClinicFormFields from '@/components/organization/ClinicFormFields.vue';
import { clinicDraftFrom, clinicFormFrom, emptyClinicForm, type ClinicFormValue } from '@/components/organization/form-values';
import AppButton from '@/components/ui/AppButton.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useToastStore } from '@/stores/toast';

const route = useRoute();
const toast = useToastStore();
const loading = ref(true);
const saving = ref(false);
const editing = ref(false);
const error = ref('');
const editError = ref('');
const clinic = ref<ClinicDetail | null>(null);
const draft = ref<ClinicFormValue>(emptyClinicForm());

const childSentence = computed(() => {
  const count = clinic.value?.childCount ?? 0;
  if (count === 0) return 'No clients are enrolled at this clinic yet.';
  if (count === 1) return '1 client is enrolled at this clinic.';
  return `${count} clients are enrolled at this clinic.`;
});

function recorded(value: string | null | undefined): string {
  return value?.trim() ? value : 'Not recorded';
}

function startEdit(): void {
  if (!clinic.value) return;
  editError.value = '';
  draft.value = clinicFormFrom(clinic.value);
  editing.value = true;
}

async function saveClinic(): Promise<void> {
  if (!clinic.value) return;
  editError.value = '';
  if (draft.value.name.trim().length < 2) {
    editError.value = 'Each clinic needs a name.';
    return;
  }
  saving.value = true;
  try {
    clinic.value = await apiRequest<ClinicDetail>(`/clinics/${clinic.value.id}`, {
      method: 'PATCH',
      body: clinicDraftFrom(draft.value, clinic.value),
    });
    editing.value = false;
    toast.push({ tone: 'success', title: 'Clinic updated' });
  } catch (saveError) {
    editError.value = saveError instanceof Error ? saveError.message : 'The clinic could not be updated.';
  } finally {
    saving.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  editing.value = false;
  clinic.value = null;
  try {
    clinic.value = await apiRequest<ClinicDetail>(`/clinics/${route.params.clinicId}`);
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'This clinic could not be loaded.';
  } finally {
    loading.value = false;
  }
}

watch(() => route.params.clinicId, () => {
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error || !clinic" title="Clinic unavailable" :description="error || 'This clinic could not be loaded.'" @retry="load" />
    <template v-else>
      <PageHeader :title="clinic.name">
        <template v-if="!editing" #actions>
          <AppButton type="button" variant="secondary" @click="startEdit">Edit clinic</AppButton>
        </template>
      </PageHeader>

      <section class="panel" aria-labelledby="clinic-details-heading">
        <h2 id="clinic-details-heading">Clinic details</h2>
        <p v-if="editError" class="form-error" role="alert">{{ editError }}</p>
        <form v-if="editing" class="edit-form" @submit.prevent="saveClinic">
          <ClinicFormFields v-model="draft" />
          <div class="edit-actions">
            <AppButton type="button" variant="secondary" @click="editing = false">Cancel</AppButton>
            <AppButton type="submit" :loading="saving">Save clinic</AppButton>
          </div>
        </form>
        <dl v-else class="details">
          <div>
            <dt>Organisation</dt>
            <dd><RouterLink :to="`/organizations/${clinic.organizationId}`">{{ clinic.organizationName }}</RouterLink></dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{{ recorded(displayStoredAddress(clinic.address, clinic.country) || clinic.location) }}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{{ recorded(clinic.contactEmail) }}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{{ recorded(clinic.contactPhone) }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel" aria-labelledby="clinic-children-heading">
        <h2 id="clinic-children-heading">Clients</h2>
        <p class="child-count">{{ childSentence }}</p>
        <div v-if="clinic.children.length > 0" class="table-scroll">
          <table class="data-table">
            <caption class="visually-hidden">Clients enrolled at {{ clinic.name }}</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Client ID</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="child in clinic.children" :key="child.id">
                <th scope="row">{{ child.displayName }}</th>
                <td>{{ child.clientCode }}</td>
                <td>
                  <StatusBadge :tone="child.status === 'active' ? 'success' : 'neutral'" :label="child.status === 'active' ? 'Active' : 'Inactive'" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </PageContainer>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 14px;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

h2 {
  margin: 0;
}

.section-heading,
.edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.edit-form {
  display: grid;
  gap: 12px;
}

.edit-actions {
  justify-content: flex-end;
}

.details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px 20px;
  margin: 0;
}

dt {
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

dd {
  margin: 4px 0 0;
}

dd a {
  font-weight: 700;
  text-decoration: none;
}

dd a:hover {
  text-decoration: underline;
}

.child-count {
  margin: 0;
  color: var(--color-text-muted);
}

.form-error {
  margin: 0;
  color: var(--color-danger);
}
</style>
