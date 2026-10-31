<script setup lang="ts">
import { computed, ref } from 'vue';
import { INVITABLE_ROLES, ROLE_LABELS, type InvitableRole, type OrganizationDirectoryItem } from '@abapro/shared';
import { createOrganizationMemberRequest } from '@/api/resources';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { errorMessage } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';

/** Creates an organisation member who signs in with this email and password. */
const props = withDefaults(
  defineProps<{
    organizationId: string;
    /** Roles not offered here, such as parents, who are onboarded with their children. */
    excludeRoles?: InvitableRole[];
    heading?: string;
  }>(),
  { excludeRoles: () => [], heading: 'Add a team member' },
);
const emit = defineEmits<{ created: [directory: OrganizationDirectoryItem] }>();
const toast = useToastStore();

const roleOptions = computed(() =>
  INVITABLE_ROLES.filter((role) => !props.excludeRoles.includes(role)).map((role) => ({ value: role, label: ROLE_LABELS[role] })),
);
const name = ref('');
const email = ref('');
const password = ref('');
const role = ref<InvitableRole>('organization_admin');
const error = ref('');
const creating = ref(false);

async function create(): Promise<void> {
  error.value = '';
  const trimmedName = name.value.trim();
  const trimmedEmail = email.value.trim();
  if (trimmedName.length < 2 || !trimmedEmail.includes('@') || password.value.length < 10) {
    error.value = 'Enter a name, an email address, and a password of at least 10 characters.';
    return;
  }
  creating.value = true;
  try {
    const directory = await createOrganizationMemberRequest(props.organizationId, {
      name: trimmedName,
      email: trimmedEmail,
      password: password.value,
      role: role.value,
    });
    name.value = '';
    email.value = '';
    password.value = '';
    role.value = 'organization_admin';
    toast.push({ tone: 'success', title: 'Team member created', message: `${trimmedName} can sign in with this email and password.` });
    emit('created', directory);
  } catch (createError) {
    error.value = errorMessage(createError, 'The team member could not be created.');
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <form class="member-form" @submit.prevent="create">
    <h3 v-if="heading">{{ heading }}</h3>
    <p class="quiet">They sign in with this email and password, and can open this organisation, its clinics, and its clients only.</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div class="member-grid">
      <AppInput v-model="name" label="Name" required />
      <AppInput v-model="email" label="Email" type="email" required autocomplete="off" />
      <AppInput v-model="password" label="Password" type="password" required autocomplete="new-password" hint="At least 10 characters." />
      <AppSelect v-model="role" label="Role" :options="roleOptions" />
    </div>
    <div class="member-actions">
      <slot name="actions" />
      <AppButton type="submit" :loading="creating">Create team member</AppButton>
    </div>
  </form>
</template>

<style scoped>
.member-form { display: grid; gap: 12px; }
.member-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.member-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
h3 { margin: 0; font-size: 0.95rem; }
.quiet { margin: 0; color: var(--color-text-muted); }
.form-error { color: var(--color-danger); }
</style>
