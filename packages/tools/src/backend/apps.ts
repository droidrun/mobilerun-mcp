// Apps port — see devices.ts's file header for the DTO philosophy.
// Mirrors @mobilerun/sdk's apps.* response shapes (verified against the
// SDK's shipped apps.d.ts).
//

import { z } from 'zod';
import { type PageMeta } from './devices.js';

export interface ListAppsOpts {
    query?: string;
    platform?: 'all' | 'android' | 'ios';
    status?: 'all' | 'queued' | 'available' | 'failed' | 'pruned';
    sortBy?: 'createdAt' | 'name';
    order?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
}

interface AppVersionDto {
    id: string;
    appId: string;
    country: string;
    versionCode: number;
    versionName: string;
    sizeBytes: number | null;
    targetSdk: number | null;
    source: 'user' | 'system' | 'portal' | 'catalog' | 'store';
    status: 'queued' | 'available' | 'failed' | 'pruned';
    userId: string | null;
    createdAt: string | null;
    queuedAt: string | null;
    updatedAt: string | null;
}

interface AppListItemDto {
    id: string;
    bundleId: string;
    displayName: string;
    description: string | null;
    developerName: string | null;
    iconURL: string;
    platform: 'android' | 'ios';
    createdAt: string | null;
    updatedAt: string | null;
    version: AppVersionDto;
}
interface AppListDto {
    items: AppListItemDto[];
    pagination: PageMeta;
    count: { totalCount: number; availableCount: number; queuedCount: number; failedCount: number };
}

interface AppDto {
    id: string;
    bundleId: string;
    displayName: string;
    description: string | null;
    developerName: string | null;
    iconURL: string;
    platform: 'android' | 'ios';
    createdAt: string | null;
    updatedAt: string | null;
}
interface AppEnvelopeDto {
    data: AppDto;
}

interface AppVersionListDto {
    data: AppVersionDto[];
}

interface AppFileParams {
    fileName: string;
    contentType: 'application/vnd.android.package-archive' | 'application/octet-stream' | 'application/zip';
    sha256?: string;
}

export interface CreateUploadUrlParams {
    bundleId: string;
    displayName: string;
    versionCode: number;
    versionName: string;
    sizeBytes: number;
    files: AppFileParams[];
    platform?: 'android' | 'ios';
    country?: string;
    description?: string;
    developerName?: string;
    iconURL?: string;
    targetSdk?: number;
}
interface CreateUploadUrlDto {
    appId: string;
    versionId: string;
    r2UploadUrls: Array<{ fileName: string; r2UploadUrl: string }>;
}

interface AppSimpleResultDto {
    success: true;
    message: string;
}

export interface AppsBackend {
    appsStorageUsage(): Promise<unknown>;
    listApps(opts: ListAppsOpts): Promise<AppListDto>;
    getApp(id: string): Promise<AppEnvelopeDto>;
    listAppVersions(id: string): Promise<AppVersionListDto>;
    /** Step 1 of 3: returns pre-signed object-storage PUT URLs. The caller PUTs file bytes to
     * those URLs directly (outside this port/tool — binary never travels through
     * MCP JSON), then calls confirmAppUpload
     * (or markAppUploadFailed if the PUT failed). */
    createAppUploadUrl(params: CreateUploadUrlParams): Promise<CreateUploadUrlDto>;
    /** Step 3 of 3: verifies the file landed in storage and flips the app to `available`. */
    confirmAppUpload(id: string): Promise<AppSimpleResultDto>;
    markAppUploadFailed(id: string): Promise<AppSimpleResultDto>;
    deleteApp(id: string): Promise<AppSimpleResultDto>;
}

export const appsStorageUsageSchema = z.object({}).strict();
