import { z } from 'zod';
export const filesListSchema = z
    .object({
        zone: z.union([z.literal('user'), z.literal('agent'), z.literal('workflow'), z.literal('skills')]).optional(),
    })
    .strict();

export const filesUpdateSchema = z
    .object({
        fileId: z.string(),
        displayName: z.union([z.string(), z.null()]).optional(),
        enabled: z.boolean().optional(),
    })
    .strict();

export const filesDeleteSchema = z
    .object({
        fileId: z.string(),
    })
    .strict();

export const filesCancelPendingSchema = z
    .object({
        fileId: z.string(),
    })
    .strict();

export const filesConfirmSchema = z
    .object({
        fileId: z.string(),
    })
    .strict();

export const filesUploadUrlSchema = z
    .object({
        filename: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
        zone: z.union([z.literal('user'), z.literal('skills')]).optional(),
    })
    .strict();

export interface FilesBackend {
    filesDownload(params: z.infer<typeof filesDownloadSchema>): Promise<unknown>;
    filesList(params: z.infer<typeof filesListSchema>): Promise<unknown>;
    filesUpdate(params: z.infer<typeof filesUpdateSchema>): Promise<unknown>;
    filesDelete(params: z.infer<typeof filesDeleteSchema>): Promise<unknown>;
    filesCancelPending(params: z.infer<typeof filesCancelPendingSchema>): Promise<unknown>;
    filesConfirm(params: z.infer<typeof filesConfirmSchema>): Promise<unknown>;
    filesUploadUrl(params: z.infer<typeof filesUploadUrlSchema>): Promise<unknown>;
}

export const filesDownloadSchema = z.object({ fileId: z.string() }).strict();
