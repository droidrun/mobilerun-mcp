import type { DeviceType } from '@mobilerun/mcp-tools';

const API_IOS_PHONE = 'ios_stealth_phone';

/** Translate the public device type only at the API boundary. */
export function toApiDeviceType(type: DeviceType | undefined) {
    return type === 'ios_phone' ? API_IOS_PHONE : type;
}

/** Normalize JSON results, including nested type fields and counts keyed by type. */
export function fromApiDeviceTypes(value: unknown): unknown {
    if (value === API_IOS_PHONE) return 'ios_phone';
    if (Array.isArray(value)) return value.map(fromApiDeviceTypes);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
            key === API_IOS_PHONE ? 'ios_phone' : key,
            fromApiDeviceTypes(nested),
        ]));
    }
    return value;
}
