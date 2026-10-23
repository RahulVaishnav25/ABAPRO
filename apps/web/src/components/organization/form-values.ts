import type { ClinicDraft, UpdateOrganizationRequest } from '@abapro/shared';
import {
  emptyPostalAddress,
  placeFromAddress,
  postalAddressFromStored,
  samePostalAddress,
  storedPostalAddress,
  type PostalAddress,
} from '@/components/address/postal-address';

export interface ClinicFormValue {
  name: string;
  contactEmail: string;
  contactPhone: string;
  address: PostalAddress;
}

export interface OrganizationFormValue {
  name: string;
  contactEmail: string;
  contactPhone: string;
  companyIdentificationNumber: string;
  taxNumber: string;
  address: PostalAddress;
}

export function emptyClinicForm(country = ''): ClinicFormValue {
  return {
    name: '',
    contactEmail: '',
    contactPhone: '',
    address: emptyPostalAddress(country),
  };
}

export function emptyOrganizationForm(country = 'US', contactEmail = ''): OrganizationFormValue {
  return {
    name: '',
    contactEmail,
    contactPhone: '',
    companyIdentificationNumber: '',
    taxNumber: '',
    address: emptyPostalAddress(country),
  };
}

export function clinicFormFrom(clinic: {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
}): ClinicFormValue {
  return {
    name: clinic.name,
    contactEmail: clinic.contactEmail ?? '',
    contactPhone: clinic.contactPhone ?? '',
    address: postalAddressFromStored(clinic.address),
  };
}

export function organizationFormFrom(organization: {
  name: string;
  contactEmail: string;
  contactPhone: string | null;
  country: string;
  address: string | null;
  companyIdentificationNumber: string | null;
  taxNumber: string | null;
}): OrganizationFormValue {
  return {
    name: organization.name,
    contactEmail: organization.contactEmail,
    contactPhone: organization.contactPhone ?? '',
    companyIdentificationNumber: organization.companyIdentificationNumber ?? '',
    taxNumber: organization.taxNumber ?? '',
    address: postalAddressFromStored(organization.address, organization.country),
  };
}

export function clinicDraftFrom(form: ClinicFormValue, original?: { location: string; address: string | null }): ClinicDraft {
  const loaded = original ? postalAddressFromStored(original.address) : null;
  const unchanged = Boolean(loaded && samePostalAddress(form.address, loaded));
  return {
    name: form.name.trim(),
    location: unchanged && original ? original.location : placeFromAddress(form.address),
    address: unchanged && original ? original.address ?? undefined : storedPostalAddress(form.address) || undefined,
    contactEmail: form.contactEmail.trim() || undefined,
    contactPhone: form.contactPhone.trim() || undefined,
  };
}

export function organizationUpdateFrom(form: OrganizationFormValue, originalAddress: string | null): UpdateOrganizationRequest {
  const loaded = postalAddressFromStored(originalAddress, form.address.country);
  const unchanged = samePostalAddress(form.address, loaded);
  return {
    name: form.name.trim(),
    contactEmail: form.contactEmail.trim(),
    contactPhone: form.contactPhone.trim(),
    country: form.address.country,
    address: unchanged ? originalAddress?.trim() || undefined : storedPostalAddress(form.address) || undefined,
    companyIdentificationNumber: form.companyIdentificationNumber.trim() || undefined,
    taxNumber: form.taxNumber.trim() || undefined,
  };
}
