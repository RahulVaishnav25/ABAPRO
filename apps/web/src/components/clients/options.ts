import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ContactChannel, StaffOption } from '@abapro/shared';

const RELATIONSHIPS = ['parent', 'guardian', 'grandparent', 'caregiver', 'other'] as const;
const MEASUREMENTS = ['frequency', 'duration', 'interval', 'latency', 'rate'] as const;
export const CHANNELS: ContactChannel[] = ['email', 'phone', 'portal'];

/** Translated choices shared by the client form and profile. */
export function useClientOptions() {
  const { t } = useI18n();
  const list = (prefix: string, values: readonly string[]) => values.map((value) => ({ value, label: t(`${prefix}.${value}`) }));
  return {
    relationshipOptions: computed(() => list('clients.relationships', RELATIONSHIPS)),
    measurementOptions: computed(() => list('clients.measurements', MEASUREMENTS)),
    goalStatusOptions: computed(() => list('clients.goalStatus', ['active', 'met', 'discontinued'])),
    behaviorStatusOptions: computed(() => list('clients.behaviorStatus', ['active', 'discontinued'])),
    clientStatusOptions: computed(() => [
      { value: 'active', label: t('clients.active') },
      { value: 'inactive', label: t('clients.inactive') },
    ]),
    /** Parent accounts that a guardian record can be linked to. */
    parentOptions: (parents: StaffOption[]) => [
      { value: '', label: t('clients.fields.notLinked') },
      ...parents.map((person) => ({ value: person.id, label: person.email ? `${person.name} (${person.email})` : person.name })),
    ],
  };
}
