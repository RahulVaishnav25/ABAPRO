<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ContactChannel, GuardianRelationship, StaffOption } from '@abapro/shared';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useClientOptions } from './options';

export interface GuardianFieldValues {
  name: string;
  relationship: GuardianRelationship;
  email: string;
  phone: string;
  channels: ContactChannel[];
  emergencyContact: boolean;
  portalAccess: boolean;
  linkedUserId: string;
}

defineProps<{ parents: StaffOption[]; required?: boolean }>();
/** The draft is edited in place. */
const guardian = defineModel<GuardianFieldValues>({ required: true });

const { t } = useI18n();
const { relationshipOptions, parentOptions } = useClientOptions();
const channelLabels: Record<ContactChannel, string> = { email: 'emailUpdates', phone: 'phoneUpdates', portal: 'portalMessages' };

function toggleChannel(channel: ContactChannel, checked: boolean): void {
  const channels = guardian.value.channels;
  guardian.value.channels = checked ? [...channels, channel] : channels.filter((item) => item !== channel);
}
</script>

<template>
  <div class="form-stack">
    <div class="form-grid">
      <AppInput v-model="guardian.name" :label="t('clients.fields.name')" :required="required" />
      <AppSelect v-model="guardian.relationship" :label="t('clients.fields.relationship')" :options="relationshipOptions" />
      <AppInput v-model="guardian.email" :label="t('clients.fields.email')" type="email" />
      <AppInput v-model="guardian.phone" :label="t('clients.fields.phone')" type="tel" />
      <AppSelect v-model="guardian.linkedUserId" :label="t('clients.fields.linkedAccount')" :options="parentOptions(parents)" />
    </div>
    <div class="form-choices">
      <AppCheckbox
        v-for="channel in (['email', 'phone', 'portal'] as const)"
        :key="channel"
        :model-value="guardian.channels.includes(channel)"
        :label="t(`clients.fields.${channelLabels[channel]}`)"
        @update:model-value="toggleChannel(channel, Boolean($event))"
      />
      <AppCheckbox v-model="guardian.emergencyContact" :label="t('clients.fields.emergencyContact')" />
      <AppCheckbox v-model="guardian.portalAccess" :label="t('clients.fields.portalAccess')" />
    </div>
  </div>
</template>
