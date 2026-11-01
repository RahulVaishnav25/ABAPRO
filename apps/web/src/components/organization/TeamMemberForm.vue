<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { INVITABLE_ROLES, type InvitableRole, type OrganizationDirectoryItem } from '@abapro/shared';
import { createOrganizationMemberRequest } from '@/api/resources';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppIcon from '@/components/navigation/AppIcon.vue';
import { roleName } from '@/i18n';
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
  { excludeRoles: () => [], heading: undefined },
);
const emit = defineEmits<{ created: [directory: OrganizationDirectoryItem] }>();
const toast = useToastStore();
const { t } = useI18n();
const title = computed(() => (props.heading === undefined ? t('onboarding.member.heading') : props.heading));

const roleOptions = computed(() =>
  INVITABLE_ROLES.filter((role) => !props.excludeRoles.includes(role)).map((role) => ({ value: role, label: roleName(role) })),
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
    error.value = t('onboarding.member.invalid');
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
    toast.push({ tone: 'success', title: t('onboarding.member.created'), message: t('onboarding.member.createdMessage', { name: trimmedName }) });
    emit('created', directory);
  } catch (createError) {
    error.value = errorMessage(createError, t('onboarding.member.error'));
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <form class="member-form" novalidate @submit.prevent="create">
    <h3 v-if="title">{{ title }}</h3>
    <p class="section-desc">{{ t('onboarding.member.intro') }}</p>
    <p v-if="error" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ error }}</p>
    <div class="form-grid">
      <AppInput v-model="name" :label="t('onboarding.member.name')" required />
      <AppInput v-model="email" :label="t('onboarding.member.email')" type="email" required autocomplete="off" />
      <AppInput v-model="password" :label="t('onboarding.member.password')" type="password" required autocomplete="new-password" :hint="t('onboarding.member.passwordHint')" />
      <AppSelect v-model="role" :label="t('onboarding.member.role')" :options="roleOptions" />
    </div>
    <div class="form-actions">
      <slot name="actions" />
      <AppButton type="submit" :loading="creating">{{ t('onboarding.member.submit') }}</AppButton>
    </div>
  </form>
</template>

<style scoped>
.member-form {
  display: grid;
  gap: var(--space-4);
}

h3 {
  font-size: var(--text-md);
}
</style>
