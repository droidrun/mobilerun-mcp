// Profiles port — see devices.ts's file header for the DTO philosophy.
// Backs the `profiles` bundle tool: /profiles CRUD (list,
// get, create, update, delete) + `apply`, which PUTs a profile onto a
// device (`client.devices.profile.update`, not a /profiles route — the
// tool layer dispatches it to this same port for a single `profiles`
// bundle surface).
import type { PageMeta } from './devices.js';

// Mirrors @mobilerun/sdk's Shared.DeviceSpec — loosely typed (passthrough
// records for carrier/identifiers) since this port surfaces the shape a
// caller sends/receives, not a full field-by-field mirror of every nested
// device-spec property.
export interface DeviceSpecInput {
    androidVersion?: number;
    apps?: string[] | null;
    country?: string;
    files?: string[] | null;
    locale?: string;
    location?: { latitude: number; longitude: number };
    name?: string;
    timezone?: string;
    carrier?: Record<string, unknown>;
    identifiers?: Record<string, unknown>;
    proxy?: { name?: string; smartIp?: boolean; socks5?: { host: string; port: number; user?: string; password?: string } };
}

export interface ProfileDto {
    id: string;
    name: string;
    spec: DeviceSpecInput;
    createdAt: string;
    updatedAt: string;
    userId: string;
}
export interface ProfileListDto {
    items: ProfileDto[] | null;
    pagination: PageMeta;
}
export interface ProfileDeleteResultDto {
    message: string;
}
export interface ProfileApplyResultDto {
    status: 'profile_applied';
    deviceId: string;
    profileId: string;
}

export interface ListProfilesOpts {
    name?: string;
    orderBy?: 'name' | 'created_at' | 'updated_at';
    orderByDirection?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
}

export interface ProfilesBackend {
    listProfiles(opts: ListProfilesOpts): Promise<ProfileListDto>;
    getProfile(profileId: string): Promise<ProfileDto>;
    createProfile(name: string, spec: DeviceSpecInput): Promise<ProfileDto>;
    updateProfile(profileId: string, name: string, spec: DeviceSpecInput): Promise<ProfileDto>;
    deleteProfile(profileId: string): Promise<ProfileDeleteResultDto>;
    applyProfile(deviceId: string, profileId: string): Promise<ProfileApplyResultDto>;
}
