import type Mobilerun from '@mobilerun/sdk';
import type { DeviceSpecInput, ListProfilesOpts, ProfileDto, ProfileListDto, ProfilesBackend } from '@mobilerun/mcp-tools';

/**
 * ProfilesBackend over @mobilerun/sdk's `client.profiles.*` (list/get/
 * create/update/delete) + `client.devices.profile.update` (apply) — every
 * mapping verified against the SDK's shipped .d.ts. No dropped operations.
 *
 * Casts below: the SDK's `Shared.DeviceSpec.carrier`/`.identifiers` are
 * exhaustive fixed-shape interfaces; this port's `DeviceSpecInput` widens
 * them to `Record<string, unknown>` (surfaced, not exhaustively mirrored —
 * see ../../tools/src/backend/profiles.ts).
 */
export function createProfilesBackend(client: Mobilerun): ProfilesBackend {
    return {
        async listProfiles(opts: ListProfilesOpts) {
            const result = await client.profiles.list({
                name: opts.name,
                orderBy: opts.orderBy,
                orderByDirection: opts.orderByDirection,
                page: opts.page,
                pageSize: opts.pageSize,
            });
            return result as unknown as ProfileListDto;
        },
        async getProfile(profileId: string) {
            return (await client.profiles.retrieve(profileId)) as unknown as ProfileDto;
        },
        async createProfile(name: string, spec: DeviceSpecInput) {
            return (await client.profiles.create({ name, spec: spec as never })) as unknown as ProfileDto;
        },
        async updateProfile(profileId: string, name: string, spec: DeviceSpecInput) {
            return (await client.profiles.update(profileId, { name, spec: spec as never })) as unknown as ProfileDto;
        },
        async deleteProfile(profileId: string) {
            return client.profiles.delete(profileId);
        },
        async applyProfile(deviceId: string, profileId: string) {
            await client.devices.profile.update(deviceId, { profileId });
            return { status: 'profile_applied' as const, deviceId, profileId };
        },
    };
}
